import type { Dataset } from "../../src/core/publication";
import type { Member, RecordEntry, Vote } from "../../src/core/types";

/** Deterministic synthetic capacity fixtures. These are not congressional facts. */
export function congressionalFixture(rollcalls: number): Dataset {
  if (!Number.isInteger(rollcalls) || rollcalls < 1 || rollcalls > 1000)
    throw new Error("Invalid synthetic fixture size");
  const members: Member[] = Array.from({ length: 535 }, (_, i) => ({
    id: `demo-scale-member-${String(i + 1).padStart(3, "0")}`,
    name: `Fictional ${i < 435 ? "Representative" : "Senator"} ${i + 1}`,
    party:
      i % 11 === 0 ? "Independent" : i % 2 === 0 ? "Democratic" : "Republican",
    state: "California",
    chamber: i < 435 ? "House" : "Senate",
    ...(i < 435 ? { district: i + 1 } : {}),
    status: "active",
    committees: ["Synthetic capacity committee"],
    caucuses: [],
    since: 2019,
  }));
  const votes: Vote[] = Array.from({ length: rollcalls }, (_, i) => ({
    id: `demo-scale-vote-${String(i + 1).padStart(3, "0")}`,
    bill: `FICTIONAL-${i + 1}`,
    title: `Fictional surveillance reform capacity vote ${i + 1}`,
    date: new Date(Date.UTC(2020 + Math.floor(i / 60), i % 12, 1 + (i % 27)))
      .toISOString()
      .slice(0, 10),
    administration: `Synthetic administration ${(Math.floor(i / 8) % 2) + 1}`,
    presidentParty: Math.floor(i / 8) % 2 === 0 ? "Democratic" : "Republican",
    chamber: i % 2 === 0 ? "House" : "Senate",
    reformVote: i % 3 === 0 ? "No" : "Yes",
    weight: i % 5 === 0 ? 2 : 1,
    topic: [
      "warrant-requirements",
      "data-brokers",
      "facial-recognition",
      "encryption",
    ][Math.floor(i / 2) % 4],
    rationale:
      "FICTIONAL CAPACITY DATA. This invented measure illustrates the length of an editorial explanation: assess warrant requirements, independent oversight, data retention, public reporting, and accessible remedies. The position and outcomes were generated solely to qualify storage and computation, and must never be presented as a real legislative record.",
    source: null,
  }));
  const records: RecordEntry[] = [];
  for (let i = 0; i < votes.length; i++)
    for (let j = 0; j < members.length; j++) {
      const m = members[j],
        v = votes[i];
      if (m.chamber !== v.chamber) continue;
      records.push({
        memberId: m.id,
        voteId: v.id,
        outcome:
          (i + j) % 23 === 0
            ? "Not voting"
            : (i * 7 + j * 3) % 11 < 6
              ? "Yes"
              : "No",
        partyAtVote: m.party,
      });
    }
  return {
    id: `fictional-capacity-535-${rollcalls}`,
    asOf: "2026-09-07",
    demo: true,
    members,
    votes,
    records,
    rubric: {
      version: "capacity-fixture-1",
      minVotes: 3,
      minPerContext: 2,
      consistencyThreshold: 75,
      minSharedTopics: 1,
    },
    sources: [],
    coverage: [
      "Entirely fictional deterministic capacity data; no real congressional claims.",
      "435 fictional House members and 100 fictional senators. Votes are chamber-specific.",
    ],
  };
}
