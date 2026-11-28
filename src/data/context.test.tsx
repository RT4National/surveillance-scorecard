// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createHash, webcrypto } from "node:crypto";
import {
  DataProvider,
  demoDataset,
  makeScorer,
  slimView,
  useScorecard,
} from "./context";
import {
  createPublicationScoring,
  publishedScore,
} from "../core/publication-scores";
import {
  buildMemberSlice,
  buildPublicationIndex,
} from "../core/publication-index";
import { scoreMember } from "../core/scoring";
import { scoredLabel } from "../core/copy";
import { fictional } from "../features/public/helpers";
import type { Dataset, Publication } from "../core/publication";
import { fakeApi } from "../test/fake-api";

function Probe() {
  const data = useScorecard();
  const first = data.members[0];
  return (
    <div>
      <span data-testid="state">{data.state}</span>
      <span data-testid="level">{data.level ?? ""}</span>
      <span>{data.error}</span>
      <span>{data.publication?.id}</span>
      <span data-testid="link-id">{data.linkId ?? ""}</span>
      <span data-testid="grade">
        {data.state === "published" && first ? data.score(first).grade : ""}
      </span>
    </div>
  );
}
async function fixture(
  dataset: Dataset = demoDataset,
  id = "pub-1",
): Promise<Publication> {
  return {
    id,
    createdAt: "2026-09-07T12:00:00Z",
    publishedBy: "fixture",
    previousId: null,
    summary: "Fixture",
    dataset,
    digest: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
    scoring: await createPublicationScoring(dataset),
  };
}
beforeEach(() => {
  window.history.replaceState(null, "", "/scorecard/");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.getElementById("root")?.remove();
});
function mount() {
  render(
    <DataProvider>
      <Probe />
    </DataProvider>,
  );
}
/** Every request answered by a fresh copy of the same response. */
function respond(make: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => make()),
  );
  mount();
}
function serve(publications: Publication[]) {
  const api = fakeApi(publications);
  vi.stubGlobal("fetch", vi.fn(api));
  mount();
  return api;
}
/** The root element the Worker names the page's publication on (worker/index.ts, shell). */
function pageRoot(id: string, digest: string) {
  const root = document.createElement("div");
  root.id = "root";
  root.dataset.publication = id;
  root.dataset.digest = digest;
  document.body.appendChild(root);
}
const published = () =>
  waitFor(() =>
    expect(screen.getByTestId("state").textContent).toBe("published"),
  );
const failed = () =>
  waitFor(() => expect(screen.getByTestId("state").textContent).toBe("error"));

describe("Publication loading boundary", () => {
  it("verifies the latest publication and leaves the URL clean", async () => {
    window.history.replaceState(null, "", "/scorecard/#state=Ohio");
    serve([await fixture()]);
    await published();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#state=Ohio");
    expect(screen.getByTestId("link-id").textContent).toBe("");
  });
  it("keeps a pinned older publication in the URL and in links", async () => {
    window.history.replaceState(null, "", "/scorecard/?publication=pub-1");
    serve([await fixture()]);
    await published();
    expect(window.location.search).toBe("?publication=pub-1");
    expect(screen.getByTestId("link-id").textContent).toBe("pub-1");
  });
  it("uses explicitly marked demo only when there is no latest publication", async () => {
    respond(() => new Response("", { status: 404 }));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("demo"),
    );
  });
  it("does not substitute demo evidence when a pinned archive is missing", async () => {
    window.history.replaceState(null, "", "/scorecard/?publication=missing");
    respond(() => new Response("", { status: 404 }));
    await failed();
  });
  it("rejects another publication returned for a pinned archive", async () => {
    window.history.replaceState(null, "", "/scorecard/?publication=other");
    const p = await fixture();
    respond(() => Response.json(buildPublicationIndex(p)));
    await failed();
    expect(screen.getByText(/different publication/)).toBeTruthy();
    cleanup();
    window.history.replaceState(
      null,
      "",
      "/scorecard/archive?publication=other",
    );
    respond(() => Response.json(p));
    await failed();
    expect(screen.getByText(/different publication/)).toBeTruthy();
  });
  it("rejects changed evidence and changed frozen scores in the full publication", async () => {
    // Archive, reports and research load the full publication and verify it in the browser.
    window.history.replaceState(null, "", "/scorecard/archive");
    const p = await fixture();
    p.digest = "0".repeat(64);
    respond(() => Response.json(p));
    await failed();
    cleanup();
    const changed = await fixture();
    changed.scoring!.digest = "0".repeat(64);
    respond(() => Response.json(changed));
    await failed();
  });
  it("does not hide server outages with fixture records", async () => {
    respond(() => new Response("", { status: 503 }));
    await failed();
  });
});

