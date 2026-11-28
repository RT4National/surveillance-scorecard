import type { Member, RecordEntry, Rubric, Vote } from "./types";
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
}

/**
 * Human label for a publication: its 1-based position in the chain of `previousId`
 * links, e.g. "Publication 12". Stable for a given list and unchanged when newer
 * publications are added. Null when the list is missing or the chain does not reach
 * its first publication (unknown id, list cut off), so callers fall back to the date.
 */
export function publicationLabel(
  list: PublicationSummary[] | null | undefined,
  id: string,
): string | null {
  if (!list) return null;
  const byId = new Map(list.map((p) => [p.id, p]));
  let current = byId.get(id);
  if (!current) return null;
  let position = 1;
  while (current.previousId !== null) {
    current = byId.get(current.previousId);
    if (!current || position >= list.length) return null;
    position++;
  }
  return publicationNumberLabel(position);
}

/** The latest publication when `id` is an older one in the list, else null. */
export function newerPublication(
  list: PublicationSummary[] | null | undefined,
  id: string,
): PublicationSummary | null {
  const index = list ? list.findIndex((p) => p.id === id) : -1;
  return list && index > 0 ? list[0] : null;
}
