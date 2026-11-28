import { useId, useState } from "react";
import type { Dataset } from "../../core/publication";
import type { Member, Outcome, Party, Rubric, Vote } from "../../core/types";
import { ChoiceButtons, GradingRulesControls } from "../GradingRules";
import { importanceLabel, importanceOptions } from "./plain";

type PanelProps = {
  dataset: Dataset;
  onChange: (d: Dataset) => void;
};

const partyOptions = (
  <>
    <option>Democratic</option>
    <option>Republican</option>
    <option>Independent</option>
  </>
);

/** Tab 1: which votes we score, which side is pro-privacy, and how much each counts. */
export function VotesPanel({ dataset: d, onChange }: PanelProps) {
  const [voteId, setVoteId] = useState("");
  const [recordMember, setRecordMember] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("Yes");
  const [party, setParty] = useState<Party>("Democratic");
  const topicsId = useId();
  const v = d.votes.find((v) => v.id === voteId) ?? d.votes[0];
  const vote = (patch: Partial<Vote>) =>
    onChange({
      ...d,
      votes: d.votes.map((x) => (x.id === v?.id ? { ...x, ...patch } : x)),
    });
  const topics = [...new Set(d.votes.map((x) => x.topic).filter(Boolean))];
  const custom = v ? importanceLabel(v.weight) === null : false;
  return (
    <div className="structured-editor">
      <p className="editor-lede">
        Pick a vote to review. For each one, say which side protects privacy and
        how much it should count toward grades.
      </p>
      <div className="editor-row">
        <label>
          Choose a vote
          <select
            value={v?.id ?? ""}
            onChange={(e) => setVoteId(e.target.value)}
          >
            {d.votes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.bill || "Untitled"} – {x.title || "no title yet"} ({x.date})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            const id = crypto.randomUUID();
            onChange({
              ...d,
              votes: [
                ...d.votes,
                {
                  id,
                  bill: "",
                  title: "",
                  date: d.asOf.slice(0, 10),
                  administration: "",
                  presidentParty: "Democratic",
                  chamber: "House",
                  reformVote: "Yes",
                  weight: 1,
                  topic: "",
                  rationale: "",
                  source: null,
                },
              ],
            });
            setVoteId(id);
          }}
        >
          Add a vote
        </button>
      </div>
      {!v && <p>No votes yet. Use “Add a vote” to start.</p>}
      {v && (
        <article className="editor-card">
          <h2>
            {v.bill || "New vote"} – {v.title || "untitled"}
          </h2>
          <ChoiceButtons
            label="Is a YES vote good for privacy?"
            help="Members who vote this way are counted as voting for privacy."
            options={[
              { label: "Yes", value: "Yes" as const },
              { label: "No", value: "No" as const },
            ]}
            value={v.reformVote}
            onChange={(reformVote) => vote({ reformVote })}
          />
          <ChoiceButtons
            label="How much should it count?"
            help="“More” counts twice as much as a normal vote; “Less” counts half as much."
            options={importanceOptions.map((o) => ({
              label: o.label,
              value: o.value as number,
            }))}
            value={v.weight}
            onChange={(weight) => vote({ weight })}
            extra={
              custom ? (
                <span className="gr-custom">Custom ({v.weight})</span>
              ) : null
            }
          />
          <div className="editor-grid">
            <div>
              <label>
                Topic
                <input
                  list={topicsId}
                  value={v.topic}
                  onChange={(e) => vote({ topic: e.target.value })}
                />
              </label>
              <p className="gr-help">
                Votes on the same topic are compared across presidents.
              </p>
            </div>
            <datalist id={topicsId}>
              {topics.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <label>
              Bill or amendment number
              <input
                value={v.bill}
                onChange={(e) => vote({ bill: e.target.value })}
              />
            </label>
            <label>
              Short title readers will see
              <input
                value={v.title}
                onChange={(e) => vote({ title: e.target.value })}
              />
            </label>
            <label>
              Date of the vote
              <input
                type="date"
                value={v.date}
                onChange={(e) => vote({ date: e.target.value })}
              />
            </label>
            <label>
              House or Senate
              <select
                value={v.chamber}
                onChange={(e) =>
                  vote({ chamber: e.target.value as Vote["chamber"] })
                }
              >
                <option>House</option>
                <option>Senate</option>
              </select>
            </label>
            <label>
              Link to the official record
              <input
                type="url"
                value={v.source ?? ""}
                onChange={(e) => vote({ source: e.target.value || null })}
              />
            </label>
            <label>
              President at the time
              <input
                value={v.administration}
                onChange={(e) => vote({ administration: e.target.value })}
              />
            </label>
            <div>
              <label>
                President's party
                <select
                  value={v.presidentParty}
                  onChange={(e) =>
                    vote({ presidentParty: e.target.value as Party })
                  }
                >
                  {partyOptions}
                </select>
              </label>
              <p className="gr-help">
                Used to check whether members vote the same way under presidents
                of each party.
              </p>
            </div>
          </div>
          <div>
            <label>
              Why it matters
              <textarea
                rows={4}
                value={v.rationale}
                onChange={(e) => vote({ rationale: e.target.value })}
              />
            </label>
            <p className="gr-help">
              Shown to readers. Explain in a sentence or two why this side
              protects privacy.
            </p>
          </div>
          <details className="editor-details">
            <summary>
              How each legislator voted (
              {d.records.filter((r) => r.voteId === v.id).length})
            </summary>
            <p className="gr-help">
              Add or fix a legislator's recorded vote. “Did not vote” and “Not
              eligible” are left out of grades.
            </p>
            <div className="editor-grid">
              <label>
                Legislator
                <select
                  value={recordMember}
                  onChange={(e) => {
                    setRecordMember(e.target.value);
                    const selected = d.members.find(
                      (m) => m.id === e.target.value,
                    );
                    if (selected) setParty(selected.party);
                  }}
                >
                  <option value="">Choose a legislator</option>
                  {d.members
                    .filter((m) => m.chamber === v.chamber)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                How they voted
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as Outcome)}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                  <option value="Not voting">Did not vote</option>
                  <option value="Not eligible">Not eligible</option>
                </select>
              </label>
              <label>
                Their party at the time
                <select
                  value={party}
                  onChange={(e) => setParty(e.target.value as Party)}
                >
                  {partyOptions}
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={!recordMember}
              onClick={() =>
                onChange({
                  ...d,
                  records: [
                    ...d.records.filter(
                      (r) =>
                        !(r.memberId === recordMember && r.voteId === v.id),
                    ),
                    {
                      memberId: recordMember,
                      voteId: v.id,
                      outcome,
                      partyAtVote: party,
                    },
                  ],
                })
              }
            >
              Save this legislator's vote
            </button>
            <div className="editor-scroll">
              <table aria-label="Recorded votes">
                <thead>
                  <tr>
                    <th>Legislator</th>
                    <th>Vote</th>
                    <th>Party then</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.records
                    .filter((r) => r.voteId === v.id)
                    .map((r) => {
                      const name =
                        d.members.find((m) => m.id === r.memberId)?.name ??
                        r.memberId;
                      return (
                        <tr key={r.memberId}>
                          <td>{name}</td>
                          <td>
                            {r.outcome === "Not voting"
                              ? "Did not vote"
                              : r.outcome}
                          </td>
                          <td>{r.partyAtVote}</td>
                          <td>
                            <button
                              type="button"
                              aria-label={`Edit ${name}'s vote`}
                              onClick={() => {
                                setRecordMember(r.memberId);
                                setOutcome(r.outcome);
                                setParty(r.partyAtVote);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${name}'s vote`}
                              onClick={() =>
                                onChange({
                                  ...d,
                                  records: d.records.filter(
                                    (x) =>
                                      !(
                                        x.memberId === r.memberId &&
                                        x.voteId === r.voteId
                                      ),
                                  ),
                                })
                              }
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </details>
          <button
            type="button"
            className="editor-danger"
            onClick={() => {
              onChange({
                ...d,
                votes: d.votes.filter((x) => x.id !== v.id),
                records: d.records.filter((r) => r.voteId !== v.id),
              });
              setVoteId("");
            }}
          >
            Stop scoring this vote
          </button>
          <p className="gr-help">
            Removes the vote and its recorded votes from this draft only.
            Published versions are not changed.
          </p>
        </article>
      )}
    </div>
  );
}

/** Tab 2: legislators' names, party, committees and photos. */
export function LegislatorsPanel({ dataset: d, onChange }: PanelProps) {
  const [memberId, setMemberId] = useState("");
  const m = d.members.find((m) => m.id === memberId) ?? d.members[0];
  const member = (patch: Partial<Member>) =>
    onChange({
      ...d,
      members: d.members.map((x) => (x.id === m?.id ? { ...x, ...patch } : x)),
    });
  return (
    <div className="structured-editor">
      <p className="editor-lede">
        Correct how a legislator appears on the scorecard. Their votes are
        edited under “Votes to score”.
      </p>
      <label>
        Choose a legislator
        <select
          value={m?.id ?? ""}
          onChange={(e) => setMemberId(e.target.value)}
        >
          {d.members.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {m && (
        <article className="editor-card">
          <div className="editor-grid">
            <label>
              Name as shown
              <input
                value={m.name}
                onChange={(e) => member({ name: e.target.value })}
              />
            </label>
            <label>
              In office?
              <select
                value={m.status}
                onChange={(e) =>
                  member({ status: e.target.value as Member["status"] })
                }
              >
                <option value="active">Currently serving</option>
                <option value="inactive">No longer serving</option>
                <option value="deceased">Deceased</option>
              </select>
            </label>
            <label>
              Current party
              <select
                value={m.party}
                onChange={(e) => member({ party: e.target.value as Party })}
              >
                {partyOptions}
              </select>
            </label>
            <label>
              Committees (one per line)
              <textarea
                rows={3}
                value={m.committees.join("\n")}
                onChange={(e) =>
                  member({
                    committees: e.target.value.split("\n").filter(Boolean),
                  })
                }
              />
            </label>
            <label>
              Caucuses (one per line)
              <textarea
                rows={3}
                value={m.caucuses.join("\n")}
                onChange={(e) =>
                  member({
                    caucuses: e.target.value.split("\n").filter(Boolean),
                  })
                }
              />
            </label>
          </div>
          <details className="editor-details">
            <summary>Photo and permission to use it</summary>
            <p className="gr-help">
              Only use a photo we have permission for (a license or public
              domain), and name the person who checked it.
            </p>
            {(
              ["url", "attribution", "rightsSource", "reviewedBy"] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    url: "Photo link",
                    attribution: "Photo credit",
                    rightsSource: "Link showing we may use it",
                    reviewedBy: "Checked by",
                  }[key]
                }
                <input
                  value={m.portrait?.[key] ?? ""}
                  onChange={(e) =>
                    member({
                      portrait: {
                        url: "",
                        attribution: "",
                        rightsSource: "",
                        reviewedBy: "",
                        rights: "licensed",
                        ...m.portrait,
                        [key]: e.target.value,
                      },
                    })
                  }
                />
              </label>
            ))}
            <label>
              Permission type
              <select
                value={m.portrait?.rights ?? "licensed"}
                onChange={(e) =>
                  member({
                    portrait: {
                      url: "",
                      attribution: "",
                      rightsSource: "",
                      reviewedBy: "",
                      ...m.portrait,
                      rights: e.target.value as "licensed" | "public-domain",
                    },
                  })
                }
              >
                <option value="licensed">Licensed</option>
                <option value="public-domain">Public domain</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => member({ portrait: undefined })}
            >
              Remove photo from this draft
            </button>
          </details>
        </article>
      )}
    </div>
  );
}

