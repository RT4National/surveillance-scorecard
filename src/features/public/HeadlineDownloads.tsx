import { canShowPublicationTrends } from "../../core/seriesTrends";
import {
  canDownloadPublication,
  exportAttribution,
  recordCsv,
  recordExport,
  scoreCsv,
} from "../../core/dataExports";
import type { Publication } from "../../core/publication";
import { save } from "./download";

export function HeadlineDownloads({
  publication,
}: {
  publication?: Publication;
}) {
  if (!canShowPublicationTrends(publication)) return null;
  if (!canDownloadPublication(publication))
    return (
      <p>
        Publication downloads become available after the data reuse licence is
        confirmed.
      </p>
    );
  const origin = location.origin;
  const evidence = () => recordCsv(recordExport(publication, origin));
  const meta = exportAttribution(
    publication.dataset,
    publication.id,
    origin,
    undefined,
    publication.createdAt,
  );
  return (
    <section aria-label="Publication downloads">
      <h2>Download this publication</h2>
      <div className="public-actions">
        <a
          href={`/scorecard/api/publications/${encodeURIComponent(publication.id)}`}
          download={`scorecard-${publication.id}.json`}
        >
          Full publication (JSON)
        </a>
        <button
          type="button"
          onClick={() =>
            save(
              "member-scores.csv",
              scoreCsv(publication, origin),
              "text/csv;charset=utf-8",
            )
          }
        >
          Member score sheet (CSV)
        </button>
        <button
          type="button"
          onClick={() =>
            save("all-records.csv", evidence(), "text/csv;charset=utf-8")
          }
        >
          All records (CSV)
        </button>
      </div>
      <p>
        Data licence · <a href={meta.licenceUrl!}>{meta.licence}</a>
      </p>
      <p>{meta.citation}</p>
    </section>
  );
}
