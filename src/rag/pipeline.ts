import type { Db } from "../db/db.js";
import type { EmbeddingRecord } from "../providers/dbBacked.js";
import type { ChatClient } from "../providers/types.js";
import { addEpisodicTurn } from "../memory/memoryStore.js";
import { writeSemanticMemoryFromTurn } from "../memory/writeMemory.js";
import { timeIt } from "../util/timing.js";
import { buildContextBlock, buildAnswerSystemPrompt } from "./prompts.js";
import { getChunkSetId, retrieveDocChunks, retrieveSemanticMemories } from "./retrieval.js";
import { maybeRerankByLLM } from "./rerank.js";
import { maybeRewriteQuery } from "./rewrite.js";
import type { LlmCallRecord, RagPipelineConfig, RagSource, RagTurnResult } from "./types.js";

export async function runRagTurn(input: {
  db: Db;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]>; model: string };
  answerChat: ChatClient;
  supportChat?: ChatClient;
  config: RagPipelineConfig;
  sessionId: string;
  question: string;
  enableMemoryWrites?: boolean;
}): Promise<RagTurnResult> {
  const timings: { label: string; ms: number }[] = [];
  const llmCalls: LlmCallRecord[] = [];
  let usageTotal: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
  const enableMemoryWrites = input.enableMemoryWrites ?? true;
  const supportChat = input.supportChat ?? input.answerChat;

  const recordCall = (label: string, client: ChatClient, usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) => {
    llmCalls.push({ label, provider: client.provider, model: client.model, usage });
    usageTotal = addUsage(usageTotal, usage);
  };

  addEpisodicTurn(input.db, { sessionId: input.sessionId, role: "user", text: input.question });

  const rewriteTimed = await timeIt("rewrite", async () =>
    maybeRewriteQuery(supportChat, { question: input.question, enabled: input.config.rewrite })
  );
  timings.push(rewriteTimed.timing);
  recordCall("rewrite", supportChat, rewriteTimed.value.usage);
  const rewrittenQuery = rewriteTimed.value.query;

  const embedTimed = await timeIt("embed.query", async () => input.embedder.getOrCreate([rewrittenQuery]));
  timings.push(embedTimed.timing);
  const queryEmbedding = embedTimed.value[0]!;

  const chunkSetId = getChunkSetId(input.db, {
    chunkSize: input.config.chunkSizeTokens,
    overlap: input.config.overlapTokens,
    embedModel: input.embedder.model
  });
  if (!chunkSetId) {
    throw new Error(
      `No chunk_set found for chunkSize=${input.config.chunkSizeTokens} overlap=${input.config.overlapTokens} embedModel=${input.embedder.model}. Run 'mem-rag ingest' with matching settings.`
    );
  }

  const baseRetrieveK = input.config.rerank ? Math.max(input.config.topK * 3, input.config.topK) : input.config.topK;
  const retrieveTimed = await timeIt("retrieve.docs", async () =>
    retrieveDocChunks(input.db, { chunkSetId, queryVector: queryEmbedding.vector, topK: baseRetrieveK })
  );
  timings.push(retrieveTimed.timing);

  let sources: RagSource[] = retrieveTimed.value.map((c, idx) => ({
    citation: `S${idx + 1}`,
    chunkId: c.chunkId,
    documentPath: c.documentPath,
    documentTitle: c.documentTitle,
    score: c.score,
    text: c.text
  }));

  if (sources.length === 0) {
    const answer = "Not found in corpus.";
    addEpisodicTurn(input.db, { sessionId: input.sessionId, role: "assistant", text: answer });
    return {
      answer,
      sources: [],
      timings,
      llmCalls,
      usageTotal,
      rewrittenQuery: rewrittenQuery !== input.question ? rewrittenQuery : undefined
    };
  }

  const rerankTimed = await timeIt("rerank", async () =>
    maybeRerankByLLM(supportChat, {
      question: rewrittenQuery,
      candidates: sources.map((s) => ({ citation: s.citation, text: s.text, s })),
      enabled: input.config.rerank,
      take: input.config.topK
    })
  );
  timings.push(rerankTimed.timing);
  recordCall("rerank", supportChat, rerankTimed.value.usage);

  if (input.config.rerank) {
    sources = rerankTimed.value.items.map((x) => (x as any).s as RagSource);
  } else {
    sources = sources.slice(0, input.config.topK);
  }

  const memoriesTimed = await timeIt("retrieve.memory", async () => {
    if (input.config.memoryBlend !== "docs+semantic") return [];
    return retrieveSemanticMemories(input.db, { queryVector: queryEmbedding.vector, topK: 5 });
  });
  timings.push(memoriesTimed.timing);

  const context = buildContextBlock({
    sources: sources.map((s) => ({
      citation: s.citation,
      header: `${s.documentTitle} (${s.documentPath}) chunk=${s.chunkId}`,
      text: s.text
    })),
    memories: memoriesTimed.value.map((m) => ({ memoryId: m.memoryId, kind: m.kind, text: m.text })),
    contextBudgetTokens: input.config.contextBudgetTokens
  });

  const includedSources = new Set(context.includedSources);
  const included = sources.filter((s) => includedSources.has(s.citation));

  const genTimed = await timeIt("generate", async () =>
    input.answerChat.complete({
      messages: [
        { role: "system", content: buildAnswerSystemPrompt() },
        {
          role: "user",
          content: [context.contextText, "", "QUESTION:", input.question].join("\n")
        }
      ],
      temperature: 0.2
    })
  );
  timings.push(genTimed.timing);
  recordCall("generate", input.answerChat, genTimed.value.usage);

  const answer = genTimed.value.text.trim() || "Not found in corpus.";
  addEpisodicTurn(input.db, { sessionId: input.sessionId, role: "assistant", text: answer });

  let memoryWrite: RagTurnResult["memoryWrite"] | undefined;
  if (enableMemoryWrites) {
    const writeTimed = await timeIt("memory.write", async () =>
      writeSemanticMemoryFromTurn({
        db: input.db,
        chat: supportChat,
        embedder: input.embedder,
        sessionId: input.sessionId,
        userMessage: input.question,
        assistantAnswer: answer,
        retrievedSources: included.map((s) => ({ citation: s.citation, text: s.text }))
      })
    );
    timings.push(writeTimed.timing);
    recordCall("memory.write", supportChat, writeTimed.value.usage);
    memoryWrite = writeTimed.value;
  }

  return {
    answer,
    sources: included,
    timings,
    usageTotal,
    llmCalls,
    memoryWrite,
    rewrittenQuery: rewrittenQuery !== input.question ? rewrittenQuery : undefined
  };
}

function addUsage(
  a: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined,
  b: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined
) {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return a;
  return {
    promptTokens: (a.promptTokens ?? 0) + (b.promptTokens ?? 0),
    completionTokens: (a.completionTokens ?? 0) + (b.completionTokens ?? 0),
    totalTokens: (a.totalTokens ?? 0) + (b.totalTokens ?? 0)
  };
}
