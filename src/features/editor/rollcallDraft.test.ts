import { expect, it } from "vitest";
import type { RollcallStage } from "../../ingestion/rollcalls";
import { demoDataset } from "../../data/demo-dataset";
import { addReviewedRollcall, unmatchedRollcallMembers } from "./rollcallDraft";

const member = demoDataset.members[0];
const stage: RollcallStage = {
  id: "house-119-1-2",
  chamber: "House",
  congress: 119,
  session: 1,
  roll: 2,
  date: "2025-01-03",
  question: "On Passage",
  bill: "H.R. 1",
  records: [
    {
      memberId: member.id,
      voteId: "house-119-1-2",
      outcome: "Yes",
      partyAtVote: "Democratic",
    },
  ],
  sources: [
    {
      url: "https://clerk.house.gov/evs/2025/roll002.xml",
      sha256: "a".repeat(64),
      kind: "votes",
      retrievedAt: "2025-01-04T00:00:00Z",
    },
  ],
  warnings: [],
  requiresReview: true,
};
const editorial = {
  title: "Reviewed title",
  administration: "Example",
  presidentParty: "Democratic" as const,
  reformVote: "No" as const,
  topic: "Privacy",
  rationale: "Reviewed explanation",
  weight: 2,
};

it("does not drop unknown legislators and saves the capture with the reviewed item", () => {
  const missing = { ...demoDataset, members: [] };
  expect(unmatchedRollcallMembers(missing, stage)).toEqual([member.id]);
  expect(() => addReviewedRollcall(missing, stage, editorial)).toThrow(
    member.id,
  );
  const draft = addReviewedRollcall(demoDataset, stage, editorial);
  expect(draft.records.at(-1)).toEqual(stage.records[0]);
  expect(draft.sources.at(-1)).toEqual(stage.sources[0]);
  expect(draft.votes.at(-1)?.reformVote).toBe("No");
  expect(() => addReviewedRollcall(draft, stage, editorial)).toThrow("already");
});

it("keeps bill support one-sided and uses the public bill page", () => {
  const bill = {
    ...stage,
    kind: "cosponsorship" as const,
    officialTitle: "Example bill",
    source: "https://www.congress.gov/bill/119th-congress/house-bill/2",
  };
  const draft = addReviewedRollcall(demoDataset, bill, editorial);
  expect(draft.votes.at(-1)).toMatchObject({
    kind: "cosponsorship",
    source: bill.source,
    reformVote: "No",
  });
  expect(draft.records.at(-1)?.outcome).toBe("Yes");
  expect(draft.sources.at(-1)).toEqual(bill.sources[0]);
});
