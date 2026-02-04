import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { Db } from "../../db/db.js";
import type { EmbeddingRecord } from "../../providers/dbBacked.js";
import { getChunkSetId, retrieveDocChunks } from "../../rag/retrieval.js";

export function makeSearchDocsTool(deps: {
  db: Db;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]>; model: string };
}) {
  return createTool({
    id: "search_docs",
    description: "Search ingested documents and return top relevant chunks with citations.",
    inputSchema: z.object({
      query: z.string().min(1),
      k: z.number().int().min(1).max(50).default(10),
      chunkSizeTokens: z.number().int().min(1).default(800),
      overlapTokens: z.number().int().min(0).default(100)
    }),
    outputSchema: z.object({
      sources: z
        .array(
          z.object({
            citation: z.string(),
            chunkId: z.number().int(),
            documentTitle: z.string(),
            documentPath: z.string(),
            score: z.number(),
            text: z.string()
          })
        )
        .default([])
    }),
    execute: async (toolInput) => {
      const k = toolInput.k ?? 10;
      const chunkSizeTokens = toolInput.chunkSizeTokens ?? 800;
      const overlapTokens = toolInput.overlapTokens ?? 100;
      const [qEmb] = await deps.embedder.getOrCreate([toolInput.query]);
      const chunkSetId = getChunkSetId(deps.db, {
        chunkSize: chunkSizeTokens,
        overlap: overlapTokens,
        embedModel: deps.embedder.model
      });
      if (!chunkSetId) {
        return { sources: [] };
      }
      const chunks = retrieveDocChunks(deps.db, { chunkSetId, queryVector: qEmb!.vector, topK: k });
      return {
        sources: chunks.map((c, idx) => ({
          citation: `S${idx + 1}`,
          chunkId: c.chunkId,
          documentTitle: c.documentTitle,
          documentPath: c.documentPath,
          score: c.score,
          text: c.text
        }))
      };
    }
  });
}
