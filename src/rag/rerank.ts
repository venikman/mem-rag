import type { ChatClient } from "../providers/types.js";
import { z } from "zod";

const RerankSchema = z.array(z.number().int().nonnegative()).min(1).max(100);

export async function maybeRerankByLLM<T extends { citation: string; text: string }>(
  chat: ChatClient,
  input: { question: string; candidates: T[]; enabled: boolean; take: number }
): Promise<{ items: T[]; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
  if (!input.enabled) return { items: input.candidates.slice(0, input.take) };
  if (input.candidates.length <= 1) return { items: input.candidates.slice(0, input.take) };

  const prompt = [
    "You are reranking retrieved text chunks for relevance.",
    "Return ONLY JSON: an array of indices in best-to-worst order.",
    "",
    "Question:",
    input.question,
    "",
    "Candidates:",
    ...input.candidates.map((c, i) => `(${i}) ${c.citation}: ${truncate(c.text, 500)}`)
  ].join("\n");

  const res = await chat.complete({
    messages: [
      { role: "system", content: "Output ONLY valid JSON. No markdown." },
      { role: "user", content: prompt }
    ],
    temperature: 0.0,
    maxTokens: 200
  });

  const arrText = extractJsonArray(res.text);
  if (!arrText) return { items: input.candidates.slice(0, input.take), usage: res.usage };
  try {
    const parsed = JSON.parse(arrText);
    const zres = RerankSchema.safeParse(parsed);
    if (!zres.success) return { items: input.candidates.slice(0, input.take), usage: res.usage };
    const seen = new Set<number>();
    const ordered: T[] = [];
    for (const idx of zres.data) {
      if (idx < 0 || idx >= input.candidates.length) continue;
      if (seen.has(idx)) continue;
      seen.add(idx);
      ordered.push(input.candidates[idx]!);
      if (ordered.length >= input.take) break;
    }
    return { items: ordered.length > 0 ? ordered : input.candidates.slice(0, input.take), usage: res.usage };
  } catch {
    return { items: input.candidates.slice(0, input.take), usage: res.usage };
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}
