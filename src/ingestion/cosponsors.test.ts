import { describe, expect, it, vi } from "vitest";
import {
  billPageUrl,
  cosponsorsApiUrl,
  cosponsorshipItem,
  fetchBillSupport,
  parseBill,
  parseCosponsorPages,
} from "./cosponsors";

const id = { congress: 113, type: "s", number: 1599 };
const bill = {
  bill: {
    congress: 113,
    type: "S",
    number: "1599",
    originChamber: "Senate",
    introducedDate: "2013-10-29",
    title: "USA FREEDOM Act",
    sponsors: [
      { bioguideId: "L000174", party: "D", state: "VT", fullName: "Sen. Leahy, Patrick J. [D-VT]" },
    ],
    cosponsors: { count: 3, countIncludingWithdrawnCosponsors: 4 },
  },
};
const co = (over: Record<string, unknown>) => ({
  bioguideId: "A000001",
  party: "R",
  state: "UT",
  fullName: "Sen. A",
  isOriginalCosponsor: false,
  sponsorshipDate: "2013-11-01",
  ...over,
});
const page = {
  pagination: { count: 3, countIncludingWithdrawnCosponsors: 4 },
  cosponsors: [
    co({ bioguideId: "L000577", isOriginalCosponsor: true, sponsorshipDate: "2013-10-29" }),
    co({ bioguideId: "B000002", party: "D", sponsorshipDate: "2014-06-01" }),
    co({ bioguideId: "C000003", party: "L", sponsorshipDate: "2013-12-01" }),
    co({ bioguideId: "D000004", sponsorshipWithdrawnDate: "2014-01-15" }),
  ],
};

