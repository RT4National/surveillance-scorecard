// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review fixture · draft · v1",
      }),
    );
    const heading = await screen.findByRole("heading", {
      name: "Grade impact preview",
    });
    await waitFor(() => {
      const cells = heading.nextElementSibling?.nextElementSibling
        ?.querySelector("tbody tr")
        ?.querySelectorAll("td");
      expect(cells?.[1].textContent).toBe("D");
      expect(cells?.[2].textContent).toBe("A+");
    });
  });
  it("loads draft summaries first and fetches only the selected dataset", async () => {
    render(<EditorPage dataset={fixture} />);
    const open = await screen.findByRole("button", {
      name: "Review fixture · draft · v1",
    });
    const fetcher = vi.mocked(fetch);
    expect(
      fetcher.mock.calls.some(([url]) =>
        String(url).endsWith("/drafts/draft-1"),
      ),
    ).toBe(false);
    fireEvent.click(open);
    await screen.findByLabelText("Scoring weight");
    expect(
      fetcher.mock.calls.filter(([url]) =>
        String(url).endsWith("/drafts/draft-1"),
      ),
    ).toHaveLength(1);
  });
  it("updates structured evidence and grade impact and refuses review of unsaved edits", async () => {
    render(<EditorPage dataset={fixture} />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review fixture · draft · v1",
      }),
    );
    const review = (await screen.findByRole("button", {
      name: "Approve reviewed draft",
    })) as HTMLButtonElement;
    expect(review.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Scoring weight"), {
      target: { value: "100" },
    });
    expect(review.disabled).toBe(true);
    const advanced = screen.getByLabelText(
      "Dataset and scoring policy",
    ) as HTMLTextAreaElement;
    const edited = JSON.parse(advanced.value);
    expect(edited.votes[0].weight).toBe(100);
    const heading = screen.getByRole("heading", {
      name: "Grade impact preview",
    });
    const table = heading.nextElementSibling?.nextElementSibling;
    const changed = fixture.members.findIndex(
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
    expect(changed).toBeGreaterThanOrEqual(0);
    const row = table?.querySelectorAll("tbody tr")[changed];
    expect(row?.querySelectorAll("td")[2].textContent).toBe(
      scoreMember(
        fixture.members[changed],
        edited.votes,
        edited.records,
        edited.rubric,
        edited.asOf,
      ).grade,
    );
    fireEvent.change(
      screen.getByLabelText("Why this position advances surveillance reform"),
      { target: { value: "New reviewed rationale" } },
    );
    expect(JSON.parse(advanced.value).votes[0].rationale).toBe(
      "New reviewed rationale",
    );
  });
  it("clones an immutable publication into an editable correction draft", async () => {
    render(<EditorPage dataset={fixture} />);
    await screen.findByText("Signed in as publisher@example.org · publisher");
    fireEvent.change(
      screen.getByLabelText("Clone a published snapshot (publication ID)"),
      { target: { value: "pub-1" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Start correction draft" }),
    );
    await screen.findByText(
      "Publication cloned into an unsaved correction draft.",
    );
    expect(
      (screen.getByLabelText("Change summary") as HTMLInputElement).value,
    ).toBe("Correction to publication pub-1");
    const edited = JSON.parse(
      (
        screen.getByLabelText(
          "Dataset and scoring policy",
        ) as HTMLTextAreaElement
      ).value,
    );
    expect(edited.id).not.toBe(fixture.id);
    expect(edited.votes).toEqual(fixture.votes);
    fireEvent.click(screen.getByRole("button", { name: "Add a vote" }));
    expect(
      JSON.parse(
        (
          screen.getByLabelText(
            "Dataset and scoring policy",
          ) as HTMLTextAreaElement
        ).value,
      ).votes,
    ).toHaveLength(votes.length + 1);
    expect(fixture.votes).toHaveLength(votes.length);
  });
  it("blocks publishing after editing an approved rubric", async () => {
    draft = { ...draft, status: "review" };
    render(<EditorPage dataset={fixture} />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review fixture · review · v1",
      }),
    );
    const publish = (await screen.findByRole("button", {
      name: "Publish approved snapshot",
    })) as HTMLButtonElement;
    expect(publish.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Minimum scored votes"), {
      target: { value: "40" },
    });
    expect(publish.disabled).toBe(true);
    await waitFor(() =>
      expect(
        JSON.parse(
          (
            screen.getByLabelText(
              "Dataset and scoring policy",
            ) as HTMLTextAreaElement
          ).value,
        ).rubric.minVotes,
      ).toBe(40),
    );
  });
});
