// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  congressAlignment,
  congressAlignmentCsv,
} from "../../core/congressTrends";
import type { Publication } from "../../core/publication";
import { createPublicationScoring } from "../../core/publication-scores";
import { demoDataset } from "../../data/demo-dataset";
import { CongressTrends } from "./CongressTrends";

it("renders chart shares and exports exactly the chart's Congress rows", async () => {
  const member = demoDataset.members[0];
  const votes = Array.from({ length: 5 }, (_, i) => ({
    ...demoDataset.votes[0],
    id: `roll-${i}`,
    date: "2025-04-02",
    presidentParty: "Republican" as const,
  }));
  const dataset: Publication["dataset"] = {
    ...demoDataset,
    id: "reviewed",
    demo: false,
    members: [member],
    votes,
    records: votes.map((vote) => ({
      memberId: member.id,
      voteId: vote.id,
      outcome: vote.reformVote,
      partyAtVote: "Republican",
    })),
  };
  const p: Publication = {
    dataset,
    scoring: await createPublicationScoring(dataset),
    id: "archive",
    previousId: null,
    createdAt: "2026-11-27",
    digest: "fixture",
    publishedBy: "fixture",
    summary: "Fixture",
  };
  const download = vi.fn();
  const { rerender } = render(
    <CongressTrends publication={p} download={download} />,
  );
  expect(screen.getByRole("heading", { name: "119th Congress" })).toBeTruthy();
  expect(screen.getByText(/White House at recorded actions · 5 scored items/)).toBeTruthy();
  expect(screen.getAllByText(/100% aligned · 5 of 5/)).toHaveLength(2);
  fireEvent.click(
    screen.getByRole("button", { name: "Download Congress alignment CSV" }),
  );
  expect(download).toHaveBeenCalledWith(
    "congress-alignment-archive.csv",
    congressAlignmentCsv(congressAlignment(p), p.id),
    "text/csv;charset=utf-8",
  );
  rerender(
    <CongressTrends
      publication={{ ...p, dataset: { ...dataset, demo: true } }}
      download={download}
    />,
  );
  expect(
    screen.queryByRole("heading", { name: "Reform alignment by Congress" }),
  ).toBeNull();
});
