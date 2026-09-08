import type { SourceCapture } from '../core/publication';
import { bioguide, capture, requiredString } from './members';

export interface LegacyRow { rowNumber: number; memberId: string; cells: string[]; oldPath?: string; }
export interface LegacyStage { source: SourceCapture; header: string[]; rows: LegacyRow[]; redirects: Record<string,string>; warnings: string[]; requiresReview: true; }

/** Accept the original newsb Google Sheets values export, never evaluated JS or Ruby. */
export async function stageLegacySheet(rawJson: string, sourceUrl: string, options: { now?: string; reviewedPaths?: Record<string,string> } = {}): Promise<LegacyStage> {
  const data = JSON.parse(rawJson) as { values?: unknown };
  if (!Array.isArray(data.values) || data.values.length < 2) throw new Error('Expected Google Sheets values including header');
  const values = data.values.map(row => {
    if (!Array.isArray(row) || row.some(cell => typeof cell !== 'string')) throw new Error('Legacy cells must be strings');
    return row as string[];
  });
  if (values[0].length < 17) throw new Error('Legacy header is missing identity columns');
  const seen = new Set<string>();
  const rows = values.slice(1).map((cells, i) => {
    // Original ScorecardPolitical.jsx processPolitician maps bioguide from entry[16].
    const memberId = bioguide(cells[16]);
    if (seen.has(memberId)) throw new Error(`Duplicate legacy identity ${memberId}`);
    seen.add(memberId);
    return { rowNumber: i + 2, memberId, cells };
  });
  const redirects: Record<string,string> = {};
  for (const [path, target] of Object.entries(options.reviewedPaths ?? {})) {
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\\s]/.test(path)) throw new Error('Legacy redirect must be a local path without query or fragment');
    const id = bioguide(target);
    if (!seen.has(id)) throw new Error('Redirect target absent from legacy import');
    redirects[path] = `/scorecard/?member=${encodeURIComponent(id)}`;
  }
  requiredString(sourceUrl);
  return { source: await capture(rawJson, sourceUrl, 'legacy', options.now ?? new Date().toISOString()), header: values[0], rows, redirects,
    warnings: ['Legacy grades and issue cells are preserved as unverified historical evidence, not imported as current votes.', 'Map every scored column to official vote identity, date, outcome, and reviewed rubric before publishing.', 'Original portraits need their own provenance and rights review.'], requiresReview: true };
}
