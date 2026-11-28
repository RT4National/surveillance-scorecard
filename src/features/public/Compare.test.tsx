// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { demoDataset } from "../../data/context";
import { ComparePage } from ".";
import { splitCopy } from "./split";

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/scorecard/compare");
});

function selectMember(
  slot: number,
  member: (typeof demoDataset.members)[number],
) {
  fireEvent.change(screen.getByLabelText(`Member ${slot}`), {
    target: { value: `${member.name} · ${member.state} · ${member.id}` },
  });
}

const text = (el: Element) => el.textContent!.replace(/\s+/g, " ").trim();
const card = (name: string) =>
  [...document.querySelectorAll(".public-grid article")].find(
    (a) => a.querySelector("h2")?.textContent === name,
  )!;

describe("compare page split", () => {
  it("gates the own-party and other-party split per member", () => {
    render(<ComparePage dataset={demoDataset} />);
    const [comparable, independent, unproven] = [2, 6, 8].map(
      (i) => demoDataset.members[i],
    );
    selectMember(1, comparable);
    selectMember(2, independent);
    selectMember(3, unproven);

    const c = text(card(comparable.name));
    expect(c).toContain("Same party: 33% (4 votes)");
    expect(c).toContain("Other party: 100% (2 votes)");

    const i = text(card(independent.name));
    expect(i).toContain(splitCopy.independent);
    expect(i).not.toMatch(/Same party|Other party/);

    const u = text(card(unproven.name));
    expect(u).toContain("2 own-party · 0 other-party votes");
    expect(u).toContain(splitCopy.notEnough);
    expect(u).not.toMatch(/Same party|Other party/);
  });
});

describe("compare page evidence", () => {
  it("uses the shared evidence row and legend, with no party on not eligible rows", () => {
    render(<ComparePage dataset={demoDataset} />);
    const member = demoDataset.members[7];
    selectMember(1, member);
    const c = card(member.name);
    const rows = [...c.querySelectorAll(".evidence-row")];
    expect(rows.length).toBe(
      demoDataset.records.filter((r) => r.memberId === member.id).length,
    );
    expect(c.querySelector(".evidence-legend")).not.toBeNull();
    const notInOffice = rows.filter(
      (r) => r.getAttribute("data-state") === "not-in-office",
    );
    expect(notInOffice.length).toBeGreaterThan(0);
    for (const r of notInOffice) expect(text(r)).not.toContain("at the time");
  });
});

it("starts empty and reloads selected members from the share URL", () => {
  history.replaceState(null, "", "/scorecard/compare?publication=older");
  const [first, , second] = demoDataset.members;
  const { unmount } = render(<ComparePage dataset={demoDataset} />);
  expect(
    screen.getByText("Choose members to compare their records."),
  ).toBeTruthy();
  expect(card(first.name)).toBeUndefined();
  selectMember(1, first);
  selectMember(2, second);
  const params = new URLSearchParams(location.search);
  expect(params.get("m")).toBe(`${first.id},${second.id}`);
  expect(params.get("publication")).toBe("older");
  unmount();
  render(<ComparePage dataset={demoDataset} />);
  expect(card(first.name)).toBeTruthy();
  expect(card(second.name)).toBeTruthy();
  expect(screen.getByRole("table", { name: "Shared votes" })).toBeTruthy();
});
