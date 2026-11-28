import { useEffect, useState } from "react";
import { publicationUrl } from "../../core/navigation";
import {
  checkIndex,
  checkSlice,
  sameBinding,
} from "../../core/publication-index";
import type { RecordEntry, Vote } from "../../core/types";

interface ChangeInput {
  memberId: string;
  grade?: string;
  publicationId?: string;
  previousId?: string | null;
  records?: readonly RecordEntry[];
  votes?: readonly Vote[];
}

function evidenceRevised(
  previous: RecordEntry[],
  current: readonly RecordEntry[],
  oldVotes: Vote[],
  newVotes: readonly Vote[],
) {
  const records = new Map(current.map((record) => [record.voteId, record]));
  const before = new Map(oldVotes.map((vote) => [vote.id, vote]));
  const after = new Map(newVotes.map((vote) => [vote.id, vote]));
  return previous.some((old) => {
    const record = records.get(old.voteId);
    return (
      !record ||
      record.outcome !== old.outcome ||
      (record.outcome !== "Not eligible" &&
        record.partyAtVote !== old.partyAtVote) ||
      JSON.stringify(before.get(old.voteId)) !==
        JSON.stringify(after.get(old.voteId))
    );
  });
}

export function usePublicationChange({
  memberId,
  grade,
  publicationId,
  previousId,
  records,
  votes,
}: ChangeInput) {
  const key = JSON.stringify([memberId, publicationId, previousId, grade]);
  const [resolved, setResolved] = useState<{
    key: string;
    type: "grade" | "evidence";
  }>();
  useEffect(() => {
    if (!grade || !publicationId || !previousId) return;
    const controller = new AbortController();
    const load = async () => {
      const prefix = `/scorecard/api/publications/${encodeURIComponent(previousId)}`;
      const response = await fetch(`${prefix}/index`, {
        signal: controller.signal,
      });
      if (!response.ok) return;
      const index = checkIndex(await response.json());
      if (
        index.publication.id !== previousId ||
        !index.scores ||
        index.dataset.demo ||
        /^placeholder-/i.test(previousId) ||
        /^placeholder-/i.test(index.dataset.id)
      )
        return;
      const before = Object.hasOwn(index.scores, memberId)
        ? index.scores[memberId]
        : undefined;
      if (before && before.grade !== grade) return "grade" as const;
      if (before && !records) return;

      // The index omits former members and the member's actual ballots.
      const evidence = await fetch(
        `${prefix}/members/${encodeURIComponent(memberId)}`,
        { signal: controller.signal },
      );
      if (!evidence.ok) return;
      const slice = checkSlice(await evidence.json());
      if (
        !sameBinding(slice.publication, index.publication) ||
        slice.member.id !== memberId ||
        !slice.score
      )
        return;
      if (slice.score.grade !== grade) return "grade" as const;
      if (
        records &&
        votes &&
        evidenceRevised(
          slice.records,
          records.filter((record) => record.memberId === memberId),
          index.dataset.votes,
          votes,
        )
      )
        return "evidence" as const;
    };
    void load()
      .then((type) => {
        if (!controller.signal.aborted)
          setResolved(type ? { key, type } : undefined);
      })
      .catch(() => {
        // Publication differences are optional when the previous snapshot is unavailable.
      });
    return () => controller.abort();
  }, [key, memberId, grade, publicationId, previousId, records, votes]);

  if (!previousId || resolved?.key !== key) return undefined;
  const archive = `/scorecard/archive?${new URLSearchParams({ m: memberId })}#publication-${encodeURIComponent(previousId)}`;
  return {
    type: resolved.type,
    href: publicationUrl(archive, publicationId),
    label:
      resolved.type === "grade"
        ? "Changed since the last publication"
        : "Evidence revised since the last publication",
  };
}
