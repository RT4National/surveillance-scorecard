import type {
  Dataset,
  Publication,
  PublicationScore,
  PublicationScoring,
} from "./publication";
import type { Member } from "./types";
import { scoreMember } from "./scoring";

type Score = ReturnType<typeof scoreMember>;
async function sha(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const percent = (v: unknown) =>
  v === null || (finite(v) && (v as number) <= 100);
const integer = (v: unknown) => finite(v) && Number.isInteger(v);
function scoreShape(v: unknown, memberId: string): v is PublicationScore {
  if (
    !object(v) ||
    !percent(v.value) ||
    !percent(v.ownScore) ||
    !percent(v.otherScore) ||
    typeof v.grade !== "string" ||
    !v.grade ||
    typeof v.reason !== "string" ||
    typeof v.version !== "string" ||
    !["reformer", "conditional", "surveillance"].includes(String(v.group)) ||
    ![v.counted, v.ownCount, v.otherCount].every(integer) ||
    ![v.earned, v.possible].every(finite) ||
    !Array.isArray(v.sharedTopics) ||
    !v.sharedTopics.every((t) => typeof t === "string") ||
    (v.topicCoverageWarning !== null &&
      typeof v.topicCoverageWarning !== "string") ||
    !Array.isArray(v.evidence)
  )
    return false;
  return v.evidence.every(
    (e) =>
      object(e) &&
      e.memberId === memberId &&
      typeof e.voteId === "string" &&
      ["Yes", "No", "Not voting", "Not eligible"].includes(String(e.outcome)) &&
      ["Democratic", "Republican", "Independent"].includes(
        String(e.partyAtVote),
      ) &&
      !Object.hasOwn(e, "vote") &&
      [e.scored, e.inWindow, e.aligned, e.ownParty].every(
        (b) => typeof b === "boolean",
      ) &&
      finite(e.effectiveWeight),
  );
}
/** Version 1 freezes the entire published result, including explanation and weighted evidence. */
export async function createPublicationScoring(
  dataset: Dataset,
): Promise<PublicationScoring> {
  const scores: Record<string, PublicationScore> = Object.create(null);
  for (const member of [...dataset.members].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  )) {
    if (Object.hasOwn(scores, member.id))
      throw new Error("Duplicate member in publication scoring");
    const { evidence, ...summary } = scoreMember(
      member,
      dataset.votes,
      dataset.records,
      dataset.rubric,
      dataset.asOf,
    );
    scores[member.id] = {
      ...summary,
      evidence: evidence.map(({ vote: _vote, ...entry }) => entry),
    };
  }
  return { version: "1", scores, digest: await sha(scores) };
}
/** Call after verifying the Dataset digest and before exposing a downloaded publication. */
export async function verifyPublicationScoring(
  publication: Publication,
): Promise<void> {
  if (publication.scoring === undefined) return; // Legacy archives remain explicit current-engine recalculations.
  const snapshot: unknown = publication.scoring;
  if (
    !object(snapshot) ||
    snapshot.version !== "1" ||
    !object(snapshot.scores) ||
    typeof snapshot.digest !== "string" ||
    !/^[a-f0-9]{64}$/.test(snapshot.digest)
  )
    throw new Error("Invalid published scoring snapshot");
  const ids = new Set(publication.dataset.members.map((m) => m.id));
  if (
    ids.size !== publication.dataset.members.length ||
    Object.keys(snapshot.scores).length !== ids.size
  )
    throw new Error("Published scores must cover every member exactly once");
  const votes = new Map(publication.dataset.votes.map((v) => [v.id, v]));
  for (const id of ids) {
    const score = snapshot.scores[id];
    if (
      !Object.hasOwn(snapshot.scores, id) ||
      !scoreShape(score, id) ||
      score.version !== publication.dataset.rubric.version
    )
      throw new Error(`Invalid published score for ${id}`);
    const expected = publication.dataset.records.filter(
      (r) =>
        r.memberId === id &&
        (votes.get(r.voteId)?.date ?? "9999") <= publication.dataset.asOf,
    );
    const seen = new Set<string>();
    for (const e of score.evidence) {
      if (
        seen.has(e.voteId) ||
        !votes.has(e.voteId) ||
        !expected.some(
          (r) =>
            r.voteId === e.voteId &&
            r.outcome === e.outcome &&
            r.partyAtVote === e.partyAtVote,
        )
      )
        throw new Error(
          "Published scoring evidence does not match its dataset",
        );
      seen.add(e.voteId);
    }
    if (seen.size !== expected.length)
      throw new Error("Published scoring evidence is incomplete");
  }
  if ((await sha(snapshot.scores)) !== snapshot.digest)
    throw new Error("Published scoring digest mismatch");
}
/** Publication must pass asynchronous verification at the loading boundary. Never silently fall back from a malformed snapshot. */
export function publishedScore(
  publication: Publication,
  member: Member,
  asOf = publication.dataset.asOf,
): Score {
  const capturedMember = publication.dataset.members.find(
    (m) => m.id === member.id,
  );
  if (!capturedMember) throw new Error("Member is not in this publication");
  if (publication.scoring !== undefined && asOf === publication.dataset.asOf) {
    const snapshot = publication.scoring;
    if (
      snapshot.version !== "1" ||
      !snapshot.scores ||
      !Object.hasOwn(snapshot.scores, member.id) ||
      !scoreShape(snapshot.scores[member.id], member.id)
    )
      throw new Error("Invalid published scoring snapshot");
    const stored = snapshot.scores[member.id];
    const votes = new Map(publication.dataset.votes.map((v) => [v.id, v]));
    return {
      ...stored,
      evidence: stored.evidence.map((e) => {
        const vote = votes.get(e.voteId);
        if (!vote)
          throw new Error("Published evidence references a missing vote");
        return { ...e, vote };
      }),
    };
  }
  return scoreMember(
    capturedMember,
    publication.dataset.votes,
    publication.dataset.records,
    publication.dataset.rubric,
    asOf,
  );
}
