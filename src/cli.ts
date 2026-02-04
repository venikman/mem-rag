#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import readline from "node:readline";

import { getConfig } from "./config.js";
import { openDb } from "./db/db.js";
import { createCachedChatClient, createDbBackedEmbeddings } from "./providers/dbBacked.js";
import { createOpenAICompatChatClient, createOpenAICompatEmbeddingsClient } from "./providers/openaiCompat.js";
import { ingestCorpus } from "./ingestion/ingestCorpus.js";
import { addEpisodicTurn, createSession, listRecentSemanticMemories } from "./memory/memoryStore.js";
import { runRagTurn } from "./rag/pipeline.js";
import type { RagPipelineConfig } from "./rag/types.js";
import { RagPipelineConfigSchema } from "./rag/types.js";
import { ensureDir } from "./util/fs.js";
import { runEval } from "./eval/runEval.js";
import { runOptimize } from "./optimize/runOptimize.js";
import { enumerateConfigSpace, sampleConfigs } from "./rag/explorer.js";
import { makeResearchAgent } from "./mastra/researchAgent.js";

const program = new Command();
program.name("mem-rag").description("Agentic memory research assistant (CLI)");

program
  .command("ingest")
  .argument("<corpusPath>", "Folder containing PDFs/MDs")
  .option("--include <pattern...>", "Include pattern(s) like **/*.pdf **/*.md")
  .option("--chunk-size <n>", "Chunk size (tokens proxy)", toInt, 800)
  .option("--overlap <n>", "Chunk overlap (tokens proxy)", toInt, 100)
  .option("--embed-model <model>", "Embedding model (LM Studio)", "")
  .action(async (corpusPath: string, opts) => {
    const cfg = getConfig();
    const db = openDb(cfg.dbPath);

    const embedModel = opts.embedModel || cfg.lmstudio.embedModel;
    const embedClient = createOpenAICompatEmbeddingsClient({
      provider: "lmstudio",
      baseUrl: cfg.lmstudio.baseUrl,
      apiKey: cfg.lmstudio.apiKey,
      model: embedModel
    });
    const embedder = createDbBackedEmbeddings(db, embedClient);

    const stats = await ingestCorpus(db, embedder, {
      corpusPath,
      include: opts.include,
      chunkSizeTokens: opts.chunkSize,
      overlapTokens: opts.overlap,
      embedModel
    });
    console.log(JSON.stringify(stats, null, 2));
  });

