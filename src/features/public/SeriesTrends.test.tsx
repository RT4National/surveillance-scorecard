// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { SeriesTrend } from "../../core/seriesTrends";
import { SeriesTrends } from "./SeriesTrends";

it("prints the vote share, denominator and exclusions, then splits by party", () => {
  const none = { forReform: 0, cast: 0, didNotVote: 0 };
  const series: SeriesTrend[] = [
    {
      id: "test",
      name: "Warrants",
      chamber: "House",
      rationale: "Same requirement",
      points: [
        {
          voteId: "test-vote",
          title: "Warrant requirement",
          bill: "H.R. 2",
          date: "2025-01-10",
          presidentParty: "Democratic",
          total: { forReform: 2, cast: 4, didNotVote: 1 },
          byParty: {
            Democratic: { forReform: 2, cast: 2, didNotVote: 1 },
            Republican: { forReform: 0, cast: 2, didNotVote: 0 },
            Independent: none,
          },
          notInOffice: 3,
        },
      ],
    },
  ];
  render(<SeriesTrends series={series} publicationId="archived" />);
  expect(
    screen
      .getByRole("link", { name: /2025.*Warrant requirement/ })
      .getAttribute("href"),
  ).toBe("/scorecard/legislation/test-vote?publication=archived");
  expect(screen.getByText("Democratic White House")).toBeTruthy();
  expect(screen.getByText("50% for reform · 2 of 4 ballots")).toBeTruthy();
  expect(screen.getByText("1 did not vote · 3 not in office")).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Split by party" }));
  expect(screen.getByText(/100% for reform · 2 of 2 ballots/)).toBeTruthy();
  expect(screen.getByText(/^0% for reform · 0 of 2 ballots/)).toBeTruthy();
  expect(screen.queryByText("Independent ·")).toBeNull();
});
