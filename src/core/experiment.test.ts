import { describe, expect, it } from "vitest";
import { members, records, votes } from "../data/demo";
import type { Dataset } from "./publication";
import { parseExperiment, runExperiment } from "./experiment";
import { rubric, scoreMember } from "./scoring";

const dataset: Dataset = {
  id: "fixture",
  asOf: "9999-12-31",
  demo: true,
  members,
  votes,
  records,
  rubric,
  sources: [],
  coverage: [],
};

describe("rubric experiments", () => {
  it("reports no changes when the experiment is empty", () => {
    const result = runExperiment(dataset, parseExperiment({}));
    expect(result.changed).toHaveLength(0);
    expect(result.before.groups).toEqual(result.after.groups);
    expect(result.members).toBe(members.length);
  });

  it("matches scoreMember for a rubric-only change", () => {
    const experiment = parseExperiment({
      rubric: { consistencyThreshold: 95 },
    });
    const result = runExperiment(dataset, experiment);
    for (const row of result.rows) {
      const m = members.find((x) => x.id === row.id)!;
      const expected = scoreMember(m, votes, records, {
        ...rubric,
        consistencyThreshold: 95,
      });
      expect(row.after.grade).toBe(expected.grade);
      expect(row.after.group).toBe(expected.group);
    }
  });

  it("applies vote direction, weight and exclusion overrides", () => {
    const target = votes[0];
    const flipped = runExperiment(
      dataset,
      parseExperiment({
        votes: {
          [target.id]: {
            reformVote: target.reformVote === "Yes" ? "No" : "Yes",
          },
        },
      }),
    );
    expect(flipped.changed.length).toBeGreaterThan(0);
    const excluded = runExperiment(
      dataset,
      parseExperiment({ votes: { [target.id]: { exclude: true } } }),
    );
    const before = scoreMember(members[0], votes, records);
    const row = excluded.rows.find((r) => r.id === members[0].id)!;
    expect(row.after.counted).toBe(
      before.counted -
        (records.some(
          (r) =>
            r.memberId === members[0].id &&
            r.voteId === target.id &&
            (r.outcome === "Yes" || r.outcome === "No"),
        )
          ? 1
          : 0),
    );
    const heavier = runExperiment(
      dataset,
      parseExperiment({ votes: { [target.id]: { weight: 10 } } }),
    );
    expect(heavier.rows.some((r) => r.after.value !== r.before.value)).toBe(
      true,
    );
  });

  it("sorts changes by size of score movement and filters by chamber", () => {
    const result = runExperiment(
      dataset,
      parseExperiment({
        rubric: { halfLifeYears: 1 },
        filter: { chamber: "Senate" },
      }),
    );
    expect(result.rows.every((r) => r.chamber === "Senate")).toBe(true);
    const deltas = result.changed.map((r) => Math.abs(r.delta ?? 101));
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
  });

  it("rejects unknown fields, unknown votes and invalid rubrics", () => {
    expect(() => parseExperiment({ rubrik: {} })).toThrow(/Unknown field/);
    expect(
      () => parseExperiment({ rubric: { consistencyThreshold: 40 } }).rubric,
    ).not.toThrow();
    expect(() =>
      runExperiment(
        dataset,
        parseExperiment({ rubric: { consistencyThreshold: 40 } }),
      ),
    ).toThrow(/Consistency threshold/);
    expect(() =>
      runExperiment(
        dataset,
        parseExperiment({ votes: { nope: { weight: 2 } } }),
      ),
    ).toThrow(/Unknown vote nope/);
    expect(() => parseExperiment({ votes: { x: { weight: -1 } } })).toThrow(
      /weight/,
    );
  });
});
