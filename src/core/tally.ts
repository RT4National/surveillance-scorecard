import type { Party, RecordEntry } from "./types";

export const servingOutcomes = ["Yes", "No", "Not voting"] as const;

const emptyCounts = () => ({ Yes: 0, No: 0, "Not voting": 0 });

export function tallyRollCall(records: readonly RecordEntry[]) {
  const totals = emptyCounts();
  const byParty = {
    Democratic: emptyCounts(),
    Republican: emptyCounts(),
    Independent: emptyCounts(),
  } satisfies Record<Party, ReturnType<typeof emptyCounts>>;
  let notInOffice = 0;
  for (const { outcome, partyAtVote } of records) {
    if (outcome === "Not eligible") {
      notInOffice++;
    } else {
      totals[outcome]++;
      byParty[partyAtVote][outcome]++;
    }
  }
  return { totals, byParty, notInOffice };
}
