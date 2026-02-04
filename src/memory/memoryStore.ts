import crypto from "node:crypto";

import type { Db } from "../db/db.js";

export type Session = { id: string; createdAt: string; summary: string | null };

export function createSession(db: Db): Session {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO sessions(id) VALUES (?)").run(id);
  const row = db.prepare("SELECT id, created_at, summary FROM sessions WHERE id = ?").get(id) as {
    id: string;
    created_at: string;
    summary: string | null;
  };
  return { id: row.id, createdAt: row.created_at, summary: row.summary };
}

export function addEpisodicTurn(db: Db, input: { sessionId: string; role: "user" | "assistant" | "system"; text: string }): void {
  db.prepare("INSERT INTO episodic_turns(session_id, role, text) VALUES (?, ?, ?)").run(
    input.sessionId,
    input.role,
    input.text
  );
}

export function listRecentSemanticMemories(db: Db, limit: number): {
  id: number;
  kind: string;
  text: string;
  importance: number;
  confidence: number;
  createdAt: string;
  supersedesId: number | null;
}[] {
  return db
    .prepare(
      "SELECT id, kind, text, importance, confidence, created_at, supersedes_id FROM semantic_memories ORDER BY created_at DESC LIMIT ?"
    )
    .all(limit) as any;
}

export function insertSemanticMemory(db: Db, input: {
  text: string;
  kind: string;
  importance: number;
  confidence: number;
  embeddingId: number;
  supersedesId?: number | null;
}): number {
  const info = db
    .prepare(
      "INSERT INTO semantic_memories(text, kind, importance, confidence, supersedes_id, embedding_id) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      input.text,
      input.kind,
      input.importance,
      input.confidence,
      input.supersedesId ?? null,
      input.embeddingId
    );
  return Number(info.lastInsertRowid);
}

