import { z } from "zod";

export const MemoryBlendSchema = z.enum(["docs_only", "docs+semantic"]);

export const RagPipelineConfigSchema = z.object({
  chunkSizeTokens: z.number().int().positive(),
  overlapTokens: z.number().int().min(0),
  topK: z.number().int().positive(),
  rewrite: z.boolean(),
  rerank: z.boolean(),
  contextBudgetTokens: z.number().int().positive(),
  memoryBlend: MemoryBlendSchema
});

export type RagPipelineConfig = z.infer<typeof RagPipelineConfigSchema>;

export type RagTiming = { label: string; ms: number };

export type LlmCallRecord = {
  label: string;
  provider: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

export type RagSource = {
  citation: string; // e.g. S1
  chunkId: number;
  documentPath: string;
  documentTitle: string;
  score: number;
  text: string;
};

export type RagTurnResult = {
  answer: string;
  sources: RagSource[];
  timings: RagTiming[];
  usageTotal?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  llmCalls: LlmCallRecord[];
  memoryWrite?: { proposed: number; stored: number; skippedLowScore: number; superseded: number };
  rewrittenQuery?: string;
};
