// Hooks that decide when to apply the shared motion classes (src/styles/motion.css).
// They only add class names; values and text are always final in the DOM.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Rows above which filter motion is skipped (UX plan item 3.4). */
export const filterMotionLimit = 100;
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * True once the element has been in the viewport. Checked before first paint, so an element that
 * is already visible animates without first flashing its final state, then by IntersectionObserver.
 * Without IntersectionObserver it stays false and nothing animates.
 */
export function useSeenOnce<T extends Element>(): [
  RefObject<T | null>,
  boolean,
] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (seen || !el || typeof IntersectionObserver === "undefined") return;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top < window.innerHeight && r.bottom > 0) {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true);
        observer.disconnect();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen];
}

/**
 * Class that restarts the change animation each time `bump` is called, alternating two identical
 * keyframes so the element is never remounted. Empty until the first change.
 */
export function useChangeClass(): [string, () => void] {
  const [changes, setChanges] = useState(0);
  return [
    changes === 0 ? "" : changes % 2 ? "motion-change-a" : "motion-change-b",
    () => setChanges((n) => n + 1),
  ];
}

/**
 * Class for a filtered result list: restarts a short fade each time `key` (the filter) changes.
 * Empty on first render, under prefers-reduced-motion (the CSS override also stops it), and above
 * `filterMotionLimit` rows. Only adds a class: the rows are the same with or without it.
 */
export function useFilterClass(key: string, rows: number): string {
  const previous = useRef(key);
  const changes = useRef(0);
  if (previous.current !== key) {
    previous.current = key;
    changes.current++;
  }
  if (!changes.current || rows > filterMotionLimit || prefersReducedMotion())
    return "";
  return changes.current % 2 ? "motion-filter-a" : "motion-filter-b";
}
