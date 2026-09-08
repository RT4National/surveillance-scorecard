import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { SourceCapture } from '../core/publication';
import type { Outcome, RecordEntry, Vote } from '../core/types';
import { bioguide, capture, object, party, requiredString } from './members';

export interface RollcallStage {
  id: string;
  chamber: 'House' | 'Senate';
  congress: number;
  session: number;
  roll: number;
  date: string;
  question: string;
  bill: string;
  records: RecordEntry[];
  sources: SourceCapture[];
  warnings: string[];
  requiresReview: true;
}
const list = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
function positive(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Invalid roll call identity');
  return n;
}
function parse(xml: string): Record<string, unknown> {
  if (xml.length > 2_000_000 || /<!ENTITY/i.test(xml)) throw new Error('Oversized XML or entity declaration refused');
  if (XMLValidator.validate(xml) !== true) throw new Error('Invalid roll call XML');
  return object(new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false }).parse(xml));
}
function outcome(value: unknown): Outcome {
  switch (value) {
    case 'Yea': case 'Aye': return 'Yes';
    case 'Nay': case 'No': return 'No';
    case 'Not Voting': case 'Not voting': case 'Present': return 'Not voting';
    default: throw new Error(`Unsupported ballot ${String(value)}; non-binary election/quorum must be reviewed`);
  }
}
function date(value: unknown): string {
  const text = requiredString(value);
  const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const house = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(text);
  const senate = /^([A-Za-z]+) (\d{1,2}), (\d{4})(?:,.*)?$/.exec(text);
  if (!house && !senate) throw new Error('Unsupported official vote date');
  const year = (house ?? senate)![3];
  const month = months.indexOf((house ? house[2] : senate![1]).slice(0,3).toLowerCase()) + 1;
  const day = Number(house ? house[1] : senate![2]);
  const result = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if (month < 1 || day < 1 || day > 31 || new Date(`${result}T00:00:00Z`).toISOString().slice(0,10) !== result) throw new Error('Invalid vote date');
  return result;
}
function validateRecords(records: RecordEntry[], expected: number, yes: number, no: number) {
  if (!records.length || records.length !== expected || new Set(records.map(r => r.memberId)).size !== records.length) throw new Error('Roll call totals mismatch, empty vote, or duplicate members');
  if (records.filter(r => r.outcome === 'Yes').length !== yes || records.filter(r => r.outcome === 'No').length !== no) throw new Error('Roll call outcome totals mismatch');
}
function total(value: unknown): number {
  if (value === undefined || value === '') return 0;
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid official ballot total');
  return count;
}

export async function parseHouseRollcall(xml: string, sourceUrl: string, retrievedAt = new Date().toISOString()): Promise<RollcallStage> {
  const source = new URL(sourceUrl);
  if (source.origin !== 'https://clerk.house.gov' || !/^\/evs\/\d{4}\/roll\d+\.xml$/.test(source.pathname)) throw new Error('Expected official House roll call URL');
  const root = object(parse(xml)['rollcall-vote']), meta = object(root['vote-metadata']);
  const congress = positive(meta.congress), session = positive(requiredString(meta.session).replace(/(?:st|nd)$/, '')), roll = positive(meta['rollcall-num']);
  const id = `house-${congress}-${session}-${roll}`;
  const records = list(object(root['vote-data'])['recorded-vote']).map(item => {
    const row = object(item), legislator = object(row.legislator);
    return { memberId: bioguide(legislator['@_name-id']), voteId: id, outcome: outcome(row.vote), partyAtVote: party(legislator['@_party']) };
  });
  const counts = object(object(meta['vote-totals'])['totals-by-vote']);
  validateRecords(records, ['yea-total','nay-total','present-total','not-voting-total'].reduce((n,key) => n + total(counts[key]),0), total(counts['yea-total']), total(counts['nay-total']));
  const voteDate = date(meta['action-date']);
  if (Number(source.pathname.match(/roll(\d+)\.xml$/)![1]) !== roll || source.pathname.split('/')[2] !== voteDate.slice(0,4)) throw new Error('Source URL and vote identity disagree');
  return { id, chamber: 'House', congress, session, roll, date: voteDate, question: requiredString(meta['vote-question']), bill: requiredString(meta['legis-num']), records,
    sources: [await capture(xml, sourceUrl, 'votes', retrievedAt)], warnings: ['Present ballots are retained in the source capture and treated as Not voting by the current outcome schema.'], requiresReview: true };
}

/** Senate XML uses LIS IDs. Caller supplies an independently reviewed LIS -> Bioguide crosswalk. */
export async function parseSenateRollcall(xml: string, sourceUrl: string, lisToBioguide: Readonly<Record<string,string>>, retrievedAt = new Date().toISOString()): Promise<RollcallStage> {
  const source = new URL(sourceUrl);
  if (source.origin !== 'https://www.senate.gov' || !/^\/legislative\/LIS\/roll_call_votes\/vote\d+\/vote_\d+_\d+_\d+\.xml$/.test(source.pathname)) throw new Error('Expected official Senate roll call URL');
  const root = object(parse(xml).roll_call_vote);
  const congress = positive(root.congress), session = positive(root.session), roll = positive(root.vote_number), id = `senate-${congress}-${session}-${roll}`;
  const identity = source.pathname.match(/vote_(\d+)_(\d+)_(\d+)\.xml$/)!;
  if (Number(identity[1]) !== congress || Number(identity[2]) !== session || Number(identity[3]) !== roll) throw new Error('Source URL and vote identity disagree');
  const records = list(object(root.members).member).map(item => {
    const row = object(item), lis = requiredString(row.lis_member_id);
    if (!lisToBioguide[lis]) throw new Error(`Missing reviewed Senate identity crosswalk for ${lis}`);
    return { memberId: bioguide(lisToBioguide[lis]), voteId: id, outcome: outcome(row.vote_cast), partyAtVote: party(row.party) };
  });
  const counts = object(root.count);
  validateRecords(records, ['yeas','nays','present','absent'].reduce((n,key) => n + total(counts[key]),0), total(counts.yeas), total(counts.nays));
  return { id, chamber: 'Senate', congress, session, roll, date: date(root.vote_date), question: requiredString(root.question), bill: requiredString(object(root.document).document_name), records,
    sources: [await capture(xml, sourceUrl, 'votes', retrievedAt)], warnings: ['Senate identity mapping must be sourced and reviewed separately; present ballots use Not voting.'], requiresReview: true };
}

/** Editorial direction and context are deliberately not inferred from bill title or sponsor party. */
export function reviewRollcall(stage: RollcallStage, editorial: Pick<Vote,'title'|'administration'|'presidentParty'|'reformVote'|'weight'|'topic'|'rationale'>): { vote: Vote; records: RecordEntry[] } {
  if (!editorial.title.trim() || !editorial.administration.trim() || !editorial.topic.trim() || !editorial.rationale.trim() || !['Yes','No'].includes(editorial.reformVote) || !Number.isFinite(editorial.weight) || editorial.weight <= 0) throw new Error('Complete editorial review is required before scoring');
  party(editorial.presidentParty);
  return { vote: { ...editorial, id: stage.id, chamber: stage.chamber, date: stage.date, bill: stage.bill, source: stage.sources[0].url }, records: stage.records };
}
