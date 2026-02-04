export type ParetoPoint = {
  configHash: string;
  stage: "A" | "B";
  avgScore: number;
  p95LatencyMs: number;
  totalTokens: number;
  dollars: number;
};

export function paretoFront(points: ParetoPoint[]): ParetoPoint[] {
  const out: ParetoPoint[] = [];
  for (const p of points) {
    let dominated = false;
    for (const q of points) {
      if (p === q) continue;
      if (dominates(q, p)) {
        dominated = true;
        break;
      }
    }
    if (!dominated) out.push(p);
  }
  return out.sort((a, b) => b.avgScore - a.avgScore);
}

function dominates(a: ParetoPoint, b: ParetoPoint): boolean {
  const noWorse =
    a.avgScore >= b.avgScore &&
    a.p95LatencyMs <= b.p95LatencyMs &&
    a.dollars <= b.dollars &&
    a.totalTokens <= b.totalTokens;
  const strictlyBetter =
    a.avgScore > b.avgScore ||
    a.p95LatencyMs < b.p95LatencyMs ||
    a.dollars < b.dollars ||
    a.totalTokens < b.totalTokens;
  return noWorse && strictlyBetter;
}
