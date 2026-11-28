import { useState } from "react";
import type { Dataset } from "../../core/publication";
import type { RosterRun } from "../../ingestion/members";
import { previewRoster } from "./rosterDraft";

export function RosterIntake({
  dataset,
  load,
  onApply,
}: {
  dataset: Dataset;
  load: () => Promise<RosterRun>;
  onApply: (draft: Dataset) => void;
}) {
  const [run, setRun] = useState<RosterRun>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const proposal = run ? previewRoster(dataset, run) : undefined;
  const stage = async () => {
    setBusy(true);
    setRun(undefined);
    setMessage("");
    try {
      const captured = await load();
      previewRoster(dataset, captured);
      setRun(captured);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="editor-details">
      <summary>Scheduled roster update</summary>
      <button type="button" disabled={busy} onClick={() => void stage()}>
        {busy ? "Loading roster…" : "Preview latest roster capture"}
      </button>
      {message && <p role="status">{message}</p>}
      {run && proposal && (
        <section aria-label="Roster changes">
          <p>
            Captured {run.asOf.slice(0, 10)} · {proposal.added.length} new ·{" "}
            {proposal.changed.length} updated · {proposal.missing.length}{" "}
            missing from the capture
          </p>
          {proposal.added.length > 0 && (
            <>
              <h3>New legislators</h3>
              <ul>
                {proposal.added.map((member) => (
                  <li key={member.id}>
                    {member.name} · {member.state} · {member.chamber}
                  </li>
                ))}
              </ul>
            </>
          )}
          {proposal.changed.length > 0 && (
            <>
              <h3>Updated legislators</h3>
              <ul>
                {proposal.changed.map((member) => {
                  const previous = dataset.members.find(
                    (old) => old.id === member.id,
                  )!;
                  const detail = (row: typeof member) =>
                    `${row.name} · ${row.party} · ${row.state}${row.district === undefined ? "" : ` ${row.district}`} · ${row.chamber} · ${row.status} · since ${row.since}`;
                  return (
                    <li key={member.id}>
                      {detail(previous)} → {detail(member)}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {proposal.missing.length > 0 && (
            <>
              <h3>Absent from the capture</h3>
              <p>
                These legislators stay on the draft roster pending staff review.
              </p>
              <ul>
                {proposal.missing.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              onApply(proposal.dataset);
              setRun(undefined);
              setMessage(
                "Roster changes added to the draft. Save and submit it for review.",
              );
            }}
          >
            Apply roster changes to draft
          </button>
        </section>
      )}
    </details>
  );
}
