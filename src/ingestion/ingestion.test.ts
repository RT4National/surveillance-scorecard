import { describe, expect, it } from 'vitest';
import { ingestCurrentMembers, publishablePortrait, reconcileRoster, readSource, type RosterRun } from './members';
import { parseHouseRollcall, parseSenateRollcall, reviewRollcall } from './rollcalls';
import { stageLegacySheet } from './legacy';
import { stageAffiliations, affiliationsOn, reconcileAffiliations } from './affiliations';
import { cachePortrait } from './portraits';
import type { Dataset } from '../core/publication';

const member = (id = 'A000001') => ({ bioguideId: id, name: 'Example, Member', state: 'California', partyName: 'Democratic', district: 0, terms: { item: [{ chamber: 'House of Representatives', startYear: 2025 }] }, depiction: { imageUrl: 'https://www.congress.gov/img/member/a000001.jpg', attribution: 'Official portrait' } });
function fetchPages(pages: unknown[]): typeof fetch {
  let index = 0;
  return (async () => new Response(JSON.stringify(pages[index++]), { status: 200 })) as typeof fetch;
}
const base: Dataset = { id: 'real', asOf: '2025-01-01', demo: false, members: [], votes: [], records: [], rubric: { version: '1', minVotes: 3, minPerContext: 2, consistencyThreshold: 20 }, sources: [], coverage: [] };
const house = `<rollcall-vote><vote-metadata><congress>119</congress><session>1st</session><rollcall-num>2</rollcall-num><legis-num>H R 1</legis-num><vote-question>On Passage</vote-question><action-date>3-Jan-2025</action-date><vote-totals><totals-by-vote><yea-total>1</yea-total><nay-total>0</nay-total><present-total>0</present-total><not-voting-total>0</not-voting-total></totals-by-vote></vote-totals></vote-metadata><vote-data><recorded-vote><legislator name-id="A000001" party="D">Example</legislator><vote>Yea</vote></recorded-vote></vote-data></rollcall-vote>`;
const senate = `<roll_call_vote><congress>119</congress><session>1</session><vote_number>2</vote_number><vote_date>January 9, 2025, 02:54 PM</vote_date><question>On Passage</question><document><document_name>S. 5</document_name></document><count><yeas>0</yeas><nays>1</nays><present/><absent>0</absent></count><members><member><lis_member_id>S123</lis_member_id><party>I</party><vote_cast>Nay</vote_cast></member></members></roll_call_vote>`;
const houseUrl = 'https://clerk.house.gov/evs/2025/roll002.xml';
const senateUrl = 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00002.xml';

