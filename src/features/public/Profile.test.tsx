// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { members, records, votes } from "../../data/demo";
import { Profile } from "./Profile";

afterEach(cleanup);

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
    const dates = rows(3).map((row) => text(row).match(/\d{4}-\d{2}-\d{2}/)![0]);
    expect(dates).toEqual(expected(3).map((e) => e.vote.date));
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("states the recorded vote, the reform position and the party context", () => {
    const shown = rows(3);
    const member = members[3];
    expected(3).forEach((e, i) => {
      const row = text(shown[i]);
      expect(row).toContain(`Voted ${e.outcome} · Reform position: ${e.vote.reformVote}`);
      expect(row).toContain(
        `Under a ${e.vote.presidentParty} president · ${member.party} at the time`,
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
      expect(text(row)).toMatch(/Not eligible · Reform position: (Yes|No)/);
      expect(text(row.querySelector(".vote-mark .sr-only")!)).toBe("Not scored");
    }
  });

  it("uses the shared source label instead of calling missing sources fictional", () => {
    const shown = rows(3);
    for (const row of shown) {
      expect(text(row)).toContain("Source unavailable");
      expect(text(row)).not.toContain("Fictional source");
    }
  });
});
