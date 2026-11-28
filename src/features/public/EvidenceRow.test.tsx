// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Outcome, Party, Vote } from "../../core/types";
import { alignmentLabels } from "../../core/copy";
import { EvidenceRow } from "./EvidenceRow";
import { Legend } from "./Legend";

afterEach(cleanup);

const text = (el: Element) => el.textContent!.replace(/\s+/g, " ").trim();
const vote: Vote = {
  id: "v1",
  bill: "H.Amdt. 876",
  title: "FISA 702 warrant amendment",
  date: "2024-04-12",
  administration: "Biden",
  presidentParty: "Democratic",
  chamber: "House",
  reformVote: "Yes",
  weight: 2,
  topic: "FISA",
  rationale: "Requires a warrant.",
  source: "https://clerk.house.gov/Votes/2024119",
};
function entry(
  outcome: Outcome,
  {
    inWindow = true,
    partyAtVote = "Republican" as Party,
    v = vote,
  }: { inWindow?: boolean; partyAtVote?: Party; v?: Vote } = {},
) {
  const scored = inWindow && (outcome === "Yes" || outcome === "No");
  return {
    memberId: "m1",
    voteId: v.id,
    outcome,
    partyAtVote,
    vote: v,
    scored,
    inWindow,
    effectiveWeight: v.weight,
    aligned: outcome === v.reformVote,
    ownParty: partyAtVote === v.presidentParty,
  };
}
const cases = [
  { state: "aligned", e: entry("Yes"), shape: "check" },
  { state: "not-aligned", e: entry("No"), shape: "cross" },
  { state: "did-not-vote", e: entry("Not voting"), shape: "dash" },
  { state: "not-in-office", e: entry("Not eligible"), shape: "circle" },
  { state: "outside-window", e: entry("Yes", { inWindow: false }), shape: "clock" },
] as const;

function row(e: ReturnType<typeof entry>) {
  const { container } = render(<EvidenceRow entry={e} />);
  return container.querySelector(".evidence-row")!;
}

describe("evidence row", () => {
  it("gives every state a visible word and its own icon shape", () => {
    const shapes = new Set<string>();
    for (const { state, e, shape } of cases) {
      const r = row(e);
      expect(r.getAttribute("data-state")).toBe(state);
      const word = r.querySelector(".evidence-state")!;
      expect(text(word)).toBe(alignmentLabels[state]);
      expect(word.closest(".sr-only")).toBeNull();
      const icon = r.querySelector(".evidence-status svg")!;
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.getAttribute("data-shape")).toBe(shape);
      shapes.add(shape);
      cleanup();
    }
    expect(shapes.size).toBe(cases.length);
  });

  it("states the pro-reform vote, weight and points", () => {
    const r = row(entry("No"));
    expect(text(r)).toContain("A YES vote was the pro-reform vote.");
    expect(text(r.querySelector(".evidence-weight")!)).toBe("Weight 2 · 0 of 2");
    cleanup();
    expect(text(row(entry("Yes")).querySelector(".evidence-weight")!)).toBe(
      "Weight 2 · 2 of 2",
    );
    cleanup();
    expect(
      text(row(entry("Not voting")).querySelector(".evidence-weight")!),
    ).toBe("Weight 2");
  });

  it("shows the member's action, with Cosponsored for bill support", () => {
    expect(text(row(entry("No")))).toContain("Voted No");
    cleanup();
    const co = row(entry("Yes", { v: { ...vote, kind: "cosponsorship" } }));
    expect(text(co)).toContain("Cosponsored");
    expect(text(co)).not.toContain("Voted");
    expect(text(co)).toContain("Cosponsoring was the pro-reform action.");
    cleanup();
    // Only a Yes record on a cosponsorship item is a sign-on, as in evidenceLabel.
    const no = row(entry("No", { v: { ...vote, kind: "cosponsorship" } }));
    expect(text(no)).not.toContain("Cosponsored");
  });

  it("is a plain block, so page card styles for article never match a row", () => {
    const r = row(entry("Yes"));
    expect(r.tagName).toBe("DIV");
    expect(r.querySelector("article, header, section")).toBeNull();
  });

  it("never states a party for a not eligible record", () => {
    for (const party of ["Democratic", "Republican", "Independent"] as Party[]) {
      const r = row(entry("Not eligible", { partyAtVote: party }));
      const t = text(r);
      expect(t).not.toMatch(/at the time/);
      expect(t).not.toMatch(/\b(Democrat|Republican|Independent) at\b/);
      expect(t).not.toContain("Counts toward");
      expect(t).toContain("Under a Democratic president");
      cleanup();
    }
  });

  it("keeps the outside-window label and the member's cast vote", () => {
    const r = row(entry("Yes", { inWindow: false }));
    expect(text(r.querySelector(".evidence-state")!)).toBe(
      "Outside the scoring window",
    );
    expect(text(r)).toContain("Voted Yes");
    expect(text(r)).not.toContain("Counts toward");
  });

  it("links the official record and the vote page, pinned to the publication", () => {
    const { container } = render(
      <EvidenceRow entry={entry("Yes")} publicationId="pub-9" />,
    );
    const links = [...container.querySelectorAll("a")];
    expect(links.map(text)).toEqual(
      expect.arrayContaining(["Original source ↗", "Vote page"]),
    );
    const page = links.find((a) => text(a) === "Vote page")!;
    expect(page.getAttribute("href")).toBe(
      "/scorecard/legislation/v1?publication=pub-9",
    );
  });
});

describe("legend", () => {
  it("prints every state with the same word and icon as the rows", () => {
    const { container } = render(<Legend />);
    const items = [...container.querySelectorAll(".evidence-legend li")];
    expect(items.map(text)).toEqual(cases.map((c) => alignmentLabels[c.state]));
    expect(
      items.map((li) => li.querySelector("svg")!.getAttribute("data-shape")),
    ).toEqual(cases.map((c) => c.shape));
  });
});
