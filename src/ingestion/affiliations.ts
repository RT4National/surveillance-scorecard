import { bioguide, capture, object, party, requiredString, type DatedAffiliation } from './members';
import type { Dataset } from '../core/publication';

export function mergeAffiliationRows(previous: readonly DatedAffiliation[], incoming: readonly DatedAffiliation[]): DatedAffiliation[] {
  const key = (row: DatedAffiliation) => JSON.stringify([row.memberId, row.kind, row.name, row.start, row.end ?? null, row.precision]);
  return [...new Map([...previous, ...incoming].map(row => [key(row), row])).values()];
}

function boundary(value: unknown, precision: DatedAffiliation['precision']): string {
  const text = requiredString(value);
  if (precision === 'year' && /^\d{4}$/.test(text) && Number(text) >= 1789) return text;
  if (precision === 'day' && /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(`${text}T00:00:00Z`).toISOString().slice(0,10) === text) return text;
  throw new Error('Affiliation boundary must have declared year/day precision');
}
function bounds(row: DatedAffiliation): [string,string] {
  return [row.precision === 'year' ? `${row.start}-01-01` : row.start,
    row.end ? row.precision === 'year' ? `${row.end}-12-31` : row.end : '9999-12-31'];
}

/** Supplemental sourced chronology. End boundaries are inclusive. No dates are invented. */
export async function stageAffiliations(rawJson: string, sourceUrl: string, knownMemberIds: readonly string[], now = new Date().toISOString()) {
  const input: unknown = JSON.parse(rawJson);
  if (!Array.isArray(input) || !input.length) throw new Error('Expected nonempty affiliation array');
  const known = new Set(knownMemberIds);
  const rows: DatedAffiliation[] = input.map(value => {
    const row = object(value), memberId = bioguide(row.memberId);
    if (!known.has(memberId)) throw new Error(`Unknown affiliation member ${memberId}`);
    if (!['party','committee','caucus','term'].includes(String(row.kind))) throw new Error('Invalid affiliation kind');
    if (row.precision !== 'year' && row.precision !== 'day') throw new Error('Invalid affiliation precision');
    const kind = row.kind as DatedAffiliation['kind'], precision = row.precision;
    const start = boundary(row.start, precision), end = row.end === undefined ? undefined : boundary(row.end, precision);
    if (end && end < start) throw new Error('Affiliation ends before it starts');
    const name = requiredString(row.name), source = new URL(requiredString(row.source));
    if (source.protocol !== 'https:' || source.username || source.password) throw new Error('Affiliation source must be an HTTPS evidence URL');
    if (kind === 'party') party(name);
    return { memberId, kind, name, start, ...(end ? { end } : {}), precision, source: source.toString() };
  });
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.memberId !== b.memberId || a.kind !== b.kind || (a.kind !== 'party' && a.name !== b.name)) continue;
    const [aStart,aEnd] = bounds(a), [bStart,bEnd] = bounds(b);
    if (aStart <= bEnd && bStart <= aEnd) throw new Error('Overlapping affiliation intervals require explicit editorial resolution');
  }
  return { rows, source: await capture(rawJson, sourceUrl, 'memberships', now), requiresReview: true as const,
    warnings: rows.some(row => row.precision === 'year') ? ['Year-precision affiliations cannot resolve exact party or membership on an individual vote date.'] : [] };
}

/** Exact-day lookup excludes coarse year data instead of pretending it establishes a day. */
export function affiliationsOn(rows: readonly DatedAffiliation[], memberId: string, on: string): DatedAffiliation[] {
  boundary(on, 'day');
  return rows.filter(row => row.memberId === memberId && row.precision === 'day' && row.start <= on && (!row.end || row.end >= on));
}

export async function reconcileAffiliations(previous: Dataset, stage: Awaited<ReturnType<typeof stageAffiliations>>): Promise<{ dataset: Dataset; requiresReview: true }> {
  const rows = mergeAffiliationRows(previous.affiliations ?? [], stage.rows);
  // Check the combined chronology: individually valid imports can conflict with published history.
  await stageAffiliations(JSON.stringify(rows), stage.source.url, previous.members.map(m => m.id), stage.source.retrievedAt);
  return { requiresReview: true, dataset: { ...previous, id: `staging-${crypto.randomUUID()}`, affiliations: rows,
    sources: [...previous.sources, stage.source], coverage: [...previous.coverage, ...stage.warnings] } };
}
