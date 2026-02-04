import fs from "node:fs";
import path from "node:path";

import type { Db } from "../db/db.js";
import type { EmbeddingRecord } from "../providers/dbBacked.js";
import type { ChatClient } from "../providers/types.js";
import { createSession } from "../memory/memoryStore.js";
import { ensureDir } from "../util/fs.js";
import { appendJsonl, readJsonl } from "../util/jsonl.js";
import { stableJsonHash } from "../util/hash.js";
import type { RagPipelineConfig } from "../rag/types.js";
import { runRagTurn } from "../rag/pipeline.js";
import { judgeAnswer, weightedScore } from "../eval/judge.js";
import type { EvalQuestion } from "../eval/types.js";
import { enumerateConfigSpace, sampleConfigs } from "../rag/explorer.js";
import { paretoFront } from "../rag/pareto.js";
import { loadCostModel, saveCostModel, updateCostModel } from "../rag/costModel.js";
import { estimateDollars, loadPricingTable } from "../cost/pricing.js";
import { buildRagIr } from "../rag/ir.js";

export type OptimizeOptions = {
  questionsPath: string;
  outDir: string;
  seed: number;
  warmup: number;
  minConfigs: number;
  stageAQuestions: number;
  stageBQuestions: number;
  topN: number;
  costModelPath?: string;
  pricingPath?: string;
};

