// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createHash, webcrypto } from "node:crypto";
import { DataProvider, demoDataset } from "./data/context";
import App from "./App";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
async function show(path: string) {
  window.history.replaceState(null, "", `${path}?publication=archive-1`);
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        id: "archive-1",
        createdAt: "2026-09-07",
        publishedBy: "fixture",
        previousId: null,
        summary: "Test archive",
        dataset: demoDataset,
        digest: createHash("sha256")
          .update(JSON.stringify(demoDataset))
          .digest("hex"),
      }),
    ),
  );
  render(
    <DataProvider>
      <App />
    </DataProvider>,
  );
  await waitFor(() =>
    expect(document.querySelector(".brand")?.getAttribute("href")).toBe(
      "/scorecard/?publication=archive-1",
    ),
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
