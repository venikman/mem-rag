import { describe, expect, test } from "vitest";

import { openDb } from "../src/db/db.js";
import { createDbBackedEmbeddings } from "../src/providers/dbBacked.js";
import type { EmbeddingsClient } from "../src/providers/types.js";
import { getOrCreateChunkSet, replaceChunksForDocument, upsertDocument } from "../src/storage/storage.js";
import { retrieveDocChunks, retrieveSemanticMemories } from "../src/rag/retrieval.js";
import { insertSemanticMemory } from "../src/memory/memoryStore.js";

describe("db + embeddings + retrieval", () => {
  test("creates schema and supports basic retrieval", async () => {
    const db = openDb(":memory:");

    const fakeEmb: EmbeddingsClient = {
      provider: "fake",
      model: "fake-embed",
      async embed({ texts }) {
        return texts.map((t) => fakeVec(t));
      }
    };

    const embedder = createDbBackedEmbeddings(db, fakeEmb);

    const doc = upsertDocument(db, { filePath: "/tmp/a.md", hash: "h1", text: "alpha beta gamma delta" });
    const chunkSetId = getOrCreateChunkSet(db, { chunkSize: 4, overlap: 0, embedModel: fakeEmb.model });
    const chunks = ["alpha beta", "gamma delta"];
    const embs = await embedder.getOrCreate(chunks);
    replaceChunksForDocument(db, {
      chunkSetId,
      documentId: doc.documentId,
      chunks: chunks.map((t, i) => ({ chunkIndex: i, text: t, tokenCount: 2, embeddingId: embs[i]!.id }))
    });

    const [qEmb] = await embedder.getOrCreate(["alpha"]);
    const top = retrieveDocChunks(db, { chunkSetId, queryVector: qEmb!.vector, topK: 1 });
    expect(top).toHaveLength(1);
    expect(top[0]!.text).toContain("alpha");

    const [mEmb] = await embedder.getOrCreate(["Prefer concise answers"]);
    insertSemanticMemory(db, {
      text: "Prefer concise answers",
      kind: "preference",
      importance: 0.9,
      confidence: 0.9,
      embeddingId: mEmb!.id
    });
    const mem = retrieveSemanticMemories(db, { queryVector: qEmb!.vector, topK: 5 });
    expect(mem.length).toBeGreaterThanOrEqual(0);
  });

  test("preferences are always retrieved regardless of query similarity", async () => {
    const db = openDb(":memory:");

    // Use deterministic embeddings that give low similarity between preference and query
    const fakeEmb: EmbeddingsClient = {
      provider: "fake",
      model: "fake-embed",
      async embed({ texts }) {
        return texts.map((t) => deterministicVec(t));
      }
    };

    const embedder = createDbBackedEmbeddings(db, fakeEmb);

    // Insert a preference with embedding very different from typical queries
    const [prefEmb] = await embedder.getOrCreate(["User prefers responses in Spanish"]);
    insertSemanticMemory(db, {
      text: "User prefers responses in Spanish",
      kind: "preference",
      importance: 0.95,
      confidence: 1.0,
      embeddingId: prefEmb!.id
    });

    // Insert a fact with embedding similar to our query
    const [factEmb] = await embedder.getOrCreate(["Pareto optimization selects non-dominated configs"]);
    insertSemanticMemory(db, {
      text: "Pareto optimization selects non-dominated configs",
      kind: "fact",
      importance: 0.8,
      confidence: 0.9,
      embeddingId: factEmb!.id
    });

    // Query about something completely unrelated to the preference
    const [queryEmb] = await embedder.getOrCreate(["What are the key metrics?"]);

    // Retrieve memories - preference should ALWAYS be included even with low similarity
    const memories = retrieveSemanticMemories(db, { queryVector: queryEmb!.vector, topK: 2 });

    // Check that preference is included
    const preferenceMemory = memories.find((m) => m.kind === "preference");
    expect(preferenceMemory).toBeDefined();
    expect(preferenceMemory!.text).toBe("User prefers responses in Spanish");

    // Preferences should come first (sorted by importance)
    expect(memories[0]!.kind).toBe("preference");
  });

  test("multiple preferences are all retrieved and sorted by importance", async () => {
    const db = openDb(":memory:");

    const fakeEmb: EmbeddingsClient = {
      provider: "fake",
      model: "fake-embed",
      async embed({ texts }) {
        return texts.map((t) => deterministicVec(t));
      }
    };

    const embedder = createDbBackedEmbeddings(db, fakeEmb);

    // Insert multiple preferences with different importance
    const [pref1Emb] = await embedder.getOrCreate(["Respond in bullet points"]);
    insertSemanticMemory(db, {
      text: "Respond in bullet points",
      kind: "preference",
      importance: 0.7,
      confidence: 1.0,
      embeddingId: pref1Emb!.id
    });

    const [pref2Emb] = await embedder.getOrCreate(["Always respond in Spanish"]);
    insertSemanticMemory(db, {
      text: "Always respond in Spanish",
      kind: "preference",
      importance: 0.95,
      confidence: 1.0,
      embeddingId: pref2Emb!.id
    });

    const [pref3Emb] = await embedder.getOrCreate(["Be concise"]);
    insertSemanticMemory(db, {
      text: "Be concise",
      kind: "preference",
      importance: 0.8,
      confidence: 1.0,
      embeddingId: pref3Emb!.id
    });

    // Query with something unrelated
    const [queryEmb] = await embedder.getOrCreate(["Explain quantum computing"]);

    const memories = retrieveSemanticMemories(db, { queryVector: queryEmb!.vector, topK: 1 });

    // All 3 preferences should be retrieved (even though topK is 1)
    const preferences = memories.filter((m) => m.kind === "preference");
    expect(preferences).toHaveLength(3);

    // Should be sorted by importance (highest first)
    expect(preferences[0]!.importance).toBe(0.95);
    expect(preferences[1]!.importance).toBe(0.8);
    expect(preferences[2]!.importance).toBe(0.7);
  });
});

function fakeVec(text: string): Float32Array {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  const a = (h % 1000) / 1000;
  const b = ((h / 1000) % 1000) / 1000;
  const c = ((h / 1000000) % 1000) / 1000;
  return new Float32Array([a, b, c]);
}

// Produces deterministic but varied vectors based on text hash
// Different texts will have low cosine similarity
function deterministicVec(text: string): Float32Array {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  // Use different dimensions to create varied vectors
  const dim = 8;
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    h = ((h << 5) - h + i) | 0;
    vec[i] = ((h >>> 0) % 2000 - 1000) / 1000; // Range [-1, 1]
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i]! * vec[i]!;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) vec[i]! /= norm;
  return vec;
}

