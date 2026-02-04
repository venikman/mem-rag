import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import { ensureParentDir } from "../util/fs.js";
import { sha256Hex } from "../util/hash.js";
import type { RunManifest, RunType } from "./types.js";

export function getAppVersion(cwd: string = process.cwd()): string | undefined {
  try {
    const pkgPath = path.join(cwd, "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

export function getGitCommit(cwd: string = process.cwd()): string | undefined {
  try {
    const out = execSync("git rev-parse HEAD", { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf8")
      .trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

export function sha256FileHex(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return sha256Hex(buf);
}

export function writeRunManifest(outDir: string, manifest: RunManifest): void {
  const p = path.join(outDir, "manifest.json");
  ensureParentDir(p);
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2));
}

export function buildRunManifest(input: {
  runType: RunType;
  createdAt?: string;
  embedModel: string;
  chatModel: string;
  judgeModel: string;
  supportProvider: "lmstudio" | "openrouter";
  supportModel: string;
  questionsPath: string;
  commandLine?: string[];
  optimize?: RunManifest["optimize"];
  cwd?: string;
}): RunManifest {
  const cwd = input.cwd ?? process.cwd();
  return {
    runType: input.runType,
    createdAt: input.createdAt ?? new Date().toISOString(),
    appVersion: getAppVersion(cwd),
    gitCommit: getGitCommit(cwd),
    nodeVersion: process.version,
    models: {
      embedModel: input.embedModel,
      chatModel: input.chatModel,
      judgeModel: input.judgeModel,
      supportProvider: input.supportProvider,
      supportModel: input.supportModel
    },
    questions: { path: input.questionsPath, sha256: sha256FileHex(input.questionsPath) },
    commandLine: input.commandLine ?? process.argv,
    optimize: input.optimize
  };
}

