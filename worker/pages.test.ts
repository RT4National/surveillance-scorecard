import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { appPaths } from "../src/core/routes";
import { members, votes } from "../src/data/demo";
import { demoDataset } from "../src/data/demo-dataset";
import { scoreMember } from "../src/core/scoring";
import {
  createPublicationScoring,
  publishedScore,
} from "../src/core/publication-scores";
import { profileSummary } from "../src/core/summary";
import { splitDisplay } from "../src/features/public/split";
import {
  bannerCopy,
  browseAllLabel,
  finderCopy,
  groupCountLabel,
  headlineCopy,
  heroCopy,
  updatedLabel,
} from "../src/core/copy";
import { escapeHtml } from "./render";
import { encodeStoredJson } from "./storage";
import { digest } from "./validation";
import { gzipSync } from "node:zlib";
import { congressionalFixture } from "../scripts/qualification/fixtures";
import type {
  MemberSlice,
  PublicationIndex,
} from "../src/core/publication-index";
import type { Dataset, Publication } from "../src/core/publication";
import type { Member } from "../src/core/types";

type Score = ReturnType<typeof scoreMember>;

// Runs the bundled Worker in workerd so HTMLRewriter and Response semantics are real.
// ASSETS is a stand-in for the built dist/ directory.
const shell =
  '<!doctype html><html><head><meta name="description" content="x"><meta name="robots" content="noindex, nofollow"><title>Shell</title></head><body><div id="root"></div><script type="module" src="/scorecard/assets/app.js"></script></body></html>';
