import { useId } from "react";
import "./grading-rules.css";

export type GradeBand = { label: string; minimum: number };

const article = (label: string) =>
  /^[AEFHILMNORSX]/i.test(label) ? "an" : "a";

/** Lowest and highest allowed cutoff for band `i` so bands stay strictly descending. */
export function cutoffLimits(bands: GradeBand[], i: number) {
  if (i === bands.length - 1) return { min: 0, max: 0 };
  const min = (bands[i + 1]?.minimum ?? 0) + 1;
  const max = i === 0 ? 100 : bands[i - 1].minimum - 1;
  return { min, max };
}

/** Returns new bands with band `i` moved to `value`, clamped between its neighbours. */
export function setCutoff(
  bands: GradeBand[],
  i: number,
  value: number,
): GradeBand[] {
  const { min, max } = cutoffLimits(bands, i);
  const next = Math.min(max, Math.max(min, Math.round(value)));
  return bands.map((b, j) => (j === i ? { ...b, minimum: next } : b));
}

export function GradeCutoffs({
  bands,
  onChange,
  disabled,
}: {
  bands: GradeBand[];
  onChange: (bands: GradeBand[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const last = bands.at(-1);
  return (
    <div className="gr-cutoffs">
      <div className="gr-bar" aria-hidden="true">
        {bands.map((b, i) => {
          const top = i === 0 ? 100 : bands[i - 1].minimum;
          const span = Math.max(top - b.minimum, 0);
          return (
            <span
              key={b.label}
              className="gr-bar-segment"
              style={{ flexGrow: Math.max(span, 2) }}
              title={`${b.label}: ${b.minimum}–${top}`}
            >
              {b.label}
            </span>
          );
        })}
      </div>
      <p className="gr-help">
        Each grade starts at the score shown. A grade can never start at or
        below the grade beneath it.
      </p>
      {bands.slice(0, -1).map((b, i) => {
        const { min, max } = cutoffLimits(bands, i);
        const inputId = `${id}-cut-${i}`;
        const set = (v: number) => onChange(setCutoff(bands, i, v));
        return (
          <div className="gr-cutoff" key={`${b.label}-${i}`}>
            <label htmlFor={inputId}>
              Lowest score for {article(b.label)} {b.label}
            </label>
            <div className="gr-slider-row">
              <button
                type="button"
                className="gr-step"
                aria-label={`Lower the ${b.label} cutoff`}
                disabled={disabled || b.minimum <= min}
                onClick={() => set(b.minimum - 1)}
              >
                −
              </button>
              <input
                id={inputId}
                type="range"
                min={0}
                max={100}
                step={1}
                value={b.minimum}
                disabled={disabled}
                aria-valuetext={`${b.minimum} percent`}
                onChange={(e) => set(Number(e.target.value))}
              />
              <button
                type="button"
                className="gr-step"
                aria-label={`Raise the ${b.label} cutoff`}
                disabled={disabled || b.minimum >= max}
                onClick={() => set(b.minimum + 1)}
              >
                +
              </button>
              <output htmlFor={inputId} className="gr-value">
                {b.minimum}%
              </output>
            </div>
          </div>
        );
      })}
      {last && (
        <p className="gr-help">
          {last.label}: any score below {bands.at(-2)?.minimum ?? 100}%.
        </p>
      )}
    </div>
  );
}
