import type { Member, Party } from '../core/types';

/**
 * Selection and placeholder direction for legacy scorecard criteria (the 2026-10-15 inventory).
 * Nothing here is editorial review: directions are read from the legacy point values and wording
 * and are published only behind PLACEHOLDER- labels.
 */
type Chamber = Member['chamber'];
type Points = number | Partial<Record<Chamber, number>>;
export interface CriterionRow {
  key: string;
  lines: number[];
  chambers: Chamber[];
  conditions: Record<string, Points>;
  info: string[];
  classification: 'rollcall' | 'cosponsorship' | 'other';
  officialUrls: string[];
  bill: { congress: number; type: string; number: number; url: string } | null;
  alreadyImported: string[];
  verified: boolean;
  notes: string;
}

const administrations: { start: string; name: string; party: Party }[] = [
  { start: '2009-01-20', name: 'Obama', party: 'Democratic' },
  { start: '2017-01-20', name: 'Trump', party: 'Republican' },
  { start: '2021-01-20', name: 'Biden', party: 'Democratic' },
  { start: '2025-01-20', name: 'Trump', party: 'Republican' },
];
/** Inauguration day belongs to the incoming administration. */
export function presidentOn(date: string): { party: Party; administration: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error(`Invalid date ${date}`);
  const term = administrations.filter(a => a.start <= date).at(-1);
  if (!term) throw new Error(`No administration table entry covers ${date}`);
  return { party: term.party, administration: `${term.name} administration` };
}

function pointsFor(points: Points, chamber: Chamber): number | undefined {
  return typeof points === 'number' ? points : points[chamber];
}
/** Which side the wording of a legacy roll-call branch describes. */
function side(info: string): 'Yes' | 'No' {
  const yes = /\bvoted\s+(yes|for)\b/i.test(info), no = /\bvoted\s+(no|against)\b/i.test(info);
  if (yes === no) throw new Error(`Legacy wording does not name one side: ${info}`);
  return yes ? 'Yes' : 'No';
}
/**
 * Placeholder direction from the legacy point values. Roll calls: the branch that earned points
 * names the reform side; a lone penalized branch names the opposite side. Bill support: a reward
 * for supporting the bill means cosponsoring is aligned ('Yes'), a penalty means it is not ('No').
 */
export function criterionDirection(row: CriterionRow, chamber: Chamber): { reformVote: 'Yes' | 'No'; points: number; info: string } {
  const branches = Object.entries(row.conditions).map(([value, points], i) => ({ value, points: pointsFor(points, chamber), info: row.info[i] ?? row.info[0] }))
    .filter((b): b is { value: string; points: number; info: string } => b.points !== undefined);
  if (!branches.length || branches.some(b => !Number.isFinite(b.points) || b.points === 0 || !b.info?.trim())) throw new Error(`No usable legacy scoring for ${row.key} in the ${chamber}`);
  if (row.classification === 'cosponsorship') {
    if (branches.length !== 1) throw new Error(`Bill support ${row.key} must have one scored branch`);
    return { reformVote: branches[0].points > 0 ? 'Yes' : 'No', points: branches[0].points, info: branches[0].info };
  }
  const directions = branches.map(b => (b.points > 0) === (side(b.info) === 'Yes') ? 'Yes' : 'No');
  if (new Set(directions).size !== 1) throw new Error(`Legacy branches for ${row.key} disagree on direction`);
  const best = branches.reduce((a, b) => (b.points > a.points ? b : a));
  return { reformVote: directions[0], points: best.points, info: best.info };
}

