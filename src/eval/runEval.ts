import fs from "node:fs";
import path from "node:path";

import type { Db } from "../db/db.js";
import type { EmbeddingRecord } from "../providers/dbBacked.js";
import type { ChatClient } from "../providers/types.js";
import { ensureDir } from "../util/fs.js";
import { appendJsonl, readJsonl } from "../util/jsonl.js";
import { stableJsonHash } from "../util/hash.js";
import { buildRagIr } from "../rag/ir.js";
import { runRagTurn } from "../rag/pipeline.js";
import type { RagPipelineConfig } from "../rag/types.js";
import { loadCostModel, saveCostModel, updateCostModel } from "../rag/costModel.js";
import { judgeAnswer, weightedScore } from "./judge.js";
import type { EvalQuestion, EvalResult } from "./types.js";
import { estimateDollars, loadPricingTable } from "../cost/pricing.js";

export type RunEvalOptions = {
  questionsPath: string;
  outDir: string;
  limit?: number;
  enableMemoryWrites?: boolean;
  costModelPath?: string;
  pricingPath?: string;
};

export async function runEval(input: {
  db: Db;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]>; model: string };
  answerChat: ChatClient;
  supportChat?: ChatClient;
  judgeChat: ChatClient;
  config: RagPipelineConfig;
  sessionId: string;
  opts: RunEvalOptions;
}): Promise<{ resultsPath: string; count: number }> {
  ensureDir(input.opts.outDir);
  const configHash = stableJsonHash(input.config);

  let costModel = input.opts.costModelPath ? loadCostModel(input.opts.costModelPath) : null;
  const pricing = input.opts.pricingPath ? loadPricingTable(input.opts.pricingPath) : {};

  fs.writeFileSync(path.join(input.opts.outDir, "config.json"), JSON.stringify(input.config, null, 2));
  fs.writeFileSync(path.join(input.opts.outDir, "rag_ir.json"), JSON.stringify(buildRagIr(input.config), null, 2));

  const resultsPath = path.join(input.opts.outDir, "results.jsonl");
  if (fs.existsSync(resultsPath)) fs.unlinkSync(resultsPath);

  let count = 0;
  for await (const q of readJsonl<EvalQuestion>(input.opts.questionsPath)) {
    if (input.opts.limit && count >= input.opts.limit) break;

    const rag = await runRagTurn({
      db: input.db,
      embedder: input.embedder,
      answerChat: input.answerChat,
      supportChat: input.supportChat,
      config: input.config,
      sessionId: input.sessionId,
      question: q.question,
      enableMemoryWrites: input.opts.enableMemoryWrites ?? false
    });

    if (costModel && input.opts.costModelPath) {
      costModel = updateCostModel(costModel, rag.timings);
    }

    const judgeRes = await judgeAnswer({
      chat: input.judgeChat,
      question: q.question,
      answer: rag.answer,
      sources: rag.sources.map((s) => ({ citation: s.citation, text: s.text }))
    });

    const recallAtK = computeRecallAtK(q.expected_sources ?? [], rag.sources.map((s) => s.documentPath));
    const dollars = rag.llmCalls.reduce((acc, c) => {
      const d = estimateDollars({
        pricing,
        provider: c.provider,
        model: c.model,
        usage: c.usage
      });
      return acc + (d ?? 0);
    }, 0);
    const judgeDollars = estimateDollars({
      pricing,
      provider: input.judgeChat.provider,
      model: input.judgeChat.model,
      usage: judgeRes?.usage
    });

    const result: EvalResult = {
      id: q.id,
      question: q.question,
      answer: rag.answer,
      configHash,
      timingsMs: Object.fromEntries(rag.timings.map((t) => [t.label, t.ms])),
      usage: rag.usageTotal,
      dollars,
      judgeUsage: judgeRes?.usage,
      judgeDollars,
      judge: judgeRes?.scores ?? undefined,
      weightedScore: judgeRes?.scores ? weightedScore(judgeRes.scores) : undefined,
      recallAtK,
      retrievedSources: rag.sources.map((s) => ({
        citation: s.citation,
        documentPath: s.documentPath,
        chunkId: s.chunkId
      })),
      rewrittenQuery: rag.rewrittenQuery,
      memoryWrite: rag.memoryWrite
    };

    appendJsonl(resultsPath, result);
    count += 1;
  }

  if (costModel && input.opts.costModelPath) {
    saveCostModel(input.opts.costModelPath, costModel);
    fs.writeFileSync(path.join(input.opts.outDir, "cost_model.json"), JSON.stringify(costModel, null, 2));
  }

  return { resultsPath, count };
}

function computeRecallAtK(expected: string[], retrievedPaths: string[]): number | undefined {
  if (!expected || expected.length === 0) return undefined;
  const hit = expected.some((e) => retrievedPaths.some((p) => p.includes(e)));
  return hit ? 1 : 0;
}
