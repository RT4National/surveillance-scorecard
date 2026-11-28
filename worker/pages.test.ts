import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { appPaths } from "../src/core/routes";
import { members, votes } from "../src/data/demo";

// Runs the bundled Worker in workerd so HTMLRewriter and Response semantics are real.
// ASSETS is a stand-in for the built dist/ directory.
const shell =
  '<!doctype html><html><head><meta name="description" content="x"><meta name="robots" content="noindex, nofollow"><title>Shell</title></head><body><div id="root"></div></body></html>';
describe("public page routing in the Worker", () => {
  let mf: Miniflare;
  beforeAll(async () => {
    const bundle = await build({
      entryPoints: [new URL("./index.ts", import.meta.url).pathname],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
    });
    mf = new Miniflare(
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
    for (const statement of sql
      .split(/;\s*\n/)
      .reduce<string[]>((out, line) => {
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
    expect(await r.text()).toContain('<div id="root">');
  });
});
