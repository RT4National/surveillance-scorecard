// Plain (non-component) helpers shared by the scorecard directory (App.tsx) and the member profile.
// Kept out of member.tsx so that module exports only components and Vite Fast Refresh can hot-swap it.
import type { Dataset } from "../../core/publication";

export const base = "/scorecard";
export const query = () => new URLSearchParams(window.location.search);
export const readAsOf = (dataset: Dataset) => {
  const date = query().get("asOf");
  return date &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date &&
    date <= dataset.asOf
    ? date
    : dataset.asOf;
};
export const fmt = (n: number | null) =>
  n === null ? "Not yet rated" : `${Math.round(n)}%`;
export type GradeTone = "good" | "mixed" | "poor" | "unrated";
/**
 * Colour tone from the position of the scorer's grade within the active rubric's bands:
 * top half good, last band poor, the rest mixed. Never recomputes the grade from the percentage.
 */
export function gradeTone(
  grade: string,
  value: number | null,
  bands: { label: string }[],
): GradeTone {
  if (value === null) return "unrated";
  const index = bands.findIndex((b) => b.label === grade);
  if (index < 0) return "mixed";
  if (bands.length > 1 && index === bands.length - 1) return "poor";
  return index < Math.floor(bands.length / 2) ? "good" : "mixed";
}
/** Demo datasets without sources are the fictional preview; others hold real records with placeholder scoring. */
export const fictional = (dataset: { demo: boolean; sources: unknown[] }) =>
  dataset.demo && !dataset.sources.length;
