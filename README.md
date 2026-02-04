# mem-rag — Agentic Memory Research Assistant (Mastra + RAG-Stack IR/CM/PE)

Single-agent personal research assistant CLI with:
- PDF/Markdown ingestion into SQLite + embeddings
- Agentic long-term memory (episodic + semantic) across runs
- RAG pipeline evaluation + plan exploration (quality vs cost/latency)

See `docs/EXPERIMENT.md` for how to run the experiment and interpret results.
See `docs/ARCHITECTURE.md` for contributor-focused diagrams and data flow.

## Setup

1) Install deps:
```bash
pnpm install
```

2) Configure env:
```bash
cp .env.example .env
```

3) (Optional) Pricing table for $ estimates:
```bash
cp pricing.example.json pricing.json
```

3) Build:
```bash
pnpm build
```

## Commands

Ingest a corpus (PDF + MD):
```bash
mem-rag ingest ../ --include "**/*.pdf" --include "**/*.md"
```

Interactive chat:
```bash
mem-rag chat
```

Mastra tool-calling mode (agent calls `search_docs` / `search_memory` / `write_memory`):
```bash
mem-rag chat --mode mastra
```

Run evaluation:
```bash
mem-rag eval --questions eval/questions.jsonl
```

Optimize pipeline configs (RAG-PE):
```bash
mem-rag optimize --questions eval/questions.jsonl
```

## Notes
- Embeddings default to LM Studio (`LMSTUDIO_BASE_URL`).
- Chat/judging default to OpenRouter (`OPENROUTER_BASE_URL` + `OPENROUTER_API_KEY`).
- Query rewrite, rerank, and memory extraction use the “support” model (`SUPPORT_PROVIDER` / `SUPPORT_MODEL`). Default is LM Studio `qwen/qwen3-coder-next`.
- PDF ingestion uses `pdftotext` (Poppler).
