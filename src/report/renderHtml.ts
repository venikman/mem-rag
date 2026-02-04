import type { ParetoPoint } from "../rag/pareto.js";
import type {
  EvalQuestionMetrics,
  EvalRunSummary,
  OptimizeResultLine,
  OptimizeRunSummary,
  PublishedRunIndexItem,
  RunManifest
} from "./types.js";

export type ArtifactLink = { label: string; href: string };

export function getReportCss(): string {
  return `
:root{
  --bg:#0b0d10;
  --panel:#11151b;
  --panel2:#0e1217;
  --text:#e6edf3;
  --muted:#9aa7b4;
  --border:#243041;
  --accent:#6ee7ff;
  --accent2:#a78bfa;
  --danger:#ff6b6b;
  --ok:#63e6be;
  --shadow: 0 8px 30px rgba(0,0,0,.35);
  --radius:12px;
  --max: 1100px;
  color-scheme: dark;
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  background: radial-gradient(1200px 700px at 20% -10%, rgba(110,231,255,.12), transparent 60%),
              radial-gradient(900px 600px at 90% 0%, rgba(167,139,250,.10), transparent 55%),
              var(--bg);
  color:var(--text);
  font: 16px/1.55 system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
}
a{color:var(--accent); text-decoration:underline; text-underline-offset:.18em}
a:hover{color:#bff3ff}
a:visited{color:#a7c6ff}
.skip-link{
  position:absolute;
  left:-999px;
  top:0;
  background:var(--accent);
  color:#001018;
  padding:10px 12px;
  border-radius:10px;
  font-weight:700;
  z-index:999;
}
.skip-link:focus{left:12px; top:12px}
:focus-visible{
  outline: 3px solid var(--accent2);
  outline-offset: 3px;
  border-radius: 6px;
}
header{
  position:sticky;
  top:0;
  backdrop-filter: blur(10px);
  background: rgba(11,13,16,.72);
  border-bottom:1px solid rgba(36,48,65,.8);
  z-index:10;
}
.wrap{max-width:var(--max); margin:0 auto; padding: 18px 16px}
.hdr{
  display:flex;
  gap:16px;
  align-items:baseline;
  justify-content:space-between;
  flex-wrap:wrap;
}
.brand{display:flex; flex-direction:column; gap:2px}
.brand strong{font-size:18px; letter-spacing:.2px}
.brand span{color:var(--muted); font-size:13px}
nav a{margin-right:14px; white-space:nowrap}
main{max-width:var(--max); margin:0 auto; padding: 22px 16px 48px}
h1{font-size:28px; margin:0 0 10px}
h2{font-size:18px; margin: 26px 0 10px}
h3{font-size:16px; margin: 18px 0 8px}
.muted{color:var(--muted)}
.grid{
  display:grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 12px;
}
.card{
  grid-column: span 4;
  background: linear-gradient(180deg, rgba(17,21,27,.95), rgba(14,18,23,.95));
  border:1px solid rgba(36,48,65,.9);
  border-radius: var(--radius);
  padding: 14px 14px 12px;
  box-shadow: var(--shadow);
  min-height: 88px;
}
.card .k{color:var(--muted); font-size:12px; letter-spacing:.2px; text-transform:uppercase}
.card .v{font-size:20px; font-weight:800; margin-top:6px}
.card .s{color:var(--muted); font-size:12px; margin-top:6px}
@media (max-width: 900px){ .card{grid-column: span 6} }
@media (max-width: 560px){ .card{grid-column: span 12} }
.panel{
  background: rgba(17,21,27,.72);
  border:1px solid rgba(36,48,65,.85);
  border-radius: var(--radius);
  padding: 14px;
}
details{border:1px solid rgba(36,48,65,.65); border-radius: 10px; padding:10px 12px; background: rgba(14,18,23,.7)}
details summary{cursor:pointer; font-weight:700}
pre{
  margin: 10px 0 0;
  padding: 12px;
  background: rgba(0,0,0,.25);
  border:1px solid rgba(36,48,65,.6);
  border-radius: 10px;
  overflow:auto;
  font-size: 13px;
}
.prewrap{white-space:pre-wrap; word-break:break-word}
table{
  width:100%;
  border-collapse:collapse;
  margin-top: 8px;
  font-size: 14px;
}
th,td{
  border-bottom:1px solid rgba(36,48,65,.75);
  padding: 10px 8px;
  vertical-align:top;
}
th{
  text-align:left;
  color: var(--muted);
  font-weight: 800;
  font-size: 12px;
  text-transform:uppercase;
  letter-spacing:.22px;
}
tbody tr:hover{background: rgba(110,231,255,.06)}
.num{font-variant-numeric: tabular-nums}
.pill{
  display:inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  border:1px solid rgba(36,48,65,.85);
  background: rgba(0,0,0,.25);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: .2px;
}
.pill.a{color: #a7f3d0; border-color: rgba(99,230,190,.35)}
.pill.b{color: #c4b5fd; border-color: rgba(167,139,250,.35)}
footer{max-width:var(--max); margin:0 auto; padding: 18px 16px 42px; color: var(--muted)}
  `.trim();
}

