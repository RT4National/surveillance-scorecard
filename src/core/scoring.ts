import type { Group, Member, RecordEntry, Rubric, Vote } from "./types";

export const rubric: Rubric = {
  version: "proposal-0.1",
  minVotes: 3,
  minPerContext: 2,
  consistencyThreshold: 75,
};
export function letterGrade(score: number | null): string {
  if (score === null) return "—";
  if (score >= 97) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}
export function scoreMember(
  member: Member,
  votes: Vote[],
  records: RecordEntry[],
  settings = rubric,
  asOf = "9999-12-31",
) {
  const seen = new Set<string>();
  const evidence = records
    .filter((r) => r.memberId === member.id)
    .flatMap((record) => {
      if (seen.has(record.voteId))
        throw new Error(`Duplicate member/vote: ${member.id}/${record.voteId}`);
      seen.add(record.voteId);
      const vote = votes.find((v) => v.id === record.voteId);
      if (!vote) throw new Error(`Missing vote ${record.voteId}`);
      if (!(vote.weight > 0) || !Number.isFinite(vote.weight))
        throw new Error("Vote weights must be positive");
      if (vote.date > asOf) return [];
      const scored = record.outcome === "Yes" || record.outcome === "No";
      return [
        {
          ...record,
          vote,
          scored,
          aligned: record.outcome === vote.reformVote,
          ownParty: record.partyAtVote === vote.presidentParty,
        },
      ];
    });
  const eligible = evidence.filter((e) => e.scored);
  const weighted = (items: typeof evidence) => {
    const possible = items.reduce((sum, e) => sum + e.vote.weight, 0);
    return possible
      ? (100 *
          items.reduce((sum, e) => sum + (e.aligned ? e.vote.weight : 0), 0)) /
          possible
      : null;
  };
  const own = eligible.filter((e) => e.ownParty);
  const other = eligible.filter((e) => !e.ownParty);
  const ownScore = weighted(own),
    otherScore = weighted(other);
  const enough = eligible.length >= settings.minVotes;
  const value = enough ? weighted(eligible) : null;
  const comparable =
    enough &&
    own.length >= settings.minPerContext &&
    other.length >= settings.minPerContext;
  let group: Group = "conditional";
  if (comparable && ownScore !== null && otherScore !== null) {
    if (
      ownScore >= settings.consistencyThreshold &&
      otherScore >= settings.consistencyThreshold
    )
      group = "reformer";
    else if (
      ownScore <= 100 - settings.consistencyThreshold &&
      otherScore <= 100 - settings.consistencyThreshold
    )
      group = "surveillance";
  }
  const reason = !comparable
    ? "Unproven across administrations"
    : group === "conditional"
      ? "Mixed record across administrations"
      : "Consistent across both party contexts";
  return {
    value,
    grade: letterGrade(value),
    group,
    reason,
    evidence,
    counted: eligible.length,
    ownScore,
    otherScore,
    ownCount: own.length,
    otherCount: other.length,
    earned: eligible.reduce((n, e) => n + (e.aligned ? e.vote.weight : 0), 0),
    possible: eligible.reduce((n, e) => n + e.vote.weight, 0),
    version: settings.version,
  };
}
export const groupLabels: Record<Group, string> = {
  reformer: "Consistent reformers",
  conditional: "Conditional & unproven",
  surveillance: "Consistent surveillance supporters",
};
