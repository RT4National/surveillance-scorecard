// The key printed under every evidence list: each state's icon shape and word.
import { alignmentStates } from "../../core/evidence";
import { evidenceCopy } from "../../core/copy";
import { StateMark } from "./EvidenceRow";

export function Legend() {
  return (
    <ul className="evidence-legend" aria-label={evidenceCopy.legend}>
      {alignmentStates.map((state) => (
        <li key={state}>
          <StateMark state={state} />
        </li>
      ))}
    </ul>
  );
}
