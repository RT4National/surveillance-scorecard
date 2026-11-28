import type { Dataset } from "./publication";

export const changeReasonLabels = {
  initial: "First publication",
  "new-evidence": "New vote evidence",
  correction: "Existing evidence revised",
  rubric: "Grading rules changed",
  cutoff: "Evidence cutoff changed",
} as const;
export type ChangelogReason = keyof typeof changeReasonLabels;

export function isChangelogReason(value: unknown): value is ChangelogReason {
  return typeof value === "string" && Object.hasOwn(changeReasonLabels, value);
}

export function publicationReasons(
  before: Dataset | null,
  after: Dataset,
): ChangelogReason[] {
  if (!before) return ["initial"];
  const previousVotes = new Map(
    before.votes.map((vote) => [vote.id, JSON.stringify(vote)]),
  );
  let added = false;
  let revised = false;
  for (const vote of after.votes) {
    const previous = previousVotes.get(vote.id);
    if (previous === undefined) added = true;
    else if (previous !== JSON.stringify(vote)) revised = true;
    previousVotes.delete(vote.id);
  }
  revised ||= previousVotes.size > 0;
  const key = ({ memberId, voteId }: Dataset["records"][number]) =>
    JSON.stringify([memberId, voteId]);
  const previousRecords = new Map(
    before.records.map((record) => [key(record), record]),
  );
  for (const record of after.records) {
    const id = key(record);
    const previous = previousRecords.get(id);
    if (!previous) added = true;
    else if (
      previous.outcome !== record.outcome ||
      (record.outcome !== "Not eligible" &&
        previous.partyAtVote !== record.partyAtVote)
    )
      revised = true;
    previousRecords.delete(id);
  }
  revised ||= previousRecords.size > 0;
  const reasons: ChangelogReason[] = [];
  if (added) reasons.push("new-evidence");
  if (revised) reasons.push("correction");
  if (JSON.stringify(before.rubric) !== JSON.stringify(after.rubric))
    reasons.push("rubric");
  if (before.asOf !== after.asOf) reasons.push("cutoff");
  return reasons;
}
