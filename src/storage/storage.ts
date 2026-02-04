import path from "node:path";

import type { Db } from "../db/db.js";

export type UpsertDocumentInput = {
  filePath: string;
  hash: string;
  title?: string;
  text: string;
};

export type UpsertDocumentResult = {
  documentId: number;
  changed: boolean;
};

export function upsertDocument(db: Db, input: UpsertDocumentInput): UpsertDocumentResult {
  const filePath = input.filePath;
  const title = input.title ?? path.basename(filePath);

  const existing = db
    .prepare("SELECT id, hash FROM documents WHERE path = ? LIMIT 1")
    .get(filePath) as { id: number; hash: string } | undefined;

  if (!existing) {
    const docInfo = db
      .prepare("INSERT INTO documents(path, title, hash) VALUES (?, ?, ?)")
      .run(filePath, title, input.hash);
    const documentId = Number(docInfo.lastInsertRowid);
    db.prepare("INSERT INTO document_texts(document_id, text) VALUES (?, ?)").run(documentId, input.text);
    return { documentId, changed: true };
  }

  if (existing.hash === input.hash) {
    const hasText = db
      .prepare("SELECT 1 AS ok FROM document_texts WHERE document_id = ? LIMIT 1")
      .get(existing.id) as { ok: 1 } | undefined;
    if (!hasText) {
      db.prepare("INSERT INTO document_texts(document_id, text) VALUES (?, ?)").run(existing.id, input.text);
      return { documentId: existing.id, changed: true };
    }
    return { documentId: existing.id, changed: false };
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE documents SET hash = ?, title = ?, updated_at = datetime('now') WHERE id = ?").run(
      input.hash,
      title,
      existing.id
    );
    db.prepare("INSERT INTO document_texts(document_id, text) VALUES (?, ?) ON CONFLICT(document_id) DO UPDATE SET text=excluded.text").run(
      existing.id,
      input.text
    );
  });
  tx();

  return { documentId: existing.id, changed: true };
}

export function getOrCreateChunkSet(db: Db, input: { chunkSize: number; overlap: number; embedModel: string }): number {
  const existing = db
    .prepare(
      "SELECT id FROM chunk_sets WHERE chunk_size = ? AND overlap = ? AND embed_model = ? LIMIT 1"
    )
    .get(input.chunkSize, input.overlap, input.embedModel) as { id: number } | undefined;
  if (existing) return existing.id;

  const info = db
    .prepare("INSERT INTO chunk_sets(chunk_size, overlap, embed_model) VALUES (?, ?, ?)")
    .run(input.chunkSize, input.overlap, input.embedModel);
  return Number(info.lastInsertRowid);
}

export type ChunkInsert = { chunkIndex: number; text: string; tokenCount: number; embeddingId: number };

export function replaceChunksForDocument(db: Db, input: { chunkSetId: number; documentId: number; chunks: ChunkInsert[] }): void {
  const del = db.prepare("DELETE FROM chunks WHERE chunk_set_id = ? AND document_id = ?");
  const ins = db.prepare(
    "INSERT INTO chunks(chunk_set_id, document_id, chunk_index, text, token_count, embedding_id) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const tx = db.transaction(() => {
    del.run(input.chunkSetId, input.documentId);
    for (const ch of input.chunks) {
      ins.run(input.chunkSetId, input.documentId, ch.chunkIndex, ch.text, ch.tokenCount, ch.embeddingId);
    }
  });
  tx();
}

