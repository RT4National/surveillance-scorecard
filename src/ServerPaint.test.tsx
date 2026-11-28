// @vitest-environment jsdom
// The Worker's first paint (worker/render.ts) stays on screen until the publication loads, then
// the app renders over it. No blank "Loading" state in between.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createHash, webcrypto } from "node:crypto";
import { DataProvider, demoDataset } from "./data/context";
import { renderHome, renderMember } from "../worker/render";
import App from "./App";

let resolve: (r: Response) => void = () => undefined;
const publication = {
  id: "pub-1",
  createdAt: "2026-09-07",
  publishedBy: "fixture",
  previousId: null,
  summary: "Fixture",
  dataset: demoDataset,
  digest: createHash("sha256")
    .update(JSON.stringify(demoDataset))
    .digest("hex"),
};
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.endsWith("/latest")
        ? new Promise<Response>((r) => (resolve = r))
        : Promise.resolve(Response.json({ publications: [] })),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
/** Mount the app the way main.tsx does: over a root the Worker already filled. */
function mount(path: string, html: string | undefined) {
  window.history.replaceState(null, "", path);
  render(
    <DataProvider>
      <App serverHtml={html} />
    </DataProvider>,
  );
}
const finish = async () => {
  await act(async () => resolve(Response.json(publication)));
  await waitFor(() =>
    expect(document.querySelector(".server-paint")).toBeNull(),
  );
};

describe("server first paint", () => {
  it("keeps the server's home content on screen while loading, with no loading state", async () => {
    mount("/scorecard/", renderHome({ dataset: demoDataset }));
    expect(screen.queryByText(/Loading the published scorecard/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Who votes for privacy?",
    );
    expect(document.querySelector(".preview-banner")?.textContent).toMatch(
      /DESIGN PREVIEW/,
    );
    expect(document.querySelector(".preview-banner")?.textContent).not.toMatch(
      /LOADING/,
    );
    await finish();
    expect(document.querySelector(".finder")).toBeTruthy();
    expect(document.querySelector(".count-row")).toBeTruthy();
  });
  it("keeps the same structure and classes when the app takes over", async () => {
    mount("/scorecard/", renderHome({ dataset: demoDataset }));
    const shape = () =>
      [...document.querySelectorAll("main *")]
        .filter((el) => el.closest(".finder-controls, .count-row, .hero-line"))
        .map((el) => `${el.tagName}.${el.className}`);
    const before = shape();
    await finish();
    expect(shape()).toEqual(before);
  });
  it("lets a state picked before loading finishes open that delegation", async () => {
    mount("/scorecard/", renderHome({ dataset: demoDataset }));
    fireEvent.change(document.querySelector("select[name=state]")!, {
      target: { value: "California" },
    });
    expect(window.location.hash).toBe("#state=California");
    expect(window.location.search).toBe("");
    await finish();
    expect(document.querySelectorAll(".finder-list li").length).toBeGreaterThan(
      0,
    );
  });
  it("keeps the server's member headline on screen while loading", async () => {
    const m = demoDataset.members[0];
    mount(
      `/scorecard/members/${m.id}`,
      renderMember({ dataset: demoDataset }, m),
    );
    expect(screen.queryByText(/Loading the published scorecard/)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(m.name);
    await finish();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(m.name);
    expect(document.querySelector(".evidence-lists")).toBeTruthy();
  });
  it("still shows the loading state on pages without server content", async () => {
    mount("/scorecard/methodology", undefined);
    expect(screen.getByText(/Loading the published scorecard/)).toBeTruthy();
    await act(async () => resolve(Response.json(publication)));
  });
});
