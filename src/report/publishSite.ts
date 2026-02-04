import fs from "node:fs";
import path from "node:path";

import type { EvalResult } from "../eval/types.js";
import { ensureDir } from "../util/fs.js";
import type { ParetoPoint } from "../rag/pareto.js";
import { loadRunArtifacts, type LoadedRun } from "./loadArtifacts.js";
import {
  getReportCss,
  renderEvalIndexHtml,
  renderEvalQuestionHtml,
  renderExperimentsIndexHtml,
  renderOptimizeConfigHtml,
  renderOptimizeIndexHtml,
  type ArtifactLink
} from "./renderHtml.js";
import { summarizeEvalResults, toEvalQuestionMetrics } from "./summarizeEval.js";
import { summarizeOptimizeResults } from "./summarizeOptimize.js";
import type {
  EvalQuestionMetrics,
  EvalRunSummary,
  OptimizeResultLine,
  OptimizeRunSummary,
  PublishedRunIndexItem,
  RunType
} from "./types.js";

export type WriteReportOptions = {
  runDir: string;
  outDir: string;
  runId: string;
  title: string;
  copyArtifacts: boolean;
};

export async function writeRunReport(opts: WriteReportOptions): Promise<{
  runType: RunType;
  outDir: string;
  summary: EvalRunSummary | OptimizeRunSummary;
}> {
  const loaded = await loadRunArtifacts(opts.runDir);
  ensureDir(opts.outDir);
  ensureDir(path.join(opts.outDir, "assets"));
  fs.writeFileSync(path.join(opts.outDir, "assets", "style.css"), getReportCss(), "utf8");

  const artifactBaseHref = opts.copyArtifacts ? "artifacts" : toPosixPath(path.relative(opts.outDir, loaded.runDir) || ".");

  const artifacts = buildArtifactsLinks(loaded, artifactBaseHref);
  const nestedArtifacts = artifacts.map((a) => ({ ...a, href: nestHref(a.href) }));
  if (opts.copyArtifacts) {
    copyArtifactsIntoReport(loaded, opts.outDir);
  }

  if (loaded.runType === "eval") {
    const summary = summarizeEvalResults(loaded.results);
    const questions = buildEvalQuestionPages({
      outDir: opts.outDir,
      runId: opts.runId,
      title: opts.title,
      results: loaded.results,
      artifactLinks: nestedArtifacts,
      artifactBaseHref
    });

    const indexHtml = renderEvalIndexHtml({
      title: opts.title,
      runId: opts.runId,
      summary,
      questions,
      artifacts,
      manifest: loaded.manifest,
      config: loaded.config
    });
    fs.writeFileSync(path.join(opts.outDir, "index.html"), indexHtml, "utf8");
    return { runType: "eval", outDir: opts.outDir, summary };
  }

  const summary = summarizeOptimizeResults({ results: loaded.results, pareto: loaded.pareto });
  ensureDir(path.join(opts.outDir, "config"));

  const indexHtml = renderOptimizeIndexHtml({
    title: opts.title,
    runId: opts.runId,
    summary,
    results: loaded.results,
    artifacts,
    manifest: loaded.manifest
  });
  fs.writeFileSync(path.join(opts.outDir, "index.html"), indexHtml, "utf8");

  writeOptimizeConfigPages({
    outDir: opts.outDir,
    runId: opts.runId,
    title: opts.title,
    configsByHash: loaded.configsByHash,
    ragIrByHash: loaded.ragIrByHash,
    results: loaded.results,
    artifactLinks: nestedArtifacts,
    pareto: loaded.pareto
  });

  return { runType: "optimize", outDir: opts.outDir, summary };
}

export async function publishRunToSite(opts: {
  runDir: string;
  siteDir?: string;
  runId: string;
  title: string;
}): Promise<{ outDir: string; indexPath: string }> {
  const siteDir = opts.siteDir ?? "docs/experiments";
  ensureDir(siteDir);
  ensureDir(path.join(siteDir, "assets"));
  fs.writeFileSync(path.join(siteDir, "assets", "style.css"), getReportCss(), "utf8");

  const outDir = path.join(siteDir, opts.runId);
  const res = await writeRunReport({
    runDir: opts.runDir,
    outDir,
    runId: opts.runId,
    title: opts.title,
    copyArtifacts: true
  });

  const loaded = await loadRunArtifacts(opts.runDir);
  const createdAt = loaded.manifest?.createdAt;
  const runJson: PublishedRunIndexItem = {
    runId: opts.runId,
    runType: res.runType,
    title: opts.title,
    createdAt,
    summary: res.summary
  };
  fs.writeFileSync(path.join(outDir, "run.json"), JSON.stringify(runJson, null, 2), "utf8");

  const indexPath = path.join(siteDir, "index.html");
  const runs = loadPublishedRuns(siteDir);
  const indexHtml = renderExperimentsIndexHtml({ title: "mem-rag experiments", runs });
  fs.writeFileSync(indexPath, indexHtml, "utf8");

  return { outDir, indexPath };
}

