import { expect, it } from "vitest";
import { demoDataset } from "../../data/demo-dataset";
import { scoreMember } from "../../core/scoring";
import { itemImpact } from "./itemImpact";

it("matches the core scorer when an item is reweighted or retired", () => {
  const dataset = demoDataset;
  const item = dataset.votes[0];
  const affected = new Set(
    dataset.records.filter((r) => r.voteId === item.id).map((r) => r.memberId),
  );
  for (const after of [
    {
      ...dataset,
      votes: dataset.votes.map((v) =>
        v.id === item.id ? { ...v, weight: 0.5 } : v,
      ),
    },
    {
      ...dataset,
      votes: dataset.votes.filter((v) => v.id !== item.id),
      records: dataset.records.filter((r) => r.voteId !== item.id),
    },
  ]) {
    const rows = itemImpact(dataset, after, item.id);
    expect(rows.map((row) => row.id).sort()).toEqual([...affected].sort());
    for (const row of rows) {
      const member = dataset.members.find((m) => m.id === row.id)!;
      const score = scoreMember(
        member,
        after.votes,
        after.records,
        after.rubric,
        after.asOf,
      );
      expect(row.after).toEqual({ grade: score.grade, value: score.value });
    }
  }
});
