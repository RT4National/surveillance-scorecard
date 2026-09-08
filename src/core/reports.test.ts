import { describe, expect, it, vi } from "vitest";
import type { Dataset, Publication } from "./publication";
import { createPublicationScoring } from "./publication-scores";
import {
  executeReport,
  publicationChanges,
  reportCsv,
  reportSvg,
  reportTsv,
  findStateRepresentatives,
  decodeVoteId,
  loadArchivedPublication,
  validateReportQuery,
} from "./reports";
const data: Dataset = {
  id: "test",
  asOf: "2026-09-07",
  demo: true,
  sources: [],
  coverage: ["Test fixtures only"],
  rubric: {
    version: "test",
    minVotes: 1,
    minPerContext: 1,
    consistencyThreshold: 75,
  },
  members: [
    {
      id: "a",
      name: "=unsafe",
      party: "Democratic",
      state: "CA",
      chamber: "House",
      status: "active",
      committees: [],
      caucuses: [],
      since: 2020,
    },
    {
      id: "b",
      name: "<Bob & Co>",
      party: "Republican",
      state: "CA",
      chamber: "House",
      status: "active",
      committees: [],
      caucuses: [],
      since: 2020,
    },
    {
      id: "c",
      name: "No evidence",
      party: "Independent",
      state: "CA",
      chamber: "Senate",
      status: "active",
      committees: [],
      caucuses: [],
      since: 2020,
    },
  ],
  votes: [
    {
      id: "v1",
      bill: "HR1",
      title: "One",
      date: "2024-01-01",
      administration: "Test",
      presidentParty: "Democratic",
      chamber: "House",
      reformVote: "Yes",
      weight: 1,
      topic: "Privacy",
      rationale: "Test",
      source: "https://example.org/1",
    },
    {
      id: "v2",
      bill: "HR2",
      title: "Two",
      date: "2025-01-01",
      administration: "Other",
      presidentParty: "Republican",
      chamber: "House",
      reformVote: "No",
      weight: 1,
      topic: "Privacy",
      rationale: "Test",
      source: "https://example.org/2",
    },
  ],
  records: [
    { memberId: "a", voteId: "v1", outcome: "Yes", partyAtVote: "Democratic" },
    { memberId: "a", voteId: "v2", outcome: "No", partyAtVote: "Democratic" },
    { memberId: "b", voteId: "v1", outcome: "No", partyAtVote: "Republican" },
    { memberId: "b", voteId: "v2", outcome: "No", partyAtVote: "Republican" },
  ],
};
const publication = (dataset: Dataset): Publication => ({
  id: dataset.id,
  createdAt: dataset.asOf,
  publishedBy: "test",
  previousId: null,
  summary: "test",
  digest: "test",
  dataset,
});
describe("reproducible reports", () => {
  it("finds exact intersections without interpreting missing records as abstentions", () => {
    expect(
      executeReport(data, {
        kind: "intersection",
        conditions: [
          { voteId: "v1", outcome: "Yes" },
          { voteId: "v2", outcome: "No" },
        ],
      }).rows.map((r) => r.member.id),
    ).toEqual(["a"]);
    expect(
      executeReport(data, {
        kind: "intersection",
        conditions: [{ voteId: "v1", outcome: "Not voting" }],
      }).rows,
    ).toEqual([]);
  });
  it("excludes insufficient evidence in rankings and applies per party limits", () => {
    expect(
      executeReport(data, { kind: "ranking", limit: 1 }).rows.map(
        (r) => r.member.id,
      ),
    ).toEqual(["a"]);
    expect(
      executeReport(data, {
        kind: "ranking",
        limit: 1,
        perParty: true,
        parties: ["Democratic", "Republican"],
      }).rows.map((r) => r.member.id),
    ).toEqual(["a", "b"]);
  });
  it("uses party at vote and the exact historical date scope", () => {
    const result = executeReport(data, {
      kind: "ranking",
      context: "same",
      to: "2024-12-31",
    });
    expect(result.rows.map((r) => r.member.id)).toEqual(["a"]);
    expect(result.sources).toEqual(["https://example.org/1"]);
  });
  it("validates arbitrary external queries and prevents false empty results from mismatched scope", () => {
    for (const query of [
      null,
      { kind: "sql", sql: "drop table" },
      { kind: "ranking", limit: -1 },
      { kind: "ranking", from: "2025-02-30" },
      { kind: "ranking", memberIds: ["unknown"] },
      { kind: "ranking", parties: ["Unknown"] },
      {
        kind: "intersection",
        conditions: [{ voteId: "missing", outcome: "Yes" }],
      },
    ])
      expect(() => validateReportQuery(query, data)).toThrow();
    expect(() =>
      executeReport(data, {
        kind: "intersection",
        to: "2024-12-31",
        conditions: [{ voteId: "v2", outcome: "No" }],
      }),
    ).toThrow("outside");
  });
  it("attributes exports and escapes spreadsheet formulas and SVG markup", () => {
    const csv = reportCsv(data, { kind: "ranking" }, "pub1");
    expect(csv).toContain("FICTIONAL DEMO");
    expect(csv).toContain("'=unsafe");
    expect(csv).toContain("pub1");
    expect(csv).toContain("https://example.org/1");
    const svg = reportSvg(data, { kind: "ranking" }, "pub1");
    expect(svg).toContain("&lt;Bob &amp; Co&gt;");
    expect(svg).not.toContain("<Bob");
  });
  it("separates rubric changes from evidence corrections", () => {
    const updated = structuredClone(data);
    updated.rubric.minVotes = 3;
    const result = publicationChanges(
      publication(data),
      publication(updated),
      "a",
    );
    expect(result.rubricChanged).toBe(true);
    expect(result.evidenceChanged).toBe(false);
    expect(result.before?.value).toBe(100);
    expect(result.after?.value).toBe(null);
    updated.records[0].outcome = "No";
    expect(
      publicationChanges(publication(data), publication(updated), "a")
        .evidenceChanged,
    ).toBe(true);
  });
  it("never scores records after the publication cutoff even when a future end date is supplied", () => {
    const result = executeReport(
      { ...data, asOf: "2024-12-31" },
      { kind: "ranking", to: "2030-01-01" },
    );
    expect(result.votes.map((v) => v.id)).toEqual(["v1"]);
    expect(result.rows.find((r) => r.member.id === "a")?.score.counted).toBe(1);
  });
  it("caps rubric lookback and decay at publication date for future report cutoffs", () => {
    const timed = {
      ...data,
      rubric: { ...data.rubric, lookbackYears: 2, halfLifeYears: 1 },
    };
    const current = executeReport(timed, { kind: "ranking" });
    const future = executeReport(timed, { kind: "ranking", to: "2035-01-01" });
    expect(future.cutoff).toBe(data.asOf);
    expect(future.rows.map((r) => r.score)).toEqual(
      current.rows.map((r) => r.score),
    );
    expect(future.rows.length).toBeGreaterThan(0);
    expect(future.sources).toEqual(["https://example.org/2"]);
  });
  it("cites only contributing sources for members returned after scope and limit", () => {
    const scoped = structuredClone(data);
    scoped.records = scoped.records.filter(
      (r) => r.memberId !== "b" || r.voteId !== "v1",
    );
    const result = executeReport(scoped, { kind: "ranking", memberIds: ["b"] });
    expect(result.sources).toEqual(["https://example.org/2"]);
    expect(result.records.every((r) => r.memberId === "b")).toBe(true);
    expect(
      executeReport(scoped, { kind: "ranking", memberIds: ["c"] }).sources,
    ).toEqual([]);
  });
  it("retains direct intersection sources for non-scored outcomes", () => {
    const scoped = structuredClone(data);
    scoped.records[0].outcome = "Not voting";
    const result = executeReport(scoped, {
      kind: "intersection",
      to: "2024-12-31",
      conditions: [{ voteId: "v1", outcome: "Not voting" }],
    });
    expect(result.rows[0].score.value).toBe(null);
    expect(result.sources).toEqual(["https://example.org/1"]);
  });
  it("copies TSV without formula or cell-boundary injection", () => {
    const hostile = structuredClone(data);
    hostile.members[0].name = '\t=IMPORTDATA("bad")\nnext\tcell';
    const tsv = reportTsv(hostile, { kind: "ranking" }, "pub1");
    const row = tsv.split("\n").find((line) => line.startsWith("a\t"))!;
    expect(row.split("\t")).toHaveLength(9);
    expect(row.split("\t")[1]).toBe('\' =IMPORTDATA("bad") next cell');
    expect(tsv).toContain("Query\t");
    expect(tsv).toContain("pub1");
  });
  it("embeds exact query, rubric and source metadata in independently shared SVG", () => {
    const query = {
      kind: "ranking" as const,
      parties: ["Republican" as const],
      perParty: true,
      limit: 1,
    };
    const svg = reportSvg(data, query, "pub1");
    const raw = svg
      .match(/<metadata>(.*?)<\/metadata>/)![1]
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const metadata = JSON.parse(raw);
    expect(metadata.query).toEqual(query);
    expect(metadata.rubric).toEqual(data.rubric);
    expect(metadata.publicationId).toBe("pub1");
    expect(metadata.sources).toEqual([
      "https://example.org/1",
      "https://example.org/2",
    ]);
  });
  it("filters state finder to active records in the pinned dataset", () => {
    const historical = structuredClone(data);
    historical.members[0].status = "inactive";
    historical.members[1].status = "deceased";
    expect(findStateRepresentatives(historical, "CA").map((m) => m.id)).toEqual(
      ["c"],
    );
    expect(findStateRepresentatives(historical, "NY")).toEqual([]);
  });
  it("decodes valid vote URL components without crashing on malformed encoding", () => {
    expect(decodeVoteId("vote%2F1")).toBe("vote/1");
    expect(decodeVoteId("vote%25")).toBe("vote%");
    expect(decodeVoteId("%E0%A4%A")).toBe(null);
    expect(decodeVoteId()).toBe(undefined);
  });
  it("loads only the requested immutable publication and rejects mismatched responses", async () => {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(data)),
    );
    const archive = {
      ...publication(data),
      id: "pub/1",
      digest: Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(archive), {
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await loadArchivedPublication("pub/1", fetcher)).toEqual(archive);
    expect(fetcher.mock.calls[0][0]).toBe(
      "/scorecard/api/publications/pub%2F1",
    );
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ ...archive, id: "latest" })),
    );
    await expect(loadArchivedPublication("pub/1", fetcher)).rejects.toThrow(
      "requested archive",
    );
    fetcher.mockResolvedValue(new Response("", { status: 404 }));
    await expect(loadArchivedPublication("missing", fetcher)).rejects.toThrow(
      "404",
    );
  });
  it("keeps independent archive evidence frames and detects removed members", () => {
    const changed = structuredClone(data);
    changed.votes[0].source = "https://example.org/corrected";
    const comparison = publicationChanges(
      publication(data),
      publication(changed),
      "a",
    );
    expect(comparison.before?.evidence[0].vote.source).toBe(
      "https://example.org/1",
    );
    expect(comparison.after?.evidence[0].vote.source).toBe(
      "https://example.org/corrected",
    );
    changed.members = changed.members.filter((m) => m.id !== "a");
    expect(
      publicationChanges(publication(data), publication(changed), "a").after,
    ).toBe(null);
  });
  it("labels publication-time membership filters without rewriting historical vote party", () => {
    const switched = structuredClone(data);
    switched.members[0].party = "Republican";
    switched.members[0].chamber = "Senate";
    const query = {
      kind: "ranking" as const,
      parties: ["Republican" as const],
      chamber: "Senate" as const,
      to: "2024-12-31",
      context: "same" as const,
    };
    const result = executeReport(switched, query);
    expect(result.rows.map((r) => r.member.id)).toEqual(["a"]);
    expect(result.rows[0].score.evidence[0].partyAtVote).toBe("Democratic");
    const csv = reportCsv(switched, query, "pub1");
    expect(csv).toContain("Current party");
    expect(csv).toContain("Current chamber");
    expect(csv).toContain("Date filters narrow votes, not roster membership");
    expect(csv).toContain("not frozen official publication grades");
    const tsv = reportTsv(switched, query, "pub1");
    expect(tsv).toContain("Current party\tCurrent chamber");
  });
  it("neutralizes invisible control characters before CSV spreadsheet interpretation", () => {
    const hostile = structuredClone(data);
    hostile.members[0].name = "\u0000=1+1";
    expect(reportCsv(hostile, { kind: "ranking" })).toContain("'=1+1");
  });
  it("uses frozen published score objects in archive comparisons", async () => {
    const frozen = {
      ...publication(data),
      scoring: await createPublicationScoring(data),
    };
    frozen.scoring.scores.a.value = 47;
    frozen.scoring.scores.a.grade = "D";
    const change = publicationChanges(frozen, publication(data), "a");
    expect(change.before?.value).toBe(47);
    expect(change.before?.grade).toBe("D");
    expect(change.before?.evidence[0].vote.id).toBe("v1");
    expect(change.after?.value).not.toBe(47);
  });
  it("rejects tampered dataset or scoring digests at archive loading boundary", async () => {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(data)),
    );
    const archived = {
      ...publication(data),
      digest: Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join(""),
      scoring: await createPublicationScoring(data),
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...archived, digest: "0".repeat(64) })),
      );
    await expect(loadArchivedPublication(archived.id, fetcher)).rejects.toThrow(
      "integrity",
    );
    archived.scoring.digest = "0".repeat(64);
    fetcher.mockResolvedValue(new Response(JSON.stringify(archived)));
    await expect(loadArchivedPublication(archived.id, fetcher)).rejects.toThrow(
      "scoring digest",
    );
  });
});
