// Hooks that decide when to apply the shared motion classes (src/styles/motion.css).
// They only add class names; values and text are always final in the DOM.
import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * True once the element has been in the viewport. Checked before first paint, so an element that
 * is already visible animates without first flashing its final state, then by IntersectionObserver.
 * Without IntersectionObserver it stays false and nothing animates.
 */
export function useSeenOnce<T extends Element>(): [RefObject<T | null>, boolean] {
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
