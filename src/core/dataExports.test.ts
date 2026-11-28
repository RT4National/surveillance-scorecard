import { expect, it } from "vitest";
import { demoDataset } from "../data/demo-dataset";
import { createPublicationScoring } from "./publication-scores";
import type { Publication } from "./publication";
import {
  canDownloadPublication,
  recordExport,
  recordCsv,
  scoreCsv,
} from "./dataExports";

it("exports pinned provenance and omits party for members who were out of office", async () => {
  const vote = demoDataset.votes[0];
  const member = demoDataset.members[0];
  const dataset: Publication["dataset"] = {
    ...demoDataset,
    id: "reviewed",
    demo: false,
    reuseLicence: "CC-BY-4.0",
    records: [
      {
        memberId: member.id,
        voteId: vote.id,
        outcome: "Not eligible",
        partyAtVote: "Republican",
      },
    ],
  };
  const p: Publication = {
    dataset,
    scoring: await createPublicationScoring(dataset),
    id: "p2",
    previousId: null,
    createdAt: "2026-11-27",
    summary: "",
    digest: "fixture",
    publishedBy: "fixture",
  };
  const origin = "https://scorecard.example";
  const evidence = recordExport(p, origin, vote);
  expect(evidence).toMatchObject({
    publicationId: "p2",
    licence: "CC BY 4.0",
    records: [{ outcome: "Not eligible", partyAtVote: null }],
  });
  expect(evidence.citation).toContain(
    `${origin}/scorecard/legislation/${vote.id}?publication=p2`,
  );
  expect(recordCsv(evidence)).toContain('"Not eligible",""');
  expect(scoreCsv(p, origin)).toContain('"Licence","CC BY 4.0"');
  expect(canDownloadPublication(p)).toBe(true);
  expect(
    canDownloadPublication({
      ...p,
      dataset: { ...dataset, reuseLicence: undefined },
    }),
  ).toBe(false);
  expect(
    canDownloadPublication({ ...p, dataset: { ...dataset, demo: true } }),
  ).toBe(false);
});
