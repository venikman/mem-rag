import { z } from "zod";

import type { ChatClient } from "../providers/types.js";

const JudgeSchema = z.object({
  correctness: z.number().int().min(0).max(5),
  groundedness: z.number().int().min(0).max(5),
  memoryUse: z.number().int().min(0).max(5),
  clarity: z.number().int().min(0).max(5),
  notes: z.string().optional()
});

export type JudgeScores = z.infer<typeof JudgeSchema>;

export function weightedScore(scores: JudgeScores): number {
  return 0.4 * scores.correctness + 0.4 * scores.groundedness + 0.2 * scores.memoryUse;
}

export async function judgeAnswer(input: {
  chat: ChatClient;
  question: string;
  answer: string;
  sources: { citation: string; text: string }[];
}): Promise<{ scores: JudgeScores; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } } | null> {
  const prompt = [
    "Grade the assistant answer using the rubric.",
    "",
    "Return ONLY valid JSON:",
    `{ "correctness": 0-5, "groundedness": 0-5, "memoryUse": 0-5, "clarity": 0-5, "notes": "optional" }`,
    "",
    "Rubric:",
    "- correctness: factual/technical correctness relative to sources",
    "- groundedness: uses the provided sources; no unsupported claims",
    "- memoryUse: uses relevant preferences/decisions if present (if none, score 0-1 based on neutrality)",
    "- clarity: concise and clear",
    "",
    "Question:",
    input.question,
    "",
    "Answer:",
    input.answer,
    "",
    "Sources (snippets):",
    input.sources
      .slice(0, 6)
      .map((s) => `[${s.citation}] ${truncate(s.text, 700)}`)
      .join("\n\n") || "(none)"
  ].join("\n");

  const res = await input.chat.complete({
    messages: [
      { role: "system", content: "You are a strict evaluator. Output ONLY JSON. No markdown." },
      { role: "user", content: prompt }
    ],
    temperature: 0.0,
    maxTokens: 300
  });

  const objText = extractJsonObject(res.text);
  if (!objText) return null;
  try {
    const parsed = JSON.parse(objText);
    const zres = JudgeSchema.safeParse(parsed);
    if (!zres.success) return null;
    return { scores: zres.data, usage: res.usage };
  } catch {
    return null;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}
