import fs from "node:fs";

import type { Usage } from "../providers/types.js";

export type PricingTable = Record<string, { promptPer1M: number; completionPer1M: number }>;

export function loadPricingTable(filePath: string): PricingTable {
  if (!fs.existsSync(filePath)) return {};
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as PricingTable;
  return raw && typeof raw === "object" ? raw : {};
}

export function estimateDollars(input: { pricing: PricingTable; provider: string; model: string; usage?: Usage }): number | undefined {
  if (!input.usage) return undefined;
  const key1 = `${input.provider}:${input.model}`;
  const price = input.pricing[key1] ?? input.pricing[input.model];
  if (!price) return undefined;
  const prompt = input.usage.promptTokens ?? 0;
  const completion = input.usage.completionTokens ?? 0;
  return (prompt * price.promptPer1M + completion * price.completionPer1M) / 1_000_000;
}

