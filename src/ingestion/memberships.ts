/** A committee-membership row from congress-legislators; subcommittees carry a parent. */
export interface CommitteeRow {
  memberId: string;
  name: string;
  parent: string | null;
}
export interface CaucusList {
  name: string;
  members: { memberId: string; confidence: string }[];
}

/**
 * Current-snapshot memberships, not dated history: committees come from one
 * congress-legislators snapshot, caucuses from each caucus's own cited roster.
 * Only top-level committees are listed, and only high- or medium-confidence caucus
 * name matches are used.
 */
export function applyMemberships<
  M extends { id: string; committees: string[]; caucuses: string[] },
>(
  members: readonly M[],
  committees: readonly CommitteeRow[],
  caucuses: readonly CaucusList[],
) {
  const ids = new Set(members.map((m) => m.id));
  const unknown = new Set<string>();
  const byMember = new Map<
    string,
    { committees: Set<string>; caucuses: Set<string> }
  >();
  const entry = (id: string) =>
    byMember.get(id) ??
    byMember.set(id, { committees: new Set(), caucuses: new Set() }).get(id)!;
  for (const row of committees) {
    if (!ids.has(row.memberId)) {
      unknown.add(row.memberId);
      continue;
    }
    if (row.parent === null) entry(row.memberId).committees.add(row.name);
  }
  let lowConfidence = 0;
  for (const caucus of caucuses)
    for (const m of caucus.members) {
      if (!["high", "medium"].includes(m.confidence)) {
        lowConfidence++;
        continue;
      }
      if (!ids.has(m.memberId)) {
        unknown.add(m.memberId);
        continue;
      }
      entry(m.memberId).caucuses.add(caucus.name);
    }
  return {
    members: members.map((m) => ({
      ...m,
      committees: [...(byMember.get(m.id)?.committees ?? [])].sort(),
      caucuses: [...(byMember.get(m.id)?.caucuses ?? [])].sort(),
    })),
    skipped: { unknownMembers: [...unknown].sort(), lowConfidence },
  };
}
