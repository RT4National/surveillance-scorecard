import type { Publication } from "./publication";
import { tallyRollCall } from "./tally";
import type { Party, RecordEntry, Vote, VoteSeries } from "./types";
import { seriesVisibility } from "./voteSeries";

type Tally = ReturnType<typeof tallyRollCall>;
export type ReformCounts = {
  forReform: number;
  cast: number;
  didNotVote: number;
};
export interface SeriesPoint {
  voteId: string;
  date: string;
  bill: string;
  title: string;
  presidentParty: Party;
  total: ReformCounts;
  byParty: Record<Party, ReformCounts>;
  notInOffice: number;
}
export interface SeriesTrend extends Omit<VoteSeries, "voteIds"> {
  points: SeriesPoint[];
}

function reformCounts(
  counts: Tally["totals"],
  position: Vote["reformVote"],
): ReformCounts {
  return {
    forReform: counts[position],
    cast: counts.Yes + counts.No,
    didNotVote: counts["Not voting"],
  };
}

export function canShowPublicationTrends(
  publication: Publication | null | undefined,
): publication is Publication {
  return (
    !!publication?.scoring &&
    !/^placeholder-/i.test(publication.id) &&
    seriesVisibility(publication.dataset) === "reviewed"
  );
}

export function publicationSeriesTrends(
  publication: Publication,
): SeriesTrend[] {
  if (!canShowPublicationTrends(publication)) return [];
  const { dataset } = publication;
  const series = dataset.voteSeries ?? [];
  if (!series.length) return [];
  const ids = new Set(series.flatMap((item) => item.voteIds));
  const records = new Map<string, RecordEntry[]>();
  for (const entry of dataset.records) {
    if (!ids.has(entry.voteId)) continue;
    const ballots = records.get(entry.voteId) ?? [];
    ballots.push(entry);
    records.set(entry.voteId, ballots);
  }
  const points = new Map<string, SeriesPoint>();
  for (const vote of dataset.votes) {
    if (
      !ids.has(vote.id) ||
      vote.date > dataset.asOf ||
      vote.kind === "cosponsorship"
    )
      continue;
    const tally = tallyRollCall(records.get(vote.id) ?? []);
    points.set(vote.id, {
      voteId: vote.id,
      date: vote.date,
      bill: vote.bill,
      title: vote.commonName ?? vote.title,
      presidentParty: vote.presidentParty,
      total: reformCounts(tally.totals, vote.reformVote),
      byParty: {
        Democratic: reformCounts(tally.byParty.Democratic, vote.reformVote),
        Republican: reformCounts(tally.byParty.Republican, vote.reformVote),
        Independent: reformCounts(tally.byParty.Independent, vote.reformVote),
      },
      notInOffice: tally.notInOffice,
    });
  }
  return series.flatMap(({ voteIds, ...item }) => {
    const ordered = voteIds
      .flatMap((id) => points.get(id) ?? [])
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.voteId.localeCompare(b.voteId),
      );
    return ordered.length >= 2 ? [{ ...item, points: ordered }] : [];
  });
}
