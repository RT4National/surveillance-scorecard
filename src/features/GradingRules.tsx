import { useId, type ReactNode } from "react";
import type { Rubric } from "../core/types";
import { defaultGradeBands } from "../core/scoring";
import { GradeCutoffs } from "./GradeCutoffs";
import "./grading-rules.css";

/** A labelled slider with visible value and -/+ buttons for keyboard and touch users. */
export function SliderField({
  label,
  help,
  value,
  min,
  max,
  step = 1,
  unit = "",
  disabled,
  onChange,
}: {
  label: string;
  help: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  // Never clamp an existing value the slider cannot show; widen the range instead.
  const hi = Math.max(max, value);
  const lo = Math.min(min, value);
  const clamp = (v: number) => Math.min(hi, Math.max(min, v));
  return (
    <div className="gr-field">
      <label htmlFor={id}>{label}</label>
      <div className="gr-slider-row">
        <button
          type="button"
          className="gr-step"
          aria-label={`Decrease: ${label}`}
          disabled={disabled || value - step < min}
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </button>
        <input
          id={id}
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-help`}
          aria-valuetext={`${value}${unit}`}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
        <button
          type="button"
          className="gr-step"
          aria-label={`Increase: ${label}`}
          disabled={disabled || value + step > hi}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </button>
        <output htmlFor={id} className="gr-value">
          {value}
          {unit}
        </output>
      </div>
      <p className="gr-help" id={`${id}-help`}>
        {help}
      </p>
    </div>
  );
}

/** Two or more mutually exclusive buttons that behave like a radio group. */
export function ChoiceButtons<T extends string | number | boolean>({
  label,
  help,
  options,
  value,
  disabled,
  onChange,
  extra,
}: {
  label: string;
  help?: ReactNode;
  options: { label: string; value: T }[];
  value: T | undefined;
  disabled?: boolean;
  onChange: (value: T) => void;
  extra?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="gr-field">
      <span className="gr-label" id={`${id}-label`}>
        {label}
      </span>
      <div
        className="gr-choices"
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={help ? `${id}-help` : undefined}
      >
        {options.map((o) => (
          <button
            type="button"
            key={String(o.value)}
            aria-pressed={o.value === value}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
        {extra}
      </div>
      {help && (
        <p className="gr-help" id={`${id}-help`}>
          {help}
        </p>
      )}
    </div>
  );
}

/** Plain-language controls for every grading rule, shared by the staff workspace and the public lab. */
export function GradingRulesControls({
  rubric,
  onChange,
  disabled,
}: {
  rubric: Rubric;
  onChange: (rubric: Rubric) => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<Rubric>) => onChange({ ...rubric, ...patch });
  return (
    <div className="gr-rules">
      <SliderField
        label="Votes needed before we give a grade"
        help="Legislators with fewer counted votes are shown as “not enough evidence” instead of a letter grade."
        value={rubric.minVotes}
        min={1}
        max={30}
        disabled={disabled}
        onChange={(minVotes) => set({ minVotes })}
      />
      <SliderField
        label="Votes needed under presidents of each party"
        help="To be called consistent, a legislator needs at least this many counted votes under a Democratic president and under a Republican president."
        value={rubric.minPerContext}
        min={1}
        max={15}
        disabled={disabled}
        onChange={(minPerContext) => set({ minPerContext })}
      />
      <SliderField
        label="‘Consistent’ means voting our way at least"
        help={`A consistent reformer votes for privacy at least this often under presidents of both parties; a consistent surveillance supporter does so at most ${100 - rubric.consistencyThreshold}% of the time under both.`}
        value={rubric.consistencyThreshold}
        min={51}
        max={100}
        unit="%"
        disabled={disabled}
        onChange={(consistencyThreshold) => set({ consistencyThreshold })}
      />
      <SliderField
        label="Shared topics needed to compare across presidents"
        help="How many issue topics must appear under presidents of both parties before we compare a legislator's record. Zero means no requirement."
        value={rubric.minSharedTopics ?? 0}
        min={0}
        max={10}
        disabled={disabled}
        onChange={(minSharedTopics) => set({ minSharedTopics })}
      />
      <ChoiceButtons
        label="Which votes count?"
        help="Choose whether very old votes are left out of grades entirely."
        options={[
          { label: "All votes", value: false },
          { label: "Only recent votes", value: true },
        ]}
        value={rubric.lookbackYears !== undefined}
        disabled={disabled}
        onChange={(on) =>
          set({ lookbackYears: on ? (rubric.lookbackYears ?? 10) : undefined })
        }
      />
      {rubric.lookbackYears !== undefined && (
        <SliderField
          label="Only count votes from the last"
          help="Votes older than this are ignored when grading."
          value={rubric.lookbackYears}
          min={1}
          max={30}
          unit=" years"
          disabled={disabled}
          onChange={(lookbackYears) => set({ lookbackYears })}
        />
      )}
      <ChoiceButtons
        label="Older votes count less"
        help="When on, recent votes matter more than old ones, but old votes still count."
        options={[
          { label: "Off", value: false },
          { label: "On", value: true },
        ]}
        value={rubric.halfLifeYears !== undefined}
        disabled={disabled}
        onChange={(on) =>
          set({ halfLifeYears: on ? (rubric.halfLifeYears ?? 4) : undefined })
        }
      />
      {rubric.halfLifeYears !== undefined && (
        <SliderField
          label="A vote counts half as much after"
          help="After this many years a vote carries half its weight; after twice as long, a quarter."
          value={rubric.halfLifeYears}
          min={1}
          max={20}
          unit=" years"
          disabled={disabled}
          onChange={(halfLifeYears) => set({ halfLifeYears })}
        />
      )}
      <h3 className="gr-subhead">Grade cutoffs</h3>
      <GradeCutoffs
        bands={rubric.gradeBands ?? defaultGradeBands}
        disabled={disabled}
        onChange={(gradeBands) => set({ gradeBands })}
      />
    </div>
  );
}
