// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { demoDataset } from "../../data/demo-dataset";
import { scoreMember } from "../../core/scoring";
import { matchRoute } from "../../core/routes";
import { Methodology } from "./Methodology";

it("explains the selected rubric and the scorer's absence rule", () => {
  const rubric = {
    ...demoDataset.rubric,
    minVotes: 4,
    minPerContext: 3,
    gradeBands: [
      { label: "High", minimum: 80 },
      { label: "Low", minimum: 0 },
    ],
  };
  const dataset = { ...demoDataset, rubric };
  const member = dataset.members[0];
  const vote = dataset.votes[0];
  const score = scoreMember(
    member,
    [vote],
    [
      {
        memberId: member.id,
        voteId: vote.id,
        outcome: "Not voting",
        partyAtVote: member.party,
      },
    ],
    rubric,
    dataset.asOf,
  );
  expect(score.counted).toBe(0);
  render(<Methodology dataset={dataset} />);
  expect(screen.getByText("High")).toBeTruthy();
  expect(screen.getByText("Low")).toBeTruthy();
  expect(screen.getByText(/at least 4 scored actions/)).toBeTruthy();
  expect(screen.getByText(/at least 3 scored actions in each/)).toBeTruthy();
  expect(
    screen.getByText(/Missed votes contribute no points or weight/),
  ).toBeTruthy();
  expect(document.getElementById("sources")).toBeTruthy();
  expect(matchRoute("/scorecard/methodology/lab")).toEqual({
    name: "methodologyLab",
  });
});
