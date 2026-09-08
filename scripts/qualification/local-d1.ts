import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import worker from "../../worker/index";
import type { Publication } from "../../src/core/publication";
import { verifyPublicationScoring } from "../../src/core/publication-scores";
import { congressionalFixture } from "./fixtures";

// Handler executes in Node; SQL executes in local workerd/D1. These are not edge timings.
const mf = new Miniflare(
  convertV4MiniflareOptions({
    name: "qualification",
    modules: true,
    script:
      'export default {fetch(){return new Response("local qualification")}}',
    d1Databases: ["DB"],
  }),
);
const originalFetch = globalThis.fetch;
try {
  const db = await mf.getD1Database("DB", "qualification");
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
  const keys = await crypto.subtle.generateKey(
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
    ...(await crypto.subtle.exportKey("jwk", keys.publicKey)),
    kid: "local-capacity",
  };
  const issuer = "https://capacity.cloudflareaccess.com";
  globalThis.fetch = async (input, init) =>
    String(input) === `${issuer}/cdn-cgi/access/certs`
      ? Response.json({ keys: [jwk] })
      : originalFetch(input, init);
  const roles = {
    "author@example.invalid": "editor",
    "reviewer@example.invalid": "reviewer",
    "publisher@example.invalid": "publisher",
  };
  const env = {
    DB: db,
    ACCESS_ISSUER: issuer,
    ACCESS_AUDIENCE: "local-capacity",
    STAFF_ROLES: JSON.stringify(roles),
  } as Env;
  async function token(email: string) {
    const encode = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url");
    const value = `${encode({ alg: "RS256", kid: "local-capacity" })}.${encode({ iss: issuer, aud: ["local-capacity"], email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    const sig = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keys.privateKey,
      new TextEncoder().encode(value),
    );
    return `${value}.${Buffer.from(sig).toString("base64url")}`;
  }
  const tokens = Object.fromEntries(
    await Promise.all(
      Object.keys(roles).map(async (email) => [email, await token(email)]),
    ),
  );
  const send = (
    path: string,
    method = "GET",
    body?: unknown,
    email = "author@example.invalid",
  ) =>
    worker.fetch(
      new Request(`https://capacity.example/scorecard/api${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Cf-Access-Jwt-Assertion": tokens[email],
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );
  let base: string | null = null;
  for (const count of [12, 50, 250] as const) {
    const dataset = congressionalFixture(count);
    const started = performance.now();
    const created = await send("/staff/drafts", "POST", {
      dataset,
      summary: `FICTIONAL capacity ${count}`,
      basePublicationId: base,
    });
    assert.equal(created.status, 201);
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
    assert.equal(response.status, 201);
    const snapshot = (await response.json()) as Publication;
    const publishMs = performance.now() - publishStart;
    const readStart = performance.now();
    const recovered = (await (
      await send(`/publications/${snapshot.id}`)
    ).json()) as Publication;
    await verifyPublicationScoring(recovered);
    assert.deepEqual(recovered, snapshot);
    const readMs = performance.now() - readStart;
    const sizes = await db
      .prepare(
        "SELECT length(CAST(drafts.dataset AS BLOB)) AS draftBytes,length(CAST(publications.snapshot AS BLOB)) AS publicationBytes FROM drafts JOIN publications ON drafts.id=publications.draft_id WHERE drafts.id=?",
      )
      .bind(d.id)
      .first<{ draftBytes: number; publicationBytes: number }>();
    assert(
      sizes &&
        sizes.draftBytes < 1_800_000 &&
        sizes.publicationBytes < 1_800_000,
    );
    console.log(
      JSON.stringify({
        environment: "Node handler + local D1; RSA fixture authentication",
        fictional: true,
        members: 535,
        rollcalls: count,
        records: dataset.records.length,
        draftStoredBytes: sizes.draftBytes,
        publicationStoredBytes: sizes.publicationBytes,
        workflowMs: Math.round(performance.now() - started),
        publishMs: Math.round(publishMs),
        loadVerifyMs: Math.round(readMs),
        nodeHeapUsedBytes: process.memoryUsage().heapUsed,
      }),
    );
    base = snapshot.id;
  }
} finally {
  globalThis.fetch = originalFetch;
  await mf.dispose();
}
