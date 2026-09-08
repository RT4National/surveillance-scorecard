import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, Publication } from "../../core/publication";
import type { Outcome } from "../../core/types";
import {
  executeReport,
  publicationChanges,
  reportCsv,
  reportSvg,
  reportTsv,
  decodeVoteId,
  findStateRepresentatives,
  loadArchivedPublication,
  membershipSemantics,
  validateReportQuery,
  type ReportQuery,
} from "../../core/reports";
import "./public.css";

type Props = { dataset: Dataset; publication?: Publication };
const base = "/scorecard";
function publicUrl(path: string, publication?: Publication) {
  const id =
    publication?.id ?? new URLSearchParams(location.search).get("publication");
  return path + (id ? `?publication=${encodeURIComponent(id)}` : "");
}
function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Provenance({ dataset, publication }: Props) {
  return (
    <aside className="public-provenance">
      {dataset.demo && (
        <strong>Fictional demo — not actual congressional records. </strong>
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
function Source({ url }: { url: string | null }) {
  return url && /^https?:\/\//.test(url) ? (
    <a href={url} target="_blank" rel="noreferrer">
      Original source ↗
    </a>
  ) : (
    <span>Source unavailable{url ? " (invalid URL)" : ""}</span>
  );
}
export function LegislationPage({
  dataset,
  publication,
  voteId,
}: Props & { voteId?: string }) {
  const [topic, setTopic] = useState("");
  const decodedVoteId = decodeVoteId(voteId);
  const vote = dataset.votes.find((v) => v.id === decodedVoteId);
  if (voteId && !vote)
    return (
      <section className="public-page">
        <h1>Vote not found</h1>
        <a href={publicUrl(`${base}/legislation`, publication)}>
          View legislation
        </a>
      </section>
    );
  return (
    <section className="public-page">
      <h1>{vote ? vote.bill : "Legislation & votes"}</h1>
      <Provenance dataset={dataset} publication={publication} />
      {vote ? (
        <>
          <h2>{vote.title}</h2>
          <p>
            {vote.date} · {vote.chamber} · {vote.topic}
          </p>
          <p>
            <strong>
              Reform position: {vote.reformVote} · Weight: {vote.weight}
            </strong>
          </p>
          <p>{vote.rationale}</p>
          <Source url={vote.source} />
          <h2>Party breakdown at the time of the vote</h2>
          <div className="public-table">
            <table>
              <thead>
                <tr>
                  <th>Party</th>
                  {["Yes", "No", "Not voting", "Not eligible"].map((o) => (
                    <th key={o}>{o}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["Democratic", "Republican", "Independent"].map((p) => (
                  <tr key={p}>
                    <th>{p}</th>
                    {["Yes", "No", "Not voting", "Not eligible"].map((o) => (
                      <td key={o}>
                        {
                          dataset.records.filter(
                            (r) =>
                              r.voteId === vote.id &&
                              r.partyAtVote === p &&
                              r.outcome === o,
                          ).length
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Recorded roll call</h2>
          <p>Missing records are unknown, not inferred absences.</p>
          <div className="public-table">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Party at vote</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {dataset.records
                  .filter((r) => r.voteId === vote.id)
                  .map((r) => (
                    <tr key={r.memberId}>
                      <td>
                        <a
                          href={publicUrl(
                            `${base}/members/${encodeURIComponent(r.memberId)}`,
                            publication,
                          )}
                        >
                          {dataset.members.find((m) => m.id === r.memberId)
                            ?.name ?? r.memberId}
                        </a>
                      </td>
                      <td>{r.partyAtVote}</td>
                      <td>{r.outcome}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <CorrectionForm
            dataset={dataset}
            publication={publication}
            voteId={vote.id}
          />
        </>
      ) : (
        <>
          <label>
            Issue{" "}
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">All issues</option>
              {[...new Set(dataset.votes.map((v) => v.topic))].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <div className="public-grid">
            {dataset.votes
              .filter((v) => !topic || v.topic === topic)
              .map((v) => (
                <article key={v.id}>
                  <small>
                    {v.date} · {v.topic}
                  </small>
                  <h2>
                    <a
                      href={publicUrl(
                        `${base}/legislation/${encodeURIComponent(v.id)}`,
                        publication,
                      )}
                    >
                      {v.bill}: {v.title}
                    </a>
                  </h2>
                  <p>{v.rationale}</p>
                  <p>Reform position: {v.reformVote}</p>
                  <Source url={v.source} />
                </article>
              ))}
          </div>
        </>
      )}
    </section>
  );
}
function ScopeControls({
  dataset,
  value,
  onChange,
}: {
  dataset: Dataset;
  value: ReportQuery;
  onChange: (q: ReportQuery) => void;
}) {
  return (
    <div className="public-controls">
      <label>
        Issue
        <select
          value={value.topic ?? ""}
          onChange={(e) =>
            onChange({ ...value, topic: e.target.value || undefined })
          }
        >
          <option value="">All issues</option>
          {[...new Set(dataset.votes.map((v) => v.topic))].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        From
        <input
          type="date"
          value={value.from ?? ""}
          onChange={(e) =>
            onChange({ ...value, from: e.target.value || undefined })
          }
        />
      </label>
      <label>
        Through
        <input
          type="date"
          value={value.to ?? ""}
          max={dataset.asOf}
          onChange={(e) =>
            onChange({ ...value, to: e.target.value || undefined })
          }
        />
      </label>
      <label>
        Presidential party context
        <select
          value={value.context ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              context: (e.target.value || undefined) as ReportQuery["context"],
            })
          }
        >
          <option value="">Both contexts</option>
          <option value="same">Same as party at vote</option>
          <option value="opposing">Different from party at vote</option>
        </select>
      </label>
    </div>
  );
}
function useReport(
  dataset: Dataset,
  query: ReportQuery,
  includeUnrated = false,
) {
  return useMemo(() => {
    try {
      return {
        result: executeReport(dataset, query, { includeUnrated }),
        error: "",
      };
    } catch (e) {
      return { result: null, error: String((e as Error).message) };
    }
  }, [dataset, query, includeUnrated]);
}
export function ComparePage({ dataset, publication }: Props) {
  const [ids, setIds] = useState<string[]>(
    dataset.members.slice(0, 2).map((m) => m.id),
  );
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
            <select
              value={ids[i] ?? ""}
              onChange={(e) =>
                setIds((old) => {
                  const next = [...old];
                  next[i] = e.target.value;
                  return next;
                })
              }
            >
              <option value="">Select a member</option>
              {dataset.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
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
                ? "Insufficient evidence"
                : `${score.grade} · ${Math.round(score.value)}%`}
            </strong>
            <p>
              {score.counted} scored votes · minimum {dataset.rubric.minVotes}
            </p>
            <p>{score.reason}</p>
            {score.topicCoverageWarning && <p>{score.topicCoverageWarning}</p>}
            <p>
              Same party:{" "}
              {score.ownScore === null
                ? "No scored evidence"
                : `${Math.round(score.ownScore)}%`}{" "}
              ({score.ownCount} votes)
            </p>
            <p>
              Other party:{" "}
              {score.otherScore === null
                ? "No scored evidence"
                : `${Math.round(score.otherScore)}%`}{" "}
              ({score.otherCount} votes)
            </p>
            <details>
              <summary>Inspect evidence</summary>
              {score.evidence.map((e) => (
                <p key={e.voteId}>
                  <a
                    href={publicUrl(
                      `${base}/legislation/${encodeURIComponent(e.voteId)}`,
                      publication,
                    )}
                  >
                    {e.vote.bill}
                  </a>
                  : {e.outcome} · {e.vote.topic}
                  {!e.inWindow ? " · Outside rubric time window" : ""}
                </p>
              ))}
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
export function RepresentativeFinder({ dataset }: { dataset: Dataset }) {
  const [state, setState] = useState("");
  return (
    <section className="public-page">
      <h2>Find representatives by state</h2>
      <p>
        No address required. House seats are listed by district; state selection
        does not identify your district.
      </p>
      <label>
        State
        <select value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Choose a state</option>
          {[...new Set(dataset.members.map((m) => m.state))].sort().map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {state && (
        <ul>
          {findStateRepresentatives(dataset, state).map((m) => (
            <li key={m.id}>
              <a
                href={publicUrl(`${base}/members/${encodeURIComponent(m.id)}`)}
              >
                {m.name}
              </a>{" "}
              — {m.chamber}
              {m.district !== undefined ? `, district ${m.district}` : ""}
            </li>
          ))}
        </ul>
      )}
      {state && !findStateRepresentatives(dataset, state).length && (
        <p>
          No active representatives for this state are included in this
          publication. Check the coverage notes before interpreting missing
          results.
        </p>
      )}
      <p>
        Member status reflects dataset {dataset.id} as of {dataset.asOf}.
      </p>
      {dataset.demo && <p>Fictional demo members only.</p>}
    </section>
  );
}
export function CorrectionForm({
  dataset,
  publication,
  memberId,
  voteId,
}: Props & { memberId?: string; voteId?: string }) {
  const [message, setMessage] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="public-correction"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!publication) return;
        setBusy(true);
        setStatus("");
        try {
          const r = await fetch(`${base}/api/corrections`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              publicationId: publication.id,
              memberId,
              voteId,
              message,
            }),
          });
          if (!r.ok)
            throw new Error(
              `Submission failed (${r.status}). Please try again later.`,
            );
          const body = (await r.json()) as { id: string };
          setStatus(`Correction received: ${body.id}`);
          setMessage("");
        } catch (e) {
          setStatus((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>Report an evidence error</h3>
      <p>
        Reference: {voteId ?? memberId ?? dataset.id}. Include the correction
        and a public source; please omit personal information.
      </p>
      <label>
        Correction
        <textarea
          required
          minLength={10}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <button disabled={!publication || dataset.demo || busy}>
        {busy ? "Submitting…" : "Submit correction"}
      </button>
      {(!publication || dataset.demo) && (
        <p>Corrections open when verified evidence is published.</p>
      )}
      <p role="status">{status}</p>
    </form>
  );
}
export function ReportsPage({ dataset, publication }: Props) {
  const [initialError] = useState(() => {
    try {
      const raw = new URLSearchParams(location.search).get("query");
      if (raw) validateReportQuery(JSON.parse(raw), dataset);
      return "";
    } catch (e) {
      return `Saved query rejected: ${(e as Error).message}`;
    }
  });
  const [q, setQ] = useState<ReportQuery>(() => {
    try {
      const raw = new URLSearchParams(location.search).get("query");
      return raw
        ? validateReportQuery(JSON.parse(raw), dataset)
        : { kind: "ranking" };
    } catch {
      return { kind: "ranking" };
    }
  });
  const [question, setQuestion] = useState(""),
    [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState(initialError);
  const { result, error } = useReport(dataset, q);
  const pinned = new URLSearchParams(location.search).get("publication");
  if (initialError)
    return (
      <section className="public-page">
        <h1>Saved query rejected</h1>
        <p role="alert">{initialError}</p>
        <a href={publicUrl(`${base}/reports`, publication)}>
          Start a new report
        </a>
      </section>
    );
  if (pinned && publication?.id !== pinned)
    return (
      <section className="public-page">
        <h1>Saved report unavailable</h1>
        <p>
          This report requires publication {pinned}. It cannot be reproduced
          with the currently loaded dataset.
        </p>
        <a href={`${base}/archives`}>Browse published archives</a>
      </section>
    );
  return (
    <section className="public-page">
      <h1>Reproducible research</h1>
      <Provenance dataset={dataset} publication={publication} />
      <p>
        Run exact vote intersections or scoped rankings. Questions must be
        answerable from published votes and filters. Rankings omit members with
        insufficient evidence.
      </p>
      <p>
        Research scores are recomputed from the selected evidence scope using
        the current scoring engine and the publication rubric; they are not
        frozen official publication grades.
      </p>
      <div className="public-actions">
        <button onClick={() => setQ({ kind: "ranking", status: "active" })}>
          Active member score sheet
        </button>
        <button
          onClick={() =>
            setQ({
              kind: "ranking",
              status: "active",
              parties: ["Democratic", "Republican"],
              perParty: true,
              limit: 10,
            })
          }
        >
          Top 10 in each major party
        </button>
      </div>
      <form
        className="public-controls"
        onSubmit={async (e) => {
          e.preventDefault();
          setAsking(true);
          setNotice("");
          try {
            const response = await fetch(`${base}/api/research`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                question,
                publicationId: publication?.id,
              }),
            });
            const body = (await response.json()) as {
              query?: unknown;
              publicationId?: string;
              error?: string;
            };
            if (!response.ok)
              throw new Error(
                body.error ?? `Research unavailable (${response.status})`,
              );
            if (body.publicationId !== publication?.id)
              throw new Error(
                "Research response does not match the loaded publication",
              );
            const interpreted = validateReportQuery(body.query, dataset);
            setQ(interpreted);
            setNotice(
              "Interpreted question shown in Exact query below. Verify the filters before using the results.",
            );
          } catch (e) {
            setNotice((e as Error).message);
          } finally {
            setAsking(false);
          }
        }}
      >
        <label>
          Ask about published evidence
          <input
            required
            maxLength={1000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Top 10 reformers in each party"
          />
        </label>
        <button disabled={asking || !publication || dataset.demo}>
          {asking ? "Interpreting…" : "Interpret question"}
        </button>
      </form>
      {(!publication || dataset.demo) && (
        <p>
          Natural-language research requires a verified publication and a
          configured AI service. The structured builder works below.
        </p>
      )}
      <label>
        Report type
        <select
          value={q.kind}
          onChange={(e) =>
            setQ({
              ...q,
              kind: e.target.value as ReportQuery["kind"],
              conditions:
                e.target.value === "intersection"
                  ? [{ voteId: dataset.votes[0]?.id ?? "", outcome: "Yes" }]
                  : undefined,
            })
          }
        >
          <option value="ranking">Rank reform alignment</option>
          <option value="intersection">Match all vote conditions</option>
        </select>
      </label>
      <ScopeControls dataset={dataset} value={q} onChange={setQ} />
      <p>{membershipSemantics}</p>
      <div className="public-controls">
        <label>
          Current party
          <select
            value={
              q.parties?.length === 1
                ? q.parties[0]
                : q.parties?.length === 2
                  ? "major"
                  : ""
            }
            onChange={(e) =>
              setQ({
                ...q,
                parties:
                  e.target.value === "major"
                    ? ["Democratic", "Republican"]
                    : e.target.value
                      ? [
                          e.target.value as NonNullable<
                            ReportQuery["parties"]
                          >[number],
                        ]
                      : undefined,
              })
            }
          >
            <option value="">All parties</option>
            <option value="major">Democratic and Republican</option>
            {["Democratic", "Republican", "Independent"].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Current member status
          <select
            value={q.status ?? "active"}
            onChange={(e) =>
              setQ({ ...q, status: e.target.value as ReportQuery["status"] })
            }
          >
            {["active", "inactive", "deceased", "all"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Current chamber
          <select
            value={q.chamber ?? ""}
            onChange={(e) =>
              setQ({
                ...q,
                chamber: (e.target.value ||
                  undefined) as ReportQuery["chamber"],
              })
            }
          >
            <option value="">Both chambers</option>
            <option>House</option>
            <option>Senate</option>
          </select>
        </label>
        <label>
          Maximum results
          <input
            type="number"
            min={1}
            max={1000}
            value={q.limit ?? 1000}
            onChange={(e) => setQ({ ...q, limit: Number(e.target.value) })}
          />
        </label>
        <label>
          Apply limit
          <select
            value={q.perParty ? "party" : "overall"}
            onChange={(e) =>
              setQ({ ...q, perParty: e.target.value === "party" })
            }
          >
            <option value="overall">Overall</option>
            <option value="party">Per current party</option>
          </select>
        </label>
      </div>
      {q.kind === "intersection" && (
        <fieldset>
          <legend>Members must match every condition</legend>
          {q.conditions?.map((c, i) => (
            <div className="public-controls" key={i}>
              <label>
                Vote
                <select
                  value={c.voteId}
                  onChange={(e) =>
                    setQ({
                      ...q,
                      conditions: q.conditions!.map((v, j) =>
                        j === i ? { ...v, voteId: e.target.value } : v,
                      ),
                    })
                  }
                >
                  {dataset.votes.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.bill} · {v.date}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Outcome
                <select
                  value={c.outcome}
                  onChange={(e) =>
                    setQ({
                      ...q,
                      conditions: q.conditions!.map((v, j) =>
                        j === i
                          ? { ...v, outcome: e.target.value as Outcome }
                          : v,
                      ),
                    })
                  }
                >
                  {["Yes", "No", "Not voting", "Not eligible"].map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() =>
                  setQ({
                    ...q,
                    conditions: q.conditions!.filter((_, j) => i !== j),
                  })
                }
              >
                Remove condition
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={
              (q.conditions?.length ?? 0) >= 20 || !dataset.votes.length
            }
            onClick={() =>
              setQ({
                ...q,
                conditions: [
                  ...(q.conditions ?? []),
                  { voteId: dataset.votes[0].id, outcome: "Yes" },
                ],
              })
            }
          >
            Add vote condition
          </button>
        </fieldset>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <div className="public-actions">
            <button
              onClick={() =>
                save(
                  "scorecard-report.csv",
                  reportCsv(dataset, q, publication?.id),
                  "text/csv;charset=utf-8",
                )
              }
            >
              Download attributed CSV
            </button>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    reportTsv(dataset, q, publication?.id),
                  );
                  setNotice("Attributed spreadsheet table copied.");
                } catch {
                  setNotice("Clipboard unavailable. Download the CSV instead.");
                }
              }}
            >
              Copy spreadsheet table
            </button>
            <button
              onClick={() =>
                save(
                  "scorecard-report.svg",
                  reportSvg(dataset, q, publication?.id),
                  "image/svg+xml",
                )
              }
            >
              Download chart
            </button>
            <button onClick={() => window.print()}>Print report</button>
            <button
              disabled={!publication}
              onClick={async () => {
                const url = new URL(`${base}/reports`, location.origin);
                url.searchParams.set("publication", publication!.id);
                url.searchParams.set("query", JSON.stringify(q));
                try {
                  await navigator.clipboard.writeText(url.href);
                  setNotice("Publication-pinned report link copied.");
                } catch {
                  setNotice(url.href);
                }
              }}
            >
              Copy permanent report link
            </button>
          </div>
          {!publication && (
            <p>Permanent sharing becomes available after publication.</p>
          )}
          <p role="status">{notice}</p>
          <p>
            {result.rows.length} matching members · {result.votes.length} votes
            in scope. Unrated members have insufficient evidence, not a zero
            score.
          </p>
          <div className="public-table">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Current party</th>
                  <th>Current chamber</th>
                  <th>Grade</th>
                  <th>Alignment</th>
                  <th>Scored votes</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map(({ member, score }) => (
                  <tr key={member.id}>
                    <td>{member.name}</td>
                    <td>{member.party}</td>
                    <td>{member.chamber}</td>
                    <td>{score.grade}</td>
                    <td>
                      {score.value === null
                        ? "Insufficient evidence"
                        : `${Math.round(score.value)}%`}
                    </td>
                    <td>{score.counted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Exact query and source coverage</summary>
            <pre>{JSON.stringify(q, null, 2)}</pre>
            <ul>
              {result.sources.map((s) => (
                <li key={s}>
                  <Source url={s} />
                </li>
              ))}
            </ul>
            {!result.sources.length && (
              <p>No original source URLs in this dataset.</p>
            )}
          </details>
          <div className="public-print-only">
            <h2>Report scope and attribution</h2>
            <p>{membershipSemantics}</p>
            <p>
              Effective cutoff: {result.cutoff}. Source links below support
              evidence for the returned members.
            </p>
            <pre>{JSON.stringify(q, null, 2)}</pre>
            <ul>
              {result.sources.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
type Summary = Pick<Publication, "id" | "createdAt" | "summary">;
export function ArchivesPage({ dataset, publication }: Props) {
  const [list, setList] = useState<Summary[]>([]),
    [status, setStatus] = useState("Loading publications…"),
    [before, setBefore] = useState<Publication | null>(null),
    [memberId, setMemberId] = useState(dataset.members[0]?.id ?? "");
  const comparisonRequest = useRef<AbortController | null>(null);
  useEffect(() => () => comparisonRequest.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}/api/publications`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Archive unavailable (${r.status})`);
        const body = (await r.json()) as { publications: Summary[] };
        if (
          !Array.isArray(body.publications) ||
          body.publications.some(
            (p) =>
              !p ||
              typeof p.id !== "string" ||
              typeof p.createdAt !== "string" ||
              typeof p.summary !== "string",
          )
        )
          throw new Error("Invalid publication index");
        setList(body.publications);
        setStatus(body.publications.length ? "" : "No publications yet.");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setStatus(e.message);
      });
    return () => controller.abort();
  }, []);
  const change =
    before && publication
      ? publicationChanges(before, publication, memberId)
      : null;
  return (
    <section className="public-page">
      <h1>Published archives</h1>
      <Provenance dataset={dataset} publication={publication} />
      <p>
        Each archive preserves its evidence, date cutoff, and scoring rubric.
      </p>
      <p>
        Archives with a scoring snapshot show frozen published grades. Legacy
        archives without a snapshot show an explicitly labeled recalculation
        using the current scoring engine.
      </p>
      <p role="status">{status}</p>
      {list.map((p) => (
        <article key={p.id}>
          <h2>
            <a href={`${base}/?publication=${encodeURIComponent(p.id)}`}>
              {p.id}
            </a>
          </h2>
          <p>
            {p.createdAt} · {p.summary}
          </p>
          <button
            disabled={!publication}
            onClick={async () => {
              comparisonRequest.current?.abort();
              const controller = new AbortController();
              comparisonRequest.current = controller;
              setBefore(null);
              setStatus(`Loading ${p.id}…`);
              try {
                const archived = await loadArchivedPublication(
                  p.id,
                  fetch,
                  controller.signal,
                );
                if (controller.signal.aborted) return;
                setBefore(archived);
                setStatus("");
              } catch (e) {
                if (!controller.signal.aborted) setStatus((e as Error).message);
              }
            }}
          >
            Compare with loaded publication
          </button>
        </article>
      ))}
      {change && (
        <section>
          <h2>Why did the grade change?</h2>
          <label>
            Member
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              {[
                ...new Map(
                  [...dataset.members, ...(before?.dataset.members ?? [])].map(
                    (m) => [m.id, m],
                  ),
                ).values(),
              ].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            {before!.id} → {publication!.id}
          </p>
          <p>
            Grade {change.before?.grade ?? "Absent"} →{" "}
            {change.after?.grade ?? "Absent"}
          </p>
          <p>{change.explanation}</p>
          <p>
            Counted evidence: {change.before?.counted ?? 0} →{" "}
            {change.after?.counted ?? 0} votes.
          </p>
          <div className="public-grid">
            {[before!, publication!].map((frame, index) => (
              <article key={`${index}-${frame.id}`}>
                <h3>
                  {index === 0 ? "Selected archive" : "Loaded publication"}:{" "}
                  {frame.id}
                </h3>
                <p>
                  {frame.scoring
                    ? "Frozen published score"
                    : "Legacy archive — current-engine recalculation"}
                </p>
                <Provenance dataset={frame.dataset} publication={frame} />
                <details>
                  <summary>Evidence in this publication</summary>
                  {(index === 0 ? change.before : change.after)?.evidence.map(
                    (e) => (
                      <p key={e.voteId}>
                        <a
                          href={publicUrl(
                            `${base}/legislation/${encodeURIComponent(e.voteId)}`,
                            frame,
                          )}
                        >
                          {e.vote.bill}
                        </a>
                        : {e.outcome} · {e.vote.date} ·{" "}
                        {e.scored ? "Scored" : "Not scored"} ·{" "}
                        <Source url={e.vote.source} />
                      </p>
                    ),
                  ) ?? <p>Member absent from this publication.</p>}
                </details>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