export interface RollcallSelection { key: string; url: string; chamber: Chamber; row: CriterionRow }
export interface CosponsorSelection { key: string; congress: number; type: string; number: number; chamber: Chamber; signedBefore?: string; row: CriterionRow }
export interface Exclusion { key: string; urls: string[]; reason: string }
export interface HistoryOptions {
  /** Criteria the user must decide on, with the reason shown to them. */
  excludedKeys: Record<string, string>;
  /** Companion bills and sign-on cutoffs stated in the legacy wording but not in the inventory's bill field. */
  cosponsorExtras: Record<string, { bills: { congress: number; type: string; number: number }[]; signedBefore?: string }>;
}
const houseUrl = /^https:\/\/clerk\.house\.gov\/evs\/\d{4}\/roll\d+\.xml$/;
const senateUrl = /^https:\/\/www\.senate\.gov\/legislative\/LIS\/roll_call_votes\/vote\d+\/vote_\d+_\d+_\d+\.xml$/;
const billChamber = (type: string): Chamber => {
  if (/^h(r|res|jres|conres)$/.test(type)) return 'House';
  if (/^s(res|jres|conres)?$/.test(type)) return 'Senate';
  throw new Error(`Unknown bill type ${type}`);
};

/**
 * Verified, not-yet-imported official roll calls (each URL once; the first verified criterion
 * wins and later ones are reported as duplicates) and verified bill-support criteria. Everything
 * not imported is returned with a reason for the user.
 */
export function selectHistory(inventory: readonly CriterionRow[], options: HistoryOptions) {
  const rollcalls: RollcallSelection[] = [], cosponsorships: CosponsorSelection[] = [], excluded: Exclusion[] = [];
  const claimed = new Map<string, string>(), bills = new Set<string>();
  const exclude = (row: CriterionRow, reason: string) => excluded.push({ key: row.key, urls: row.bill ? [row.bill.url] : row.officialUrls, reason });
  for (const row of inventory) {
    if (row.classification === 'rollcall') for (const url of row.officialUrls) if (!houseUrl.test(url) && !senateUrl.test(url)) throw new Error(`Unexpected official URL for ${row.key}: ${url}`);
    if (row.alreadyImported.length) continue;
    if (options.excludedKeys[row.key]) { exclude(row, options.excludedKeys[row.key]); continue; }
    if (row.classification === 'other') { exclude(row, `classified other (no roll call or bill): ${row.notes}`); continue; }
    if (!row.verified) { exclude(row, `not verified in the inventory: ${row.notes}`); continue; }
    if (row.classification === 'rollcall') {
      if (row.officialUrls.length !== 1) { exclude(row, 'verified criterion does not name exactly one official roll call'); continue; }
      const url = row.officialUrls[0];
      if (claimed.has(url)) { exclude(row, `same roll call already imported under ${claimed.get(url)}`); continue; }
      claimed.set(url, row.key);
      rollcalls.push({ key: row.key, url, chamber: houseUrl.test(url) ? 'House' : 'Senate', row });
      continue;
    }
    if (!row.bill) { exclude(row, 'bill support criterion without a bill'); continue; }
    const extra = options.cosponsorExtras[row.key];
    for (const bill of [row.bill, ...(extra?.bills ?? [])]) {
      const type = bill.type.toLowerCase(), id = `${bill.congress}-${type}-${bill.number}`;
      if (bills.has(id)) throw new Error(`Bill ${id} is scored twice`);
      bills.add(id);
      const chamber = billChamber(type);
      if (!row.chambers.includes(chamber)) throw new Error(`${row.key} does not score the ${chamber}`);
      cosponsorships.push({ key: row.key, congress: bill.congress, type, number: bill.number, chamber, ...(extra?.signedBefore ? { signedBefore: extra.signedBefore } : {}), row });
    }
  }
  // Duplicates are only known once every row is seen; report rows that were excluded only because a later row was verified.
  for (const e of excluded) {
    const dup = e.urls.length === 1 && claimed.get(e.urls[0]);
    if (dup && dup !== e.key && !e.reason.includes(dup)) e.reason = `${e.reason} (roll call imported under ${dup})`;
  }
  return { rollcalls, cosponsorships, excluded };
}
