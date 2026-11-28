import type { Dataset } from "../../core/publication";
import { percentLabel } from "../../core/copy";
import { itemImpact } from "./itemImpact";

export function ItemImpactPreview({
  before,
  after,
  voteId,
}: {
  before: Dataset;
  after: Dataset;
  voteId: string;
}) {
  let rows: ReturnType<typeof itemImpact>;
  try {
    rows = itemImpact(before, after, voteId);
  } catch {
    return (
      <p role="alert">
        Impact preview is unavailable. Check the draft data and grading rules.
      </p>
    );
  }
  const changed = rows.filter(
    (row) => row.before.grade !== row.after.grade,
  ).length;
  const describe = ({ grade, value }: (typeof rows)[number]["after"]) =>
    value === null ? "Not graded" : `${grade} · ${percentLabel(value)}`;

  if (!rows.length) return <p>No legislators have a record on this item.</p>;
  return (
    <details className="editor-details">
      <summary>
        Per-legislator impact · {changed} of {rows.length} change grade
      </summary>
      <div
        className="editor-scroll"
        role="region"
        aria-label="Impact of this item"
        tabIndex={0}
      >
        <table>
          <caption>Grades and alignment for this draft change</caption>
          <thead>
            <tr>
              <th scope="col">Legislator</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td>{describe(row.before)}</td>
                <td>{describe(row.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