const csp = "default-src 'self'; frame-ancestors 'none'";
async function startWorker(): Promise<Miniflare> {
  const bundle = await build({
    entryPoints: [new URL("./index.ts", import.meta.url).pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "pages",
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-09-07",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      bindings: {
        ACCESS_ISSUER: "",
        ACCESS_AUDIENCE: "",
        STAFF_ROLES: "{}",
        AI_MODEL: "",
      },
      serviceBindings: {
        ASSETS: async (request) => {
          const { pathname } = new URL(request.url);
          if (pathname === "/index.html")
            return new Response(shell, {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                // As the static _headers rules add them to every asset.
                "Content-Security-Policy": csp,
                "X-Frame-Options": "DENY",
                "X-Content-Type-Options": "nosniff",
              },
            });
          if (pathname === "/scorecard/assets/app.js")
            return new Response("console.log(1)", {
              headers: { "Content-Type": "text/javascript" },
            });
          return new Response(null, { status: 404 });
        },
      },
    }),
  );
  const db = await mf.getD1Database("DB", "pages");
  const dir = new URL("../migrations/", import.meta.url);
  const sql = (
    await Promise.all(
      (await readdir(dir))
        .filter((f) => f.endsWith(".sql"))
        .sort()
        .map((f) => readFile(new URL(f, dir), "utf8")),
    )
  ).join("\n");
  for (const statement of sql.split(/;\s*\n/).reduce<string[]>((out, line) => {
    if (
      out.length &&
      out.at(-1)!.startsWith("CREATE TRIGGER") &&
      !out.at(-1)!.trimEnd().endsWith("END")
    )
      out[out.length - 1] += ";\n" + line;
    else out.push(line);
    return out;
  }, []))
    if (statement.trim()) await db.prepare(statement).run();
  return mf;
}
/** A stored publication fixture with its real dataset digest and frozen scores. */
async function publish(
  id: string,
  dataset: Dataset,
  previousId: string | null,
  createdAt: string,
): Promise<Publication> {
  return {
    id,
    createdAt,
    publishedBy: "fixture",
    previousId,
    summary: `Fixture ${id}`,
    digest: await digest(dataset),
    dataset,
    scoring: await createPublicationScoring(dataset),
  };
}
/** Inserts a publication; the publish trigger moves the current pointer to it. */
async function store(mf: Miniflare, p: Publication) {
  const db = await mf.getD1Database("DB", "pages");
  await db
    .prepare(
      "INSERT INTO drafts(id,dataset,summary,status,author,updated_at) VALUES(?,?,?,'draft','fixture',?)",
    )
    .bind(`draft-${p.id}`, JSON.stringify(p.dataset), p.summary, p.createdAt)
    .run();
  await db
    .prepare(
      "INSERT INTO publications(id,draft_id,snapshot,created_at) VALUES(?,?,?,?)",
    )
    .bind(
      p.id,
      `draft-${p.id}`,
      await encodeStoredJson(p, {
        id: p.id,
        createdAt: p.createdAt,
        publishedBy: p.publishedBy,
        summary: p.summary,
        digest: p.digest,
        previousId: p.previousId,
        datasetId: p.dataset.id,
      }),
      p.createdAt,
    )
    .run();
}
describe("public page routing in the Worker", () => {
  let mf: Miniflare;
  beforeAll(async () => {
    mf = await startWorker();
  }, 60_000);
  afterAll(async () => {
    await mf?.dispose();
  });
  const get = (path: string) =>
    mf.dispatchFetch(`https://scorecard.example${path}`, {
      redirect: "manual",
    });
  async function expectHtml404(path: string) {
    const r = await get(path);
    const text = await r.text();
    expect(r.status, path).toBe(404);
    expect(r.headers.get("content-type"), path).toMatch(/text\/html/);
    expect(text, path).toContain("<title>Page not found");
    expect(text, path).toContain('<div id="root">');
    expect(r.headers.get("x-robots-tag"), path).toBe("noindex, nofollow");
  }
  it("serves a valid member profile with 200 and its meta", async () => {
    const r = await get(`/scorecard/members/${members[0].id}`);
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain(`<title>${members[0].name}`);
  });
  it("serves a valid vote page with 200", async () => {
    const r = await get(`/scorecard/legislation/${votes[0].id}`);
    expect(r.status).toBe(200);
    await r.text();
  });
  it("returns an HTML 404 for an unknown member", async () => {
    await expectHtml404("/scorecard/members/no-such-member");
  });
  it("returns an HTML 404 for unknown legislation", async () => {
    await expectHtml404("/scorecard/legislation/no-such-vote");
  });
  it("returns an HTML 404 for unknown routes", async () => {
    await expectHtml404("/scorecard/no-such-page");
    await expectHtml404("/scorecard/members");
    await expectHtml404("/scorecard/members/a/b");
  });
  it("still serves static assets under /scorecard", async () => {
    const r = await get("/scorecard/assets/app.js");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("console.log(1)");
  });
  it("still refuses an unknown publication", async () => {
    const r = await get("/scorecard/?publication=missing");
    expect(r.status).toBe(404);
    await r.text();
  });
  it("redirects /scorecard/history to the publications archive, keeping the query", async () => {
    for (const path of ["/scorecard/history", "/scorecard/history/"]) {
      const r = await get(`${path}?publication=p1`);
      expect(r.status, path).toBe(301);
      expect(r.headers.get("location"), path).toBe(
        "https://scorecard.example/scorecard/archive?publication=p1",
      );
      await r.text();
    }
  });
  it.each(appPaths())("serves shared route %s with 200", async (path) => {
    const r = await get(path === "/scorecard" ? "/scorecard/" : path);
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/<div id="root"( data-server="[a-z]+")?>/);
  });
});

// Server-rendered first paint: real content inside #root before any script runs.
/** The root element and its contents: everything from <div id="root" to the first <script. */
function rootOf(html: string): string {
  const i = html.indexOf('<div id="root"');
  const j = html.indexOf("<script", i);
  expect(i).toBeGreaterThan(-1);
  expect(j).toBeGreaterThan(i);
  return html.slice(i, j);
}
/** Links in the server HTML that carry ?publication=. */
const pinnedLinks = (root: string) =>
  [...root.matchAll(/href="([^"]*)"/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"))
    .filter((h) => !/^https?:/.test(h))
    .filter((h) =>
      new URL(h, "https://x.example/scorecard/").searchParams.has(
        "publication",
      ),
    );
function expectMember(root: string, dataset: Dataset, m: Member, score: Score) {
  const summary = profileSummary(score, dataset.votes);
  expect(root).toContain('data-server="member"');
  expect(root).toContain(`<h1>${escapeHtml(m.name)}</h1>`);
  expect(root).toContain(escapeHtml(`${m.party} · ${m.state} · ${m.chamber}`));
  expect(root).toContain(`>${escapeHtml(score.grade)}</span>`);
  expect(root).toContain(
    escapeHtml(
      headlineCopy.aligned(summary.aligned, summary.scored, summary.years),
    ),
  );
  const split = splitDisplay(score, m.party);
  if (split.kind === "comparable") {
    expect(root).toContain(`>${split.own.percent}%<`);
    expect(root).toContain(`>${split.other.percent}%<`);
  } else if (split.kind === "unproven")
    expect(root).toContain(escapeHtml(split.counts));
  else expect(root).toContain(escapeHtml(split.message));
}
const demoScore = (m: Member) =>
  scoreMember(
    m,
    demoDataset.votes,
    demoDataset.records,
    demoDataset.rubric,
    demoDataset.asOf,
  );

