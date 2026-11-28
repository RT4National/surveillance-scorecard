// Motion rules from the UX rebuild plan ("Motion", section 5), checked on the CSS source.
// jsdom does not evaluate `prefers-reduced-motion` media queries (or the `animation` shorthand
// cascade), so a computed-style check would pass vacuously. These tests read the stylesheets.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = fileURLToPath(new URL("..", import.meta.url));
const motionPath = join(src, "styles", "motion.css");
const read = (p: string) => readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const motion = read(motionPath);

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith(".css") ? [p] : [];
  });
}
/** Body of the first block whose prelude matches, with nested braces balanced. */
function block(css: string, prelude: RegExp): string | null {
  const m = prelude.exec(css);
  if (!m) return null;
  let depth = 0;
  const start = css.indexOf("{", m.index);
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start + 1, i);
  }
  return null;
}
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const reduced = block(motion, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/);
const withoutReduced = (css: string) =>
  reduced ? css.replace(reduced, "") : css;
/** Every `transition`/`animation` declaration (longhands included) in a stylesheet. */
const motionDeclarations = (css: string) =>
  [...css.matchAll(/(?:^|[;{\s])((?:transition|animation)(?:-[a-z-]+)?)\s*:\s*([^;}]+)/g)].map(
    (m) => ({ property: m[1], value: squash(m[2]) }),
  );

describe("motion module", () => {
  it("defines duration tokens between 150 and 300 ms", () => {
    const tokens = [...motion.matchAll(/--motion-[a-z-]+\s*:\s*(\d+)ms/g)].map((m) =>
      Number(m[1]),
    );
    expect(tokens.length).toBeGreaterThanOrEqual(2);
    for (const t of tokens) {
      expect(t).toBeGreaterThanOrEqual(150);
      expect(t).toBeLessThanOrEqual(300);
    }
  });

  it("is loaded by the app entry point", () => {
    expect(readFileSync(join(src, "main.tsx"), "utf8")).toMatch(
      /import\s+["']\.\/styles\/motion\.css["']/,
    );
  });

  it("turns off every transition and animation under prefers-reduced-motion: reduce", () => {
    expect(reduced).not.toBeNull();
    const rule = block(reduced!, /\*\s*,\s*\*::before\s*,\s*\*::after\s*/);
    expect(rule).not.toBeNull();
    const declarations = squash(rule!);
    expect(declarations).toMatch(/animation\s*:\s*none\s*!important/);
    expect(declarations).toMatch(/transition\s*:\s*none\s*!important/);
  });

  it("lets nothing outrank the reduced-motion override", () => {
    for (const file of cssFiles(src)) {
      const css = file === motionPath ? withoutReduced(motion) : read(file);
      for (const d of motionDeclarations(css))
        expect(d.value, `${relative(src, file)}: ${d.property}`).not.toContain(
          "!important",
        );
    }
  });

  it("times every transition and animation with a motion token", () => {
    for (const file of cssFiles(src)) {
      const css = file === motionPath ? withoutReduced(motion) : read(file);
      for (const d of motionDeclarations(css)) {
        if (/^(transition|animation)(-duration)?$/.test(d.property) && d.value !== "none") {
          expect(d.value, `${relative(src, file)}: ${d.property}`).toMatch(/var\(--motion-/);
          expect(d.value, `${relative(src, file)}: ${d.property}`).not.toMatch(
            /(^|[\s,])\d*\.?\d+m?s\b/,
          );
        }
      }
    }
  });

  it("keeps keyframes in the motion module, from-only, on transform or opacity", () => {
    for (const file of cssFiles(src))
      if (file !== motionPath) expect(read(file)).not.toMatch(/@keyframes/);
    const frames = [...motion.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(frames.length).toBeGreaterThan(0);
    for (const name of frames) {
      const body = block(motion, new RegExp(`@keyframes\\s+${name}\\b`))!;
      // Only a `from` step: the resting style is the final state, so nothing waits on the animation.
      expect(squash(body).match(/[\w%]+\s*\{/g)).toEqual(["from {"]);
      const properties = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      for (const p of properties) expect(["opacity", "transform"]).toContain(p);
    }
  });
});
describe("filter motion (plan item 3.4)", () => {
  it("defines a restartable filter class pair under 200 ms", () => {
    for (const name of ["motion-filter-a", "motion-filter-b"]) {
      const rule = block(motion, new RegExp(`\\.${name}\\s*(?=\\{)`));
      expect(rule, name).not.toBeNull();
      expect(squash(rule!)).toMatch(new RegExp(`animation\\s*:\\s*${name}\\s+var\\(--motion-fast\\)`));
    }
    const fast = Number(/--motion-fast\s*:\s*(\d+)ms/.exec(motion)?.[1]);
    expect(fast).toBeLessThan(200);
  });
});
