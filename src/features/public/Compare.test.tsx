// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { demoDataset } from "../../data/context";
import { ComparePage } from ".";
import { splitCopy } from "./split";

afterEach(cleanup);

const text = (el: Element) => el.textContent!.replace(/\s+/g, " ").trim();
const card = (name: string) =>
  [...document.querySelectorAll(".public-grid article")].find(
    (a) => a.querySelector("h2")?.textContent === name,
  )!;

describe("compare page split", () => {
  it("gates the own-party and other-party split per member", () => {
    render(<ComparePage dataset={demoDataset} />);
    const [first, second, third] = document.querySelectorAll(
      ".public-controls select",
    );
    const [comparable, independent, unproven] = [2, 6, 8].map(
      (i) => demoDataset.members[i],
    );
    fireEvent.change(first, { target: { value: comparable.id } });
    fireEvent.change(second, { target: { value: independent.id } });
    fireEvent.change(third, { target: { value: unproven.id } });

    const c = text(card(comparable.name));
    expect(c).toContain("Same party: 33% (4 votes)");
    expect(c).toContain("Other party: 100% (2 votes)");

    const i = text(card(independent.name));
    expect(i).toContain(splitCopy.independent);
    expect(i).not.toMatch(/Same party|Other party/);

    const u = text(card(unproven.name));
    expect(u).toContain(
      "2 own-party · 0 other-party votes",
    );
    expect(u).toContain(splitCopy.notEnough);
    expect(u).not.toMatch(/Same party|Other party/);
  });
});

describe("compare page evidence", () => {
  it("uses the shared evidence row and legend, with no party on not eligible rows", () => {
    render(<ComparePage dataset={demoDataset} />);
    const [first] = document.querySelectorAll(".public-controls select");
    const member = demoDataset.members[7];
    fireEvent.change(first, { target: { value: member.id } });
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
