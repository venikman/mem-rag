import fs from "node:fs";
import path from "node:path";

import type { EvalResult } from "../eval/types.js";
import type { ParetoPoint } from "../rag/pareto.js";
import { readJsonl } from "../util/jsonl.js";
import type { OptimizeResultLine, RunManifest, RunType } from "./types.js";

export type LoadedEvalRun = {
  runType: "eval";
  runDir: string;
  config: unknown;
  ragIr: unknown;
  results: EvalResult[];
  costModel?: unknown;
  manifest?: RunManifest;
};

export type LoadedOptimizeRun = {
  runType: "optimize";
  runDir: string;
  configsByHash: Map<string, unknown>;
  ragIrByHash: Map<string, unknown>;
  results: OptimizeResultLine[];
  pareto: ParetoPoint[];
  costModel?: unknown;
  manifest?: RunManifest;
};

export type LoadedRun = LoadedEvalRun | LoadedOptimizeRun;

export async function loadRunArtifacts(runDir: string): Promise<LoadedRun> {
  const absRunDir = path.resolve(runDir);

  const evalConfigPath = path.join(absRunDir, "config.json");
  const evalRagIrPath = path.join(absRunDir, "rag_ir.json");
  const evalResultsPath = path.join(absRunDir, "results.jsonl");

  const optConfigsPath = path.join(absRunDir, "configs.jsonl");
  const optRagIrPath = path.join(absRunDir, "rag_ir.jsonl");
  const optResultsPath = path.join(absRunDir, "results.jsonl");
  const optParetoPath = path.join(absRunDir, "pareto.json");

  const costModelPath = path.join(absRunDir, "cost_model.json");
  const manifestPath = path.join(absRunDir, "manifest.json");

  const runType = detectRunType({
    evalConfigPath,
    evalRagIrPath,
    evalResultsPath,
    optConfigsPath,
    optRagIrPath,
    optResultsPath,
    optParetoPath
  });

  const costModel = fs.existsSync(costModelPath) ? readJson(costModelPath) : undefined;
  const manifest = fs.existsSync(manifestPath) ? (readJson(manifestPath) as RunManifest) : undefined;

  if (runType === "eval") {
    return {
      runType: "eval",
      runDir: absRunDir,
      config: readJson(evalConfigPath),
      ragIr: readJson(evalRagIrPath),
      results: await readJsonlArray<EvalResult>(evalResultsPath),
      costModel,
      manifest
    };
  }

  const configsByHash = new Map<string, unknown>();
  for await (const line of readJsonl<{ configHash: string; config: unknown }>(optConfigsPath)) {
    if (line?.configHash) configsByHash.set(line.configHash, line.config);
  }

  const ragIrByHash = new Map<string, unknown>();
  for await (const line of readJsonl<{ configHash: string; ragIr: unknown }>(optRagIrPath)) {
    if (line?.configHash) ragIrByHash.set(line.configHash, line.ragIr);
  }

  return {
    runType: "optimize",
    runDir: absRunDir,
    configsByHash,
    ragIrByHash,
    results: await readJsonlArray<OptimizeResultLine>(optResultsPath),
    pareto: readJson(optParetoPath) as ParetoPoint[],
    costModel,
    manifest
  };
}

function detectRunType(paths: {
  evalConfigPath: string;
  evalRagIrPath: string;
  evalResultsPath: string;
  optConfigsPath: string;
  optRagIrPath: string;
  optResultsPath: string;
  optParetoPath: string;
}): RunType {
  const isEval =
    fs.existsSync(paths.evalConfigPath) &&
    fs.existsSync(paths.evalRagIrPath) &&
    fs.existsSync(paths.evalResultsPath);
  const isOptimize =
    fs.existsSync(paths.optConfigsPath) &&
    fs.existsSync(paths.optRagIrPath) &&
    fs.existsSync(paths.optResultsPath) &&
    fs.existsSync(paths.optParetoPath);

  if (isEval && !isOptimize) return "eval";
  if (isOptimize && !isEval) return "optimize";
  if (isEval) return "eval";
  if (isOptimize) return "optimize";
  throw new Error(`Could not detect run type for directory: ${path.dirname(paths.evalConfigPath)}`);
}

function readJson(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as unknown;
}

async function readJsonlArray<T>(filePath: string): Promise<T[]> {
  const out: T[] = [];
  for await (const line of readJsonl<T>(filePath)) out.push(line);
  return out;
}

