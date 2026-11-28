// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createPublicationScoring } from "../../core/publication-scores";
import type { Publication } from "../../core/publication";
import { demoDataset } from "../../data/demo-dataset";
import { SharePanel, shareCardSvg } from "./SharePanel";

afterEach(cleanup);

it("pins copied links and citations to the frozen publication", async () => {
  const dataset = { ...demoDataset, id: "test-real", demo: false };
  const member = dataset.members[0];
  const publication: Publication = {
    dataset,
    id: "p2",
    createdAt: "2026-11-27T00:00:00Z",
    publishedBy: "fixture",
    previousId: "p1",
    summary: "Fixture",
    digest: "fixture",
    scoring: await createPublicationScoring(dataset),
  };
  const copy = vi.fn();
  const publications = [
    { ...publication },
    { id: "p1", previousId: null, createdAt: "2026-11-26", summary: "First" },
  ];
  const { rerender } = render(
    <SharePanel {...{ member, publication, publications, copy }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy citation" }));
  expect(copy.mock.calls[0][0]).toMatch(
    /Publication 2.*\/scorecard\/members\/.*\?publication=p2/,
  );
  expect(
    screen.queryByRole("link", { name: "Contact this office" }),
  ).toBeNull();

  const contact = "https://example.house.gov/contact";
  rerender(
    <SharePanel
      {...{ publication, publications, copy }}
      member={{ ...member, contactUrl: contact }}
    />,
  );
  expect(
    screen
      .getByRole("link", { name: "Contact this office" })
      .getAttribute("href"),
  ).toBe(contact);

  rerender(
    <SharePanel
      {...{ member, publications, copy }}
      publication={{ ...publication, dataset: demoDataset }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Copy citation" })).toBeNull();
});

it("escapes profile text in the downloadable card", () => {
  const svg = shareCardSvg("A < B & C", "A+", "Publication 2");
  expect(svg).toContain("A &lt; B &amp; C");
  expect(svg).toContain("A+");
  expect(svg).toContain("Publication 2");
});
