import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Dataset, Publication } from "../../core/publication";
import { defaultGradeBands, scoreMember } from "../../core/scoring";
import { publishedScore } from "../../core/publication-scores";
import { loadArchivedPublication } from "../../core/reports";
import {
  GradingRulesPanel,
  LegislatorsPanel,
  ScorecardDataDetails,
  VotesPanel,
} from "./StructuredEditor";
import {
  auditActionLabel,
  draftStatusLabel,
  gradeDirection,
  roleLabel,
  type GradeChange,
} from "./plain";
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
type AuditEntry = {
  sequence?: number;
  at?: string;
  actor?: string;
  action?: string;
  target?: string;
};
// Staging's open staff mode identifies people by a self-chosen name, not a login.
const stagingNameKey = "scorecard-staging-name";
function readStagingName() {
  try {
    return localStorage.getItem(stagingNameKey) ?? "";
  } catch {
    return "";
  }
}
async function call<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const name = readStagingName();
  const r = await fetch(`/scorecard/api/staff/${path}`, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(name ? { "X-Staging-Staff": encodeURIComponent(name) } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const b = (await r.json()) as T & { error?: string; errors?: string[] };
  if (!r.ok) throw new Error([b.error, ...(b.errors ?? [])].join(": "));
  return b;
}

const tabs = [
  { id: "votes", label: "Votes to score" },
  { id: "legislators", label: "Legislators" },
  { id: "rules", label: "Grading rules" },
  { id: "review", label: "Review & publish" },
  { id: "corrections", label: "Reader corrections" },
  { id: "history", label: "History" },
] as const;
type TabId = (typeof tabs)[number]["id"];
const steps = ["Draft", "Waiting for review", "Approved", "Published"];

export function EditorPage({ dataset }: { dataset?: Dataset }) {
  const baseId = useId();
  const [session, setSession] = useState<{
    email: string;
    role: string;
    open?: boolean;
  } | null>(null);
  const [stagingName, setStagingName] = useState(readStagingName);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [active, setActive] = useState<Draft | null>(null);
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("votes");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
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
      call<{ email: string; role: string; open?: boolean }>("session"),
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
      return {
        preview: null,
        error:
          "The raw data in Developer tools has a formatting error, so the draft cannot be shown or saved.",
      };
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
    let changes: GradeChange[] = [];
    try {
      if (preview) {
        const bands = preview.rubric?.gradeBands ?? defaultGradeBands;
        changes = preview.members.map((m) => {
          const before = comparisonPublication
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
              : "—";
          const after = scoreMember(
            m,
            preview.votes,
            preview.records,
            preview.rubric,
            preview.asOf,
          ).grade;
          return {
            id: m.id,
            name: m.name,
            before,
            after,
            direction: gradeDirection(before, after, bands),
          };
        });
      }
    } catch (e) {
      return {
        changes: [],
        error: `These settings cannot produce grades: ${e instanceof Error ? e.message : "invalid draft"}`,
      };
    }
    return { changes, error: "" };
  }, [preview, comparisonDataset, comparisonPublication]);
  const changes = impact.changes;
  parseError ||= impact.error;
  const count = (d: GradeChange["direction"]) =>
    changes.filter((c) => c.direction === d).length;
  const changed = changes.filter((c) => c.direction !== "same");
  const setDataset = (d: Dataset) => setText(JSON.stringify(d, null, 2));
  const locked = active?.status === "published";

  const saveBlocked = !preview
    ? "There is no draft to save yet. Start a new draft or open a saved one."
    : parseError
      ? parseError
      : staleBase
        ? "The live scorecard changed since this draft started. Update the draft first (see the notice above)."
        : locked
          ? "This draft is already published. Start a new draft to make more changes."
          : "";
  const approveBlocked = !session
    ? "Sign in first."
    : !active
      ? "Save this draft first."
      : unsaved
        ? "Save your changes first."
        : staleBase
          ? "Update this draft to the latest published version first."
          : active.status === "review"
            ? "This draft is already approved."
            : active.status === "published"
              ? "This draft is already published."
              : active.status !== "draft"
                ? "This draft cannot be approved in its current state."
                : active.author === session.email
                  ? "Someone other than the author must approve this draft."
                  : session.role === "editor"
                    ? "Your account can write drafts but not approve them. Ask a reviewer or publisher."
                    : "";
  const publishBlocked = !session
    ? "Sign in first."
    : !active
      ? "Save this draft and have it approved first."
      : unsaved
        ? "Save your changes first. Saving clears any earlier approval."
        : staleBase
          ? "Update this draft to the latest published version first."
          : active.status === "published"
            ? "This draft is already published."
            : active.status !== "review"
              ? "A second person must approve this draft before it can be published."
              : session.role !== "publisher"
                ? "Only a publisher can publish. Ask a publisher to finish this step."
                : "";
  const currentStep =
    !active || unsaved
      ? 0
      : active.status === "draft"
        ? 1
        : active.status === "review"
          ? 2
          : active.status === "published"
            ? 3
            : 0;

  const save = (message: string) =>
    run(async () => {
      const b = await call<{ id: string }>(
        active ? `drafts/${active.id}` : "drafts",
        active ? "PUT" : "POST",
        {
          dataset: preview,
          summary,
          version: active?.version,
          basePublicationId: active ? active.base_publication_id : currentBase,
        },
      );
      await refresh();
      await loadDraft(b.id);
      setNotice(message);
    });

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const next =
      e.key === "ArrowRight"
        ? (i + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (i - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(tabs[next].id);
    tabRefs.current[tabs[next].id]?.focus();
  };

  const editorPanel = (Panel: typeof VotesPanel): React.ReactNode =>
    !preview || !canEdit ? (
      <p className="editor-empty">
        {parseError ||
          (text
            ? "This draft's data is incomplete. Fix it in Developer tools at the bottom of the page."
            : "Open a saved draft or start a new one above to begin.")}
      </p>
    ) : (
      <fieldset disabled={locked} className="editor-plain">
        {locked && (
          <p className="editor-note">
            This draft has been published and can no longer be changed. Start a
            new draft to make further changes.
          </p>
        )}
        <Panel dataset={preview} onChange={setDataset} />
      </fieldset>
    );

  const pointer = status.pointer as
    { publication_id?: string | null; revision?: number } | undefined;

  return (
    <section className="editor-workspace">
      <header className="editor-header">
        <div>
          <p className="eyebrow">Staff workspace</p>
          <h1>Prepare and publish scorecard updates</h1>
          <p className="editor-lede">
            Make changes in a draft, check whose grades would change, and have a
            second person approve before anything goes live.
          </p>
        </div>
        {session && (
          <p className="editor-who">
            Your name: <strong>{session.email}</strong>
            <br />
            <span>You {roleLabel[session.role] ?? session.role}</span>
          </p>
        )}
      </header>
      <div aria-live="polite" className="editor-live">
        {error && (
          <p role="alert" className="editor-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="editor-notice">
            {notice}
          </p>
        )}
      </div>
      {(session?.open || error.includes("staging name")) && (
        <form
          className="editor-card"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              localStorage.setItem(stagingNameKey, stagingName.trim());
            } catch {
              setError("This browser cannot store a staging name");
              return;
            }
            void run(async () => {});
          }}
        >
          <p>
            Test site only: these staff pages are open to anyone with the link.
            Enter your name so drafts record who wrote and who approved them.
            This is not a login, and a second person must approve each draft.
          </p>
          <div className="editor-row">
            <label>
              Your name
              <input
                value={stagingName}
                maxLength={40}
                onChange={(e) => setStagingName(e.target.value)}
              />
            </label>
            <button disabled={busy || !stagingName.trim()}>
              Use this name
            </button>
          </div>
        </form>
      )}
      {!session ? (
        <p>
          Sign in through the organization’s Cloudflare Access application to
          use this workspace. Staff access must be configured before editing is
          available.
        </p>
      ) : (
        <>
          <section className="editor-card editor-draftbar" aria-label="Draft">
            <div className="editor-row">
              <label>
                Open a saved draft
                <select
                  value={active?.id ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) void run(() => loadDraft(id));
                  }}
                >
                  <option value="" disabled>
                    {active || text ? "New, unsaved draft" : "Choose a draft…"}
                  </option>
                  {drafts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.summary || "Untitled draft"} –{" "}
                      {draftStatusLabel[d.status] ?? d.status} (version{" "}
                      {d.version})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setActive(null);
                  setSummary("");
                  setText(
                    comparisonDataset
                      ? JSON.stringify(comparisonDataset, null, 2)
                      : "",
                  );
                  setNotice(
                    "New draft started from the live scorecard. It is not saved yet.",
                  );
                }}
              >
                Start a new draft
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await refresh();
                    setNotice("Drafts and the live scorecard were reloaded.");
                  })
                }
              >
                Reload
              </button>
            </div>
            <div className="editor-row">
              <label>
                Describe your changes
                <input
                  value={summary}
                  disabled={busy || locked}
                  placeholder="For example: Add April 2024 warrant amendment"
                  onChange={(e) => setSummary(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="editor-primary"
                disabled={busy || !!saveBlocked}
                aria-describedby={`${baseId}-save-why`}
                onClick={() =>
                  void save(
                    "Draft saved. It now needs approval from someone else; any earlier approval was cleared.",
                  )
                }
              >
                Save draft
              </button>
              {active && (
                <button
                  type="button"
                  disabled={busy || !unsaved}
                  onClick={() => {
                    select(active);
                    setNotice("Unsaved changes were discarded.");
                  }}
                >
                  Discard unsaved changes
                </button>
              )}
            </div>
            <p className="gr-help" id={`${baseId}-save-why`}>
              {saveBlocked ||
                (active
                  ? `${draftStatusLabel[active.status] ?? active.status}${unsaved ? " · you have unsaved changes" : " · all changes saved"}. Written by ${active.author}.`
                  : preview
                    ? "Not saved yet."
                    : "")}
            </p>
            {staleBase && active && (
              <div role="alert" className="editor-note">
                <p>
                  Someone published a new version of the scorecard after this
                  draft was started. Compare the grades under “Review &amp;
                  publish”, then update the draft. Your saved changes are kept,
                  but it will need approval again.
                </p>
                <button
                  type="button"
                  disabled={busy || unsaved || locked}
                  onClick={() =>
                    void run(async () => {
                      await call(`drafts/${active.id}/rebase`, "POST", {
                        version: active.version,
                        basePublicationId: currentBase,
                      });
                      await refresh();
                      await loadDraft(active.id);
                      setNotice(
                        "Draft updated to the latest published version. It needs approval again.",
                      );
                    })
                  }
                >
                  Update this draft to the latest published version
                </button>
                {unsaved && (
                  <p className="gr-help">
                    Discard your unsaved changes first; this update uses the
                    last saved copy.
                  </p>
                )}
              </div>
            )}
          </section>

          <div
            className="editor-tabs"
            role="tablist"
            aria-label="Staff workspace sections"
          >
            {tabs.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${baseId}-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                <span className="editor-tab-num" aria-hidden="true">
                  {i + 1}
                </span>
                {t.label}
                {t.id === "corrections" &&
                  corrections.some((c) => c.status === "open") && (
                    <span className="editor-badge">
                      {corrections.filter((c) => c.status === "open").length}
                      <span className="sr-only"> open</span>
                    </span>
                  )}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`${baseId}-panel-${tab}`}
            aria-labelledby={`${baseId}-tab-${tab}`}
            className="editor-panel"
            tabIndex={0}
          >
            {tab === "votes" && editorPanel(VotesPanel)}
            {tab === "legislators" && editorPanel(LegislatorsPanel)}
            {tab === "rules" && editorPanel(GradingRulesPanel)}
            {tab === "review" && (
              <div>
                <ol className="editor-steps" aria-label="Progress">
                  {steps.map((s, i) => (
                    <li
                      key={s}
                      aria-current={i === currentStep ? "step" : undefined}
                      className={i < currentStep ? "done" : undefined}
                    >
                      <span className="editor-step-num" aria-hidden="true">
                        {i + 1}
                      </span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
                <h2>What changes</h2>
                {parseError ? (
                  <p className="editor-error">{parseError}</p>
                ) : !preview ? (
                  <p>Open a saved draft or start a new one to see changes.</p>
                ) : (
                  <>
                    <ul className="editor-summary">
                      <li>
                        <strong>{count("up")}</strong>{" "}
                        {count("up") === 1 ? "grade goes up" : "grades go up"}
                      </li>
                      <li>
                        <strong>{count("down")}</strong>{" "}
                        {count("down") === 1
                          ? "grade goes down"
                          : "grades go down"}
                      </li>
                      {count("other") > 0 && (
                        <li>
                          <strong>{count("other")}</strong> gain or lose a grade
                          entirely
                        </li>
                      )}
                      <li>
                        <strong>{count("same")}</strong> unchanged
                      </li>
                    </ul>
                    <p className="gr-help">
                      Compared with the live scorecard
                      {unsaved ? ", including your unsaved changes" : ""}.
                    </p>
                    {changed.length > 0 && (
                      <details className="editor-details">
                        <summary>
                          See every grade that changes ({changed.length})
                        </summary>
                        <div className="editor-scroll">
                          <table aria-label="Grade changes">
                            <thead>
                              <tr>
                                <th>Legislator</th>
                                <th>Live grade</th>
                                <th>Draft grade</th>
                                <th>Change</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changed.map((c) => (
                                <tr key={c.id}>
                                  <td>{c.name}</td>
                                  <td>{c.before}</td>
                                  <td>{c.after}</td>
                                  <td>
                                    {
                                      {
                                        up: "Up",
                                        down: "Down",
                                        other: "Changed",
                                        same: "",
                                      }[c.direction]
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    )}
                  </>
                )}
                <h2>Next step</h2>
                <div className="editor-actions">
                  <div className="editor-action">
                    <button
                      type="button"
                      className="editor-primary"
                      disabled={busy || !!saveBlocked}
                      aria-describedby={`${baseId}-send-why`}
                      onClick={() =>
                        void save(
                          "Draft saved and waiting for review. Ask a colleague to open it and approve it.",
                        )
                      }
                    >
                      Save and send for review
                    </button>
                    <p className="gr-help" id={`${baseId}-send-why`}>
                      {saveBlocked ||
                        "Saving makes the draft available for a colleague to approve."}
                    </p>
                  </div>
                  <div className="editor-action">
                    <button
                      type="button"
                      disabled={busy || !!approveBlocked}
                      aria-describedby={`${baseId}-approve-why`}
                      onClick={() =>
                        active &&
                        void run(async () => {
                          await call(`drafts/${active.id}/review`, "POST", {
                            version: active.version,
                          });
                          await refresh();
                          await loadDraft(active.id);
                          setNotice(
                            "Approved. A publisher can now publish it.",
                          );
                        })
                      }
                    >
                      Approve this draft
                    </button>
                    <p className="gr-help" id={`${baseId}-approve-why`}>
                      {approveBlocked ||
                        "You have checked the changes and agree they are correct."}
                    </p>
                  </div>
                  <div className="editor-action">
                    <button
                      type="button"
                      className="editor-primary"
                      disabled={busy || !!publishBlocked}
                      aria-describedby={`${baseId}-publish-why`}
                      onClick={() =>
                        active &&
                        void run(async () => {
                          await call(`drafts/${active.id}/publish`, "POST", {
                            version: active.version,
                          });
                          setActive(null);
                          setNotice(
                            "Published. The scorecard now shows this version, and the previous version is kept in History.",
                          );
                        })
                      }
                    >
                      Publish
                    </button>
                    <p className="gr-help" id={`${baseId}-publish-why`}>
                      {publishBlocked ||
                        "Makes this version live on the public scorecard."}
                    </p>
                  </div>
                </div>
                {active && (
                  <p className="gr-help">
                    Written by {active.author} · Approved by{" "}
                    {active.reviewer ?? "nobody yet"}
                  </p>
                )}
              </div>
            )}
            {tab === "corrections" && (
              <div>
                <p className="editor-lede">
                  Readers can report mistakes from the public scorecard. Fix the
                  problem in a draft if needed, then record what you decided.
                </p>
                {!corrections.length && <p>No corrections have been sent.</p>}
                {corrections.map((c) => (
                  <article key={c.id} className="editor-card">
                    <p>
                      <strong>
                        {c.status === "open"
                          ? "Needs a response"
                          : c.status === "resolved"
                            ? "Fixed"
                            : c.status === "dismissed"
                              ? "Not changed"
                              : c.status}
                      </strong>
                    </p>
                    <p>{c.message}</p>
                    <p className="gr-help">
                      About record <code>{c.evidence_id}</code> in published
                      version <code>{c.publication_id}</code>
                    </p>
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
                            setNotice("Your response was recorded.");
                          });
                        }}
                      >
                        <label>
                          Your response (at least 5 characters)
                          <input name="resolution" minLength={5} required />
                        </label>
                        <label>
                          Decision
                          <select name="status">
                            <option value="resolved">Fixed</option>
                            <option value="dismissed">
                              Not changed (explain why above)
                            </option>
                          </select>
                        </label>
                        <button disabled={busy}>Record response</button>
                      </form>
                    )}
                  </article>
                ))}
              </div>
            )}
            {tab === "history" && (
              <div>
                <p>
                  Live published version:{" "}
                  <code>{pointer?.publication_id ?? "none yet"}</code>
                </p>
                <h2>Start a correction from a published version</h2>
                <p className="gr-help">
                  Copies a published version into a new draft so you can fix it.
                  The published version itself never changes.
                </p>
                <div className="editor-row">
                  <label>
                    ID of the published version to correct
                    <input
                      value={cloneId}
                      onChange={(e) => setCloneId(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || !cloneId}
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
                        setSummary(`Correction to published version ${p.id}`);
                        setNotice(
                          "The published version was copied into a new, unsaved correction draft.",
                        );
                      })
                    }
                  >
                    Start a correction draft
                  </button>
                </div>
                <h2>Restore an earlier published version</h2>
                <p className="gr-help">
                  Makes an earlier published version live again. Nothing is
                  deleted, and your reason is kept in the activity log.
                </p>
                <fieldset
                  className="editor-plain"
                  disabled={busy || session.role !== "publisher"}
                  aria-describedby={`${baseId}-restore-why`}
                >
                  <div className="editor-row">
                    <label>
                      ID of the published version to restore
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
                      type="button"
                      disabled={!rollbackId || !reason.trim()}
                      onClick={() =>
                        void run(async () => {
                          await call("rollback", "POST", {
                            publicationId: rollbackId,
                            reason,
                            revision: (
                              status.pointer as { revision: number } | undefined
                            )?.revision,
                          });
                          setNotice("That published version is now live.");
                        })
                      }
                    >
                      Restore this version
                    </button>
                  </div>
                </fieldset>
                <p className="gr-help" id={`${baseId}-restore-why`}>
                  {session.role !== "publisher"
                    ? "Only a publisher can restore an earlier version."
                    : "Enter the version ID and a short reason."}
                </p>
                <h2>Activity log</h2>
                {!audit.length && <p>No activity recorded yet.</p>}
                {audit.length > 0 && (
                  <div className="editor-scroll">
                    <table aria-label="Activity log">
                      <thead>
                        <tr>
                          <th>When</th>
                          <th>Who</th>
                          <th>What</th>
                          <th>Item</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(audit as AuditEntry[]).map((a, i) => (
                          <tr key={a.sequence ?? i}>
                            <td>
                              {a.at ? new Date(a.at).toLocaleString() : "—"}
                            </td>
                            <td>{a.actor}</td>
                            <td>
                              {auditActionLabel[a.action ?? ""] ?? a.action}
                            </td>
                            <td>
                              <code>{a.target}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <details className="editor-devtools">
            <summary>Developer tools</summary>
            <p className="gr-help">
              Technical tools for importing, exporting and inspecting the raw
              scorecard data. Most staff never need these.
            </p>
            {active && (
              <p className="gr-help">
                Draft ID <code>{active.id}</code> · based on publication{" "}
                <code>{active.base_publication_id ?? "none"}</code> · current
                publication <code>{currentBase ?? "none"}</code> · version{" "}
                {active.version}
              </p>
            )}
            {preview && canEdit && (
              <fieldset disabled={busy || locked} className="editor-plain">
                <h3>Dataset identity</h3>
                <ScorecardDataDetails dataset={preview} onChange={setDataset} />
              </fieldset>
            )}
            <label>
              Import a dataset JSON file
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
            <label>
              Raw scorecard data (JSON)
              <textarea
                rows={18}
                value={text}
                disabled={busy}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
              />
            </label>
            <button
              type="button"
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
            <details>
              <summary>Operational readiness and source freshness</summary>
              <pre>{JSON.stringify(status, null, 2)}</pre>
            </details>
            <details>
              <summary>Raw audit history</summary>
              <pre>{JSON.stringify(audit, null, 2)}</pre>
            </details>
          </details>
        </>
      )}
    </section>
  );
}
