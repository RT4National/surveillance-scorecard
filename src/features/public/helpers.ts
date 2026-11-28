import { percentLabel } from "../../core/copy";
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
  n === null ? "Not yet rated" : percentLabel(n);
/** Lowercase, accent-free text for name matching. */
export const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/**
 * The chosen state and the name search live in the URL fragment (`#state=CA&q=smith`),
 * never in the query string: fragments are not sent to the server, query strings are
 * logged by the Worker. Old `?state=` and `?q=` links are still read, then rewritten
 * by `migrateLegacyFragment`.
 */
export type FragmentKey = "state" | "q" | "browse";
/** Keys that older links carried in the query string. `browse` (the open directory) never did. */
const fragmentKeys: FragmentKey[] = ["state", "q"];
export const readFragment = (key: FragmentKey) =>
  new URLSearchParams(window.location.hash.slice(1)).get(key) ??
  query().get(key) ??
  "";
export const readState = () => readFragment("state");
export function writeFragment(key: FragmentKey, value: string) {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (value) hash.set(key, value);
  else hash.delete(key);
  const search = query();
  search.delete(key);
  const fragment = hash.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname +
      (search.size ? `?${search}` : "") +
      (fragment ? `#${fragment}` : ""),
  );
}
export const writeState = (state: string) => writeFragment("state", state);
/**
 * The visitor's own last pick, kept in this browser (localStorage) so a later visit to the home
 * page opens their delegation. Never sent to the server and never written to the URL. Storage may
 * be unavailable (private windows, blocked site data); then nothing is remembered.
 */
const storedStateKey = "scorecard.state";
export function readStoredState(): string {
  try {
    return localStorage.getItem(storedStateKey) ?? "";
  } catch {
    return "";
  }
}
export function writeStoredState(state: string) {
  try {
    if (state) localStorage.setItem(storedStateKey, state);
    else localStorage.removeItem(storedStateKey);
  } catch {
    // Not remembered; the fragment still holds the choice for this page.
  }
}
export function migrateLegacyFragment() {
  for (const key of fragmentKeys)
    if (query().has(key)) writeFragment(key, readFragment(key));
}
/** A state's current members: senators first, then the House by district. */
export function delegation<
  M extends {
    chamber: string;
    district?: number;
    name: string;
    status: string;
    state: string;
  },
>(members: M[], state: string): M[] {
  return members
    .filter((m) => m.state === state && m.status === "active")
    .sort(
      (a, b) =>
        Number(b.chamber === "Senate") - Number(a.chamber === "Senate") ||
        (a.district ?? 0) - (b.district ?? 0) ||
        a.name.localeCompare(b.name),
    );
}
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
