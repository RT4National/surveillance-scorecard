// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { members, records, votes } from "../../data/demo";
import { scoreMember } from "../../core/scoring";
import { Profile } from "./Profile";
import { splitCopy } from "./split";

// Lets a test swap in a different dataset or publication for the profile page.
let override: ((real: any) => any) | null = null;
vi.mock("../../data/context", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../data/context")>();
  return {
    ...mod,
    useScorecard: () => {
      const real = mod.useScorecard();
      return override ? override(real) : real;
    },
  };
});

afterEach(() => {
  cleanup();
  override = null;
});

const text = (el: Element) => el.textContent!.replace(/\s+/g, " ").trim();
function rows(memberIndex: number) {
  render(<Profile member={members[memberIndex]} copy={vi.fn()} />);
  return [...document.querySelectorAll(".evidence-row")];
}
function expected(memberIndex: number) {
  const member = members[memberIndex];
  return records
    .filter((r) => r.memberId === member.id)
    .map((r) => ({ ...r, vote: votes.find((v) => v.id === r.voteId)! }))
    .sort((a, b) => b.vote.date.localeCompare(a.vote.date));
}

describe("profile evidence rows", () => {
  it("lists evidence newest first", () => {
    const dates = rows(3).map(
      (row) => text(row).match(/\d{4}-\d{2}-\d{2}/)![0],
    );
    expect(dates).toEqual(expected(3).map((e) => e.vote.date));
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("states the reform position and the party context without repeating the outcome", () => {
    const shown = rows(3);
    const member = members[3];
    expected(3).forEach((e, i) => {
      const context = text(shown[i].querySelector(".evidence-context")!);
      expect(context).toContain(`Reform position: ${e.vote.reformVote}`);
      expect(context).toContain(
        `Under a ${e.vote.presidentParty} president · ${member.party} at the time`,
      );
      expect(context).not.toMatch(/Voted|\b(Yes|No) ·/);
    });
  });

  it("says which side of the presidency split each scored vote counts toward", () => {
    const shown = rows(3);
    expected(3).forEach((e, i) => {
      const own = e.partyAtVote === e.vote.presidentParty;
      expect(text(shown[i])).toContain(
        `Counts toward: ${own ? "own-party" : "other-party"} president`,
      );
    });
  });

  it("names the party in running text and keeps Independents distinct", () => {
    expect(text(rows(0)[0])).toContain("Democrat at the time");
    cleanup();
    expect(text(rows(6)[0])).toContain("Independent at the time");
  });

  it("gives every vote mark a screen-reader label", () => {
    const shown = rows(3);
    expected(3).forEach((e, i) => {
      const label = text(shown[i].querySelector(".vote-mark .sr-only")!);
      expect(label).toBe(
        e.outcome === e.vote.reformVote
          ? "Aligned with reform position"
          : "Not aligned with reform position",
      );
    });
  });

  it("describes votes that were not cast and labels them as not scored", () => {
    const shown = rows(7);
    const notEligible = expected(7).flatMap((e, i) =>
      e.outcome === "Not eligible" ? [shown[i]] : [],
    );
    expect(notEligible.length).toBeGreaterThan(0);
    for (const row of notEligible) {
      const context = text(row.querySelector(".evidence-context")!);
      expect(context).toMatch(
        /^Reform position: (Yes|No)\s*Under an? \w+ president$/,
      );
      expect(context).not.toContain("at the time");
      expect(context).not.toContain("Counts toward");
      expect(text(row.querySelector(".vote-result")!)).toContain(
        "Not eligible",
      );
      expect(text(row.querySelector(".vote-mark .sr-only")!)).toBe(
        "Not scored",
      );
    }
    // Rows the member was eligible for still name their party.
    expected(7).forEach((e, i) => {
      if (e.outcome !== "Not eligible")
        expect(text(shown[i])).toMatch(
          /(Democrat|Republican|Independent) at the time/,
        );
    });
  });

  it("uses the shared source label instead of calling missing sources fictional", () => {
    const shown = rows(3);
    for (const row of shown) {
      expect(text(row)).toContain("Source unavailable");
      expect(text(row)).not.toContain("Fictional source");
    }
  });
});

describe("profile split panel", () => {
  function split(memberIndex: number) {
    render(<Profile member={members[memberIndex]} copy={vi.fn()} />);
    const first = document.querySelector(".profile-main > .panel")!;
    expect(text(first)).toContain("Principles across presidencies");
    return first;
  }

  it("shows both percentages with N when the record is comparable", () => {
    const panel = split(2);
    const cells = [...panel.querySelectorAll(".context-grid > div")].map(
      (cell) => [...cell.children].map(text),
    );
    expect(cells).toEqual([
      ["President of their own party", "33%", "4 votes"],
      ["President of another party", "100%", "2 votes"],
    ]);
  });

  it("shows counts and no percentage when the scorer reports the record unproven", () => {
    const panel = split(8);
    expect(text(panel)).toContain(
      "2 own-party · 0 other-party votes",
    );
    expect(text(panel)).toContain(splitCopy.notEnough);
    expect(text(panel)).not.toContain("%");
    expect(panel.querySelector(".context-grid")).toBeNull();
    expect(text(panel)).not.toContain("Not yet rated");
  });

  it("shows the not-applicable sentence for an Independent", () => {
    const panel = split(6);
    expect(text(panel)).toContain(splitCopy.independent);
    expect(text(panel)).not.toContain("%");
    expect(panel.querySelector(".context-grid")).toBeNull();
    expect(text(panel)).not.toContain("other-party votes");
  });
});

/** Demo data with an old vote added and the evidence stored newest first. */
function withOldEvidence(published: boolean) {
  override = (real) => {
    const old = { ...real.votes[0], id: "demo-old", date: "2013-03-01" };
    const ds = {
      ...real.dataset,
      votes: [...real.votes, old].reverse(),
      records: [
        ...real.records,
        {
          memberId: members[3].id,
          voteId: "demo-old",
          outcome: "Yes",
          partyAtVote: members[3].party,
        },
      ].reverse(),
    };
    return {
      ...real,
      dataset: ds,
      ...ds,
      publication: published
        ? { id: "pub-1", scoring: { version: "scorer-test" } }
        : undefined,
      score: (m: any, asOf = ds.asOf) =>
        scoreMember(m, ds.votes, ds.records, ds.rubric, asOf),
    };
  };
  render(<Profile member={members[3]} copy={vi.fn()} />);
  return [...document.querySelectorAll(".timeline button")];
}

describe("profile timeline honesty", () => {
  it("tags recalculated grades in text and leaves the frozen published one untagged", () => {
    const buttons = withOldEvidence(true);
    expect(buttons.length).toBe(3);
    const last = buttons[buttons.length - 1];
    expect(text(last)).toContain("2026-09-07");
    expect(text(last)).not.toContain("Recalculated");
    for (const b of buttons.slice(0, -1))
      expect(text(b)).toContain("Recalculated");
  });

  it("tags every timeline grade as recalculated when there is no frozen publication", () => {
    const buttons = withOldEvidence(false);
    for (const b of buttons) expect(text(b)).toContain("Recalculated");
  });

  it("derives the date input minimum from the earliest evidence date", () => {
    withOldEvidence(false);
    const input =
      document.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(input.min).toBe("2013-03-01");
  });

  it("lists timeline years in ascending order", () => {
    const years = withOldEvidence(false).map((b) =>
      text(b.querySelector("small")!),
    );
    expect(years).toEqual([...years].sort());
    expect(years).toEqual(["2024", "2025", "2026"]);
  });
});
