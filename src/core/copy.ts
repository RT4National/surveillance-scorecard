import type { Vote } from "./types";

/**
 * User-facing wording about what a score counts. Kept in one place so it can change
 * (decision D2 in the UX rebuild plan) without touching components.
 */
export const methodologyCopy = {
  definition:
    "Score: the share of scored actions, by weight, that matched the reform position. Missed votes and votes outside a member's term don't count.",
  cosponsorships:
    "Cosponsoring a reform bill raises a score. Cosponsoring an anti-reform bill lowers it. Not cosponsoring has no effect.",
} as const;

export const hasCosponsorships = (votes: Pick<Vote, "kind">[]) =>
  votes.some((v) => v.kind === "cosponsorship");

/** Noun for scored items: "actions" when cosponsorships are among them, else "votes". */
export const scoredNoun = (cosponsorships: boolean) =>
  cosponsorships ? "actions" : "votes";

export interface ActionCounts {
  votes: number;
  cosponsorships: number;
}
/** Splits a score's counted evidence into roll-call votes and cosponsorships. Works on frozen scores (no embedded vote). */
export function scoredActionCounts(
  score: { evidence: { voteId: string; scored: boolean }[] },
  votes: Pick<Vote, "id" | "kind">[],
): ActionCounts {
  const kinds = new Map(votes.map((v) => [v.id, v.kind]));
  const counts = { votes: 0, cosponsorships: 0 };
  for (const e of score.evidence)
    if (e.scored)
      kinds.get(e.voteId) === "cosponsorship"
        ? counts.cosponsorships++
        : counts.votes++;
  return counts;
}

/** Count label for one score against the dataset's items. */
export const scoredLabel = (
  score: { evidence: { voteId: string; scored: boolean }[] },
  votes: Pick<Vote, "id" | "kind">[],
) => scoredActionsLabel(scoredActionCounts(score, votes), hasCosponsorships(votes));

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
/** "12 votes · 3 cosponsorships", or "4 votes" where the dataset has no cosponsorships. */
export function scoredActionsLabel(
  counts: ActionCounts,
  cosponsorships: boolean,
): string {
  const votes = plural(counts.votes, "vote", "votes");
  if (!cosponsorships) return votes;
  return `${votes} · ${plural(counts.cosponsorships, "cosponsorship", "cosponsorships")}`;
}
