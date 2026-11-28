import { describe, expect, it } from "vitest";
import {
  criterionDirection,
  presidentOn,
  selectHistory,
  type CriterionRow,
} from "./history";

const row = (over: Partial<CriterionRow>): CriterionRow => ({
  key: "k",
  lines: [1],
  chambers: ["Senate"],
  conditions: { GOOD: 1, BAD: -1 },
  info: ["Voted NO on x", "Voted YES on x"],
  classification: "rollcall",
  officialUrls: [],
  bill: null,
  alreadyImported: [],
  verified: true,
  notes: "",
  ...over,
});
const house = (n: number, y = 2015) =>
  `https://clerk.house.gov/evs/${y}/roll${n}.xml`;
const senate = (n: number) =>
  `https://www.senate.gov/legislative/LIS/roll_call_votes/vote1141/vote_114_1_${String(n).padStart(5, "0")}.xml`;

describe("presidential context", () => {
  it("assigns each inauguration day to the incoming administration", () => {
    expect(presidentOn("2013-07-24")).toEqual({
      party: "Democratic",
      administration: "Obama administration",
    });
    expect(presidentOn("2009-01-20").administration).toBe(
      "Obama administration",
    );
    expect(presidentOn("2017-01-19").administration).toBe(
      "Obama administration",
    );
    expect(presidentOn("2017-01-20")).toEqual({
      party: "Republican",
      administration: "Trump administration",
    });
    expect(presidentOn("2021-01-20").party).toBe("Democratic");
    expect(presidentOn("2025-01-19").party).toBe("Democratic");
    expect(presidentOn("2025-01-20").party).toBe("Republican");
    expect(presidentOn("2026-10-15").administration).toBe(
      "Trump administration",
    );
  });
  it("refuses dates before the covered administrations or malformed dates", () => {
    expect(() => presidentOn("2001-01-01")).toThrow();
    expect(() => presidentOn("2015-13-01")).toThrow();
  });
});

describe("legacy criterion direction", () => {
  it("reads the positively scored branch's wording", () => {
    expect(
      criterionDirection(
        row({
          conditions: { GOOD: 1, BAD: -3 },
          info: ["Voted NO on amendment 1449", "Voted YES on amendment 1449"],
        }),
        "Senate",
      ),
    ).toMatchObject({ reformVote: "No", points: 1 });
    expect(
      criterionDirection(
        row({
          conditions: { BAD: -2, GOOD: 2 },
          info: ["Voted for CISA cloture", "Voted against CISA cloture"],
        }),
        "Senate",
      ),
    ).toMatchObject({ reformVote: "No", points: 2 });
  });
  it("inverts a single penalized branch", () => {
    expect(
      criterionDirection(
        row({
          chambers: ["House"],
          conditions: { X: -2 },
          info: ["Voted for gutted House version of USA Freedom Act"],
        }),
        "House",
      ),
    ).toMatchObject({ reformVote: "No", points: -2 });
    expect(
      criterionDirection(
        row({ conditions: { X: 4 }, info: ["Voted for Conyers Amash"] }),
        "Senate",
      ).reformVote,
    ).toBe("Yes");
  });
  it("treats support of a bill as Yes and penalized support as No, per chamber", () => {
    const usaf = row({
      classification: "cosponsorship",
      chambers: ["House", "Senate"],
      conditions: { X: { House: 1, Senate: 3 } },
      info: ["Supported the original USA Freedom Act"],
    });
    expect(criterionDirection(usaf, "House")).toMatchObject({
      reformVote: "Yes",
      points: 1,
    });
    expect(criterionDirection(usaf, "Senate").points).toBe(3);
    expect(
      criterionDirection(
        row({
          classification: "cosponsorship",
          conditions: { Yes: -4 },
          info: ["Cosponsored the EARN-IT Act"],
        }),
        "Senate",
      ).reformVote,
    ).toBe("No");
  });
  it("refuses wording that contradicts itself or does not name a side", () => {
    expect(() =>
      criterionDirection(
        row({ conditions: { GOOD: 1, BAD: -1 }, info: ["Voted YES", "Voted YES"] }),
        "Senate",
      ),
    ).toThrow();
    expect(() =>
      criterionDirection(
        row({ conditions: { GOOD: 1, BAD: -1 }, info: ["Did x", "Did y"] }),
        "Senate",
      ),
    ).toThrow();
    expect(() =>
      criterionDirection(
        row({
          classification: "cosponsorship",
          conditions: { X: { House: 1, Senate: -1 } },
          info: ["Supported"],
        }),
        "Senate",
      ),
    ).not.toThrow();
    expect(() =>
      criterionDirection(
        row({ classification: "cosponsorship", conditions: { X: 0 }, info: ["Supported"] }),
        "Senate",
      ),
    ).toThrow();
  });
});

