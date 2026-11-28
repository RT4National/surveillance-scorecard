import { useScorecard } from "../../data/context";
import { publicationUrl } from "../../core/navigation";
import { methodologyLinkLabel, shortDate, updatedLabel } from "../../core/copy";
import { publicationLabel } from "../../core/publication";
import { base } from "./helpers";

/**
 * Site-wide freshness line: publication date, a stable publication label and a
 * methodology link. The label needs the publication list; without it the date stands alone.
 */
export function Freshness() {
  const { publication, publications, linkId, currentPublicationId } =
    useScorecard();
  if (!publication) return null;
  const label = publicationLabel(publications, publication.id);
  const current =
    linkId && currentPublicationId !== publication.id
      ? currentPublicationId
      : undefined;
  const currentLabel = current ? publicationLabel(publications, current) : null;
  return (
    <div className="freshness">
      <p className="container">
        <span>{updatedLabel(publication.createdAt)}</span>
        {label && <span>{label}</span>}
        <a href={publicationUrl(`${base}/methodology`, linkId)}>
          {methodologyLinkLabel}
        </a>
      </p>
      {current && (
        <p className="container freshness-notice">
          <span>
            You are viewing {label ?? publication.id} (
            {shortDate(publication.createdAt)}).{" "}
            {currentLabel
              ? `${currentLabel} is current.`
              : "The live publication is different."}
          </span>
          <a href={publicationUrl(`${base}/`, current)}>
            View current publication
          </a>
          <a
            href={publicationUrl(
              `${base}/archive#publication-${encodeURIComponent(publication.id)}`,
              current,
            )}
          >
            See what changed
          </a>
        </p>
      )}
    </div>
  );
}