program
  .command("chat")
  .option("--mode <mode>", "pipeline|mastra", "pipeline")
  .option("--chunk-size <n>", "Chunk size (tokens proxy)", toInt, 800)
  .option("--overlap <n>", "Chunk overlap (tokens proxy)", toInt, 100)
  .option("--topk <n>", "TopK retrieval", toInt, 10)
  .option("--rewrite", "Enable query rewrite", false)
  .option("--rerank", "Enable LLM reranking", false)
  .option("--context-budget <n>", "Context budget (tokens proxy)", toInt, 6000)
  .option("--memory-blend <mode>", "docs_only|docs+semantic", "docs+semantic")
  .action(async (opts) => {
    const cfg = getConfig();
    const db = openDb(cfg.dbPath);

    const embedClient = createOpenAICompatEmbeddingsClient({
      provider: "lmstudio",
      baseUrl: cfg.lmstudio.baseUrl,
      apiKey: cfg.lmstudio.apiKey,
      model: cfg.lmstudio.embedModel
    });
    const embedder = createDbBackedEmbeddings(db, embedClient);

    const chatHeaders: Record<string, string> = {};
    if (cfg.openrouter.referer) chatHeaders["HTTP-Referer"] = cfg.openrouter.referer;
    if (cfg.openrouter.title) chatHeaders["X-Title"] = cfg.openrouter.title;

    const chatClient = createCachedChatClient(
      db,
      createOpenAICompatChatClient({
        provider: "openrouter",
        baseUrl: cfg.openrouter.baseUrl,
        apiKey: cfg.openrouter.apiKey,
        model: cfg.openrouter.chatModel,
        defaultHeaders: chatHeaders
      })
    );
    const supportChat = makeSupportChatClient(db, cfg, chatHeaders, chatClient);

    const session = createSession(db);
    console.log(`Session: ${session.id}`);
    console.log("Type /memory to inspect semantic memory. Type /exit to quit.");

    const config: RagPipelineConfig = RagPipelineConfigSchema.parse({
      chunkSizeTokens: opts.chunkSize,
      overlapTokens: opts.overlap,
      topK: opts.topk,
      rewrite: Boolean(opts.rewrite),
      rerank: Boolean(opts.rerank),
      contextBudgetTokens: opts.contextBudget,
      memoryBlend: opts.memoryBlend
    });

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

    const mode = String(opts.mode || "pipeline");
    let researchAgent: any = null;
    if (mode === "mastra") {
      process.env.OPENAI_API_KEY = cfg.openrouter.apiKey;
      process.env.OPENAI_BASE_URL = cfg.openrouter.baseUrl;
      researchAgent = makeResearchAgent({
        db,
        embedder: { ...embedder, model: cfg.lmstudio.embedModel },
        model: `openai/${cfg.openrouter.chatModel}`
      });
      console.log("Mode: mastra (agent uses tools searchDocs/searchMemory/writeMemory)");
    } else {
      console.log("Mode: pipeline (deterministic RAG pipeline + memory writer)");
    }

    while (true) {
      const q = (await ask("> ")).trim();
      if (!q) continue;
      if (q === "/exit") break;
      if (q === "/memory") {
        const mem = listRecentSemanticMemories(db, 20);
        console.log(JSON.stringify(mem, null, 2));
        continue;
      }

      try {
        if (mode === "mastra") {
          addEpisodicTurn(db, { sessionId: session.id, role: "user", text: q });
          const res = await researchAgent.generate(q);
          const text = typeof res === "string" ? res : (res?.text ?? "").toString();
          console.log(text);
          addEpisodicTurn(db, { sessionId: session.id, role: "assistant", text });
        } else {
          const res = await runRagTurn({
            db,
            embedder: { ...embedder, model: cfg.lmstudio.embedModel },
            answerChat: chatClient,
            supportChat,
            config,
            sessionId: session.id,
            question: q,
            enableMemoryWrites: true
          });
          console.log(res.answer);
          if (res.sources.length > 0) {
            console.log("\nSources:");
            for (const s of res.sources) {
              console.log(`- [${s.citation}] ${s.documentTitle} (${s.documentPath}) chunk=${s.chunkId}`);
            }
          }
          if (res.memoryWrite) {
            console.log(`\nMemory write: stored ${res.memoryWrite.stored}/${res.memoryWrite.proposed}`);
          }
        }
      } catch (err) {
        console.error(String(err));
      }
    }

    rl.close();
  });

