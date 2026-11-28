import { useMemo } from "react";
import { congressLabel } from "../../core/congress";
import {
  alignmentShare,
  congressAlignment,
  congressAlignmentCsv,
  minCongressItems,
} from "../../core/congressTrends";
import { percentLabel } from "../../core/copy";
import type { Publication } from "../../core/publication";

export function CongressTrends({
  publication,
  download,
}: {
  publication?: Publication;
  download: (file: string, body: string, type: string) => void;
}) {
  const rows = useMemo(
    () => (publication ? congressAlignment(publication) : []),
    [publication],
  );
  if (!publication || !rows.length) return null;
  return (
    <section
      className="congress-trends"
      aria-labelledby="congress-trends-title"
    >
      <h2 id="congress-trends-title">Reform alignment by Congress</h2>
      <p>
        Shares count scored actions in the publication. Changes can reflect
        different agendas, turnover in the observed members, and which party
        held the presidency.
      </p>
      <p>
        Each Congress needs at least {minCongressItems} scored items for a
        comparison.
      </p>
      <ol className="series-points">
        {rows.map((row) => (
          <li key={row.congress}>
            <h3>{congressLabel(row.congress)}</h3>
            <p>
              {row.presidents.join(" / ")} White House at recorded actions ·{" "}
              {row.items} scored items
            </p>
            <p>
              {row.participants} members with scored actions
              {row.entered !== null &&
                ` · ${row.entered} new to the sample, ${row.left} absent since the previous Congress`}
            </p>
            {row.sparse ? (
              <p>
                <strong>Too few votes</strong>
              </p>
            ) : (
              (
                [
                  [
                    "Overall",
                    {
                      actions: row.own.actions + row.other.actions,
                      aligned: row.own.aligned + row.other.aligned,
                    },
                  ],
                  ["Own-party president", row.own],
                  ["Other-party president", row.other],
                ] as const
              ).map(([label, counts]) => {
                const percent = alignmentShare(counts);
                return (
                  <div className="series-result" key={label}>
                    <strong>{label}</strong>
                    {" · "}
                    {percent === null
                      ? "No scored actions"
                      : `${percentLabel(percent)} aligned · ${counts.aligned} of ${counts.actions}`}
                    {percent !== null && (
                      <div className="series-track" aria-hidden="true">
                        <div
                          className="motion-fill"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() =>
          download(
            `congress-alignment-${publication.id}.csv`,
            congressAlignmentCsv(rows, publication.id),
            "text/csv;charset=utf-8",
          )
        }
      >
        Download Congress alignment CSV
      </button>
    </section>
  );
}
