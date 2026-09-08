import { describe, it, expect } from "vitest";
import { members, votes, records } from "../data/demo";
import { scoreMember, rubric, validateRubric } from "./scoring";
describe("versioned scoring policy", () => {
  it("can require matched issue coverage without inventing comparability", () => {
    const result = scoreMember(
      members[0],
      votes,
      records,
      { ...rubric, minSharedTopics: 1 },
      "2026-09-07",
    );
    expect(result.group).toBe("conditional");
    expect(result.topicCoverageWarning).toContain("No shared issue");
    const matched = votes.map((v) => ({ ...v, topic: "Warrants" }));
    expect(
      scoreMember(
        members[0],
        matched,
        records,
        { ...rubric, minSharedTopics: 1 },
        "2026-09-07",
      ).group,
    ).toBe("reformer");
  });
  it("displays excluded old observations and applies explicit recency policy", () => {
    const result = scoreMember(
      members[0],
      votes,
      records,
      { ...rubric, lookbackYears: 2 },
      "2026-09-07",
    );
    expect(result.counted).toBe(2);
    expect(result.evidence.filter((e) => !e.inWindow)).toHaveLength(4);
    expect(result.value).toBeNull();
    const weighted = scoreMember(
      members[2],
      votes,
      records,
      { ...rubric, halfLifeYears: 1 },
      "2026-09-07",
    );
    expect(weighted.value).toBeGreaterThan(50);
    expect(weighted.possible).toBeLessThan(8);
  });
  it("binds grade thresholds to the rubric and rejects malformed settings", () => {
    expect(
      scoreMember(members[2], votes, records, {
        ...rubric,
        gradeBands: [
          { label: "Pass", minimum: 50 },
          { label: "Fail", minimum: 0 },
        ],
      }).grade,
    ).toBe("Pass");
    expect(() =>
      validateRubric({ ...rubric, consistencyThreshold: 50 }),
    ).toThrow();
    expect(() => validateRubric({ ...rubric, minVotes: 0 })).toThrow();
    expect(() => validateRubric({ ...rubric, halfLifeYears: -1 })).toThrow();
    expect(() =>
      validateRubric({
        ...rubric,
        gradeBands: [
          { label: "A", minimum: 0 },
          { label: "B", minimum: 50 },
        ],
      }),
    ).toThrow();
  });
});
