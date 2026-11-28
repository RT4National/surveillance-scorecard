import { useId, useState, type ReactNode } from "react";
import { servingOutcomes, tallyRollCall } from "../../core/tally";
import type { Vote } from "../../core/types";
import { base, Provenance, publicUrl, Source, type Props } from "./pageShared";
import { congressLabel } from "../../core/congress";

const outcomeLabels = {
  Yes: "Yes",
  No: "No",
  "Not voting": "Did not vote",
  "Not eligible": "Not in office",
};

export function VotePage({
  dataset,
  publication,
  vote,
  children,
}: Props & { vote: Vote; children: ReactNode }) {
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");
  const tallyCaption = useId();
  const recordsCaption = useId();
  const cosponsorship = vote.kind === "cosponsorship";
  const records = dataset.records.filter((record) => record.voteId === vote.id);
  const tally = cosponsorship ? null : tallyRollCall(records);
  const members = new Map(dataset.members.map((member) => [member.id, member]));
  const query = search.trim().toLowerCase();
  const rows = records.filter((record) => {
    const member = members.get(record.memberId);
    return (
      (!outcome || record.outcome === outcome) &&
      [member?.name ?? record.memberId, member?.state].some((value) =>
        value?.toLowerCase().includes(query),
      )
    );
  });
  const totalRecorded =
    tally && Object.values(tally.totals).reduce((sum, count) => sum + count, 0);

  return (
    <section className="public-page">
      <nav aria-label="Vote breadcrumb">
        <a href={publicUrl(`${base}/legislation`, publication)}>Votes</a>
        {" › "}
        {congressLabel(vote.date)}
        {" › "}
        {vote.chamber}
      </nav>
      <h1>{vote.title}</h1>
      <p>
        {vote.bill}
        {vote.commonName ? ` · ${vote.commonName}` : ""} · {vote.date} ·{" "}
        {vote.chamber} · {vote.topic}
      </p>
      <Provenance dataset={dataset} publication={publication} />
      {tally && (
        <p>
          {tally.totals.Yes} Yes · {tally.totals.No} No ·{" "}
          {tally.totals["Not voting"]} did not vote (from recorded ballots)
        </p>
      )}
      <p>
        {cosponsorship
          ? `Cosponsoring counted ${vote.reformVote === "Yes" ? "for" : "against"} reform.`
          : `A ${vote.reformVote.toUpperCase()} vote was the pro-reform vote.`}{" "}
        Weight {vote.weight}.
      </p>
      <p>{vote.rationale}</p>
      <Source url={vote.source} />
      {tally && (
        <>
          <div
            className="public-table"
            role="region"
            aria-labelledby={tallyCaption}
            tabIndex={0}
          >
            <table>
              <caption id={tallyCaption}>
                Party breakdown from recorded ballots
              </caption>
              <thead>
                <tr>
                  <th scope="col">Party</th>
                  {servingOutcomes.map((key) => (
                    <th scope="col" key={key}>
                      {outcomeLabels[key]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="motion-grow-x">
                {Object.entries(tally.byParty).map(([party, counts]) => (
                  <tr key={party}>
                    <th scope="row">{party}</th>
                    {servingOutcomes.map((key) => (
                      <td key={key}>
                        {counts[key]}
                        <div className="vote-tally-track" aria-hidden="true">
                          <div
                            className="motion-fill"
                            style={{
                              width: `${totalRecorded ? (counts[key] / totalRecorded) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {tally.notInOffice} {tally.notInOffice === 1 ? "member" : "members"}{" "}
            not in office at the time
          </p>
        </>
      )}
      <h2>
        {cosponsorship ? "Sponsors and cosponsors" : "Recorded roll call"}
      </h2>
      {!cosponsorship && (
        <p>Missing records are unknown, not inferred absences.</p>
      )}
      <div className="public-controls">
        <label>
          Filter by name or state
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {!cosponsorship && (
          <label>
            Outcome
            <select
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              <option value="">All outcomes</option>
              {Object.entries(outcomeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!rows.length && <p role="status">No records match these filters.</p>}
      <div
        className="public-table"
        role="region"
        aria-labelledby={recordsCaption}
        tabIndex={0}
      >
        <table>
          <caption id={recordsCaption}>
            {cosponsorship
              ? "Recorded bill supporters"
              : "Member ballots and participation"}
          </caption>
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">
                {cosponsorship ? "Party at the time" : "Party at vote"}
              </th>
              <th scope="col">{cosponsorship ? "Action" : "Outcome"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.memberId}>
                <td>
                  <a
                    href={publicUrl(
                      `${base}/members/${encodeURIComponent(record.memberId)}`,
                      publication,
                    )}
                  >
                    {members.get(record.memberId)?.name ?? record.memberId}
                  </a>
                </td>
                <td>
                  {record.outcome === "Not eligible"
                    ? "Not serving"
                    : record.partyAtVote}
                </td>
                <td>
                  {cosponsorship && record.outcome === "Yes"
                    ? "Cosponsored"
                    : outcomeLabels[record.outcome]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {children}
    </section>
  );
}
