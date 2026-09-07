export type Party = "Democratic" | "Republican" | "Independent";
export type Outcome = "Yes" | "No" | "Not voting" | "Not eligible";
export type Group = "reformer" | "conditional" | "surveillance";
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
}
