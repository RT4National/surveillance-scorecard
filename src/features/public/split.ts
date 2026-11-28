// Display rules for the own-party / other-party president split.
// This module only interprets the scorer's output: whether the two sides are comparable is decided by
// scoreMember (src/core/scoring.ts) and reported as `group === "unproven"`. Do not re-derive any
// evidence minimum here.
import type { scoreMember } from "../../core/scoring";
import type { Party } from "../../core/types";
import { splitCopy } from "../../core/copy";

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

// Wording lives in src/core/copy.ts with the other public strings.
export { splitCopy };

/** "1 vote", "4 votes". */
export const voteCount = (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`;

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
    counts: `${score.ownCount} own-party · ${score.otherCount} other-party ${score.otherCount === 1 ? "vote" : "votes"}`,
    message: splitCopy.notEnough,
  };
}
