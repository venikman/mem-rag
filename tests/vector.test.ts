import { describe, expect, test } from "vitest";

import { bufferToFloat32Array, cosineSimilarity, float32ArrayToBuffer } from "../src/vector/vector.js";

describe("vector utils", () => {
  test("roundtrips Float32Array to Buffer", () => {
    const v = new Float32Array([1, 2, 3.5]);
    const buf = float32ArrayToBuffer(v);
    const back = bufferToFloat32Array(buf);
    expect(Array.from(back)).toEqual(Array.from(v));
  });

  test("cosine similarity", () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBeCloseTo(1);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0);
  });
});

