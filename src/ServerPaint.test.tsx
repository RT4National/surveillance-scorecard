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
import { fakeApi } from "./test/fake-api";
import { createPublicationScoring } from "./core/publication-scores";
import type { Publication } from "./core/publication";
import { scoreMember } from "./core/scoring";
import { splitDisplay } from "./features/public/split";

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
  scoring: await createPublicationScoring(demoDataset),
} as Publication;
let api = fakeApi([publication]);
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  // Publication requests wait until `finish`; the list answers at once.
  api = fakeApi([publication], {
    hold: (path) => path !== "/scorecard/api/publications",
  });
  vi.stubGlobal("fetch", vi.fn(api));
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
  await act(async () => api.release());
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
        .filter((el) =>
          el.closest(".finder-controls, .state-grid, .count-row, .hero-line"),
        )
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
  it("keeps the profile heading and sidebar structure, and does not regrow the split bars", async () => {
    // Every observed element counts as in view, so the grow-once motion would fire.
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.cb([{ isIntersecting: true }]);
        }
        disconnect() {}
      },
    );
    const m = demoDataset.members.find(
      (x) =>
        splitDisplay(
          scoreMember(
            x,
            demoDataset.votes,
            demoDataset.records,
            demoDataset.rubric,
            demoDataset.asOf,
          ),
          x.party,
        ).kind === "comparable",
    )!;
    expect(m).toBeTruthy();
    mount(
      `/scorecard/members/${m.id}`,
      renderMember({ dataset: demoDataset }, m),
    );
    const shape = () =>
      [...document.querySelectorAll("main *")]
        .filter((el) => el.closest(".profile-heading, .profile-sidebar"))
        .map((el) => `${el.tagName}.${el.getAttribute("class") ?? ""}`);
    const before = shape();
    await finish();
    expect(shape()).toEqual(before);
    expect(document.querySelector(".split-bars")?.className).not.toMatch(
      /motion-grow-x/,
    );
  });
  it("shows the fragment's state block in the server copy and follows a new pick", () => {
    window.history.replaceState(null, "", "/scorecard/#state=California");
    render(
      <DataProvider>
        <App serverHtml={renderHome({ dataset: demoDataset })} />
      </DataProvider>,
    );
    const chosen = () =>
      [...document.querySelectorAll(".state-target.server-chosen")].map(
        (e) => e.id,
      );
    expect(chosen()).toEqual(["state=California"]);
    fireEvent.change(document.querySelector("select[name=state]")!, {
      target: { value: "New York" },
    });
    expect(chosen()).toEqual(["state=New+York"]);
  });
  it("still shows the loading state on pages without server content", async () => {
    mount("/scorecard/methodology", undefined);
    expect(screen.getByText(/Loading the published scorecard/)).toBeTruthy();
    await act(async () => api.release());
  });
});

describe("remembered state privacy", () => {
  it("never puts a state in location.search or in any fetch URL", async () => {
    localStorage.setItem("scorecard.state", "California");
    mount("/scorecard/", renderHome({ dataset: demoDataset }));
    await finish();
    fireEvent.change(document.querySelector("select[name=state]")!, {
      target: { value: "New York" },
    });
    expect(localStorage.getItem("scorecard.state")).toBe("New York");
    expect(window.location.search).toBe("");
    const urls = vi.mocked(fetch).mock.calls.map((c) => String(c[0]));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).not.toMatch(/state|California|New.York/i);
    localStorage.clear();
  });
});