export function renderEvalIndexHtml(input: {
  title: string;
  runId: string;
  summary: EvalRunSummary;
  questions: { id: string; href: string; metrics: EvalQuestionMetrics }[];
  artifacts: ArtifactLink[];
  manifest?: RunManifest;
  config?: unknown;
}): string {
  const cards = [
    card("Questions", String(input.summary.n)),
    card("Avg score", fmtMaybe(input.summary.avgWeightedScore, { digits: 3 })),
    card("p95 latency (ms)", fmtMaybe(input.summary.p95LatencyMs, { digits: 0 }))
  ].join("");

  const rubricCards = [
    card("Avg correctness", fmtMaybe(input.summary.avgCorrectness, { digits: 2 }), "0–5"),
    card("Avg groundedness", fmtMaybe(input.summary.avgGroundedness, { digits: 2 }), "0–5"),
    card("Avg memoryUse", fmtMaybe(input.summary.avgMemoryUse, { digits: 2 }), "0–5"),
    card("Avg clarity", fmtMaybe(input.summary.avgClarity, { digits: 2 }), "0–5")
  ].join("");

  const costCards = [
    card("Total tokens", fmtMaybe(input.summary.totalTokens, { digits: 0 })),
    card("Avg tokens", fmtMaybe(input.summary.avgTokens, { digits: 0 })),
    card("Total $", fmtMaybe(input.summary.totalDollars, { digits: 4 })),
    card("Avg $", fmtMaybe(input.summary.avgDollars, { digits: 4 })),
    card("Recall@K", fmtMaybe(input.summary.recallAtKRate, { digits: 3 }), "fraction of hits")
  ].join("");

  const rows = input.questions
    .map(({ id, href, metrics }) => {
      const judge = metrics.judge;
      return [
        `<td><a href="${escAttr(href)}">${esc(id)}</a></td>`,
        `<td class="num">${fmtMaybe(metrics.weightedScore, { digits: 3 })}</td>`,
        `<td class="num">${fmtMaybe(judge?.correctness, { digits: 0 })}</td>`,
        `<td class="num">${fmtMaybe(judge?.groundedness, { digits: 0 })}</td>`,
        `<td class="num">${fmtMaybe(judge?.memoryUse, { digits: 0 })}</td>`,
        `<td class="num">${fmtMaybe(judge?.clarity, { digits: 0 })}</td>`,
        `<td class="num">${fmtMaybe(metrics.totalLatencyMs, { digits: 0 })}</td>`,
        `<td class="num">${fmtMaybe(metrics.totalTokens, { digits: 0 })}</td>`,
        `<td class="num">${fmtMaybe(metrics.totalDollars, { digits: 4 })}</td>`,
        `<td class="num">${fmtMaybe(metrics.recallAtK, { digits: 0 })}</td>`
      ].join("");
    })
    .map((cells) => `<tr>${cells}</tr>`)
    .join("");

  const artifactsList = renderArtifacts(input.artifacts);
  const manifestBlock = input.manifest
    ? `<details><summary>manifest.json</summary><pre>${esc(JSON.stringify(input.manifest, null, 2))}</pre></details>`
    : "";
  const configBlock = input.config
    ? `<details><summary>config.json</summary><pre>${esc(JSON.stringify(input.config, null, 2))}</pre></details>`
    : "";

  const content = `
    <h1>${esc(input.title)}</h1>
    <p class="muted">Run: <span class="num">${esc(input.runId)}</span> · Type: <span class="pill a">eval</span></p>

    <section class="grid" aria-label="Summary">
      ${cards}
    </section>

    <h2>Rubric</h2>
    <section class="grid" aria-label="Rubric summary">
      ${rubricCards}
    </section>

    <h2>Cost & recall</h2>
    <section class="grid" aria-label="Cost and recall summary">
      ${costCards}
    </section>

    <h2>Questions</h2>
    <div class="panel" role="region" aria-label="Per-question metrics">
      <table>
        <thead>
          <tr>
            <th scope="col">id</th>
            <th scope="col">weighted</th>
            <th scope="col">correct</th>
            <th scope="col">ground</th>
            <th scope="col">memory</th>
            <th scope="col">clarity</th>
            <th scope="col">latency</th>
            <th scope="col">tokens</th>
            <th scope="col">$</th>
            <th scope="col">recall</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="10" class="muted">No results found.</td></tr>`}
        </tbody>
      </table>
    </div>

    <h2>Artifacts</h2>
    ${artifactsList}
    ${manifestBlock}
    ${configBlock}
  `.trim();

  return pageShell({
    docTitle: input.title,
    brandTitle: "mem-rag experiments",
    brandSubtitle: "Agentic memory RAG evaluation",
    homeHref: "./index.html",
    pageNav: [],
    content
  });
}

export function renderEvalQuestionHtml(input: {
  title: string;
  runId: string;
  questionId: string;
  metrics: EvalQuestionMetrics;
  artifacts: ArtifactLink[];
  backHref: string;
}): string {
  const judge = input.metrics.judge;
  const judgeTable = judge
    ? `
      <table>
        <thead><tr><th scope="col">metric</th><th scope="col">score</th></tr></thead>
        <tbody>
          ${row2("correctness", String(judge.correctness))}
          ${row2("groundedness", String(judge.groundedness))}
          ${row2("memoryUse", String(judge.memoryUse))}
          ${row2("clarity", String(judge.clarity))}
        </tbody>
      </table>
      ${judge.notes ? `<p class="muted"><strong>Notes:</strong> ${esc(judge.notes)}</p>` : ""}
    `
    : `<p class="muted">No judge scores available.</p>`;

  const timingsRows = Object.entries(input.metrics.timingsMs ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmtMaybe(v, { digits: 0 })}</td></tr>`)
    .join("");

  const sourcesRows = (input.metrics.retrievedSources ?? [])
    .map((s) => `<li><span class="num">[${esc(s.citation)}]</span> ${esc(s.documentPath)} <span class="muted">chunk</span> <span class="num">${esc(String(s.chunkId))}</span></li>`)
    .join("");

  const artifactsList = renderArtifacts(input.artifacts);

  const content = `
    <h1>${esc(input.title)}</h1>
    <p class="muted">
      <a href="${escAttr(input.backHref)}">← Back to run</a>
      · Run: <span class="num">${esc(input.runId)}</span>
      · Question: <span class="num">${esc(input.questionId)}</span>
    </p>

    <h2>Question</h2>
    <div class="panel"><div class="prewrap">${esc(input.metrics.question)}</div></div>

    <h2>Answer</h2>
    <div class="panel"><div class="prewrap">${esc(input.metrics.answer)}</div></div>

    <h2>Scores</h2>
    <div class="panel">
      <p class="muted">
        Weighted: <span class="num">${fmtMaybe(input.metrics.weightedScore, { digits: 3 })}</span>
        · Latency: <span class="num">${fmtMaybe(input.metrics.totalLatencyMs, { digits: 0 })}</span> ms
        · Tokens: <span class="num">${fmtMaybe(input.metrics.totalTokens, { digits: 0 })}</span>
        · $: <span class="num">${fmtMaybe(input.metrics.totalDollars, { digits: 4 })}</span>
      </p>
      ${judgeTable}
    </div>

    <h2>Timings (ms)</h2>
    <div class="panel">
      <table>
        <thead><tr><th scope="col">node</th><th scope="col">ms</th></tr></thead>
        <tbody>
          ${timingsRows || `<tr><td colspan="2" class="muted">No timings found.</td></tr>`}
        </tbody>
      </table>
    </div>

    <h2>Retrieved sources</h2>
    <div class="panel">
      ${sourcesRows ? `<ul>${sourcesRows}</ul>` : `<p class="muted">(none)</p>`}
    </div>

    <h2>Artifacts</h2>
    ${artifactsList}
  `.trim();

  return pageShell({
    docTitle: input.title,
    brandTitle: "mem-rag experiments",
    brandSubtitle: "Agentic memory RAG evaluation",
    homeHref: input.backHref,
    pageNav: [{ href: input.backHref, label: "Run" }],
    content
  });
}

