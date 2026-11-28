import { useId, useState } from "react";
import {
  memberAction,
  notGradedLabel,
  percentLabel,
  scoredLabel,
} from "../../core/copy";
import { alignmentState } from "../../core/evidence";
import { publicationUrl } from "../../core/navigation";
import {
  membershipSemantics,
  type executeReport,
  type ReportQuery,
} from "../../core/reports";
import type { Party } from "../../core/types";
import { ScopeControls, useReport } from "./reportControls";
import { base, pinnedId, Provenance, type Props } from "./pageShared";
import { splitDisplay, voteCount, type SplitInput } from "./split";
import { EvidenceRow, StateMark } from "./EvidenceRow";
import { Legend } from "./Legend";

function SharedVotes({
  rows,
  publicationId,
}: {
  rows: ReturnType<typeof executeReport>["rows"];
  publicationId?: string;
}) {
  const caption = useId();
  const [first, ...others] = rows;
  const byVote = others.map(
    ({ score }) =>
      new Map(score.evidence.map((entry) => [entry.voteId, entry])),
  );
  const shared = first.score.evidence.flatMap((entry) => {
    if (!byVote.every((entries) => entries.has(entry.voteId))) return [];
    return [[entry, ...byVote.map((entries) => entries.get(entry.voteId)!)]];
  });
  if (!shared.length) return <p>No shared vote records in this scope.</p>;
  return (
    <div
      className="public-table"
      role="region"
      aria-labelledby={caption}
      tabIndex={0}
    >
      <table>
        <caption id={caption}>Shared votes</caption>
        <thead>
          <tr>
            <th scope="col">Vote</th>
            {rows.map(({ member }) => (
              <th scope="col" key={member.id}>
                {member.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shared.map((entries) => (
            <tr key={entries[0].voteId}>
              <th scope="row">
                <a
                  href={publicationUrl(
                    `${base}/legislation/${encodeURIComponent(entries[0].voteId)}`,
                    publicationId,
                  )}
                >
                  {entries[0].vote.title}
                </a>
              </th>
              {entries.map((entry, i) => (
                <td key={rows[i].member.id}>
                  <StateMark state={alignmentState(entry)} />
                  <div>{memberAction(entry.vote, entry.outcome)}</div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Legend />
    </div>
  );
}

/** The own-party / other-party split on a compare card, gated by the scorer's verdict. */
function SplitSummary({ score, party }: { score: SplitInput; party: Party }) {
  const split = splitDisplay(score, party);
  if (split.kind === "not-applicable") return <p>{split.message}</p>;
  if (split.kind === "unproven")
    return (
      <>
        <p>{split.counts}</p>
        <p>{split.message}</p>
      </>
    );
  return (
    <>
      <p>
        Same party: {split.own.percent}% ({voteCount(split.own.count)})
      </p>
      <p>
        Other party: {split.other.percent}% ({voteCount(split.other.count)})
      </p>
    </>
  );
}
export function ComparePage({ dataset, publication }: Props) {
  const options = new Map(
    dataset.members.map((member) => [
      `${member.name} · ${member.state} · ${member.id}`,
      member.id,
    ]),
  );
  const labels = new Map([...options].map(([label, id]) => [id, label]));
  const readSelections = () => {
    const ids = new URLSearchParams(location.search).get("m")?.split(",") ?? [];
    return [...new Set(ids)].slice(0, 3).map((id) => labels.get(id) ?? "");
  };
  const [selections, setSelections] = useState(readSelections);
  const listId = useId();
  const ids = [
    ...new Set(selections.flatMap((label) => options.get(label) ?? [])),
  ];
  const changeSelection = (slot: number, value: string) => {
    const next = [0, 1, 2].map((i) =>
      i === slot ? value : (selections[i] ?? ""),
    );
    setSelections(next);
    const selected = [
      ...new Set(next.flatMap((label) => options.get(label) ?? [])),
    ];
    const url = new URL(location.href);
    if (selected.length) url.searchParams.set("m", selected.join(","));
    else url.searchParams.delete("m");
    if (url.href !== location.href)
      history.replaceState(history.state, "", url);
  };
  const [q, setQ] = useState<ReportQuery>({ kind: "ranking" });
  const { result, error } = useReport(
    dataset,
    {
      ...q,
      memberIds: ids.filter(Boolean),
      status: "all",
    },
    true,
  );
  return (
    <section className="public-page">
      <h1>Compare reform records</h1>
      <Provenance dataset={dataset} publication={publication} />
      <p>
        Comparison scores are recomputed from the selected evidence scope using
        the publication rubric. These are research results, not frozen official
        publication grades. {membershipSemantics}
      </p>
      <div className="public-controls">
        {[0, 1, 2].map((i) => (
          <label key={i}>
            Member {i + 1}
            <input
              type="search"
              list={listId}
              value={selections[i] ?? ""}
              onChange={(event) => changeSelection(i, event.target.value)}
            />
          </label>
        ))}
      </div>
      <datalist id={listId}>
        {[...options.keys()].map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      {ids.length === 0 ? (
        <p>Choose members to compare their records.</p>
      ) : (
        <>
          <ScopeControls dataset={dataset} value={q} onChange={setQ} />
          {error && <p role="alert">{error}</p>}
          <p>
            Unequal voting opportunities and different issue mixes can affect
            comparisons. Missing evidence never counts as opposition. Select one
            issue to make administration comparisons more meaningful.
          </p>
          <div className="public-grid">
            {result?.rows.map(({ member, score }) => (
              <article key={member.id}>
                <h2>{member.name}</h2>
                <p>
                  Current party: {member.party} · {member.state}
                </p>
                <strong className="public-score">
                  {score.value === null
                    ? notGradedLabel(dataset.rubric.minVotes)
                    : `${score.grade} · ${percentLabel(score.value)}`}
                </strong>
                <p>
                  {scoredLabel(score, dataset.votes)} · minimum{" "}
                  {dataset.rubric.minVotes}
                </p>
                <p>{score.reason}</p>
                {score.topicCoverageWarning && (
                  <p>{score.topicCoverageWarning}</p>
                )}
                <SplitSummary score={score} party={member.party} />
                <details>
                  <summary>Inspect evidence</summary>
                  {score.evidence.map((e) => (
                    <EvidenceRow
                      key={e.voteId}
                      entry={e}
                      publicationId={pinnedId(publication)}
                    />
                  ))}
                  <Legend />
                </details>
              </article>
            ))}
          </div>
          {result && result.rows.length > 1 && (
            <SharedVotes
              rows={result.rows}
              publicationId={pinnedId(publication)}
            />
          )}
        </>
      )}
    </section>
  );
}
