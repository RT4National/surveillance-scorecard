import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import * as auth from "./auth";
import worker from "./index";
import { congressionalFixture } from "../scripts/qualification/fixtures";
import { verifyPublicationScoring } from "../src/core/publication-scores";
import type { Publication, Dataset } from "../src/core/publication";
describe("Fictional congressional-scale local D1 qualification", () => {
  let mf: Miniflare;
  let env: Env;
  beforeAll(async () => {
    mf = new Miniflare(
      convertV4MiniflareOptions({
        name: "capacity",
        modules: true,
        script: 'export default {fetch(){return new Response("ok")}}',
        d1Databases: ["DB"],
      }),
    );
    const db = await mf.getD1Database("DB", "capacity");
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
    env = {
      DB: db,
      ACCESS_ISSUER: "",
      ACCESS_AUDIENCE: "",
      STAFF_ROLES: "{}",
    } as Env;
  }, 30000);
  afterAll(async () => {
    vi.restoreAllMocks();
    await mf?.dispose();
  });
  const send = (path: string, method = "GET", payload?: unknown) =>
    worker.fetch(
      new Request(`https://capacity.example/scorecard/api${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      }),
      env,
    );
  for (const count of [12, 50, 250] as const)
    it(`roundtrips 535 members and ${count} rollcalls without oversized D1 rows`, async () => {
      const latest = await send("/publications/latest");
      const base =
        latest.status === 404
          ? null
          : ((await latest.json()) as Publication).id;
      const dataset = congressionalFixture(count);
      const identity = vi
        .spyOn(auth, "authenticate")
        .mockResolvedValue({ email: "author@example.org", role: "editor" });
      const started = performance.now();
      const created = await send("/staff/drafts", "POST", {
        dataset,
        summary: `FICTIONAL capacity ${count}`,
        basePublicationId: base,
      });
      expect(created.status).toBe(201);
      const draft = (await created.json()) as { id: string };
      const detail = await send(`/staff/drafts/${draft.id}`);
      expect(
        ((await detail.json()) as { dataset: Dataset }).dataset.records,
      ).toHaveLength(dataset.records.length);
      const drafts = (await (await send("/staff/drafts")).json()) as Record<
        string,
        unknown
      >[];
      expect(drafts.every((d) => !Object.hasOwn(d, "dataset"))).toBe(true);
      identity.mockResolvedValue({
        email: "reviewer@example.org",
        role: "reviewer",
      });
      expect(
        (await send(`/staff/drafts/${draft.id}/review`, "POST", { version: 1 }))
          .status,
      ).toBe(200);
      identity.mockResolvedValue({
        email: "publisher@example.org",
        role: "publisher",
      });
      const published = await send(
        `/staff/drafts/${draft.id}/publish`,
        "POST",
        { version: 2 },
      );
      expect(published.status).toBe(201);
      const snapshot = (await published.json()) as Publication;
      const loadStart = performance.now();
      const restored = (await (
        await send(`/publications/${snapshot.id}`)
      ).json()) as Publication;
      await verifyPublicationScoring(restored);
      expect(restored).toEqual(snapshot);
      const rows = await env.DB.prepare(
        "SELECT length(CAST(snapshot AS BLOB)) AS bytes FROM publications WHERE id=?",
      )
        .bind(snapshot.id)
        .first<{ bytes: number }>();
      expect(rows!.bytes).toBeLessThan(1_800_000);
      const listing = (await (await send("/publications")).json()) as {
        publications: { id: string; datasetId: string }[];
      };
      expect(
        listing.publications.find((p) => p.id === snapshot.id)?.datasetId,
      ).toBe(dataset.id);
      console.log(
        JSON.stringify({
          qualification: "local-D1-Node-handler",
          fictional: true,
          rollcalls: count,
          records: dataset.records.length,
          rowBytes: rows!.bytes,
          workflowMs: Math.round(performance.now() - started),
          loadAndVerifyMs: Math.round(performance.now() - loadStart),
        }),
      );
      identity.mockRestore();
    }, 60000);
  it("keeps a stageable but over-capacity history unreviewed with a precise error", async () => {
    const base = (await (
      await send("/publications/latest")
    ).json()) as Publication;
    const dataset = congressionalFixture(390);
    dataset.asOf = "2027-12-31";
    const identity = vi
      .spyOn(auth, "authenticate")
      .mockResolvedValue({ email: "author@example.org", role: "editor" });
    const created = await send("/staff/drafts", "POST", {
      dataset,
      summary: "FICTIONAL over-capacity boundary",
      basePublicationId: base.id,
    });
    expect(created.status).toBe(201);
    const d = (await created.json()) as { id: string };
    identity.mockResolvedValue({
      email: "reviewer@example.org",
      role: "reviewer",
    });
    const review = await send(`/staff/drafts/${d.id}/review`, "POST", {
      version: 1,
    });
    expect(review.status).toBe(413);
    expect(await review.json()).toMatchObject({
      error: expect.stringContaining("Review refused"),
    });
    expect(
      await env.DB.prepare(
        "SELECT status,version,reviewer FROM drafts WHERE id=?",
      )
        .bind(d.id)
        .first(),
    ).toEqual({ status: "draft", version: 1, reviewer: null });
    expect(
      ((await (await send("/publications/latest")).json()) as Publication).id,
    ).toBe(base.id);
    identity.mockRestore();
  }, 60000);
});
