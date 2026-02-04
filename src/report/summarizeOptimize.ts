import type { ParetoPoint } from "../rag/pareto.js";
import type { OptimizeBestPick, OptimizeResultLine, OptimizeRunSummary } from "./types.js";

export function summarizeOptimizeResults(input: {
  results: OptimizeResultLine[];
  pareto: ParetoPoint[];
}): OptimizeRunSummary {
  const uniqueConfigs = new Set(input.results.map((r) => r.configHash));
  const stageACount = input.results.filter((r) => r.stage === "A").length;
  const stageBCount = input.results.filter((r) => r.stage === "B").length;

  const candidates = stageBCount > 0 ? input.results.filter((r) => r.stage === "B") : input.results;

  const bestByScore = pickBest(candidates, (a, b) => b.avgScore - a.avgScore);
  const bestByLatency = pickBest(candidates, (a, b) => a.p95LatencyMs - b.p95LatencyMs);
  const bestByDollars = pickBest(candidates, (a, b) => a.dollars - b.dollars);

  return {
    runType: "optimize",
    configCount: uniqueConfigs.size,
    stageACount,
    stageBCount,
    bestByScore,
    bestByLatency,
    bestByDollars,
    pareto: input.pareto
  };
}

function pickBest(
  results: OptimizeResultLine[],
  cmp: (a: OptimizeResultLine, b: OptimizeResultLine) => number
): OptimizeBestPick | undefined {
  if (results.length === 0) return undefined;
  const sorted = [...results].sort(cmp);
  const b = sorted[0]!;
  return {
    configHash: b.configHash,
    stage: b.stage,
    avgScore: b.avgScore,
    p95LatencyMs: b.p95LatencyMs,
    totalTokens: b.totalTokens,
    dollars: b.dollars,
    n: b.n
  };
}

