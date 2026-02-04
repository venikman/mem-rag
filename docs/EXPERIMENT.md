# Running the Agentic Memory Experiment

This repo implements a **personal research assistant** with:
- **Document memory** (PDF/Markdown corpus)
- **Episodic memory** (per-session turns)
- **Semantic memory** (durable preferences/decisions/facts/insights/TODOs)
- A tunable RAG pipeline + evaluator + optimizer (Pareto frontier)

## Prerequisites

- Node + pnpm
- `pdftotext` available on PATH (Poppler)
  - macOS: `brew install poppler`
- LM Studio running an **OpenAI-compatible server**
  - Default `LMSTUDIO_BASE_URL=http://localhost:1234/v1`
- OpenRouter API key (OpenAI-compatible)

## Setup

1) Install dependencies:
```bash
pnpm install
```

2) Allow native/build scripts (needed for `better-sqlite3`):
```bash
pnpm approve-builds
```
Select `better-sqlite3` (and `esbuild`) and approve.

3) Configure env:
```bash
cp .env.example .env
```

4) (Optional) Pricing table for dollar estimates:
```bash
cp pricing.example.json pricing.json
```

## Model roles (what runs where)

You’ll typically run **two model classes**:

### 1) Answer + judge (OpenRouter)
- `CHAT_MODEL` (answers)
- `JUDGE_MODEL` (rubric scoring)

### 2) Support model (LM Studio default)
Support model is used for “agentic memory plumbing” in pipeline mode:
- query rewrite (`rewrite`)
- rerank (`rerank`)
- memory extraction + write (`memory.write`)

Defaults (recommended):
- `SUPPORT_PROVIDER=lmstudio`
- `SUPPORT_MODEL=qwen/qwen3-coder-next`

## Step 1 — Ingest a corpus (PDF + Markdown)

Ingest a small folder first (10–50 docs) so retrieval stays fast (this repo uses brute-force similarity search).

```bash
pnpm run mem-rag -- ingest ../ --include "**/*.pdf" --include "**/*.md"
```

Useful flags:
- `--chunk-size 800` (default)
- `--overlap 100` (default)
- `--embed-model <name>` overrides `EMBED_MODEL`

### Important: config consistency
Your **chat/eval/optimize retrieval must match** the chunk settings + embedding model used at ingest time:
- chunk size
- overlap
- embedding model name

If they don’t match you’ll see:
`No chunk_set found ... Run 'mem-rag ingest' with matching settings.`

## Step 2 — Run the product-like demo (interactive chat)

### Pipeline mode (recommended for experiments)
Deterministic RAG pipeline + explicit memory writer.

```bash
pnpm run mem-rag -- chat --rewrite --rerank --memory-blend docs+semantic
```

Commands inside chat:
- `/memory` shows recent semantic memories
- `/exit` quits

Suggested “agentic memory” scenario:
1) Tell the assistant a stable preference: “Be terse; bullet points only.”
2) Ask a doc-grounded question (verify citations)
3) Restart `chat`
4) Ask again and verify it remembers the preference.

### Mastra tool-calling mode (optional)
Agent calls tools `search_docs/search_memory/write_memory`.

```bash
pnpm run mem-rag -- chat --mode mastra
```

## Step 3 — Create an evaluation set

`eval/questions.jsonl` is **one JSON object per line**:
```json
{"id":"q1","question":"...", "expected_sources":["optional-substring"], "notes":"optional"}
```

Tips:
- Add ~10–20 questions you actually care about.
- Add 5 “memory” questions that require a preference/decision learned earlier.
- `expected_sources` is optional and only used for a coarse `recallAtK` proxy.

## Step 4 — Run evaluation (scores + latency + tokens + $)

```bash
pnpm run mem-rag -- eval --questions eval/questions.jsonl --rewrite --rerank
```

Outputs go to `runs/<timestamp>/eval/` unless you pass `--out <dir>`.

### Generate an HTML report (local)
```bash
pnpm run mem-rag -- report --run runs/<timestamp>/eval
```

### Publish to GitHub Pages (writes to `docs/experiments/`)
```bash
pnpm run mem-rag -- publish --run runs/<timestamp>/eval
```

### Auto-deploy on push (GitHub Actions)
This repo includes a Pages workflow at `.github/workflows/pages.yml` that deploys the `docs/` folder on pushes to `main`.
In your GitHub repo settings:
- Settings → Pages → Source: **GitHub Actions**