export function deriveRunId(runDir: string): { runId: string; runType?: RunType } {
  const normalized = runDir.replaceAll("\\", "/").replace(/\/+$/, "");
  const m = normalized.match(/(?:^|\/)runs\/([^/]+)\/(eval|optimize)$/);
  if (m) return { runId: `${m[1]}-${m[2]}`, runType: m[2] as RunType };

  const base = path.basename(path.dirname(runDir));
  const type = path.basename(runDir);
  const raw = `${base}-${type}`;
  return { runId: slugify(raw), runType: type === "eval" || type === "optimize" ? (type as RunType) : undefined };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function toPosixPath(p: string): string {
  return p.replaceAll("\\", "/");
}

function buildArtifactsLinks(loaded: LoadedRun, baseHref: string): ArtifactLink[] {
  const exists = (name: string) => fs.existsSync(path.join(loaded.runDir, name));
  const rel = (name: string) => encodeURI(`${baseHref}/${name}`);

  const links: ArtifactLink[] = [];
  if (loaded.runType === "eval") {
    for (const f of ["results.jsonl", "config.json", "rag_ir.json", "manifest.json"]) {
      if (exists(f)) links.push({ label: f, href: rel(f) });
    }
    if (exists("cost_model.json")) links.push({ label: "cost_model.json", href: rel("cost_model.json") });
    return links;
  }

  for (const f of ["pareto.json", "results.jsonl", "configs.jsonl", "rag_ir.jsonl", "manifest.json"]) {
    if (exists(f)) links.push({ label: f, href: rel(f) });
  }
  if (exists("cost_model.json")) links.push({ label: "cost_model.json", href: rel("cost_model.json") });
  return links;
}

function copyArtifactsIntoReport(loaded: LoadedRun, outDir: string): void {
  const artifactsDir = path.join(outDir, "artifacts");
  ensureDir(artifactsDir);

  const files =
    loaded.runType === "eval"
      ? ["config.json", "rag_ir.json", "results.jsonl", "cost_model.json", "manifest.json"]
      : ["configs.jsonl", "rag_ir.jsonl", "results.jsonl", "pareto.json", "cost_model.json", "manifest.json"];

  for (const f of files) {
    const src = path.join(loaded.runDir, f);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(artifactsDir, f));
  }
}

function buildEvalQuestionPages(input: {
  outDir: string;
  runId: string;
  title: string;
  results: EvalResult[];
  artifactLinks: ArtifactLink[];
  artifactBaseHref: string;
}): { id: string; href: string; metrics: EvalQuestionMetrics }[] {
  const qDir = path.join(input.outDir, "q");
  ensureDir(qDir);

  const questions = input.results.map((r) => toEvalQuestionMetrics(r));
  return questions.map((m) => {
    const file = `${safePathSegment(m.id)}.html`;
    const href = `q/${encodeURIComponent(file)}`;
    const html = renderEvalQuestionHtml({
      title: `${input.title} · ${m.id}`,
      runId: input.runId,
      questionId: m.id,
      metrics: m,
      artifacts: input.artifactLinks,
      backHref: "../index.html"
    });
    fs.writeFileSync(path.join(qDir, file), html, "utf8");
    return { id: m.id, href, metrics: m };
  });
}

function writeOptimizeConfigPages(input: {
  outDir: string;
  runId: string;
  title: string;
  configsByHash: Map<string, unknown>;
  ragIrByHash: Map<string, unknown>;
  results: OptimizeResultLine[];
  artifactLinks: ArtifactLink[];
  pareto: ParetoPoint[];
}): void {
  const configDir = path.join(input.outDir, "config");
  ensureDir(configDir);

  const allHashes = new Set<string>([
    ...input.configsByHash.keys(),
    ...input.ragIrByHash.keys(),
    ...input.results.map((r) => r.configHash),
    ...input.pareto.map((p) => p.configHash)
  ]);

  for (const configHash of allHashes) {
    const summaries = input.results.filter((r) => r.configHash === configHash);
    const html = renderOptimizeConfigHtml({
      title: `${input.title} · ${configHash.slice(0, 10)}…`,
      runId: input.runId,
      configHash,
      summaries,
      config: input.configsByHash.get(configHash),
      ragIr: input.ragIrByHash.get(configHash),
      artifacts: input.artifactLinks,
      backHref: "../index.html"
    });
    fs.writeFileSync(path.join(configDir, `${configHash}.html`), html, "utf8");
  }
}

function loadPublishedRuns(siteDir: string): PublishedRunIndexItem[] {
  const out: PublishedRunIndexItem[] = [];
  for (const entry of fs.readdirSync(siteDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runJsonPath = path.join(siteDir, entry.name, "run.json");
    if (!fs.existsSync(runJsonPath)) continue;
    try {
      const raw = fs.readFileSync(runJsonPath, "utf8");
      const parsed = JSON.parse(raw) as PublishedRunIndexItem;
      if (parsed?.runId && parsed?.runType && parsed?.title && parsed?.summary) out.push(parsed);
    } catch {
      // ignore bad run.json
    }
  }
  return out;
}

function safePathSegment(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "question";
  const safe = trimmed.replaceAll(/[^a-zA-Z0-9._-]+/g, "-").replaceAll(/-+/g, "-").replaceAll(/^-|-$/g, "");
  return safe || "question";
}

function nestHref(href: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href)) return href;
  if (href.startsWith("/")) return href;
  return `../${href}`;
}
