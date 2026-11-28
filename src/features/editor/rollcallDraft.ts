import type { BillSupportStage } from "../../ingestion/cosponsors";
import type { Dataset } from "../../core/publication";
import { reviewRollcall, type RollcallStage } from "../../ingestion/rollcalls";

export type EvidenceStage = RollcallStage | BillSupportStage;

export function unmatchedRollcallMembers(
  dataset: Dataset,
  stage: EvidenceStage,
) {
  const members = new Set(dataset.members.map(({ id }) => id));
  return [...new Set(stage.records.map(({ memberId }) => memberId))].filter(
    (id) => !members.has(id),
  );
}

export function addReviewedRollcall(
  dataset: Dataset,
  stage: EvidenceStage,
  editorial: Parameters<typeof reviewRollcall>[1],
): Dataset {
  if (dataset.votes.some(({ id }) => id === stage.id))
    throw new Error("This item is already in the draft.");
  const missing = unmatchedRollcallMembers(dataset, stage);
  if (missing.length)
    throw new Error(
      `Add these legislators to the roster first: ${missing.join(", ")}.`,
    );
  if (editorial.weight > 100)
    throw new Error("Vote weight must be 100 or less.");
  const { vote, records } = reviewRollcall(stage, editorial);
  return {
    ...dataset,
    votes: [
      ...dataset.votes,
      "kind" in stage
        ? { ...vote, kind: stage.kind, source: stage.source }
        : vote,
    ],
    records: [...dataset.records, ...records],
    sources: [...dataset.sources, ...stage.sources],
  };
}
