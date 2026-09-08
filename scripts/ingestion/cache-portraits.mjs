#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cachePortrait } from '../../src/ingestion/portraits.ts';

try {
  const [input, destination] = process.argv.slice(2);
  if (!input || !destination) throw new Error('Usage: node --import tsx scripts/ingestion/cache-portraits.mjs manifest.json NEW_OUTPUT_DIRECTORY');
  const manifests = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(manifests) || !manifests.length || manifests.length > 600) throw new Error('Expected 1 to 600 reviewed portrait entries');
  if (new Set(manifests.map(m => m.memberId)).size !== manifests.length) throw new Error('Duplicate portrait member IDs');
  const results = [];
  for (const manifest of manifests) results.push(await cachePortrait(manifest));
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
