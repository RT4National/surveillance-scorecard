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

/**
 * Label for a member with no grade because of insufficient evidence. The threshold is the active rubric's
 * `minVotes`, passed in by the caller; whether the member is graded is the scorer's call (`value === null`).
 */
export const notGradedLabel = (minVotes: number) =>
  `Not graded: fewer than ${minVotes} votes`;

/** Heading for the last directory group. Wording follows decision D5, not yet confirmed by staff. */
export const notGradedGroupLabel = (count: number) =>
  `Not graded (${count})`;

/** Finder on the home page and /find. Short labels; the data does the explaining. */
export const finderCopy = {
  title: "Find your members",
  state: "State",
  chooseState: "Choose a state",
  name: "Name",
  namePlaceholder: "Search by name",
  privacy: "We don't ask for your address.",
  districtHelp: "Not sure of your district?",
  houseLink: "Find it on house.gov",
  houseUrl: "https://www.house.gov/representatives/find-your-representative",
  notGraded: "Not graded",
  matches: "Matches",
  senate: "Senate",
  house: "House",
} as const;
export const finderHeading = (label: string, count: number) =>
  `${label} (${count})`;
export const districtLabel = (district: number | undefined) =>
  district === undefined ? "House" : `District ${district}`;
/** Shown when a name search has more matches than it lists. */
export const showingFirst = (n: number) => `First ${n}`;

/** Freshness line shown under the header on every page. */
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "7 Sep 2026" from an ISO date or timestamp (UTC); the input unchanged if it is not a date. */
export function shortDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export const updatedLabel = (date: string) => `Updated ${shortDate(date)}`;
export const publicationNumberLabel = (n: number) => `Publication ${n}`;
export const methodologyLinkLabel = "Methodology";
export const newerVersionLabel = "Newer version available";
