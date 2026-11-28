import { expect, it } from "vitest";
import { demoDataset } from "../data/demo-dataset";
import { validateDataset } from "../../worker/validation";
import { buildPublicationIndex } from "./publication-index";
import { seriesVisibility, removeVoteFromSeries } from "./voteSeries";
import type { Dataset } from "./publication";

const house = demoDataset.votes.filter((v) => v.chamber === "House");
const senate = demoDataset.votes.find((v) => v.chamber === "Senate")!;
const dataset: Dataset = {
  ...demoDataset,
  voteSeries: [
    {
      id: "series-702",
      name: "Section 702 warrants",
      rationale: "Each roll call tests the same warrant requirement.",
      chamber: "House",
      voteIds: [house[0].id, house[1].id],
    },
  ],
};

it("validates named same-chamber roll-call series and keeps them in a publication index", () => {
  expect(validateDataset(dataset)).toEqual([]);
  const publication = {
    id: "archive",
    digest: "a".repeat(64),
    previousId: null,
    dataset,
    createdAt: "2026-11-27",
    publishedBy: "fixture",
    summary: "Draft series",
  };
  expect(buildPublicationIndex(publication).dataset.voteSeries).toEqual(
    dataset.voteSeries,
  );
  const series = dataset.voteSeries![0];
  expect(
    validateDataset({
      ...dataset,
      voteSeries: [{ ...series, voteIds: [house[0].id, senate.id] }],
    }).join(" "),
  ).toMatch(/same chamber/i);
  expect(
    validateDataset({
      ...dataset,
      voteSeries: [{ ...series, voteIds: [house[0].id, house[0].id] }],
    }).join(" "),
  ).toMatch(/distinct/i);
});

it("flags demo and placeholder series and removes links to retired votes", () => {
  expect(seriesVisibility(dataset)).toBe("preview");
  expect(
    seriesVisibility({ ...dataset, demo: false, id: "PLACEHOLDER-PENDING" }),
  ).toBe("preview");
  expect(seriesVisibility({ ...dataset, demo: false, id: "reviewed" })).toBe(
    "reviewed",
  );
  expect(removeVoteFromSeries(dataset.voteSeries, house[0].id)).toEqual([]);
});