program
  .command("eval")
  .requiredOption("--questions <path>", "Path to eval/questions.jsonl")
  .option("--out <dir>", "Output directory", "")
  .option("--limit <n>", "Limit number of questions", toInt)
  .option("--enable-memory-writes", "Enable semantic memory writes during eval", false)
  .option("--chunk-size <n>", "Chunk size (tokens proxy)", toInt, 800)
  .option("--overlap <n>", "Chunk overlap (tokens proxy)", toInt, 100)
  .option("--topk <n>", "TopK retrieval", toInt, 10)
  .option("--rewrite", "Enable query rewrite", false)
  .option("--rerank", "Enable LLM reranking", false)
  .option("--context-budget <n>", "Context budget (tokens proxy)", toInt, 6000)
  .option("--memory-blend <mode>", "docs_only|docs+semantic", "docs_only")
  .action(async (opts) => {
    const cfg = getConfig();
    const db = openDb(cfg.dbPath);

    const embedClient = createOpenAICompatEmbeddingsClient({
      provider: "lmstudio",
      baseUrl: cfg.lmstudio.baseUrl,
      apiKey: cfg.lmstudio.apiKey,
      model: cfg.lmstudio.embedModel
    });
    const embedder = createDbBackedEmbeddings(db, embedClient);

    const chatHeaders: Record<string, string> = {};
    if (cfg.openrouter.referer) chatHeaders["HTTP-Referer"] = cfg.openrouter.referer;
    if (cfg.openrouter.title) chatHeaders["X-Title"] = cfg.openrouter.title;

    const chatClient = createCachedChatClient(
      db,
      createOpenAICompatChatClient({
        provider: "openrouter",
        baseUrl: cfg.openrouter.baseUrl,
        apiKey: cfg.openrouter.apiKey,
        model: cfg.openrouter.chatModel,
        defaultHeaders: chatHeaders
      })
    );
    const supportChat = makeSupportChatClient(db, cfg, chatHeaders, chatClient);
    const judgeClient = createCachedChatClient(
      db,
      createOpenAICompatChatClient({
        provider: "openrouter",
        baseUrl: cfg.openrouter.baseUrl,
        apiKey: cfg.openrouter.apiKey,
        model: cfg.openrouter.judgeModel,
        defaultHeaders: chatHeaders
      })
    );

    const outDir = opts.out || path.join(cfg.runsDir, `${Date.now()}`, "eval");
    ensureDir(outDir);

    const config: RagPipelineConfig = RagPipelineConfigSchema.parse({
      chunkSizeTokens: opts.chunkSize,
      overlapTokens: opts.overlap,
      topK: opts.topk,
      rewrite: Boolean(opts.rewrite),
      rerank: Boolean(opts.rerank),
      contextBudgetTokens: opts.contextBudget,
      memoryBlend: opts.memoryBlend
    });

    const session = createSession(db);
    const res = await runEval({
      db,
      embedder: { ...embedder, model: cfg.lmstudio.embedModel },
      answerChat: chatClient,
      supportChat,
      judgeChat: judgeClient,
      config,
      sessionId: session.id,
      opts: {
        questionsPath: opts.questions,
        outDir,
        limit: opts.limit,
        enableMemoryWrites: Boolean(opts.enableMemoryWrites),
        costModelPath: ".data/cost_model.json",
        pricingPath: cfg.pricingPath
      }
    });
    console.log(JSON.stringify(res, null, 2));
  });

