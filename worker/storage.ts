import { HttpError } from "./auth";

export const MAX_STORED_BYTES = 1_800_000;
export const MAX_EXPANDED_BYTES = 32_000_000;
const MAX_COMPRESSED_BYTES = 1_340_000;
const metadataKeys = [
  "id",
  "createdAt",
  "publishedBy",
  "summary",
  "digest",
  "previousId",
  "datasetId",
  "asOf",
  "demo",
] as const;
function verifyMetadata(
  value: unknown,
  metadata: Record<string, unknown>,
  requireComplete = false,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (Object.keys(metadata).length)
      throw new Error("Stored snapshot metadata requires an object");
    return;
  }
  const inner = value as Record<string, unknown>;
  for (const [key, actual] of Object.entries(metadata)) {
    if (
      !metadataKeys.includes(key as (typeof metadataKeys)[number]) ||
      (actual !== null &&
        typeof actual !== "string" &&
        typeof actual !== "boolean")
    )
      throw new Error("Stored snapshot metadata contains an unsupported field");
    const expected =
      key === "datasetId"
        ? (inner.dataset as { id?: unknown } | undefined)?.id
        : inner[key];
    if (actual !== expected)
      throw new Error(`Stored snapshot metadata mismatch: ${key}`);
  }
  if (requireComplete) {
    const required = inner.dataset
      ? [
          "id",
          "createdAt",
          "publishedBy",
          "summary",
          "digest",
          "previousId",
          "datasetId",
        ]
      : Array.isArray(inner.members) && Array.isArray(inner.votes)
        ? ["id", "asOf", "demo"]
        : [];
    if (required.some((key) => !Object.hasOwn(metadata, key)))
      throw new Error("Stored snapshot metadata is incomplete");
  }
}
async function collect(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(
          413,
          "Snapshot exceeds its bounded storage capacity",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function hash(bytes: Uint8Array<ArrayBuffer>) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
/** Legacy inline JSON stays readable. Metadata remains queryable by D1 without decompression. */
export async function encodeStoredJson(
  value: unknown,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  verifyMetadata(value, metadata);
  const text = JSON.stringify(value);
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > MAX_EXPANDED_BYTES)
    throw new HttpError(413, "Snapshot exceeds the 32 MB expanded capacity");
  if (bytes.byteLength < 128_000) return text;
  verifyMetadata(value, metadata, true);
  const compressed = await collect(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip")),
    MAX_COMPRESSED_BYTES,
  );
  const stored = JSON.stringify({
    ...metadata,
    storage: "gzip-v1",
    encoding: "base64",
    uncompressedBytes: bytes.byteLength,
    sha256: await hash(bytes),
    payload: base64(compressed),
  });
  if (new TextEncoder().encode(stored).byteLength > MAX_STORED_BYTES)
    throw new HttpError(
      413,
      "Compressed snapshot exceeds the 1.8 MB D1 capacity",
    );
  return stored;
}
export async function decodeStoredJson<T>(text: string): Promise<T> {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error("Stored snapshot is invalid JSON");
  }
  if (!envelope || typeof envelope !== "object" || !("storage" in envelope))
    return envelope as T;
  const e = envelope as Record<string, unknown>;
  if (
    Object.keys(e).some(
      (key) =>
        ![
          ...metadataKeys,
          "storage",
          "encoding",
          "uncompressedBytes",
          "sha256",
          "payload",
        ].includes(key),
    )
  )
    throw new Error("Stored snapshot envelope contains an unsupported field");
  if (
    e.storage !== "gzip-v1" ||
    e.encoding !== "base64" ||
    typeof e.payload !== "string" ||
    e.payload.length > MAX_STORED_BYTES ||
    typeof e.uncompressedBytes !== "number" ||
    !Number.isInteger(e.uncompressedBytes) ||
    e.uncompressedBytes < 1 ||
    e.uncompressedBytes > MAX_EXPANDED_BYTES ||
    typeof e.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(e.sha256)
  )
    throw new Error("Stored snapshot envelope is invalid");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(e.payload), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("Stored snapshot encoding is invalid");
  }
  if (bytes.length > MAX_COMPRESSED_BYTES)
    throw new Error("Stored compressed payload is too large");
  const raw = await collect(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    Math.min(e.uncompressedBytes, MAX_EXPANDED_BYTES),
  );
  if (raw.byteLength !== e.uncompressedBytes || (await hash(raw)) !== e.sha256)
    throw new Error("Stored snapshot checksum mismatch");
  const value = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(raw),
  ) as T;
  verifyMetadata(
    value,
    Object.fromEntries(
      metadataKeys
        .filter((key) => Object.hasOwn(e, key))
        .map((key) => [key, e[key]]),
    ),
    true,
  );
  return value;
}
