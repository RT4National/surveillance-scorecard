import { useState } from "react";
import type { Outcome } from "../../core/types";
import { publicationUrl } from "../../core/navigation";
import { base, publicUrl, Provenance, Source, type Props } from "./pageShared";
import { ScopeControls, useReport } from "./reportControls";
import {
  hasCosponsorships,
  notGradedLabel,
  percentLabel,
  scoredActionCounts,
} from "../../core/copy";
import {
  reportCsv,
  reportSvg,
  reportTsv,
  membershipSemantics,
  validateReportQuery,
  type ReportQuery,
} from "../../core/reports";
import { CongressTrends } from "./CongressTrends";
import { HeadlineDownloads } from "./HeadlineDownloads";
import { save } from "./download";

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
        <a href={publicUrl(`${base}/archives`, publication)}>
          Browse published archives
        </a>
      </section>
    );
  return (
    <section className="public-page">
      <h1>Data and research</h1>
      <Provenance dataset={dataset} publication={publication} />
      <HeadlineDownloads publication={publication} />
      <aside className="public-provenance">
        <h2>Reporting accurately</h2>
        <p>
          A grade summarizes scored actions on surveillance reform. Use the
          evidence on each member’s profile and cite the publication when
          quoting a grade. Party alone cannot tell you a legislator’s record.
        </p>
      </aside>
      <CongressTrends publication={publication} download={save} />
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
            {Object.entries({
              active: "Current members",
              inactive: "Former members",
              deceased: "Deceased members",
              all: "All member statuses",
            }).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
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
      {q.kind === "ranking" && (
        <p>
          <strong>One view of the evidence, not a verdict.</strong> Rankings
          depend on the selected actions and dates.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <div className="public-actions">
            <button
              onClick={() =>
                save(
                  "scorecard-report.csv",
                  reportCsv(dataset, q, publication?.id, location.origin),
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
                    reportTsv(dataset, q, publication?.id, location.origin),
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
                  reportSvg(dataset, q, publication?.id, location.origin),
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
          <div
            className="public-table"
            role="region"
            aria-label="Research report results"
            tabIndex={0}
          >
            <table>
              <caption>Research report results</caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Current party</th>
                  <th scope="col">Current chamber</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Alignment</th>
                  <th scope="col">
                    {hasCosponsorships(dataset.votes)
                      ? "Scored actions (votes, cosponsorships)"
                      : "Scored votes"}
                  </th>
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
                        ? notGradedLabel(dataset.rubric.minVotes)
                        : percentLabel(score.value)}
                    </td>
                    <td>
                      {score.counted}
                      {hasCosponsorships(dataset.votes) &&
                        (({ votes, cosponsorships }) =>
                          ` (${votes}, ${cosponsorships})`)(
                          scoredActionCounts(score, dataset.votes),
                        )}
                    </td>
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
