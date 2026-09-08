import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import worker from "./index";
import * as auth from "./auth";
import { validateDataset } from "./validation";
import { dataset, members, votes, records } from "../src/data/demo";
import { rubric } from "../src/core/scoring";
const fixture = {
  ...dataset,
  members,
  votes,
  records,
  rubric,
  sources: [],
  coverage: ["Fictional fixture"],
};
describe("Access identity verification", () => {
  const config = {
    ACCESS_ISSUER: "https://example.cloudflareaccess.com",
    ACCESS_AUDIENCE: "audience",
    STAFF_ROLES: '{"editor@example.org":"editor"}',
  };
  it("refuses absent and malformed identities, even on localhost", async () => {
    await expect(
      auth.authenticate(new Request("http://localhost/"), config),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      auth.authenticate(
        new Request("https://example.org/", {
          headers: { "Cf-Access-Jwt-Assertion": "invalid" },
        }),
        config,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("verifies signatures, issuer, audience, expiry and configured role", async () => {
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
    const key = {
      ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
      kid: "test",
    };
    const fetcher = vi.fn(async () =>
      Response.json({ keys: [key] }),
    ) as typeof fetch;
    const enc = (v: unknown) =>
      Buffer.from(JSON.stringify(v)).toString("base64url");
    const token = async (patch: Record<string, unknown> = {}) => {
      const data = `${enc({ alg: "RS256", kid: "test" })}.${enc({ iss: config.ACCESS_ISSUER, aud: ["audience"], email: "editor@example.org", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 100, ...patch })}`;
      const sig = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        pair.privateKey,
        new TextEncoder().encode(data),
      );
      return `${data}.${Buffer.from(sig).toString("base64url")}`;
    };
    const request = (jwt: string) =>
      new Request("https://example.org/", {
        headers: { "Cf-Access-Jwt-Assertion": jwt },
      });
    expect(
      await auth.authenticate(request(await token()), config, fetcher),
    ).toEqual({ email: "editor@example.org", role: "editor" });
    for (const patch of [
      { iss: "https://other.cloudflareaccess.com" },
      { aud: ["wrong"] },
      { exp: 1 },
      { email: "outsider@example.org" },
    ])
      await expect(
        auth.authenticate(request(await token(patch)), config, fetcher),
      ).rejects.toBeInstanceOf(auth.HttpError);
    const good = await token();
    await expect(
      auth.authenticate(
        request(good.slice(0, -8) + "AAAAAAAA"),
        config,
        fetcher,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});
describe("D1 editorial workflow", () => {
  let mf: Miniflare;
  let env: Env;
  beforeAll(async () => {
    mf = new Miniflare(
      convertV4MiniflareOptions({
        name: "test",
        modules: true,
        script: 'export default {fetch(){return new Response("ok")}}',
        d1Databases: ["DB"],
      }),
    );
    const db = await mf.getD1Database("DB", "test");
    const sql = (
      await Promise.all(
        ["0001_editorial.sql", "0002_draft_base.sql"].map((file) =>
          readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
        ),
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
      }, [])) {
      if (statement.trim()) await db.prepare(statement).run();
    }
    env = {
      DB: db,
      ACCESS_ISSUER: "",
      ACCESS_AUDIENCE: "",
      STAFF_ROLES: "{}",
    } as Env;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await mf?.dispose();
  });
  const send = async (path: string, method = "GET", data?: unknown) =>
    worker.fetch(
      new Request(`https://scorecard.example/scorecard/api${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: data ? JSON.stringify(data) : undefined,
      }),
      env,
    );
  it("blocks unauthenticated mutation before touching data", async () => {
    expect(
      (
        await send("/staff/drafts", "POST", {
          dataset: fixture,
          summary: "test",
        })
      ).status,
    ).toBe(401);
  });
  it("rejects invalid datasets and live promotion of demo records", () => {
    expect(validateDataset(fixture)).toEqual([]);
    expect(validateDataset({ ...fixture, members: [null] })).not.toEqual([]);
    expect(validateDataset({ ...fixture, demo: false })).not.toEqual([]);
    expect(validateDataset({ ...fixture, asOf: "2000-01-01" })).not.toEqual([]);
  });
  it("requires matching official captures for every live vote and accepts local reviewed portraits", () => {
    const source = "https://clerk.house.gov/evs/2026/roll003.xml";
    const live = {
      ...fixture,
      id: "reviewed-v1",
      demo: false,
      members: [
        {
          ...members[0],
          id: "A000001",
          chamber: "House" as const,
          portrait: {
            url: "/scorecard/portraits/A000001.jpg",
            attribution: "US Congress",
            rights: "public-domain" as const,
            rightsSource: "https://www.congress.gov/member/A000001",
            reviewedBy: "editor@example.org",
          },
        },
      ],
      votes: [
        { ...votes[0], id: "house-2026-3", chamber: "House" as const, source },
      ],
      records: [
        {
          memberId: "A000001",
          voteId: "house-2026-3",
          outcome: "Yes" as const,
          partyAtVote: "Democratic" as const,
        },
      ],
      sources: [
        {
          url: source,
          retrievedAt: "2026-09-07T00:00:00Z",
          sha256: "a".repeat(64),
          kind: "votes" as const,
        },
      ],
    };
    expect(validateDataset(live)).toEqual([]);
    expect(
      validateDataset({
        ...live,
        sources: [{ ...live.sources[0], kind: "members" }],
      }),
    ).toContain("Live vote lacks a matching captured source: house-2026-3");
    expect(
      validateDataset({
        ...live,
        votes: [
          {
            ...live.votes[0],
            source: "https://clerk.house.gov.attacker.example/roll.xml",
          },
        ],
      }),
    ).toContain(
      "Live vote needs an official congressional source: house-2026-3",
    );
    expect(
      validateDataset({
        ...live,
        members: [
          {
            ...live.members[0],
            portrait: {
              ...live.members[0].portrait,
              url: "/scorecard/portraits/../secret.jpg",
            },
          },
        ],
      }),
    ).not.toEqual([]);
  });
  it("accepts sourced historical service but rejects contradictory exact-day party histories", () => {
    const m = members[0];
    const v = {
      ...votes[0],
      chamber: m.chamber === "House" ? ("Senate" as const) : ("House" as const),
    };
    const historical = {
      ...fixture,
      members: [m],
      votes: [v],
      records: [
        {
          memberId: m.id,
          voteId: v.id,
          outcome: "Yes" as const,
          partyAtVote: "Democratic" as const,
        },
      ],
      affiliations: [
        {
          memberId: m.id,
          kind: "term" as const,
          name: v.chamber,
          start: "2000-01-01",
          precision: "day" as const,
          source: "https://www.congress.gov/",
        },
      ],
    };
    expect(validateDataset(historical)).toEqual([]);
    expect(
      validateDataset({
        ...historical,
        affiliations: [
          { ...historical.affiliations[0], start: "2000", precision: "year" },
        ],
      }),
    ).not.toEqual([]);
    expect(
      validateDataset({
        ...historical,
        affiliations: [
          ...historical.affiliations,
          {
            memberId: m.id,
            kind: "party",
            name: "Republican",
            start: "2000-01-01",
            precision: "day",
            source: "https://www.congress.gov/",
          },
        ],
      }),
    ).toContain(
      `Recorded party contradicts exact-day affiliation: ${m.id}/${v.id}`,
    );
  });
  it("requires independent review, rejects stale edits, publishes immutable snapshots and audits rollback", async () => {
    const identity = vi
      .spyOn(auth, "authenticate")
      .mockResolvedValue({ email: "author@example.org", role: "editor" });
    const created = await send("/staff/drafts", "POST", {
      dataset: fixture,
      summary: "Initial fixture",
      basePublicationId: null,
    });
    expect(created.status).toBe(201);
    const d = (await created.json()) as { id: string };
    expect(
      (
        await send(`/staff/drafts/${d.id}`, "PUT", {
          version: 0,
          dataset: fixture,
          summary: "stale",
        })
      ).status,
    ).toBe(409);
    identity.mockResolvedValue({
      email: "author@example.org",
      role: "publisher",
    });
    expect(
      (await send(`/staff/drafts/${d.id}/review`, "POST", { version: 1 }))
        .status,
    ).toBe(403);
    identity.mockResolvedValue({
      email: "reviewer@example.org",
      role: "reviewer",
    });
    expect(
      (await send(`/staff/drafts/${d.id}/review`, "POST", { version: 1 }))
        .status,
    ).toBe(200);
    identity.mockResolvedValue({
      email: "publisher@example.org",
      role: "publisher",
    });
    const published = await send(`/staff/drafts/${d.id}/publish`, "POST", {
      version: 2,
    });
    expect(published.status).toBe(201);
    const p = (await published.json()) as { id: string; digest: string };
    expect(p.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (await send(`/staff/drafts/${d.id}/publish`, "POST", { version: 2 }))
        .status,
    ).toBe(409);
    await expect(
      env.DB.prepare("UPDATE publications SET snapshot=? WHERE id=?")
        .bind("{}", p.id)
        .run(),
    ).rejects.toThrow("immutable");
    await expect(
      env.DB.prepare("DELETE FROM publications WHERE id=?").bind(p.id).run(),
    ).rejects.toThrow("immutable");
    expect(
      (
        await send("/staff/rollback", "POST", {
          publicationId: p.id,
          revision: 0,
          reason: "Rollback explanation",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await send("/staff/rollback", "POST", {
          publicationId: p.id,
          revision: 1,
          reason: "Rollback explanation",
        })
      ).status,
    ).toBe(200);
    const audit = await env.DB.prepare("SELECT * FROM audit").all();
    expect(audit.results.length).toBeGreaterThanOrEqual(4);
    const c = {
      publicationId: p.id,
      memberId: fixture.members[0].id,
      message: "Please inspect this member evidence.",
    };
    for (let i = 0; i < 5; i++)
      expect((await send("/corrections", "POST", c)).status).toBe(201);
    expect((await send("/corrections", "POST", c)).status).toBe(429);
    expect(
      (await send("/corrections", "POST", { ...c, memberId: "missing" }))
        .status,
    ).toBe(400);
    identity.mockRestore();
  });
  it("rejects publishing and editing across an intervening publication until explicit rebase and new review", async () => {
    const base = (await (await send("/publications/latest")).json()) as {
      id: string;
    };
    const identity = vi
      .spyOn(auth, "authenticate")
      .mockResolvedValue({ email: "author@example.org", role: "editor" });
    const a = (await (
      await send("/staff/drafts", "POST", {
        dataset: fixture,
        summary: "Branch A",
        basePublicationId: base.id,
      })
    ).json()) as { id: string };
    const b = (await (
      await send("/staff/drafts", "POST", {
        dataset: fixture,
        summary: "Branch B",
        basePublicationId: base.id,
      })
    ).json()) as { id: string };
    identity.mockResolvedValue({
      email: "reviewer@example.org",
      role: "reviewer",
    });
    for (const d of [a, b])
      expect(
        (await send(`/staff/drafts/${d.id}/review`, "POST", { version: 1 }))
          .status,
      ).toBe(200);
    identity.mockResolvedValue({
      email: "publisher@example.org",
      role: "publisher",
    });
    const published = await send(`/staff/drafts/${a.id}/publish`, "POST", {
      version: 2,
    });
    expect(published.status).toBe(201);
    const current = (await published.json()) as { id: string };
    expect(
      (await send(`/staff/drafts/${b.id}/publish`, "POST", { version: 2 }))
        .status,
    ).toBe(409);
    expect(
      (
        await send(`/staff/drafts/${b.id}`, "PUT", {
          version: 2,
          dataset: fixture,
          summary: "stale write",
          basePublicationId: base.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await send("/staff/drafts", "POST", {
          dataset: fixture,
          summary: "stale create",
          basePublicationId: base.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await send(`/staff/drafts/${b.id}/rebase`, "POST", {
          version: 2,
          basePublicationId: current.id,
        })
      ).status,
    ).toBe(200);
    expect(
      (await send(`/staff/drafts/${b.id}/publish`, "POST", { version: 3 }))
        .status,
    ).toBe(409);
    const rebased = await env.DB.prepare(
      "SELECT dataset,status,reviewer,base_publication_id FROM drafts WHERE id=?",
    )
      .bind(b.id)
      .first<{
        dataset: string;
        status: string;
        reviewer: string | null;
        base_publication_id: string;
      }>();
    expect(rebased?.dataset).toBe(JSON.stringify(fixture));
    expect(rebased?.reviewer).toBeNull();
    expect(rebased?.base_publication_id).toBe(current.id);
    identity.mockRestore();
  });
  it("returns a clear capacity error before inserting an oversized UTF8 publication", async () => {
    const base = (await (await send("/publications/latest")).json()) as {
      id: string;
    };
    const identity = vi
      .spyOn(auth, "authenticate")
      .mockResolvedValue({ email: "author@example.org", role: "editor" });
    // Multibyte text proves the guard counts UTF8 bytes, not JavaScript string length.
    const large = {
      ...fixture,
      votes: fixture.votes.map((v, i) =>
        i === 0 ? { ...v, rationale: "界".repeat(600_000) } : v,
      ),
    };
    const payload = {
      dataset: large,
      summary: "Capacity test",
      basePublicationId: base.id,
    };
    expect((await send("/staff/drafts", "POST", payload)).status).toBe(413);
    large.votes[0].rationale = "";
    const overhead = new TextEncoder().encode(
      JSON.stringify(payload),
    ).byteLength;
    large.votes[0].rationale = "界".repeat(
      Math.floor((1_799_000 - overhead) / 3),
    );
    const created = await send("/staff/drafts", "POST", payload);
    expect(created.status).toBe(201);
    const d = (await created.json()) as { id: string };
    identity.mockResolvedValue({
      email: "reviewer@example.org",
      role: "reviewer",
    });
    expect(
      (await send(`/staff/drafts/${d.id}/review`, "POST", { version: 1 }))
        .status,
    ).toBe(200);
    identity.mockResolvedValue({
      email: "publisher@example.org",
      role: "publisher",
    });
    const response = await send(`/staff/drafts/${d.id}/publish`, "POST", {
      version: 2,
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("1.8 MB"),
    });
    expect(
      ((await (await send("/publications/latest")).json()) as { id: string })
        .id,
    ).toBe(base.id);
    identity.mockRestore();
  }, 30000);
});
