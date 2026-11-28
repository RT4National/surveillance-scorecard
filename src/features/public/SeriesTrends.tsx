import { useState } from "react";
import { percentLabel } from "../../core/copy";
import { publicationUrl } from "../../core/navigation";
import type { ReformCounts, SeriesTrend } from "../../core/seriesTrends";
import { useSeenOnce } from "./motion";

function ResultBar({
  counts,
  party,
}: {
  counts: ReformCounts;
  party?: string;
}) {
  const value = counts.cast ? (100 * counts.forReform) / counts.cast : null;
  return (
    <div className="series-result">
      <div>
        {party && <strong>{party} · </strong>}
        {value === null
          ? "No ballots cast"
          : `${percentLabel(value)} for reform · ${counts.forReform} of ${counts.cast} ballots`}
      </div>
      {value !== null && (
        <div className="series-track" aria-hidden="true">
          <div className="motion-fill" style={{ width: `${value}%` }} />
        </div>
      )}
      {party && <small>{counts.didNotVote} did not vote</small>}
    </div>
  );
}

export function SeriesTrends({
  series,
  publicationId,
}: {
  series: SeriesTrend[];
  publicationId?: string;
}) {
  const [split, setSplit] = useState(false);
  const [ref, seen] = useSeenOnce<HTMLElement>();
  if (!series.length) return null;
  return (
    <section
      ref={ref}
      className={`container series-trends${seen ? " motion-grow-x" : ""}`}
      aria-labelledby="series-trends-title"
    >
      <div className="series-heading">
        <h2 id="series-trends-title">
          How Congress voted on repeated reform questions
        </h2>
        <label>
          <input
            type="checkbox"
            checked={split}
            onChange={(event) => setSplit(event.target.checked)}
          />{" "}
          Split by party
        </label>
      </div>
      {series.map((item) => (
        <section key={item.id}>
          <h3>
            {item.name} · {item.chamber}
          </h3>
          <p>{item.rationale}</p>
          <ol className="series-points">
            {item.points.map((point) => (
              <li key={point.voteId}>
                <a
                  href={publicationUrl(
                    `/scorecard/legislation/${encodeURIComponent(point.voteId)}`,
                    publicationId,
                  )}
                >
                  {point.date.slice(0, 4)} · {point.bill} · {point.title}
                </a>
                <p>{point.presidentParty} White House</p>
                {split ? (
                  Object.entries(point.byParty)
                    .filter(([, counts]) => counts.cast || counts.didNotVote)
                    .map(([party, counts]) => (
                      <ResultBar key={party} party={party} counts={counts} />
                    ))
                ) : (
                  <ResultBar counts={point.total} />
                )}
                {split && !point.total.cast && !point.total.didNotVote && (
                  <p>No ballots recorded.</p>
                )}
                <small>
                  {point.total.didNotVote} did not vote · {point.notInOffice}{" "}
                  not in office
                </small>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
