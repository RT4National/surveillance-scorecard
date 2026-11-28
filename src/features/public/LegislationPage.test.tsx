// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Dataset } from "../../core/publication";
import type { Member } from "../../core/types";
import { LegislationPage } from ".";

afterEach(cleanup);

const text = (el: Element) => el.textContent!.replace(/\s+/g, " ").trim();
const member = (id: string, name: string, party: Member["party"]): Member => ({
  id,
  name,
  party,
  state: "CA",
  chamber: "House",
  status: "active",
  committees: [],
  caucuses: [],
  since: 2020,
});
const data: Dataset = {
  id: "test",
  asOf: "2026-09-07",
  demo: true,
  sources: [],
  coverage: ["Test fixtures only"],
  rubric: { version: "test", minVotes: 1, minPerContext: 1, consistencyThreshold: 75 },
  members: [
    member("a", "Alice Serving", "Democratic"),
    member("b", "Bob Serving", "Republican"),
    member("c", "Carol Later", "Republican"),
  ],
  votes: [
    {
      id: "v1",
      bill: "HR1",
      title: "One",
      date: "2024-01-01",
      administration: "Test",
      presidentParty: "Democratic",
      chamber: "House",
      reformVote: "Yes",
      weight: 1,
      topic: "Privacy",
      rationale: "Test",
      source: "https://example.org/1",
    },
  ],
  records: [
    { memberId: "a", voteId: "v1", outcome: "Yes", partyAtVote: "Democratic" },
    { memberId: "b", voteId: "v1", outcome: "No", partyAtVote: "Republican" },
    // Not serving on this date; partyAtVote is a placeholder with no source.
    { memberId: "c", voteId: "v1", outcome: "Not eligible", partyAtVote: "Republican" },
  ],
};

function tables() {
  render(<LegislationPage dataset={data} voteId="v1" />);
  const [breakdown, rollCall] = [...document.querySelectorAll("table")];
  return { breakdown, rollCall };
}

describe("vote page and Not eligible records", () => {
  it("keeps Not eligible out of the party breakdown and reports them as a total", () => {
    const { breakdown } = tables();
    const headers = [...breakdown.querySelectorAll("thead th")].map(text);
    expect(headers).toEqual(["Party", "Yes", "No", "Not voting"]);
    const republican = [...breakdown.querySelectorAll("tbody tr")].find(
      (r) => text(r.querySelector("th")!) === "Republican",
    )!;
    expect([...republican.querySelectorAll("td")].map(text)).toEqual(["0", "1", "0"]);
    expect(text(document.body)).toContain("1 member not serving at the time");
  });

  it("does not state a party at the vote for members who were not serving", () => {
    const { rollCall } = tables();
    const row = (name: string) =>
      [...rollCall.querySelectorAll("tbody tr")]
        .find((r) => text(r).includes(name))!
        .querySelectorAll("td");
    expect(text(row("Carol Later")[1])).toBe("Not serving");
    expect(text(row("Carol Later")[2])).toBe("Not eligible");
    expect(text(row("Bob Serving")[1])).toBe("Republican");
  });
});
