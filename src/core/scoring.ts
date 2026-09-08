import type { Group, Member, RecordEntry, Rubric, Vote } from "./types";

export const rubric: Rubric = {
  version: "proposal-0.1",
  minVotes: 3,
  minPerContext: 2,
  consistencyThreshold: 75,
};
export const defaultGradeBands = [
  { label: "A+", minimum: 97 },
  { label: "A", minimum: 90 },
  { label: "B", minimum: 80 },
  { label: "C", minimum: 65 },
  { label: "D", minimum: 50 },
  { label: "F", minimum: 0 },
];
export function validateRubric(settings: Rubric) {
  if (!settings.version.trim()) throw new Error("Rubric version is required");
  if (
    !Number.isInteger(settings.minVotes) ||
    settings.minVotes < 1 ||
    !Number.isInteger(settings.minPerContext) ||
    settings.minPerContext < 1
  )
    throw new Error("Evidence minimums must be positive integers");
  if (
    !Number.isFinite(settings.consistencyThreshold) ||
    settings.consistencyThreshold <= 50 ||
    settings.consistencyThreshold > 100
  )
    throw new Error(
      "Consistency threshold must be greater than 50 and at most 100",
    );
  for (const value of [settings.lookbackYears, settings.halfLifeYears])
    if (value !== undefined && (!Number.isFinite(value) || value <= 0))
      throw new Error("Time windows must be positive");
  if (
    settings.minSharedTopics !== undefined &&
    (!Number.isInteger(settings.minSharedTopics) ||
      settings.minSharedTopics < 0)
  )
    throw new Error("Shared topic minimum must be a nonnegative integer");
  const bands = settings.gradeBands ?? defaultGradeBands;
  if (
    !bands.length ||
    bands.at(-1)?.minimum !== 0 ||
    new Set(bands.map((b) => b.label)).size !== bands.length ||
    bands.some(
      (b, i) =>
        !b.label.trim() ||
        !Number.isFinite(b.minimum) ||
        b.minimum < 0 ||
        b.minimum > 100 ||
        (i > 0 && b.minimum >= bands[i - 1].minimum),
    )
  )
    throw new Error(
      "Grade bands must have unique labels and descending thresholds ending at zero",
    );
}
export function letterGrade(
  score: number | null,
  bands = defaultGradeBands,
): string {
  if (score === null) return "—";
  return bands.find((b) => score >= b.minimum)?.label ?? "—";
}
export function scoreMember(
  member: Member,
  votes: Vote[],
  records: RecordEntry[],
  settings = rubric,
  asOf = "9999-12-31",
) {
  validateRubric(settings);
  if (new Set(votes.map((v) => v.id)).size !== votes.length)
    throw new Error("Duplicate vote identifier");
  const cutoff =
    asOf === "9999-12-31"
      ? votes.reduce(
          (date, vote) => (vote.date > date ? vote.date : date),
          "1970-01-01",
        )
      : asOf;
  const cutoffTime = Date.parse(cutoff);
  if (!Number.isFinite(cutoffTime))
    throw new Error("Invalid evidence cutoff date");
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
      const ageYears =
        (cutoffTime - Date.parse(vote.date)) / (365.25 * 86400000);
      if (!Number.isFinite(ageYears)) throw new Error("Invalid vote date");
      if (vote.date > asOf) return [];
      const inWindow =
        settings.lookbackYears === undefined ||
        ageYears <= settings.lookbackYears;
      const scored =
        inWindow && (record.outcome === "Yes" || record.outcome === "No");
      const effectiveWeight =
        vote.weight *
        (settings.halfLifeYears
          ? Math.pow(0.5, Math.max(0, ageYears) / settings.halfLifeYears)
          : 1);
      return [
        {
          ...record,
          vote,
          scored,
          inWindow,
          effectiveWeight,
          aligned: record.outcome === vote.reformVote,
          ownParty: record.partyAtVote === vote.presidentParty,
        },
      ];
    });
  const eligible = evidence.filter((e) => e.scored);
  const weighted = (items: typeof evidence) => {
    const possible = items.reduce((sum, e) => sum + e.effectiveWeight, 0);
    return possible
      ? (100 *
          items.reduce(
            (sum, e) => sum + (e.aligned ? e.effectiveWeight : 0),
            0,
          )) /
          possible
      : null;
  };
  const own = eligible.filter((e) => e.ownParty);
  const other = eligible.filter((e) => !e.ownParty);
  const ownScore = weighted(own),
    otherScore = weighted(other);
  const sharedTopics = [...new Set(own.map((e) => e.vote.topic))].filter(
    (topic) => other.some((e) => e.vote.topic === topic),
  );
  const enough = eligible.length >= settings.minVotes;
  const value = enough ? weighted(eligible) : null;
  const comparable =
    enough &&
    own.length >= settings.minPerContext &&
    other.length >= settings.minPerContext &&
    sharedTopics.length >= (settings.minSharedTopics ?? 0);
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
    grade: letterGrade(value, settings.gradeBands),
    group,
    reason,
    evidence,
    counted: eligible.length,
    ownScore,
    otherScore,
    ownCount: own.length,
    otherCount: other.length,
    sharedTopics,
    topicCoverageWarning:
      sharedTopics.length === 0 && own.length > 0 && other.length > 0
        ? "No shared issue topics across party contexts; differences may reflect the issue mix."
        : null,
    earned: eligible.reduce(
      (n, e) => n + (e.aligned ? e.effectiveWeight : 0),
      0,
    ),
    possible: eligible.reduce((n, e) => n + e.effectiveWeight, 0),
    version: settings.version,
  };
}
export const groupLabels: Record<Group, string> = {
  reformer: "Consistent reformers",
  conditional: "Conditional & unproven",
  surveillance: "Consistent surveillance supporters",
};
