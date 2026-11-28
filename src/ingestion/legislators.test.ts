import { describe, expect, it } from "vitest";
import {
  buildLisCrosswalk,
  candidateMembers,
  checkHouseCoverage,
  identitySupplement,
  isLegislatorsUrl,
  legislatorsUrl,
  parseLegislators,
  senateVoteDate,
  termAffiliations,
} from "./legislators";

const sha = "577ca04282d14688cb14f6559eb27b52bdc50dfc";
const source = legislatorsUrl(sha, "historical");
const fixture = JSON.stringify([
  {
    id: { bioguide: "A000001", lis: "S001" },
    name: { first: "Ann", last: "Example", official_full: "Ann Example" },
    terms: [
      {
        type: "rep",
        start: "2013-01-03",
        end: "2015-01-03",
        state: "TN",
        district: 2,
        party: "Republican",
      },
      {
        type: "rep",
        start: "2015-01-03",
        end: "2017-01-03",
        state: "TN",
        district: 2,
        party: "Republican",
      },
      {
        type: "sen",
        start: "2017-01-03",
        end: "2023-01-03",
        state: "TN",
        party: "Republican",
      },
    ],
  },
  {
    id: { bioguide: "B000002", lis: "S002" },
    name: { first: "Bo", last: "Switcher", official_full: "Bo Switcher" },
    terms: [
      {
        type: "sen",
        start: "2015-01-06",
        end: "2021-01-03",
        state: "VT",
        party: "Democrat",
        party_affiliations: [
          { start: "2015-01-06", end: "2018-06-30", party: "Democrat" },
          { start: "2018-07-01", end: "2021-01-03", party: "Independent" },
        ],
      },
    ],
  },
  {
    id: { bioguide: "C000003" },
    name: { first: "Cy", last: "Lib", official_full: "Cy Lib" },
    terms: [
      {
        type: "rep",
        start: "2019-01-03",
        end: "2021-01-03",
        state: "MI",
        district: 3,
        party: "Libertarian",
      },
    ],
  },
]);

