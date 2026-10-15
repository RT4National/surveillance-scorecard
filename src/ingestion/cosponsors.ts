import type { SourceCapture } from '../core/publication';
import type { Member, RecordEntry, Vote } from '../core/types';
import { bioguide, capture, object, party, readSource, requiredString } from './members';

/**
 * Bill support from the Congress.gov API v3 (/bill/{congress}/{type}/{number} and its
 * /cosponsors list). The API key travels only in the X-Api-Key header; stored URLs never carry it.
 * A bill becomes one vote-like item dated at introduction: the sponsor and every current
 * cosponsor get a Yes record. Non-cosponsors get no record, and withdrawn cosponsors do not count.
 */
export interface BillId { congress: number; type: string; number: number }
export interface Sponsorship { memberId: string; party: string; date: string; original: boolean; name: string; withdrawn?: string }
export interface BillInfo extends BillId {
  chamber: Member['chamber'];
  introducedDate: string;
  label: string;
  title: string;
  sponsor: Sponsorship;
  count: number;
  countIncludingWithdrawn: number;
}
const API = 'https://api.congress.gov/v3';
const PAGE = 250;
const labels: Record<string, [string, string]> = {
  hr: ['H.R.', 'house-bill'], s: ['S.', 'senate-bill'], hres: ['H.Res.', 'house-resolution'], sres: ['S.Res.', 'senate-resolution'],
  hjres: ['H.J.Res.', 'house-joint-resolution'], sjres: ['S.J.Res.', 'senate-joint-resolution'],
  hconres: ['H.Con.Res.', 'house-concurrent-resolution'], sconres: ['S.Con.Res.', 'senate-concurrent-resolution'],
};
function check(id: BillId): BillId {
  if (!Number.isSafeInteger(id.congress) || id.congress < 93 || !Number.isSafeInteger(id.number) || id.number <= 0 || !labels[id.type]) throw new Error('Invalid bill identity');
  return id;
}
function day(value: unknown): string {
  const text = requiredString(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw new Error(`Invalid date ${String(value)}`);
  return text;
}
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export function billApiUrl(id: BillId): string {
  check(id);
  return `${API}/bill/${id.congress}/${id.type}/${id.number}?format=json`;
}
export function cosponsorsApiUrl(id: BillId, offset: number): string {
  check(id);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid offset');
  return `${API}/bill/${id.congress}/${id.type}/${id.number}/cosponsors?format=json&limit=${PAGE}&offset=${offset}`;
}
export function billPageUrl(id: BillId): string {
  check(id);
  return `https://www.congress.gov/bill/${ordinal(id.congress)}-congress/${labels[id.type][1]}/${id.number}`;
}

function sponsorship(value: unknown, date: string | undefined): Sponsorship {
  const row = object(value);
  return {
    memberId: bioguide(row.bioguideId), party: requiredString(row.party), date: day(date ?? row.sponsorshipDate),
    original: row.isOriginalCosponsor === true, name: requiredString(row.fullName),
    ...(row.sponsorshipWithdrawnDate === undefined || row.sponsorshipWithdrawnDate === null ? {} : { withdrawn: day(row.sponsorshipWithdrawnDate) }),
  };
}
export function parseBill(json: unknown, expected: BillId): BillInfo {
  check(expected);
  const bill = object(object(json).bill);
  if (Number(bill.congress) !== expected.congress || String(bill.type).toLowerCase() !== expected.type || Number(bill.number) !== expected.number) throw new Error('Bill response does not match the requested bill');
  const chamber = requiredString(bill.originChamber);
  if (chamber !== 'House' && chamber !== 'Senate') throw new Error('Unknown origin chamber');
  if (!Array.isArray(bill.sponsors) || bill.sponsors.length !== 1) throw new Error('Expected exactly one sponsor');
  const introducedDate = day(bill.introducedDate);
  const counts = bill.cosponsors === undefined ? { count: 0, countIncludingWithdrawnCosponsors: 0 } : object(bill.cosponsors);
  const count = Number(counts.count), countIncludingWithdrawn = Number(counts.countIncludingWithdrawnCosponsors ?? counts.count);
  if (!Number.isSafeInteger(count) || !Number.isSafeInteger(countIncludingWithdrawn) || count < 0 || countIncludingWithdrawn < count) throw new Error('Invalid cosponsor counts');
  return { ...expected, chamber, introducedDate, label: `${labels[expected.type][0]} ${expected.number}`, title: requiredString(bill.title),
    sponsor: sponsorship(bill.sponsors[0], introducedDate), count, countIncludingWithdrawn };
}
export function parseCosponsorPages(pages: readonly unknown[]): Sponsorship[] {
  const rows: Sponsorship[] = [];
  let total: number | undefined, current: number | undefined;
  for (const value of pages) {
    const page = object(value), pagination = object(page.pagination);
    total ??= Number(pagination.countIncludingWithdrawnCosponsors ?? pagination.count);
    current ??= Number(pagination.count);
    if (!Array.isArray(page.cosponsors)) throw new Error('Expected cosponsor array');
    rows.push(...page.cosponsors.map(c => sponsorship(c, undefined)));
  }
  const active = rows.filter(r => !r.withdrawn).map(r => r.memberId);
  if (new Set(active).size !== active.length) throw new Error('A current cosponsor is listed twice');
  if (total === undefined || rows.length !== total || rows.filter(r => !r.withdrawn).length !== current) throw new Error('Cosponsor list does not match its published total');
  return rows;
}

export interface Supporter { memberId: string; role: 'sponsor' | 'cosponsor'; date: string; original: boolean; party: string }
export type CosponsorshipVote = Pick<Vote, 'id' | 'kind' | 'chamber' | 'date' | 'bill' | 'source'> & { officialTitle: string };
export function cosponsorshipItem(bill: BillInfo, cosponsors: readonly Sponsorship[], options: { signedBefore?: string }) {
  const id = `cosponsor-${bill.congress}-${bill.type}-${bill.number}`;
  if (options.signedBefore !== undefined) day(options.signedBefore);
  const current = cosponsors.filter(c => !c.withdrawn);
  if (current.some(c => c.memberId === bill.sponsor.memberId)) throw new Error('The sponsor is also listed as a cosponsor');
  const all: Supporter[] = [
    { memberId: bill.sponsor.memberId, role: 'sponsor', date: bill.introducedDate, original: true, party: bill.sponsor.party },
    ...current.map(c => ({ memberId: c.memberId, role: 'cosponsor' as const, date: c.date, original: c.original, party: c.party })),
  ];
  const late = options.signedBefore ? all.filter(s => s.date >= options.signedBefore!) : [];
  const supporters: Supporter[] = [], records: RecordEntry[] = [], withheld: (Supporter & { reason: string })[] = [];
  for (const s of all.filter(s => !late.includes(s))) {
    let partyAtVote;
    try { partyAtVote = party(s.party); } catch { withheld.push({ ...s, reason: `Unsupported party ${s.party} requires schema/editorial review` }); continue; }
    if (s.date < bill.introducedDate) throw new Error(`Sign-on before introduction for ${s.memberId}`);
    supporters.push(s);
    records.push({ memberId: s.memberId, voteId: id, outcome: 'Yes', partyAtVote });
  }
  const vote: CosponsorshipVote = { id, kind: 'cosponsorship', chamber: bill.chamber, date: bill.introducedDate, bill: bill.label, source: billPageUrl(bill), officialTitle: bill.title };
  return { vote, records, supporters, withdrawn: cosponsors.filter(c => c.withdrawn), late, withheld };
}

export async function fetchBillSupport(id: BillId, options: { apiKey: string; fetch?: typeof fetch; retrievedAt?: string }) {
  const get = options.fetch ?? fetch, retrievedAt = options.retrievedAt ?? new Date().toISOString();
  if (!options.apiKey) throw new Error('Congress.gov API key required');
  const raw: { url: string; text: string }[] = [];
  const load = async (url: string) => {
    const response = await get(url, { headers: { 'X-Api-Key': options.apiKey, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const text = await readSource(response, 5_000_000);
    raw.push({ url, text });
    return JSON.parse(text) as unknown;
  };
  const bill = parseBill(await load(billApiUrl(id)), id);
  const pages: unknown[] = [];
  for (let offset = 0; offset === 0 || offset < bill.countIncludingWithdrawn; offset += PAGE) pages.push(await load(cosponsorsApiUrl(id, offset)));
  const cosponsors = parseCosponsorPages(pages);
  const sources: SourceCapture[] = await Promise.all(raw.map(r => capture(r.text, r.url, 'votes', retrievedAt)));
  return { bill, cosponsors, raw, sources };
}
