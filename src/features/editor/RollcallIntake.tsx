import { useState, type FormEvent } from "react";
import type { Dataset } from "../../core/publication";
import type { Party, Vote } from "../../core/types";
import type { RollcallStage } from "../../ingestion/rollcalls";
import { addReviewedRollcall, unmatchedRollcallMembers } from "./rollcallDraft";

export function RollcallIntake({
  dataset,
  stageRollcall,
  onAdd,
}: {
  dataset: Dataset;
  stageRollcall: (url: string) => Promise<RollcallStage>;
  onAdd: (draft: Dataset, voteId: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<RollcallStage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const missing = stage ? unmatchedRollcallMembers(dataset, stage) : [];
  const duplicate = stage && dataset.votes.some(({ id }) => id === stage.id);
  const fetchStage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStage(undefined);
    setError("");
    setBusy(true);
    try {
      setStage(await stageRollcall(url.trim()));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stage) return;
    const values = new FormData(event.currentTarget);
    const text = (name: string) => String(values.get(name) ?? "").trim();
    try {
      const next = addReviewedRollcall(dataset, stage, {
        title: text("title"),
        administration: text("administration"),
        presidentParty: text("presidentParty") as Party,
        reformVote: text("reformVote") as Vote["reformVote"],
        weight: Number(text("weight")),
        topic: text("topic"),
        rationale: text("rationale"),
      });
      onAdd(next, stage.id);
      setStage(undefined);
      setUrl("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <details className="editor-details">
      <summary>Add a roll call from an official source</summary>
      <form className="editor-row" onSubmit={fetchStage}>
        <label>
          Official roll-call URL
          <input
            required
            type="url"
            value={url}
            disabled={busy}
            onChange={(event) => {
              setUrl(event.target.value);
              setStage(undefined);
              setError("");
            }}
          />
        </label>
        <button disabled={busy}>
          {busy ? "Reading roll call…" : "Read roll call"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {stage && (
        <>
          <p>
            {stage.bill} · {stage.question} · {stage.chamber} · {stage.date} ·{" "}
            {stage.records.length} recorded ballots
          </p>
          {stage.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          {missing.length > 0 && (
            <p role="alert">
              Add these legislators to the roster before importing:{" "}
              {missing.join(", ")}.
            </p>
          )}
          {duplicate && (
            <p role="alert">This roll call is already in the draft.</p>
          )}
          {stage.date > dataset.asOf && (
            <p>
              The vote is after this draft’s evidence cutoff. Update the cutoff
              to include it in grades.
            </p>
          )}
          <form className="editor-grid" key={stage.id} onSubmit={add}>
            <label>
              Short title
              <input name="title" required />
            </label>
            <label>
              President at the time
              <input name="administration" required />
            </label>
            <label>
              President’s party
              <select name="presidentParty" defaultValue="" required>
                <option value="" disabled>
                  Choose a party
                </option>
                <option>Democratic</option>
                <option>Republican</option>
                <option>Independent</option>
              </select>
            </label>
            <label>
              Pro-reform vote
              <select name="reformVote" defaultValue="" required>
                <option value="" disabled>
                  Choose the reform position
                </option>
                <option>Yes</option>
                <option>No</option>
              </select>
            </label>
            <label>
              Weight
              <input
                name="weight"
                type="number"
                min="0"
                max="100"
                step="any"
                defaultValue="1"
                required
              />
            </label>
            <label>
              Topic
              <input name="topic" required />
            </label>
            <label>
              Why this vote matters
              <textarea name="rationale" required />
            </label>
            <button disabled={missing.length > 0 || duplicate}>
              Add reviewed roll call to draft
            </button>
          </form>
        </>
      )}
    </details>
  );
}
