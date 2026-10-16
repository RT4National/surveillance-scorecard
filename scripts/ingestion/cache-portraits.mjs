#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cachePortrait } from '../../src/ingestion/portraits.ts';

try {
  const [input, destination] = process.argv.slice(2);
  if (!input || !destination) throw new Error('Usage: node --import tsx scripts/ingestion/cache-portraits.mjs manifest.json NEW_OUTPUT_DIRECTORY');
  const manifests = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(manifests) || !manifests.length || manifests.length > 1200) throw new Error('Expected 1 to 1200 reviewed portrait entries');
  if (new Set(manifests.map(m => m.memberId)).size !== manifests.length) throw new Error('Duplicate portrait member IDs');
  // Hosts such as Wikimedia rate-limit bulk downloads: pace requests and honor Retry-After.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const politeFetch = async (url, init) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, init);
      if (response.status !== 429 || attempt >= 6) return response;
      await response.body?.cancel();
      const wait = Number(response.headers.get('Retry-After'));
      await sleep(Number.isFinite(wait) && wait > 0 ? Math.min(wait, 120) * 1000 : 2000 * 2 ** attempt);
    }
  };
  const results = [];
  for (const [i, manifest] of manifests.entries()) {
    results.push(await cachePortrait(manifest, politeFetch));
    if ((i + 1) % 100 === 0) console.log(`Cached ${i + 1} of ${manifests.length}`);
    await sleep(500);
  }
  const output = resolve(destination);
  await mkdir(output, { recursive: false });
  await mkdir(resolve(output, 'portraits'));
  for (const result of results) await writeFile(resolve(output, 'portraits', result.filename), result.bytes, { flag: 'wx' });
  await writeFile(resolve(output, 'staging.json'), JSON.stringify({ requiresReview: true, images: results.map(({ bytes, ...metadata }) => metadata) }, null, 2), { flag: 'wx' });
  console.log(`Staged ${results.length} reviewed portrait assets. Copy approved portraits to public/scorecard/portraits and apply metadata through editorial review; nothing published.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Portrait staging failed');
  process.exitCode = 1;
}
