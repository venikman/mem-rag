import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { Db } from "../../db/db.js";
import type { EmbeddingRecord } from "../../providers/dbBacked.js";
import { insertSemanticMemory } from "../../memory/memoryStore.js";

export function makeWriteMemoryTool(deps: {
  db: Db;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]> };
}) {
  return createTool({
    id: "write_memory",
    description: "Store a new semantic memory (preference/decision/fact/insight/todo).",
    inputSchema: z.object({
      text: z.string().min(1),
      kind: z.enum(["preference", "decision", "fact", "insight", "todo"]),
      importance: z.number().min(0).max(1).default(0.6),
      confidence: z.number().min(0).max(1).default(0.6)
    }),
    outputSchema: z.object({
      stored: z.boolean(),
      memoryId: z.number().int().optional()
    }),
    execute: async (toolInput) => {
      const importance = toolInput.importance ?? 0.6;
      const confidence = toolInput.confidence ?? 0.6;
      if (importance < 0.6 || confidence < 0.6) return { stored: false };
      const [emb] = await deps.embedder.getOrCreate([toolInput.text]);
      const memoryId = insertSemanticMemory(deps.db, {
        text: toolInput.text,
        kind: toolInput.kind,
        importance,
        confidence,
        embeddingId: emb!.id
      });
      return { stored: true, memoryId };
    }
  });
}