describe("slim views", () => {
  it("loads the landing from the index, never the full publication", async () => {
    const p = await fixture();
    const api = serve([p]);
    await published();
    expect(screen.getByTestId("level").textContent).toBe("index");
    expect(api.paths).toContain("/scorecard/api/publications/latest/index");
    expect(api.paths).not.toContain("/scorecard/api/publications/latest");
    expect(api.paths).not.toContain("/scorecard/api/publications/pub-1");
    // Frozen headline score, as published.
    expect(screen.getByTestId("grade").textContent).toBe(
      publishedScore(p, demoDataset.members[0]).grade,
    );
  });
  it("asks for the page's own publication by ID and checks its digest", async () => {
    const p = await fixture();
    pageRoot(p.id, p.digest);
    const api = serve([p]);
    await published();
    expect(api.paths[0]).toBe("/scorecard/api/publications/pub-1/index");
  });
  it("detects an index whose digest does not match the page's publication", async () => {
    const p = await fixture();
    pageRoot(p.id, "a".repeat(64));
    serve([p]);
    await failed();
    expect(screen.getByText(/does not match this page/)).toBeTruthy();
  });
  it("detects a full publication that does not match the page's publication", async () => {
    window.history.replaceState(null, "", "/scorecard/research");
    const p = await fixture();
    pageRoot(p.id, "a".repeat(64));
    serve([p]);
    await failed();
    expect(screen.getByText(/does not match this page/)).toBeTruthy();
  });
  it("loads a profile's evidence lazily: the index and one member, not the full publication", async () => {
    const p = await fixture();
    const m = demoDataset.members.find((m) => m.status === "active")!;
    window.history.replaceState(null, "", `/scorecard/members/${m.id}`);
    pageRoot(p.id, p.digest);
    const api = serve([p]);
    await published();
    expect(screen.getByTestId("level").textContent).toBe("member");
    expect(api.paths.sort()).toEqual(
      [
        "/scorecard/api/publications",
        "/scorecard/api/publications/pub-1/index",
        `/scorecard/api/publications/pub-1/members/${m.id}`,
      ].sort(),
    );
  });
  it("detects a member slice from another publication", async () => {
    const p = await fixture();
    const other = await fixture({ ...demoDataset, id: "other" }, "pub-2");
    const m = demoDataset.members[0];
    window.history.replaceState(null, "", `/scorecard/members/${m.id}`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/members/")
          ? Response.json(buildMemberSlice(other, m.id))
          : Response.json(buildPublicationIndex(p)),
      ),
    );
    mount();
    await failed();
    expect(screen.getByText(/does not match this page/)).toBeTruthy();
  });
  it("loads the full publication for routes that recalculate", async () => {
    window.history.replaceState(null, "", "/scorecard/former");
    const api = serve([await fixture()]);
    await published();
    expect(screen.getByTestId("level").textContent).toBe("full");
    expect(api.paths).toContain("/scorecard/api/publications/latest");
  });
  it("keeps placeholder labelling on slim views of real records", async () => {
    const source = {
      url: "https://clerk.house.gov/",
      retrievedAt: "2026-09-01T00:00:00Z",
      sha256: "0".repeat(64),
      kind: "votes" as const,
    };
    const placeholder = await fixture({ ...demoDataset, sources: [source] });
    const { dataset } = slimView(buildPublicationIndex(placeholder));
    expect(dataset.sources).toEqual([]);
    expect(fictional(dataset)).toBe(false);
    expect(
      fictional(slimView(buildPublicationIndex(await fixture())).dataset),
    ).toBe(true);
  });
});

describe("scores on slim views", () => {
  it("uses frozen scores at the publication date and recalculates the loaded member for other dates", async () => {
    const p = await fixture();
    const index = buildPublicationIndex(p);
    const [m, other] = demoDataset.members.filter((m) => m.status === "active");
    const slice = buildMemberSlice(p, m.id)!;
    const score = makeScorer({
      ...slimView(index, slice),
      level: "member",
      index,
      slice,
    });
    // At the cutoff: the frozen published score, evidence included for the loaded member.
    expect(score(m)).toEqual(publishedScore(p, m));
    // Everyone else: the frozen headline from the index, with counts for the label.
    const { evidence, ...headline } = publishedScore(p, other);
    expect(score(other)).toMatchObject(headline);
    expect(scoredLabel(score(other), demoDataset.votes)).toBe(
      scoredLabel({ evidence }, demoDataset.votes),
    );
    expect(() => score(other).evidence).toThrow(/not loaded/);
    // Another date recalculates from the member's own records with the current engine.
    const date = "2024-12-31";
    expect(score(m, date)).toEqual(
      scoreMember(
        m,
        demoDataset.votes,
        demoDataset.records,
        demoDataset.rubric,
        date,
      ),
    );
    expect(() => score(other, date)).toThrow(/full publication/);
  });
  it("memoizes scores per member and date", async () => {
    const p = await fixture();
    const score = makeScorer({
      dataset: p.dataset,
      publication: p,
      level: "full",
    });
    const m = demoDataset.members[0];
    expect(score(m)).toBe(score(m));
    expect(score(m, "2024-12-31")).not.toBe(score(m));
  });
});
