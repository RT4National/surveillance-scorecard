// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
  rubric: {
    version: "test",
    minVotes: 1,
    minPerContext: 1,
    consistencyThreshold: 75,
  },
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
    {
      memberId: "c",
      voteId: "v1",
      outcome: "Not eligible",
      partyAtVote: "Republican",
    },
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
    expect(headers).toEqual(["Party", "Yes", "No", "Did not vote"]);
    const republican = [...breakdown.querySelectorAll("tbody tr")].find(
      (r) => text(r.querySelector("th")!) === "Republican",
    )!;
    expect([...republican.querySelectorAll("td")].map(text)).toEqual([
      "0",
      "1",
      "0",
    ]);
    expect(text(document.body)).toContain("1 member not in office at the time");
  });

  it("does not state a party at the vote for members who were not serving", () => {
    const { rollCall } = tables();
    const row = (name: string) =>
      [...rollCall.querySelectorAll("tbody tr")]
        .find((r) => text(r).includes(name))!
        .querySelectorAll("td");
    expect(text(row("Carol Later")[1])).toBe("Not serving");
    expect(text(row("Carol Later")[2])).toBe("Not in office");
    expect(text(row("Bob Serving")[1])).toBe("Republican");
  });
});

it("shows recorded totals and filters by outcome, member name or state", () => {
  const { rollCall } = tables();
  expect(
    screen.getByText(/1 Yes · 1 No · 0 did not vote.*from recorded ballots/i),
  ).toBeTruthy();
  expect(screen.getByText(/A YES vote was the pro-reform vote/)).toBeTruthy();
  const search = screen.getByRole("searchbox", {
    name: "Filter by name or state",
  });
  fireEvent.change(search, { target: { value: "boB" } });
  expect(within(rollCall).getByText("Bob Serving")).toBeTruthy();
  expect(within(rollCall).queryByText("Alice Serving")).toBeNull();
  fireEvent.change(search, { target: { value: "ca" } });
  fireEvent.change(screen.getByLabelText("Outcome"), {
    target: { value: "Yes" },
  });
  expect(within(rollCall).getByText("Alice Serving")).toBeTruthy();
  expect(within(rollCall).queryByText("Bob Serving")).toBeNull();
});

it("shows cosponsors without a party-vote table", () => {
  const cosponsors: Dataset = {
    ...data,
    votes: [{ ...data.votes[0], kind: "cosponsorship" }],
    records: [data.records[0]],
  };
  render(<LegislationPage dataset={cosponsors} voteId="v1" />);
  expect(
    screen.getByRole("heading", { name: "Sponsors and cosponsors" }),
  ).toBeTruthy();
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.getByText("Cosponsored")).toBeTruthy();
});

it("groups the newest votes first and searches common names", () => {
  const newer = {
    ...data.votes[0],
    id: "new",
    title: "Two",
    date: "2025-01-03",
    commonName: "Privacy Act",
  };
  render(
    <LegislationPage dataset={{ ...data, votes: [data.votes[0], newer] }} />,
  );
  expect(screen.getAllByRole("heading", { level: 2 }).map(text)).toEqual([
    "119th Congress",
    "118th Congress",
  ]);
  expect(screen.getAllByRole("link", { name: /^HR1/ }).map(text)).toEqual([
    "HR1: Two",
    "HR1: One",
  ]);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search votes" }), {
    target: { value: "privacy act" },
  });
  expect(screen.getAllByRole("link", { name: /^HR1/ }).map(text)).toEqual([
    "HR1: Two",
  ]);
});

it("renders final tally bar widths before the shared animation", () => {
  const { breakdown } = tables();
  const bars = [
    ...breakdown.querySelectorAll<HTMLElement>(".motion-grow-x .motion-fill"),
  ];
  expect(bars.map((bar) => bar.style.width)).toEqual([
    "50%",
    "0%",
    "0%",
    "0%",
    "50%",
    "0%",
    "0%",
    "0%",
    "0%",
  ]);
});
