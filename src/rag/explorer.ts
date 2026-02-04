import type { RagPipelineConfig } from "./types.js";
import { mulberry32, pickRandom } from "../util/rng.js";
import { stableJsonHash } from "../util/hash.js";

export type ExploreOptions = {
  seed: number;
  minConfigs: number;
  warmup: number;
};

export function enumerateConfigSpace(): RagPipelineConfig[] {
  const chunkSizeTokens = [400, 800, 1200];
  const overlapTokens = [50, 100];
  const topK = [5, 10, 20];
  const rewrite = [false, true];
  const rerank = [false, true];
  const contextBudgetTokens = [3000, 6000, 12000];
  const memoryBlend: RagPipelineConfig["memoryBlend"][] = ["docs_only", "docs+semantic"];

  const out: RagPipelineConfig[] = [];
  for (const cs of chunkSizeTokens) {
    for (const ov of overlapTokens) {
      for (const k of topK) {
        for (const rw of rewrite) {
          for (const rr of rerank) {
            for (const cb of contextBudgetTokens) {
              for (const mb of memoryBlend) {
                out.push({
                  chunkSizeTokens: cs,
                  overlapTokens: ov,
                  topK: k,
                  rewrite: rw,
                  rerank: rr,
                  contextBudgetTokens: cb,
                  memoryBlend: mb
                });
              }
            }
          }
        }
      }
    }
  }
  return out;
}

export function sampleConfigs(all: RagPipelineConfig[], opts: ExploreOptions): RagPipelineConfig[] {
  const rng = mulberry32(opts.seed);
  const chosen: RagPipelineConfig[] = [];
  const seen = new Set<string>();

  const takeUnique = () => {
    for (let attempts = 0; attempts < 1000; attempts++) {
      const c = pickRandom(rng, all);
      const h = stableJsonHash(c);
      if (seen.has(h)) continue;
      seen.add(h);
      chosen.push(c);
      return;
    }
    throw new Error("Failed to sample unique configs; config space too small?");
  };

  const total = Math.max(opts.minConfigs, opts.warmup);
  for (let i = 0; i < total; i++) takeUnique();
  return chosen;
}

