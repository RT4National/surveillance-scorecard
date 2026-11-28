// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  buildMemberSlice,
  buildPublicationIndex,
} from "../../core/publication-index";
import { createPublicationScoring } from "../../core/publication-scores";
import type { Publication } from "../../core/publication";
import { demoDataset } from "../../data/demo-dataset";
import { usePublicationChange } from "./GradeChange";

function GradeChange(props: Parameters<typeof usePublicationChange>[0]) {
  const result = usePublicationChange(props);
  return result && <a href={result.href}>{result.label}</a>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("marks only a changed frozen grade and links to the archive comparison", async () => {
  const dataset = { ...demoDataset, demo: false, id: "test-records" };
  const member = dataset.members[0];
  const previous: Publication = {
    dataset,
    id: "before",
    digest: "a".repeat(64),
    createdAt: "2026-11-26",
    publishedBy: "fixture",
    summary: "First",
    previousId: null,
    scoring: await createPublicationScoring(dataset),
  };
  const index = buildPublicationIndex(previous);
  const fetchIndex = vi.fn(async () => Response.json(index));
  vi.stubGlobal("fetch", fetchIndex);

  const { rerender } = render(
    <GradeChange
      memberId={member.id}
      grade={index.scores![member.id].grade}
      publicationId="after"
      previousId="before"
    />,
  );
  await waitFor(() => expect(fetchIndex).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("link")).toBeNull();
  rerender(
    <GradeChange
      memberId={member.id}
      grade="Custom new grade"
      publicationId="after"
      previousId="before"
    />,
  );
  const link = await screen.findByRole("link", {
    name: "Changed since the last publication",
  });
  expect(link.getAttribute("href")).toBe(
    `/scorecard/archive?m=${member.id}&publication=after#publication-before`,
  );
});

it("links an evidence revision when the frozen grade is unchanged", async () => {
  const dataset = { ...demoDataset, demo: false, id: "test-records" };
  const member = dataset.members[0];
  const p: Publication = {
    dataset,
    id: "before",
    digest: "a".repeat(64),
    createdAt: "2026-11-26",
    publishedBy: "fixture",
    summary: "First",
    previousId: null,
    scoring: await createPublicationScoring(dataset),
  };
  const index = buildPublicationIndex(p);
  const slice = buildMemberSlice(p, member.id)!;
  const fetchPrevious = vi.fn(async (url: string) =>
    Response.json(url.endsWith("/index") ? index : slice),
  );
  vi.stubGlobal("fetch", fetchPrevious);
  const records = slice.records.map((record, index) =>
    index === 0 ? { ...record, outcome: "Not voting" as const } : record,
  );
  render(
    <GradeChange
      memberId={member.id}
      grade={slice.score!.grade}
      publicationId="after"
      previousId="before"
      records={records}
      votes={dataset.votes}
    />,
  );
  expect(
    await screen.findByRole("link", {
      name: "Evidence revised since the last publication",
    }),
  ).toBeTruthy();
  expect(fetchPrevious).toHaveBeenCalledTimes(2);
});
