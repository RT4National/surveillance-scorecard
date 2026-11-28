// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { demoDataset } from "../../data/demo-dataset";
import type { Publication } from "../../core/publication";
import { fakeApi } from "../../test/fake-api";
import { ArchivesPage } from "./ArchivesPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const snapshot = (id: string): Publication => ({
  id,
  previousId: null,
  createdAt: "2026-11-27",
  dataset: demoDataset,
  digest: createHash("sha256")
    .update(JSON.stringify(demoDataset))
    .digest("hex"),
  summary: "Fixture",
  publishedBy: "fixture",
});

it("loads a linked archive directly, even beyond the recent archive list", async () => {
  const before = snapshot("older");
  const current = snapshot("current");
  const selected = demoDataset.members[2];
  history.replaceState(
    null,
    "",
    `/scorecard/archive?publication=current&m=${selected.id}#publication-older`,
  );
  vi.stubGlobal("crypto", webcrypto);
  const fetch = fakeApi([current, before], { list: [{ ...current }] });
  vi.stubGlobal("fetch", fetch);
  render(<ArchivesPage dataset={demoDataset} publication={current} />);
  const heading = await screen.findByRole("heading", {
    name: "Publication comparison",
  });
  expect(
    screen.getByRole("option", { name: selected.name, selected: true }),
  ).toBeTruthy();
  expect(screen.getByText("older → current")).toBeTruthy();
  expect(fetch.paths).toContain("/scorecard/api/publications/older");
  await waitFor(() => expect(document.activeElement).toBe(heading));
});