describe("history selection", () => {
  const inventory: CriterionRow[] = [
    row({ key: "plain", officialUrls: [senate(200)] }),
    row({ key: "composite", officialUrls: [senate(194), senate(195)], verified: false }),
    row({ key: "straight", officialUrls: [senate(195)] }),
    row({ key: "dupe_unverified", officialUrls: [house(327, 2014)], verified: false }),
    row({ key: "dupe_verified", officialUrls: [house(327, 2014)] }),
    row({ key: "done", officialUrls: [senate(92)], alreadyImported: ["senate-116-2-92"] }),
    row({ key: "unverified", officialUrls: [senate(201)], verified: false }),
    row({
      key: "bill_ok",
      classification: "cosponsorship",
      conditions: { Yes: 2 },
      info: ["Cosponsored"],
      bill: { congress: 117, type: "s", number: 1265, url: "https://www.congress.gov/bill/117th-congress/senate-bill/1265" },
    }),
    row({
      key: "bill_unverified",
      classification: "cosponsorship",
      verified: false,
      notes: "Ambiguous bill",
      bill: { congress: 114, type: "hr", number: 1466, url: "https://www.congress.gov/bill/114th-congress/house-bill/1466" },
    }),
    row({ key: "committee", classification: "other", verified: false }),
  ];
  it("imports each verified roll call once and lists everything else with a reason", () => {
    const h = selectHistory(inventory, {
      excludedKeys: { composite: "multi-vote combination" },
      cosponsorExtras: {},
    });
    expect(h.rollcalls.map((r) => [r.key, r.url])).toEqual([
      ["plain", senate(200)],
      ["straight", senate(195)],
      ["dupe_verified", house(327, 2014)],
    ]);
    expect(Object.fromEntries(h.excluded.map((e) => [e.key, e.reason]))).toMatchObject({
      composite: "multi-vote combination",
      dupe_unverified: expect.stringContaining("dupe_verified"),
      unverified: expect.stringContaining("not verified"),
      bill_unverified: expect.stringContaining("Ambiguous bill"),
      committee: expect.stringContaining("other"),
    });
    expect(h.excluded.some((e) => e.key === "done")).toBe(false);
    expect(h.cosponsorships).toEqual([
      expect.objectContaining({ key: "bill_ok", congress: 117, type: "s", number: 1265, chamber: "Senate" }),
    ]);
  });
  it("splits a criterion over companion bills with a sign-on cutoff", () => {
    const h = selectHistory(
      [
        row({
          key: "usaf",
          classification: "cosponsorship",
          chambers: ["House", "Senate"],
          conditions: { X: { House: 1, Senate: 3 } },
          info: ["Supported"],
          bill: { congress: 113, type: "hr", number: 3361, url: "https://www.congress.gov/bill/113th-congress/house-bill/3361" },
        }),
      ],
      {
        excludedKeys: {},
        cosponsorExtras: {
          usaf: { bills: [{ congress: 113, type: "s", number: 1599 }], signedBefore: "2014-05-18" },
        },
      },
    );
    expect(h.cosponsorships.map((c) => [c.type, c.number, c.chamber, c.signedBefore])).toEqual([
      ["hr", 3361, "House", "2014-05-18"],
      ["s", 1599, "Senate", "2014-05-18"],
    ]);
  });
  it("refuses unexpected official URLs and a scored bill listed twice", () => {
    expect(() =>
      selectHistory([row({ officialUrls: ["https://example.com/roll1.xml"] })], { excludedKeys: {}, cosponsorExtras: {} }),
    ).toThrow();
    const bill = { congress: 117, type: "s", number: 1, url: "https://www.congress.gov/bill/117th-congress/senate-bill/1" };
    expect(() =>
      selectHistory(
        [
          row({ key: "a", classification: "cosponsorship", bill }),
          row({ key: "b", classification: "cosponsorship", bill }),
        ],
        { excludedKeys: {}, cosponsorExtras: {} },
      ),
    ).toThrow(/twice/);
  });
});
