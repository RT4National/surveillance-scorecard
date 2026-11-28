import type { ChangelogReason } from "./changelog";
import type { ReuseLicenceId } from "./dataExports";
import type { Member, RecordEntry, Rubric, Vote, VoteSeries } from "./types";
import { publicationNumberLabel } from "./copy";
import type { scoreMember } from "./scoring";

export type PublicationScore = Omit<
  ReturnType<typeof scoreMember>,
  "evidence"
> & {
  evidence: Omit<ReturnType<typeof scoreMember>["evidence"][number], "vote">[];
};
export interface PublicationScoring {
  version: "1";
  scores: Record<string, PublicationScore>;
  digest: string;
}

export interface SourceCapture {
  url: string;
  retrievedAt: string;
  sha256: string;
  kind: "members" | "votes" | "memberships" | "portrait" | "legacy";
}
export interface Dataset {
  id: string;
  asOf: string;
  demo: boolean;
  members: Member[];
  votes: Vote[];
  voteSeries?: VoteSeries[];
  reuseLicence?: ReuseLicenceId;
  records: RecordEntry[];
  rubric: Rubric;
  sources: SourceCapture[];
  coverage: string[];
  affiliations?: {
    memberId: string;
    kind: "party" | "committee" | "caucus" | "term";
    name: string;
    start: string;
    end?: string;
    precision: "day" | "year";
    source: string;
  }[];
}
export interface Publication {
  id: string;
  createdAt: string;
  publishedBy: string;
  previousId: string | null;
  summary: string;
  digest: string;
  dataset: Dataset;
  scoring?: PublicationScoring;
}

/** One row of `GET /scorecard/api/publications`, newest first. */
export interface PublicationSummary {
  id: string;
  createdAt: string;
  summary: string;
  previousId: string | null;
  changeReasons?: ChangelogReason[];
  sequence?: number;
}

/** Stable publication ordinal. Legacy lists fall back to the parent chain. */
export function publicationLabel(
  list: PublicationSummary[] | null | undefined,
  id: string,
): string | null {
  if (!list) return null;
  const byId = new Map(list.map((p) => [p.id, p]));
  let current = byId.get(id);
  if (!current) return null;
  if (
    typeof current.sequence === "number" &&
    Number.isSafeInteger(current.sequence) &&
    current.sequence > 0
  )
    return publicationNumberLabel(current.sequence);
  let position = 1;
  while (current.previousId !== null) {
    current = byId.get(current.previousId);
    if (!current || position >= list.length) return null;
    position++;
  }
  return publicationNumberLabel(position);
}

export const isPreviewDataset = (dataset: Pick<Dataset, "id" | "demo">) =>
  dataset.demo || /^placeholder-/i.test(dataset.id);

/** Public grade claims and corrections require a reviewed, frozen publication. */
export function isPublishable(
  publication: Publication | null | undefined,
): publication is Publication & { scoring: PublicationScoring } {
  return Boolean(
    publication?.scoring &&
    !isPreviewDataset(publication.dataset) &&
    !/^placeholder-/i.test(publication.id),
  );
}

export function frozenShareScore(
  publication: Publication | null | undefined,
  memberId: string,
) {
  if (
    !isPublishable(publication) ||
    !Object.hasOwn(publication.scoring.scores, memberId)
  )
    return undefined;
  return publication.scoring.scores[memberId];
}
