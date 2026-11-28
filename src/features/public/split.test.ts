import { describe, expect, it } from "vitest";
import { members, records, votes } from "../../data/demo";
import { rubric, scoreMember } from "../../core/scoring";
import type { Member } from "../../core/types";
import { splitCopy, splitDisplay } from "./split";

const score = (member: Member, settings = rubric) =>
  scoreMember(member, votes, records, settings);

describe("splitDisplay", () => {
  it("shows both percentages with N when the scorer finds the record comparable", () => {
    const s = score(members[2]);
    expect(s.group).toBe("mixed");
    const d = splitDisplay(s, members[2].party);
    expect(d).toEqual({
      kind: "comparable",
      own: { percent: Math.floor(s.ownScore!), count: s.ownCount },
      other: { percent: Math.floor(s.otherScore!), count: s.otherCount },
    });
  });

  it("shows counts only when the scorer reports the record unproven", () => {
    const s = score(members[8]);
    expect(s.group).toBe("unproven");
    const d = splitDisplay(s, members[8].party);
    expect(d.kind).toBe("unproven");
    if (d.kind !== "unproven") return;
    expect(d.ownCount).toBe(2);
    expect(d.otherCount).toBe(0);
    expect(d.counts).toBe(
      "2 own-party · 0 other-party votes",
    );
    expect(d.counts).not.toContain("%");
    expect(d.message).toBe(splitCopy.notEnough);
  });

  it("uses the singular for one vote", () => {
    expect(
      splitDisplay(
        { group: "unproven", ownScore: 100, otherScore: 0, ownCount: 1, otherCount: 9 },
        "Democratic",
      ),
    ).toMatchObject({
      counts:
        "1 own-party · 9 other-party votes",
    });
  });

  it("shows a not-applicable sentence for Independents with no own-party votes", () => {
    const s = score(members[6]);
    expect(members[6].party).toBe("Independent");
    expect(splitDisplay(s, "Independent")).toEqual({
      kind: "not-applicable",
      message: splitCopy.independent,
    });
  });

  it("follows the scorer for an Independent who once served under their own party", () => {
    const d = splitDisplay(
      { group: "mixed", ownScore: 50, otherScore: 100, ownCount: 3, otherCount: 3 },
      "Independent",
    );
    expect(d.kind).toBe("comparable");
  });

  it("agrees with scoreMember on demo data under several rubrics, with no threshold of its own", () => {
    const rubrics = [
      rubric,
      { ...rubric, minPerContext: 3 },
      { ...rubric, minSharedTopics: 99 },
      { ...rubric, minPerContext: 1, minVotes: 1 },
    ];
    const kinds = new Set<string>();
    for (const settings of rubrics)
      for (const member of members) {
        const s = score(member, settings);
        const d = splitDisplay(s, member.party);
        kinds.add(d.kind);
        if (member.party === "Independent" && s.ownCount === 0)
          expect(d.kind).toBe("not-applicable");
        else if (s.group === "unproven") {
          expect(d.kind).toBe("unproven");
          expect(d).toMatchObject({ ownCount: s.ownCount, otherCount: s.otherCount });
        } else
          expect(d).toEqual({
            kind: "comparable",
            own: { percent: Math.floor(s.ownScore!), count: s.ownCount },
            other: { percent: Math.floor(s.otherScore!), count: s.otherCount },
          });
      }
    expect(kinds).toEqual(new Set(["comparable", "unproven", "not-applicable"]));
    // A stricter rubric flips comparable members to counts-only purely through the scorer's verdict.
    const strict = { ...rubric, minPerContext: 3 };
    expect(splitDisplay(score(members[0]), "Democratic").kind).toBe("comparable");
    expect(splitDisplay(score(members[0], strict), "Democratic").kind).toBe("unproven");
  });
});
