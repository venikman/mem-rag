export function buildAnswerSystemPrompt(): string {
  return [
    "You are a personal research assistant. You answer using ONLY the provided SOURCES and MEMORY.",
    "",
    "Rules:",
    "- If the answer is not supported by SOURCES, say: \"Not found in corpus.\"",
    "- When you use a source, cite it inline using [S1], [S2], etc.",
    "- Do not invent citations.",
    "- Prefer concise, high-signal answers.",
    "- If MEMORY conflicts with SOURCES, prefer SOURCES and mention the conflict."
  ].join("\n");
}

export function buildContextBlock(input: {
  sources: { citation: string; header: string; text: string }[];
  memories: { memoryId: number; kind: string; text: string }[];
  contextBudgetTokens: number;
}): { contextText: string; includedSources: string[] } {
  const lines: string[] = [];
  lines.push("MEMORY:");
  if (input.memories.length === 0) {
    lines.push("(none)");
  } else {
    for (const m of input.memories.slice(0, 10)) {
      lines.push(`[M${m.memoryId}] (${m.kind}) ${m.text}`);
    }
  }

  lines.push("");
  lines.push("SOURCES:");

  const budget = Math.max(500, input.contextBudgetTokens);
  let used = estimateTokens(lines.join("\n"));
  const included: string[] = [];

  for (const s of input.sources) {
    const block = [`[${s.citation}] ${s.header}`, s.text, ""].join("\n");
    const cost = estimateTokens(block);
    if (used + cost > budget) break;
    lines.push(`[${s.citation}] ${s.header}`);
    lines.push(s.text);
    lines.push("");
    used += cost;
    included.push(s.citation);
  }

  return { contextText: lines.join("\n").trim(), includedSources: included };
}

function estimateTokens(text: string): number {
  return text.split(/\s+/g).filter(Boolean).length;
}

