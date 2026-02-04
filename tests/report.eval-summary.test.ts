import { describe, expect, test } from "vitest";

import type { EvalResult } from "../src/eval/types.js";
import { summarizeEvalResults } from "../src/report/summarizeEval.js";

describe("summarizeEvalResults", () => {
  test("computes averages/percentiles and tolerates missing fields", () => {
    const results: EvalResult[] = [
      {
        id: "q1",
        question: "What is the answer?",
        answer: "Answer 1",
        configHash: "h",
        timingsMs: { retrieve: 50, generate: 100 },
        usage: { totalTokens: 1000 },
        dollars: 0.01,
        judgeUsage: { totalTokens: 100 },
        judgeDollars: 0.002,
        judge: { correctness: 5, groundedness: 4, memoryUse: 2, clarity: 3 },
        weightedScore: 4.0,
        recallAtK: 1,
        retrievedSources: [],
        rewrittenQuery: "rewritten",
        memoryWrite: { proposed: 1, stored: 1, skippedLowScore: 0, superseded: 0 }
      },
      {
        id: "q2",
        question: "Another question",
        answer: "Answer 2",
        configHash: "h",
        timingsMs: { retrieve: 80, generate: 120 },
        usage: { totalTokens: 2000 },
        dollars: 0.02,
        judgeUsage: { totalTokens: 200 },
        judgeDollars: 0.003,
        judge: { correctness: 4, groundedness: 4, memoryUse: 1, clarity: 4 },
        weightedScore: 3.6,
        recallAtK: 0,
        retrievedSources: []
      },
      {
        id: "q3",
        question: "Missing judge",
        answer: "Answer 3",
        configHash: "h",
        timingsMs: { generate: 50 },
        retrievedSources: []
      }
    ];

    const s = summarizeEvalResults(results);
    expect(s.n).toBe(3);

    // p95 is max with current percentile impl (ceil(p*n)-1)
    expect(s.p50LatencyMs).toBe(150);
    expect(s.p95LatencyMs).toBe(200);

    // avgWeightedScore averages only defined scores (q1, q2)
    expect(s.avgWeightedScore).toBeCloseTo((4.0 + 3.6) / 2, 6);

    // totals/averages only consider questions that have token/$ data
    expect(s.totalTokens).toBe(3300);
    expect(s.avgTokens).toBe(1650);
    expect(s.totalDollars).toBeCloseTo(0.035, 10);
    expect(s.avgDollars).toBeCloseTo(0.0175, 10);

    // recall only across defined recallAtK values (q1, q2)
    expect(s.recallAtKRate).toBeCloseTo(0.5, 10);
  });
});

