import type { SourceCapture } from '../core/publication';
import { bioguide, capture, requiredString } from './members';

export interface LegacyRow { rowNumber: number; memberId: string; cells: string[]; oldPath?: string; }
export interface UnidentifiedLegacyRow { rowNumber: number; cells: string[]; }
export interface LegacyStage { source: SourceCapture; header: string[]; rows: LegacyRow[]; unidentifiedRows: UnidentifiedLegacyRow[]; redirects: Record<string,string>; warnings: string[]; requiresReview: true; }

/** RFC 4180 CSV, as produced by the Google Sheets CSV export. Malformed quoting fails rather than guessing. */
export function sheetValuesFromCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, i = 0;
  const endCell = () => { row.push(cell); cell = ''; };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { quoted = false; i++; if (i < text.length && !',\r\n'.includes(text[i])) throw new Error('Malformed CSV quoting'); continue; }
      cell += c; i++; continue;
    }
    if (c === '"') { if (cell) throw new Error('Malformed CSV quoting'); quoted = true; i++; continue; }
    if (c === ',') { endCell(); i++; continue; }
    if (c === '\r' || c === '\n') { endCell(); rows.push(row); row = []; i += c === '\r' && text[i + 1] === '\n' ? 2 : 1; continue; }
    cell += c; i++;
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  if (cell || row.length) { endCell(); rows.push(row); }
  return rows;
}

/**
 * Accept the newsb sheet as Google Sheets values JSON or its CSV export, never evaluated JS or Ruby.
 * The identity column is located by its `bioguide` header: the sheet has gained columns since the
 * original ScorecardPolitical.jsx read entry[16], which is now `twitter`.
 */
export async function stageLegacySheet(raw: string, sourceUrl: string, options: { now?: string; reviewedPaths?: Record<string,string>; format?: 'values' | 'csv' } = {}): Promise<LegacyStage> {
  let values: unknown[];
  if (options.format === 'csv') values = sheetValuesFromCsv(raw);
  else {
    const data = JSON.parse(raw) as { values?: unknown };
    if (!Array.isArray(data.values)) throw new Error('Expected Google Sheets values including header');
    values = data.values;
  }
  if (values.length < 2) throw new Error('Expected Google Sheets values including header');
  const rowsIn = values.map(row => {
    if (!Array.isArray(row) || row.some(cell => typeof cell !== 'string')) throw new Error('Legacy cells must be strings');
    return row as string[];
  });
  const header = rowsIn[0];
  const identityColumns = header.flatMap((name, i) => name.trim().toLowerCase() === 'bioguide' ? [i] : []);
  if (identityColumns.length !== 1) throw new Error('Legacy header must contain exactly one bioguide column');
  const column = identityColumns[0];
  const seen = new Set<string>();
  const rows: LegacyRow[] = [], unidentifiedRows: UnidentifiedLegacyRow[] = [];
  rowsIn.slice(1).forEach((cells, i) => {
    const rowNumber = i + 2;
    // Blank identities stay unidentified; names are never used to guess one.
    if (!(cells[column] ?? '').trim()) { unidentifiedRows.push({ rowNumber, cells }); return; }
    const memberId = bioguide(cells[column].trim());
    if (seen.has(memberId)) throw new Error(`Duplicate legacy identity ${memberId}`);
    seen.add(memberId);
    rows.push({ rowNumber, memberId, cells });
  });
  const redirects: Record<string,string> = {};
  for (const [path, target] of Object.entries(options.reviewedPaths ?? {})) {
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\\s]/.test(path)) throw new Error('Legacy redirect must be a local path without query or fragment');
    const id = bioguide(target);
    if (!seen.has(id)) throw new Error('Redirect target absent from legacy import');
    redirects[path] = `/scorecard/?member=${encodeURIComponent(id)}`;
  }
  requiredString(sourceUrl);
  return { source: await capture(raw, sourceUrl, 'legacy', options.now ?? new Date().toISOString()), header, rows, unidentifiedRows, redirects,
    warnings: ['Legacy grades and issue cells are preserved as unverified historical evidence, not imported as current votes.', 'Map every scored column to official vote identity, date, outcome, and reviewed rubric before publishing.', 'Original portraits need their own provenance and rights review.',
      ...(unidentifiedRows.length ? [`${unidentifiedRows.length} row${unidentifiedRows.length === 1 ? '' : 's'} without a bioguide value retained as unidentified; identities must be supplied by review, not by name matching.`] : [])], requiresReview: true };
}
