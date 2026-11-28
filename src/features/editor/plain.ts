// Plain-language helpers for the staff workspace.
import type { GradeBand } from "../GradeCutoffs";

/** "How much should it count?" maps to these vote weights. */
export const importanceOptions = [
  { label: "Less", value: 0.5 },
  { label: "Normal", value: 1 },
  { label: "More", value: 2 },
] as const;

/** Returns the standard importance label, or null for a non-standard (custom) weight. */
export function importanceLabel(weight: number) {
  return importanceOptions.find((o) => o.value === weight)?.label ?? null;
}

export const draftStatusLabel: Record<string, string> = {
  draft: "Waiting for review",
  review: "Approved",
  published: "Published",
};

export const roleLabel: Record<string, string> = {
  editor: "can write drafts",
  reviewer: "can write and approve drafts",
  publisher: "can write, approve and publish",
};

export const auditActionLabel: Record<string, string> = {
  "create-draft": "Started a draft",
  "draft-draft": "Saved a draft (waiting for review)",
  "draft-review": "Approved a draft",
  "draft-published": "Published a draft",
  "select-publication": "Changed which version is live",
  "rebase-draft": "Updated a draft to the latest published version",
  "correction-resolution": "Answered a reader correction",
};

export type GradeChange = {
  id: string;
  name: string;
  before: string;
  after: string;
  direction: "up" | "down" | "same" | "other";
};

/** Classifies a grade change using the draft's grade order (first band is best). */
export function gradeDirection(
  before: string,
  after: string,
  bands: GradeBand[],
): GradeChange["direction"] {
  if (before === after) return "same";
  const rank = (g: string) => bands.findIndex((b) => b.label === g);
  const b = rank(before),
    a = rank(after);
  if (b < 0 || a < 0) return "other";
  return a < b ? "up" : "down";
}
