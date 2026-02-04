import { describe, expect, test } from "vitest";

import type { ParetoPoint } from "../src/rag/pareto.js";
import { renderEvalIndexHtml, renderEvalQuestionHtml, renderOptimizeIndexHtml } from "../src/report/renderHtml.js";
import type { EvalQuestionMetrics, EvalRunSummary, OptimizeRunSummary } from "../src/report/types.js";

describe("report HTML rendering", () => {
  test("renders eval index + detail pages with a11y landmarks and artifact links", () => {
    const summary: EvalRunSummary = {
      runType: "eval",
      n: 1,
      avgWeightedScore: 3.9,
      p95LatencyMs: 123,
      totalTokens: 1000,
      totalDollars: 0.01
    };

    const metrics: EvalQuestionMetrics = {
      id: "q1",
      question: "Q?",
      answer: "A",
      totalLatencyMs: 123,
      timingsMs: { generate: 123 },
      retrievedSources: []
    };

    const indexHtml = renderEvalIndexHtml({
      title: "mem-rag 1-eval",
      runId: "1-eval",
      summary,
      questions: [{ id: "q1", href: "q/q1.html", metrics }],
      artifacts: [{ label: "results.jsonl", href: "artifacts/results.jsonl" }]
    });

    expect(indexHtml).toContain('href="#main">Skip to content');
    expect(indexHtml).toContain('<main id="main">');
    expect(indexHtml).toContain('href="./assets/style.css"');
    expect(indexHtml).toContain("artifacts/results.jsonl");
    expect(indexHtml).toContain('href="q/q1.html"');

    const qHtml = renderEvalQuestionHtml({
      title: "mem-rag 1-eval · q1",
      runId: "1-eval",
      questionId: "q1",
      metrics,
      artifacts: [{ label: "results.jsonl", href: "../artifacts/results.jsonl" }],
      backHref: "../index.html"
    });
    expect(qHtml).toContain('href="../assets/style.css"');
    expect(qHtml).toContain("<main id=\"main\">");
  });

  test("renders optimize index with pareto svg and config links", () => {
    const pareto: ParetoPoint[] = [
      { configHash: "a", stage: "B", avgScore: 3.1, p95LatencyMs: 900, totalTokens: 21000, dollars: 1.8 }
    ];
    const summary: OptimizeRunSummary = {
      runType: "optimize",
      configCount: 1,
      stageACount: 0,
      stageBCount: 1,
      pareto,
      bestByScore: { configHash: "a", stage: "B", avgScore: 3.1, p95LatencyMs: 900, totalTokens: 21000, dollars: 1.8, n: 20 },
      bestByLatency: { configHash: "a", stage: "B", avgScore: 3.1, p95LatencyMs: 900, totalTokens: 21000, dollars: 1.8, n: 20 },
      bestByDollars: { configHash: "a", stage: "B", avgScore: 3.1, p95LatencyMs: 900, totalTokens: 21000, dollars: 1.8, n: 20 }
    };

    const html = renderOptimizeIndexHtml({
      title: "mem-rag 1-optimize",
      runId: "1-optimize",
      summary,
      results: [{ configHash: "a", stage: "B", n: 20, avgScore: 3.1, p95LatencyMs: 900, totalTokens: 21000, dollars: 1.8 }],
      artifacts: [{ label: "pareto.json", href: "artifacts/pareto.json" }]
    });

    expect(html).toContain("<svg");
    expect(html).toContain('href="config/a.html"');
    expect(html).toContain("pareto.json");
  });
});

