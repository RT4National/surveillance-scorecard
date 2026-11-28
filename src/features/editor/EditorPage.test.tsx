// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { EditorPage } from "./EditorPage";
import { dataset, members, votes, records } from "../../data/demo";
import { rubric, scoreMember } from "../../core/scoring";
import { createHash, webcrypto } from "node:crypto";
import { createPublicationScoring } from "../../core/publication-scores";
const fixture = {
  ...dataset,
  members,
  votes,
  records,
  rubric,
  sources: [],
  coverage: ["Fictional fixture"],
};
let draft = {
  id: "draft-1",
  dataset: fixture,
  summary: "Review fixture",
  version: 1,
  status: "draft",
  author: "author@example.org",
  reviewer: null,
  base_publication_id: null as string | null,
};
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  draft = {
    ...draft,
    dataset: structuredClone(fixture),
    status: "draft",
    version: 1,
    author: "author@example.org",
    base_publication_id: null,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = new URL(input, "http://localhost").pathname;
      const payload = path.endsWith("/session")
        ? { email: "publisher@example.org", role: "publisher" }
        : path.endsWith("/drafts")
          ? [{ ...draft, dataset: undefined }]
          : path.endsWith("/drafts/draft-1")
            ? draft
            : path.endsWith("/status")
              ? { pointer: { revision: 1 } }
              : path.includes("/publications/")
                ? {
                    id: "pub-1",
                    dataset: fixture,
                    digest: createHash("sha256")
                      .update(JSON.stringify(fixture))
                      .digest("hex"),
                  }
                : [];
      return Response.json(payload);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const raw = () =>
  JSON.parse(
    (screen.getByLabelText("Raw scorecard data (JSON)") as HTMLTextAreaElement)
      .value,
  );
const openTab = (name: string) =>
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(name) }));
async function openDraft(label = /Review fixture/) {
  const option = await screen.findByRole("option", { name: label });
  fireEvent.change(screen.getByLabelText("Open a saved draft"), {
    target: { value: (option as HTMLOptionElement).value },
  });
  await screen.findByRole("button", { name: "Discard unsaved changes" });
}
const gradeRow = (name: string) => {
  const table = screen.getByRole("table", { name: "Grade changes" });
  return within(table)
    .getByRole("cell", { name })
    .closest("tr")!
    .querySelectorAll("td");
};
describe("Staff editing workflow", () => {
  it("compares drafts to verified frozen grades, not recalculated historical grades", async () => {
    const scoring = await createPublicationScoring(fixture);
    scoring.scores[members[0].id].grade = "D";
    scoring.scores[members[0].id].value = 47;
    scoring.digest = createHash("sha256")
      .update(JSON.stringify(scoring.scores))
      .digest("hex");
    const p = {
      id: "pub-1",
      dataset: fixture,
      digest: createHash("sha256")
        .update(JSON.stringify(fixture))
        .digest("hex"),
      scoring,
    };
    draft.base_publication_id = "pub-1";
    const original = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      const path = new URL(String(args[0]), "http://localhost").pathname;
      if (path.endsWith("/status"))
        return Response.json({
          pointer: { publication_id: "pub-1", revision: 1 },
        });
      if (path.endsWith("/publications/pub-1")) return Response.json(p);
      return original(...args);
    });
    render(<EditorPage dataset={fixture} />);
    await openDraft();
    openTab("Review & publish");
    await waitFor(() => {
      const cells = gradeRow(members[0].name);
      expect(cells[1].textContent).toBe("D");
      expect(cells[2].textContent).toBe("A+");
    });
    expect(screen.getByText(/grades? go(es)? up/).textContent).toMatch(/^1 /);
  });
  it("loads draft summaries first and fetches only the selected dataset", async () => {
    render(<EditorPage dataset={fixture} />);
    await screen.findByRole("option", { name: /Review fixture/ });
    const fetcher = vi.mocked(fetch);
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).endsWith("/drafts/draft-1"),
      ),
    ).toBe(false);
    await openDraft();
    await screen.findByRole("group", { name: "How much should it count?" });
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/drafts/draft-1"),
      ),
    ).toHaveLength(1);
  });
  it("updates structured evidence and grade impact and refuses review of unsaved edits", async () => {
    render(<EditorPage dataset={fixture} />);
    await openDraft();
    openTab("Review & publish");
    const review = screen.getByRole("button", {
      name: "Approve this draft",
    }) as HTMLButtonElement;
    expect(review.disabled).toBe(false);
    openTab("Votes to score");
    const privacy = screen.getByRole("group", {
      name: "Is a YES vote good for privacy?",
    });
    fireEvent.click(within(privacy).getByRole("button", { name: "No" }));
    const edited = raw();
    expect(edited.votes[0].reformVote).toBe("No");
    openTab("Review & publish");
    expect(
      (
        screen.getByRole("button", {
          name: "Approve this draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText("Save your changes first.")).toBeTruthy();
    const changed = fixture.members.find(
      (m) =>
        scoreMember(
          m,
          fixture.votes,
          fixture.records,
          fixture.rubric,
          fixture.asOf,
        ).grade !==
        scoreMember(m, edited.votes, edited.records, edited.rubric, edited.asOf)
          .grade,
    );
    expect(changed).toBeTruthy();
    expect(gradeRow(changed!.name)[2].textContent).toBe(
      scoreMember(
        changed!,
        edited.votes,
        edited.records,
        edited.rubric,
        edited.asOf,
      ).grade,
    );
    openTab("Votes to score");
    fireEvent.change(screen.getByLabelText("Why it matters"), {
      target: { value: "New reviewed rationale" },
    });
    expect(raw().votes[0].rationale).toBe("New reviewed rationale");
  });
  it("maps importance buttons to vote weights and preserves custom weights", async () => {
    render(<EditorPage dataset={fixture} />);
    await openDraft();
    const importance = () =>
      screen.getByRole("group", { name: "How much should it count?" });
    // The first demo vote has weight 2
    expect(
      within(importance())
        .getByRole("button", { name: "More" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(within(importance()).getByRole("button", { name: "Less" }));
    expect(raw().votes[0].weight).toBe(0.5);
    fireEvent.click(
      within(importance()).getByRole("button", { name: "Normal" }),
    );
    expect(raw().votes[0].weight).toBe(1);
    fireEvent.click(within(importance()).getByRole("button", { name: "More" }));
    expect(raw().votes[0].weight).toBe(2);
    const data = raw();
    data.votes[0].weight = 3;
    fireEvent.change(screen.getByLabelText("Raw scorecard data (JSON)"), {
      target: { value: JSON.stringify(data, null, 2) },
    });
    expect(within(importance()).getByText("Custom (3)")).toBeTruthy();
    expect(
      within(importance())
        .getAllByRole("button")
        .every((b) => b.getAttribute("aria-pressed") === "false"),
    ).toBe(true);
    fireEvent.change(screen.getByLabelText("Why it matters"), {
      target: { value: "Unrelated edit" },
    });
    expect(raw().votes[0].weight).toBe(3);
  });
  it("explains why a draft cannot be approved by its author", async () => {
    draft = { ...draft, author: "publisher@example.org" };
    render(<EditorPage dataset={fixture} />);
    await openDraft();
    openTab("Review & publish");
    const approve = screen.getByRole("button", {
      name: "Approve this draft",
    }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(
      screen.getByText(
        "Someone other than the author must approve this draft.",
      ),
    ).toBeTruthy();
    expect(
      screen
        .getByText("Waiting for review")
        .closest("li")
        ?.getAttribute("aria-current"),
    ).toBe("step");
  });
  it("clones an immutable publication into an editable correction draft", async () => {
    render(<EditorPage dataset={fixture} />);
    await screen.findByText(/publisher@example.org/);
    openTab("History");
    fireEvent.change(
      screen.getByLabelText("ID of the published version to correct"),
      { target: { value: "pub-1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Start a correction draft" }),
    );
    await screen.findByText(
      "The published version was copied into a new, unsaved correction draft.",
    );
    expect(
      (screen.getByLabelText("Describe your changes") as HTMLInputElement)
        .value,
    ).toBe("Correction to published version pub-1");
    const edited = raw();
    expect(edited.id).not.toBe(fixture.id);
    expect(edited.votes).toEqual(fixture.votes);
    openTab("Votes to score");
    fireEvent.click(screen.getByRole("button", { name: "Add a vote" }));
    expect(raw().votes).toHaveLength(votes.length + 1);
    expect(fixture.votes).toHaveLength(votes.length);
  });
  it("blocks publishing after editing an approved rubric", async () => {
    draft = { ...draft, status: "review" };
    render(<EditorPage dataset={fixture} />);
    await openDraft(/Review fixture/);
    openTab("Review & publish");
    expect(
      (screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    openTab("Grading rules");
    fireEvent.change(
      screen.getByLabelText("Votes needed before we give a grade"),
      { target: { value: "10" } },
    );
    await waitFor(() => expect(raw().rubric.minVotes).toBe(10));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Increase: Votes needed before we give a grade",
      }),
    );
    expect(raw().rubric.minVotes).toBe(11);
    openTab("Review & publish");
    expect(
      (screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
  it("keeps grade cutoffs in order and never asks for JSON outside developer tools", async () => {
    render(<EditorPage dataset={fixture} />);
    await openDraft();
    openTab("Grading rules");
    fireEvent.change(screen.getByLabelText("Lowest score for a B"), {
      target: { value: "99" },
    });
    const bands = raw().rubric.gradeBands;
    expect(bands[2]).toEqual({ label: "B", minimum: 89 });
    expect(bands.map((b: { minimum: number }) => b.minimum)).toEqual([
      97, 90, 89, 65, 50, 0,
    ]);
    const workspace = screen.getByRole("tabpanel");
    expect(within(workspace).queryByText(/JSON/)).toBeNull();
  });
});
