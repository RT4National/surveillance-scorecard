import { useEffect, useMemo, useState } from "react";
import type { Dataset, Publication } from "../../core/publication";
import { scoreMember } from "../../core/scoring";
import { publishedScore } from "../../core/publication-scores";
import { loadArchivedPublication } from "../../core/reports";
import { StructuredEditor } from "./StructuredEditor";
import "./editor.css";

type Draft = {
  id: string;
  dataset: Dataset;
  summary: string;
  version: number;
  status: string;
  author: string;
  reviewer: string | null;
  base_publication_id: string | null;
};
type DraftSummary = Omit<Draft, "dataset">;
type Correction = {
  id: string;
  publication_id: string;
  evidence_id: string;
  message: string;
  status: string;
};
async function call<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const r = await fetch(`/scorecard/api/staff/${path}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = (await r.json()) as T & { error?: string; errors?: string[] };
  if (!r.ok) throw new Error([b.error, ...(b.errors ?? [])].join(": "));
  return b;
}
export function EditorPage({ dataset }: { dataset?: Dataset }) {
  const [session, setSession] = useState<{
    email: string;
    role: string;
  } | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [active, setActive] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [status, setStatus] = useState<Record<string, unknown>>({});
  const [audit, setAudit] = useState<unknown[]>([]);
  const [rollbackId, setRollbackId] = useState("");
  const [reason, setReason] = useState("");
  const [cloneId, setCloneId] = useState("");
  const [currentBase, setCurrentBase] = useState<string | null>(null);
  const [comparisonPublication, setComparisonPublication] =
    useState<Publication | null>(null);
  const [comparisonDataset, setComparisonDataset] = useState<
    Dataset | undefined
  >(dataset);
  const refresh = async () => {
    const [s, d, c, o, a] = await Promise.all([
      call<{ email: string; role: string }>("session"),
      call<DraftSummary[]>("drafts"),
      call<Correction[]>("corrections"),
      call<Record<string, unknown>>("status"),
      call<unknown[]>("audit"),
    ]);
    setSession(s);
    setDrafts(d);
    setCorrections(c);
    setStatus(o);
    setAudit(a);
    const base =
      (o.pointer as { publication_id?: string | null } | undefined)
        ?.publication_id ?? null;
    if (base) {
      const p = await loadArchivedPublication(base);
      setComparisonPublication(p);
      setComparisonDataset(p.dataset);
    } else {
      setComparisonDataset(dataset);
      setComparisonPublication(null);
    }
    setCurrentBase(base);
    return d;
  };
  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message)));
  }, []);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  const select = (d: Draft) => {
    setActive(d);
    setText(JSON.stringify(d.dataset, null, 2));
    setSummary(d.summary);
  };
  const loadDraft = async (id: string) => {
    const draft = await call<Draft>(`drafts/${encodeURIComponent(id)}`);
    if (draft.id !== id || !draft.dataset)
      throw new Error("Requested draft could not be loaded");
    select(draft);
  };
  const parsed = useMemo(() => {
    try {
      return {
        preview: text ? (JSON.parse(text) as Dataset) : null,
        error: "",
      };
    } catch {
      return { preview: null, error: "The dataset must be valid JSON." };
    }
  }, [text]);
  const preview = parsed.preview;
  const unsaved =
    !!active &&
    (text !== JSON.stringify(active.dataset, null, 2) ||
      summary !== active.summary);
  const staleBase = !!active && active.base_publication_id !== currentBase;
  let parseError = parsed.error;
  const canEdit =
    !!preview &&
    typeof preview.id === "string" &&
    typeof preview.asOf === "string" &&
    Array.isArray(preview.members) &&
    preview.members.every(
      (m) =>
        m &&
        typeof m.name === "string" &&
        Array.isArray(m.committees) &&
        Array.isArray(m.caucuses),
    ) &&
    Array.isArray(preview.votes) &&
    preview.votes.every(
      (v) => v && typeof v.title === "string" && typeof v.date === "string",
    ) &&
    Array.isArray(preview.records) &&
    preview.records.every((r) => r && typeof r.memberId === "string") &&
    Array.isArray(preview.coverage) &&
    preview.coverage.every((c) => typeof c === "string") &&
    !!preview.rubric &&
    typeof preview.rubric.version === "string";
  const impact = useMemo(() => {
    let changes: { name: string; before: string; after: string }[] = [];
    try {
      if (preview)
        changes = preview.members.map((m) => ({
          name: m.name,
          before: comparisonPublication
            ? comparisonPublication.dataset.members.some(
                (member) => member.id === m.id,
              )
              ? publishedScore(comparisonPublication, m).grade
              : "—"
            : comparisonDataset
              ? scoreMember(
                  m,
                  comparisonDataset.votes,
                  comparisonDataset.records,
                  comparisonDataset.rubric,
                  comparisonDataset.asOf,
                ).grade
              : "—",
          after: scoreMember(
            m,
            preview!.votes,
            preview!.records,
            preview!.rubric,
            preview!.asOf,
          ).grade,
        }));
    } catch (e) {
      return {
        changes: [],
        error: e instanceof Error ? e.message : "Invalid preview",
      };
    }
    return { changes, error: "" };
  }, [preview, comparisonDataset, comparisonPublication]);
  const changes = impact.changes;
  parseError ||= impact.error;
  return (
    <section className="editor-workspace">
      <p className="eyebrow">Editorial workspace</p>
      <h1>Evidence before publication.</h1>
      <p>
        Stage a complete dataset, inspect grade changes, and have a second
        person review it. Published snapshots preserve the evidence and rubric
        together.
      </p>
      {error && (
        <p role="alert" className="editor-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!session ? (
        <p>
          Sign in through the organization’s Cloudflare Access application to
          use this workspace. Staff access must be configured before editing is
          available.
        </p>
      ) : (
        <>
          <p>
            Signed in as {session.email} · {session.role}
          </p>
          <fieldset disabled={busy}>
            <legend>Drafts</legend>
            <button
              onClick={() => {
                setActive(null);
                setSummary("");
                setText(
                  comparisonDataset
                    ? JSON.stringify(comparisonDataset, null, 2)
                    : "",
                );
              }}
            >
              New draft
            </button>
            <button
              onClick={() =>
                void run(async () => {
                  await refresh();
                  setNotice(
                    "Current publication and grade comparison refreshed.",
                  );
                })
              }
            >
              Refresh publication and drafts
            </button>
            {active && (
              <p>
                Draft base:{" "}
                {active.base_publication_id ?? "No prior publication"} ·
                Current: {currentBase ?? "No publication"}
              </p>
            )}
            {staleBase && (
              <p role="alert">
                A newer publication changed this draft’s base. Compare its
                grades and evidence with the current publication before
                rebasing. Rebase retains the saved draft contents and clears
                approval.
              </p>
            )}
            {active && staleBase && (
              <button
                disabled={unsaved || active.status === "published"}
                onClick={() =>
                  void run(async () => {
                    await call(`drafts/${active.id}/rebase`, "POST", {
                      version: active.version,
                      basePublicationId: currentBase,
                    });
                    await refresh();
                    await loadDraft(active.id);
                    setNotice(
                      "Draft rebased on the displayed publication. Review is required again.",
                    );
                  })
                }
              >
                Rebase saved draft after comparison
              </button>
            )}
            <label>
              Clone a published snapshot (publication ID)
              <input
                value={cloneId}
                onChange={(e) => setCloneId(e.target.value)}
              />
            </label>
            <button
              disabled={!cloneId}
              onClick={() =>
                void run(async () => {
                  const p = await loadArchivedPublication(cloneId);
                  setActive(null);
                  setText(
                    JSON.stringify(
                      {
                        ...p.dataset,
                        id: `${p.dataset.id}-revision-${Date.now()}`,
                      },
                      null,
                      2,
                    ),
                  );
                  setSummary(`Correction to publication ${p.id}`);
                  setNotice(
                    "Publication cloned into an unsaved correction draft.",
                  );
                })
              }
            >
              Start correction draft
            </button>
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => void run(() => loadDraft(d.id))}
              >
                {d.summary} · {d.status} · v{d.version}
              </button>
            ))}
            <label>
              Change summary
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
            <label>
              Import staged dataset JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 12_000_000) {
                      setError("File exceeds 12 MB");
                      return;
                    }
                    void file
                      .text()
                      .then(setText)
                      .catch(() =>
                        setError("The selected file could not be read"),
                      );
                  }
                }}
              />
            </label>
            {preview && canEdit && (
              <fieldset disabled={active?.status === "published"}>
                <legend>Edit evidence and policy</legend>
                <StructuredEditor
                  dataset={preview}
                  onChange={(d) => setText(JSON.stringify(d, null, 2))}
                />
              </fieldset>
            )}
            <details>
              <summary>Advanced dataset JSON and export</summary>
              <label>
                Dataset and scoring policy
                <textarea
                  rows={18}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <button
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([text], { type: "application/json" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${preview?.id ?? "draft"}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Download draft JSON
              </button>
            </details>
            {parseError && <p role="alert">{parseError}</p>}
            <button
              disabled={
                !preview ||
                !!parseError ||
                staleBase ||
                active?.status === "published"
              }
              onClick={() =>
                void run(async () => {
                  const b = await call<{ id: string }>(
                    active ? `drafts/${active.id}` : "drafts",
                    active ? "PUT" : "POST",
                    {
                      dataset: preview,
                      summary,
                      version: active?.version,
                      basePublicationId: active
                        ? active.base_publication_id
                        : currentBase,
                    },
                  );
                  await refresh();
                  await loadDraft(b.id);
                  setNotice(
                    "Draft saved. Any previous review has been cleared.",
                  );
                })
              }
            >
              Save draft
            </button>
            {active && (
              <>
                <button
                  disabled={
                    unsaved ||
                    staleBase ||
                    active.status !== "draft" ||
                    active.author === session.email ||
                    session.role === "editor"
                  }
                  onClick={() =>
                    void run(async () => {
                      await call(`drafts/${active.id}/review`, "POST", {
                        version: active.version,
                      });
                      await refresh();
                      await loadDraft(active.id);
                      setNotice("Review recorded.");
                    })
                  }
                >
                  Approve reviewed draft
                </button>
                <button
                  disabled={
                    unsaved ||
                    staleBase ||
                    active.status !== "review" ||
                    session.role !== "publisher"
                  }
                  onClick={() =>
                    void run(async () => {
                      await call(`drafts/${active.id}/publish`, "POST", {
                        version: active.version,
                      });
                      setActive(null);
                      setNotice(
                        "Immutable publication created and selected as current.",
                      );
                    })
                  }
                >
                  Publish approved snapshot
                </button>
                <p>
                  Author: {active.author} · Reviewer:{" "}
                  {active.reviewer ?? "Awaiting independent review"}
                </p>
              </>
            )}
          </fieldset>
          {changes.length > 0 && (
            <>
              <h2>Grade impact preview</h2>
              <p>
                Computed from the editor contents. Save before requesting
                review.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Current</th>
                    <th>Draft</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c, i) => (
                    <tr key={i}>
                      <td>{c.name}</td>
                      <td>{c.before}</td>
                      <td>{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <h2>Corrections queue</h2>
          {!corrections.length && <p>No corrections submitted.</p>}
          {corrections.map((c) => (
            <article key={c.id}>
              <p>
                <strong>{c.status}</strong> · {c.publication_id}
              </p>
              <code>{c.evidence_id}</code>
              <p>{c.message}</p>
              {c.status === "open" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    void run(async () => {
                      await call(`corrections/${c.id}`, "PATCH", {
                        status: form.get("status"),
                        resolution: form.get("resolution"),
                      });
                    });
                  }}
                >
                  <label>
                    Resolution
                    <input name="resolution" minLength={5} required />
                  </label>
                  <select name="status" aria-label="Correction decision">
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">
                      Dismissed with explanation
                    </option>
                  </select>
                  <button disabled={busy}>Record decision</button>
                </form>
              )}
            </article>
          ))}
          <h2>Select an earlier publication</h2>
          <p>
            Changing the current pointer preserves all published snapshots and
            records the reason in the audit log.
          </p>
          <fieldset disabled={busy || session.role !== "publisher"}>
            <label>
              Publication ID
              <input
                value={rollbackId}
                onChange={(e) => setRollbackId(e.target.value)}
              />
            </label>
            <label>
              Reason
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              onClick={() =>
                void run(async () => {
                  await call("rollback", "POST", {
                    publicationId: rollbackId,
                    reason,
                    revision: (
                      status.pointer as { revision: number } | undefined
                    )?.revision,
                  });
                  setNotice("Publication pointer updated.");
                })
              }
            >
              Select publication
            </button>
          </fieldset>
          <details>
            <summary>Operational readiness and source freshness</summary>
            <pre>{JSON.stringify(status, null, 2)}</pre>
          </details>
          <details>
            <summary>Audit history</summary>
            <pre>{JSON.stringify(audit, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
