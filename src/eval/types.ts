import { z } from "zod";

export const EvalQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  expected_sources: z.array(z.string()).optional(),
  notes: z.string().optional()
});

export type EvalQuestion = z.infer<typeof EvalQuestionSchema>;

export type EvalJudgeScores = {
  correctness: number;
  groundedness: number;
  memoryUse: number;
  clarity: number;
  notes?: string;
};

export type EvalResult = {
  id: string;
  question: string;
  answer: string;
  configHash: string;
  timingsMs: Record<string, number>;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  dollars?: number;
  judgeUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  judgeDollars?: number;
  judge?: EvalJudgeScores;
  weightedScore?: number;
  recallAtK?: number;
  retrievedSources: { citation: string; documentPath: string; chunkId: number }[];
  rewrittenQuery?: string;
  memoryWrite?: { proposed: number; stored: number; skippedLowScore: number; superseded: number };
};
