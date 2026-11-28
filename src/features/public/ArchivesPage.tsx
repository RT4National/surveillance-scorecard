import {
  changeReasonLabels,
  isChangelogReason,
  publicationReasons,
  type ChangelogReason,
} from "../../core/changelog";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Publication, PublicationSummary } from "../../core/publication";
import {
  loadArchivedPublication,
  publicationChanges,
  type PublicationChangeReason,
} from "../../core/reports";
import { base, Provenance, type Props } from "./pageShared";
import { EvidenceRow } from "./EvidenceRow";
import { Legend } from "./Legend";

const reasonLabels: Record<PublicationChangeReason, string> = {
  rubric: "Grading rules changed",
  evidence: "Vote evidence changed",
  cutoff: "Evidence cutoff changed",
};

function ChangeReasons({
  entry,
  loaded,
}: {
  entry: PublicationSummary;
  loaded?: Publication;
}) {
  const [computed, setComputed] = useState<ChangelogReason[]>();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const reasons =
    entry.changeReasons ?? (entry.previousId === null ? ["initial"] : computed);
  if (reasons)
    return reasons.length ? (
      <ul aria-label="Changes from the previous publication">
        {reasons.map((reason) => (
          <li key={reason}>{changeReasonLabels[reason]}</li>
        ))}
      </ul>
    ) : (
      <p>No changes to recorded evidence, grading rules, or cutoff.</p>
    );
  if (!entry.previousId) return null;
  const previousId = entry.previousId;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const controller = new AbortController();
          request.current = controller;
          setBusy(true);
          setStatus("");
          try {
            const read = (id: string) =>
              id === loaded?.id
                ? Promise.resolve(loaded)
                : loadArchivedPublication(id, fetch, controller.signal);
            const [before, after] = await Promise.all([
              read(previousId),
              read(entry.id),
            ]);
            if (!controller.signal.aborted)
              setComputed(publicationReasons(before.dataset, after.dataset));
          } catch {
            if (!controller.signal.aborted)
              setStatus("Change reasons are unavailable for this archive.");
          } finally {
            if (!controller.signal.aborted) setBusy(false);
          }
        }}
      >
        {busy ? "Loading change reasons…" : "Show change reasons"}
      </button>
      {status && <p role="status">{status}</p>}
    </>
  );
}
export function ArchivesPage({ dataset, publication }: Props) {
  const [list, setList] = useState<PublicationSummary[]>([]),
    [status, setStatus] = useState("Loading publications…"),
    [comparisonStatus, setComparisonStatus] = useState(""),
    [before, setBefore] = useState<Publication | null>(null),
    [memberId, setMemberId] = useState(() => {
      const requested = new URLSearchParams(location.search).get("m");
      return (
        dataset.members.find((member) => member.id === requested)?.id ??
        dataset.members[0]?.id ??
        ""
      );
    });
  const comparisonRequest = useRef<AbortController | null>(null);
  useEffect(() => () => comparisonRequest.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}/api/publications`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Archive unavailable (${r.status})`);
        const body = (await r.json()) as { publications: PublicationSummary[] };
        if (
          !Array.isArray(body.publications) ||
          body.publications.some(
            (p) =>
              !p ||
              typeof p.id !== "string" ||
              typeof p.createdAt !== "string" ||
              typeof p.summary !== "string" ||
              (p.changeReasons !== undefined &&
                (!Array.isArray(p.changeReasons) ||
                  !p.changeReasons.every(isChangelogReason))),
          )
        )
          throw new Error("Invalid publication index");
        setList(body.publications);
        setStatus(body.publications.length ? "" : "No publications yet.");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setStatus(e.message);
      });
    return () => controller.abort();
  }, []);
  const compare = useCallback(async (id: string) => {
    comparisonRequest.current?.abort();
    const controller = new AbortController();
    comparisonRequest.current = controller;
    setBefore(null);
    setComparisonStatus(`Loading ${id}…`);
    try {
      const archived = await loadArchivedPublication(
        id,
        fetch,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setBefore(archived);
      setComparisonStatus("");
    } catch (error) {
      if (!controller.signal.aborted)
        setComparisonStatus((error as Error).message);
    }
  }, []);
  const comparisonHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (before) comparisonHeading.current?.focus();
  }, [before]);
  const publicationId = publication?.id;
  useEffect(() => {
    const openLinkedComparison = () => {
      const prefix = "#publication-";
      if (!publicationId || !location.hash.startsWith(prefix)) return;
      try {
        const id = decodeURIComponent(location.hash.slice(prefix.length));
        if (id && id !== publicationId) void compare(id);
      } catch {
        setComparisonStatus("The archive comparison link is invalid.");
      }
    };
    openLinkedComparison();
    addEventListener("hashchange", openLinkedComparison);
    return () => removeEventListener("hashchange", openLinkedComparison);
  }, [compare, publicationId]);
  const change =
    before && publication
      ? publicationChanges(before, publication, memberId)
      : null;
  const changedVotes = new Set(change?.changedVoteIds);
  return (
    <section className="public-page">
      <h1>Published archives</h1>
      <Provenance dataset={dataset} publication={publication} />
      <p>
        Each archive preserves its evidence, date cutoff, and scoring rubric.
      </p>
      <p>
        Archives with a scoring snapshot show frozen published grades. Legacy
        archives without a snapshot show an explicitly labeled recalculation
        using the current scoring engine.
      </p>
      <p role="status">{status}</p>
      {comparisonStatus && <p role="status">{comparisonStatus}</p>}
      {list.map((p) => (
        <article key={p.id} id={`publication-${p.id}`}>
          <h2>
            <a href={`${base}/?publication=${encodeURIComponent(p.id)}`}>
              {p.createdAt.slice(0, 10)} · {p.id}
            </a>
          </h2>
          <p>{p.summary}</p>
          <ChangeReasons entry={p} loaded={publication} />
          <button
            type="button"
            disabled={!publication || p.id === publication.id}
            onClick={() => {
              const url = new URL(location.href);
              url.hash = `publication-${encodeURIComponent(p.id)}`;
              history.replaceState(history.state, "", url);
              void compare(p.id);
            }}
          >
            Compare with loaded publication
          </button>
        </article>
      ))}
      {change && (
        <section>
          <h2 ref={comparisonHeading} tabIndex={-1}>
            Publication comparison
          </h2>
          <label>
            Member
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
            >
              {[
                ...new Map(
                  [...dataset.members, ...(before?.dataset.members ?? [])].map(
                    (m) => [m.id, m],
                  ),
                ).values(),
              ].map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <p>
            {before!.id} → {publication!.id}
          </p>
          <p
            className={
              change.gradeChanged ? "motion-archive-change" : undefined
            }
            key={`${before!.id}/${publication!.id}/${memberId}`}
          >
            Grade {change.before?.grade ?? "Absent"} →{" "}
            {change.after?.grade ?? "Absent"}
            {change.gradeChanged && (
              <>
                {" "}
                · <strong>Changed</strong>
              </>
            )}
          </p>
          {change.reasons.length > 0 && (
            <ul aria-label="Publication changes">
              {change.reasons.map((reason) => (
                <li key={reason}>{reasonLabels[reason]}</li>
              ))}
            </ul>
          )}
          <p>{change.explanation}</p>
          <p>
            Counted evidence: {change.before?.counted ?? 0} →{" "}
            {change.after?.counted ?? 0} votes.
          </p>
          <div className="public-grid">
            {[before!, publication!].map((frame, index) => (
              <article key={`${index}-${frame.id}`}>
                <h3>
                  {index === 0 ? "Selected archive" : "Loaded publication"}:{" "}
                  {frame.id}
                </h3>
                <p>
                  {frame.scoring
                    ? "Frozen published score"
                    : "Legacy archive — current-engine recalculation"}
                </p>
                <Provenance dataset={frame.dataset} publication={frame} />
                <details>
                  <summary>Evidence in this publication</summary>
                  {(index === 0 ? change.before : change.after)?.evidence.map(
                    (e) => (
                      <div
                        className={
                          changedVotes.has(e.voteId)
                            ? "motion-archive-change"
                            : undefined
                        }
                        key={`${memberId}/${e.voteId}`}
                      >
                        {changedVotes.has(e.voteId) && <strong>Changed</strong>}
                        <EvidenceRow entry={e} publicationId={frame.id} />
                      </div>
                    ),
                  ) ?? <p>Member absent from this publication.</p>}
                  <Legend />
                </details>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
