import { describe, expect, test } from "vitest";

import { chunkText } from "../src/ingestion/chunker.js";

describe("chunkText", () => {
  test("chunks deterministically with overlap", () => {
    const text = "a b c d e f g h i j";
    const chunks = chunkText(text, { chunkSizeTokens: 4, overlapTokens: 1 });
    expect(chunks.map((c) => c.text)).toEqual(["a b c d", "d e f g", "g h i j"]);
    expect(chunks.map((c) => c.tokenCount)).toEqual([4, 4, 4]);
  });

  test("handles small input", () => {
    const chunks = chunkText("hello", { chunkSizeTokens: 100, overlapTokens: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe("hello");
  });
});