describe("congress-legislators supplemental identities", () => {
  it("only allows pinned raw URLs for the two legislator files", () => {
    expect(isLegislatorsUrl(source)).toBe(true);
    expect(isLegislatorsUrl(legislatorsUrl(sha, "current"))).toBe(true);
    expect(isLegislatorsUrl(source.replace(sha, "main"))).toBe(false);
    expect(isLegislatorsUrl(source.replace("historical", "social-media"))).toBe(
      false,
    );
    expect(isLegislatorsUrl(`${source}?x=1`)).toBe(false);
    expect(isLegislatorsUrl(source.replace("unitedstates", "attacker"))).toBe(
      false,
    );
  });

  it("parses Senate display dates without trusting irregular spacing", () => {
    expect(senateVoteDate("January 18, 2018,  12:18 PM")).toBe("2018-01-18");
    expect(senateVoteDate("May 4, 2020, 1:24 PM")).toBe("2020-05-04");
    expect(() => senateVoteDate("Smarch 40, 2018")).toThrow();
  });

  it("rejects malformed records and duplicate identities", () => {
    expect(() => parseLegislators("{}")).toThrow();
    const record = JSON.parse(fixture)[0];
    expect(() => parseLegislators(JSON.stringify([record, record]))).toThrow(
      /Duplicate/,
    );
    const bad = {
      ...record,
      terms: [{ ...record.terms[0], start: "2013-02-30" }],
    };
    expect(() => parseLegislators(JSON.stringify([bad]))).toThrow();
  });

  it("maps LIS IDs only with a covering same-state Senate term, flagging other disagreements", () => {
    const records = parseLegislators(fixture);
    const { crosswalk, discrepancies } = buildLisCrosswalk(records, [
      {
        lisId: "S001",
        name: "Example (R-TN)",
        state: "TN",
        party: "R",
        date: "2018-01-18",
      },
      {
        lisId: "S001",
        name: "Example (R-TN)",
        state: "TN",
        party: "R",
        date: "2020-05-13",
      },
      {
        lisId: "S002",
        name: "Switcher (I-VT)",
        state: "VT",
        party: "I",
        date: "2018-01-18",
      },
      {
        lisId: "S999",
        name: "Nobody (D-CA)",
        state: "CA",
        party: "D",
        date: "2018-01-18",
      },
    ]);
    expect(crosswalk).toEqual({ S001: "A000001", S002: "B000002" });
    expect(discrepancies.map((d) => [d.kind, d.lisId])).toEqual([
      ["party-mismatch", "S002"],
      ["missing-lis", "S999"],
    ]);
    expect(discrepancies[0].official).toBe("Independent");
    expect(discrepancies[0].supplemental).toBe("Democratic");
  });

  it("withholds a mapping when the state or vote date does not match a Senate term", () => {
    const records = parseLegislators(fixture);
    const { crosswalk, discrepancies } = buildLisCrosswalk(records, [
      {
        lisId: "S001",
        name: "Example (R-TN)",
        state: "KY",
        party: "R",
        date: "2018-01-18",
      },
      {
        lisId: "S002",
        name: "Switcher (I-VT)",
        state: "VT",
        party: "I",
        date: "2024-04-19",
      },
    ]);
    expect(crosswalk).toEqual({});
    expect(discrepancies.map((d) => d.kind)).toEqual([
      "no-senate-term",
      "no-senate-term",
    ]);
  });

  it("flags but keeps a mapping whose ballot surname differs", () => {
    const { crosswalk, discrepancies } = buildLisCrosswalk(
      parseLegislators(fixture),
      [
        {
          lisId: "S001",
          name: "Sample (R-TN)",
          state: "TN",
          party: "R",
          date: "2018-01-18",
        },
      ],
    );
    expect(crosswalk).toEqual({ S001: "A000001" });
    expect(discrepancies.map((d) => d.kind)).toEqual(["name-mismatch"]);
  });

  it("converts back-to-back terms into inclusive, non-overlapping day intervals", () => {
    const { rows, discrepancies } = termAffiliations(
      parseLegislators(fixture),
      ["A000001"],
      source,
    );
    expect(discrepancies).toEqual([]);
    expect(rows.map((r) => [r.name, r.start, r.end])).toEqual([
      ["House of Representatives", "2013-01-03", "2015-01-02"],
      ["House of Representatives", "2015-01-03", "2017-01-02"],
      ["Senate", "2017-01-03", "2023-01-03"],
    ]);
    expect(
      rows.every(
        (r) =>
          r.precision === "day" && r.kind === "term" && r.source === source,
      ),
    ).toBe(true);
  });

  it("reports requested members absent from the supplemental source", () => {
    const { rows, discrepancies } = termAffiliations(
      parseLegislators(fixture),
      ["Z000009"],
      source,
    );
    expect(rows).toEqual([]);
    expect(discrepancies.map((d) => [d.kind, d.memberId])).toEqual([
      ["missing-bioguide", "Z000009"],
    ]);
  });

  it("checks House ballots against exact-day House terms and party at the vote", () => {
    const records = parseLegislators(fixture);
    const { rows } = termAffiliations(records, ["A000001", "C000003"], source);
    const discrepancies = checkHouseCoverage(records, rows, [
      {
        memberId: "A000001",
        voteId: "h1",
        date: "2016-03-01",
        partyAtVote: "Republican",
      },
      {
        memberId: "A000001",
        voteId: "h2",
        date: "2018-01-11",
        partyAtVote: "Republican",
      },
      {
        memberId: "C000003",
        voteId: "h3",
        date: "2020-05-14",
        partyAtVote: "Independent",
      },
    ]);
    expect(discrepancies.map((d) => [d.kind, d.memberId, d.voteId])).toEqual([
      ["no-house-term", "A000001", "h2"],
      ["unsupported-party", "C000003", "h3"],
    ]);
  });

  it("builds candidate historical members whose status always requires review", () => {
    const { members, discrepancies } = candidateMembers(
      parseLegislators(fixture),
      ["A000001", "C000003"],
    );
    expect(members).toEqual([
      {
        id: "A000001",
        name: "Ann Example",
        party: "Republican",
        state: "TN",
        chamber: "Senate",
        status: "inactive",
        committees: [],
        caucuses: [],
        since: 2017,
      },
    ]);
    expect(discrepancies.map((d) => [d.kind, d.memberId])).toEqual([
      ["unsupported-party", "C000003"],
    ]);
  });

  it("sets since to the latest term's start year, matching the roster importer", () => {
    const [ann] = JSON.parse(fixture);
    const houseOnly = { ...ann, terms: ann.terms.slice(0, 2) };
    const { members } = candidateMembers(
      parseLegislators(JSON.stringify([houseOnly])),
      ["A000001"],
    );
    expect(members[0]).toMatchObject({
      chamber: "House",
      district: 2,
      since: 2015,
    });
  });

  it("extends an existing supplement with extra ballots and bill supporters, emitting only new identities", () => {
    const records = parseLegislators(fixture);
    const existing = {
      crosswalk: { S002: "B000002" },
      affiliations: termAffiliations(records, ["B000002"], source).rows,
      candidateMembers: [],
    };
    const result = identitySupplement({
      current: [],
      historical: records,
      currentUrl: legislatorsUrl(sha, "current"),
      historicalUrl: source,
      rosterIds: ["B000002"],
      existing,
      senateBallots: [
        { lisId: "S001", name: "Example (R-TN)", state: "TN", party: "R", date: "2018-01-11" },
        { lisId: "S002", name: "Switcher (D-VT)", state: "VT", party: "D", date: "2016-01-11" },
      ],
      houseBallots: [],
      supporters: [
        { memberId: "A000001", chamber: "House", date: "2014-02-01", partyAtVote: "Republican", voteId: "cosponsor-113-hr-1" },
        { memberId: "A000001", chamber: "Senate", date: "2014-02-01", partyAtVote: "Republican", voteId: "cosponsor-113-s-1" },
        { memberId: "C000003", chamber: "House", date: "2019-05-01", partyAtVote: "Independent", voteId: "cosponsor-116-hr-1" },
      ],
    });
    expect(result.crosswalk).toEqual({ S001: "A000001" });
    expect(new Set(result.affiliations.map((a) => a.memberId))).toEqual(new Set(["A000001"]));
    expect(result.affiliations).toHaveLength(3);
    expect(result.candidateMembers.map((m) => m.id)).toEqual(["A000001"]);
    expect(result.discrepancies.map((d) => [d.kind, d.memberId, d.voteId])).toEqual([
      ["no-senate-term", "A000001", "cosponsor-113-s-1"],
      ["unsupported-party", "C000003", "cosponsor-116-hr-1"],
      ["unsupported-party", "C000003", undefined],
      ["withheld-terms", "C000003", undefined],
    ]);
    expect(() =>
      identitySupplement({
        current: [], historical: records, currentUrl: legislatorsUrl(sha, "current"), historicalUrl: source,
        rosterIds: [], houseBallots: [], supporters: [],
        existing: { ...existing, crosswalk: { S001: "Z999999" } },
        senateBallots: [{ lisId: "S001", name: "Example (R-TN)", state: "TN", party: "R", date: "2018-01-11" }],
      }),
    ).toThrow(/conflicts/);
  });

  it("returns false rather than throwing for malformed URLs", () => {
    expect(isLegislatorsUrl("not a url")).toBe(false);
  });
});
