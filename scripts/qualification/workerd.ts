import { encodeStoredJson } from "../../worker/storage";
import { digest } from "../../worker/validation";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { congressionalFixture } from "./fixtures";
import {
  createPublicationScoring,
  verifyPublicationScoring,
} from "../../src/core/publication-scores";
import type { Publication } from "../../src/core/publication";

const bundle = await build({
  entryPoints: [new URL("../../worker/index.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const pair = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const jwk = {
  ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
  kid: "workerd-capacity",
};
const issuer = "https://capacity.cloudflareaccess.com";
const roles = {
  "author@example.invalid": "editor",
  "reviewer@example.invalid": "reviewer",
  "publisher@example.invalid": "publisher",
};
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "capacity-workerd",
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: "2026-09-07",
    compatibilityFlags: ["nodejs_compat"],
    d1Databases: ["DB"],
    bindings: {
      ACCESS_ISSUER: issuer,
      ACCESS_AUDIENCE: "workerd-capacity",
      STAFF_ROLES: JSON.stringify(roles),
      AI_MODEL: "",
    },
    serviceBindings: {
      ASSETS: () =>
        new Response(
          '<!doctype html><html><head><title>Local fixture</title><meta name="description"></head><body><div id="root"></div></body></html>',
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    },
    outboundService: async (request) => {
      if (request.url !== `${issuer}/cdn-cgi/access/certs`)
        return new Response("Unexpected outbound request refused", {
          status: 403,
        });
      return Response.json({ keys: [jwk] });
    },
  }),
);
try {
  const db = await mf.getD1Database("DB", "capacity-workerd");
  const dir = new URL("../../migrations/", import.meta.url);
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
  const encode = (v: unknown) =>
    Buffer.from(JSON.stringify(v)).toString("base64url");
  const tokens: Record<string, string> = {};
  for (const email of Object.keys(roles)) {
    const data = `${encode({ alg: "RS256", kid: "workerd-capacity" })}.${encode({ iss: issuer, aud: ["workerd-capacity"], email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(data),
    );
    tokens[email] = `${data}.${Buffer.from(sig).toString("base64url")}`;
  }
  const send = (
    path: string,
    method = "GET",
    body?: unknown,
    email = "author@example.invalid",
  ) =>
    mf.dispatchFetch(`https://capacity.example/scorecard/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Cf-Access-Jwt-Assertion": tokens[email],
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  assert.equal(
    (
      await mf.dispatchFetch(
        "https://capacity.example/scorecard/api/staff/drafts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        },
      )
    ).status,
    401,
  );
  let base: string | null = null;
  for (const count of [12, 50, 250] as const) {
    const dataset = congressionalFixture(count);
    const started = performance.now();
    const created = await send("/staff/drafts", "POST", {
      dataset,
      summary: `FICTIONAL workerd ${count}`,
      basePublicationId: base,
    });
    assert.equal(created.status, 201, await created.clone().text());
    const d = (await created.json()) as { id: string };
    assert.equal(
      (
        await send(
          `/staff/drafts/${d.id}/review`,
          "POST",
          { version: 1 },
          "reviewer@example.invalid",
        )
      ).status,
      200,
    );
    const publishStart = performance.now();
    const response = await send(
      `/staff/drafts/${d.id}/publish`,
      "POST",
      { version: 2 },
      "publisher@example.invalid",
    );
    assert.equal(
      response.status,
      201,
      response.status === 201 ? "" : await response.text(),
    );
    const published = (await response.json()) as Publication;
    const publishMs = performance.now() - publishStart;
    const readStart = performance.now();
    const restoredResponse = await send(`/publications/${published.id}`);
    assert.equal(restoredResponse.status, 200);
    const restored = (await restoredResponse.json()) as Publication;
    await verifyPublicationScoring(restored);
    assert.deepEqual(restored, published);
    const readMs = performance.now() - readStart;
    const size = await db
      .prepare(
        "SELECT length(CAST(snapshot AS BLOB)) AS bytes FROM publications WHERE id=?",
      )
      .bind(published.id)
      .first<{ bytes: number }>();
    assert(size && size.bytes < 1_800_000);
    console.log(
      JSON.stringify({
        environment:
          "local workerd handler + local D1; RSA fixture authentication",
        fictional: true,
        members: 535,
        rollcalls: count,
        records: dataset.records.length,
        publicationStoredBytes: size.bytes,
        workflowMs: Math.round(performance.now() - started),
        publishMs: Math.round(publishMs),
        loadAndClientVerifyMs: Math.round(readMs),
        heapMeasurement: "not exposed; host Node heap is not isolate memory",
      }),
    );
    base = published.id;
  }
  // Exercise the publishable profile path only inside this disposable workerd/D1
  // instance. No real legislators or claims are involved.
  const profileFixture = congressionalFixture(250);
  profileFixture.id = "local-profile-capacity-fixture";
  profileFixture.demo = false;
  profileFixture.votes = profileFixture.votes.map((vote) => ({
    ...vote,
    source: `https://records.example.invalid/${encodeURIComponent(vote.id)}`,
  }));
  const profile: Publication = {
    id: "local-frozen-profile-capacity",
    createdAt: new Date().toISOString(),
    previousId: base,
    publishedBy: "fixture@example.invalid",
    summary: "Fictional profile fixture, local capacity check only",
    digest: await digest(profileFixture),
    dataset: profileFixture,
    scoring: await createPublicationScoring(profileFixture),
  };
  const { dataset: _dataset, scoring: _scoring, ...metadata } = profile;
  const snapshot = await encodeStoredJson(profile, {
    ...metadata,
    datasetId: profileFixture.id,
  });
  // Seed the read-path fixture directly so the synthetic source never has to
  // impersonate an official capture in the editorial validation workflow.
  const storedDraft = await encodeStoredJson(profileFixture, {
    id: profileFixture.id,
    asOf: profileFixture.asOf,
    demo: profileFixture.demo,
  });
  await db.batch([
    db
      .prepare(
        "INSERT INTO drafts(id,dataset,summary,status,author,updated_at,base_publication_id) VALUES(?,?,?,'draft',?,?,?)",
      )
      .bind(
        "local-profile-capacity-draft",
        storedDraft,
        profile.summary,
        profile.publishedBy,
        profile.createdAt,
        base,
      ),
    db
      .prepare(
        "INSERT INTO publications(id,draft_id,snapshot,created_at) VALUES(?,?,?,?)",
      )
      .bind(
        profile.id,
        "local-profile-capacity-draft",
        snapshot,
        profile.createdAt,
      ),
  ]);
  base = profile.id;
  const profileUrl = `https://capacity.example/scorecard/members/${encodeURIComponent(profileFixture.members[0].id)}?publication=${encodeURIComponent(profile.id)}`;
  const fetchProfile = async () => {
    const start = performance.now();
    const response = await mf.dispatchFetch(profileUrl);
    const html = await response.text();
    return { response, html, elapsed: Math.round(performance.now() - start) };
  };
  const cold = await fetchProfile();
  assert.equal(cold.response.status, 200);
  assert.match(cold.html, /data-frozen-summary/);
  assert.match(cold.html, /https:\/\/records\.example\.invalid\//);
  assert.match(
    cold.response.headers.get("Server-Timing") ?? "",
    /memo;desc="miss"/,
  );
  const warm = await fetchProfile();
  assert.equal(warm.response.status, 200);
  assert.equal(warm.html, cold.html);
  assert.match(
    warm.response.headers.get("Server-Timing") ?? "",
    /memo;desc="hit"/,
  );
  console.log(
    JSON.stringify({
      environment: "local workerd + local D1; synthetic frozen profile",
      fictional: true,
      rollcalls: profileFixture.votes.length,
      records: profileFixture.records.length,
      profileHtmlBytes: Buffer.byteLength(cold.html),
      coldProfileWallMs: cold.elapsed,
      warmProfileWallMs: warm.elapsed,
      coldMemo: cold.response.headers.get("Server-Timing"),
      warmMemo: warm.response.headers.get("Server-Timing"),
      cpuMeasurement: "not exposed by the local request harness",
    }),
  );
  const boundary = congressionalFixture(390);
  boundary.asOf = "2027-12-31";
  const staged = await send("/staff/drafts", "POST", {
    dataset: boundary,
    summary: "FICTIONAL capacity boundary",
    basePublicationId: base,
  });
  assert.equal(staged.status, 201);
  const boundaryDraft = (await staged.json()) as { id: string };
  const refused = await send(
    `/staff/drafts/${boundaryDraft.id}/review`,
    "POST",
    { version: 1 },
    "reviewer@example.invalid",
  );
  assert.equal(
    refused.status,
    413,
    refused.status === 413 ? "" : await refused.text(),
  );
  assert.equal(
    (
      await db
        .prepare("SELECT status FROM drafts WHERE id=?")
        .bind(boundaryDraft.id)
        .first<{ status: string }>()
    )?.status,
    "draft",
  );
  console.log(
    JSON.stringify({
      environment: "local workerd",
      fictional: true,
      rollcalls: 390,
      reviewStatus: refused.status,
      draftStatus: "draft",
      purpose: "Reject expanded-publication overflow before approval",
    }),
  );
} finally {
  await mf.dispose();
}
