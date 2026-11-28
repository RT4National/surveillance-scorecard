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
