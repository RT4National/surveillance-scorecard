import { describe, expect, it } from "vitest";
import {
  hasCosponsorships,
  methodologyCopy,
  scoredActionCounts,
  scoredActionsLabel,
  scoredNoun,
} from "./copy";
import { scoreMember } from "./scoring";
import type { Member, RecordEntry, Vote } from "./types";

const member: Member = {
  id: "m1", name: "Test Member", party: "Democratic", state: "CA", chamber: "House",
  status: "active", committees: [], caucuses: [], since: 2015,
};
const vote = (id: string, kind?: Vote["kind"]): Vote => ({
  id, bill: id, title: id, date: "2024-01-01", administration: "A", presidentParty: "Democratic",
  chamber: "House", reformVote: "Yes", weight: 1, topic: "t", rationale: "", source: null, kind,
});
const votes = [vote("r1"), vote("r2"), vote("c1", "cosponsorship"), vote("c2", "cosponsorship"), vote("r3")];
const records: RecordEntry[] = votes.map((v) => ({
  memberId: "m1", voteId: v.id, outcome: "Yes", partyAtVote: "Democratic",
}));

describe("methodology copy", () => {
  it("never says cosponsorships are excluded when the dataset has cosponsorship items", () => {
    expect(hasCosponsorships(votes)).toBe(true);
    const text = Object.values(methodologyCopy).join(" ");
    expect(text).toMatch(/cosponsor/i);
    expect(text).not.toMatch(/co-?sponsorship is not counted/i);
    expect(text).not.toMatch(/not counted as a vote/i);
    expect(methodologyCopy.cosponsorships).toMatch(/scored/i);
  });
  it("states the one-sided rule", () => {
    const text = methodologyCopy.oneSided;
    expect(text).toMatch(/only raise/i);
    expect(text).toMatch(/only lower/i);
    expect(text).toMatch(/not cosponsoring changes nothing/i);
  });
});

describe("scored action counts", () => {
  it("splits votes from cosponsorships using only scored evidence", () => {
    const s = scoreMember(member, votes, records);
    expect(scoredActionCounts(s, votes)).toEqual({ votes: 3, cosponsorships: 2 });
  });
  it("labels counts as scored actions with separate counts when cosponsorships exist", () => {
    expect(scoredActionsLabel({ votes: 12, cosponsorships: 3 }, true)).toBe(
      "15 scored actions (12 votes, 3 cosponsorships)",
    );
    expect(scoredActionsLabel({ votes: 1, cosponsorships: 1 }, true)).toBe(
      "2 scored actions (1 vote, 1 cosponsorship)",
    );
  });
  it("keeps 'scored votes' for datasets without cosponsorships", () => {
    expect(scoredActionsLabel({ votes: 4, cosponsorships: 0 }, false)).toBe("4 scored votes");
    expect(scoredNoun(false)).toBe("scored votes");
    expect(scoredNoun(true)).toBe("scored actions");
  });
});
