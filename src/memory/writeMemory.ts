import { z } from "zod";

import type { Db } from "../db/db.js";
import type { ChatClient } from "../providers/types.js";
import type { EmbeddingRecord } from "../providers/dbBacked.js";
import { retrieveSemanticMemories } from "../rag/retrieval.js";
import { insertSemanticMemory } from "./memoryStore.js";

const MemoryKindSchema = z.enum(["preference", "decision", "fact", "insight", "todo"]);

const MemoryCandidateSchema = z.object({
  text: z.string().min(1),
  kind: MemoryKindSchema,
  importance: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1)
});

const MemoryCandidatesSchema = z.array(MemoryCandidateSchema).max(10);

export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;

export type WriteMemoryStats = {
  proposed: number;
  stored: number;
  skippedLowScore: number;
  superseded: number;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

export async function writeSemanticMemoryFromTurn(input: {
  db: Db;
  chat: ChatClient;
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]> };
  sessionId: string;
  userMessage: string;
  assistantAnswer: string;
  retrievedSources: { citation: string; text: string }[];
}): Promise<WriteMemoryStats> {
  const { db, chat, embedder } = input;

  const prompt = buildMemoryExtractionPrompt(input);
  const res = await chat.complete({
    messages: [
      {
        role: "system",
        content:
          "You extract long-term semantic memories. Output ONLY valid JSON (an array). No markdown."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.0,
    maxTokens: 600
  });

  const candidates = parseCandidates(res.text);
  const stats: WriteMemoryStats = {
    proposed: candidates.length,
    stored: 0,
    skippedLowScore: 0,
    superseded: 0,
    usage: res.usage
  };

  for (const c of candidates) {
    if (c.importance < 0.6 || c.confidence < 0.6) {
      stats.skippedLowScore += 1;
      continue;
    }

    const [emb] = await embedder.getOrCreate([c.text]);
    const nearest = retrieveSemanticMemories(db, { queryVector: emb!.vector, topK: 1 })[0];

    let supersedesId: number | null = null;
    if (nearest && nearest.score >= 0.88) {
      supersedesId = nearest.memoryId;
      stats.superseded += 1;
    }

    insertSemanticMemory(db, {
      text: c.text,
      kind: c.kind,
      importance: c.importance,
      confidence: c.confidence,
      embeddingId: emb!.id,
      supersedesId
    });
    stats.stored += 1;
  }

  return stats;
}

function buildMemoryExtractionPrompt(input: {
  userMessage: string;
  assistantAnswer: string;
  retrievedSources: { citation: string; text: string }[];
}): string {
  const sources = input.retrievedSources
    .slice(0, 8)
    .map((s) => `${s.citation}: ${truncate(s.text, 700)}`)
    .join("\n\n");

  return [
    "Extract up to 5 high-value long-term semantic memories to store.",
    "",
    "Rules:",
    "- Only store stable, reusable information: user preferences, decisions, verified facts, durable insights, or TODOs.",
    "- Do NOT store transient chat text, greetings, or one-off details.",
    "- If unsure, omit.",
    "- importance/confidence are 0..1.",
    "",
    "Output JSON array with objects:",
    `[{ "text": "...", "kind": "preference|decision|fact|insight|todo", "importance": 0.0, "confidence": 0.0 }]`,
    "",
    "User message:",
    truncate(input.userMessage, 1200),
    "",
    "Assistant answer:",
    truncate(input.assistantAnswer, 1600),
    "",
    "Retrieved sources (for verification):",
    sources || "(none)"
  ].join("\n");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

function parseCandidates(text: string): MemoryCandidate[] {
  const jsonText = extractJsonArray(text);
  if (!jsonText) return [];
  try {
    const parsed = JSON.parse(jsonText);
    const res = MemoryCandidatesSchema.safeParse(parsed);
    if (!res.success) return [];
    return res.data;
  } catch {
    return [];
  }
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  return text.slice(start, end + 1);
}
