import { stableJsonHash } from "../util/hash.js";
import type { RagPipelineConfig } from "./types.js";

export type RagIRNode = { id: string; type: string; params: Record<string, unknown> };
export type RagIREdge = { from: string; to: string };

export type RagIR = {
  version: 1;
  createdAt: string;
  configHash: string;
  nodes: RagIRNode[];
  edges: RagIREdge[];
};

export function buildRagIr(config: RagPipelineConfig): RagIR {
  const nodes: RagIRNode[] = [];
  const edges: RagIREdge[] = [];

  nodes.push({ id: "query.embed", type: "query.embed", params: {} });
  nodes.push({
    id: "query.retrieve",
    type: "query.retrieve",
    params: { topK: config.topK, chunkSizeTokens: config.chunkSizeTokens, overlapTokens: config.overlapTokens }
  });

  if (config.rewrite) nodes.push({ id: "query.rewrite", type: "query.rewrite", params: {} });
  if (config.rerank) nodes.push({ id: "query.rerank", type: "query.rerank", params: { method: "llm" } });

  nodes.push({
    id: "query.composeContext",
    type: "query.composeContext",
    params: { contextBudgetTokens: config.contextBudgetTokens, memoryBlend: config.memoryBlend }
  });
  nodes.push({ id: "query.generateAnswer", type: "query.generateAnswer", params: {} });

  if (config.rewrite) {
    edges.push({ from: "query.rewrite", to: "query.embed" });
  }
  edges.push({ from: "query.embed", to: "query.retrieve" });
  if (config.rerank) edges.push({ from: "query.retrieve", to: "query.rerank" });
  edges.push({ from: config.rerank ? "query.rerank" : "query.retrieve", to: "query.composeContext" });
  edges.push({ from: "query.composeContext", to: "query.generateAnswer" });

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    configHash: stableJsonHash(config),
    nodes,
    edges
  };
}

