// Test support: a fetch stand-in for the public publication API, serving the full publication,
// its slim index and member slices with the same builders the Worker uses.
import type { Publication, PublicationSummary } from "../core/publication";
import {
  buildMemberSlice,
  buildPublicationIndex,
} from "../core/publication-index";

export interface FakeApi {
  (input: string | URL | Request): Promise<Response>;
  /** Paths requested so far, in order. */
  paths: string[];
}

/**
 * `publications` newest first; the first is "latest". `list` overrides the list response (null makes
 * it fail). `hold` delays matching requests until `release`; later requests are not held.
 */
export function fakeApi(
  publications: Publication[],
  options: {
    list?: PublicationSummary[] | null;
    currentId?: string | null;
    hold?: (path: string) => boolean;
  } = {},
): FakeApi & { release: () => void } {
  const held: (() => void)[] = [];
  let released = false;
  const paths: string[] = [];
  const respond = (path: string): Response => {
    if (path === "/scorecard/api/publications") {
      if (options.list === null) throw new Error("offline");
      return Response.json({
        currentId:
          options.currentId === undefined
            ? (publications[0]?.id ?? null)
            : options.currentId,
        publications:
          options.list ??
          publications.map((p) => ({
            id: p.id,
            createdAt: p.createdAt,
            summary: p.summary,
            previousId: p.previousId,
          })),
      });
    }
    const m = path.match(
      /^\/scorecard\/api\/publications\/([^/]+)(?:\/(index)|\/members\/([^/]+))?$/,
    );
    const id = m && decodeURIComponent(m[1]);
    const p =
      id === "latest" ? publications[0] : publications.find((p) => p.id === id);
    if (!m || !p) return Response.json({ error: "Not found" }, { status: 404 });
    if (m[2]) return Response.json(buildPublicationIndex(p));
    if (m[3]) {
      const slice = buildMemberSlice(p, decodeURIComponent(m[3]));
      return slice
        ? Response.json(slice)
        : Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(p);
  };
  const api = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : String(input);
    const path = new URL(url, "https://scorecard.example").pathname;
    paths.push(path);
    if (!released && options.hold?.(path))
      await new Promise<void>((r) => held.push(r));
    return respond(path);
  }) as FakeApi & { release: () => void };
  api.paths = paths;
  api.release = () => {
    released = true;
    held.splice(0).forEach((r) => r());
  };
  return api;
}
