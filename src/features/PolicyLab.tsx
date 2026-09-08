import { useMemo, useState } from "react";
import type { Dataset } from "../core/publication";
import {
  defaultGradeBands,
  groupLabels,
  scoreMember,
  validateRubric,
} from "../core/scoring";
import type { Rubric } from "../core/types";

export function PolicyLab({ dataset }: { dataset: Dataset }) {
  const [proposal, setProposal] = useState<Rubric>(dataset.rubric);
  const [bands, setBands] = useState(
    JSON.stringify(dataset.rubric.gradeBands ?? defaultGradeBands, null, 2),
  );
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(dataset.members[0]?.id ?? "");
  const comparison = useMemo(
    () =>
      dataset.members.map((member) => ({
        member,
        before: scoreMember(
          member,
          dataset.votes,
          dataset.records,
          dataset.rubric,
          dataset.asOf,
        ),
        after: scoreMember(
          member,
          dataset.votes,
          dataset.records,
          proposal,
          dataset.asOf,
        ),
      })),
    [dataset, proposal],
  );
  const current = comparison.find((r) => r.member.id === selected);
  function update(change: Partial<Rubric>) {
    const next = { ...proposal, ...change };
    try {
      validateRubric(next);
      setProposal(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid policy");
    }
  }
  const changes = comparison.filter(
    (r) => r.before.grade !== r.after.grade || r.before.group !== r.after.group,
  );
  const labels = proposal.gradeBands ?? defaultGradeBands;
  return (
    <section className="container inner-page">
      <div className="eyebrow">AN OPEN METHODOLOGY</div>
      <h1>
        Every grade.
        <br />
        <em>Every assumption.</em>
      </h1>
      <p className="page-intro">
        Published rubric {dataset.rubric.version} · evidence through{" "}
        {dataset.asOf}. The lab below is a local simulation; publishing requires
        staff review.
      </p>
      <div className="method-layout">
        <div>
          <div className="panel">
            <h2>What the published score measures</h2>
            <p>
              Reform-aligned weighted votes divided by the weight of all scored
              votes cast, multiplied by 100. Abstentions and ineligible votes
              are excluded. Co-sponsorship is not counted as a vote.
            </p>
            <p>
              At least {dataset.rubric.minVotes} cast votes are required for a
              grade. Consistency requires {dataset.rubric.minPerContext} votes
              in each presidential party context, with{" "}
              {dataset.rubric.consistencyThreshold}% alignment in each for a
              reformer and at most {100 - dataset.rubric.consistencyThreshold}%
              in each for a surveillance supporter.
            </p>
            <p>
              Independent members need an approved party-alignment policy before
              an own-party record can be established. A mixed record alone does
              not demonstrate a partisan motive.
            </p>
            <p>
              Scoring window:{" "}
              {dataset.rubric.lookbackYears
                ? `${dataset.rubric.lookbackYears} years`
                : "all available history"}
              . Recency weighting:{" "}
              {dataset.rubric.halfLifeYears
                ? `${dataset.rubric.halfLifeYears}-year half-life`
                : "none"}
              . Required shared topics: {dataset.rubric.minSharedTopics ?? 0}.
            </p>
          </div>
          <div className="panel">
            <h2>Inspect a member’s calculation</h2>
            <label className="policy-field">
              Member
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {dataset.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            {current && (
              <>
                <div className="context-grid">
                  <div>
                    <span>Published policy</span>
                    <strong>{current.before.grade}</strong>
                    <small>{groupLabels[current.before.group]}</small>
                  </div>
                  <div>
                    <span>Proposed policy</span>
                    <strong>{current.after.grade}</strong>
                    <small>{groupLabels[current.after.group]}</small>
                  </div>
                </div>
                <p>
                  {current.after.earned.toFixed(2)} aligned weight ÷{" "}
                  {current.after.possible.toFixed(2)} cast weight × 100 ={" "}
                  {current.after.value === null
                    ? "insufficient evidence"
                    : `${current.after.value.toFixed(2)}%`}
                  . {current.after.counted} scored votes.
                </p>
                <p>
                  {current.after.reason}. {current.after.topicCoverageWarning}
                </p>
                <div className="table-scroll">
                  <table className="member-table">
                    <thead>
                      <tr>
                        <th>Evidence</th>
                        <th>Base weight</th>
                        <th>Effective weight</th>
                        <th>Included?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.after.evidence.map((e) => (
                        <tr key={e.voteId}>
                          <td>{e.vote.title}</td>
                          <td>{e.vote.weight}</td>
                          <td>{e.effectiveWeight.toFixed(3)}</td>
                          <td>
                            {e.scored
                              ? "Yes"
                              : !e.inWindow
                                ? "Outside window"
                                : e.outcome}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <div className="panel">
            <h2>See the impact before publishing</h2>
            <p>
              {changes.length} of {comparison.length} members would change grade
              or consistency category under this proposal. This is a preview,
              not a publication.
            </p>
            <div className="grade-key">
              {labels.map((b) => (
                <div key={b.label}>
                  <strong>{b.label}</strong>
                  <small>
                    {comparison.filter((r) => r.after.grade === b.label).length}{" "}
                    members
                  </small>
                </div>
              ))}
              <div>
                <strong>—</strong>
                <small>
                  {comparison.filter((r) => r.after.value === null).length}{" "}
                  unrated
                </small>
              </div>
            </div>
            <div className="table-scroll">
              <table className="member-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Grade change</th>
                    <th>Category change</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((r) => (
                    <tr key={r.member.id}>
                      <td>{r.member.name}</td>
                      <td>
                        {r.before.grade} → {r.after.grade}
                      </td>
                      <td>
                        {groupLabels[r.before.group]} →{" "}
                        {groupLabels[r.after.group]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel" id="sources">
            <h2>Sources, corrections and reuse</h2>
            <p>
              {dataset.demo
                ? "This dataset is fictional."
                : "Each published observation carries a source and a reviewable interpretation."}{" "}
              {dataset.coverage.join(" ")}
            </p>
            <p>
              Congress.gov is the primary source; official House Clerk and
              Senate roll calls supplement individual voting records. Portraits
              need their own reviewed license and attribution. Historical
              publications are immutable; corrections create a new version.
            </p>
            <ul>
              {dataset.sources.map((s) => (
                <li key={s.sha256 + s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.kind} source
                  </a>{" "}
                  · retrieved {s.retrievedAt}
                </li>
              ))}
            </ul>
            <p>
              Original project:{" "}
              <a href="https://github.com/RT4National/DecideTheFuture">
                DecideTheFuture
              </a>
              . Code reuse is authorized by the project owner. The requested
              content license is interpreted as CC BY 4.0 pending confirmation;
              source and portrait terms remain separate.
            </p>
          </div>
        </div>
        <aside>
          <div className="panel rubric-lab">
            <div className="eyebrow">RUBRIC LAB</div>
            <h2>Test an explicit policy.</h2>
            <label className="policy-field">
              Version
              <input
                value={proposal.version}
                onChange={(e) => update({ version: e.target.value })}
              />
            </label>
            <label className="policy-field">
              Minimum cast votes
              <input
                type="number"
                min="1"
                max="100"
                value={proposal.minVotes}
                onChange={(e) => update({ minVotes: Number(e.target.value) })}
              />
            </label>
            <label className="policy-field">
              Minimum votes per party context
              <input
                type="number"
                min="1"
                max="100"
                value={proposal.minPerContext}
                onChange={(e) =>
                  update({ minPerContext: Number(e.target.value) })
                }
              />
            </label>
            <label className="policy-field">
              Reformer consistency threshold (%)
              <input
                type="number"
                min="51"
                max="100"
                value={proposal.consistencyThreshold}
                onChange={(e) =>
                  update({ consistencyThreshold: Number(e.target.value) })
                }
              />
            </label>
            <label className="policy-field">
              Lookback years (blank = all)
              <input
                type="number"
                min="1"
                value={proposal.lookbackYears ?? ""}
                onChange={(e) =>
                  update({
                    lookbackYears: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            <label className="policy-field">
              Recency half-life years (blank = none)
              <input
                type="number"
                min="1"
                value={proposal.halfLifeYears ?? ""}
                onChange={(e) =>
                  update({
                    halfLifeYears: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
            </label>
            <label className="policy-field">
              Minimum shared issue topics
              <input
                type="number"
                min="0"
                value={proposal.minSharedTopics ?? 0}
                onChange={(e) =>
                  update({ minSharedTopics: Number(e.target.value) })
                }
              />
            </label>
            <label className="policy-field">
              Grade bands (descending JSON)
              <textarea
                rows={10}
                value={bands}
                onChange={(e) => setBands(e.target.value)}
              />
            </label>
            <button
              className="button"
              onClick={() => {
                try {
                  const parsed = JSON.parse(bands);
                  if (!Array.isArray(parsed))
                    throw Error("Grade bands must be an array");
                  update({ gradeBands: parsed });
                } catch {
                  setError("Grade bands must be valid JSON.");
                }
              }}
            >
              Apply grade bands
            </button>
            <p role="alert">{error}</p>
            <button
              className="button"
              onClick={() => {
                setProposal(dataset.rubric);
                setBands(
                  JSON.stringify(
                    dataset.rubric.gradeBands ?? defaultGradeBands,
                    null,
                    2,
                  ),
                );
                setError("");
              }}
            >
              Reset to published policy
            </button>
            <p className="footnote">
              Changing this lab never alters published grades. Staff can apply
              the same settings to a reviewed draft.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
