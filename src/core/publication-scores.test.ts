import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPublicationScoring,
  publishedScore,
  verifyPublicationScoring,
} from "./publication-scores";
import type { Dataset, Publication } from "./publication";
import * as scorer from "./scoring";
import { dataset, members, votes, records } from "../data/demo";
const fixture: Dataset = {
  ...dataset,
  members,
  votes,
  records,
  rubric: scorer.rubric,
  sources: [],
  coverage: ["Fictional fixture"],
};
async function publication(): Promise<Publication> {
  return {
    id: "snapshot",
    createdAt: "2026-09-07T00:00:00Z",
    publishedBy: "publisher@example.org",
    previousId: null,
    summary: "Archive",
    digest: "a".repeat(64),
    dataset: structuredClone(fixture),
    scoring: await createPublicationScoring(fixture),
  };
}
afterEach(() => vi.restoreAllMocks());
describe("Immutable published scores", () => {
  it("captures deterministic complete scores for every member", async () => {
    const p = await publication();
    expect(p.scoring).toEqual(await createPublicationScoring(fixture));
    expect(Object.keys(p.scoring!.scores).sort()).toEqual(
      members.map((m) => m.id).sort(),
    );
    for (const member of members)
      expect(publishedScore(p, member)).toEqual(
        scorer.scoreMember(
          member,
          votes,
          records,
          fixture.rubric,
          fixture.asOf,
        ),
      );
    await expect(verifyPublicationScoring(p)).resolves.toBeUndefined();
    expect(
      p.scoring!.scores[members[0].id].evidence.every(
        (e) => !Object.hasOwn(e, "vote"),
      ),
    ).toBe(true);
  });
  it("preserves published grades across scorer changes and labels recalculation through its cutoff contract", async () => {
    const p = await publication();
    const original = publishedScore(p, members[0]);
    const changed = { ...original, grade: "NEW ENGINE RESULT" };
    const spy = vi.spyOn(scorer, "scoreMember").mockReturnValue(changed);
    expect(publishedScore(p, members[0])).toEqual(original);
    expect(spy).not.toHaveBeenCalled();
    await expect(verifyPublicationScoring(p)).resolves.toBeUndefined();
    expect(publishedScore(p, members[0], "2020-01-01")).toBe(changed);
    expect(spy).toHaveBeenCalledOnce();
  });
  it("allows explicit legacy recalculation but never falls back for malformed frozen scores", async () => {
    const p = await publication();
    const legacy = { ...p, scoring: undefined };
    await expect(verifyPublicationScoring(legacy)).resolves.toBeUndefined();
    expect(publishedScore(legacy, members[0])).toEqual(
      scorer.scoreMember(
        members[0],
        votes,
        records,
        fixture.rubric,
        fixture.asOf,
      ),
    );
    delete p.scoring!.scores[members[0].id];
    await expect(verifyPublicationScoring(p)).rejects.toThrow("every member");
    expect(() => publishedScore(p, members[0])).toThrow("Invalid");
  });
  it("refuses tampered scores and incomplete or mismatched evidence", async () => {
    const p = await publication();
    p.scoring!.scores[members[0].id].grade = "Altered";
    await expect(verifyPublicationScoring(p)).rejects.toThrow(
      "digest mismatch",
    );
    const malformed = await publication();
    malformed.scoring!.scores[members[0].id].evidence[0].voteId =
      "missing-vote";
    await expect(verifyPublicationScoring(malformed)).rejects.toThrow(
      "does not match",
    );
    const wrongKeys = await publication();
    wrongKeys.scoring!.scores.extra = wrongKeys.scoring!.scores[members[0].id];
    await expect(verifyPublicationScoring(wrongKeys)).rejects.toThrow(
      "every member",
    );
  });
});
