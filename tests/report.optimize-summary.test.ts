import { describe, expect, test } from "vitest";

import type { ParetoPoint } from "../src/rag/pareto.js";
import { summarizeOptimizeResults } from "../src/report/summarizeOptimize.js";
import type { OptimizeResultLine } from "../src/report/types.js";

describe("summarizeOptimizeResults", () => {
  test("prefers Stage B picks when available", () => {
    const results: OptimizeResultLine[] = [
      { configHash: "a", stage: "A", n: 5, avgScore: 4.9, p95LatencyMs: 800, totalTokens: 5000, dollars: 0.5 },
      { configHash: "b", stage: "A", n: 5, avgScore: 3.0, p95LatencyMs: 1000, totalTokens: 6000, dollars: 0.6 },
      { configHash: "a", stage: "B", n: 20, avgScore: 3.2, p95LatencyMs: 1200, totalTokens: 20000, dollars: 2.0 },
      { configHash: "c", stage: "B", n: 20, avgScore: 3.5, p95LatencyMs: 1500, totalTokens: 24000, dollars: 3.0 },
      { configHash: "d", stage: "B", n: 20, avgScore: 3.1, p95LatencyMs: 900, totalTokens: 21000, dollars: 1.8 }
    ];

    const pareto: ParetoPoint[] = [
      { configHash: "c", stage: "B", avgScore: 3.5, p95LatencyMs: 1500, totalTokens: 24000, dollars: 3.0 },
      { configHash: "d", stage: "B", avgScore: 3.1, p95LatencyMs: 900, totalTokens: 21000, dollars: 1.8 }
    ];

    const s = summarizeOptimizeResults({ results, pareto });
    expect(s.configCount).toBe(4);
    expect(s.stageACount).toBe(2);
    expect(s.stageBCount).toBe(3);

    expect(s.bestByScore?.configHash).toBe("c");
    expect(s.bestByLatency?.configHash).toBe("d");
    expect(s.bestByDollars?.configHash).toBe("d");
  });
});

