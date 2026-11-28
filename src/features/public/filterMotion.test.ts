// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { filterChange } from "./motion";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "startViewTransition");
  document.body.replaceChildren();
  document.documentElement.classList.remove("motion-filter-transition");
});

it("uses the native transition for small lists and updates without it under reduced motion", () => {
  document.body.innerHTML = "<ul data-filter-list><li>Leaving row</li></ul>";
  const callback = vi.fn();
  const start = vi.fn((update: () => void) => {
    update();
    return {
      ready: Promise.resolve(),
      finished: Promise.resolve(),
      skipTransition() {},
    };
  });
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: start,
  });
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  filterChange(callback);
  expect(start).toHaveBeenCalledOnce();
  expect(callback).toHaveBeenCalledOnce();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  filterChange(callback);
  expect(start).toHaveBeenCalledOnce();
  expect(callback).toHaveBeenCalledTimes(2);
});

it("applies the update directly when no result list is eligible for snapshots", () => {
  document.body.innerHTML = "<ul><li>Large result list</li></ul>";
  const start = vi.fn();
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: start,
  });
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const update = vi.fn();
  filterChange(update);
  expect(update).toHaveBeenCalledOnce();
  expect(start).not.toHaveBeenCalled();
});
