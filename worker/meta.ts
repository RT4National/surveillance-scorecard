import { frozenShareScore, type Publication } from "../src/core/publication";
import type { Member } from "../src/core/types";

const gradeImages = new Map([
  ["A+", "a-plus"],
  ["A", "a"],
  ["B", "b"],
  ["C", "c"],
  ["D", "d"],
  ["F", "f"],
]);

export function memberShareMeta(
  publication: Publication | null,
  member: Member,
  url: URL,
) {
  const score = frozenShareScore(publication, member.id);
  if (!publication || !score) return undefined;
  const grade = score.value === null ? null : score.grade;
  const imageName = (grade && gradeImages.get(grade)) || "generic";
  const date = publication.createdAt.slice(0, 10);
  return {
    title: `${member.name}: ${grade ? `${grade} on surveillance reform` : "Not graded on surveillance reform"} (Restore the Fourth, ${date})`,
    image: new URL(`/scorecard/share/${imageName}.png`, url).href,
    imageAlt:
      imageName === "generic"
        ? "Restore the Fourth Surveillance Reform Scorecard"
        : `Restore the Fourth Surveillance Reform Scorecard, grade ${grade}`,
  };
}
