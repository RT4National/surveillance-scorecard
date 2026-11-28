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

export type AlignmentState =
  | "aligned"
  | "not-aligned"
  | "did-not-vote"
  | "not-in-office"
  | "outside-window";

/** Every state, in legend order. */
export const alignmentStates: AlignmentState[] = [
  "aligned",
  "not-aligned",
  "did-not-vote",
  "not-in-office",
  "outside-window",
];

/**
 * Display state of one evidence entry, read from the scorer's flags (`scored`, `inWindow`,
 * `aligned`). Never re-decides what counts: a cast vote outside the window is the scorer's
 * `inWindow === false`.
 */
export function alignmentState(e: {
  outcome: Outcome;
  scored: boolean;
  inWindow: boolean;
  aligned: boolean;
}): AlignmentState {
  if (e.outcome === "Not eligible") return "not-in-office";
  if (e.outcome === "Not voting") return "did-not-vote";
  if (!e.scored) return "outside-window";
  return e.aligned ? "aligned" : "not-aligned";
}
