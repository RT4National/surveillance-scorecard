// Components shared by the scorecard directory (App.tsx) and the member profile.
// Plain helpers live in helpers.ts so this module exports only components (Vite Fast Refresh).
import { useScorecard } from "../../data/context";
import type { Member } from "../../core/types";
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
        src={member.portrait.url}
        alt=""
        loading="lazy"
        title={member.portrait.attribution}
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
  const { score } = useScorecard();
  const s = score(member, asOf);
  return (
    <span
      className={`grade ${s.value === null ? "unrated" : s.value >= 80 ? "good" : s.value >= 50 ? "mixed" : "poor"}`}
      aria-label={`Grade ${s.grade === "—" ? "not yet rated" : s.grade}`}
    >
      {s.grade}
    </span>
  );
}
