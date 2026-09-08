// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { createHash, webcrypto } from "node:crypto";
import { DataProvider, demoDataset, useScorecard } from "./context";
import { createPublicationScoring } from "../core/publication-scores";
import type { Publication } from "../core/publication";

function Probe() {
  const data = useScorecard();
  return (
    <div>
      <span data-testid="state">{data.state}</span>
      <span>{data.error}</span>
      <span>{data.publication?.id}</span>
    </div>
  );
}
async function fixture(): Promise<Publication> {
  return {
    id: "pub-1",
    createdAt: "2026-09-07T12:00:00Z",
    publishedBy: "fixture",
    previousId: null,
    summary: "Fixture",
    dataset: demoDataset,
    digest: createHash("sha256")
      .update(JSON.stringify(demoDataset))
      .digest("hex"),
    scoring: await createPublicationScoring(demoDataset),
  };
}
beforeEach(() => {
  window.history.replaceState(null, "", "/scorecard/");
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function respond(response: Response) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  render(
    <DataProvider>
      <Probe />
    </DataProvider>,
  );
}
describe("Publication loading boundary", () => {
  it("verifies a frozen publication and pins navigation to its identity", async () => {
    respond(Response.json(await fixture()));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("published"),
    );
    expect(window.location.search).toBe("?publication=pub-1");
  });
  it("uses explicitly marked demo only when there is no latest publication", async () => {
    respond(new Response("", { status: 404 }));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("demo"),
    );
  });
  it("does not substitute demo evidence when a pinned archive is missing", async () => {
    window.history.replaceState(null, "", "/scorecard/?publication=missing");
    respond(new Response("", { status: 404 }));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("error"),
    );
  });
  it("rejects another publication returned for a pinned archive", async () => {
    window.history.replaceState(null, "", "/scorecard/?publication=other");
    respond(Response.json(await fixture()));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("error"),
    );
    expect(screen.getByText(/different publication/)).toBeTruthy();
  });
  it("rejects changed evidence and changed frozen scores", async () => {
    const p = await fixture();
    p.digest = "0".repeat(64);
    respond(Response.json(p));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("error"),
    );
    cleanup();
    const changed = await fixture();
    changed.scoring!.digest = "0".repeat(64);
    respond(Response.json(changed));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("error"),
    );
  });
  it("does not hide server outages with fixture records", async () => {
    respond(new Response("", { status: 503 }));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("error"),
    );
  });
});
