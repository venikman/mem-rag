import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { Db } from "../../db/db.js";
import { listRecentSemanticMemories } from "../../memory/memoryStore.js";

export function makeInspectMemoryTool(deps: { db: Db }) {
  return createTool({
    id: "inspect_memory",
    description: "List recent semantic memories (debug).",
    inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    outputSchema: z.object({
      memories: z.array(
        z.object({
          id: z.number().int(),
          kind: z.string(),
          text: z.string(),
          importance: z.number(),
          confidence: z.number(),
          createdAt: z.string(),
          supersedesId: z.number().int().nullable()
        })
      )
    }),
    execute: async (toolInput) => {
      const limit = toolInput.limit ?? 20;
      const rows = listRecentSemanticMemories(deps.db, limit);
      return {
        memories: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          text: r.text,
          importance: r.importance,
          confidence: r.confidence,
          createdAt: r.createdAt,
          supersedesId: r.supersedesId
        }))
      };
    }
  });
}
