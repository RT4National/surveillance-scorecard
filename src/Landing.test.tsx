// @vitest-environment jsdom
// Home page landing pass: the finder is the page, one row of counts, the directory behind "Browse all".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { members, records, votes, dataset as meta } from "./data/demo";
import { scoreMember } from "./core/scoring";
import type { Dataset } from "./core/publication";
import type { Group, Member } from "./core/types";

const ca = members.find((m) => m.state === "California")!;
// Enough extra active members to cross the motion row limit (about 100).
const crowd: Member[] = Array.from({ length: 120 }, (_, i) => ({
  ...ca,
  id: `crowd-${i}`,
  name: `Crowd Member ${i}`,
  state: "Wyoming",
  district: i + 1,
}));
let dataset: Dataset;
const base: Dataset = {
  ...meta,
  members,
  votes,
  records,
  rubric: {
    version: "custom",
    minVotes: 5,
    minPerContext: 2,
    consistencyThreshold: 75,
  },
  sources: [],
  coverage: [],
};
vi.mock("./data/context", () => ({
  DataProvider: ({ children }: { children: unknown }) => children,
  useScorecard: () => ({
    state: "demo" as const,
    ...dataset,
    dataset,
    publication: undefined,
    publications: null,
    linkId: undefined,
    score: (m: Member, asOf = dataset.asOf) =>
      scoreMember(m, dataset.votes, dataset.records, dataset.rubric, asOf),
  }),
}));
const { default: App } = await import("./App");

const score = (m: Member) =>
  scoreMember(m, base.votes, base.records, base.rubric, base.asOf);
const active = members.filter((m) => m.status === "active");
const count = (g: Group) => active.filter((m) => score(m).group === g).length;
const table = () => document.querySelector(".member-table");
const browse = () => screen.getByRole("button", { name: /^Browse all/ });
const countRow = () =>
  screen.getByRole("navigation", { name: "Filter by record" });

let reduced = false;
beforeEach(() => {
  dataset = base;
  reduced = false;
  window.history.replaceState(null, "", "/scorecard/");
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduced && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("count row", () => {
  it("replaces the four group cards with one row of counts", () => {
    render(<App />);
    expect(document.querySelector(".group-cards")).toBeNull();
    expect(document.querySelector(".group-card")).toBeNull();
    const links = within(countRow()).getAllByRole("link");
    expect(links).toHaveLength(4);
    const n = count("reformer");
    expect(links[0].textContent).toBe(
      `${n} ${n === 1 ? "reformer" : "reformers"}`,
    );
    expect(links[1].textContent).toBe(`${count("mixed")} mixed`);
    expect(links[2].textContent).toBe(
      `${count("surveillance")} surveillance supporters`,
    );
    expect(links[3].textContent).toBe(
      `${count("unproven")} not enough evidence`,
    );
    // Icon plus visible text: each link has an icon shape next to its words.
    for (const l of links)
      expect(l.querySelector("[aria-hidden='true'].count-icon")).toBeTruthy();
  });
  it("filters by group and opens the directory", () => {
    render(<App />);
    const link = within(countRow()).getAllByRole("link")[0];
    expect(link.getAttribute("href")).toBe(
      "/scorecard/?group=reformer#browse=all",
    );
    fireEvent.click(link);
    expect(table()).toBeTruthy();
    expect(link.getAttribute("aria-current")).toBe("true");
    const names = [
      ...document.querySelectorAll(".member-table .member-name strong"),
    ].map((e) => e.textContent);
    expect(names).toHaveLength(count("reformer"));
    expect(window.location.search).toBe("?group=reformer");
    expect(window.location.hash).toBe("#browse=all");
  });
});

describe("home page copy", () => {
  it("has no roster-semantics paragraph", () => {
    render(<App />);
    fireEvent.click(browse());
    expect(screen.queryByText(/describe the roster/)).toBeNull();
    expect(
      screen.queryByText(/A score should start a conversation/),
    ).toBeNull();
  });
});

describe("directory", () => {
  it("stays collapsed until Browse all is used, and keeps that in the fragment", () => {
    render(<App />);
    expect(table()).toBeNull();
    expect(browse().textContent).toBe(`Browse all ${active.length}`);
    expect(browse().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(browse());
    expect(table()).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /^Browse all/ })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(window.location.hash).toBe("#browse=all");
    expect(window.location.search).toBe("");
  });
  it("opens from a shared fragment", () => {
    window.history.replaceState(null, "", "/scorecard/#browse=all");
    render(<App />);
    expect(table()).toBeTruthy();
  });
  it("keeps the former-member directory open", () => {
    window.history.replaceState(null, "", "/scorecard/former");
    render(<App />);
    expect(table()).toBeTruthy();
  });
  it("makes a chosen state's delegation the main content", () => {
    window.history.replaceState(null, "", "/scorecard/#state=California");
    render(<App />);
    expect(table()).toBeNull();
    const finder = screen.getByRole("region", { name: /find/i });
    expect(within(finder).getByText(ca.name)).toBeTruthy();
  });
});

describe("filter motion (plan item 3.4)", () => {
  const finderList = () => document.querySelector(".finder-results");
  it("restarts a short change class on the results when the filter changes", () => {
    render(<App />);
    fireEvent.click(browse());
    const results = () => document.querySelector(".directory-results")!;
    expect(results().className).not.toMatch(/motion-filter/);
    fireEvent.change(screen.getByLabelText("Current chamber"), {
      target: { value: "House" },
    });
    const first = results().className.match(/motion-filter-[ab]/)?.[0];
    expect(first).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Current chamber"), {
      target: { value: "Senate" },
    });
    const second = results().className.match(/motion-filter-[ab]/)?.[0];
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    act(() => {
      fireEvent.change(screen.getByLabelText("State"), {
        target: { value: "California" },
      });
    });
    expect(finderList()?.className).toMatch(/motion-filter-[ab]/);
  });
  it("does not animate under prefers-reduced-motion: reduce", () => {
    reduced = true;
    render(<App />);
    fireEvent.click(browse());
    fireEvent.change(screen.getByLabelText("Current chamber"), {
      target: { value: "House" },
    });
    expect(document.querySelector(".directory-results")!.className).not.toMatch(
      /motion-filter/,
    );
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "California" },
    });
    expect(finderList()?.className).not.toMatch(/motion-filter/);
  });
  it("skips animation above about 100 rows, with the same results", () => {
    dataset = { ...base, members: [...members, ...crowd] };
    render(<App />);
    fireEvent.click(browse());
    fireEvent.change(screen.getByLabelText("Current party"), {
      target: { value: "Democratic" },
    });
    const rows = document.querySelectorAll(".member-table .member-name").length;
    expect(rows).toBeGreaterThan(100);
    expect(document.querySelector(".directory-results")!.className).not.toMatch(
      /motion-filter/,
    );
  });
});
