// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
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
/** Rows keyed by vote id, so assertions do not depend on how the list is grouped. */
const byId = (shown: Element[]) =>
  new Map(shown.map((row) => [row.getAttribute("data-vote-id")!, row]));
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

  it("states the pro-reform vote and the party context without repeating the outcome", () => {
    const shown = byId(rows(3));
    const member = members[3];
    for (const e of expected(3)) {
      const row = shown.get(e.voteId)!;
      expect(text(row)).toContain(
        `A ${e.vote.reformVote.toUpperCase()} vote was the pro-reform vote.`,
      );
      const context = text(row.querySelector(".evidence-context")!);
      expect(context).toContain(
        `Under a ${e.vote.presidentParty} president · ${member.party} at the time`,
      );
      expect(context).not.toMatch(/Voted|\b(Yes|No) ·/);
    }
  });

  it("says which side of the presidency split each scored vote counts toward", () => {
    const shown = byId(rows(3));
    for (const e of expected(3)) {
      const own = e.partyAtVote === e.vote.presidentParty;
      expect(text(shown.get(e.voteId)!)).toContain(
        `Counts toward: ${own ? "own-party" : "other-party"} president`,
      );
    }
  });

  it("names the party in running text and keeps Independents distinct", () => {
    expect(text(rows(0)[0])).toContain("Democrat at the time");
    cleanup();
    expect(text(rows(6)[0])).toContain("Independent at the time");
  });

  it("gives every vote mark a visible alignment word", () => {
    const shown = byId(rows(3));
    for (const e of expected(3)) {
      const word = shown.get(e.voteId)!.querySelector(".evidence-state")!;
      expect(word.closest(".sr-only")).toBeNull();
      expect(text(word)).toBe(
        e.outcome === e.vote.reformVote ? "Aligned" : "Not aligned",
      );
    }
  });

  it("describes votes that were not cast and labels them as not in office", () => {
    const shown = byId(rows(7));
    const notEligible = expected(7).filter((e) => e.outcome === "Not eligible");
    expect(notEligible.length).toBeGreaterThan(0);
    for (const e of notEligible) {
      const row = shown.get(e.voteId)!;
      const context = text(row.querySelector(".evidence-context")!);
      expect(context).toMatch(/^Under an? \w+ president$/);
      expect(text(row)).not.toContain("at the time");
      expect(text(row)).not.toContain("Counts toward");
      expect(text(row.querySelector(".evidence-state")!)).toBe("Not in office");
    }
    // Rows the member was eligible for still name their party.
    for (const e of expected(7))
      if (e.outcome !== "Not eligible")
        expect(text(shown.get(e.voteId)!)).toMatch(
          /(Democrat|Republican|Independent) at the time/,
        );
  });

  it("prints the legend under the evidence list", () => {
    rows(3);
    const legend = document.querySelector(".profile-main .evidence-legend");
    expect(legend).not.toBeNull();
    expect(text(legend!)).toContain("Outside the scoring window");
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

  it("shows two labelled bars that expose percentage and N as text", () => {
    const panel = split(2);
    const sides = [...panel.querySelectorAll(".split-side")];
    expect(
      sides.map((side) => [
        text(side.querySelector(".split-label")!),
        text(side.querySelector(".split-percent")!),
        text(side.querySelector(".split-count")!),
      ]),
    ).toEqual([
      [splitCopy.ownLabel, "33%", "4 votes"],
      [splitCopy.otherLabel, "100%", "2 votes"],
    ]);
    const fills = sides.map(
      (side) => side.querySelector<HTMLElement>(".split-fill")!,
    );
    expect(fills.map((f) => f.style.width)).toEqual(["33%", "100%"]);
    for (const side of sides)
      expect(side.querySelector(".split-bar")!.getAttribute("aria-hidden")).toBe(
        "true",
      );
  });

  it("says what the split means and what it cannot show", () => {
    const panel = split(2);
    expect(text(panel)).toContain(splitCopy.meaning);
    expect(text(panel)).toContain(splitCopy.limits);
  });

  it("shows counts and no percentage when the scorer reports the record unproven", () => {
    const panel = split(8);
    expect(text(panel)).toContain(
      "2 own-party · 0 other-party votes",
    );
    expect(text(panel)).toContain(splitCopy.notEnough);
    expect(text(panel)).not.toContain("%");
    expect(panel.querySelector(".split-bar")).toBeNull();
    expect(text(panel)).not.toContain("Not yet rated");
  });

  it("shows the not-applicable sentence for an Independent", () => {
    const panel = split(6);
    expect(text(panel)).toContain(splitCopy.independent);
    expect(text(panel)).not.toContain("%");
    expect(panel.querySelector(".split-bar")).toBeNull();
    expect(text(panel)).not.toContain("other-party votes");
    expect(panel.querySelector(".split-chips")).toBeNull();
  });

  it("filters the evidence list by side with chips", () => {
    const panel = split(2);
    const s = scoreMember(members[2], votes, records);
    const ids = (keep: (e: (typeof s.evidence)[number]) => boolean) =>
      s.evidence.filter(keep).map((e) => e.voteId).sort();
    const shown = () =>
      [...document.querySelectorAll(".profile-main .evidence-row")]
        .map((r) => r.getAttribute("data-vote-id")!)
        .sort();
    const chip = (label: string) =>
      [...panel.querySelectorAll<HTMLButtonElement>(".split-chips button")].find(
        (b) => text(b).startsWith(label),
      )!;

    fireEvent.click(chip(splitCopy.chipOwn));
    expect(chip(splitCopy.chipOwn).getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toEqual(ids((e) => e.scored && e.ownParty));
    expect(shown()).toHaveLength(s.ownCount);

    fireEvent.click(chip(splitCopy.chipOther));
    expect(shown()).toEqual(ids((e) => e.scored && !e.ownParty));
    expect(shown()).toHaveLength(s.otherCount);

    fireEvent.click(chip(splitCopy.chipAll));
    expect(shown()).toEqual(ids(() => true));
  });
});

describe("context, not scored", () => {
  const ids = (sel: string) =>
    [...document.querySelectorAll(`${sel} .evidence-row`)].map(
      (r) => r.getAttribute("data-vote-id")!,
    );

  it("puts unscored rows under the context heading, outside the scored count", () => {
    render(<Profile member={members[7]} copy={vi.fn()} />);
    const s = scoreMember(members[7], votes, records);
    const unscored = s.evidence.filter((e) => !e.scored);
    expect(unscored.length).toBeGreaterThan(0);
    expect(ids(".evidence-scored").sort()).toEqual(
      s.evidence.filter((e) => e.scored).map((e) => e.voteId).sort(),
    );
    expect(ids(".evidence-unscored").sort()).toEqual(
      unscored.map((e) => e.voteId).sort(),
    );
    const heading = document.querySelector(".evidence-unscored h3")!;
    expect(text(heading)).toBe(`Context, not scored (${unscored.length})`);
    const pill = document.querySelector(".evidence-scored-count")!;
    expect(text(pill)).toBe(`${s.counted} votes`);
  });

  it("keeps each group newest first", () => {
    render(<Profile member={members[7]} copy={vi.fn()} />);
    for (const sel of [".evidence-scored", ".evidence-unscored"]) {
      const dates = [...document.querySelectorAll(`${sel} .evidence-row time`)].map(
        (t) => t.getAttribute("datetime")!,
      );
      expect(dates).toEqual([...dates].sort().reverse());
    }
  });

  it("keeps cosponsorships in the scored section with separate counts", () => {
    override = (real) => {
      const ds = {
        ...real.dataset,
        votes: real.votes.map((v: any, i: number) =>
          i % 4 === 0 ? { ...v, kind: "cosponsorship" } : v,
        ),
      };
      return {
        ...real,
        dataset: ds,
        ...ds,
        score: (m: any, asOf = ds.asOf) =>
          scoreMember(m, ds.votes, ds.records, ds.rubric, asOf),
      };
    };
    render(<Profile member={members[3]} copy={vi.fn()} />);
    const s = scoreMember(members[3], votes, records);
    const co = new Set(votes.filter((_, i) => i % 4 === 0).map((v) => v.id));
    const scored = s.evidence.filter((e) => e.scored);
    const nCo = scored.filter((e) => co.has(e.voteId)).length;
    const nVotes = scored.length - nCo;
    expect(nCo).toBeGreaterThan(0);
    const pill = text(document.querySelector(".evidence-scored-count")!);
    expect(pill).toBe(
      `${nVotes} ${nVotes === 1 ? "vote" : "votes"} · ${nCo} ${nCo === 1 ? "cosponsorship" : "cosponsorships"}`,
    );
    for (const id of co)
      if (scored.some((e) => e.voteId === id))
        expect(ids(".evidence-scored")).toContain(id);
  });
});

describe("profile headline", () => {
  const bands = [
    { label: "Gold", minimum: 60 },
    { label: "Silver", minimum: 30 },
    { label: "Bronze", minimum: 0 },
  ];
  function headline(memberIndex: number, gradeBands?: typeof bands) {
    if (gradeBands)
      override = (real) => {
        const rubric = { ...real.rubric, gradeBands };
        const ds = { ...real.dataset, rubric };
        return {
          ...real,
          dataset: ds,
          rubric,
          score: (m: any, asOf = ds.asOf) =>
            scoreMember(m, ds.votes, ds.records, rubric, asOf),
        };
      };
    render(<Profile member={members[memberIndex]} copy={vi.fn()} />);
    return document.querySelector(".profile-sidebar")!;
  }

  it("prints the band range from the active rubric", () => {
    const real = scoreMember(members[3], votes, records, {
      version: "t",
      minVotes: 3,
      minPerContext: 2,
      consistencyThreshold: 75,
      gradeBands: bands,
    });
    const i = bands.findIndex((b) => b.label === real.grade);
    expect(i).toBeGreaterThanOrEqual(0);
    const max = i === 0 ? 100 : bands[i - 1].minimum - 1;
    const t = text(headline(3, bands));
    expect(t).toContain(`${real.grade}: ${bands[i].minimum}–${max}%`);
  });

  it("states aligned of scored and the year range in words", () => {
    const s = scoreMember(members[3], votes, records);
    const scored = s.evidence.filter((e) => e.scored);
    const years = scored.map((e) => Number(e.vote.date.slice(0, 4)));
    const range =
      Math.min(...years) === Math.max(...years)
        ? `${Math.min(...years)}`
        : `${Math.min(...years)}–${Math.max(...years)}`;
    expect(text(headline(3))).toContain(
      `${scored.filter((e) => e.aligned).length} of ${scored.length} aligned · ${range}`,
    );
  });

  it("prints a participation line only when the member missed votes", () => {
    expect(text(headline(3))).not.toContain("Did not vote:");
    cleanup();
    // Two missed roll calls for the same member.
    override = (real) => {
      const missed = ["demo-miss-1", "demo-miss-2"].map((id) => ({
        ...real.votes[0],
        id,
      }));
      const ds = {
        ...real.dataset,
        votes: [...real.votes, ...missed],
        records: [
          ...real.records,
          ...missed.map((v) => ({
            memberId: members[3].id,
            voteId: v.id,
            outcome: "Not voting",
            partyAtVote: members[3].party,
          })),
        ],
      };
      return {
        ...real,
        dataset: ds,
        ...ds,
        score: (m: any, asOf = ds.asOf) =>
          scoreMember(m, ds.votes, ds.records, ds.rubric, asOf),
      };
    };
    render(<Profile member={members[3]} copy={vi.fn()} />);
    expect(text(document.querySelector(".profile-sidebar")!)).toContain(
      "Did not vote: 2 · not counted",
    );
  });

  it("has a closed disclosure for what the grade does not measure", () => {
    const d = headline(3).querySelector("details")!;
    expect(text(d.querySelector("summary")!)).toBe(
      "What this grade does not measure",
    );
    expect(d.open).toBe(false);
  });

  it("keeps the split as the first panel of the main column", () => {
    headline(3);
    const first = document.querySelector(".profile-main > .panel")!;
    expect(text(first)).toContain("Principles across presidencies");
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