export function renderOptimizeIndexHtml(input: {
  title: string;
  runId: string;
  summary: OptimizeRunSummary;
  results: OptimizeResultLine[];
  artifacts: ArtifactLink[];
  manifest?: RunManifest;
}): string {
  const cards = [
    card("Configs", String(input.summary.configCount)),
    card("Stage A", String(input.summary.stageACount)),
    card("Stage B", String(input.summary.stageBCount))
  ].join("");

  const picks = [
    bestPickCard("Best score", input.summary.bestByScore),
    bestPickCard("Best latency", input.summary.bestByLatency),
    bestPickCard("Best $", input.summary.bestByDollars)
  ].join("");

  const paretoSvg = input.summary.pareto && input.summary.pareto.length > 0 ? renderParetoSvg(input.summary.pareto) : "";
  const paretoTable = input.summary.pareto && input.summary.pareto.length > 0 ? renderParetoTable(input.summary.pareto) : `<p class="muted">(none)</p>`;

  const rows = input.results
    .map((r) => {
      const stagePill = r.stage === "A" ? `<span class="pill a">A</span>` : `<span class="pill b">B</span>`;
      const href = `config/${escAttr(r.configHash)}.html`;
      const perQTokens = r.n > 0 ? r.totalTokens / r.n : undefined;
      const perQDollars = r.n > 0 ? r.dollars / r.n : undefined;
      return `<tr>
        <td>${stagePill}</td>
        <td><a href="${href}"><span class="num">${esc(r.configHash)}</span></a></td>
        <td class="num">${fmtMaybe(r.avgScore, { digits: 3 })}</td>
        <td class="num">${fmtMaybe(r.p95LatencyMs, { digits: 0 })}</td>
        <td class="num">${fmtMaybe(r.totalTokens, { digits: 0 })}</td>
        <td class="num">${fmtMaybe(r.dollars, { digits: 4 })}</td>
        <td class="num">${fmtMaybe(perQTokens, { digits: 0 })}</td>
        <td class="num">${fmtMaybe(perQDollars, { digits: 4 })}</td>
      </tr>`;
    })
    .join("");

  const artifactsList = renderArtifacts(input.artifacts);
  const manifestBlock = input.manifest
    ? `<details><summary>manifest.json</summary><pre>${esc(JSON.stringify(input.manifest, null, 2))}</pre></details>`
    : "";

  const content = `
    <h1>${esc(input.title)}</h1>
    <p class="muted">Run: <span class="num">${esc(input.runId)}</span> · Type: <span class="pill b">optimize</span></p>

    <section class="grid" aria-label="Summary">
      ${cards}
    </section>

    <h2>Best picks (prefer Stage B)</h2>
    <section class="grid" aria-label="Best picks">
      ${picks}
    </section>

    <h2>Pareto frontier</h2>
    <div class="panel">
      ${paretoSvg}
      <h3>Table</h3>
      ${paretoTable}
    </div>

    <h2>Configs</h2>
    <div class="panel" role="region" aria-label="Per-config summary">
      <table>
        <thead>
          <tr>
            <th scope="col">stage</th>
            <th scope="col">config</th>
            <th scope="col">avgScore</th>
            <th scope="col">p95 ms</th>
            <th scope="col">tokens</th>
            <th scope="col">$</th>
            <th scope="col">tok/q</th>
            <th scope="col">$/q</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" class="muted">No results found.</td></tr>`}
        </tbody>
      </table>
    </div>

    <h2>Artifacts</h2>
    ${artifactsList}
    ${manifestBlock}
  `.trim();

  return pageShell({
    docTitle: input.title,
    brandTitle: "mem-rag experiments",
    brandSubtitle: "Agentic memory RAG optimization",
    homeHref: "./index.html",
    pageNav: [],
    content
  });
}

export function renderOptimizeConfigHtml(input: {
  title: string;
  runId: string;
  configHash: string;
  summaries: OptimizeResultLine[];
  config?: unknown;
  ragIr?: unknown;
  artifacts: ArtifactLink[];
  backHref: string;
}): string {
  const rows = input.summaries
    .map((s) => {
      const stagePill = s.stage === "A" ? `<span class="pill a">A</span>` : `<span class="pill b">B</span>`;
      const perQTokens = s.n > 0 ? s.totalTokens / s.n : undefined;
      const perQDollars = s.n > 0 ? s.dollars / s.n : undefined;
      return `<tr>
        <td>${stagePill}</td>
        <td class="num">${esc(String(s.n))}</td>
        <td class="num">${fmtMaybe(s.avgScore, { digits: 3 })}</td>
        <td class="num">${fmtMaybe(s.p95LatencyMs, { digits: 0 })}</td>
        <td class="num">${fmtMaybe(s.totalTokens, { digits: 0 })}</td>
        <td class="num">${fmtMaybe(s.dollars, { digits: 4 })}</td>
        <td class="num">${fmtMaybe(perQTokens, { digits: 0 })}</td>
        <td class="num">${fmtMaybe(perQDollars, { digits: 4 })}</td>
      </tr>`;
    })
    .join("");

  const content = `
    <h1>${esc(input.title)}</h1>
    <p class="muted">
      <a href="${escAttr(input.backHref)}">← Back to run</a>
      · Run: <span class="num">${esc(input.runId)}</span>
      · Config: <span class="num">${esc(input.configHash)}</span>
    </p>

    <h2>Stage summaries</h2>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th scope="col">stage</th>
            <th scope="col">n</th>
            <th scope="col">avgScore</th>
            <th scope="col">p95 ms</th>
            <th scope="col">tokens</th>
            <th scope="col">$</th>
            <th scope="col">tok/q</th>
            <th scope="col">$/q</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" class="muted">No summaries found.</td></tr>`}
        </tbody>
      </table>
    </div>

    <h2>Config</h2>
    <div class="panel">
      ${input.config ? `<pre>${esc(JSON.stringify(input.config, null, 2))}</pre>` : `<p class="muted">(missing)</p>`}
    </div>

    <h2>RAG-IR</h2>
    <div class="panel">
      ${input.ragIr ? `<pre>${esc(JSON.stringify(input.ragIr, null, 2))}</pre>` : `<p class="muted">(missing)</p>`}
    </div>

    <h2>Artifacts</h2>
    ${renderArtifacts(input.artifacts)}
  `.trim();

  return pageShell({
    docTitle: input.title,
    brandTitle: "mem-rag experiments",
    brandSubtitle: "Agentic memory RAG optimization",
    homeHref: input.backHref,
    pageNav: [{ href: input.backHref, label: "Run" }],
    content
  });
}

export function renderExperimentsIndexHtml(input: { title: string; runs: PublishedRunIndexItem[] }): string {
  const rows = input.runs
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .map((r) => {
      const href = `${escAttr(r.runId)}/index.html`;
      const typePill = r.runType === "eval" ? `<span class="pill a">eval</span>` : `<span class="pill b">optimize</span>`;
      const created = r.createdAt ? `<span class="num">${esc(r.createdAt)}</span>` : `<span class="muted">(unknown)</span>`;
      const summary = r.summary.runType === "eval"
        ? `avgScore=${fmtMaybe(r.summary.avgWeightedScore, { digits: 3 })}, p95=${fmtMaybe(r.summary.p95LatencyMs, { digits: 0 })}ms, n=${r.summary.n}`
        : `configs=${r.summary.configCount}, stageB=${r.summary.stageBCount}`;
      return `<tr>
        <td>${typePill}</td>
        <td><a href="${href}">${esc(r.title)}</a></td>
        <td>${created}</td>
        <td class="muted">${esc(summary)}</td>
      </tr>`;
    })
    .join("");

  const content = `
    <h1>${esc(input.title)}</h1>
    <p class="muted">Static reports generated by <span class="num">mem-rag publish</span>.</p>

    <h2>Runs</h2>
    <div class="panel" role="region" aria-label="Published runs">
      <table>
        <thead>
          <tr>
            <th scope="col">type</th>
            <th scope="col">title</th>
            <th scope="col">created</th>
            <th scope="col">summary</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="4" class="muted">No published runs yet.</td></tr>`}
        </tbody>
      </table>
    </div>
  `.trim();

  return pageShell({
    docTitle: input.title,
    brandTitle: "mem-rag experiments",
    brandSubtitle: "GitHub Pages index",
    homeHref: "./index.html",
    pageNav: [],
    content
  });
}

