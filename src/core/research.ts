import type { Member, RecordEntry, Vote } from "./types";
import { scoreMember } from "./scoring";

export function voteIntersection(
  members: Member[],
  records: RecordEntry[],
  voteA: string,
  outcomeA: string,
  voteB: string,
  outcomeB: string,
) {
  return members.filter(
    (m) =>
      records.some(
        (r) =>
          r.memberId === m.id && r.voteId === voteA && r.outcome === outcomeA,
      ) &&
      records.some(
        (r) =>
          r.memberId === m.id && r.voteId === voteB && r.outcome === outcomeB,
      ),
  );
}
export function rankByParty(
  members: Member[],
  votes: Vote[],
  records: RecordEntry[],
  limit: number,
) {
  const ranked = members
    .map((member) => ({ member, score: scoreMember(member, votes, records) }))
    .filter((row) => row.score.value !== null)
    .sort(
      (a, b) =>
        b.score.value! - a.score.value! ||
        a.member.name.localeCompare(b.member.name),
    );
  return ["Democratic", "Republican"].flatMap((party) =>
    ranked
      .filter((r) => r.member.party === party)
      .slice(0, limit)
      .map((r) => r.member),
  );
}
export function csvCell(value: string | number) {
  const text = String(value).replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
    "",
  );
  // Guard spreadsheet formula execution when public names or query text are exported.
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}
export function toCsv(rows: (string | number)[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
