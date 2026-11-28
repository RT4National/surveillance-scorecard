// Caching for immutable publications: HTTP headers, conditional requests and an in-isolate memo.
//
// A published publication never changes (database triggers refuse updates), so anything derived
// from one publication ID can be kept for the life of the isolate and cached by browsers for a
// year. "latest" is only a pointer: it is read from D1 on every request, then everything is keyed
// by the ID it names. The Cache API is a no-op on *.workers.dev (staging), so the memo, not
// caches.default, is what makes repeat requests fast there.
import type { Publication } from "../src/core/publication";
import { decodeStoredJson } from "./storage";

/** One year: responses for a specific publication ID. */
export const IMMUTABLE = "public, max-age=31536000, immutable";
/** Seconds a "latest" response or public HTML may be reused. A new publication shows within this. */
export const LATEST_TTL = 60;
export const SHORT = `public, max-age=${LATEST_TTL}`;
export const NO_STORE = "no-store";

/** Parsed publications kept per isolate. Each real one is about 5.6 MB of JSON. */
const MAX_PUBLICATIONS = 3;
/** Rendered HTML kept per isolate, by total characters (about 45 KB per page). */
const MAX_HTML_CHARS = 4_000_000;

/** Everything the Worker derives from one publication, computed at most once per isolate. */
export interface Memo {
  publication: Publication;
  /** Lazily filled derived values (serialized bodies, indexes) keyed by name. */
  derived: Map<string, unknown>;
}

const publications = new Map<string, Promise<Memo | null>>();
/**
 * A rendered page: its body, ETag and the response headers to replay (the static _headers rules,
 * such as the Content-Security-Policy, and X-Robots-Tag), without ETag, caching or length headers.
 */
export interface HtmlEntry {
  body: string;
  etag: string;
  headers: Record<string, string>;
}
const html = new Map<string, HtmlEntry>();
let htmlChars = 0;

/** Small LRU touch: re-inserting moves a key to the newest position. */
function touch<K, V>(map: Map<K, V>, key: K, value: V) {
  map.delete(key);
  map.set(key, value);
}

/** The current publication ID, read from D1 on every call (no isolate TTL is added to the HTTP TTL). */
export async function currentPublicationId(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT publication_id FROM current_publication WHERE singleton=1",
  ).first<{ publication_id: string | null }>();
  return row?.publication_id ?? null;
}

/**
 * The memoized publication for an ID, decoded once per isolate. Concurrent cold requests share one
 * decode. Unknown IDs and failures are not memoized.
 */
export async function memoPublication(
  env: Env,
  id: string,
): Promise<{ memo: Memo | null; hit: boolean }> {
  const existing = publications.get(id);
  if (existing) {
    touch(publications, id, existing);
    return { memo: await existing, hit: true };
  }
  const loading = (async () => {
    const row = await env.DB.prepare(
      "SELECT snapshot FROM publications WHERE id=?",
    )
      .bind(id)
      .first<{ snapshot: string }>();
    if (!row) return null;
    const publication = await decodeStoredJson<Publication>(row.snapshot);
    return { publication, derived: new Map() } satisfies Memo;
  })();
  publications.set(id, loading);
  while (publications.size > MAX_PUBLICATIONS)
    publications.delete(publications.keys().next().value!);
  try {
    const memo = await loading;
    if (!memo && publications.get(id) === loading) publications.delete(id);
    return { memo, hit: false };
  } catch (error) {
    if (publications.get(id) === loading) publications.delete(id);
    throw error;
  }
}

/** A value derived from a memoized publication, computed once. */
export function derive<T>(memo: Memo, key: string, make: () => T): T {
  if (!memo.derived.has(key)) memo.derived.set(key, make());
  return memo.derived.get(key) as T;
}

/** Strong ETag over a string body (first 128 bits of SHA-256). */
export async function etagFor(body: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  return `"${Array.from(new Uint8Array(bytes).slice(0, 16), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")}"`;
}

/** True when the request's If-None-Match names this ETag (or "*"). */
export function notModified(request: Request, etag: string): boolean {
  const header = request.headers.get("If-None-Match");
  if (!header) return false;
  return header
    .split(",")
    .map((t) => t.trim().replace(/^W\//, ""))
    .some((t) => t === "*" || t === etag);
}

export const serverTiming = (hit: boolean) =>
  `memo;desc="${hit ? "hit" : "miss"}"`;

/** A cacheable 200 (or a 304 for a matching If-None-Match). */
export function cachedResponse(
  request: Request,
  body: string,
  {
    etag,
    cacheControl,
    contentType,
    hit,
    headers = {},
  }: {
    etag: string;
    cacheControl: string;
    contentType: string;
    hit: boolean;
    headers?: Record<string, string>;
  },
): Response {
  const common = {
    ETag: etag,
    "Cache-Control": cacheControl,
    "Server-Timing": serverTiming(hit),
    "X-Content-Type-Options": "nosniff",
    ...headers,
  };
  if (notModified(request, etag))
    return new Response(null, { status: 304, headers: common });
  return new Response(body, {
    status: 200,
    headers: { ...common, "Content-Type": contentType },
  });
}

/** Rendered public HTML for one publication, origin, path and pin. Only 200 pages are kept. */
export function memoHtml(key: string) {
  const entry = html.get(key);
  if (entry) touch(html, key, entry);
  return entry;
}
export function storeHtml(key: string, entry: HtmlEntry) {
  const previous = html.get(key);
  if (previous) htmlChars -= previous.body.length;
  touch(html, key, entry);
  htmlChars += entry.body.length;
  while (htmlChars > MAX_HTML_CHARS && html.size > 1) {
    const oldest = html.keys().next().value!;
    htmlChars -= html.get(oldest)!.body.length;
    html.delete(oldest);
  }
}
