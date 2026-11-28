// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { members, records, votes, dataset as meta } from "../../data/demo";
import { scoreMember } from "../../core/scoring";
import type { Dataset } from "../../core/publication";
import { notGradedGroupLabel, notGradedLabel } from "../../core/copy";

const MIN = 5;
const dataset: Dataset = {
  ...meta,
  members,
  votes,
  records,
  rubric: { version: "custom", minVotes: MIN, minPerContext: 2, consistencyThreshold: 75 },
  sources: [],
  coverage: [],
};
const scoreOf = (m: (typeof members)[number]) =>
  scoreMember(m, dataset.votes, dataset.records, dataset.rubric, dataset.asOf);
vi.mock("../../data/context", () => ({
  DataProvider: ({ children }: { children: unknown }) => children,
  useScorecard: () => ({
    state: "demo" as const,
    ...dataset,
    dataset,
    publication: undefined,
    score: (m: (typeof members)[number], asOf = dataset.asOf) =>
      scoreMember(m, dataset.votes, dataset.records, dataset.rubric, asOf),
  }),
}));
const { Profile } = await import("./Profile");
const { default: App } = await import("../../App");

afterEach(cleanup);
const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
const ungraded = members.filter((m) => m.status === "active" && scoreOf(m).value === null);
const graded = members.filter((m) => m.status === "active" && scoreOf(m).value !== null);

describe("fixture", () => {
  it("has both graded and not-graded active members under minVotes 5", () => {
    expect(ungraded.length).toBeGreaterThan(0);
    expect(graded.length).toBeGreaterThan(0);
  });
});

describe("not-graded copy", () => {
  it("reads the threshold from its argument", () => {
    expect(notGradedLabel(3)).toBe("Not graded: fewer than 3 votes");
    expect(notGradedLabel(5)).toBe("Not graded: fewer than 5 votes");
  });
  it("labels the group with its size", () => {
    expect(notGradedGroupLabel(42)).toBe("Not graded (42)");
  });
});

describe("profile", () => {
  it("shows the rubric's threshold for a member with no grade", () => {
    const { container } = render(<Profile member={ungraded[0]} copy={vi.fn()} />);
    const t = norm(container.textContent);
    expect(t).toContain("Not graded: fewer than 5 votes");
    expect(t).not.toContain("fewer than 3");
    expect(t).not.toContain("Not yet rated reform alignment");
  });
  it("does not show the label for a graded member", () => {
    const { container } = render(<Profile member={graded[0]} copy={vi.fn()} />);
    expect(norm(container.textContent)).not.toContain("Not graded:");
  });
});

describe("directory", () => {
  function directory(sort: string) {
    // The home directory is collapsed until "Browse all"; open it from the fragment.
    window.history.replaceState(null, "", `/scorecard/?sort=${sort}#browse=all`);
    const { container } = render(<App />);
    const rows = [...container.querySelectorAll("table.member-table tbody tr")];
    return { container, rows };
  }
  for (const sort of ["score", "name"]) {
    it(`puts not-graded members in a labelled last group under ${sort} sort`, () => {
      const { rows } = directory(sort);
      const header = rows.findIndex((r) => r.classList.contains("not-graded-group"));
      expect(header).toBeGreaterThan(0);
      expect(norm(rows[header].textContent)).toBe(`Not graded (${ungraded.length})`);
      const after = rows.slice(header + 1);
      const before = rows.slice(0, header);
      expect(after).toHaveLength(ungraded.length);
      expect(before).toHaveLength(graded.length);
      for (const m of ungraded) {
        expect(after.some((r) => norm(r.textContent).includes(m.name))).toBe(true);
        expect(before.some((r) => norm(r.textContent).includes(m.name))).toBe(false);
      }
      expect(after.every((r) => norm(r.textContent).includes("fewer than 5 votes"))).toBe(true);
    });
  }
  it("does not render the group when everyone shown is graded", () => {
    window.history.replaceState(null, "", `/scorecard/?q=${encodeURIComponent(graded[0].name)}`);
    const { container } = render(<App />);
    expect(container.querySelector(".not-graded-group")).toBeNull();
  });
});