### Files produced
- `runs/<ts>/eval/config.json` — pipeline config
- `runs/<ts>/eval/rag_ir.json` — serializable RAG-IR
- `runs/<ts>/eval/results.jsonl` — one line per question with scores/metrics
- `runs/<ts>/eval/cost_model.json` — additive timing model snapshot (RAG-CM)
- `runs/<ts>/eval/manifest.json` — metadata (models, git commit, questions hash, args)

### Reading `results.jsonl`
Key fields:
- `judge` + `weightedScore` (main quality metric)
  - `weightedScore = 0.4*correctness + 0.4*groundedness + 0.2*memoryUse`
- `timingsMs` — latency breakdown per node (`rewrite`, `retrieve.docs`, `generate`, etc.)
- `usage` / `dollars` — summed usage/cost for rewrite+rerank+generate+memory.write (pricing table required for $)
- `judgeUsage` / `judgeDollars` — judge call usage/cost
- `retrievedSources` — which doc chunks were cited
- `memoryWrite` — how many semantic memories were proposed/stored

Quick summaries (requires `jq`):
```bash
# Average weighted score
jq -s 'map(.weightedScore // 0) | (add/length)' runs/*/eval/results.jsonl

# Average total latency (ms)
jq -s 'map(.timingsMs | to_entries | map(.value) | add) | (add/length)' runs/*/eval/results.jsonl
```

## Step 5 — Optimize (RAG-PE) and get a Pareto frontier

Stage A (cheap) runs across many configs; Stage B runs on the top configs.
By default it will also **auto-ingest** any missing chunk sets for sampled configs.

```bash
pnpm run mem-rag -- optimize --questions eval/questions.jsonl --corpus ../ --include "**/*.pdf" --include "**/*.md" --min-configs 10 --stage-a 5 --stage-b 20 --top-n 3
```

Outputs go to `runs/<timestamp>/optimize/` unless you pass `--out <dir>`.

### Generate an HTML report (local)
```bash
pnpm run mem-rag -- report --run runs/<timestamp>/optimize
```

### Publish to GitHub Pages (writes to `docs/experiments/`)
```bash
pnpm run mem-rag -- publish --run runs/<timestamp>/optimize
```

### Auto-deploy on push (GitHub Actions)
This repo includes a Pages workflow at `.github/workflows/pages.yml` that deploys the `docs/` folder on pushes to `main`.
In your GitHub repo settings:
- Settings → Pages → Source: **GitHub Actions**

### Files produced
- `runs/<ts>/optimize/configs.jsonl` — evaluated configs (`configHash` → config)
- `runs/<ts>/optimize/rag_ir.jsonl` — RAG-IR per config
- `runs/<ts>/optimize/results.jsonl` — summary per config/stage
- `runs/<ts>/optimize/pareto.json` — Pareto frontier (non-dominated configs)
- `runs/<ts>/optimize/cost_model.json` — updated RAG-CM snapshot
- `runs/<ts>/optimize/manifest.json` — metadata (models, git commit, questions hash, args)

### Reading optimization summaries
Each line in `results.jsonl` is a config summary:
- `stage`: `"A"` or `"B"`
- `avgScore`: average `weightedScore` across evaluated questions
- `p95LatencyMs`: p95 of total turn latency
- `dollars`: total $ estimate (pipeline + judge) if pricing is configured
- `totalTokens`: total tokens used

### Reading `pareto.json` (how to pick a config)
Each point is “non-dominated” by another point on:
- higher score (better)
- lower p95 latency (better)
- lower dollars (better)
- lower tokens (better)

Practical picks:
- **Fastest acceptable**: lowest `p95LatencyMs` among points with `avgScore >= your_threshold`
- **Best under budget**: best `avgScore` with `dollars <= X`
- **Best quality**: highest `avgScore` (expect higher latency/$)

## Common failure modes

- `pdftotext` not found → install Poppler and re-run ingest.
- “No chunk_set found …” → ingest again with matching chunk size/overlap/embedding model.
- Retrieval very slow → reduce corpus size, reduce `topK`, disable `rerank`, or increase chunk size.
- Memory gets noisy → raise thresholds in `src/memory/writeMemory.ts` or disable memory writes in `eval`.
