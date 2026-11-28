import { expect, it, vi } from "vitest";
import { stageBillSupport } from "./bill-intake";

const sponsor = { bioguideId: "A000001", party: "D", fullName: "Sponsor" };
const cosponsor = {
  bioguideId: "B000002",
  party: "R",
  fullName: "Cosponsor",
  sponsorshipDate: "2025-01-06",
};
const withdrawn = {
  ...cosponsor,
  bioguideId: "C000003",
  sponsorshipWithdrawnDate: "2025-02-01",
};
const pages = (count = 1) => [
  {
    bill: {
      congress: 119,
      type: "HR",
      number: 2,
      originChamber: "House",
      introducedDate: "2025-01-03",
      title: "Example bill",
      sponsors: [sponsor],
      cosponsors: { count, countIncludingWithdrawnCosponsors: 2 },
    },
  },
  {
    cosponsors: [cosponsor, withdrawn],
    pagination: { count: 1, countIncludingWithdrawnCosponsors: 2 },
  },
];

it("stages supporters and source captures with a header-only credential", async () => {
  const bodies = pages();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(bodies.shift()));
  const stage = await stageBillSupport(
    { congress: 119, bill: "H.R. 2" },
    "fixture-key",
    fetcher,
  );
  expect(stage.records.map((record) => record.memberId)).toEqual([
    "A000001",
    "B000002",
  ]);
  expect(stage.kind).toBe("cosponsorship");
  expect(stage.sources).toHaveLength(2);
  expect(JSON.stringify(stage)).not.toContain("fixture-key");
  for (const [url, options] of fetcher.mock.calls) {
    expect(String(url)).not.toContain("fixture-key");
    expect(new Headers(options?.headers).get("X-Api-Key")).toBe("fixture-key");
    expect(options?.redirect).toBe("manual");
  }
});

it("rejects a mismatch between the bill total and the cosponsor listing", async () => {
  const bodies = pages(2);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(bodies.shift()));
  await expect(
    stageBillSupport({ congress: 119, bill: "HR2" }, "fixture-key", fetcher),
  ).rejects.toMatchObject({ status: 502 });
});