export async function runOptimize(input: {
  db: Db;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]>; model: string };
  answerChat: ChatClient;
  supportChat?: ChatClient;
  judgeChat: ChatClient;
  opts: OptimizeOptions;
  configs?: RagPipelineConfig[];
}): Promise<{ paretoPath: string; resultsPath: string; configsPath: string }> {
  ensureDir(input.opts.outDir);
  const configsPath = path.join(input.opts.outDir, "configs.jsonl");
  const resultsPath = path.join(input.opts.outDir, "results.jsonl");
  const paretoPath = path.join(input.opts.outDir, "pareto.json");
  const ragIrPath = path.join(input.opts.outDir, "rag_ir.jsonl");
  for (const p of [configsPath, resultsPath, paretoPath]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  if (fs.existsSync(ragIrPath)) fs.unlinkSync(ragIrPath);

  let costModel = input.opts.costModelPath ? loadCostModel(input.opts.costModelPath) : null;
  const pricing = input.opts.pricingPath ? loadPricingTable(input.opts.pricingPath) : {};

  const allQuestions: EvalQuestion[] = [];
  for await (const q of readJsonl<EvalQuestion>(input.opts.questionsPath)) {
    allQuestions.push(q);
    if (allQuestions.length >= Math.max(input.opts.stageBQuestions, input.opts.stageAQuestions)) break;
  }
  if (allQuestions.length === 0) throw new Error("No questions loaded.");

  const configs =
    input.configs ??
    sampleConfigs(enumerateConfigSpace(), {
      seed: input.opts.seed,
      warmup: input.opts.warmup,
      minConfigs: input.opts.minConfigs
    });

  for (const c of configs) {
    const configHash = stableJsonHash(c);
    appendJsonl(configsPath, { configHash, config: c });
    appendJsonl(ragIrPath, { configHash, ragIr: buildRagIr(c) });
  }

  const stageA: Summary[] = [];
  for (const c of configs) {
    const configHash = stableJsonHash(c);
    const session = createSession(input.db);
    const perQuestion = await evalConfig({
      db: input.db,
      embedder: input.embedder,
      answerChat: input.answerChat,
      supportChat: input.supportChat,
      judgeChat: input.judgeChat,
      config: c,
      questions: allQuestions.slice(0, input.opts.stageAQuestions),
      sessionId: session.id,
      pricing,
      onTurn: (timings) => {
        if (costModel) costModel = updateCostModel(costModel, timings);
      }
    });
    const summary = summarize(configHash, "A", perQuestion);
    stageA.push(summary);
    appendJsonl(resultsPath, summary);
  }

  stageA.sort((a, b) => b.avgScore - a.avgScore);
  const top = stageA.slice(0, Math.max(1, input.opts.topN));

  const stageB: Summary[] = [];
  for (const s of top) {
    const config = configs.find((c) => stableJsonHash(c) === s.configHash);
    if (!config) continue;
    const session = createSession(input.db);
    const perQuestion = await evalConfig({
      db: input.db,
      embedder: input.embedder,
      answerChat: input.answerChat,
      supportChat: input.supportChat,
      judgeChat: input.judgeChat,
      config,
      questions: allQuestions.slice(0, Math.min(allQuestions.length, input.opts.stageBQuestions)),
      sessionId: session.id,
      pricing,
      onTurn: (timings) => {
        if (costModel) costModel = updateCostModel(costModel, timings);
      }
    });
    const summary = summarize(s.configHash, "B", perQuestion);
    stageB.push(summary);
    appendJsonl(resultsPath, summary);
  }

  const points = [...stageA, ...stageB].map((s) => ({
    configHash: s.configHash,
    stage: s.stage,
    avgScore: s.avgScore,
    p95LatencyMs: s.p95LatencyMs,
    totalTokens: s.totalTokens,
    dollars: s.dollars
  }));
  fs.writeFileSync(paretoPath, JSON.stringify(paretoFront(points), null, 2));

  if (costModel && input.opts.costModelPath) {
    saveCostModel(input.opts.costModelPath, costModel);
    fs.writeFileSync(path.join(input.opts.outDir, "cost_model.json"), JSON.stringify(costModel, null, 2));
  }

  return { paretoPath, resultsPath, configsPath };
}

type PerQuestion = {
  latencyMs: number;
  totalTokens: number;
  dollars: number;
  weightedScore: number | null;
};

type Summary = {
  configHash: string;
  stage: "A" | "B";
  n: number;
  avgScore: number;
  p95LatencyMs: number;
  totalTokens: number;
  dollars: number;
};

async function evalConfig(input: {
  db: Db;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]>; model: string };
  answerChat: ChatClient;
  supportChat?: ChatClient;
  judgeChat: ChatClient;
  config: RagPipelineConfig;
  questions: EvalQuestion[];
  sessionId: string;
  pricing: Record<string, { promptPer1M: number; completionPer1M: number }>;
  onTurn?: (timings: { label: string; ms: number }[]) => void;
}): Promise<PerQuestion[]> {
  const out: PerQuestion[] = [];
  for (const q of input.questions) {
    const rag = await runRagTurn({
      db: input.db,
      embedder: input.embedder,
      answerChat: input.answerChat,
      supportChat: input.supportChat,
      config: input.config,
      sessionId: input.sessionId,
      question: q.question,
      enableMemoryWrites: false
    });
    input.onTurn?.(rag.timings);
    const judgeRes = await judgeAnswer({
      chat: input.judgeChat,
      question: q.question,
      answer: rag.answer,
      sources: rag.sources.map((s) => ({ citation: s.citation, text: s.text }))
    });
    const latencyMs = rag.timings.reduce((acc, t) => acc + t.ms, 0);
    const totalTokens = (rag.usageTotal?.totalTokens ?? 0) + (judgeRes?.usage?.totalTokens ?? 0);
    const dollars =
      rag.llmCalls.reduce((acc, c) => {
        const d = estimateDollars({
          pricing: input.pricing,
          provider: c.provider,
          model: c.model,
          usage: c.usage
        });
        return acc + (d ?? 0);
      }, 0) +
      (estimateDollars({
        pricing: input.pricing,
        provider: input.judgeChat.provider,
        model: input.judgeChat.model,
        usage: judgeRes?.usage
      }) ?? 0);
    out.push({
      latencyMs,
      totalTokens,
      dollars,
      weightedScore: judgeRes?.scores ? weightedScore(judgeRes.scores) : null
    });
  }
  return out;
}

function summarize(configHash: string, stage: "A" | "B", per: PerQuestion[]): Summary {
  const scores = per.map((p) => p.weightedScore).filter((x): x is number => typeof x === "number");
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const latencies = per.map((p) => p.latencyMs).sort((a, b) => a - b);
  const p95LatencyMs = latencies.length > 0 ? percentile(latencies, 0.95) : 0;

  const totalTokens = per.reduce((acc, p) => acc + p.totalTokens, 0);
  const dollars = per.reduce((acc, p) => acc + p.dollars, 0);

  return { configHash, stage, n: per.length, avgScore, p95LatencyMs, totalTokens, dollars };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx]!;
}
