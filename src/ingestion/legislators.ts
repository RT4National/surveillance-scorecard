import { bioguide, object, party, requiredString, type DatedAffiliation } from './members';
import type { Member, Party } from '../core/types';

/**
 * unitedstates/congress-legislators (CC0) supplies LIS IDs and exact-day terms that official
 * sources do not join. It is a reviewed supplement: every disagreement with official ballots is
 * reported, never resolved automatically.
 */
export type LegislatorsFile = 'current' | 'historical';
/** legislators-historical.json is about 13.5 MB; allow growth without accepting unbounded input. */
export const LEGISLATORS_MAX_BYTES = 20_000_000;
const pinnedPath = /^\/unitedstates\/congress-legislators\/[0-9a-f]{40}\/legislators-(current|historical)\.json$/;

export function legislatorsUrl(sha: string, file: LegislatorsFile): string {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('A pinned 40-character commit SHA is required');
  return `https://raw.githubusercontent.com/unitedstates/congress-legislators/${sha}/legislators-${file}.json`;
}
export function isLegislatorsUrl(value: string): boolean {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  return url.origin === 'https://raw.githubusercontent.com' && pinnedPath.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password;
}

interface PartyInterval { start: string; end: string; party: string }
export interface LegislatorTerm { type: 'rep' | 'sen'; start: string; end: string; state: string; district?: number; party?: string; parties: PartyInterval[] }
export interface LegislatorRecord { bioguide: string; lis?: string; last: string; fullName: string; terms: LegislatorTerm[] }
export interface Discrepancy {
  kind: 'missing-lis' | 'no-senate-term' | 'party-mismatch' | 'name-mismatch' | 'missing-bioguide' | 'overlapping-terms' | 'no-house-term' | 'unsupported-party' | 'withheld-terms';
  lisId?: string; memberId?: string; voteId?: string; date?: string; official?: string; supplemental?: string; detail: string;
}