describe("Congress.gov bill support", () => {
  it("builds key-free API URLs and the public bill page", () => {
    expect(cosponsorsApiUrl(id, 250)).toBe(
      "https://api.congress.gov/v3/bill/113/s/1599/cosponsors?format=json&limit=250&offset=250",
    );
    expect(cosponsorsApiUrl(id, 0)).not.toMatch(/key/i);
    expect(billPageUrl(id)).toBe(
      "https://www.congress.gov/bill/113th-congress/senate-bill/1599",
    );
    expect(billPageUrl({ congress: 117, type: "hr", number: 2921 })).toBe(
      "https://www.congress.gov/bill/117th-congress/house-bill/2921",
    );
    expect(billPageUrl({ congress: 121, type: "hr", number: 1 })).toContain(
      "121st-congress",
    );
    expect(() => cosponsorsApiUrl({ ...id, type: "s/../x" }, 0)).toThrow();
  });
  it("parses the bill and refuses a response for a different bill", () => {
    expect(parseBill(bill, id)).toMatchObject({
      chamber: "Senate",
      introducedDate: "2013-10-29",
      label: "S. 1599",
      title: "USA FREEDOM Act",
      sponsor: { memberId: "L000174", party: "D" },
      countIncludingWithdrawn: 4,
    });
    expect(() => parseBill(bill, { ...id, number: 1600 })).toThrow();
    expect(() =>
      parseBill({ bill: { ...bill.bill, sponsors: [] } }, id),
    ).toThrow();
  });
  it("parses cosponsor pages, keeping withdrawal dates, and checks the totals", () => {
    const parsed = parseCosponsorPages([page]);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toEqual({
      memberId: "L000577",
      party: "R",
      date: "2013-10-29",
      original: true,
      name: "Sen. A",
    });
    expect(parsed[3].withdrawn).toBe("2014-01-15");
    expect(() =>
      parseCosponsorPages([{ ...page, cosponsors: page.cosponsors.slice(1) }]),
    ).toThrow(/total/);
    expect(() =>
      parseCosponsorPages([
        { ...page, cosponsors: [...page.cosponsors.slice(0, 3), co({ bioguideId: "L000577" })] },
      ]),
    ).toThrow(/twice/);
    expect(() =>
      parseCosponsorPages([
        { ...page, cosponsors: [...page.cosponsors.slice(0, 3), co({ sponsorshipDate: "2014-02-30" })] },
      ]),
    ).toThrow();
  });
  it("records the sponsor and current cosponsors as Yes, never non-cosponsors or withdrawn ones", () => {
    const item = cosponsorshipItem(parseBill(bill, id), parseCosponsorPages([page]), {});
    expect(item.vote).toMatchObject({
      id: "cosponsor-113-s-1599",
      kind: "cosponsorship",
      chamber: "Senate",
      date: "2013-10-29",
      bill: "S. 1599",
      source: "https://www.congress.gov/bill/113th-congress/senate-bill/1599",
    });
    expect(item.records).toEqual([
      { memberId: "L000174", voteId: "cosponsor-113-s-1599", outcome: "Yes", partyAtVote: "Democratic" },
      { memberId: "L000577", voteId: "cosponsor-113-s-1599", outcome: "Yes", partyAtVote: "Republican" },
      { memberId: "B000002", voteId: "cosponsor-113-s-1599", outcome: "Yes", partyAtVote: "Democratic" },
    ]);
    expect(item.supporters.map((s) => [s.memberId, s.role, s.date])).toEqual([
      ["L000174", "sponsor", "2013-10-29"],
      ["L000577", "cosponsor", "2013-10-29"],
      ["B000002", "cosponsor", "2014-06-01"],
    ]);
    expect(item.withdrawn.map((w) => w.memberId)).toEqual(["D000004"]);
    expect(item.withheld).toEqual([
      expect.objectContaining({ memberId: "C000003", reason: expect.stringContaining("party") }),
    ]);
  });
  it("applies a sign-on cutoff stated by the legacy criterion", () => {
    const item = cosponsorshipItem(parseBill(bill, id), parseCosponsorPages([page]), {
      signedBefore: "2014-05-18",
    });
    expect(item.records.map((r) => r.memberId)).toEqual(["L000174", "L000577"]);
    expect(item.late.map((l) => l.memberId)).toEqual(["B000002"]);
  });
  it("refuses a sponsor who is also listed as a cosponsor", () => {
    expect(() =>
      cosponsorshipItem(
        parseBill(bill, id),
        parseCosponsorPages([
          {
            pagination: { count: 1, countIncludingWithdrawnCosponsors: 1 },
            cosponsors: [co({ bioguideId: "L000174" })],
          },
        ]),
        {},
      ),
    ).toThrow(/sponsor/);
  });
  it("fetches every page with the key in a header only and captures key-free URLs", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const big = Array.from({ length: 251 }, (_, i) =>
      co({ bioguideId: `Z${String(i).padStart(6, "0")}` }),
    );
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      const u = new URL(url);
      const body = u.pathname.endsWith("/cosponsors")
        ? {
            pagination: { count: 251, countIncludingWithdrawnCosponsors: 251 },
            cosponsors: big.slice(Number(u.searchParams.get("offset")), Number(u.searchParams.get("offset")) + 250),
          }
        : { bill: { ...bill.bill, cosponsors: { count: 251, countIncludingWithdrawnCosponsors: 251 } } };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const result = await fetchBillSupport(id, {
      apiKey: "SECRET-KEY",
      fetch: fetcher as unknown as typeof fetch,
      retrievedAt: "2026-10-15T00:00:00.000Z",
    });
    expect(calls.map((c) => new URL(c.url).searchParams.get("offset"))).toEqual([null, "0", "250"]);
    expect(calls.every((c) => !c.url.includes("SECRET") && c.headers["X-Api-Key"] === "SECRET-KEY")).toBe(true);
    expect(result.cosponsors).toHaveLength(251);
    expect(result.raw).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(result.sources.every((s) => s.kind === "votes" && /^[a-f0-9]{64}$/.test(s.sha256))).toBe(true);
  });
  it("fails closed on an HTTP error", async () => {
    await expect(
      fetchBillSupport(id, {
        apiKey: "k",
        fetch: (async () => new Response("no", { status: 429 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/429/);
  });
});
