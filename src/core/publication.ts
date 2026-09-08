import type { Member, RecordEntry, Rubric, Vote } from "./types";
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
