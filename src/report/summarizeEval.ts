import type { EvalResult } from "../eval/types.js";
import type { EvalQuestionMetrics, EvalRunSummary } from "./types.js";

export function toEvalQuestionMetrics(result: EvalResult): EvalQuestionMetrics {
  const timingsMs = result.timingsMs ?? {};
  const totalLatencyMs = Object.values(timingsMs).reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);

  const ragTokens = result.usage?.totalTokens;
  const judgeTokens = result.judgeUsage?.totalTokens;
  const totalTokens =
    typeof ragTokens === "number" || typeof judgeTokens === "number"
      ? (ragTokens ?? 0) + (judgeTokens ?? 0)
      : undefined;

  const ragDollars = result.dollars;
  const judgeDollars = result.judgeDollars;
  const totalDollars =
    typeof ragDollars === "number" || typeof judgeDollars === "number"
      ? (ragDollars ?? 0) + (judgeDollars ?? 0)
      : undefined;

  return {
    id: result.id,
    question: result.question,
    answer: result.answer,
    weightedScore: result.weightedScore,
    judge: result.judge,
    judgeNotes: result.judge?.notes,
    recallAtK: result.recallAtK,
    totalLatencyMs,
    timingsMs,
    totalTokens,
    totalDollars,
    ragTokens: ragTokens ?? undefined,
    judgeTokens: judgeTokens ?? undefined,
    ragDollars: ragDollars ?? undefined,
    judgeDollars: judgeDollars ?? undefined,
    retrievedSources: result.retrievedSources,
    rewrittenQuery: result.rewrittenQuery,
    memoryWrite: result.memoryWrite
  };
}

export function summarizeEvalResults(results: EvalResult[]): EvalRunSummary {
  const metrics = results.map(toEvalQuestionMetrics);

  const weighted = metrics.map((m) => m.weightedScore).filter(isNumber);
  const avgWeightedScore = average(weighted);

  const correctness = metrics.map((m) => m.judge?.correctness).filter(isNumber);
  const groundedness = metrics.map((m) => m.judge?.groundedness).filter(isNumber);
  const memoryUse = metrics.map((m) => m.judge?.memoryUse).filter(isNumber);
  const clarity = metrics.map((m) => m.judge?.clarity).filter(isNumber);

  const latencies = metrics.map((m) => m.totalLatencyMs).filter(isNumber).sort((a, b) => a - b);
  const p50LatencyMs = percentile(latencies, 0.5);
  const p95LatencyMs = percentile(latencies, 0.95);

  const tokens = metrics.map((m) => m.totalTokens).filter(isNumber);
  const totalTokens = sum(tokens);
  const avgTokens = tokens.length > 0 ? totalTokens / tokens.length : undefined;

  const dollars = metrics.map((m) => m.totalDollars).filter(isNumber);
  const totalDollars = sum(dollars);
  const avgDollars = dollars.length > 0 ? totalDollars / dollars.length : undefined;

  const recall = metrics.map((m) => m.recallAtK).filter(isNumber);
  const recallAtKRate = recall.length > 0 ? sum(recall) / recall.length : undefined;

  return {
    runType: "eval",
    n: results.length,
    avgWeightedScore,
    avgCorrectness: average(correctness),
    avgGroundedness: average(groundedness),
    avgMemoryUse: average(memoryUse),
    avgClarity: average(clarity),
    p50LatencyMs,
    p95LatencyMs,
    totalTokens: tokens.length > 0 ? totalTokens : undefined,
    avgTokens,
    totalDollars: dollars.length > 0 ? totalDollars : undefined,
    avgDollars,
    recallAtKRate
  };
}

function isNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return sum(values) / values.length;
}

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

