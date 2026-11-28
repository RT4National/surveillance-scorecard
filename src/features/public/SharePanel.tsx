import { useState } from "react";
import { publicationUrl } from "../../core/navigation";
import {
  frozenShareScore,
  publicationLabel,
  type Publication,
  type PublicationSummary,
} from "../../core/publication";
import type { Member } from "../../core/types";

const xmlText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export function shareCardSvg(name: string, grade: string, publication: string) {
  // One line per field. Keep long names and custom bands inside the image.
  const fit = (text: string, size: number) =>
    Math.min(size, Math.floor(1700 / Math.max(text.length, 1)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#f7f4ed"/>
    <rect width="1200" height="18" fill="#18415d"/>
    <g fill="#18415d" font-family="sans-serif">
      <text x="72" y="150" font-size="32">RESTORE THE FOURTH</text>
      <text x="72" y="280" font-weight="bold" font-size="${fit(name, 72)}">${xmlText(name)}</text>
      <text x="72" y="391" font-weight="bold" font-size="${fit(grade, 62)}">${xmlText(grade)}</text>
      <text x="72" y="527" font-size="30">Surveillance reform scorecard</text>
      <text x="72" y="570" font-size="${fit(publication, 25)}">${xmlText(publication)}</text>
    </g>
  </svg>`;
}

async function downloadCard(name: string, svg: string) {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(image, 0, 0);
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${name}-surveillance-scorecard.png`;
  link.click();
}

export function SharePanel({
  member,
  publication,
  publications,
  copy,
}: {
  member: Member;
  publication?: Publication;
  publications?: PublicationSummary[] | null;
  copy: (text: string) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const score = frozenShareScore(publication, member.id);
  if (!publication || !score) return null;
  const date = publication.createdAt.slice(0, 10);
  const label =
    publicationLabel(publications, publication.id) ?? `Publication ${date}`;
  const path = publicationUrl(
    `/scorecard/members/${encodeURIComponent(member.id)}`,
    publication.id,
  );
  const pinned = new URL(path, location.origin).href;
  const gradeLabel =
    score.value === null ? "Not graded" : `Grade ${score.grade}`;
  const citation = `Restore the Fourth, Surveillance Reform Scorecard. ${member.name}. ${label} (${publication.id}). ${pinned}`;

  return (
    <details className="profile-share">
      <summary>Share this record</summary>
      <div className="public-actions">
        <button
          type="button"
          className="button"
          onClick={() => void copy(pinned)}
        >
          Copy pinned link
        </button>
        <button
          type="button"
          className="button"
          onClick={() => void copy(citation)}
        >
          Copy citation
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setError("");
            void downloadCard(
              member.id,
              shareCardSvg(member.name, gradeLabel, `${label} · ${date}`),
            ).catch(() => setError("Could not download the card."));
          }}
        >
          Download card (PNG)
        </button>
        {member.contactUrl && /^https:\/\//i.test(member.contactUrl) && (
          <a href={member.contactUrl}>Contact this office</a>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
