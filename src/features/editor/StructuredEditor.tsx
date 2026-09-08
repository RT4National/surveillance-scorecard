import { useState } from "react";
import type { Dataset } from "../../core/publication";
import type { Member, Outcome, Party, Rubric, Vote } from "../../core/types";
import { defaultGradeBands } from "../../core/scoring";

export function StructuredEditor({
  dataset: d,
  onChange,
}: {
  dataset: Dataset;
  onChange: (d: Dataset) => void;
}) {
  const [voteId, setVoteId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [recordMember, setRecordMember] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("Yes");
  const [party, setParty] = useState<Party>("Democratic");
  const v = d.votes.find((v) => v.id === voteId) ?? d.votes[0];
  const m = d.members.find((m) => m.id === memberId) ?? d.members[0];
  const vote = (patch: Partial<Vote>) =>
    onChange({
      ...d,
      votes: d.votes.map((x) => (x.id === v?.id ? { ...x, ...patch } : x)),
    });
  const member = (patch: Partial<Member>) =>
    onChange({
      ...d,
      members: d.members.map((x) => (x.id === m?.id ? { ...x, ...patch } : x)),
    });
  const rubric = (patch: Partial<Rubric>) =>
    onChange({ ...d, rubric: { ...d.rubric, ...patch } });
  const num = (value: string) => (value === "" ? undefined : Number(value));
  return (
    <div className="structured-editor">
      <h2>Dataset identity</h2>
      <div className="editor-grid">
        <label>
          Dataset identifier
          <input
            value={d.id}
            onChange={(e) => onChange({ ...d, id: e.target.value })}
          />
        </label>
        <label>
          Evidence cutoff date
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
      <p>
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
      <h2>Legislation and scored votes</h2>
      <label>
        Select a vote
        <select value={v?.id ?? ""} onChange={(e) => setVoteId(e.target.value)}>
          {d.votes.map((x) => (
            <option key={x.id} value={x.id}>
              {x.bill} · {x.title}
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
      {v && (
        <>
          <div className="editor-grid">
            {(["bill", "title", "topic", "administration"] as const).map(
              (key) => (
                <label key={key}>
                  {
                    {
                      bill: "Bill or amendment",
                      title: "Plain-language title",
                      topic: "Issue topic",
                      administration: "Presidential administration",
                    }[key]
                  }
                  <input
                    value={v[key]}
                    onChange={(e) => vote({ [key]: e.target.value })}
                  />
                </label>
              ),
            )}
            <label>
              Vote date
              <input
                type="date"
                value={v.date}
                onChange={(e) => vote({ date: e.target.value })}
              />
            </label>
            <label>
              Source URL
              <input
                type="url"
                value={v.source ?? ""}
                onChange={(e) => vote({ source: e.target.value || null })}
              />
            </label>
            <label>
              Chamber
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
              President's party
              <select
                value={v.presidentParty}
                onChange={(e) =>
                  vote({ presidentParty: e.target.value as Party })
                }
              >
                <option>Democratic</option>
                <option>Republican</option>
                <option>Independent</option>
              </select>
            </label>
            <label>
              Reform position
              <select
                value={v.reformVote}
                onChange={(e) =>
                  vote({ reformVote: e.target.value as "Yes" | "No" })
                }
              >
                <option>Yes</option>
                <option>No</option>
              </select>
            </label>
            <label>
              Scoring weight
              <input
                type="number"
                min={0.01}
                max={100}
                step={0.1}
                value={v.weight}
                onChange={(e) => vote({ weight: Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            Why this position advances surveillance reform
            <textarea
              rows={4}
              value={v.rationale}
              onChange={(e) => vote({ rationale: e.target.value })}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              onChange({
                ...d,
                votes: d.votes.filter((x) => x.id !== v.id),
                records: d.records.filter((r) => r.voteId !== v.id),
              });
              setVoteId("");
            }}
          >
            Exclude this vote and its evidence from the draft
          </button>
          <p>
            Exclusion affects only this unsaved draft. Existing publications
            remain available.
          </p>
          <h3>Member evidence for this vote</h3>
          <div className="editor-grid">
            <label>
              Member
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
                <option value="">Select a member</option>
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
              Recorded outcome
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as Outcome)}
              >
                {["Yes", "No", "Not voting", "Not eligible"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Party at time of vote
              <select
                value={party}
                onChange={(e) => setParty(e.target.value as Party)}
              >
                <option>Democratic</option>
                <option>Republican</option>
                <option>Independent</option>
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
                    (r) => !(r.memberId === recordMember && r.voteId === v.id),
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
            Add or replace member evidence
          </button>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Outcome</th>
                <th>Party at vote</th>
                <th>Draft action</th>
              </tr>
            </thead>
            <tbody>
              {d.records
                .filter((r) => r.voteId === v.id)
                .map((r) => (
                  <tr key={r.memberId}>
                    <td>
                      {d.members.find((m) => m.id === r.memberId)?.name ??
                        r.memberId}
                    </td>
                    <td>{r.outcome}</td>
                    <td>{r.partyAtVote}</td>
                    <td>
                      <button
                        type="button"
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
                ))}
            </tbody>
          </table>
        </>
      )}
      <h2>Scoring policy</h2>
      <div className="editor-grid">
        <label>
          Methodology version
          <input
            value={d.rubric.version}
            onChange={(e) => rubric({ version: e.target.value })}
          />
        </label>
        {(
          [
            { key: "minVotes", label: "Minimum scored votes", min: 1 },
            {
              key: "minPerContext",
              label: "Minimum votes per presidential-party context",
              min: 1,
            },
            {
              key: "consistencyThreshold",
              label: "Consistency threshold (%)",
              min: 51,
            },
            {
              key: "lookbackYears",
              label: "Lookback years (blank = all)",
              min: 0.1,
            },
            {
              key: "halfLifeYears",
              label: "Weight half-life years (blank = no decay)",
              min: 0.1,
            },
            {
              key: "minSharedTopics",
              label: "Minimum comparable issue topics",
              min: 0,
            },
          ] as const
        ).map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              min={f.min}
              step={f.key.includes("Years") ? 0.1 : 1}
              value={d.rubric[f.key] ?? ""}
              onChange={(e) => rubric({ [f.key]: num(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <h3>Grade thresholds</h3>
      <p>Highest threshold first; the final threshold must be zero.</p>
      {(d.rubric.gradeBands ?? defaultGradeBands).map((band, i) => (
        <div className="editor-grid" key={i}>
          <label>
            Grade label
            <input
              value={band.label}
              onChange={(e) =>
                rubric({
                  gradeBands: (d.rubric.gradeBands ?? defaultGradeBands).map(
                    (b, j) => (j === i ? { ...b, label: e.target.value } : b),
                  ),
                })
              }
            />
          </label>
          <label>
            Minimum score
            <input
              type="number"
              min={0}
              max={100}
              value={band.minimum}
              onChange={(e) =>
                rubric({
                  gradeBands: (d.rubric.gradeBands ?? defaultGradeBands).map(
                    (b, j) =>
                      j === i ? { ...b, minimum: Number(e.target.value) } : b,
                  ),
                })
              }
            />
          </label>
        </div>
      ))}
      <h2>Member details</h2>
      <label>
        Member
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
        <>
          <div className="editor-grid">
            <label>
              Display name
              <input
                value={m.name}
                onChange={(e) => member({ name: e.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={m.status}
                onChange={(e) =>
                  member({ status: e.target.value as Member["status"] })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="deceased">Deceased</option>
              </select>
            </label>
            <label>
              Current party
              <select
                value={m.party}
                onChange={(e) => member({ party: e.target.value as Party })}
              >
                <option>Democratic</option>
                <option>Republican</option>
                <option>Independent</option>
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
          <details>
            <summary>Portrait and rights review</summary>
            <p>
              Portraits need a documented license or public-domain basis and a
              named reviewer.
            </p>
            {(
              ["url", "attribution", "rightsSource", "reviewedBy"] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    url: "Image URL",
                    attribution: "Attribution",
                    rightsSource: "Rights evidence URL",
                    reviewedBy: "Rights reviewer",
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
              Rights status
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
              Remove portrait from draft
            </button>
          </details>
        </>
      )}
    </div>
  );
}
