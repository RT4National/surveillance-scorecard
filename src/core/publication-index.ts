// Slim views of one verified publication, for the landing page and a single profile.
//
// The full publication (about 5.6 MB of JSON on staging) carries every record, source capture,
// affiliation and frozen evidence row. The home page, the finder and the directory need only the
// active roster and each member's frozen headline score; a profile needs one member's records.
// The Worker derives both views from the publication after verifying its dataset digest and its
// frozen scoring (worker/index.ts), and each view names the publication ID and digests it came
// from. The client checks that binding against the publication it believes it is showing
// (src/data/context.tsx). Archive, reports and research still load and verify the full publication.
//
// Responses are cached as immutable per publication ID, so a change to either shape must change
// INDEX_FORMAT and the endpoint path.
import type { Dataset, Publication, PublicationScore } from "./publication";
import type { Member, RecordEntry, Vote } from "./types";
import { publishedScore } from "./publication-scores";
import { scoredActionCounts, type ActionCounts } from "./copy";
import type { scoreMember } from "./scoring";

type Score = ReturnType<typeof scoreMember>;
export const INDEX_FORMAT = 1;

/** A frozen headline score without its evidence rows, plus the counts its label needs. */
export type IndexScore = Omit<Score, "evidence"> & { actions: ActionCounts };

/** Which publication a slim view was derived from. */
export interface PublicationBinding {
  id: string;
  /** SHA-256 of the publication's Dataset (Publication.digest). */
  digest: string;
  /** Publication.scoring.digest, or null for a legacy publication without frozen scores. */
  scoringDigest: string | null;
}

export interface PublicationIndex {
  format: typeof INDEX_FORMAT;
  publication: PublicationBinding &
    Pick<Publication, "createdAt" | "previousId" | "summary">;
  dataset: Pick<Dataset, "id" | "asOf" | "demo" | "rubric" | "coverage"> & {
    votes: Vote[];
    voteSeries?: Dataset["voteSeries"];
    /** Number of source captures. A demo dataset without any is the fictional preview. */
    sourceCount: number;
  };
  /** Active members only; a former member's profile comes with its member slice. */
  members: Member[];
  /** Frozen scores at the publication cutoff, by member ID. Null for a legacy publication. */
  scores: Record<string, IndexScore> | null;
}

/** One member's evidence: everything a profile needs beyond the index. */
export interface MemberSlice {
  format: typeof INDEX_FORMAT;
  publication: PublicationBinding;
  member: Member;
  records: RecordEntry[];
  affiliations: NonNullable<Dataset["affiliations"]>;
  /** The frozen score with its evidence (vote objects omitted), or null for a legacy publication. */
  score: PublicationScore | null;
}

export const bindingOf = (p: Publication): PublicationBinding => ({
  id: p.id,
  digest: p.digest,
  scoringDigest: p.scoring?.digest ?? null,
});

/** Builds the index from a publication the caller has already verified. */
export function buildPublicationIndex(p: Publication): PublicationIndex {
  const { dataset } = p;
  const members = dataset.members.filter((m) => m.status === "active");
  let scores: Record<string, IndexScore> | null = null;
  if (p.scoring) {
    scores = Object.create(null) as Record<string, IndexScore>;
    for (const m of members) {
      const { evidence, ...summary } = publishedScore(p, m);
      scores[m.id] = {
        ...summary,
        actions: scoredActionCounts({ evidence }, dataset.votes),
      };
    }
  }
  return {
    format: INDEX_FORMAT,
    publication: {
      ...bindingOf(p),
      createdAt: p.createdAt,
      previousId: p.previousId,
      summary: p.summary,
    },
    dataset: {
      id: dataset.id,
      asOf: dataset.asOf,
      demo: dataset.demo,
      rubric: dataset.rubric,
      coverage: dataset.coverage,
      votes: dataset.votes,
      voteSeries: dataset.voteSeries,
      sourceCount: dataset.sources.length,
    },
    members,
    scores,
  };
}

