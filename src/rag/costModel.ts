import fs from "node:fs";

import type { RagTiming } from "./types.js";

export type CostNodeStats = {
  count: number;
  avgMs: number;
};

export type CostModel = {
  version: 1;
  updatedAt: string;
  nodes: Record<string, CostNodeStats>;
};

export function loadCostModel(filePath: string): CostModel {
  if (!fs.existsSync(filePath)) {
    return { version: 1, updatedAt: new Date().toISOString(), nodes: {} };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as CostModel;
  if (!raw || raw.version !== 1) {
    return { version: 1, updatedAt: new Date().toISOString(), nodes: {} };
  }
  return raw;
}

export function saveCostModel(filePath: string, model: CostModel): void {
  fs.writeFileSync(filePath, JSON.stringify(model, null, 2));
}

export function updateCostModel(model: CostModel, timings: RagTiming[]): CostModel {
  const next: CostModel = {
    ...model,
    updatedAt: new Date().toISOString(),
    nodes: { ...model.nodes }
  };

  for (const t of timings) {
    const prev = next.nodes[t.label] ?? { count: 0, avgMs: 0 };
    const count = prev.count + 1;
    const avgMs = prev.avgMs + (t.ms - prev.avgMs) / count;
    next.nodes[t.label] = { count, avgMs };
  }

  return next;
}

