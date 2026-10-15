export type Party = "Democratic" | "Republican" | "Independent";
export type Outcome = "Yes" | "No" | "Not voting" | "Not eligible";
export type Group = "reformer" | "mixed" | "unproven" | "surveillance";
export type Status = "active" | "inactive" | "deceased";
export interface Member {
  id: string;
  name: string;
  party: Party;
  state: string;
  chamber: "House" | "Senate";
  district?: number;
  status: Status;
  committees: string[];
  caucuses: string[];
  since: number;
  portrait?: {
    url: string;
    attribution: string;
    rights: "public-domain" | "licensed";
    rightsSource: string;
    reviewedBy: string;
  };
}
export interface Vote {
  id: string;
  bill: string;
  title: string;
  date: string;
  administration: string;
  presidentParty: Party;
  chamber: Member["chamber"];
  reformVote: "Yes" | "No";
  weight: number;
  topic: string;
  rationale: string;
  source: string | null;
  /** Absent means a roll call. A cosponsorship item has records only for the sponsor and cosponsors. */
  kind?: "rollcall" | "cosponsorship";
}
export interface RecordEntry {
  memberId: string;
  voteId: string;
  outcome: Outcome;
  partyAtVote: Party;
}
export interface Rubric {
  version: string;
  minVotes: number;
  minPerContext: number;
  consistencyThreshold: number;
  gradeBands?: { label: string; minimum: number }[];
  lookbackYears?: number;
  halfLifeYears?: number;
  minSharedTopics?: number;
}
