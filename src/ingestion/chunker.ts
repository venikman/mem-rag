export type Chunk = { text: string; tokenCount: number };

export type ChunkConfig = {
  chunkSizeTokens: number;
  overlapTokens: number;
};

export function chunkText(text: string, cfg: ChunkConfig): Chunk[] {
  const chunkSize = Math.max(1, Math.floor(cfg.chunkSizeTokens));
  const overlap = Math.max(0, Math.floor(cfg.overlapTokens));
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  const out: Chunk[] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(tokens.length, start + chunkSize);
    const slice = tokens.slice(start, end);
    out.push({ text: slice.join(" "), tokenCount: slice.length });
    if (end === tokens.length) break;
    start = Math.max(0, end - overlap);
    if (start === end) start = end;
  }
  return out;
}

function tokenize(text: string): string[] {
  return text
    .replace(/\u0000/g, "")
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

