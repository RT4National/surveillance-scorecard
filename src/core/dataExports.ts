import { publicationUrl } from "./navigation";
import type { Dataset, Publication } from "./publication";
import { toCsv } from "./research";
import { canShowPublicationTrends } from "./seriesTrends";
import type { Vote } from "./types";

export const reuseLicences = {
  "CC-BY-4.0": {
    name: "CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
  "CC0-1.0": {
    name: "CC0 1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
  },
  "ODbL-1.0": {
    name: "ODbL 1.0",
    url: "https://opendatacommons.org/licenses/odbl/1-0/",
  },
} as const;
export type ReuseLicenceId = keyof typeof reuseLicences;

export function dataLicence(
  dataset: Pick<Dataset, "reuseLicence" | "demo" | "id">,
) {
  const id = dataset.reuseLicence;
  return id &&
    !dataset.demo &&
    !/^placeholder-/i.test(dataset.id) &&
    Object.hasOwn(reuseLicences, id)
    ? reuseLicences[id]
    : undefined;
}

export function canDownloadPublication(
  publication: Publication | undefined,
): publication is Publication {
  return (
    canShowPublicationTrends(publication) && !!dataLicence(publication.dataset)
  );
}

export function exportAttribution(
  dataset: Dataset,
  publicationId?: string,
  origin?: string,
  path = "/scorecard/research",
  createdAt?: string,
) {
  const licence = dataLicence(dataset);
  const identity = publicationId
    ? `Publication ${publicationId}`
    : "Unpublished preview";
  const pinned = publicationUrl(path, publicationId);
  return {
    licence: licence?.name ?? "Pending confirmation",
    licenceUrl: licence?.url ?? null,
    citation: `Restore the Fourth, Surveillance Reform Scorecard, ${identity} (${(createdAt ?? dataset.asOf).slice(0, 10)}), ${origin ? new URL(pinned, origin).href : pinned}`,
  };
}

function attributionRows(meta: ReturnType<typeof exportAttribution>) {
  return [
    ["Licence", meta.licence, meta.licenceUrl ?? ""],
    ["Citation", meta.citation],
  ];
}

export function recordExport(
  publication: Publication,
  origin: string,
  vote?: Vote,
) {
  const { dataset } = publication;
  const path = vote
    ? `/scorecard/legislation/${encodeURIComponent(vote.id)}`
    : undefined;
  const byVote = new Map(dataset.votes.map((item) => [item.id, item]));
  const members = new Map(dataset.members.map((member) => [member.id, member]));
  return {
    publicationId: publication.id,
    datasetId: dataset.id,
    ...exportAttribution(
      dataset,
      publication.id,
      origin,
      path,
      publication.createdAt,
    ),
    ...(vote ? { vote } : {}),
    records: dataset.records
      .filter((record) => !vote || record.voteId === vote.id)
      .map((record) => ({
        ...record,
        partyAtVote:
          record.outcome === "Not eligible" ? null : record.partyAtVote,
        memberName: members.get(record.memberId)?.name ?? record.memberId,
        bill: byVote.get(record.voteId)?.bill ?? "",
        date: byVote.get(record.voteId)?.date ?? "",
        source: byVote.get(record.voteId)?.source ?? null,
      })),
  };
}

export function recordCsv(evidence: ReturnType<typeof recordExport>) {
  return toCsv([
    ["Publication", evidence.publicationId, "Dataset", evidence.datasetId],
    ...attributionRows(evidence),
    [
      "Vote ID",
      "Bill",
      "Date",
      "Member ID",
      "Member",
      "Outcome",
      "Party at vote",
      "Official source",
    ],
    ...evidence.records.map((row) => [
      row.voteId,
      row.bill,
      row.date,
      row.memberId,
      row.memberName,
      row.outcome,
      row.partyAtVote ?? "",
      row.source ?? "",
    ]),
  ]);
}

export function scoreCsv(publication: Publication, origin: string) {
  return toCsv([
    ["Publication", publication.id, "Dataset", publication.dataset.id],
    ...attributionRows(
      exportAttribution(
        publication.dataset,
        publication.id,
        origin,
        undefined,
        publication.createdAt,
      ),
    ),
    [
      "Member ID",
      "Member",
      "Current party",
      "Chamber",
      "State",
      "Status",
      "Frozen grade",
      "Alignment percent",
      "Scored actions",
    ],
    ...publication.dataset.members.flatMap((member) => {
      const score = publication.scoring?.scores[member.id];
      return score
        ? [
            [
              member.id,
              member.name,
              member.party,
              member.chamber,
              member.state,
              member.status,
              score.grade,
              score.value ?? "",
              score.counted,
            ],
          ]
        : [];
    }),
  ]);
}
