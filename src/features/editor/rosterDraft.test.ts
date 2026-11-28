import { expect, it } from "vitest";
import { demoDataset } from "../../data/demo-dataset";
import type { RosterRun } from "../../ingestion/members";
import { previewRoster } from "./rosterDraft";

it("stages roster changes while preserving the draft cutoff, evidence, and historical staff edits", () => {
  const old = demoDataset.members[0];
  const base = {
    ...demoDataset,
    members: [
      { ...old, district: 3, committees: ["Judiciary"] },
      ...demoDataset.members.slice(1),
    ],
  };
  const capture = {
    url: "https://api.congress.gov/v3/member",
    kind: "members" as const,
    sha256: "a".repeat(64),
    retrievedAt: "2026-11-26T00:00:00.000Z",
  };
  const run: RosterRun = {
    asOf: capture.retrievedAt,
    complete: true,
    expectedCount: 1,
    sources: [capture],
    members: [{ ...old, chamber: "Senate", district: undefined }],
    affiliations: [],
    portraits: [],
    warnings: [],
  };
  const proposal = previewRoster(base, run);
  expect(proposal.changed.map(({ id }) => id)).toEqual([old.id]);
  expect(proposal.dataset.members[0]).toMatchObject({
    committees: ["Judiciary"],
    chamber: "Senate",
  });
  expect(proposal.dataset.members[0].district).toBeUndefined();
  expect(proposal.dataset.asOf).toBe(base.asOf);
  expect(proposal.dataset.id).toBe(base.id);
  expect(proposal.dataset.records).toBe(base.records);
  expect(proposal.dataset.sources).toContain(capture);
  expect(base.members[0].district).toBe(3);
  expect(proposal.missing).toContain(base.members[1].name);
  expect(previewRoster(proposal.dataset, run).dataset).toEqual(
    proposal.dataset,
  );
});
