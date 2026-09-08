import { describe, expect, it } from "vitest";
import { members, records, votes } from "../data/demo";
import { letterGrade, rubric, scoreMember } from "./scoring";
import { csvCell, rankByParty, toCsv, voteIntersection } from "./research";

describe("grade and consistency contracts", () => {
  it("normalizes repeated evidence instead of accumulating points toward extremes", () => {
    const m = members[2];
    const original = scoreMember(m, votes, records);
    const doubled = scoreMember(
      m,
      [...votes, ...votes.map((v) => ({ ...v, id: `${v.id}-copy` }))],
      [
        ...records,
        ...records.map((r) => ({ ...r, voteId: `${r.voteId}-copy` })),
      ],
    );
    expect(doubled.value).toBe(original.value);
    expect(doubled.grade).toBe(original.grade);
    expect(original.value).toBe(50);
  });
  it("requires evidence in both presidential party contexts for a consistent classification", () => {
    expect(scoreMember(members[0], votes, records).group).toBe("reformer");
    expect(
      scoreMember(members[0], votes, records, rubric, "2024-12-31").group,
    ).toBe("conditional");
    expect(scoreMember(members[4], votes, records).group).toBe("surveillance");
  });
  it("does not award a grade to a new member with only two eligible votes", () => {
    const result = scoreMember(members[7], votes, records);
    expect(result.counted).toBe(2);
    expect(result.value).toBeNull();
    expect(result.grade).toBe("—");
    expect(result.group).toBe("conditional");
  });
  it("excludes abstentions rather than treating them as opposition", () => {
    const result = scoreMember(
      members[0],
      votes,
      records.map((r) =>
        r.memberId === members[0].id && r.voteId === "demo-house-1"
          ? { ...r, outcome: "Not voting" as const }
          : r,
      ),
    );
    expect(result.value).toBe(100);
    expect(result.possible).toBe(6);
    expect(result.counted).toBe(5);
  });
  it("uses actual vote direction, including No votes that support reform", () => {
    const result = scoreMember(members[0], votes, records);
    const renewal = result.evidence.find((e) => e.voteId === "demo-house-2")!;
    expect(renewal.outcome).toBe("No");
    expect(renewal.aligned).toBe(true);
  });
  it("keeps independents unproven without a reviewed presidential alignment policy", () => {
    const result = scoreMember(members[6], votes, records);
    expect(result.value).toBe(100);
    expect(result.group).toBe("conditional");
    expect(result.ownCount).toBe(0);
  });
  it("uses party at the time of the vote instead of current membership", () => {
    const result = scoreMember(
      { ...members[0], party: "Republican" },
      votes,
      records,
    );
    expect(result.ownCount).toBe(4);
    expect(result.otherCount).toBe(2);
  });
  it("excludes future evidence and handles no evidence", () => {
    expect(
      scoreMember(members[0], votes, records, rubric, "2020-01-01").value,
    ).toBeNull();
    expect(
      scoreMember(members[0], votes, records, rubric, "2024-12-31").evidence,
    ).toHaveLength(4);
  });
  it("rejects duplicate observations, unknown votes and invalid weights", () => {
    expect(() =>
      scoreMember(members[0], votes, [...records, records[0]]),
    ).toThrow("Duplicate");
    expect(() => scoreMember(members[0], [], records)).toThrow("Missing");
    expect(() =>
      scoreMember(
        members[0],
        votes.map((v) => ({ ...v, weight: 0 })),
        records,
      ),
    ).toThrow("positive");
  });
  it("applies grade boundaries before display rounding", () => {
    expect(letterGrade(96.9)).toBe("A");
    expect(letterGrade(97)).toBe("A+");
    expect(letterGrade(89.99)).toBe("B");
    expect(letterGrade(65)).toBe("C");
    expect(letterGrade(49.99)).toBe("F");
  });
});
describe("research and export", () => {
  it("intersects exact roll-call IDs and directions on the same member", () => {
    const result = voteIntersection(
      members,
      records,
      "demo-house-1",
      "Yes",
      "demo-house-2",
      "No",
    );
    expect(result.map((m) => m.id)).toEqual(["demo-maya-chen"]);
    expect(
      voteIntersection(
        members,
        records,
        "demo-house-1",
        "Yes",
        "demo-senate-2",
        "No",
      ),
    ).toEqual([]);
  });
  it("ranks parties independently and excludes unrated members", () => {
    const result = rankByParty(
      members.filter((m) => m.status === "active"),
      votes,
      records,
      1,
    );
    expect(result.map((m) => m.id)).toEqual([
      "demo-maya-chen",
      "demo-james-walker",
    ]);
    expect(
      rankByParty(members, votes, records, 10).some(
        (m) => m.id === "demo-priya-shah",
      ),
    ).toBe(false);
  });
  it("escapes quotes, delimiters and dangerous spreadsheet prefixes", () => {
    expect(csvCell("\u0000=1+1")).toBe('"\'=1+1"');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell('=IMPORTXML("url")')).toBe('"\'=IMPORTXML(""url"")"');
    expect(
      toCsv([
        ["Name", "Party"],
        ["Maya Chen", "Democratic"],
      ]),
    ).toContain("\r\n");
  });
});
