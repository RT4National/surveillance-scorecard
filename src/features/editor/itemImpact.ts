import type { Dataset } from "../../core/publication";
import { groupByMember } from "../../core/publication-index";
import { scoreMember } from "../../core/scoring";

export function itemImpact(before: Dataset, after: Dataset, voteId: string) {
  const affected = new Set(
    [...before.records, ...after.records]
      .filter((record) => record.voteId === voteId)
      .map((record) => record.memberId),
  );
  if (!affected.size) return [];
  const beforeRecords = groupByMember(before).records;
  const afterRecords =
    before.records === after.records
      ? beforeRecords
      : groupByMember(after).records;
  const summarize = (
    dataset: Dataset,
    records: typeof beforeRecords,
    member: Dataset["members"][number],
  ) => {
    const { grade, value } = scoreMember(
      member,
      dataset.votes,
      records.get(member.id) ?? [],
      dataset.rubric,
      dataset.asOf,
    );
    return { grade, value };
  };
  return after.members
    .filter((member) => affected.has(member.id))
    .map((member) => ({
      id: member.id,
      name: member.name,
      before: summarize(before, beforeRecords, member),
      after: summarize(after, afterRecords, member),
    }));
}
