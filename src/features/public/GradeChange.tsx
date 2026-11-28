import { useEffect, useState } from "react";
import { publicationUrl } from "../../core/navigation";
import { checkIndex, checkSlice } from "../../core/publication-index";

export function GradeChange({
  memberId,
  grade,
  publicationId,
  previousId,
}: {
  memberId: string;
  grade: string;
  publicationId: string;
  previousId: string;
}) {
  const [previousGrade, setPreviousGrade] = useState<string>();
  useEffect(() => {
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
      if (Object.hasOwn(index.scores, memberId)) {
        return index.scores[memberId].grade;
      }
      // The index includes active members only. A former member has a separate evidence slice.
      const former = await fetch(
        `${prefix}/members/${encodeURIComponent(memberId)}`,
        { signal: controller.signal },
      );
      if (!former.ok) return;
      const slice = checkSlice(await former.json());
      if (
        slice.publication.id === previousId &&
        slice.publication.digest === index.publication.digest &&
        slice.publication.scoringDigest === index.publication.scoringDigest &&
        slice.member.id === memberId
      )
        return slice.score?.grade;
    };
    void load()
      .then((value) => {
        if (!controller.signal.aborted) setPreviousGrade(value);
      })
      .catch(() => {
        // An unavailable comparison leaves the profile grade usable.
      });
    return () => controller.abort();
  }, [memberId, previousId]);

  if (!previousGrade || previousGrade === grade) return null;
  const archive = `/scorecard/archive?${new URLSearchParams({ m: memberId })}#publication-${encodeURIComponent(previousId)}`;
  return (
    <p>
      <a href={publicationUrl(archive, publicationId)}>
        Changed since the last publication
      </a>
    </p>
  );
}
