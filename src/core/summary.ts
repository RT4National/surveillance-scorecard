// Plain counts for the profile headline, read from a score object (live or frozen). Nothing here
// recomputes a percentage or a grade: those stay `score.value` and `score.grade` from scoring.ts.
import { scoredActionCounts, type ActionCounts } from "./copy";
import type { Outcome, Vote } from "./types";

export interface ProfileSummary {
  /** Scored items where the member took the reform position. */
  aligned: number;
  /** Items that count toward the grade. */
  scored: number;
  /** Roll calls inside the scoring window the member did not vote on (not counted). */
  notVoted: number;
  /** First and last year of scored evidence, or null when nothing is scored. */
  years: { from: number; to: number } | null;
  counts: ActionCounts;
}

type SummaryEvidence = {
  voteId: string;
  outcome: Outcome;
  scored: boolean;
  inWindow: boolean;
  aligned: boolean;
};

export function profileSummary(
  score: { evidence: SummaryEvidence[] },
  votes: Pick<Vote, "id" | "kind" | "date">[],
): ProfileSummary {
  const dates = new Map(votes.map((v) => [v.id, v.date]));
  const scored = score.evidence.filter((e) => e.scored);
  const years = scored
    .map((e) => Number(dates.get(e.voteId)?.slice(0, 4)))
    .filter(Number.isFinite);
  return {
    aligned: scored.filter((e) => e.aligned).length,
    scored: scored.length,
    notVoted: score.evidence.filter(
      (e) => e.outcome === "Not voting" && e.inWindow,
    ).length,
    years: years.length
      ? { from: Math.min(...years), to: Math.max(...years) }
      : null,
    counts: scoredActionCounts(score, votes),
  };
}

export interface BandRange {
  label: string;
  min: number;
  max: number;
}
/**
 * Numeric range of the band named `grade` in the rubric's bands (descending minimums). The top
 * band ends at 100; every other ends one below the next band up.
 */
export function bandRange(
  grade: string,
  bands: { label: string; minimum: number }[],
): BandRange | null {
  const i = bands.findIndex((b) => b.label === grade);
  if (i < 0) return null;
  const above = bands[i - 1]?.minimum;
  return {
    label: grade,
    min: bands[i].minimum,
    max:
      above === undefined
        ? 100
        : Number.isInteger(above)
          ? above - 1
          : above,
  };
}
