import type { ParetoPoint } from "../rag/pareto.js";
import type { EvalResult } from "../eval/types.js";

export type RunType = "eval" | "optimize";

export type RunManifest = {
  runType: RunType;
  createdAt: string;
  appVersion?: string;
  gitCommit?: string;
  nodeVersion: string;
  models: {
    embedModel: string;
    chatModel: string;
    judgeModel: string;
    supportProvider: "lmstudio" | "openrouter";
    supportModel: string;
  };
  questions: { path: string; sha256: string };
  commandLine: string[];
  optimize?: { seed: number; warmup: number; minConfigs: number; stageA: number; stageB: number; topN: number };
};

export type EvalQuestionMetrics = {
  id: string;
  question: string;
  answer: string;
  weightedScore?: number;
  judge?: EvalResult["judge"];
  judgeNotes?: string;
  recallAtK?: number;
  totalLatencyMs: number;
  timingsMs: Record<string, number>;
  totalTokens?: number;
  totalDollars?: number;
  ragTokens?: number;
  judgeTokens?: number;
  ragDollars?: number;
  judgeDollars?: number;
  retrievedSources: EvalResult["retrievedSources"];
  rewrittenQuery?: string;
  memoryWrite?: EvalResult["memoryWrite"];
};

export type EvalRunSummary = {
  runType: "eval";
  n: number;
  avgWeightedScore?: number;
  avgCorrectness?: number;
  avgGroundedness?: number;
  avgMemoryUse?: number;
  avgClarity?: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
  totalTokens?: number;
  avgTokens?: number;
  totalDollars?: number;
  avgDollars?: number;
  recallAtKRate?: number;
};

export type OptimizeResultLine = {
  configHash: string;
  stage: "A" | "B";
  n: number;
  avgScore: number;
  p95LatencyMs: number;
  totalTokens: number;
  dollars: number;
};

export type OptimizeBestPick = {
  configHash: string;
  stage: "A" | "B";
  avgScore: number;
  p95LatencyMs: number;
  totalTokens: number;
  dollars: number;
  n: number;
};

export type OptimizeRunSummary = {
  runType: "optimize";
  configCount: number;
  stageACount: number;
  stageBCount: number;
  bestByScore?: OptimizeBestPick;
  bestByLatency?: OptimizeBestPick;
  bestByDollars?: OptimizeBestPick;
  pareto?: ParetoPoint[];
};

export type PublishedRunIndexItem = {
  runId: string;
  runType: RunType;
  title: string;
  createdAt?: string;
  summary: EvalRunSummary | OptimizeRunSummary;
};

