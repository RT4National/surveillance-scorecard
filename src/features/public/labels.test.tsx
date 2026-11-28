// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { members, records, votes, dataset as meta } from "../../data/demo";
import { scoreMember } from "../../core/scoring";
import type { Dataset } from "../../core/publication";

const bands = [
  { label: "Gold", minimum: 60 },
  { label: "Silver", minimum: 30 },
  { label: "Bronze", minimum: 0 },
];
const mixedVotes = votes.map((v, i) =>
  i % 4 === 0 ? { ...v, kind: "cosponsorship" as const } : v,
);
const dataset: Dataset = {
  ...meta,
  members,
  votes: mixedVotes,
  records,
  rubric: { version: "custom", minVotes: 3, minPerContext: 2, consistencyThreshold: 75, gradeBands: bands },
  sources: [],
  coverage: [],
};
vi.mock("../../data/context", () => ({
  useScorecard: () => ({
    state: "demo" as const,
    ...dataset,
    dataset,
    publication: undefined,
    score: (m: (typeof members)[number], asOf = dataset.asOf) =>
      scoreMember(m, dataset.votes, dataset.records, dataset.rubric, asOf),
  }),
}));
const { Grade } = await import("./member");
const { Profile } = await import("./Profile");
const { PolicyLab } = await import("../PolicyLab");

afterEach(cleanup);

describe("grade colour with custom bands", () => {
  it("colours by the band's position in the active rubric", () => {
    const seen = new Set<string>();
    for (const m of members) {
      const s = scoreMember(m, dataset.votes, dataset.records, dataset.rubric);
      const { container } = render(<Grade member={m} />);
      const cls = container.querySelector(".grade")!.className;
      if (s.value === null) expect(cls).toContain("unrated");
      else {
        const idx = bands.findIndex((b) => b.label === s.grade);
        const tone = idx === 0 ? "good" : idx === bands.length - 1 ? "poor" : "mixed";
        expect(cls).toContain(tone);
        seen.add(tone);
      }
      cleanup();
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("count labels", () => {
  it("profile says scored actions with separate counts", () => {
    const { container } = render(<Profile member={members[3]} copy={vi.fn()} />);
    const t = container.textContent!;
    expect(t).toMatch(/scored actions \(\d+ votes?, \d+ cosponsorships?\)/);
    expect(t).not.toMatch(/scored votes|cast votes/);
  });
  it("methodology does not claim cosponsorships are excluded", () => {
    const { container } = render(<PolicyLab dataset={dataset} />);
    const t = container.textContent!;
    expect(t).not.toMatch(/co-?sponsorship is not counted/i);
    expect(t).toMatch(/cosponsor/i);
    expect(t).toMatch(/only raise/i);
  });
});
