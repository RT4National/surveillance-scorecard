// Components shared by the scorecard directory (App.tsx) and the member profile.
// Plain helpers live in helpers.ts so this module exports only components (Vite Fast Refresh).
import { useScorecard } from "../../data/context";
import { defaultGradeBands } from "../../core/scoring";
import type { Member } from "../../core/types";
import { notGradedLabel } from "../../core/copy";
import { avatarSrc, gradeTone } from "./helpers";
import { avatarSize } from "../../core/thumbnails";
export function Avatar({
  member,
  large = false,
}: {
  member: Member;
  large?: boolean;
}) {
  if (
    member.portrait?.url.startsWith("/scorecard/portraits/") &&
    member.portrait.reviewedBy &&
    member.portrait.attribution
  )
    return (
      <img
        className={`avatar ${large ? "large" : ""}`}
        // Lists use the small thumbnail; the large profile portrait uses the original.
        src={avatarSrc(member.portrait.url, large)}
        alt=""
        loading="lazy"
        decoding="async"
        {...avatarSize[large ? "large" : "small"]}
        title={member.portrait.attribution}
        // A deploy without the thumbnail still shows the portrait.
        onError={(e) => {
          if (e.currentTarget.getAttribute("src") !== member.portrait!.url)
            e.currentTarget.src = member.portrait!.url;
        }}
      />
    );
  return (
    <span
      aria-hidden="true"
      className={`avatar ${large ? "large" : ""} ${member.party.toLowerCase()}`}
    >
      {member.name
        .split(" ")
        .map((n) => n[0])
        .join("")}
    </span>
  );
}
export function Grade({ member, asOf }: { member: Member; asOf?: string }) {
  const { score, rubric } = useScorecard();
  const s = score(member, asOf);
  return (
    <span
      className={`grade ${gradeTone(s.grade, s.value, rubric.gradeBands ?? defaultGradeBands)}`}
      aria-label={
        s.value === null ? notGradedLabel(rubric.minVotes) : `Grade ${s.grade}`
      }
    >
      {s.grade}
    </span>
  );
}
