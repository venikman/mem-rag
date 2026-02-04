import type { Db } from "../db/db.js";
import { bufferToFloat32Array, cosineSimilarity } from "../vector/vector.js";

export type RetrievedChunk = {
  chunkId: number;
  documentPath: string;
  documentTitle: string;
  text: string;
  score: number;
};

export type RetrievedMemory = {
  memoryId: number;
  kind: string;
  text: string;
  importance: number;
  confidence: number;
  supersedesId: number | null;
  score: number;
};

export function getChunkSetId(db: Db, input: { chunkSize: number; overlap: number; embedModel: string }): number | null {
  const row = db
    .prepare("SELECT id FROM chunk_sets WHERE chunk_size = ? AND overlap = ? AND embed_model = ? LIMIT 1")
    .get(input.chunkSize, input.overlap, input.embedModel) as { id: number } | undefined;
  return row?.id ?? null;
}

export function retrieveDocChunks(db: Db, input: {
  chunkSetId: number;
  queryVector: Float32Array;
  topK: number;
}): RetrievedChunk[] {
  const stmt = db.prepare(`
    SELECT
      c.id AS chunk_id,
      c.text AS chunk_text,
      d.path AS doc_path,
      d.title AS doc_title,
      e.vector_blob AS vector_blob
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    JOIN embeddings e ON e.id = c.embedding_id
    WHERE c.chunk_set_id = ?
  `);

  const top: RetrievedChunk[] = [];
  const k = Math.max(1, Math.floor(input.topK));

  for (const row of stmt.iterate(input.chunkSetId) as IterableIterator<{
    chunk_id: number;
    chunk_text: string;
    doc_path: string;
    doc_title: string;
    vector_blob: Buffer;
  }>) {
    const v = bufferToFloat32Array(row.vector_blob);
    const score = cosineSimilarity(input.queryVector, v);
    pushTopK(top, k, {
      chunkId: row.chunk_id,
      documentPath: row.doc_path,
      documentTitle: row.doc_title,
      text: row.chunk_text,
      score
    });
  }

  return top.sort((a, b) => b.score - a.score);
}

export function retrieveSemanticMemories(db: Db, input: {
  queryVector: Float32Array;
  topK: number;
}): RetrievedMemory[] {
  const stmt = db.prepare(`
    SELECT
      m.id AS memory_id,
      m.kind AS kind,
      m.text AS text,
      m.importance AS importance,
      m.confidence AS confidence,
      m.supersedes_id AS supersedes_id,
      e.vector_blob AS vector_blob
    FROM semantic_memories m
    JOIN embeddings e ON e.id = m.embedding_id
  `);

  const preferences: RetrievedMemory[] = [];
  const top: RetrievedMemory[] = [];
  const k = Math.max(1, Math.floor(input.topK));

  for (const row of stmt.iterate() as IterableIterator<{
    memory_id: number;
    kind: string;
    text: string;
    importance: number;
    confidence: number;
    supersedes_id: number | null;
    vector_blob: Buffer;
  }>) {
    const v = bufferToFloat32Array(row.vector_blob);
    const score = cosineSimilarity(input.queryVector, v);
    const mem: RetrievedMemory = {
      memoryId: row.memory_id,
      kind: row.kind,
      text: row.text,
      importance: row.importance,
      confidence: row.confidence,
      supersedesId: row.supersedes_id,
      score
    };

    // Always include preferences (they should apply to all queries)
    if (row.kind === "preference") {
      preferences.push(mem);
    } else {
      pushTopK(top, k, mem);
    }
  }

  // Sort preferences by importance (highest first), then merge with top-K other memories
  preferences.sort((a, b) => b.importance - a.importance);
  const similarityBased = top.sort((a, b) => b.score - a.score);

  // Combine: all preferences first, then top-K non-preferences
  // Deduplicate by memoryId in case of overlap
  const seen = new Set<number>();
  const result: RetrievedMemory[] = [];

  for (const p of preferences) {
    if (!seen.has(p.memoryId)) {
      seen.add(p.memoryId);
      result.push(p);
    }
  }

  for (const m of similarityBased) {
    if (!seen.has(m.memoryId)) {
      seen.add(m.memoryId);
      result.push(m);
    }
  }

  return result;
}

function pushTopK<T extends { score: number }>(arr: T[], k: number, item: T): void {
  if (arr.length < k) {
    arr.push(item);
    return;
  }
  let minIdx = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i]!.score < arr[minIdx]!.score) minIdx = i;
  }
  if (item.score > arr[minIdx]!.score) arr[minIdx] = item;
}

