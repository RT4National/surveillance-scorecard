import { Fragment, useState } from "react";
import { ArrowLeft, Copy, History, Info, ShieldCheck } from "lucide-react";
import { useScorecard } from "../../data/context";
import { defaultGradeBands, groupLabels } from "../../core/scoring";
import { bandRange, profileSummary } from "../../core/summary";
import {
  bandLine,
  correctionCopy,
  evidenceCopy,
  headlineCopy,
  hasCosponsorships,
  notGradedLabel,
  profileCopy,
  scoredLabel,
  scoredNoun,
  splitCopy,
} from "../../core/copy";
import { publicationUrl } from "../../core/navigation";
import type { Member } from "../../core/types";
import { CorrectionForm } from ".";
import { base, fictional, fmt, query, readAsOf } from "./helpers";
import { Avatar, Grade } from "./member";
import { splitDisplay } from "./split";
import { EvidenceRow, type EvidenceEntry } from "./EvidenceRow";
import { Legend } from "./Legend";
import { useChangeClass, useSeenOnce } from "./motion";

const newestFirst = (list: EvidenceEntry[]) =>
  [...list].sort(
    (a, b) =>
      b.vote.date.localeCompare(a.vote.date) ||
      a.voteId.localeCompare(b.voteId),
  );

export function Profile({
  member,
  copy,
  serverPainted = false,
}: {
  member: Member;
  copy: (text: string) => Promise<void>;
  /** The Worker already painted the split bars at full width: do not grow them again. */
  serverPainted?: boolean;
}) {
  const { score, dataset, rubric, publication, linkId } = useScorecard();
  const [asOf, setAsOf] = useState(readAsOf(dataset));
  // Motion (src/styles/motion.css): the grade and evidence restart a short change animation on each
  // timeline date change, and the split bars grow once on first view. Values are final either way.
  const [changeClass, bumpChange] = useChangeClass();
  const [barsRef, barsSeen] = useSeenOnce<HTMLDivElement>();
  const changeAsOf = (d: string) => {
    if (d === asOf) return;
    setAsOf(d);
    bumpChange();
    const p = query();
    p.set("asOf", d);
    window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
  };
  // Vote id of the row whose error report is open; one at a time.
  const [reporting, setReporting] = useState<string | null>(null);
  const s = score(member, asOf);
  const split = splitDisplay(s, member.party);
  const summary = profileSummary(s, dataset.votes);
  const band =
    s.value === null
      ? null
      : bandRange(s.grade, rubric.gradeBands ?? defaultGradeBands);
  // The whole record, independent of the selected date, so the timeline and the date minimum stay stable.
  const dates = score(member).evidence.map((e) => e.vote.date);
  const earliest = dates.reduce<string | undefined>(
    (min, d) => (min === undefined || d < min ? d : min),
    undefined,
  );
  const timelineDates = [...new Set(dates.map((d) => d.slice(0, 4)))]
    .sort()
    .slice(-3)
    .map((year) =>
      `${year}-12-31` > dataset.asOf ? dataset.asOf : `${year}-12-31`,
    );
  // Only the publication's own as-of date carries the frozen published grade.
  const frozen = (d: string) =>
    Boolean(publication?.scoring) && d === dataset.asOf;
  const noun = scoredNoun(hasCosponsorships(dataset.votes));
  const count = (n: number) => `${n} ${n === 1 ? noun.slice(0, -1) : noun}`;
  // Evidence filter from the split chips. A side shows only items scored on that side.
  const [side, setSide] = useState<"all" | "own" | "other">("all");
  const shownEvidence = s.evidence.filter(
    (e) => side === "all" || (e.scored && e.ownParty === (side === "own")),
  );
  const unscored = shownEvidence.filter((e) => !e.scored);
  const row = (e: EvidenceEntry) => (
    <Fragment key={e.voteId}>
      <EvidenceRow
        entry={e}
        publicationId={linkId}
        actions={
          <button
            type="button"
            className="link-button"
            aria-expanded={reporting === e.voteId}
            aria-controls={`report-${e.voteId}`}
            onClick={() =>
              setReporting((v) => (v === e.voteId ? null : e.voteId))
            }
          >
            {correctionCopy.rowAction}
          </button>
        }
      />
      {reporting === e.voteId && (
        <CorrectionForm
          id={`report-${e.voteId}`}
          dataset={dataset}
          publication={publication}
          memberId={member.id}
          voteId={e.voteId}
        />
      )}
    </Fragment>
  );
  return (
    <section className="container inner-page">
      <a className="back-link" href={publicationUrl(`${base}/`, linkId)}>
        <ArrowLeft size={16} /> {profileCopy.back}
      </a>
      <div className="profile-heading">
        <figure className="profile-portrait">
          <Avatar member={member} large />
          {member.portrait?.url.startsWith("/scorecard/portraits/") && (
            <figcaption>
              <a href={member.portrait.rightsSource} rel="noreferrer">
                {member.portrait.attribution}
              </a>
            </figcaption>
          )}
        </figure>
        <div>
          <div className="eyebrow">
            {profileCopy.eyebrow(fictional(dataset), member.status)}
          </div>
          <h1>{member.name}</h1>
          <p>
            {member.party} · {member.state} · {member.chamber}
            {member.district !== undefined
              ? `, District ${member.district}`
              : ""}
          </p>
        </div>
        <button
          className="button"
          onClick={() => void copy(window.location.href)}
        >
          <Copy size={15} /> {profileCopy.copyLink}
        </button>
      </div>
      <div className="profile-layout">
        <aside className="profile-sidebar">
          <div className={`profile-grade ${changeClass}`.trim()}>
            <Grade member={member} asOf={asOf} />
            <h2>
              {s.value === null
                ? notGradedLabel(rubric.minVotes)
                : profileCopy.alignment(fmt(s.value))}
            </h2>
          </div>
          <ul className="headline-lines">
            <li>
              {headlineCopy.aligned(
                summary.aligned,
                summary.scored,
                summary.years,
              )}
            </li>
            <li>{scoredLabel(s, dataset.votes)}</li>
            {band && <li>{bandLine(band)}</li>}
            {summary.notVoted > 0 && (
              <li>{headlineCopy.notVoted(summary.notVoted)}</li>
            )}
          </ul>
          <details className="does-not-measure">
            <summary>{headlineCopy.doesNotMeasure}</summary>
            <ul>
              {headlineCopy.doesNotMeasureItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
          <span className={`category ${s.group}`}>{groupLabels[s.group]}</span>
          <p>{s.reason}</p>
          <hr />
          <h3>{profileCopy.memberships}</h3>
          <p>
            {[...member.committees, ...member.caucuses].join(" · ") ||
              profileCopy.noMemberships}
          </p>
          <p className="muted">
            {profileCopy.serviceBegins(member.since)}{" "}
            {fictional(dataset) ? profileCopy.demoRecord : profileCopy.verify}
          </p>
        </aside>
        <div className="profile-main">
          <div className="panel">
            <div className="section-heading">
              <h2>{profileCopy.splitHeading}</h2>
              <ShieldCheck size={20} />
            </div>
            <p className="muted">{splitCopy.meaning}</p>
            {split.kind === "comparable" ? (
              <>
                <div
                  ref={barsRef}
                  className={`split-bars${barsSeen && !serverPainted ? " motion-grow-x" : ""}`}
                >
                  {(
                    [
                      [splitCopy.ownLabel, split.own],
                      [splitCopy.otherLabel, split.other],
                    ] as const
                  ).map(([label, part]) => (
                    <div className="split-side" key={label}>
                      <span className="split-label">{label}</span>
                      <div className="split-bar" aria-hidden="true">
                        <span
                          className="split-fill motion-fill"
                          style={{ width: `${part.percent}%` }}
                        />
                      </div>
                      <strong className="split-percent">{part.percent}%</strong>
                      <small className="split-count">{count(part.count)}</small>
                    </div>
                  ))}
                </div>
                {s.topicCoverageWarning && (
                  <p className="coverage-warning">
                    <Info size={15} /> {s.topicCoverageWarning}
                  </p>
                )}
                <p className="footnote">
                  {splitCopy.limits}{" "}
                  {splitCopy.sharedTopics(s.sharedTopics.length)}
                </p>
              </>
            ) : split.kind === "unproven" ? (
              <>
                <p className="split-counts">
                  <strong>{split.counts}</strong>
                </p>
                <p>{split.message}</p>
                <p className="footnote">{splitCopy.limits}</p>
              </>
            ) : (
              <p>{split.message}</p>
            )}
            {split.kind !== "not-applicable" && (
              <div
                className="split-chips"
                role="group"
                aria-label={splitCopy.chipsLabel}
              >
                {(
                  [
                    ["all", splitCopy.chipAll, null],
                    ["own", splitCopy.chipOwn, s.ownCount],
                    ["other", splitCopy.chipOther, s.otherCount],
                  ] as const
                ).map(([value, label, n]) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={side === value}
                    onClick={() => setSide(value)}
                  >
                    {label}
                    {n !== null && ` · ${n}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="panel">
            <div className="section-heading">
              <h2>
                <History size={18} /> Explore the record over time
              </h2>
              <input
                aria-label="Profile evidence through date"
                type="date"
                min={earliest}
                max={dataset.asOf}
                value={asOf}
                onChange={(e) => {
                  if (e.target.value) changeAsOf(e.target.value);
                }}
              />
            </div>
            <p className="muted">
              {frozen(asOf)
                ? `Frozen published grade · scorer ${publication?.scoring?.version} · rubric ${rubric.version}.`
                : `Recalculated with rubric ${rubric.version} and the current scoring engine.`}{" "}
              <a href={publicationUrl(`${base}/archive`, linkId)}>
                View immutable published versions
              </a>{" "}
              to see what was actually published at the time.
            </p>
            <div className="timeline">
              {timelineDates.map((d) => (
                <button
                  key={d}
                  aria-pressed={d === asOf}
                  onClick={() => changeAsOf(d)}
                >
                  <small>{d.slice(0, 4)}</small>
                  <Grade member={member} asOf={d} />
                  {!frozen(d) && (
                    <em className="recalculated-tag">Recalculated</em>
                  )}
                  <span>Evidence through {d}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="section-heading">
              <h2>The evidence behind the grade</h2>
              <span className="count-pill evidence-scored-count">
                {scoredLabel(s, dataset.votes)}
              </span>
            </div>
            <div className={`evidence-lists ${changeClass}`.trim()}>
              <div className="evidence-scored">
                {newestFirst(shownEvidence.filter((e) => e.scored)).map(row)}
              </div>
              {unscored.length > 0 && (
                <section className="evidence-unscored">
                  <h3>{evidenceCopy.contextHeading(unscored.length)}</h3>
                  {newestFirst(unscored).map(row)}
                </section>
              )}
            </div>
            {!s.evidence.length && <p>No evidence before this date.</p>}
            <Legend />
            <p className="footnote">
              {dataset.demo
                ? fictional(dataset)
                  ? "Fictional evidence is not an official source."
                  : "Official records; the vote directions used for scoring are unreviewed placeholders."
                : `Publication ${publication?.id} · rubric ${rubric.version}.`}{" "}
              {dataset.coverage.join(" ")}
            </p>
          </div>
          <CorrectionForm
            dataset={dataset}
            publication={publication}
            memberId={member.id}
          />
          <div className="panel">
            <h2>Service, party and membership history</h2>
            {dataset.affiliations?.some((a) => a.memberId === member.id) ? (
              <ul className="method-list">
                {dataset.affiliations
                  .filter((a) => a.memberId === member.id)
                  .sort((a, b) => b.start.localeCompare(a.start))
                  .map((a, i) => (
                    <li key={`${a.kind}-${a.start}-${i}`}>
                      <strong>
                        {a.name} · {a.kind}
                      </strong>
                      <span>
                        {a.start} – {a.end ?? "ongoing"} ·{" "}
                        {a.precision === "year"
                          ? "Year-level dates; exact transition day not established"
                          : "Exact dated interval"}{" "}
                        ·{" "}
                        <a href={a.source} target="_blank" rel="noreferrer">
                          Source
                        </a>
                      </span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>
                Historical service and membership intervals have not been
                supplied for this publication. Current labels do not establish
                past affiliation.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
