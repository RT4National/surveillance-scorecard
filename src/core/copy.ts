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

/**
 * Count label for one score against the dataset's items. A headline score from the slim
 * publication index carries its counts as `actions` (computed with scoredActionCounts on the
 * server) instead of evidence rows.
 */
export const scoredLabel = (
  score: {
    evidence: { voteId: string; scored: boolean }[];
    actions?: ActionCounts;
  },
  votes: Pick<Vote, "id" | "kind">[],
) =>
  scoredActionsLabel(
    score.actions ?? scoredActionCounts(score, votes),
    hasCosponsorships(votes),
  );

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
export const notGradedGroupLabel = (count: number) => `Not graded (${count})`;

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
    ? vote.kind === "cosponsorship" && outcome === "Yes"
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
  /** Heading for items that do not count: not cast, not in office, or outside the scoring window. */
  contextHeading: (n: number) => `Context, not scored (${n})`,
} as const;

/**
 * Own-party / other-party president split.
 * The Independent sentence follows the plan's D6 recommendation (no split shown), not yet confirmed by staff.
 * `meaning` and `limits` print for every member, so they must never contain a percentage.
 */
export const splitCopy = {
  notEnough: "Too few votes to compare.",
  independent: "Not shown for Independents.",
  ownLabel: "Own party's president",
  otherLabel: "Other party's president",
  meaning: "Same record, split by which party held the White House.",
  limits:
    "Different votes come up under different presidents: a pattern, not a motive.",
  chipsLabel: "Show evidence",
  chipAll: "All",
  chipOwn: "Own-party president",
  chipOther: "Other-party president",
  sharedTopics: (n: number) => `Shared topics: ${n}`,
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
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
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

/** One-line page heading above the finder. */
export const heroCopy = {
  home: "Who votes for privacy?",
  former: "Former members",
} as const;

/**
 * A score as a whole percentage, rounded down. The scorer compares the raw value with each band's
 * minimum, so rounding down keeps the shown number inside the shown band (89.6 is a B, shown as 89%).
 */
export const percentLabel = (n: number) => `${Math.floor(n)}%`;

/** Home count row: one compact filter link per category. */
export const countRowLabel = "Filter by record";
const groupCountWords: Record<
  "reformer" | "mixed" | "surveillance" | "unproven",
  [string, string]
> = {
  reformer: ["reformer", "reformers"],
  mixed: ["mixed", "mixed"],
  surveillance: ["surveillance supporter", "surveillance supporters"],
  unproven: ["not enough evidence", "not enough evidence"],
};
/** "52 reformers", "1 mixed", "79 surveillance supporters", "234 not enough evidence". */
export const groupCountLabel = (
  group: keyof typeof groupCountWords,
  n: number,
) => `${n} ${groupCountWords[group][n === 1 ? 0 : 1]}`;
/** The control that opens the full directory in place. */
export const browseAllLabel = (n: number) => `Browse all ${n}`;
/** What the directory's roster columns mean. Methodology page only. */
export const rosterNote =
  "Current party and chamber describe the roster in this publication, including the last recorded affiliation for former members. Historical date filters narrow vote evidence, not roster membership.";

/** Site banner. Shown by the app and in the Worker's server-rendered first paint. */
export const bannerCopy = {
  loading: "LOADING SCORECARD",
  preview: "DESIGN PREVIEW",
  published: "PUBLISHED SCORECARD",
  fictional: "Fictional members and votes. Explore the proposed experience.",
  placeholder:
    "Real congressional records. Scores use unreviewed placeholder vote directions, not Restore the Fourth's positions.",
  publishedLine: (asOf: string, id: string) =>
    `Evidence through ${asOf} · Publication ${id}`,
} as const;

/** Main navigation, in order. Paths are under /scorecard. */
export const navLinks = [
  { href: "/scorecard/", title: "Scorecard" },
  { href: "/scorecard/legislation", title: "Legislation" },
  { href: "/scorecard/compare", title: "Compare" },
  { href: "/scorecard/research", title: "Research" },
  { href: "/scorecard/methodology", title: "Methodology" },
  { href: "/scorecard/archive", title: "Archive" },
] as const;
export const headerCopy = {
  skip: "Skip to content",
  mission: "Our mission",
  missionUrl: "https://restorethe4th.com/",
  formerMembers: "Former members",
  research: "Build a research report",
} as const;

/** Profile labels shared by the app and the server-rendered first paint. */
export const profileCopy = {
  back: "All legislators",
  eyebrow: (fictional: boolean, status: string) =>
    `${fictional ? "FICTIONAL LEGISLATOR" : "LEGISLATOR"} · ${status.toUpperCase()}`,
  alignment: (percent: string) => `${percent} reform alignment`,
  splitHeading: "Principles across presidencies",
  copyLink: "Copy profile link",
  memberships: "Committees & caucuses",
  noMemberships: "No current memberships listed",
  serviceBegins: (since: number | string) => `Service begins ${since}.`,
  demoRecord: "Demonstration record.",
  verify: "See the publication sources for verification.",
} as const;

/** Finder extras: the one-tap state links and the remembered-state line. */
export const stateGridLabel = "States";
export const changeStateLabel = "Change";
