// One evidence entry (a member's record on one scored item), shared by the profile, compare and
// archive pages. It decides everything from the record: callers cannot pass a party, so a Not
// eligible record can never state one.
import type { ReactNode } from "react";
import { Check, Circle, Clock, Minus, X, type LucideIcon } from "lucide-react";
import type { scoreMember } from "../../core/scoring";
import { alignmentState, type AlignmentState } from "../../core/evidence";
import {
  alignmentLabels,
  evidenceContext,
  evidenceCopy,
  memberAction,
  reformLine,
  weightLabel,
} from "../../core/copy";
import { publicationUrl } from "../../core/navigation";
import { Source } from ".";
import { base } from "./helpers";

export type EvidenceEntry = ReturnType<typeof scoreMember>["evidence"][number];

const icons: Record<AlignmentState, { Icon: LucideIcon; shape: string }> = {
  aligned: { Icon: Check, shape: "check" },
  "not-aligned": { Icon: X, shape: "cross" },
  "did-not-vote": { Icon: Minus, shape: "dash" },
  "not-in-office": { Icon: Circle, shape: "circle" },
  "outside-window": { Icon: Clock, shape: "clock" },
};

/** Icon plus visible word for one state. Used by rows and the legend so they always match. */
export function StateMark({ state }: { state: AlignmentState }) {
  const { Icon, shape } = icons[state];
  return (
    <span className={`evidence-status state-${state}`}>
      <Icon size={16} aria-hidden="true" data-shape={shape} />
      <strong className="evidence-state">{alignmentLabels[state]}</strong>
    </span>
  );
}

export function EvidenceRow({
  entry: e,
  publicationId,
  actions,
}: {
  entry: EvidenceEntry;
  publicationId?: string;
  /** Extra row actions, such as "Report an error". */
  actions?: ReactNode;
}) {
  const state = alignmentState(e);
  const action = memberAction(e.vote, e.outcome);
  return (
    <div className="evidence-row" data-vote-id={e.voteId} data-state={state}>
      <div className="evidence-top">
        <StateMark state={state} />
        <span className="evidence-weight">{weightLabel(e)}</span>
      </div>
      <div className="evidence-title">
        <strong>{e.vote.title}</strong>
        <time dateTime={e.vote.date}>{e.vote.date}</time>
      </div>
      <p className="evidence-reform">
        {action && (
          <>
            <span className="evidence-action">{action}</span> ·{" "}
          </>
        )}
        <span>{reformLine(e.vote)}</span>
      </p>
      <p className="evidence-context">{evidenceContext(e)}</p>
      <p className="evidence-links">
        <span>
          {e.vote.bill} · {e.vote.topic}
        </span>
        <Source url={e.vote.source} />
        <a
          href={publicationUrl(
            `${base}/legislation/${encodeURIComponent(e.vote.id)}`,
            publicationId,
          )}
        >
          {evidenceCopy.votePage}
        </a>
        {actions}
      </p>
    </div>
  );
}
