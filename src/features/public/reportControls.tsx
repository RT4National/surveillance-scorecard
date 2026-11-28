import { useMemo } from "react";
import type { Dataset } from "../../core/publication";
import { executeReport, type ReportQuery } from "../../core/reports";

export function ScopeControls({
  dataset,
  value,
  onChange,
}: {
  dataset: Dataset;
  value: ReportQuery;
  onChange: (q: ReportQuery) => void;
}) {
  return (
    <div className="public-controls">
      <label>
        Issue
        <select
          value={value.topic ?? ""}
          onChange={(e) =>
            onChange({ ...value, topic: e.target.value || undefined })
          }
        >
          <option value="">All issues</option>
          {[...new Set(dataset.votes.map((v) => v.topic))].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        From
        <input
          type="date"
          value={value.from ?? ""}
          onChange={(e) =>
            onChange({ ...value, from: e.target.value || undefined })
          }
        />
      </label>
      <label>
        Through
        <input
          type="date"
          value={value.to ?? ""}
          max={dataset.asOf}
          onChange={(e) =>
            onChange({ ...value, to: e.target.value || undefined })
          }
        />
      </label>
      <label>
        Presidential party context
        <select
          value={value.context ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              context: (e.target.value || undefined) as ReportQuery["context"],
            })
          }
        >
          <option value="">Both contexts</option>
          <option value="same">Same as party at vote</option>
          <option value="opposing">Different from party at vote</option>
        </select>
      </label>
    </div>
  );
}
export function useReport(
  dataset: Dataset,
  query: ReportQuery,
  includeUnrated = false,
) {
  return useMemo(() => {
    try {
      return {
        result: executeReport(dataset, query, { includeUnrated }),
        error: "",
      };
    } catch (e) {
      return { result: null, error: String((e as Error).message) };
    }
  }, [dataset, query, includeUnrated]);
}
