import { describe, expect, it } from "vitest";
import { bandRange, profileSummary } from "./summary";
import { defaultGradeBands, scoreMember } from "./scoring";
import { bandLine } from "./copy";
import type { Member, Outcome, RecordEntry, Vote } from "./types";

const member: Member = {
  id: "m1", name: "Test Member", party: "Democratic", state: "CA", chamber: "House",
  status: "active", committees: [], caucuses: [], since: 2015,
};
const vote = (id: string, date: string, kind?: Vote["kind"]): Vote => ({
  id, bill: id, title: id, date, administration: "A", presidentParty: "Democratic",
  chamber: "House", reformVote: "Yes", weight: 1, topic: "t", rationale: "", source: null, kind,
});
const items: [Vote, Outcome][] = [
  [vote("r1", "2015-03-01"), "Yes"], // outside a 7-year window
  [vote("r2", "2018-03-01"), "No"],
  [vote("r3", "2020-03-01"), "Yes"],
  [vote("c1", "2021-03-01", "cosponsorship"), "Yes"],
  [vote("r4", "2022-03-01"), "Not voting"],
  [vote("r5", "2023-03-01"), "Not eligible"],
];
const votes = items.map(([v]) => v);
const records: RecordEntry[] = items.map(([v, outcome]) => ({
  memberId: "m1", voteId: v.id, outcome, partyAtVote: "Democratic",
}));
const rubric = { version: "t", minVotes: 3, minPerContext: 2, consistencyThreshold: 75, lookbackYears: 7 };

describe("profile summary", () => {
  it("returns aligned, scored, not-voted and the year range from the score's evidence", () => {
    const s = scoreMember(member, votes, records, rubric);
    expect(profileSummary(s, votes)).toEqual({
      aligned: 2,
      scored: 3,
      notVoted: 1,
      years: { from: 2018, to: 2021 },
      counts: { votes: 2, cosponsorships: 1 },
    });
  });

  it("has no year range when nothing is scored", () => {
    const s = scoreMember(member, votes, records.filter((r) => r.outcome === "Not voting"), rubric);
    expect(profileSummary(s, votes)).toMatchObject({ aligned: 0, scored: 0, notVoted: 1, years: null });
  });
});

describe("band range", () => {
  it("reads the grade's numeric range from the rubric's bands", () => {
    expect(bandRange("B", defaultGradeBands)).toEqual({ label: "B", min: 80, max: 89 });
    expect(bandRange("A+", defaultGradeBands)).toEqual({ label: "A+", min: 97, max: 100 });
    expect(bandRange("F", defaultGradeBands)).toEqual({ label: "F", min: 0, max: 49 });
    const custom = [{ label: "Gold", minimum: 60 }, { label: "Silver", minimum: 30 }, { label: "Bronze", minimum: 0 }];
    expect(bandRange("Silver", custom)).toEqual({ label: "Silver", min: 30, max: 59 });
  });
  it("has no range for an ungraded or unknown grade", () => {
    expect(bandRange("—", defaultGradeBands)).toBeNull();
  });
  it("prints the range as a short label", () => {
    expect(bandLine({ label: "B", min: 80, max: 89 })).toBe("B: 80–89%");
  });
});
