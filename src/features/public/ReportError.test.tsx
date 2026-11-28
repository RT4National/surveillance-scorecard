// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { members, votes } from "../../data/demo";
import { scoreMember } from "../../core/scoring";
import { correctionCopy } from "../../core/copy";
import { Profile } from "./Profile";

// Lets a test swap in a live (non-demo) publication for the profile page.
let live = false;
vi.mock("../../data/context", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../data/context")>();
  return {
    ...mod,
    useScorecard: () => {
      const real = mod.useScorecard();
      if (!live) return real;
      const dataset = { ...real.dataset, demo: false };
      return {
        ...real,
        dataset,
        publication: {
          id: "pub-7",
          dataset,
          scoring: { version: "1", digest: "fixture", scores: {} },
        },
        score: (m: any, asOf = dataset.asOf) =>
          scoreMember(m, dataset.votes, dataset.records, dataset.rubric, asOf),
      };
    },
  };
});

afterEach(() => {
  cleanup();
  live = false;
  vi.unstubAllGlobals();
});

const text = (el: Element) => el.textContent!.replace(/\s+/g, " ").trim();
const member = members[3];
function openReport() {
  render(<Profile member={member} copy={vi.fn()} />);
  const row = document.querySelector(".profile-main .evidence-row")!;
  const voteId = row.getAttribute("data-vote-id")!;
  const button = [...row.querySelectorAll("button")].find(
    (b) => text(b) === correctionCopy.rowAction,
  )!;
  fireEvent.click(button);
  const form = document.querySelector<HTMLFormElement>(
    `form.public-correction[data-vote-id="${voteId}"]`,
  )!;
  return { voteId, button, form };
}

describe("per-row error report", () => {
  it("opens one form that names the member and the vote", () => {
    const { voteId, button, form } = openReport();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const vote = votes.find((v) => v.id === voteId)!;
    expect(text(form)).toContain(`${member.name} · ${vote.title}`);
    expect(text(form)).toContain(correctionCopy.next);
    expect(
      document.querySelectorAll(
        ".profile-main .evidence-row + form.public-correction",
      ),
    ).toHaveLength(1);
  });

  it("posts the member and vote ids together, then confirms neutrally", async () => {
    live = true;
    const fetch = vi.fn(async () => Response.json({ id: "c-1" }));
    vi.stubGlobal("fetch", fetch);
    const { voteId, form } = openReport();
    fireEvent.change(form.querySelector("textarea")!, {
      target: { value: "The clerk record shows a No vote." },
    });
    fireEvent.submit(form);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/scorecard/api/corrections");
    expect(JSON.parse(init.body as string)).toEqual({
      publicationId: "pub-7",
      memberId: member.id,
      voteId,
      message: "The clerk record shows a No vote.",
    });
    await waitFor(() =>
      expect(text(form.querySelector('[role="status"]')!)).toBe(
        correctionCopy.sent,
      ),
    );
  });

  it("is disabled with a reason on demo data", () => {
    const { form } = openReport();
    expect(form.querySelector("button")!.disabled).toBe(true);
    expect(text(form)).toContain(correctionCopy.closedDemo);
  });
});
