import fs from "node:fs/promises";
import path from "node:path";

import type { Db } from "../db/db.js";
import type { EmbeddingRecord } from "../providers/dbBacked.js";
import { sha256Hex } from "../util/hash.js";
import { chunkText } from "./chunker.js";
import { discoverFiles, inferIncludeExts } from "./files.js";
import { extractMarkdownText } from "./markdown.js";
import { extractPdfText } from "./pdf.js";
import { getOrCreateChunkSet, replaceChunksForDocument, upsertDocument } from "../storage/storage.js";

export type IngestOptions = {
  corpusPath: string;
  include?: string[];
  chunkSizeTokens: number;
  overlapTokens: number;
  embedModel: string;
};

export type IngestStats = {
  filesFound: number;
  documentsUpserted: number;
  documentsSkipped: number;
  chunksWritten: number;
};

export async function ingestCorpus(
  db: Db,
  embedder: { getOrCreate(texts: string[]): Promise<EmbeddingRecord[]> },
  opts: IngestOptions
): Promise<IngestStats> {
  const includeExts = inferIncludeExts(opts.include);
  const files = await discoverFiles({ root: opts.corpusPath, includeExts });

  const chunkSetId = getOrCreateChunkSet(db, {
    chunkSize: opts.chunkSizeTokens,
    overlap: opts.overlapTokens,
    embedModel: opts.embedModel
  });

  const stats: IngestStats = {
    filesFound: files.length,
    documentsUpserted: 0,
    documentsSkipped: 0,
    chunksWritten: 0
  };

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    const bytes = await fs.readFile(filePath);
    const fileHash = sha256Hex(bytes);

    const rawText =
      ext === ".pdf" ? await extractPdfText(filePath) : await extractMarkdownText(filePath);
    const text = normalizeText(rawText);

    const { documentId, changed } = upsertDocument(db, { filePath, hash: fileHash, text });

    const existingChunkCount = db
      .prepare("SELECT COUNT(1) AS c FROM chunks WHERE chunk_set_id = ? AND document_id = ?")
      .get(chunkSetId, documentId) as { c: number };

    if (!changed && existingChunkCount.c > 0) {
      stats.documentsSkipped += 1;
      continue;
    }

    const chunks = chunkText(text, {
      chunkSizeTokens: opts.chunkSizeTokens,
      overlapTokens: opts.overlapTokens
    });
    if (chunks.length === 0) {
      stats.documentsUpserted += 1;
      continue;
    }

    const embeddings = await embedder.getOrCreate(chunks.map((c) => c.text));
    replaceChunksForDocument(db, {
      chunkSetId,
      documentId,
      chunks: chunks.map((c, idx) => ({
        chunkIndex: idx,
        text: c.text,
        tokenCount: c.tokenCount,
        embeddingId: embeddings[idx]!.id
      }))
    });

    stats.documentsUpserted += 1;
    stats.chunksWritten += chunks.length;
  }

  return stats;
}

function normalizeText(input: string): string {
  return input.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

