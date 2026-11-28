import { useScorecard } from "../../data/context";
import { publicationUrl } from "../../core/navigation";
import { methodologyLinkLabel, updatedLabel } from "../../core/copy";
import { publicationLabel } from "../../core/publication";
import { base } from "./helpers";

/**
 * Site-wide freshness line: publication date, a stable publication label and a
 * methodology link. The label needs the publication list; without it the date stands alone.
 */
export function Freshness() {
  const { publication, publications } = useScorecard();
  if (!publication) return null;
  const label = publicationLabel(publications, publication.id);
  return (
    <div className="freshness">
      <p className="container">
        <span>{updatedLabel(publication.createdAt)}</span>
        {label && <span>{label}</span>}
        <a href={publicationUrl(`${base}/methodology`, publication.id)}>
          {methodologyLinkLabel}
        </a>
      </p>
    </div>
  );
}