/** Tab 3: grading rules with sliders and buttons. */
export function GradingRulesPanel({ dataset: d, onChange }: PanelProps) {
  const rubric = (next: Rubric) => onChange({ ...d, rubric: next });
  return (
    <div className="structured-editor">
      <p className="editor-lede">
        These rules turn votes into grades for every legislator. Check “Review
        &amp; publish” to see whose grade would change.
      </p>
      <div>
        <label>
          Name for this set of rules
          <input
            value={d.rubric.version}
            onChange={(e) => rubric({ ...d.rubric, version: e.target.value })}
          />
        </label>
        <p className="gr-help">
          Shown on the methodology page so readers know which rules were used.
        </p>
      </div>
      <GradingRulesControls rubric={d.rubric} onChange={rubric} />
    </div>
  );
}

/** Developer tools: identity and classification of the scorecard data. */
export function ScorecardDataDetails({ dataset: d, onChange }: PanelProps) {
  return (
    <div className="structured-editor">
      <div className="editor-grid">
        <label>
          Dataset identifier
          <input
            value={d.id}
            onChange={(e) => onChange({ ...d, id: e.target.value })}
          />
        </label>
        <label>
          Votes counted through (evidence cutoff date)
          <input
            type="date"
            value={d.asOf.slice(0, 10)}
            onChange={(e) => onChange({ ...d, asOf: e.target.value })}
          />
        </label>
        <label>
          Data classification
          <select
            value={d.demo ? "demo" : "live"}
            onChange={(e) =>
              onChange({ ...d, demo: e.target.value === "demo" })
            }
          >
            <option value="demo">Fictional demonstration</option>
            <option value="live">Reviewed real evidence</option>
          </select>
        </label>
      </div>
      <p className="gr-help">
        Changing the classification does not verify records. Fictional
        identifiers are refused in live publications.
      </p>
      <label>
        Coverage and known gaps (one note per line)
        <textarea
          rows={3}
          value={d.coverage.join("\n")}
          onChange={(e) =>
            onChange({
              ...d,
              coverage: e.target.value.split("\n").filter(Boolean),
            })
          }
        />
      </label>
    </div>
  );
}
