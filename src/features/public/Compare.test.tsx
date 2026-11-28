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
      "2 votes under a president of their own party, 0 under a president of the other party.",
    );
    expect(u).toContain(splitCopy.notEnough);
    expect(u).not.toMatch(/Same party|Other party/);
  });
});
