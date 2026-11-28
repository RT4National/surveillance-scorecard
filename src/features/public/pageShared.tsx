import type { Dataset, Publication } from "../../core/publication";
import { bannerCopy, fictional } from "../../core/copy";
import { publicationUrl } from "../../core/navigation";

export type Props = { dataset: Dataset; publication?: Publication };
export const base = "/scorecard";
/**
 * The publication links carry: the one named in the URL, if any. The latest publication is
 * never added to links (clean URLs); the loaded `publication.id` still goes into exports.
 */
export function pinnedId(_publication?: Publication) {
  return new URLSearchParams(location.search).get("publication") ?? undefined;
}
export function publicUrl(path: string, publication?: Publication) {
  return publicationUrl(path, pinnedId(publication));
}
export function Provenance({ dataset, publication }: Props) {
  return (
    <aside className="public-provenance">
      {dataset.demo && (
        <strong>
          {fictional(dataset)
            ? bannerCopy.fictional
            : bannerCopy.placeholder}{" "}
        </strong>
      )}
      Dataset {dataset.id} · As of {dataset.asOf} · Rubric{" "}
      {dataset.rubric.version} ·{" "}
      {publication ? `Publication ${publication.id}` : "Unpublished preview"}
      {dataset.coverage.map((c, i) => (
        <p key={i}>{c}</p>
      ))}
    </aside>
  );
}
export function Source({ url }: { url: string | null }) {
  return url && /^https?:\/\//.test(url) ? (
    <a href={url} target="_blank" rel="noreferrer">
      Original source ↗
    </a>
  ) : (
    <span>Source unavailable{url ? " (invalid URL)" : ""}</span>
  );
}
