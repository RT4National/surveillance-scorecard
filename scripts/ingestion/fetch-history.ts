// Download the official sources for the legacy-history import into a NEW directory.
// Usage: node --env-file=.env.ingestion --import tsx scripts/ingestion/fetch-history.ts INVENTORY NEW_OUTPUT_DIRECTORY
// Roll call XML comes from clerk.house.gov / senate.gov; bill support from the Congress.gov API v3
// (key read from CONGRESS_API_KEY, sent only in a header, never written). Nothing is published.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { capture, readSource } from "../../src/ingestion/members";
import { selectHistory, type CriterionRow } from "../../src/ingestion/history";
import { fetchBillSupport } from "../../src/ingestion/cosponsors";
import { historyOptions } from "./history-config";

const [inventoryPath, destination] = process.argv.slice(2);
if (!inventoryPath || !destination)
  throw new Error(
    "Usage: fetch-history.ts INVENTORY NEW_OUTPUT_DIRECTORY (CONGRESS_API_KEY in the environment)",
  );
const apiKey = process.env.CONGRESS_API_KEY;
if (!apiKey) throw new Error("CONGRESS_API_KEY is required");
const now = new Date().toISOString();
const inventory = JSON.parse(
  await readFile(resolve(inventoryPath), "utf8"),
) as CriterionRow[];
const { rollcalls, cosponsorships } = selectHistory(inventory, historyOptions);

const output = resolve(destination);
await mkdir(output, { recursive: false });
await mkdir(resolve(output, "xml"));
await mkdir(resolve(output, "congress-api"));
const clean = (text: string) => {
  if (text.includes(apiKey)) throw new Error("Refusing to store a response containing the API key");
  return text;
};
const index: {
  createdAt: string;
  rollcalls: { key: string; url: string; filename: string; retrievedAt: string; sha256: string }[];
  bills: { key: string; congress: number; type: string; number: number; files: { url: string; filename: string; retrievedAt: string; sha256: string }[] }[];
} = { createdAt: now, rollcalls: [], bills: [] };

for (const r of rollcalls) {
  const response = await fetch(r.url, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "User-Agent":
        "DecideTheFuture-scorecard-ingestion/1.0 (+https://decidethefuture.org; legacy history import of official roll call XML)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${r.url}`);
  const raw = await readSource(response);
  const name = r.url.split("/").at(-1)!;
  const filename = `xml/${r.chamber.toLowerCase()}-${r.url.split("/").at(-2)}-${name}`;
  await writeFile(resolve(output, filename), raw, { flag: "wx" });
  const source = await capture(raw, r.url, "votes", now);
  index.rollcalls.push({ key: r.key, url: source.url, filename, retrievedAt: now, sha256: source.sha256 });
  console.log(`${r.key}: ${filename}`);
}
for (const c of cosponsorships) {
  const result = await fetchBillSupport(c, { apiKey, retrievedAt: now });
  const files = [];
  for (const [i, raw] of result.raw.entries()) {
    const filename = `congress-api/${c.congress}-${c.type}-${c.number}-${i}.json`;
    await writeFile(resolve(output, filename), clean(raw.text), { flag: "wx" });
    files.push({ url: result.sources[i].url, filename, retrievedAt: now, sha256: result.sources[i].sha256 });
  }
  index.bills.push({ key: c.key, congress: c.congress, type: c.type, number: c.number, files });
  console.log(
    `${c.key}: ${result.bill.label} cosponsors ${result.bill.count} (including withdrawn ${result.bill.countIncludingWithdrawn})`,
  );
}
await writeFile(resolve(output, "index.json"), clean(JSON.stringify(index, null, 2)), { flag: "wx" });
console.log(`Fetched ${index.rollcalls.length} roll calls and ${index.bills.length} bills into ${output}. Nothing published.`);
