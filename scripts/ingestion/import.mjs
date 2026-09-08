#!/usr/bin/env node
// Run with: node --import tsx scripts/ingestion/import.mjs <command> --out <new-directory>
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ingestCurrentMembers, reconcileRoster, readSource } from '../../src/ingestion/members.ts';
import { parseHouseRollcall, parseSenateRollcall } from '../../src/ingestion/rollcalls.ts';
import { stageLegacySheet } from '../../src/ingestion/legacy.ts';
import { stageAffiliations, reconcileAffiliations } from '../../src/ingestion/affiliations.ts';

const [command, ...args] = process.argv.slice(2);
const flag = name => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const requireFlag = name => {
  const value = flag(name);
  if (!value || value.startsWith('--')) throw new Error(`--${name} is required`);
  return value;
};
const captures = [];
const captureFetch = async (url, init) => {
  const response = await fetch(url, init);
  if (!response.ok) return response;
  const body = await readSource(response);
  captures.push({ url: String(url), body });
  return new Response(body, { status: response.status, headers: response.headers });
};

try {
  const output = resolve(requireFlag('out'));
  let result;
  if (command === 'members') {
    const run = await ingestCurrentMembers({ apiKey: process.env.CONGRESS_API_KEY ?? '', fetcher: captureFetch });
    result = { run };
    if (flag('previous')) result.reconciliation = reconcileRoster(JSON.parse(await readFile(flag('previous'), 'utf8')), run);
  } else if (command === 'house' || command === 'senate') {
    const url = new URL(requireFlag('url'));
    // Validate before fetch to prevent arbitrary local/cloud metadata requests.
    const allowed = command === 'house'
      ? url.origin === 'https://clerk.house.gov' && /^\/evs\/\d{4}\/roll\d+\.xml$/.test(url.pathname)
      : url.origin === 'https://www.senate.gov' && /^\/legislative\/LIS\/roll_call_votes\/vote\d+\/vote_\d+_\d+_\d+\.xml$/.test(url.pathname);
    if (!allowed || url.username || url.password || url.search) throw new Error('Official roll call URL required');
    const response = await captureFetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}`);
    const xml = await response.text();
    result = command === 'house' ? await parseHouseRollcall(xml, url.toString())
      : await parseSenateRollcall(xml, url.toString(), JSON.parse(await readFile(requireFlag('crosswalk'), 'utf8')));
  } else if (command === 'affiliations') {
    const raw = await readFile(requireFlag('input'), 'utf8');
    const dataset = JSON.parse(await readFile(requireFlag('dataset'), 'utf8'));
    const url = requireFlag('source');
    const stage = await stageAffiliations(raw, url, dataset.members.map(member => member.id));
    result = { stage, reconciliation: await reconcileAffiliations(dataset, stage) };
    captures.push({ url, body: raw });
  } else if (command === 'legacy') {
    const raw = await readFile(requireFlag('input'), 'utf8');
    const url = requireFlag('source');
    result = await stageLegacySheet(raw, url, { reviewedPaths: flag('redirects') ? JSON.parse(await readFile(flag('redirects'), 'utf8')) : undefined });
    captures.push({ url, body: raw });
  } else throw new Error('Command must be members, house, senate, affiliations, or legacy');
  // Fresh directory only: never replace a prior capture or published artifact.
  await mkdir(output, { recursive: false });
  await writeFile(resolve(output, 'staging.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  for (let i = 0; i < captures.length; i++) await writeFile(resolve(output, `source-${String(i + 1).padStart(3, '0')}.txt`), captures[i].body, { flag: 'wx' });
  console.log(`Staged ${captures.length} source captures in ${output}. Review required; nothing published.`);
} catch (error) {
  // Do not print fetch error cause/URLs or source payloads that may carry credentials.
  const message = error instanceof Error ? error.message : 'Import failed';
  console.error(process.env.CONGRESS_API_KEY ? message.replaceAll(process.env.CONGRESS_API_KEY, '[redacted]') : message);
  process.exitCode = 1;
}
