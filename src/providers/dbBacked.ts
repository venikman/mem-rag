import type { Db } from "../db/db.js";
import { stableJsonHash } from "../util/hash.js";
import { bufferToFloat32Array, float32ArrayToBuffer } from "../vector/vector.js";
import type { ChatClient, ChatCompletion, EmbeddingsClient } from "./types.js";

export type EmbeddingRecord = { id: number; vector: Float32Array };

export function createCachedChatClient(db: Db, inner: ChatClient): ChatClient {
  return {
    provider: inner.provider,
    model: inner.model,
    async complete(input): Promise<ChatCompletion> {
      const request = {
        model: inner.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        maxTokens: input.maxTokens ?? null
      };
      const key = stableJsonHash({ provider: inner.provider, ...request });

      const cached = db
        .prepare("SELECT response_json FROM llm_cache WHERE key = ? LIMIT 1")
        .get(key) as { response_json: string } | undefined;
      if (cached) {
        const raw = JSON.parse(cached.response_json) as any;
        const text = (raw?.choices?.[0]?.message?.content ?? "").toString();
        const usage = raw?.usage
          ? {
              promptTokens: raw.usage.prompt_tokens,
              completionTokens: raw.usage.completion_tokens,
              totalTokens: raw.usage.total_tokens
            }
          : undefined;
        return { text, usage, raw };
      }

      const res = await inner.complete(input);
      db.prepare(
        "INSERT OR REPLACE INTO llm_cache(key, provider, model, request_json, response_json) VALUES (?, ?, ?, ?, ?)"
      ).run(key, inner.provider, inner.model, JSON.stringify(request), JSON.stringify(res.raw));
      return res;
    }
  };
}

export function createDbBackedEmbeddings(db: Db, inner: EmbeddingsClient): {
  provider: string;
  model: string;
  getOrCreate(texts: string[]): Promise<EmbeddingRecord[]>;
} {
  return {
    provider: inner.provider,
    model: inner.model,
    async getOrCreate(texts: string[]): Promise<EmbeddingRecord[]> {
      if (texts.length === 0) return [];
      const hashes = texts.map((t) => stableJsonHash({ model: inner.model, text: t }));

      const existingRows = db
        .prepare("SELECT id, hash, vector_blob FROM embeddings WHERE model = ? AND hash IN (" + hashes.map(() => "?").join(",") + ")")
        .all(inner.model, ...hashes) as { id: number; hash: string; vector_blob: Buffer }[];

      const existingByHash = new Map<string, EmbeddingRecord>();
      for (const row of existingRows) {
        existingByHash.set(row.hash, { id: row.id, vector: bufferToFloat32Array(row.vector_blob) });
      }

      const missing: { idx: number; text: string; hash: string }[] = [];
      for (let i = 0; i < texts.length; i++) {
        const h = hashes[i]!;
        if (!existingByHash.has(h)) {
          missing.push({ idx: i, text: texts[i]!, hash: h });
        }
      }

      if (missing.length > 0) {
        const uniqueByHash = new Map<string, { text: string }>();
        for (const m of missing) {
          const entry = uniqueByHash.get(m.hash);
          if (!entry) uniqueByHash.set(m.hash, { text: m.text });
        }

        const unique = [...uniqueByHash.entries()];
        const vectors = await inner.embed({ texts: unique.map(([, v]) => v.text) });
        const insert = db.prepare(
          "INSERT INTO embeddings(dims, vector_blob, model, hash) VALUES (?, ?, ?, ?)"
        );
        for (let i = 0; i < unique.length; i++) {
          const [hash] = unique[i]!;
          const v = vectors[i]!;
          const info = insert.run(v.length, float32ArrayToBuffer(v), inner.model, hash);
          const id = Number(info.lastInsertRowid);
          existingByHash.set(hash, { id, vector: v });
        }
      }

      return hashes.map((h) => {
        const rec = existingByHash.get(h);
        if (!rec) throw new Error("Missing embedding unexpectedly");
        return rec;
      });
    }
  };
}