function pageShell(input: {
  docTitle: string;
  brandTitle: string;
  brandSubtitle: string;
  homeHref: string;
  pageNav: { href: string; label: string }[];
  content: string;
}): string {
  const navLinks = [
    `<a href="${escAttr(input.homeHref)}">Home</a>`,
    ...input.pageNav.map((l) => `<a href="${escAttr(l.href)}">${esc(l.label)}</a>`)
  ].join("");
  const nav = `<nav aria-label="Page">${navLinks}</nav>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(input.docTitle)}</title>
    <link rel="stylesheet" href="${escAttr(resolveCssHref(input.homeHref))}" />
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header>
      <div class="wrap hdr">
        <div class="brand">
          <strong>${esc(input.brandTitle)}</strong>
          <span>${esc(input.brandSubtitle)}</span>
        </div>
        ${nav}
      </div>
    </header>
    <main id="main">
      ${input.content}
    </main>
    <footer>
      Generated report · Accessible HTML · No external dependencies
    </footer>
  </body>
</html>`;
}

function card(key: string, value: string, sub?: string): string {
  return `<div class="card"><div class="k">${esc(key)}</div><div class="v num">${esc(value)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</div>`;
}

function bestPickCard(label: string, pick: OptimizeRunSummary["bestByScore"]): string {
  if (!pick) return `<div class="card"><div class="k">${esc(label)}</div><div class="v">N/A</div><div class="s">No candidates</div></div>`;
  const href = `config/${escAttr(pick.configHash)}.html`;
  const stagePill = pick.stage === "A" ? `<span class="pill a">A</span>` : `<span class="pill b">B</span>`;
  return `<div class="card">
    <div class="k">${esc(label)}</div>
    <div class="v"><a href="${href}">${stagePill} <span class="num">${esc(pick.configHash.slice(0, 10))}</span>…</a></div>
    <div class="s">avg=${fmtMaybe(pick.avgScore, { digits: 3 })} · p95=${fmtMaybe(pick.p95LatencyMs, { digits: 0 })}ms · $=${fmtMaybe(pick.dollars, { digits: 4 })}</div>
  </div>`;
}

