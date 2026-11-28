import { isPreviewDataset, type Dataset } from "./publication";
import type { Vote, VoteSeries } from "./types";

export function seriesVisibility(dataset: Pick<Dataset, "id" | "demo">) {
  return isPreviewDataset(dataset) ? "preview" : "reviewed";
}

export function validateVoteSeries(
  value: unknown,
  votes: ReadonlyMap<string, Vote>,
): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return ["Repeated-vote series must be a list."];
  const errors: string[] = [];
  const ids = new Set<string>();
  const nonempty = (value: unknown): value is string =>
    typeof value === "string" && !!value.trim();
  for (const series of value) {
    if (
      !series ||
      typeof series !== "object" ||
      !nonempty(series.id) ||
      !/^[a-z0-9-]+$/i.test(series.id) ||
      !nonempty(series.name) ||
      !nonempty(series.rationale) ||
      !["House", "Senate"].includes(series.chamber)
    ) {
      errors.push(
        "Each repeated-vote series needs an ID, name, rationale and chamber.",
      );
      continue;
    }
    if (ids.has(series.id)) errors.push(`Repeated series ID: ${series.id}.`);
    ids.add(series.id);
    if (
      !Array.isArray(series.voteIds) ||
      series.voteIds.length < 2 ||
      new Set(series.voteIds).size !== series.voteIds.length
    ) {
      errors.push(
        `${series.name} must contain at least two distinct roll calls.`,
      );
      continue;
    }
    if (
      series.voteIds.some((id: unknown) => {
        const vote = typeof id === "string" ? votes.get(id) : undefined;
        return (
          !vote ||
          vote.kind === "cosponsorship" ||
          vote.chamber !== series.chamber
        );
      })
    )
      errors.push(
        `${series.name} must contain existing roll calls from the same chamber.`,
      );
  }
  return errors;
}

export function removeVoteFromSeries(
  series: VoteSeries[] | undefined,
  voteId: string,
) {
  return series
    ?.map((item) => ({
      ...item,
      voteIds: item.voteIds.filter((id) => id !== voteId),
    }))
    .filter((item) => item.voteIds.length >= 2);
}
