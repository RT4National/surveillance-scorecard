import { useState } from "react";
import { base, publicUrl, type Props } from "./pageShared";
import { VoteList } from "./VoteList";
import { VotePage } from "./VotePage";
export { ArchivesPage } from "./ArchivesPage";
export { ComparePage } from "./ComparePage";
export { Source } from "./pageShared";
import { correctionCopy } from "../../core/copy";
import { decodeVoteId } from "../../core/reports";
export { ReportsPage } from "./ReportsPage";
import "./public.css";

export function LegislationPage({
  dataset,
  publication,
  voteId,
}: Props & { voteId?: string }) {
  if (!voteId) return <VoteList dataset={dataset} publication={publication} />;
  const vote = dataset.votes.find((item) => item.id === decodeVoteId(voteId));
  if (!vote) {
    return (
      <section className="public-page">
        <h1>Vote not found</h1>
        <a href={publicUrl(`${base}/legislation`, publication)}>View votes</a>
      </section>
    );
  }
  return (
    <VotePage
      key={vote.id}
      dataset={dataset}
      publication={publication}
      vote={vote}
    >
      <CorrectionForm
        dataset={dataset}
        publication={publication}
        voteId={vote.id}
      />
    </VotePage>
  );
}
export function CorrectionForm({
  dataset,
  publication,
  memberId,
  voteId,
  id,
}: Props & { memberId?: string; voteId?: string; id?: string }) {
  const [message, setMessage] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  // Names, not ids: the reader should see exactly which record the report is about.
  const reference = [
    memberId &&
      (dataset.members.find((m) => m.id === memberId)?.name ?? memberId),
    voteId && (dataset.votes.find((v) => v.id === voteId)?.title ?? voteId),
  ].filter(Boolean);
  const closed = dataset.demo
    ? correctionCopy.closedDemo
    : !publication
      ? correctionCopy.closedUnpublished
      : null;
  return (
    <form
      id={id}
      className="public-correction"
      data-member-id={memberId}
      data-vote-id={voteId}
      onSubmit={async (e) => {
        e.preventDefault();
        if (closed || !publication) return;
        setBusy(true);
        setStatus("");
        try {
          const r = await fetch(`${base}/api/corrections`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              publicationId: publication.id,
              memberId,
              voteId,
              message,
            }),
          });
          if (!r.ok) throw new Error(correctionCopy.failed(r.status));
          setStatus(correctionCopy.sent);
          setMessage("");
        } catch (e) {
          setStatus((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{correctionCopy.title}</h3>
      <p>
        <strong>{reference.join(" · ") || dataset.id}</strong>
      </p>
      <label>
        {correctionCopy.label}
        <textarea
          required
          minLength={10}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      <p className="muted">{correctionCopy.hint}</p>
      <p className="muted">{correctionCopy.next}</p>
      <button disabled={Boolean(closed) || busy}>
        {busy ? correctionCopy.busy : correctionCopy.submit}
      </button>
      {closed && <p>{closed}</p>}
      <p role="status">{status}</p>
    </form>
  );
}
