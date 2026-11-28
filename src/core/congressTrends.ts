import { congressNumber } from "./congress";
import { percentLabel } from "./copy";
import type { Publication } from "./publication";
import { toCsv } from "./research";
import { canShowPublicationTrends } from "./seriesTrends";
import type { Party } from "./types";

export const minCongressItems = 5;
type AlignmentCount = { actions: number; aligned: number };
export interface CongressAlignment {
  congress: number;
  presidents: Party[];
  items: number;
  participants: number;
  entered: number | null;
  left: number | null;
  own: AlignmentCount;
  other: AlignmentCount;
  sparse: boolean;
}

export function congressAlignment(
  publication: Publication,
): CongressAlignment[] {
  if (!canShowPublicationTrends(publication) || !publication.scoring) return [];
  const byCongress = new Map<
    number,
    {
      presidents: Set<Party>;
      items: Set<string>;
      members: Set<string>;
      own: AlignmentCount;
      other: AlignmentCount;
    }
  >();
  const voteCongress = new Map<string, number>();
  for (const vote of publication.dataset.votes) {
    const congress = congressNumber(vote.date);
    if (congress === null || vote.date > publication.dataset.asOf) continue;
    voteCongress.set(vote.id, congress);
    const group = byCongress.get(congress) ?? {
      presidents: new Set<Party>(),
      items: new Set<string>(),
      members: new Set<string>(),
      own: { actions: 0, aligned: 0 },
      other: { actions: 0, aligned: 0 },
    };
    group.presidents.add(vote.presidentParty);
    byCongress.set(congress, group);
  }
  for (const [memberId, score] of Object.entries(publication.scoring.scores)) {
    for (const entry of score.evidence) {
      if (!entry.scored) continue;
      const congress = voteCongress.get(entry.voteId);
      if (congress === undefined) continue;
      const group = byCongress.get(congress)!;
      group.items.add(entry.voteId);
      group.members.add(memberId);
      const context = entry.ownParty ? group.own : group.other;
      context.actions++;
      context.aligned += Number(entry.aligned);
    }
  }
  const difference = (left: Set<string>, right: Set<string>) =>
    [...left].filter((id) => !right.has(id)).length;

  return [...byCongress]
    .sort(([a], [b]) => a - b)
    .map(([congress, group]) => {
      const previous = byCongress.get(congress - 1);
      const comparable =
        group.members.size > 0 && previous && previous.members.size > 0;
      return {
        congress,
        presidents: [...group.presidents].sort(),
        items: group.items.size,
        participants: group.members.size,
        entered: comparable
          ? difference(group.members, previous.members)
          : null,
        left: comparable ? difference(previous.members, group.members) : null,
        own: group.own,
        other: group.other,
        sparse: group.items.size < minCongressItems,
      };
    });
}

export function alignmentShare(count: AlignmentCount) {
  return count.actions ? (100 * count.aligned) / count.actions : null;
}

export function congressAlignmentCsv(
  rows: CongressAlignment[],
  publicationId: string,
) {
  return toCsv([
    [
      "Publication",
      "Congress",
      "White House parties at actions",
      "Scored items",
      "Observed members",
      "New to scored sample",
      "Absent from scored sample",
      "Evidence status",
      "Own-party actions",
      "Own-party aligned",
      "Own-party share",
      "Other-party actions",
      "Other-party aligned",
      "Other-party share",
      "Overall share",
    ],
    ...rows.map((row) => {
      const share = (count: AlignmentCount) => {
        const value = alignmentShare(count);
        return row.sparse || value === null ? "" : percentLabel(value);
      };
      return [
        publicationId,
        row.congress,
        row.presidents.join(" / "),
        row.items,
        row.participants,
        row.entered ?? "",
        row.left ?? "",
        row.sparse ? "Too few votes" : "Shown",
        row.own.actions,
        row.own.aligned,
        share(row.own),
        row.other.actions,
        row.other.aligned,
        share(row.other),
        share({
          actions: row.own.actions + row.other.actions,
          aligned: row.own.aligned + row.other.aligned,
        }),
      ];
    }),
  ]);
}
