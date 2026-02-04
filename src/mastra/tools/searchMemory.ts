import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { Db } from "../../db/db.js";
import type { EmbeddingRecord } from "../../providers/dbBacked.js";
import { retrieveSemanticMemories } from "../../rag/retrieval.js";

export function makeSearchMemoryTool(deps: {
  db: Db;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]> };
}) {
  return createTool({
    id: "search_memory",
    description: "Search long-term semantic memory (preferences/decisions/facts).",
    inputSchema: z.object({
      query: z.string().min(1),
      k: z.number().int().min(1).max(20).default(5)
    }),
    outputSchema: z.object({
      memories: z
        .array(
          z.object({
            memoryId: z.number().int(),
            kind: z.string(),
            text: z.string(),
            score: z.number()
          })
        )
        .default([])
    }),
    execute: async (toolInput) => {
      const k = toolInput.k ?? 5;
      const [qEmb] = await deps.embedder.getOrCreate([toolInput.query]);
      const mem = retrieveSemanticMemories(deps.db, { queryVector: qEmb!.vector, topK: k });
      return {
        memories: mem.map((m) => ({ memoryId: m.memoryId, kind: m.kind, text: m.text, score: m.score }))
      };
    }
  });
}
