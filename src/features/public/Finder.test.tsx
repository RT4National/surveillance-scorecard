// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { members, records, votes, dataset as meta } from "../../data/demo";
import { scoreMember } from "../../core/scoring";
import type { Dataset } from "../../core/publication";
import type { Member } from "../../core/types";

const ca = members.find((m) => m.state === "California")!;
const tx = members.find((m) => m.state === "Texas")!;
const extra = (id: string, name: string, over: Partial<Member>): Member => ({
  ...ca,
  id,
  name,
  ...over,
});
const fixtureMembers: Member[] = [
  ...members,
  extra("ca-h3", "Zed House Three", { district: 3 }),
  extra("ca-s1", "Yan Senator One", { chamber: "Senate", district: undefined }),
  extra("ca-s2", "Xia Senator Two", { chamber: "Senate", district: undefined }),
  extra("ca-former", "Old Former", { status: "inactive", district: 40 }),
];
const dataset: Dataset = {
  ...meta,
  members: fixtureMembers,
  votes,
  records,
  rubric: { version: "custom", minVotes: 5, minPerContext: 2, consistencyThreshold: 75 },
  sources: [],
  coverage: [],
};
vi.mock("../../data/context", () => ({
  DataProvider: ({ children }: { children: unknown }) => children,
  useScorecard: () => ({
    state: "demo" as const,
    ...dataset,
    dataset,
    publication: undefined,
    publications: null,
    score: (m: Member, asOf = dataset.asOf) =>
      scoreMember(m, dataset.votes, dataset.records, dataset.rubric, asOf),
  }),
}));
const { default: App } = await import("../../App");

afterEach(cleanup);
beforeEach(() => window.history.replaceState(null, "", "/scorecard/"));

const finder = () => screen.getByRole("region", { name: /find/i });
const delegation = () =>
  within(finder())
    .queryAllByRole("listitem")
    .map((li) => li.textContent ?? "");
const directoryNames = () =>
  [...document.querySelectorAll(".member-table .member-name strong")].map(
    (e) => e.textContent,
  );
const pick = (state: string) =>
  fireEvent.change(within(finder()).getByLabelText("State"), {
    target: { value: state },
  });

describe("finder on the home page", () => {
  it("lists senators first, then House members by district, each with a grade", () => {
    render(<App />);
    pick("California");
    const rows = delegation();
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("Xia Senator Two");
    expect(rows[1]).toContain("Yan Senator One");
    expect(rows[2]).toContain("Zed House Three");
    expect(rows[3]).toContain(ca.name);
    expect(rows.join()).not.toContain("Old Former");
    expect(finder().querySelectorAll("li .grade")).toHaveLength(4);
    const own = within(finder()).getByText(ca.name).closest("li")!;
    expect(own.querySelector(".grade")?.getAttribute("aria-label")).toMatch(/^Grade /);
  });
  it("keeps the state in the fragment and never in location.search", () => {
    render(<App />);
    pick("California");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#state=California");
  });
  it("filters the directory to the chosen state", () => {
    render(<App />);
    pick("California");
    expect(directoryNames()).toContain(ca.name);
    expect(directoryNames()).not.toContain(tx.name);
  });
  it("opens a delegation from a fragment link", () => {
    window.history.replaceState(null, "", "/scorecard/#state=California");
    render(<App />);
    expect(delegation()).toHaveLength(4);
  });
  it("honours an old ?state= link, then moves it to the fragment", () => {
    window.history.replaceState(null, "", "/scorecard/?state=California&sort=name");
    render(<App />);
    expect(delegation()).toHaveLength(4);
    expect(directoryNames()).not.toContain(tx.name);
    expect(window.location.search).toBe("?sort=name");
    expect(window.location.hash).toBe("#state=California");
  });
  it("ignores a state that is not in the data", () => {
    window.history.replaceState(null, "", "/scorecard/#state=Atlantis");
    render(<App />);
    expect(delegation()).toHaveLength(0);
  });
  it("says it asks for no address and links to house.gov", () => {
    render(<App />);
    expect(within(finder()).getByText("We don't ask for your address.")).toBeTruthy();
    const link = within(finder()).getByRole("link", { name: /house\.gov/i });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/www\.house\.gov\//);
  });
  it("has one search box on the home page", () => {
    render(<App />);
    expect(screen.getAllByRole("searchbox")).toHaveLength(1);
    expect(document.querySelector(".search-box")).toBeNull();
  });
  it("filters the finder and the directory from one name search, in the fragment", () => {
    render(<App />);
    fireEvent.change(within(finder()).getByLabelText("Name"), {
      target: { value: "senator one" },
    });
    expect(delegation()).toHaveLength(1);
    expect(delegation()[0]).toContain("Yan Senator One");
    expect(directoryNames()).toEqual(["Yan Senator One"]);
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#q=senator+one");
  });
  it("filters a chosen delegation by name", () => {
    render(<App />);
    pick("California");
    fireEvent.change(within(finder()).getByLabelText("Name"), {
      target: { value: "house three" },
    });
    expect(delegation()).toHaveLength(1);
    expect(delegation()[0]).toContain("Zed House Three");
    expect(window.location.hash).toBe("#state=California&q=house+three");
    expect(window.location.search).toBe("");
  });
  it("moves an old ?q= link to the fragment and still filters", () => {
    window.history.replaceState(null, "", "/scorecard/?q=senator%20one&sort=name");
    render(<App />);
    expect(directoryNames()).toEqual(["Yan Senator One"]);
    expect(window.location.search).toBe("?sort=name");
    expect(window.location.hash).toBe("#q=senator+one");
  });
  it("shows a one-line hero above the finder", () => {
    render(<App />);
    expect(document.querySelectorAll(".hero p")).toHaveLength(0);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(
      h1.compareDocumentPosition(finder()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("/scorecard/find", () => {
  it("reuses the finder under an h1", () => {
    window.history.replaceState(null, "", "/scorecard/find#state=California");
    render(<App />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(delegation()).toHaveLength(4);
    expect(screen.queryByText("THE SURVEILLANCE SCORECARD")).toBeNull();
  });
});
