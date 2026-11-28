import { expect, it } from "vitest";
import { demoDataset } from "../data/demo-dataset";
import type { Publication } from "./publication";
import { createPublicationScoring } from "./publication-scores";
import { buildPublicationIndex } from "./publication-index";
import { publicationSeriesTrends } from "./seriesTrends";

it("projects oldest-first roll-call results from published ballots and hides previews", async () => {
  const votes = demoDataset.votes
    .filter((v) => v.chamber === "House")
    .slice(0, 2)
    .sort((a, b) => a.date.localeCompare(b.date));
  const [first, second] = votes;
  const dataset: Publication["dataset"] = {
    ...demoDataset,
    demo: false,
    id: "reviewed",
    votes,
    voteSeries: [
      {
        id: "series",
        name: "Repeated warrant votes",
        chamber: "House",
        rationale: "Same warrant requirement",
        voteIds: [second.id, first.id],
      },
    ],
    records: [
      {
        voteId: first.id,
        memberId: demoDataset.members[0].id,
        outcome: first.reformVote,
        partyAtVote: "Democratic",
      },
      {
        voteId: first.id,
        memberId: demoDataset.members[2].id,
        outcome: first.reformVote === "Yes" ? "No" : "Yes",
        partyAtVote: "Republican",
      },
      {
        voteId: first.id,
        memberId: demoDataset.members[3].id,
        outcome: "Not voting",
        partyAtVote: "Republican",
      },
      {
        voteId: first.id,
        memberId: demoDataset.members[5].id,
        outcome: "Not eligible",
        partyAtVote: "Republican",
      },
    ],
  };
  const publication: Publication = {
    dataset,
    scoring: await createPublicationScoring(dataset),
    id: "reviewed-publication",
    createdAt: "2026-11-27",
    previousId: null,
    digest: "fixture",
    publishedBy: "fixture",
    summary: "Fixture",
  };
  const trends = publicationSeriesTrends(publication);
  expect(trends[0].points.map((point) => point.voteId)).toEqual([
    first.id,
    second.id,
  ]);
  expect(trends[0].points[0]).toMatchObject({
    total: { forReform: 1, cast: 2, didNotVote: 1 },
    notInOffice: 1,
    byParty: { Republican: { forReform: 0, cast: 1, didNotVote: 1 } },
  });
  expect(buildPublicationIndex(publication).dataset.seriesTrends).toEqual(
    trends,
  );
  expect(
    publicationSeriesTrends({ ...publication, scoring: undefined }),
  ).toEqual([]);
  expect(
    publicationSeriesTrends({
      ...publication,
      dataset: { ...dataset, demo: true },
    }),
  ).toEqual([]);
  expect(
    publicationSeriesTrends({
      ...publication,
      dataset: { ...dataset, id: "PLACEHOLDER-1" },
    }),
  ).toEqual([]);
});
