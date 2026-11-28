// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { createHash, webcrypto } from "node:crypto";
import { DataProvider, demoDataset } from "../../data/context";
import App from "../../App";
import { fakeApi } from "../../test/fake-api";
import type { PublicationSummary } from "../../core/publication";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const digest = createHash("sha256")
  .update(JSON.stringify(demoDataset))
  .digest("hex");
const publication = (id: string) => ({
  id,
  createdAt: "2026-09-07",
  publishedBy: "fixture",
  previousId: null,
  summary: "Test",
  dataset: demoDataset,
  digest,
});
const summaries = [
  { id: "p3", createdAt: "2026-09-07", summary: "", previousId: "p2" },
  { id: "p2", createdAt: "2026-08-01", summary: "", previousId: "p1" },
  { id: "p1", createdAt: "2026-07-01", summary: "", previousId: null },
];

/** `list` null makes the publication list request fail. */
async function show(pinned: string, list: unknown, currentId = "p3") {
  window.history.replaceState(null, "", `/scorecard/?publication=${pinned}`);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      fakeApi([publication(pinned)], {
        list: list as PublicationSummary[] | null,
        currentId,
      }),
    ),
  );
  render(
    <DataProvider>
      <App />
    </DataProvider>,
  );
  await waitFor(() =>
    expect(document.querySelector(".brand")?.getAttribute("href")).toContain(
      `publication=${pinned}`,
    ),
  );
}

describe("freshness line", () => {
  it("prints the date, a publication label and a methodology link", async () => {
    await show("p3", summaries);
    const line = await screen.findByText(/Publication 3/);
    expect(line.closest(".freshness")?.textContent).toContain(
      "Updated 7 Sep 2026",
    );
    const link = within(line.closest<HTMLElement>(".freshness")!).getByRole(
      "link",
      {
        name: "Methodology",
      },
    );
    expect(link.getAttribute("href")).toBe(
      "/scorecard/methodology?publication=p3",
    );
  });
  it("falls back to the date when the publication list fails to load", async () => {
    await show("p3", null);
    const line = await screen.findByText(/Updated 7 Sep 2026/);
    expect(line.textContent).not.toMatch(/Publication/);
    expect(
      within(line.closest<HTMLElement>(".freshness")!).getByRole("link", {
        name: "Methodology",
      }),
    ).toBeTruthy();
  });
});

describe("newer-publication notice", () => {
  it("shows for an older pinned publication and links to the latest", async () => {
    await show("p1", summaries);
    const link = await screen.findByRole("link", {
      name: "View current publication",
    });
    expect(link.getAttribute("href")).toBe("/scorecard/?publication=p3");
  });
  it("does not promote a newer archive over the rolled-back current publication", async () => {
    await show("p1", summaries, "p1");
    await screen.findByText(/Publication 1/);
    expect(
      screen.queryByRole("link", { name: "View current publication" }),
    ).toBeNull();
  });
  it("names the live publication and links to its comparison after rollback", async () => {
    await show("p3", summaries, "p1");
    const link = await screen.findByRole("link", { name: "See what changed" });
    expect(link.getAttribute("href")).toBe(
      "/scorecard/archive?publication=p1#publication-p3",
    );
    expect(screen.getByText(/Publication 1 is current/)).toBeTruthy();
  });
  it("shows nothing on the latest publication", async () => {
    await show("p3", summaries);
    await screen.findByText(/Publication 3/);
    expect(
      screen.queryByRole("link", { name: "View current publication" }),
    ).toBeNull();
  });
  it("shows nothing when the list failed to load", async () => {
    await show("p1", null);
    await screen.findByText(/Updated 7 Sep 2026/);
    expect(
      screen.queryByRole("link", { name: "View current publication" }),
    ).toBeNull();
  });
});
