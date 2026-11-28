import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  History,
  Info,
  ShieldCheck,
  X,
} from "lucide-react";
import { useScorecard } from "../../data/context";
import { groupLabels } from "../../core/scoring";
import {
  hasCosponsorships,
  notGradedLabel,
  scoredLabel,
  scoredNoun,
} from "../../core/copy";
import { publicationUrl } from "../../core/navigation";
import type { Member, Party } from "../../core/types";
import { CorrectionForm, Source } from ".";
import { evidenceLabel } from "../../core/evidence";
import { base, fictional, fmt, query, readAsOf } from "./helpers";
import { Avatar, Grade } from "./member";
import { splitDisplay } from "./split";

/** How a member of each party is named in running text ("a Democrat at the time"). */
const partyMember: Record<Party, string> = {
  Democratic: "Democrat",
  Republican: "Republican",
  Independent: "Independent",
};
const withArticle = (word: string) =>
  `${/^[AEIOU]/i.test(word) ? "an" : "a"} ${word}`;

export function Profile({
  member,
  copy,
}: {
  member: Member;
  copy: (text: string) => Promise<void>;
}) {
  const { score, dataset, rubric, publication } = useScorecard();
  const [asOf, setAsOf] = useState(readAsOf(dataset));
  const s = score(member, asOf);
  const split = splitDisplay(s, member.party);
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
  return (
    <section className="container inner-page">
      <a
        className="back-link"
        href={publicationUrl(`${base}/`, publication?.id)}
      >
        <ArrowLeft size={16} /> All legislators
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
            {fictional(dataset) ? "FICTIONAL LEGISLATOR" : "LEGISLATOR"} ·{" "}
            {member.status.toUpperCase()}
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
          <Copy size={15} /> Copy profile link
        </button>
      </div>
      <div className="profile-layout">
        <aside className="profile-sidebar">
          <Grade member={member} asOf={asOf} />
          <h2>
            {s.value === null
              ? notGradedLabel(rubric.minVotes)
              : `${fmt(s.value)} reform alignment`}
          </h2>
          <p>
            {Number(s.earned.toFixed(2))} aligned weighted points out of{" "}
            {Number(s.possible.toFixed(2))} possible · {scoredLabel(s, dataset.votes)}
          </p>
          <span className={`category ${s.group}`}>{groupLabels[s.group]}</span>
          <p>{s.reason}</p>
          <hr />
          <h3>Committees & caucuses</h3>
          <p>
            {[...member.committees, ...member.caucuses].join(" · ") ||
              "No current memberships listed"}
          </p>
          <p className="muted">
            Service begins {member.since}.{" "}
            {fictional(dataset)
              ? "Demonstration record."
              : "See the publication sources for verification."}
          </p>
        </aside>
        <div className="profile-main">
          <div className="panel">
            <div className="section-heading">
              <h2>Principles across presidencies</h2>
              <ShieldCheck size={20} />
            </div>
            <p className="muted">
              A strong score alone does not prove consistency. We compare the
              record in both party contexts.
            </p>
            {split.kind === "comparable" ? (
              <>
                <div className="context-grid">
                  <div>
                    <span>President of their own party</span>
                    <strong>{split.own.percent}%</strong>
                    <small>
                      {split.own.count} {noun}
                    </small>
                  </div>
                  <div>
                    <span>President of another party</span>
                    <strong>{split.other.percent}%</strong>
                    <small>
                      {split.other.count} {noun}
                    </small>
                  </div>
                </div>
                {s.topicCoverageWarning && (
                  <p className="coverage-warning">
                    <Info size={15} /> {s.topicCoverageWarning}
                  </p>
                )}
                <p className="footnote">
                  {s.sharedTopics.length} shared issue topics across party
                  contexts. Different issue mixes can affect this comparison.
                </p>
              </>
            ) : split.kind === "unproven" ? (
              <>
                <p className="split-counts">
                  <strong>{split.counts}</strong>
                </p>
                <p>{split.message}</p>
              </>
            ) : (
              <p>{split.message}</p>
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
                  if (!e.target.value) return;
                  setAsOf(e.target.value);
                  const p = query();
                  p.set("asOf", e.target.value);
                  window.history.replaceState(
                    null,
                    "",
                    `${window.location.pathname}?${p}`,
                  );
                }}
              />
            </div>
            <p className="muted">
              {frozen(asOf)
                ? `Frozen published grade · scorer ${publication?.scoring?.version} · rubric ${rubric.version}.`
                : `Recalculated with rubric ${rubric.version} and the current scoring engine.`}{" "}
              <a href={publicationUrl(`${base}/archive`, publication?.id)}>
                View immutable published versions
              </a>{" "}
              to see what was actually published at the time.
            </p>
            <div className="timeline">
              {timelineDates.map((d) => (
                <button
                  key={d}
                  aria-pressed={d === asOf}
                  onClick={() => {
                    setAsOf(d);
                    const p = query();
                    p.set("asOf", d);
                    window.history.replaceState(
                      null,
                      "",
                      `${window.location.pathname}?${p}`,
                    );
                  }}
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
              <span className="count-pill">{s.evidence.length} records</span>
            </div>
            {[...s.evidence]
              .sort(
                (a, b) =>
                  b.vote.date.localeCompare(a.vote.date) ||
                  a.voteId.localeCompare(b.voteId),
              )
              .map((e) => (
                <div className="evidence-row" key={e.voteId}>
                  <div
                    className={`vote-mark ${!e.scored ? "neutral" : e.aligned ? "yes" : "no"}`}
                  >
                    {!e.scored ? (
                      <span aria-hidden="true">—</span>
                    ) : e.aligned ? (
                      <Check size={18} />
                    ) : (
                      <X size={18} />
                    )}
                    <span className="sr-only">
                      {!e.scored
                        ? "Not scored"
                        : e.aligned
                          ? "Aligned with reform position"
                          : "Not aligned with reform position"}
                    </span>
                  </div>
                  <div>
                    <strong>{e.vote.title}</strong>
                    <p>{e.vote.rationale}</p>
                    <p className="evidence-context">
                      <span>Reform position: {e.vote.reformVote}</span>
                      <span>
                        Under {withArticle(e.vote.presidentParty)} president
                        {/* Not eligible: no service on this date, so no party to report. */}
                        {e.outcome !== "Not eligible" &&
                          ` · ${partyMember[e.partyAtVote]} at the time`}
                      </span>
                      {e.scored && (
                        <span>
                          Counts toward:{" "}
                          {e.ownParty ? "own-party" : "other-party"} president
                        </span>
                      )}
                    </p>
                    <small>
                      {e.vote.date} ·{" "}
                      <a
                        href={publicationUrl(
                          `${base}/legislation/${encodeURIComponent(e.vote.id)}`,
                          publication?.id,
                        )}
                      >
                        {e.vote.bill}
                      </a>{" "}
                      · {e.vote.topic} · <Source url={e.vote.source} />
                    </small>
                  </div>
                  <div className="vote-result">
                    <strong>{evidenceLabel(e.vote, e.outcome)}</strong>
                    <small>
                      {e.scored
                        ? `${Number((e.aligned ? e.effectiveWeight : 0).toFixed(2))} / ${Number(e.effectiveWeight.toFixed(2))} points`
                        : e.inWindow
                          ? "Excluded: not cast"
                          : "Outside scoring window"}
                    </small>
                  </div>
                </div>
              ))}
            {!s.evidence.length && <p>No evidence before this date.</p>}
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
