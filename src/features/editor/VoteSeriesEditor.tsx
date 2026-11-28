import { useState, type FormEvent } from "react";
import type { Dataset } from "../../core/publication";
import type { VoteSeries } from "../../core/types";
import { seriesVisibility, validateVoteSeries } from "../../core/voteSeries";

type EditableSeries = Omit<VoteSeries, "id"> & { id?: string };
const empty: EditableSeries = {
  name: "",
  rationale: "",
  chamber: "House",
  voteIds: [],
};

export function VoteSeriesEditor({
  dataset,
  onChange,
}: {
  dataset: Dataset;
  onChange: (draft: Dataset) => void;
}) {
  const [editing, setEditing] = useState<EditableSeries>(empty);
  const [error, setError] = useState("");
  const series = Array.isArray(dataset.voteSeries) ? dataset.voteSeries : [];
  const candidates = dataset.votes
    .filter(
      (vote) =>
        vote.chamber === editing.chamber && vote.kind !== "cosponsorship",
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const item: VoteSeries = {
      ...editing,
      id: editing.id ?? crypto.randomUUID(),
      name: editing.name.trim(),
      rationale: editing.rationale.trim(),
    };
    const next = editing.id
      ? series.map((row) => (row.id === editing.id ? item : row))
      : [...series, item];
    const failures = validateVoteSeries(
      next,
      new Map(dataset.votes.map((vote) => [vote.id, vote])),
    );
    if (failures.length) {
      setError(failures.join(" "));
      return;
    }
    onChange({ ...dataset, voteSeries: next });
    setEditing(empty);
    setError("");
  };
  return (
    <details className="editor-details">
      <summary>Repeated-vote series</summary>
      <p>
        Group roll calls from one chamber that test the same reform question.
        Explain how staff determined they are comparable.
      </p>
      {seriesVisibility(dataset) === "preview" && (
        <p>
          Preview series. Public trends stay hidden for demo and placeholder
          publications.
        </p>
      )}
      {series.length > 0 && (
        <ul>
          {series.map((row) => (
            <li key={row.id}>
              {row.name} · {row.chamber} · {row.voteIds.length} roll calls{" "}
              <button
                type="button"
                onClick={() => {
                  setEditing(row);
                  setError("");
                }}
              >
                Edit {row.name}
              </button>{" "}
              <button
                type="button"
                onClick={() => {
                  onChange({
                    ...dataset,
                    voteSeries: series.filter((item) => item.id !== row.id),
                  });
                  if (editing.id === row.id) setEditing(empty);
                  setError("");
                }}
              >
                Remove {row.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="editor-grid" onSubmit={save}>
        <label>
          Series name
          <input
            required
            value={editing.name}
            onChange={(event) =>
              setEditing({ ...editing, name: event.target.value })
            }
          />
        </label>
        <label>
          Chamber
          <select
            value={editing.chamber}
            onChange={(event) =>
              setEditing({
                ...editing,
                chamber: event.target.value as VoteSeries["chamber"],
                voteIds: [],
              })
            }
          >
            <option>House</option>
            <option>Senate</option>
          </select>
        </label>
        <label>
          Why these votes are comparable
          <textarea
            required
            value={editing.rationale}
            onChange={(event) =>
              setEditing({ ...editing, rationale: event.target.value })
            }
          />
        </label>
        <fieldset>
          <legend>Roll calls in this series</legend>
          {candidates.map((vote) => (
            <label key={vote.id}>
              <input
                type="checkbox"
                checked={editing.voteIds.includes(vote.id)}
                onChange={(event) =>
                  setEditing({
                    ...editing,
                    voteIds: event.target.checked
                      ? [...editing.voteIds, vote.id]
                      : editing.voteIds.filter((id) => id !== vote.id),
                  })
                }
              />
              {vote.date} · {vote.bill} · {vote.title}
            </label>
          ))}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button>
          {editing.id ? "Save series changes to draft" : "Add series to draft"}
        </button>
        {editing.id && (
          <button
            type="button"
            onClick={() => {
              setEditing(empty);
              setError("");
            }}
          >
            Cancel edit
          </button>
        )}
      </form>
    </details>
  );
}