function day(value: unknown): string {
  const text = requiredString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw new Error(`Invalid calendar date ${text}`);
  return text;
}
function previousDay(text: string): string {
  return new Date(Date.parse(`${text}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
}
function supportedParty(label: string | undefined): Party | undefined {
  try { return party(label); } catch { return undefined; }
}

export function parseLegislators(...files: string[]): LegislatorRecord[] {
  const records: LegislatorRecord[] = [], ids = new Set<string>(), lisIds = new Set<string>();
  for (const raw of files) {
    const input: unknown = JSON.parse(raw);
    if (!Array.isArray(input) || !input.length) throw new Error('Expected nonempty legislator array');
    for (const value of input) {
      const row = object(value), id = object(row.id), name = object(row.name), memberId = bioguide(id.bioguide);
      if (ids.has(memberId)) throw new Error(`Duplicate legislator ${memberId}`);
      ids.add(memberId);
      let lis: string | undefined;
      if (id.lis !== undefined) {
        lis = requiredString(id.lis);
        if (!/^S\d{3}$/.test(lis) || lisIds.has(lis)) throw new Error(`Invalid or duplicate LIS ID ${lis}`);
        lisIds.add(lis);
      }
      if (!Array.isArray(row.terms) || !row.terms.length) throw new Error(`Missing terms for ${memberId}`);
      const terms = row.terms.map(item => {
        const term = object(item), start = day(term.start), end = day(term.end);
        if ((term.type !== 'rep' && term.type !== 'sen') || end < start || !/^[A-Z]{2}$/.test(String(term.state))) throw new Error(`Invalid term for ${memberId}`);
        if (term.district !== undefined && (!Number.isInteger(term.district) || Number(term.district) < -1)) throw new Error(`Invalid district for ${memberId}`);
        const parties = term.party_affiliations === undefined ? [] : (Array.isArray(term.party_affiliations) ? term.party_affiliations : [null]).map(entry => {
          const interval = object(entry);
          return { start: day(interval.start), end: day(interval.end), party: requiredString(interval.party) };
        });
        return { type: term.type, start, end, state: String(term.state), ...(term.district === undefined ? {} : { district: Number(term.district) }),
          ...(term.party === undefined ? {} : { party: requiredString(term.party) }), parties } as LegislatorTerm;
      }).sort((a, b) => a.start.localeCompare(b.start));
      const last = requiredString(name.last);
      records.push({ bioguide: memberId, ...(lis ? { lis } : {}), last, fullName: typeof name.official_full === 'string' && name.official_full.trim() ? name.official_full.trim() : `${requiredString(name.first)} ${last}`, terms });
    }
  }
  return records;
}

const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
/** Senate XML display dates have irregular spacing, e.g. "January 18, 2018,  12:18 PM". */
export function senateVoteDate(display: string): string {
  const match = /^([A-Z][a-z]+) (\d{1,2}), (\d{4}),/.exec(display.trim());
  const month = match ? months.indexOf(match[1]) : -1;
  if (!match || month < 0) throw new Error(`Unrecognized Senate vote date ${display}`);
  return day(`${match[3]}-${String(month + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`);
}

/** Supplemental term on a vote date. Terms end at noon on their end date, so the end day belongs to the next term. */
function termOn(record: LegislatorRecord, type: LegislatorTerm['type'], date: string): LegislatorTerm | undefined {
  return record.terms.find((term, i) => term.type === type && term.start <= date &&
    (term.end > date || (term.end === date && record.terms[i + 1]?.start !== date)));
}
function partyLabelOn(term: LegislatorTerm, date: string): string | undefined {
  return term.parties.find(p => p.start <= date && p.end >= date)?.party ?? term.party;
}

export interface SenateBallot { lisId: string; name: string; state: string; party: string; date: string }
/**
 * A mapping is emitted only when every ballot for that LIS ID matches a same-state Senate term
 * on the vote date. Party and surname disagreements are reported but do not change identity.
 */
export function buildLisCrosswalk(records: readonly LegislatorRecord[], ballots: readonly SenateBallot[]) {
  const byLis = new Map(records.filter(r => r.lis).map(r => [r.lis!, r]));
  const crosswalk: Record<string, string> = {}, withheld = new Set<string>(), seen = new Set<string>();
  const discrepancies: Discrepancy[] = [];
  const report = (d: Discrepancy) => {
    const key = `${d.kind}:${d.lisId}`;
    if (!seen.has(key)) { seen.add(key); discrepancies.push(d); }
  };
  for (const ballot of ballots) {
    const record = byLis.get(ballot.lisId);
    if (!record) { withheld.add(ballot.lisId); report({ kind: 'missing-lis', lisId: ballot.lisId, date: ballot.date, official: ballot.name, detail: 'No supplemental record carries this LIS ID' }); continue; }
    const term = termOn(record, 'sen', ballot.date);
    if (!term || term.state !== ballot.state) {
      withheld.add(ballot.lisId);
      report({ kind: 'no-senate-term', lisId: ballot.lisId, memberId: record.bioguide, date: ballot.date, official: `${ballot.name} ${ballot.state}`, supplemental: term ? term.state : 'no Senate term', detail: 'Supplemental record has no same-state Senate term on the vote date' });
      continue;
    }
    const official = supportedParty(ballot.party), label = partyLabelOn(term, ballot.date), supplemental = supportedParty(label);
    if (official !== supplemental) report({ kind: 'party-mismatch', lisId: ballot.lisId, memberId: record.bioguide, date: ballot.date, official: official ?? ballot.party, supplemental: supplemental ?? label ?? 'none', detail: 'Ballot party differs from supplemental party on the vote date' });
    const surname = ballot.name.split(' (')[0].trim();
    if (surname.localeCompare(record.last, 'en', { sensitivity: 'base' }) !== 0) report({ kind: 'name-mismatch', lisId: ballot.lisId, memberId: record.bioguide, date: ballot.date, official: surname, supplemental: record.last, detail: 'Ballot surname differs from supplemental surname' });
    crosswalk[ballot.lisId] = record.bioguide;
  }
  for (const lis of withheld) delete crosswalk[lis];
  return { crosswalk, discrepancies };
}

/**
 * Exact-day term rows with inclusive ends. A term whose end equals the next term's start ends the
 * day before, because the handover happens at noon and the dataset rejects overlapping day terms.
 */
export function termAffiliations(records: readonly LegislatorRecord[], memberIds: readonly string[], sourceUrl: string) {
  if (!isLegislatorsUrl(sourceUrl)) throw new Error('Pinned congress-legislators source URL required');
  const byId = new Map(records.map(r => [r.bioguide, r]));
  const rows: DatedAffiliation[] = [], discrepancies: Discrepancy[] = [];
  for (const memberId of memberIds) {
    const record = byId.get(memberId);
    if (!record) { discrepancies.push({ kind: 'missing-bioguide', memberId, detail: 'No supplemental record for this Bioguide ID' }); continue; }
    const memberRows = record.terms.map((term, i): DatedAffiliation => {
      const next = record.terms[i + 1];
      return { memberId, kind: 'term', name: term.type === 'sen' ? 'Senate' : 'House of Representatives', start: term.start,
        end: next?.start === term.end ? previousDay(term.end) : term.end, precision: 'day', source: sourceUrl };
    });
    if (memberRows.some((row, i) => i > 0 && row.start <= memberRows[i - 1].end!)) {
      discrepancies.push({ kind: 'overlapping-terms', memberId, detail: 'Supplemental terms overlap after boundary adjustment; withheld for review' });
      continue;
    }
    rows.push(...memberRows);
  }
  return { rows, discrepancies };
}

export interface HouseBallot { memberId: string; voteId: string; date: string; partyAtVote: Party }
/** Evidence for a member in a given chamber on a given day, e.g. a ballot or a bill sign-on. */
export interface ChamberEvidence extends HouseBallot { chamber: Member['chamber'] }
export function checkHouseCoverage(records: readonly LegislatorRecord[], rows: readonly DatedAffiliation[], ballots: readonly HouseBallot[]): Discrepancy[] {
  return checkTermCoverage(records, rows, ballots.map(b => ({ ...b, chamber: 'House' as const })));
}
export function checkTermCoverage(records: readonly LegislatorRecord[], rows: readonly DatedAffiliation[], evidence: readonly ChamberEvidence[]): Discrepancy[] {
  const byId = new Map(records.map(r => [r.bioguide, r]));
  const discrepancies: Discrepancy[] = [];
  for (const ballot of evidence) {
    const house = ballot.chamber === 'House', name = house ? 'House of Representatives' : 'Senate';
    const covered = rows.some(r => r.memberId === ballot.memberId && r.name === name && r.start <= ballot.date && (!r.end || r.end >= ballot.date));
    const record = byId.get(ballot.memberId), term = record && termOn(record, house ? 'rep' : 'sen', ballot.date);
    if (!covered || !term) { discrepancies.push({ kind: house ? 'no-house-term' : 'no-senate-term', memberId: ballot.memberId, voteId: ballot.voteId, date: ballot.date, detail: house ? 'No exact-day House term covers this ballot' : 'No exact-day Senate term covers this evidence' }); continue; }
    const label = partyLabelOn(term, ballot.date), supplemental = supportedParty(label);
    if (!supplemental) discrepancies.push({ kind: 'unsupported-party', memberId: ballot.memberId, voteId: ballot.voteId, date: ballot.date, official: ballot.partyAtVote, supplemental: label ?? 'none', detail: 'Supplemental party label is outside the publication schema' });
    else if (supplemental !== ballot.partyAtVote) discrepancies.push({ kind: 'party-mismatch', memberId: ballot.memberId, voteId: ballot.voteId, date: ballot.date, official: ballot.partyAtVote, supplemental, detail: 'Ballot party differs from supplemental party on the vote date' });
  }
  return discrepancies;
}

/**
 * Candidate Member rows for historical voters absent from the current roster, from the latest
 * supplemental term. Status is a placeholder: retirement, defeat and death are not inferred.
 */
export function candidateMembers(records: readonly LegislatorRecord[], memberIds: readonly string[]) {
  const byId = new Map(records.map(r => [r.bioguide, r]));
  const members: Member[] = [], discrepancies: Discrepancy[] = [];
  for (const memberId of memberIds) {
    const record = byId.get(memberId);
    if (!record) { discrepancies.push({ kind: 'missing-bioguide', memberId, detail: 'No supplemental record for this Bioguide ID' }); continue; }
    const latest = record.terms[record.terms.length - 1], label = latest.parties.at(-1)?.party ?? latest.party, memberParty = supportedParty(label);
    if (!memberParty) { discrepancies.push({ kind: 'unsupported-party', memberId, supplemental: label ?? 'none', detail: 'Latest supplemental party is outside the publication schema' }); continue; }
    const chamber = latest.type === 'sen' ? 'Senate' : 'House';
    members.push({ id: memberId, name: record.fullName, party: memberParty, state: latest.state, chamber,
      ...(chamber === 'House' && latest.district !== undefined && latest.district >= 0 ? { district: latest.district } : {}),
      status: 'inactive', committees: [], caucuses: [], since: Number(latest.start.slice(0, 4)) });
  }
  return { members, discrepancies };
}

export interface IdentityInput {
  current: readonly LegislatorRecord[];
  historical: readonly LegislatorRecord[];
  currentUrl: string;
  historicalUrl: string;
  rosterIds: Iterable<string>;
  senateBallots: readonly SenateBallot[];
  houseBallots: readonly HouseBallot[];
  /** Non-ballot evidence such as bill sponsorship, checked against exact-day terms like ballots. */
  supporters?: readonly ChamberEvidence[];
  /** A previously staged supplement: its mappings, term rows and candidates are reused, never re-emitted. */
  existing?: { crosswalk: Readonly<Record<string, string>>; affiliations: readonly DatedAffiliation[]; candidateMembers: readonly Member[] };
}
/**
 * The identity packet behind stage-legislators.mjs, generalized to extend an existing packet with
 * extra ballots and bill supporters. Returns only new crosswalk entries, term rows and candidates.
 */
export function identitySupplement(input: IdentityInput) {
  const records = [...input.current, ...input.historical], existing = input.existing ?? { crosswalk: {}, affiliations: [], candidateMembers: [] };
  const supporters = input.supporters ?? [];
  const { crosswalk: mapped, discrepancies: senateDiscrepancies } = buildLisCrosswalk(records, input.senateBallots);
  const crosswalk: Record<string, string> = {};
  for (const [lis, id] of Object.entries(mapped)) {
    if (existing.crosswalk[lis] !== undefined && existing.crosswalk[lis] !== id) throw new Error(`LIS ${lis} conflicts with the existing crosswalk`);
    if (existing.crosswalk[lis] === undefined) crosswalk[lis] = id;
  }
  const needed = [...new Set([...input.houseBallots.map(b => b.memberId), ...Object.values(mapped), ...supporters.map(s => s.memberId)])].sort();
  const covered = new Set(existing.affiliations.filter(a => a.kind === 'term').map(a => a.memberId));
  const fresh = needed.filter(id => !covered.has(id));
  const inCurrent = new Set(input.current.map(r => r.bioguide)), inHistorical = new Set(input.historical.map(r => r.bioguide));
  const currentTerms = termAffiliations(input.current, fresh.filter(id => inCurrent.has(id)), input.currentUrl);
  const historicalTerms = termAffiliations(input.historical, fresh.filter(id => inHistorical.has(id)), input.historicalUrl);
  const absent: Discrepancy[] = fresh.filter(id => !inCurrent.has(id) && !inHistorical.has(id))
    .map(memberId => ({ kind: 'missing-bioguide', memberId, detail: 'No supplemental record for this Bioguide ID' }));
  const newTerms = [...currentTerms.rows, ...historicalTerms.rows], allTerms = [...existing.affiliations, ...newTerms];
  const coverage = [...checkHouseCoverage(records, allTerms, input.houseBallots), ...checkTermCoverage(records, allTerms, supporters)];
  const rosterIds = new Set(input.rosterIds), existingCandidates = new Set(existing.candidateMembers.map(m => m.id));
  const candidates = candidateMembers(records, needed.filter(id => !rosterIds.has(id) && !existingCandidates.has(id)));
  // Term rows are importable only for members the dataset will contain.
  const importable = new Set([...rosterIds, ...existingCandidates, ...candidates.members.map(m => m.id)]);
  const affiliations = newTerms.filter(row => importable.has(row.memberId));
  const withheld = [...new Set(newTerms.filter(r => !importable.has(r.memberId)).map(r => r.memberId))].map((memberId): Discrepancy => ({
    kind: 'withheld-terms', memberId, supplemental: String(newTerms.filter(r => r.memberId === memberId).length),
    detail: 'Term rows withheld because this member has no roster or candidate record; their evidence cannot be imported until an editor resolves it',
  }));
  const discrepancies = [...senateDiscrepancies, ...currentTerms.discrepancies, ...historicalTerms.discrepancies, ...absent, ...coverage, ...candidates.discrepancies, ...withheld];
  return { crosswalk, mappedLisIds: Object.keys(mapped).length, affiliations, candidateMembers: candidates.members, discrepancies };
}
