import type { Outcome, Vote } from "./types";

/** A bill-support record is a sign-on, not a ballot. */
export function evidenceLabel(
  vote: Pick<Vote, "kind">,
  outcome: Outcome,
): string {
  return vote.kind === "cosponsorship" && outcome === "Yes"
    ? "Cosponsored"
    : outcome;
}