/** Records and affiliations grouped by member, built once per publication. */
export interface MemberGroups {
  records: Map<string, RecordEntry[]>;
  affiliations: Map<string, NonNullable<Dataset["affiliations"]>>;
}
export function groupByMember(dataset: Dataset): MemberGroups {
  const records = new Map<string, RecordEntry[]>();
  for (const r of dataset.records) {
    const list = records.get(r.memberId);
    if (list) list.push(r);
    else records.set(r.memberId, [r]);
  }
  const affiliations = new Map<string, NonNullable<Dataset["affiliations"]>>();
  for (const a of dataset.affiliations ?? []) {
    const list = affiliations.get(a.memberId);
    if (list) list.push(a);
    else affiliations.set(a.memberId, [a]);
  }
  return { records, affiliations };
}

/** One member's slice of a verified publication, or null when the member is not in it. */
export function buildMemberSlice(
  p: Publication,
  memberId: string,
  groups: MemberGroups = groupByMember(p.dataset),
): MemberSlice | null {
  const member = p.dataset.members.find((m) => m.id === memberId);
  if (!member) return null;
  let score: PublicationScore | null = null;
  if (p.scoring) {
    const { evidence, ...summary } = publishedScore(p, member);
    score = { ...summary, evidence: evidence.map(({ vote: _v, ...e }) => e) };
  }
  return {
    format: INDEX_FORMAT,
    publication: bindingOf(p),
    member,
    records: groups.records.get(member.id) ?? [],
    affiliations: groups.affiliations.get(member.id) ?? [],
    score,
  };
}

/** Shape check for an index response. Throws on anything unexpected. */
export function checkIndex(value: unknown): PublicationIndex {
  const v = value as PublicationIndex | null;
  if (
    !v ||
    v.format !== INDEX_FORMAT ||
    !checkBinding(v.publication) ||
    typeof v.publication.createdAt !== "string" ||
    !v.dataset ||
    typeof v.dataset.asOf !== "string" ||
    typeof v.dataset.demo !== "boolean" ||
    !v.dataset.rubric ||
    !Array.isArray(v.dataset.votes) ||
    !Array.isArray(v.dataset.coverage) ||
    typeof v.dataset.sourceCount !== "number" ||
    !Array.isArray(v.members) ||
    (v.scores !== null && (typeof v.scores !== "object" || !v.scores)) ||
    (v.scores === null) !== (v.publication.scoringDigest === null)
  )
    throw new Error("Invalid publication index response.");
  if (v.scores && v.members.some((m) => !Object.hasOwn(v.scores!, m.id)))
    throw new Error("Invalid publication index response.");
  return v;
}
export function checkSlice(value: unknown): MemberSlice {
  const v = value as MemberSlice | null;
  if (
    !v ||
    v.format !== INDEX_FORMAT ||
    !checkBinding(v.publication) ||
    !v.member ||
    typeof v.member.id !== "string" ||
    !Array.isArray(v.records) ||
    !Array.isArray(v.affiliations) ||
    v.records.some((r) => r.memberId !== v.member.id) ||
    (v.score !== null && (!v.score || !Array.isArray(v.score.evidence)))
  )
    throw new Error("Invalid member evidence response.");
  return v;
}
function checkBinding(b: unknown): b is PublicationBinding {
  const v = b as PublicationBinding | null;
  return (
    !!v &&
    typeof v.id === "string" &&
    /^[a-f0-9]{64}$/.test(v.digest) &&
    (v.scoringDigest === null || /^[a-f0-9]{64}$/.test(v.scoringDigest))
  );
}
type Named = Pick<PublicationBinding, "id" | "digest"> &
  Partial<Pick<PublicationBinding, "scoringDigest">>;
/**
 * True when two views name the same publication and dataset digest, and the same scoring
 * digest where both state one (the page root names only the ID and dataset digest).
 */
export const sameBinding = (a: Named, b: Named) =>
  a.id === b.id &&
  a.digest === b.digest &&
  (a.scoringDigest === undefined ||
    b.scoringDigest === undefined ||
    a.scoringDigest === b.scoringDigest);
