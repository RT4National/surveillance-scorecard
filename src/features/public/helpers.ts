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
/** Demo datasets without sources are the fictional preview; others hold real records with placeholder scoring. */
export const fictional = (dataset: { demo: boolean; sources: unknown[] }) =>
  dataset.demo && !dataset.sources.length;
