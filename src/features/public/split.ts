// Display rules for the own-party / other-party president split.
// This module only interprets the scorer's output: whether the two sides are comparable is decided by
// scoreMember (src/core/scoring.ts) and reported as `group === "unproven"`. Do not re-derive any
// evidence minimum here.
import type { scoreMember } from "../../core/scoring";
import type { Party } from "../../core/types";

type Score = ReturnType<typeof scoreMember>;
export type SplitInput = Pick<
  Score,
  "group" | "ownScore" | "otherScore" | "ownCount" | "otherCount"
>;
export type SplitSide = { percent: number; count: number };
export type SplitDisplay =
  | { kind: "comparable"; own: SplitSide; other: SplitSide }
  | {
      kind: "unproven";
      ownCount: number;
      otherCount: number;
      counts: string;
      message: string;
    }
  | { kind: "not-applicable"; message: string };

/**
 * Public wording for the split, kept in one place.
 * The Independent sentence follows the plan's D6 recommendation (no split shown), not yet confirmed by staff.
 */
export const splitCopy = {
  notEnough:
    "There is not yet enough evidence to compare the record under the two kinds of president.",
  independent:
    "Not applicable: an Independent never serves under a president of their own party, so this comparison is not shown.",
};

/** "1 vote", "4 votes"; with a qualifier, "1 scored vote". */
export const voteCount = (n: number, qualifier?: string) =>
  `${n} ${qualifier ? `${qualifier} ` : ""}${n === 1 ? "vote" : "votes"}`;

export function splitDisplay(score: SplitInput, party: Party): SplitDisplay {
  if (party === "Independent" && score.ownCount === 0)
    return { kind: "not-applicable", message: splitCopy.independent };
  if (
    score.group !== "unproven" &&
    score.ownScore !== null &&
    score.otherScore !== null
  )
    return {
      kind: "comparable",
      own: { percent: Math.round(score.ownScore), count: score.ownCount },
      other: { percent: Math.round(score.otherScore), count: score.otherCount },
    };
  return {
    kind: "unproven",
    ownCount: score.ownCount,
    otherCount: score.otherCount,
    counts: `${voteCount(score.ownCount)} under a president of their own party, ${score.otherCount} under a president of the other party.`,
    message: splitCopy.notEnough,
  };
}
