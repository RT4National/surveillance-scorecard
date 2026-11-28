// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createHash, webcrypto } from "node:crypto";
import { DataProvider, demoDataset } from "./data/context";
import { fakeApi } from "./test/fake-api";
import type { Publication } from "./core/publication";
import { createPublicationScoring } from "./core/publication-scores";
import App from "./App";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function show(path: string, pinned = true) {
  window.history.replaceState(
    null,
    "",
    pinned ? `${path}?publication=archive-1` : path,
  );
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      fakeApi([
        {
          id: "archive-1",
          createdAt: "2026-09-07",
          publishedBy: "fixture",
          previousId: null,
          summary: "Test archive",
          dataset: demoDataset,
          digest: createHash("sha256")
            .update(JSON.stringify(demoDataset))
            .digest("hex"),
          scoring: await createPublicationScoring(demoDataset),
        } as Publication,
      ]),
    ),
  );
  render(
    <DataProvider>
      <App />
    </DataProvider>,
  );
  await waitFor(() =>
    expect(document.querySelector(".brand")?.getAttribute("href")).toBe(
      pinned ? "/scorecard/?publication=archive-1" : "/scorecard/",
    ),
  );
  if (!pinned)
    await waitFor(() =>
      expect(
        document.querySelector("main .finder, main .profile-heading"),
      ).toBeTruthy(),
    );
}
function expectPublicPins() {
  const anchors = [
    ...document.querySelectorAll<HTMLAnchorElement>('a[href^="/scorecard"]'),
  ];
  expect(anchors.length).toBeGreaterThan(5);
  for (const anchor of anchors) {
    const url = new URL(anchor.href);
    expect(
      url.searchParams.get("publication"),
      `${anchor.textContent} ${url.pathname}`,
    ).toBe(url.pathname === "/scorecard/editor" ? null : "archive-1");
  }
}
describe("archived public navigation", () => {
  it("pins brand, directory profiles, CTA and footer links while leaving staff current", async () => {
    await show("/scorecard/");
    fireEvent.click(screen.getByRole("button", { name: /^Browse all/ }));
    expectPublicPins();
    const sources = new URL(
      screen
        .getByRole("link", { name: "Sources & reuse" })
        .getAttribute("href")!,
      "https://example.org",
    );
    expect(sources.hash).toBe("#sources");
    expect(sources.searchParams.get("publication")).toBe("archive-1");
    expect(screen.getByText("Current chamber")).toBeTruthy();
    expect(screen.getByText("Current party")).toBeTruthy();
  });
  it("preserves the archive when returning from a member profile or opening vote evidence", async () => {
    await show(`/scorecard/members/${demoDataset.members[0].id}`);
    expectPublicPins();
    expect(
      screen
        .getByRole("link", { name: "All legislators" })
        .getAttribute("href"),
    ).toBe("/scorecard/?publication=archive-1");
  });
});
describe("latest publication navigation", () => {
  const anchors = () => [
    ...document.querySelectorAll<HTMLAnchorElement>('a[href^="/scorecard"]'),
  ];
  it("adds no publication to the address or to links on the home page", async () => {
    await show("/scorecard/", false);
    expect(window.location.search).toBe("");
    expect(anchors().length).toBeGreaterThan(5);
    for (const a of anchors())
      expect(
        new URL(a.href).searchParams.get("publication"),
        a.textContent ?? "",
      ).toBeNull();
  });
  it("keeps profile and vote links clean on a member page", async () => {
    await show(`/scorecard/members/${demoDataset.members[0].id}`, false);
    expect(window.location.search).toBe("");
    for (const a of anchors())
      expect(
        new URL(a.href).searchParams.get("publication"),
        a.textContent ?? "",
      ).toBeNull();
  });
});
