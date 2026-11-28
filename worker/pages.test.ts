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
} from "../src/core/copy";
import { escapeHtml } from "./render";
import { encodeStoredJson } from "./storage";
import type { Dataset, Publication } from "../src/core/publication";
import type { Member } from "../src/core/types";

type Score = ReturnType<typeof scoreMember>;

// Runs the bundled Worker in workerd so HTMLRewriter and Response semantics are real.
// ASSETS is a stand-in for the built dist/ directory.
const shell =
  '<!doctype html><html><head><meta name="description" content="x"><meta name="robots" content="noindex, nofollow"><title>Shell</title></head><body><div id="root"></div><script type="module" src="/scorecard/assets/app.js"></script></body></html>';
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
              headers: { "Content-Type": "text/html; charset=utf-8" },
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
    expect(r.headers.get("cache-control")).toBe("no-store");
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
    expect(root).toContain(escapeHtml(bannerCopy.preview));
    expect(root).toContain(escapeHtml(bannerCopy.fictional));
    expect(root).not.toContain("Loading the published scorecard");
    expect(pinnedLinks(root)).toEqual([]);
  });
  it("puts the member's name, grade, aligned count and split in the profile HTML", async () => {
    for (const m of demoDataset.members.slice(0, 4)) {
      const r = await get(`/scorecard/members/${m.id}`);
      expect(r.status).toBe(200);
      expect(r.headers.get("cache-control")).toBe("no-store");
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
  const publish = async (
    id: string,
    dataset: Dataset,
    previousId: string | null,
    createdAt: string,
  ): Promise<Publication> => ({
    id,
    createdAt,
    publishedBy: "fixture",
    previousId,
    summary: `Fixture ${id}`,
    digest: "0".repeat(64),
    dataset,
    scoring: await createPublicationScoring(dataset),
  });
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