describe("server-rendered first paint with no publication (fictional demo)", () => {
  let mf: Miniflare;
  beforeAll(async () => {
    mf = await startWorker();
  }, 60_000);
  afterAll(async () => {
    await mf?.dispose();
  });
  const get = (path: string) =>
    mf.dispatchFetch(`https://scorecard.example${path}`);
  it("puts the heading, finder states, count row and demo banner in the home HTML", async () => {
    const r = await get("/scorecard/");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=60");
    const root = rootOf(await r.text());
    expect(root).toContain('data-server="home"');
    expect(root).toContain(`<h1>${escapeHtml(heroCopy.home)}</h1>`);
    expect(root).toContain(escapeHtml(finderCopy.title));
    const active = demoDataset.members.filter((m) => m.status === "active");
    for (const state of new Set(active.map((m) => m.state)))
      expect(root).toContain(`<option>${escapeHtml(state)}</option>`);
    for (const g of [
      "reformer",
      "mixed",
      "surveillance",
      "unproven",
    ] as const) {
      const n = active.filter((m) => demoScore(m).group === g).length;
      expect(root).toContain(escapeHtml(groupCountLabel(g, n)));
    }
    expect(root).toContain(escapeHtml(browseAllLabel(active.length)));
    // One-tap state links: full name as the accessible name, the state in the fragment.
    for (const state of new Set(active.map((m) => m.state))) {
      const fragment = new URLSearchParams({ state }).toString();
      expect(root).toContain(
        `href="#${escapeHtml(fragment)}" aria-label="${escapeHtml(state)}"`,
      );
      // Without JavaScript the same fragment shows the delegation (CSS :target).
      const target = root.indexOf(`id="${escapeHtml(fragment)}"`);
      expect(target, state).toBeGreaterThan(-1);
      const block = root.slice(target, root.indexOf("</ul></div>", target));
      for (const m of active.filter((m) => m.state === state))
        expect(block).toContain(`<strong>${escapeHtml(m.name)}</strong>`);
    }
    expect(root).toContain(escapeHtml(bannerCopy.preview));
    expect(root).toContain(escapeHtml(bannerCopy.fictional));
    expect(root).not.toContain("Loading the published scorecard");
    expect(pinnedLinks(root)).toEqual([]);
  });
  it("puts the member's name, grade, aligned count and split in the profile HTML", async () => {
    for (const m of demoDataset.members.slice(0, 4)) {
      const r = await get(`/scorecard/members/${m.id}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("public, max-age=60");
      const root = rootOf(await r.text());
      expectMember(root, demoDataset, m, demoScore(m));
      expect(root).toContain(escapeHtml(bannerCopy.fictional));
    }
  });
  it("leaves other pages to the app", async () => {
    const r = await get("/scorecard/methodology");
    expect(rootOf(await r.text())).toBe('<div id="root"></div>');
  });
});

describe("server-rendered first paint from stored publications", () => {
  let mf: Miniflare;
  const tricky = 'Ada <b>Bold</b> & "Quote" <script>alert(1)</script>';
  const withTricky = (d: Dataset): Dataset => ({
    ...d,
    members: d.members.map((m, i) => (i === 0 ? { ...m, name: tricky } : m)),
  });
  const source = {
    url: "https://clerk.house.gov/",
    retrievedAt: "2026-09-01T00:00:00Z",
    sha256: "0".repeat(64),
    kind: "votes" as const,
  };
  const older = withTricky({
    ...demoDataset,
    id: "placeholder-1",
    sources: [source],
  });
  const latest = withTricky({
    ...demoDataset,
    id: "real-1",
    demo: false,
    sources: [source],
  });
  let p2: Publication;
  beforeAll(async () => {
    mf = await startWorker();
    await store(
      mf,
      await publish("pub-older", older, null, "2026-09-01T00:00:00Z"),
    );
    p2 = await publish(
      "pub-latest",
      latest,
      "pub-older",
      "2026-09-08T00:00:00Z",
    );
    await store(mf, p2);
  }, 60_000);
  afterAll(async () => {
    await mf?.dispose();
  });
  const get = (path: string) =>
    mf.dispatchFetch(`https://scorecard.example${path}`);
  it("escapes every injected name", async () => {
    for (const path of [
      "/scorecard/",
      `/scorecard/members/${latest.members[0].id}`,
    ]) {
      const root = rootOf(await (await get(path)).text());
      expect(root, path).not.toContain("<b>Bold");
      expect(root, path).not.toContain("alert(1)</script>");
    }
    const profile = rootOf(
      await (await get(`/scorecard/members/${latest.members[0].id}`)).text(),
    );
    expect(profile).toContain(escapeHtml(tricky));
  });
  it("renders the latest publication with the published banner and clean links", async () => {
    const m = latest.members[1];
    const root = rootOf(await (await get(`/scorecard/members/${m.id}`)).text());
    expectMember(root, latest, m, publishedScore(p2, m));
    expect(root).toContain(escapeHtml(bannerCopy.published));
    expect(root).toContain(
      escapeHtml(bannerCopy.publishedLine(latest.asOf, p2.id)),
    );
    expect(root).not.toContain(escapeHtml(bannerCopy.fictional));
    expect(pinnedLinks(root)).toEqual([]);
  });
  it("renders a pinned older publication with its placeholder banner and pinned links", async () => {
    const root = rootOf(
      await (await get("/scorecard/?publication=pub-older")).text(),
    );
    expect(root).toContain(escapeHtml(bannerCopy.preview));
    expect(root).toContain(escapeHtml(bannerCopy.placeholder));
    expect(root).not.toContain(escapeHtml(bannerCopy.fictional));
    const links = pinnedLinks(root);
    expect(links.length).toBeGreaterThan(3);
    for (const l of links)
      expect(
        new URL(l, "https://x.example/scorecard/").searchParams.get(
          "publication",
        ),
      ).toBe("pub-older");
  });
  it("still returns 404 for a member not in the publication", async () => {
    const r = await get("/scorecard/members/no-such-member");
    expect(r.status).toBe(404);
    expect(rootOf(await r.text())).toBe('<div id="root"></div>');
  });
});

// HTTP caching and the in-isolate publication memo. Published publications are immutable, so a
// response for one ID may be cached for a year; "latest" and HTML are short; staff, drafts,
// corrections and unknown publications are never cached.
describe("caching", () => {
  let mf: Miniflare;
  const first = { ...demoDataset, id: "cache-1" };
  const second = { ...demoDataset, id: "cache-2" };
  beforeAll(async () => {
    mf = await startWorker();
    await store(
      mf,
      await publish("cache-pub-1", first, null, "2026-09-01T00:00:00Z"),
    );
  }, 60_000);
  afterAll(async () => {
    await mf?.dispose();
  });
  const get = (path: string, headers: Record<string, string> = {}) =>
    mf.dispatchFetch(`https://scorecard.example${path}`, {
      headers,
      redirect: "manual",
    });
  const immutable = "public, max-age=31536000, immutable";
  const short = "public, max-age=60";
  it("memoizes a publication in the isolate: the second request is a hit", async () => {
    // "latest" never goes to the edge cache, so a hit here is the isolate memo.
    const a = await get("/scorecard/api/publications/latest");
    expect(a.status).toBe(200);
    expect(a.headers.get("server-timing")).toBe('memo;desc="miss"');
    const b = await get("/scorecard/api/publications/latest");
    expect(b.headers.get("server-timing")).toBe('memo;desc="hit"');
    expect(await b.json()).toEqual(await a.json());
  });
  it("marks a publication by ID immutable, with an ETag that answers 304", async () => {
    const r = await get("/scorecard/api/publications/cache-pub-1");
    expect(r.headers.get("cache-control")).toBe(immutable);
    const etag = r.headers.get("etag");
    expect(etag).toMatch(/^"[^"]+"$/);
    await r.text();
    const again = await get("/scorecard/api/publications/cache-pub-1", {
      "If-None-Match": etag!,
    });
    expect(again.status).toBe(304);
    expect(again.headers.get("cache-control")).toBe(immutable);
    expect(await again.text()).toBe("");
  });
  it("gives the latest pointer a short TTL", async () => {
    const r = await get("/scorecard/api/publications/latest");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe(short);
    expect(((await r.json()) as Publication).id).toBe("cache-pub-1");
  });
  it("never caches unknown publications, staff routes, drafts or corrections", async () => {
    for (const path of [
      "/scorecard/api/publications/missing",
      "/scorecard/api/staff/session",
      "/scorecard/api/staff/drafts",
      "/scorecard/api/staff/drafts/some-draft",
      "/scorecard/api/staff/status",
    ]) {
      const r = await get(path);
      expect(r.status, path).toBeGreaterThanOrEqual(400);
      expect(r.headers.get("cache-control"), path).toBe("no-store");
      await r.text();
    }
    const correction = await mf.dispatchFetch(
      "https://scorecard.example/scorecard/api/corrections",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicationId: "cache-pub-1", message: "x" }),
      },
    );
    expect(correction.headers.get("cache-control")).toBe("no-store");
    await correction.text();
  });
  it("caches public HTML briefly with an ETag, and never the editor or a 404", async () => {
    const home = await get("/scorecard/");
    expect(home.status).toBe(200);
    expect(home.headers.get("cache-control")).toBe(short);
    const etag = home.headers.get("etag");
    expect(etag).toMatch(/^"[^"]+"$/);
    const html = await home.text();
    expect(html).toContain('data-server="home"');
    const again = await get("/scorecard/", { "If-None-Match": etag! });
    expect(again.status).toBe(304);
    await again.text();
    // A memoized page is served whole on the next request too.
    const repeat = await get("/scorecard/");
    expect(repeat.headers.get("server-timing")).toBe('memo;desc="hit"');
    // The shell's static security headers (public/_headers) survive the memo.
    for (const r of [home, repeat]) {
      expect(r.headers.get("content-security-policy")).toBe(csp);
      expect(r.headers.get("x-frame-options")).toBe("DENY");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    }
    expect(await repeat.text()).toBe(html);
    for (const path of [
      "/scorecard/editor",
      "/scorecard/no-such-page",
      "/scorecard/members/no-such-member",
      "/scorecard/?publication=missing",
    ]) {
      const r = await get(path);
      expect(r.headers.get("cache-control"), path).toBe("no-store");
      await r.text();
    }
  });
  it("shows a new publication on the next latest request and keeps the old one by ID", async () => {
    await store(
      mf,
      await publish(
        "cache-pub-2",
        second,
        "cache-pub-1",
        "2026-09-08T00:00:00Z",
      ),
    );
    const latest = await get("/scorecard/api/publications/latest");
    expect(((await latest.json()) as Publication).id).toBe("cache-pub-2");
    expect(await (await get("/scorecard/")).text()).toContain(
      escapeHtml(updatedLabel("2026-09-08T00:00:00Z")),
    );
    const old = await get("/scorecard/api/publications/cache-pub-1");
    expect(((await old.json()) as Publication).id).toBe("cache-pub-1");
  });
});

// The slim index (landing, finder, directory) and the per-member evidence slice (profiles).
describe("slim publication views", () => {
  let mf: Miniflare;
  // Congressional scale: 535 members, 80 roll calls, portraits named like the real cache.
  const scale = congressionalFixture(80);
  const big: Dataset = {
    ...scale,
    id: "scale-80",
    members: scale.members.map((m, i) => ({
      ...m,
      status: i % 50 === 49 ? ("inactive" as const) : m.status,
      portrait: {
        url: `/scorecard/portraits/${m.id}-${(i * 2654435761 + 1)
          .toString(16)
          .padStart(8, "0")
          .repeat(8)
          .slice(0, 64)}.jpg`,
        attribution: "Photo: U.S. House Office of Photography, public domain",
        rights: "public-domain" as const,
        rightsSource: `https://commons.wikimedia.org/wiki/File:${m.id}.jpg`,
        reviewedBy: "wikimedia-commons-metadata; user-directed 2026-10-15",
      },
    })),
  };
  let p: Publication;
  beforeAll(async () => {
    mf = await startWorker();
    const broken = await publish(
      "slim-broken",
      { ...demoDataset, id: "broken" },
      null,
      "2026-09-01T00:00:00Z",
    );
    await store(mf, { ...broken, digest: "f".repeat(64) });
    // Stored last, so it is the latest.
    p = await publish("slim-pub", big, "slim-broken", "2026-09-02T00:00:00Z");
    await store(mf, p);
  }, 60_000);
  afterAll(async () => {
    await mf?.dispose();
  });
  const get = (path: string) =>
    mf.dispatchFetch(`https://scorecard.example/scorecard/api${path}`);
  it("serves an index with active members, frozen headline scores and its binding", async () => {
    const r = await get("/publications/slim-pub/index");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(r.headers.get("etag")).toMatch(/^"[^"]+"$/);
    const index = (await r.json()) as PublicationIndex;
    expect(index.format).toBe(1);
    expect(index.publication).toMatchObject({
      id: "slim-pub",
      digest: p.digest,
      scoringDigest: p.scoring!.digest,
      createdAt: p.createdAt,
    });
    expect(index.dataset).toMatchObject({
      id: big.id,
      asOf: big.asOf,
      demo: big.demo,
      sourceCount: big.sources.length,
    });
    expect(index.dataset.votes).toEqual(big.votes);
    const active = big.members.filter((m) => m.status === "active");
    expect(index.members).toEqual(active);
    expect(Object.keys(index.scores!).sort()).toEqual(
      active.map((m) => m.id).sort(),
    );
    for (const m of active.slice(0, 20)) {
      const { evidence, ...frozen } = publishedScore(p, m);
      const s = index.scores![m.id];
      expect(s).toEqual({
        ...frozen,
        actions: {
          votes: evidence.filter((e) => e.scored).length,
          cosponsorships: 0,
        },
      });
      expect(s).not.toHaveProperty("evidence");
    }
    // No evidence rows, records or affiliations in the index.
    const text = JSON.stringify(index);
    expect(text).not.toContain('"partyAtVote"');
    expect(text).not.toContain('"records"');
    expect(text).not.toContain('"affiliations"');
  });
  it("keeps the index within its size budget", async () => {
    const text = await (await get("/publications/slim-pub/index")).text();
    const full = await (await get("/publications/slim-pub")).text();
    const gz = gzipSync(text).byteLength;
    // Tens of KB gzipped at congressional scale, and a small fraction of the full publication.
    expect(gz).toBeLessThan(60_000);
    expect(gz * 4).toBeLessThan(gzipSync(full).byteLength);
  });
  it("gives the latest index a short TTL", async () => {
    const r = await get("/publications/latest/index");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=60");
    expect(((await r.json()) as PublicationIndex).publication.id).toBe(
      "slim-pub",
    );
  });
  it("refuses slim views of a publication whose digest does not verify", async () => {
    for (const path of [
      "/publications/slim-broken/index",
      `/publications/slim-broken/members/${demoDataset.members[0].id}`,
    ]) {
      const r = await get(path);
      expect(r.status, path).toBe(503);
      expect(r.headers.get("cache-control"), path).toBe("no-store");
      await r.text();
    }
  });
  it("serves one member's evidence with its binding, including a former member", async () => {
    for (const m of [
      big.members[3],
      big.members.find((m) => m.status !== "active")!,
    ]) {
      const r = await get(`/publications/slim-pub/members/${m.id}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
      const slice = (await r.json()) as MemberSlice;
      expect(slice.publication).toEqual({
        id: "slim-pub",
        digest: p.digest,
        scoringDigest: p.scoring!.digest,
      });
      expect(slice.member).toEqual(m);
      expect(slice.records).toEqual(
        big.records.filter((r) => r.memberId === m.id),
      );
      expect(slice.score).toEqual(p.scoring!.scores[m.id]);
    }
  });
  it("returns 404, never cached, for an unknown member or publication", async () => {
    for (const path of [
      "/publications/slim-pub/members/no-such-member",
      "/publications/no-such-pub/members/x",
      "/publications/no-such-pub/index",
    ]) {
      const r = await get(path);
      expect(r.status, path).toBe(404);
      expect(r.headers.get("cache-control"), path).toBe("no-store");
      await r.text();
    }
  });
  it("names the publication and digest on the page root for the app to check", async () => {
    const html = await (
      await mf.dispatchFetch(
        "https://scorecard.example/scorecard/?publication=slim-pub",
      )
    ).text();
    expect(html).toContain(
      `<div id="root" data-publication="slim-pub" data-digest="${p.digest}"`,
    );
  });
});