program
  .command("optimize")
  .requiredOption("--questions <path>", "Path to eval/questions.jsonl")
  .option("--out <dir>", "Output directory", "")
  .option("--seed <n>", "RNG seed", toInt, 1)
  .option("--warmup <n>", "Warmup random configs", toInt, 6)
  .option("--min-configs <n>", "Total configs for Stage A (>=10 recommended)", toInt, 10)
  .option("--stage-a <n>", "Questions for Stage A", toInt, 5)
  .option("--stage-b <n>", "Questions for Stage B (top configs)", toInt, 20)
  .option("--top-n <n>", "Top configs to run Stage B", toInt, 3)
  .option("--corpus <path>", "Corpus path for auto-ingest (default: ../)", "../")
  .option("--include <pattern...>", "Include pattern(s) like **/*.pdf **/*.md")
  .option("--no-ensure-ingested", "Do not auto-ingest missing chunk sets")
  .action(async (opts) => {
    const cfg = getConfig();
    const db = openDb(cfg.dbPath);

    const embedClient = createOpenAICompatEmbeddingsClient({
      provider: "lmstudio",
      baseUrl: cfg.lmstudio.baseUrl,
      apiKey: cfg.lmstudio.apiKey,
      model: cfg.lmstudio.embedModel
    });
    const embedder = createDbBackedEmbeddings(db, embedClient);

    const chatHeaders: Record<string, string> = {};
    if (cfg.openrouter.referer) chatHeaders["HTTP-Referer"] = cfg.openrouter.referer;
    if (cfg.openrouter.title) chatHeaders["X-Title"] = cfg.openrouter.title;

    const chatClient = createCachedChatClient(
      db,
      createOpenAICompatChatClient({
        provider: "openrouter",
        baseUrl: cfg.openrouter.baseUrl,
        apiKey: cfg.openrouter.apiKey,
        model: cfg.openrouter.chatModel,
        defaultHeaders: chatHeaders
      })
    );
    const supportChat = makeSupportChatClient(db, cfg, chatHeaders, chatClient);
    const judgeClient = createCachedChatClient(
      db,
      createOpenAICompatChatClient({
        provider: "openrouter",
        baseUrl: cfg.openrouter.baseUrl,
        apiKey: cfg.openrouter.apiKey,
        model: cfg.openrouter.judgeModel,
        defaultHeaders: chatHeaders
      })
    );

    const outDir = opts.out || path.join(cfg.runsDir, `${Date.now()}`, "optimize");
    ensureDir(outDir);

    const space = enumerateConfigSpace();
    const configs = sampleConfigs(space, { seed: opts.seed, warmup: opts.warmup, minConfigs: opts.minConfigs });

    if (opts.ensureIngested) {
      const uniqueChunkSets = new Map<string, { chunkSizeTokens: number; overlapTokens: number }>();
      for (const c of configs) {
        uniqueChunkSets.set(`${c.chunkSizeTokens}:${c.overlapTokens}`, {
          chunkSizeTokens: c.chunkSizeTokens,
          overlapTokens: c.overlapTokens
        });
      }
      for (const cs of uniqueChunkSets.values()) {
        console.log(`Ensuring chunks exist: chunkSize=${cs.chunkSizeTokens} overlap=${cs.overlapTokens}`);
        await ingestCorpus(db, embedder, {
          corpusPath: opts.corpus,
          include: opts.include,
          chunkSizeTokens: cs.chunkSizeTokens,
          overlapTokens: cs.overlapTokens,
          embedModel: cfg.lmstudio.embedModel
        });
      }
    }

    const res = await runOptimize({
      db,
      embedder: { ...embedder, model: cfg.lmstudio.embedModel },
      answerChat: chatClient,
      supportChat,
      judgeChat: judgeClient,
      opts: {
        questionsPath: opts.questions,
        outDir,
        seed: opts.seed,
        warmup: opts.warmup,
        minConfigs: opts.minConfigs,
        stageAQuestions: opts.stageA,
        stageBQuestions: opts.stageB,
        topN: opts.topN,
        costModelPath: ".data/cost_model.json",
        pricingPath: cfg.pricingPath
      },
      configs
    });
    console.log(JSON.stringify(res, null, 2));
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

function toInt(v: string): number {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) throw new Error(`Invalid integer: ${v}`);
  return n;
}

function makeSupportChatClient(
  db: ReturnType<typeof openDb>,
  cfg: ReturnType<typeof getConfig>,
  openrouterHeaders: Record<string, string>,
  answerChat: ReturnType<typeof createCachedChatClient>
) {
  if (cfg.support.provider === "openrouter") {
    if (cfg.support.model === cfg.openrouter.chatModel) return answerChat;
    return createCachedChatClient(
      db,
      createOpenAICompatChatClient({
        provider: "openrouter",
        baseUrl: cfg.openrouter.baseUrl,
        apiKey: cfg.openrouter.apiKey,
        model: cfg.support.model,
        defaultHeaders: openrouterHeaders
      })
    );
  }

  return createCachedChatClient(
    db,
    createOpenAICompatChatClient({
      provider: "lmstudio",
      baseUrl: cfg.lmstudio.baseUrl,
      apiKey: cfg.lmstudio.apiKey,
      model: cfg.support.model
    })
  );
}
