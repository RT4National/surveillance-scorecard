import { describe, it, expect } from "vitest";
import {
  encodeStoredJson,
  decodeStoredJson,
  MAX_STORED_BYTES,
} from "./storage";
describe("Versioned bounded snapshot storage", () => {
  it("binds every copied metadata field to its checksummed payload", async () => {
    const metadata = {
      id: "p",
      createdAt: "2026-09-07",
      publishedBy: "publisher",
      summary: "original",
      digest: "a".repeat(64),
      previousId: null,
      datasetId: "d",
    };
    const value = {
      ...metadata,
      dataset: { id: "d" },
      data: "x".repeat(150_000),
    };
    const stored = JSON.parse(await encodeStoredJson(value, metadata));
    for (const key of Object.keys(metadata))
      await expect(
        decodeStoredJson(JSON.stringify({ ...stored, [key]: "altered" })),
      ).rejects.toThrow("metadata mismatch");
    const missing = { ...stored };
    delete missing.summary;
    await expect(decodeStoredJson(JSON.stringify(missing))).rejects.toThrow(
      "metadata is incomplete",
    );
    await expect(encodeStoredJson(value, { unknown: "field" })).rejects.toThrow(
      "unsupported",
    );
    const d = {
      id: "d",
      asOf: "2026-09-07",
      demo: true,
      members: [],
      votes: [],
      data: "x".repeat(150_000),
    };
    const ds = JSON.parse(
      await encodeStoredJson(d, { id: d.id, asOf: d.asOf, demo: d.demo }),
    );
    await expect(
      decodeStoredJson(JSON.stringify({ ...ds, demo: false })),
    ).rejects.toThrow("metadata mismatch");
    await expect(
      decodeStoredJson(JSON.stringify({ ...ds, asOf: "2000-01-01" })),
    ).rejects.toThrow("metadata mismatch");
  });
  it("reads inline legacy JSON and deterministic compressed snapshots", async () => {
    const small = { id: "legacy", data: [1, 2] };
    expect(await decodeStoredJson(JSON.stringify(small))).toEqual(small);
    const large = { id: "compressed", data: "界".repeat(100_000) };
    const stored = await encodeStoredJson(large, { id: large.id });
    expect(JSON.parse(stored).storage).toBe("gzip-v1");
    expect(Buffer.byteLength(stored)).toBeLessThan(MAX_STORED_BYTES);
    expect(await decodeStoredJson(stored)).toEqual(large);
  });
  it("refuses corrupted digests, unsupported versions and deceptive expanded sizes", async () => {
    const stored = JSON.parse(
      await encodeStoredJson({ text: "a".repeat(200_000) }),
    );
    await expect(
      decodeStoredJson(JSON.stringify({ ...stored, sha256: "0".repeat(64) })),
    ).rejects.toThrow("checksum");
    await expect(
      decodeStoredJson(JSON.stringify({ ...stored, storage: "gzip-v2" })),
    ).rejects.toThrow("invalid");
    await expect(
      decodeStoredJson(JSON.stringify({ ...stored, uncompressedBytes: 50 })),
    ).rejects.toThrow();
    await expect(
      decodeStoredJson(
        JSON.stringify({ ...stored, uncompressedBytes: 32_000_001 }),
      ),
    ).rejects.toThrow("invalid");
  });
  it("rejects oversized expanded content before compression", async () => {
    await expect(
      encodeStoredJson({ data: "x".repeat(32_000_001) }),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects poorly compressing content before exceeding the D1 envelope limit", async () => {
    let seed = 123456789;
    const chars: string[] = [];
    for (let i = 0; i < 2_000_000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      chars.push(String.fromCharCode(32 + ((seed >>> 8) % 95)));
    }
    await expect(
      encodeStoredJson({ data: chars.join("") }),
    ).rejects.toMatchObject({ status: 413 });
  });
});