describe('Congress roster staging', () => {
  it('paginates, captures exact source digests, retains at-large districts, and omits keys', async () => {
    const run = await ingestCurrentMembers({ apiKey: 'secret', now: '2025-01-03T00:00:00Z', fetcher: fetchPages([
      { members: [member()], pagination: { count: 2, next: 'https://api.congress.gov/v3/member?offset=1&api_key=secret' } },
      { members: [member('B000002')], pagination: { count: 2 } },
    ]) });
    expect(run.members).toHaveLength(2); expect(run.members[0].district).toBe(0);
    expect(run.sources[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(run)).not.toContain('secret');
    expect(run.affiliations[0].precision).toBe('year');
    expect(publishablePortrait(run.portraits[0])).toBe(false);
  });
  it('refuses truncated and inconsistent rosters', async () => {
    await expect(ingestCurrentMembers({ apiKey: 'key', fetcher: fetchPages([{ members: [member()], pagination: { count: 2 } }]) })).rejects.toThrow('Partial roster');
    await expect(ingestCurrentMembers({ apiKey: 'key', fetcher: fetchPages([
      { members: [member()], pagination: { count: 2, next: 'https://api.congress.gov/v3/member?offset=1' } },
      { members: [member('B000002')], pagination: { count: 3 } },
    ]) })).rejects.toThrow('count');
  });
  it('does not send keys to pagination hosts and rejects duplicate identities', async () => {
    await expect(ingestCurrentMembers({ apiKey: 'key', fetcher: fetchPages([{ members: [member()], pagination: { count: 2, next: 'https://evil.example/v3/member' } }]) })).rejects.toThrow('Untrusted');
    await expect(ingestCurrentMembers({ apiKey: 'key', fetcher: fetchPages([{ members: [member(), member()], pagination: { count: 2 } }]) })).rejects.toThrow('Duplicate');
  });
  it('preserves absent active members and never marks demo evidence as real', async () => {
    const run = await ingestCurrentMembers({ apiKey: 'key', fetcher: fetchPages([{ members: [member()], pagination: { count: 1 } }]) });
    const previous = { ...base, demo: true, members: [{ ...run.members[0], id: 'B000002' }] };
    const stage = reconcileRoster(previous, run);
    expect(stage.missingMemberIds).toEqual(['B000002']); expect(stage.dataset.members).toHaveLength(2);
    expect(stage.dataset.members.every(m => m.status === 'active')).toBe(true); expect(stage.dataset.demo).toBe(true);
    expect(() => reconcileRoster(previous, { ...run, complete: false } as unknown as RosterRun)).toThrow();
  });
  it('preserves reviewed portrait metadata and produces a date-only dataset cutoff', async () => {
    const run = await ingestCurrentMembers({ apiKey: 'key', now: '2025-01-03T12:00:00Z', fetcher: fetchPages([{ members: [member()], pagination: { count: 1 } }]) });
    const portrait = { url: '/scorecard/portraits/approved.jpg', attribution: 'Official photo', rights: 'licensed' as const, rightsSource: 'https://example.org/license', reviewedBy: 'editor' };
    const stage = reconcileRoster({ ...base, members: [{ ...run.members[0], portrait, committees: ['Judiciary'] }] }, run);
    expect(stage.dataset.members[0].portrait).toEqual(portrait);
    expect(stage.dataset.members[0].committees).toEqual(['Judiciary']);
    expect(stage.dataset.asOf).toBe('2025-01-03');
    expect(stage.dataset.sources[0].retrievedAt).toBe('2025-01-03T12:00:00Z');
    expect(stage.dataset.affiliations).toEqual(run.affiliations);
    expect(reconcileRoster(stage.dataset, run).dataset.affiliations).toHaveLength(run.affiliations.length);
  });
  it('requires portrait rights evidence and reviewer', () => {
    const portrait = { memberId: 'A000001', url: 'https://example.org/portrait.jpg', attribution: 'Photo credit', rights: 'licensed' as const, rightsSource: 'https://example.org/license', reviewedBy: 'editor' };
    expect(publishablePortrait(portrait)).toBe(true);
    expect(publishablePortrait({ ...portrait, reviewedBy: '' })).toBe(false);
    expect(publishablePortrait({ ...portrait, url: 'javascript:alert(1)' })).toBe(false);
  });
  it('bounds source bytes and refuses invalid UTF-8', async () => {
    await expect(readSource(new Response('larger than allowed'), 4)).rejects.toThrow('size limit');
    await expect(readSource(new Response(new Uint8Array([0xff, 0xff])))).rejects.toThrow();
  });
});

describe('Official roll calls', () => {
  it('imports House ballots and requires an editorial scoring direction', async () => {
    const stage = await parseHouseRollcall(house, houseUrl);
    expect(stage.records[0]).toEqual({ memberId: 'A000001', voteId: 'house-119-1-2', outcome: 'Yes', partyAtVote: 'Democratic' });
    expect(stage.date).toBe('2025-01-03');
    const editorial = { title: 'Reviewed bill', administration: 'Biden', presidentParty: 'Democratic' as const, reformVote: 'No' as const, weight: 1, topic: 'Surveillance', rationale: 'Reviewed explanation' };
    expect(reviewRollcall(stage, editorial).vote.reformVote).toBe('No');
    expect(() => reviewRollcall(stage, { ...editorial, rationale: '' })).toThrow();
  });
  it('refuses partial ballots and URL identity mismatches', async () => {
    await expect(parseHouseRollcall(house.replace('<yea-total>1', '<yea-total>2'), houseUrl)).rejects.toThrow('totals');
    await expect(parseHouseRollcall(house.replace('Yea</vote>', 'Nay</vote>'), houseUrl)).rejects.toThrow('outcome totals');
    await expect(parseHouseRollcall(house, houseUrl.replace('002', '003'))).rejects.toThrow('identity');
    await expect(parseHouseRollcall(house.replace('Yea</vote>', 'Example</vote>'), houseUrl)).rejects.toThrow('Unsupported');
  });
  it('imports Senate ballots only with a complete identity crosswalk', async () => {
    await expect(parseSenateRollcall(senate, senateUrl, {})).rejects.toThrow('crosswalk');
    const stage = await parseSenateRollcall(senate, senateUrl, { S123: 'B000002' });
    expect(stage.records[0].outcome).toBe('No'); expect(stage.records[0].partyAtVote).toBe('Independent');
    expect(stage.date).toBe('2025-01-09');
  });
  it('rejects malicious entities and invalid XML', async () => {
    await expect(parseHouseRollcall('<!ENTITY leak SYSTEM "file:///etc/passwd">' + house, houseUrl)).rejects.toThrow('entity');
    await expect(parseHouseRollcall(house.slice(0,-12), houseUrl)).rejects.toThrow('Invalid');
  });
});

describe('DecideTheFuture migration', () => {
  const cells = Array.from({ length: 25 }, (_,i) => i === 16 ? 'A000001' : `cell ${i}`);
  const raw = JSON.stringify({ values: [cells.map((_,i) => `header ${i}`), cells] });
  it('preserves every old cell, creates only reviewed local redirects, and does not fabricate votes', async () => {
    const stage = await stageLegacySheet(raw, 'https://sheets.googleapis.com/v4/spreadsheets/example/values/newsb?key=secret', { reviewedPaths: { '/politician/example': 'A000001' } });
    expect(stage.rows[0].cells).toEqual(cells); expect(stage.redirects['/politician/example']).toBe('/scorecard/?member=A000001');
    expect(stage.source.url).not.toContain('secret'); expect(stage.requiresReview).toBe(true);
  });
  it('refuses duplicate identities and open redirects', async () => {
    await expect(stageLegacySheet(JSON.stringify({ values: [cells, cells, cells] }), 'https://example.org')).rejects.toThrow('Duplicate');
    await expect(stageLegacySheet(raw, 'https://example.org', { reviewedPaths: { '//evil.org': 'A000001' } })).rejects.toThrow('local path');
  });
});

describe('Supplemental membership chronology', () => {
  const row = { memberId: 'A000001', kind: 'party', name: 'Independent', start: '2025-01-03', precision: 'day', source: 'https://www.senate.gov/example' };
  it('preserves exact intervals and does not treat coarse years as exact dates', async () => {
    const stage = await stageAffiliations(JSON.stringify([row]), 'https://example.org/import', ['A000001']);
    expect(affiliationsOn(stage.rows, 'A000001', '2025-02-01')).toHaveLength(1);
    expect(affiliationsOn(stage.rows, 'A000001', '2025-01-02')).toHaveLength(0);
    expect(affiliationsOn([{ ...stage.rows[0], start: '2025', precision: 'year' }], 'A000001', '2025-02-01')).toHaveLength(0);
  });
  it('refuses unknown members, invalid dates, and conflicting party intervals', async () => {
    await expect(stageAffiliations(JSON.stringify([row]), 'https://example.org/import', [])).rejects.toThrow('Unknown');
    await expect(stageAffiliations(JSON.stringify([{ ...row, start: '2025-02-30' }]), 'https://example.org/import', ['A000001'])).rejects.toThrow('precision');
    await expect(stageAffiliations(JSON.stringify([row, { ...row, name: 'Republican' }]), 'https://example.org/import', ['A000001'])).rejects.toThrow('Overlapping');
  });
  it('merges sourced chronology into a Dataset candidate and rejects conflicts with existing history', async () => {
    const roster = await ingestCurrentMembers({ apiKey: 'key', fetcher: fetchPages([{ members: [member()], pagination: { count: 1 } }]) });
    const stage = await stageAffiliations(JSON.stringify([row]), 'https://example.org/import', ['A000001']);
    const candidate = await reconcileAffiliations({ ...base, members: roster.members }, stage);
    expect(candidate.dataset.affiliations).toEqual(stage.rows);
    const conflicting = await stageAffiliations(JSON.stringify([{ ...row, name: 'Democratic' }]), 'https://example.org/import', ['A000001']);
    await expect(reconcileAffiliations(candidate.dataset, conflicting)).rejects.toThrow('Overlapping');
  });
});

describe('Reviewed portrait caching', () => {
  const manifest = { memberId: 'A000001', url: 'https://www.congress.gov/img/member/a000001.jpg', attribution: 'Official photo', rights: 'licensed' as const, rightsSource: 'https://example.org/license', reviewedBy: 'editor' };
  const jpeg = new Uint8Array([0xff,0xd8,0xff,0xe0,0xff,0xd9]);
  it('returns content-addressed same-origin paths with rights and byte digests', async () => {
    const result = await cachePortrait(manifest, (async () => new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } })) as typeof fetch);
    expect(result.portrait.url).toMatch(/^\/scorecard\/portraits\/A000001-[a-f0-9]{64}\.jpg$/);
    expect(result.source.url).toBe(manifest.url); expect(result.portrait.rightsSource).toBe(manifest.rightsSource);
  });
  it('refuses unreviewed assets, remote hosts, SVG, and mismatched MIME', async () => {
    await expect(cachePortrait({ ...manifest, rights: 'unreviewed' })).rejects.toThrow('rights');
    await expect(cachePortrait({ ...manifest, url: 'https://localhost/private.jpg' })).rejects.toThrow('official');
    await expect(cachePortrait(manifest, (async () => new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } })) as typeof fetch)).rejects.toThrow('signature');
    await expect(cachePortrait(manifest, (async () => new Response(jpeg, { headers: { 'Content-Type': 'image/png' } })) as typeof fetch)).rejects.toThrow('signature');
  });
});
