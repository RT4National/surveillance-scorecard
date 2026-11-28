import { expect, it } from "vitest";
import { demoDataset } from "../data/demo-dataset";
import { createPublicationScoring } from "./publication-scores";
import type { Publication } from "./publication";
import { congressAlignment, congressAlignmentCsv } from "./congressTrends";

it("uses frozen scored actions, shows observed turnover, and exports the same figures", async () => {
  const [a, b, c] = demoDataset.members;
  const template = demoDataset.votes[0];
  const votes = [
    {
      ...template,
      id: "prev",
      date: "2025-01-02",
      presidentParty: "Democratic" as const,
    },
    {
      ...template,
      id: "next",
      date: "2025-01-03",
      presidentParty: "Republican" as const,
    },
  ];
  const dataset: Publication["dataset"] = {
    ...demoDataset,
    demo: false,
    id: "reviewed",
    votes,
    members: [a, b, c],
    records: [
      {
        memberId: a.id,
        voteId: "prev",
        outcome: template.reformVote,
        partyAtVote: "Democratic",
      },
      {
        memberId: b.id,
        voteId: "prev",
        outcome: template.reformVote,
        partyAtVote: "Republican",
      },
      {
        memberId: b.id,
        voteId: "next",
        outcome: template.reformVote,
        partyAtVote: "Republican",
      },
      {
        memberId: c.id,
        voteId: "next",
        outcome: template.reformVote === "Yes" ? "No" : "Yes",
        partyAtVote: "Democratic",
      },
      {
        memberId: a.id,
        voteId: "next",
        outcome: "Not voting",
        partyAtVote: "Republican",
      },
    ],
  };
  const p: Publication = {
    id: "published",
    dataset,
    scoring: await createPublicationScoring(dataset),
    createdAt: "2026-11-27",
    previousId: null,
    digest: "fixture",
    publishedBy: "fixture",
    summary: "Fixture",
  };
  const rows = congressAlignment(p);
  expect(rows.map((row) => row.congress)).toEqual([118, 119]);
  expect(rows[1]).toMatchObject({
    items: 1,
    presidents: ["Republican"],
    participants: 2,
    entered: 1,
    left: 1,
    sparse: true,
    own: { actions: 1, aligned: 1 },
    other: { actions: 1, aligned: 0 },
  });
  expect(congressAlignmentCsv(rows, p.id)).toContain(
    '"published","119","Republican","1","2","1","1","Too few votes","1","1","","1","0","",""',
  );
  expect(
    congressAlignment({ ...p, dataset: { ...dataset, demo: true } }),
  ).toEqual([]);
});
