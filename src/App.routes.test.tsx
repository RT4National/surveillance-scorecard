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
import { appPaths } from "./core/routes";
import { fakeApi } from "./test/fake-api";
import type { Publication } from "./core/publication";
import { createPublicationScoring } from "./core/publication-scores";
import App from "./App";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const former = demoDataset.members.find((m) => m.status !== "active")!;
const current = demoDataset.members.find((m) => m.status === "active")!;
async function show(path: string) {
  window.history.replaceState(null, "", `${path}?publication=archive-1`);
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
      "/scorecard/?publication=archive-1",
    ),
  );
}
const listed = (name: string) =>
  [...document.querySelectorAll(".member-name strong")].some(
    (el) => el.textContent === name,
  );
describe("app routing", () => {
  it("lists inactive members at /scorecard/former and not current members", async () => {
    expect(former).toBeTruthy();
    await show("/scorecard/former");
    expect(
      screen.getByRole("heading", { level: 1, name: "Former members" }),
    ).toBeTruthy();
    expect(listed(former.name)).toBe(true);
    expect(listed(current.name)).toBe(false);
    expect(screen.queryByText("Page not found")).toBeNull();
  });
  it("keeps former members off the current directory but links to them", async () => {
    await show("/scorecard/");
    fireEvent.click(screen.getByRole("button", { name: /^Browse all/ }));
    expect(listed(current.name)).toBe(true);
    expect(listed(former.name)).toBe(false);
    const link = screen.getByRole("link", { name: /Former members/ });
    expect(link.getAttribute("href")).toBe(
      "/scorecard/former?publication=archive-1",
    );
  });
  it("keeps /scorecard/archive as the publications archive", async () => {
    await show("/scorecard/archive");
    expect(
      screen.getByRole("heading", { name: "Published archives" }),
    ).toBeTruthy();
  });
  it("says Page not found for an unknown path", async () => {
    await show("/scorecard/no-such-page");
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeTruthy();
    expect(screen.queryByText("Profile not found")).toBeNull();
    const section = screen.getByRole("heading", {
      name: "Page not found",
    }).parentElement!;
    expect(section.querySelectorAll("p")).toHaveLength(0);
    expect(
      screen
        .getByRole("link", { name: "Back to the directory" })
        .getAttribute("href"),
    ).toBe("/scorecard/?publication=archive-1");
  });
  it("shows a profile's frozen grade from its evidence slice and tags other dates as recalculated", async () => {
    const m = demoDataset.members.find(
      (m) =>
        m.status === "active" &&
        new Set(
          demoDataset.records
            .filter((r) => r.memberId === m.id)
            .map((r) =>
              demoDataset.votes
                .find((v) => v.id === r.voteId)!
                .date.slice(0, 4),
            ),
        ).size > 1,
    )!;
    await show(`/scorecard/members/${m.id}`);
    await waitFor(() =>
      expect(document.querySelector(".timeline")).toBeTruthy(),
    );
    expect(screen.getByText(/Frozen published grade/)).toBeTruthy();
    const buttons = [...document.querySelectorAll(".timeline button")];
    expect(buttons.length).toBeGreaterThan(1);
    expect(buttons.at(-1)!.textContent).not.toContain("Recalculated");
    for (const b of buttons.slice(0, -1))
      expect(b.textContent).toContain("Recalculated");
    fireEvent.click(buttons[0]);
    expect(
      screen.getByText(
        /Recalculated with rubric .* and the current scoring engine/,
      ),
    ).toBeTruthy();
    // Only the slim views were requested, never the full publication.
    const paths = vi
      .mocked(fetch)
      .mock.calls.map(
        (c) => new URL(String(c[0]), "https://x.example").pathname,
      );
    expect(paths).toContain(
      `/scorecard/api/publications/archive-1/members/${m.id}`,
    );
    expect(paths).not.toContain("/scorecard/api/publications/archive-1");
  });
  it("says Page not found for an unknown member", async () => {
    await show("/scorecard/members/no-such-member");
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeTruthy();
  });
  it.each(appPaths().filter((p) => p !== "/scorecard/editor"))(
    "renders shared route %s",
    async (path) => {
      await show(path);
      expect(screen.queryByText("Page not found")).toBeNull();
    },
  );
});