function renderArtifacts(artifacts: ArtifactLink[]): string {
  if (artifacts.length === 0) return `<p class="muted">(none)</p>`;
  return `<ul>${artifacts.map((a) => `<li><a href="${escAttr(a.href)}">${esc(a.label)}</a></li>`).join("")}</ul>`;
}

function renderParetoTable(points: ParetoPoint[]): string {
  const rows = points
    .map((p) => {
      const stagePill = p.stage === "A" ? `<span class="pill a">A</span>` : `<span class="pill b">B</span>`;
      const href = `config/${escAttr(p.configHash)}.html`;
      return `<tr>
        <td>${stagePill}</td>
        <td><a href="${href}"><span class="num">${esc(p.configHash)}</span></a></td>
        <td class="num">${fmtMaybe(p.avgScore, { digits: 3 })}</td>
        <td class="num">${fmtMaybe(p.p95LatencyMs, { digits: 0 })}</td>
        <td class="num">${fmtMaybe(p.totalTokens, { digits: 0 })}</td>
        <td class="num">${fmtMaybe(p.dollars, { digits: 4 })}</td>
      </tr>`;
    })
    .join("");

  return `<table>
    <thead><tr>
      <th scope="col">stage</th>
      <th scope="col">config</th>
      <th scope="col">avgScore</th>
      <th scope="col">p95 ms</th>
      <th scope="col">tokens</th>
      <th scope="col">$</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderParetoSvg(points: ParetoPoint[]): string {
  const w = 860;
  const h = 340;
  const padL = 54;
  const padR = 18;
  const padT = 18;
  const padB = 44;

  const xs = points.map((p) => p.p95LatencyMs);
  const ys = points.map((p) => p.avgScore);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;

  const x = (v: number) => padL + ((v - minX) / xSpan) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - minY) / ySpan) * (h - padT - padB);

  const dots = points
    .map((p) => {
      const cx = x(p.p95LatencyMs);
      const cy = y(p.avgScore);
      const fill = p.stage === "A" ? "#63e6be" : "#a78bfa";
      const stroke = "rgba(255,255,255,.25)";
      const title = `${p.stage} ${p.configHash.slice(0, 8)}… score=${p.avgScore.toFixed(3)} p95=${Math.round(p.p95LatencyMs)}ms`;
      return `<a href="config/${escAttr(p.configHash)}.html" tabindex="0" aria-label="${escAttr(title)}">
        <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="5.5" fill="${fill}" stroke="${stroke}" stroke-width="1">
          <title>${esc(title)}</title>
        </circle>
      </a>`;
    })
    .join("");

  const axis = `
    <line x1="${padL}" y1="${h - padB}" x2="${w - padR}" y2="${h - padB}" stroke="rgba(255,255,255,.25)" />
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${h - padB}" stroke="rgba(255,255,255,.25)" />
    <text x="${padL}" y="${h - 16}" fill="rgba(255,255,255,.65)" font-size="12">p95 latency (ms)</text>
    <text x="12" y="${padT + 10}" fill="rgba(255,255,255,.65)" font-size="12" transform="rotate(-90 12 ${padT + 10})">avg score</text>
    <text x="${padL}" y="${h - padB + 18}" fill="rgba(255,255,255,.55)" font-size="11">${esc(String(Math.round(minX)))} → ${esc(String(Math.round(maxX)))}</text>
    <text x="${padL + 6}" y="${padT + 14}" fill="rgba(255,255,255,.55)" font-size="11">${esc(minY.toFixed(2))} → ${esc(maxY.toFixed(2))}</text>
  `;

  return `
  <svg width="100%" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="paretoTitle paretoDesc" xmlns="http://www.w3.org/2000/svg">
    <title id="paretoTitle">Pareto frontier scatter</title>
    <desc id="paretoDesc">Each point is a non-dominated config. X is p95 latency. Y is avg score. Click a point to open the config page.</desc>
    <rect x="0" y="0" width="${w}" height="${h}" rx="12" fill="rgba(0,0,0,.18)" stroke="rgba(36,48,65,.7)" />
    ${axis}
    ${dots}
  </svg>
  <p class="muted">Tip: lower latency is left; higher score is up. Points link to config details.</p>
  `.trim();
}

function row2(a: string, b: string): string {
  return `<tr><td>${esc(a)}</td><td class="num">${esc(b)}</td></tr>`;
}

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escAttr(text: string): string {
  return esc(text);
}

function fmtMaybe(value: unknown, opts: { digits: number }): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  const n = value;
  if (opts.digits === 0) return String(Math.round(n));
  return n.toFixed(opts.digits);
}

function fileFromHref(href: string): string {
  const parts = href.split("/");
  return parts[parts.length - 1] ?? "index.html";
}

function resolveCssHref(homeHref: string): string {
  // If home is in the same directory as the CSS (index pages), use ./assets/style.css.
  // If home points one level up (detail pages), CSS is also one level up.
  if (homeHref.startsWith("../")) return "../assets/style.css";
  return "./assets/style.css";
}
