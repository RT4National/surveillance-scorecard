import type { Vote } from "./types";

/**
 * User-facing wording about what a score counts. Kept in one place so it can change
 * (decision D2 in the UX rebuild plan) without touching components.
 */
export const methodologyCopy = {
  definition:
    "Reform-aligned weighted actions divided by the weight of all scored actions, multiplied by 100. Not voting and Not eligible records are excluded.",
  cosponsorships:
    "Cosponsorships are scored. A bill-support item records a Yes for its sponsor and cosponsors, and it counts like a Yes vote on that item.",
  oneSided:
    "Members who did not cosponsor a bill get no record for it, so cosponsoring a reform bill can only raise a score, cosponsoring an anti-reform bill can only lower it, and not cosponsoring changes nothing.",
} as const;

export const hasCosponsorships = (votes: Pick<Vote, "kind">[]) =>
  votes.some((v) => v.kind === "cosponsorship");

/** Noun for scored items: "scored actions" when cosponsorships are among them, else "scored votes". */
export const scoredNoun = (cosponsorships: boolean) =>
  cosponsorships ? "scored actions" : "scored votes";

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

const plural =(n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
/** "15 scored actions (12 votes, 3 cosponsorships)", or "4 scored votes" where no cosponsorships are in the dataset. */
export function scoredActionsLabel(
  counts: ActionCounts,
  cosponsorships: boolean,
): string {
  const total = counts.votes + counts.cosponsorships;
  if (!cosponsorships) return `${total} scored votes`;
  return `${total} scored actions (${plural(counts.votes, "vote", "votes")}, ${plural(counts.cosponsorships, "cosponsorship", "cosponsorships")})`;
}
