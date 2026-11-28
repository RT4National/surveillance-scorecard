import { expect, it } from "vitest";
import { demoDataset } from "../data/demo-dataset";
import { publicationReasons } from "./changelog";

it("separates added evidence from revisions, rubric and cutoff changes", () => {
  const before = demoDataset;
  const added = { ...before.votes[0], id: "new-vote" };
  const [record, ...rest] = before.records;
  const after = {
    ...before,
    votes: [...before.votes, added],
    records: [{ ...record, outcome: "Not voting" as const }, ...rest],
    rubric: { ...before.rubric, minVotes: before.rubric.minVotes + 1 },
    asOf: "2026-11-27",
  };
  expect(publicationReasons(before, after)).toEqual([
    "new-evidence",
    "correction",
    "rubric",
    "cutoff",
  ]);
  expect(publicationReasons(null, before)).toEqual(["initial"]);
  expect(
    publicationReasons(before, {
      ...before,
      records: [...before.records].reverse(),
    }),
  ).toEqual([]);
});
