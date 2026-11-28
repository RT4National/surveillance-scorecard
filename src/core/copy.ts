import type { Outcome, Vote } from "./types";
import type { AlignmentState } from "./evidence";

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

/**
 * Label for a member with no grade because of insufficient evidence. The threshold is the active rubric's
 * `minVotes`, passed in by the caller; whether the member is graded is the scorer's call (`value === null`).
 */
export const notGradedLabel = (minVotes: number) =>
  `Not graded: fewer than ${minVotes} votes`;

/** Heading for the last directory group. Wording follows decision D5, not yet confirmed by staff. */
export const notGradedGroupLabel = (count: number) =>
  `Not graded (${count})`;

/** One word per evidence state. Each pairs with an icon shape in EvidenceRow, so colour is never the only signal. */
export const alignmentLabels: Record<AlignmentState, string> = {
  aligned: "Aligned",
  "not-aligned": "Not aligned",
  "did-not-vote": "Did not vote",
  "not-in-office": "Not in office",
  "outside-window": "Outside the scoring window",
};

/** "A YES vote was the pro-reform vote.", or the cosponsorship equivalent. */
export const reformLine = (vote: Pick<Vote, "kind" | "reformVote">) =>
  vote.kind === "cosponsorship"
    ? `Cosponsoring was the ${vote.reformVote === "Yes" ? "pro" : "anti"}-reform action.`
    : `A ${vote.reformVote.toUpperCase()} vote was the pro-reform vote.`;

/** The member's own action, or null when nothing was cast (the state word already says so). */
export const memberAction = (vote: Pick<Vote, "kind">, outcome: Outcome) =>
  outcome === "Yes" || outcome === "No"
    ? vote.kind === "cosponsorship"
      ? "Cosponsored"
      : `Voted ${outcome}`
    : null;

const points = (n: number) => Number(n.toFixed(2));
/** "Weight 2 · 0 of 2" for a scored item, "Weight 2" otherwise. */
export const weightLabel = (e: {
  vote: Pick<Vote, "weight">;
  scored: boolean;
  aligned: boolean;
  effectiveWeight: number;
}) =>
  e.scored
    ? `Weight ${points(e.vote.weight)} · ${points(e.aligned ? e.effectiveWeight : 0)} of ${points(e.effectiveWeight)}`
    : `Weight ${points(e.vote.weight)}`;

/** Evidence row and legend labels. */
export const evidenceCopy = {
  votePage: "Vote page",
  legend: "Legend",
} as const;

/** "B: 80–89%". Numeric only: band phrases wait on decision D3. */
export const bandLine = (b: { label: string; min: number; max: number }) =>
  `${b.label}: ${b.min}–${b.max}%`;

/** Profile headline lines. */
export const headlineCopy = {
  /** "7 of 9 aligned · 2015–2026". */
  aligned: (
    aligned: number,
    scored: number,
    years: { from: number; to: number } | null,
  ) =>
    `${aligned} of ${scored} aligned` +
    (years
      ? ` · ${years.from === years.to ? years.from : `${years.from}–${years.to}`}`
      : ""),
  notVoted: (n: number) => `Did not vote: ${n} · not counted`,
  doesNotMeasure: "What this grade does not measure",
  doesNotMeasureItems: [
    "Why a vote was missed.",
    "Speeches, statements and committee work.",
    "Votes and bills not on this scorecard.",
  ],
} as const;

/**
 * Error-report form. The response policy (decision D10: review time, retention, where outcomes appear)
 * is not decided, so nothing here promises a time or a reply channel.
 */
export const correctionCopy = {
  rowAction: "Report an error",
  title: "Report an error",
  label: "What is wrong, and where can we check it?",
  hint: "No personal details. We can't reply.",
  next: "Staff review every report. Fixes ship as a new publication; old ones stay archived.",
  submit: "Send",
  busy: "Sending…",
  sent: "Sent. Staff review every report.",
  failed: (status: number) => `Not sent (${status}). Try again later.`,
  closedDemo: "Closed: demo data.",
  closedUnpublished: "Closed until a publication is live.",
} as const;

/** Party context on an evidence row. Not eligible records get no party: the member was not serving. */
const partyMember = {
  Democratic: "Democrat",
  Republican: "Republican",
  Independent: "Independent",
} as const;
const withArticle = (word: string) =>
  `${/^[AEIOU]/i.test(word) ? "an" : "a"} ${word}`;
export function evidenceContext(e: {
  vote: Pick<Vote, "presidentParty">;
  outcome: Outcome;
  partyAtVote: keyof typeof partyMember;
  scored: boolean;
  ownParty: boolean;
}): string {
  const parts = [`Under ${withArticle(e.vote.presidentParty)} president`];
  if (e.outcome !== "Not eligible")
    parts.push(`${partyMember[e.partyAtVote]} at the time`);
  if (e.scored)
    parts.push(
      `Counts toward: ${e.ownParty ? "own-party" : "other-party"} president`,
    );
  return parts.join(" · ");
}
