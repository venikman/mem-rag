import { Agent } from "@mastra/core/agent";

import type { Db } from "../db/db.js";
import type { EmbeddingRecord } from "../providers/dbBacked.js";
import { makeInspectMemoryTool } from "./tools/inspectMemory.js";
import { makeSearchDocsTool } from "./tools/searchDocs.js";
import { makeSearchMemoryTool } from "./tools/searchMemory.js";
import { makeWriteMemoryTool } from "./tools/writeMemory.js";

export function makeResearchAgent(input: {
  db: Db;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]>; model: string };
  model: string;
}) {
  const searchDocs = makeSearchDocsTool({ db: input.db, embedder: input.embedder });
  const searchMemory = makeSearchMemoryTool({ db: input.db, embedder: input.embedder });
  const writeMemory = makeWriteMemoryTool({ db: input.db, embedder: input.embedder });
  const inspectMemory = makeInspectMemoryTool({ db: input.db });

  return new Agent({
    id: "research-agent",
    name: "Research Agent",
    instructions: [
      "You are a personal research assistant over a local corpus.",
      "",
      "Always follow this loop:",
      "1) Call searchMemory with the user's question to retrieve preferences/decisions.",
      "2) Call searchDocs with the user's question to retrieve sources.",
      "3) Answer using ONLY returned sources. If not supported, say: Not found in corpus.",
      "4) Cite sources inline as [S1], [S2], etc (use citations from tool output).",
      "5) After answering, optionally call writeMemory once to store a stable preference/decision/insight (only if importance/confidence >= 0.6)."
    ].join("\n"),
    model: input.model,
    tools: { searchDocs, searchMemory, writeMemory, inspectMemory }
  });
}

