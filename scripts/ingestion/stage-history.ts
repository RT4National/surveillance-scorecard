// Stage the legacy-history import from files fetched by fetch-history.ts. Offline; never publishes.
// Usage: node --import tsx scripts/ingestion/stage-history.ts HISTORY_DIR INVENTORY ROSTER_STAGING LEGISLATORS_STAGING
// Writes HISTORY_DIR/staging.json (refuses to overwrite). Every identity disagreement is listed for review.
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseHouseRollcall, parseSenateRollcall, senateBallots, type RollcallStage } from "../../src/ingestion/rollcalls";
import { cosponsorshipItem, parseBill, parseCosponsorPages } from "../../src/ingestion/cosponsors";
import { identitySupplement, legislatorsUrl, parseLegislators, type ChamberEvidence } from "../../src/ingestion/legislators";
import { presidentOn, selectHistory, type CriterionRow } from "../../src/ingestion/history";
import { historyOptions } from "./history-config";

const [historyDir, inventoryPath, rosterPath, legislatorsPath] = process.argv.slice(2).map((p) => resolve(p));
if (!historyDir || !inventoryPath || !rosterPath || !legislatorsPath)
  throw new Error("Usage: stage-history.ts HISTORY_DIR INVENTORY ROSTER_STAGING LEGISLATORS_STAGING");
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const index = await json(join(historyDir, "index.json"));
const inventory = (await json(inventoryPath)) as CriterionRow[];
const roster = (await json(rosterPath)).run;
const legislators = await json(legislatorsPath);
if (roster?.complete !== true) throw new Error("A complete roster run is required");
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
async function verified(dir: string, file: { filename: string; sha256: string }) {
  const text = await readFile(join(dir, file.filename), "utf8");
  if (sha256(text) !== file.sha256) throw new Error(`Captured file changed: ${file.filename}`);
  return text;
}

const selection = selectHistory(inventory, historyOptions);
const byKey = new Map<string, CriterionRow>(inventory.map((r) => [r.key, r]));

// Pinned congress-legislators files staged on 2026-10-14; their hashes must match that packet's captures.
const snapshot: string = legislators.snapshot;
const legislatorsDir = join(legislatorsPath, "..");
const sourceText: Record<string, string> = {};
for (const file of ["current", "historical"] as const) {
  const url = legislatorsUrl(snapshot, file);
  const source = legislators.sources.find((s: { url: string }) => s.url === url);
  if (!source) throw new Error(`No capture for ${url}`);
  sourceText[file] = await verified(legislatorsDir, { filename: `source-${file}.json`, sha256: source.sha256 });
}
const current = parseLegislators(sourceText.current), historical = parseLegislators(sourceText.historical);

// Roll calls: House parses directly; Senate needs the crosswalk extended first.
const houseStages: { key: string; stage: RollcallStage }[] = [];
const senateXml: { key: string; url: string; xml: string; retrievedAt: string }[] = [];
for (const r of index.rollcalls) {
  if (!selection.rollcalls.some((s) => s.key === r.key && s.url === r.url)) throw new Error(`Index and selection disagree on ${r.key}`);
  const xml = await verified(historyDir, r);
  if (r.url.startsWith("https://clerk.house.gov/")) houseStages.push({ key: r.key, stage: await parseHouseRollcall(xml, r.url, r.retrievedAt) });
  else senateXml.push({ key: r.key, url: r.url, xml, retrievedAt: r.retrievedAt });
}
if (index.rollcalls.length !== selection.rollcalls.length) throw new Error("Index is missing selected roll calls");

// Bill support.
const items = [];
for (const b of index.bills) {
  const sel = selection.cosponsorships.find((c) => c.key === b.key && c.congress === b.congress && c.type === b.type && c.number === b.number);
  if (!sel) throw new Error(`Index and selection disagree on ${b.key}`);
  const texts = await Promise.all(b.files.map((f: { filename: string; sha256: string }) => verified(historyDir, f)));
  const bill = parseBill(JSON.parse(texts[0]), sel);
  if (bill.chamber !== sel.chamber) throw new Error(`Origin chamber differs for ${bill.label}`);
  const item = cosponsorshipItem(bill, parseCosponsorPages(texts.slice(1).map((t) => JSON.parse(t))), { signedBefore: sel.signedBefore });
  items.push({
    key: sel.key,
    ...(sel.signedBefore ? { signedBefore: sel.signedBefore } : {}),
    ...item,
    sources: b.files.map((f: { url: string; retrievedAt: string; sha256: string }) => ({ url: f.url, retrievedAt: f.retrievedAt, sha256: f.sha256, kind: "votes" })),
  });
}
if (items.length !== selection.cosponsorships.length) throw new Error("Index is missing selected bills");

const ballots = senateXml.flatMap((s) => senateBallots(s.xml));
const houseBallots = houseStages.flatMap(({ stage }) => stage.records.map((r) => ({ memberId: r.memberId, voteId: r.voteId, date: stage.date, partyAtVote: r.partyAtVote })));
const supporters: ChamberEvidence[] = items.flatMap((item) =>
  item.supporters.map((s) => ({ memberId: s.memberId, chamber: item.vote.chamber, date: s.date, voteId: item.vote.id, partyAtVote: item.records.find((r) => r.memberId === s.memberId)!.partyAtVote })),
);
const rosterIds = new Set<string>(roster.members.map((m: { id: string }) => m.id));
const identity = identitySupplement({
  current, historical,
  currentUrl: legislatorsUrl(snapshot, "current"), historicalUrl: legislatorsUrl(snapshot, "historical"),
  rosterIds, senateBallots: ballots, houseBallots, supporters,
  existing: { crosswalk: legislators.crosswalk, affiliations: legislators.affiliations, candidateMembers: legislators.candidateMembers },
});
const crosswalk = { ...legislators.crosswalk, ...identity.crosswalk };
const unmappedLis = [...new Set(ballots.filter((b) => !crosswalk[b.lisId]).map((b) => b.lisId))];
const senateStages: { key: string; stage: RollcallStage }[] = [];
const unmappedBallots: string[] = [];
for (const s of senateXml) {
  // A ballot without a reviewed identity is withheld; the rest of the roll call still parses.
  const partial = Object.fromEntries(unmappedLis.map((lis, i) => [lis, `X${String(900000 + i)}`]));
  const stage = await parseSenateRollcall(s.xml, s.url, { ...crosswalk, ...partial }, s.retrievedAt);
  const placeholders = new Set(Object.values(partial));
  unmappedBallots.push(...stage.records.filter((r) => placeholders.has(r.memberId)).map((r) => `${r.voteId}`));
  senateStages.push({ key: s.key, stage: { ...stage, records: stage.records.filter((r) => !placeholders.has(r.memberId)) } });
}

// Which records the dataset can hold: roster members and supported-party candidates.
const datasetIds = new Set<string>([...rosterIds, ...legislators.candidateMembers.map((m: { id: string }) => m.id), ...identity.candidateMembers.map((m) => m.id)]);
const absentRecords = (records: { memberId: string; voteId: string }[]) => records.filter((r) => !datasetIds.has(r.memberId)).map((r) => `${r.memberId}/${r.voteId}`);
const stages = [...houseStages, ...senateStages];
const rollcallWithheld = stages.flatMap(({ stage }) => absentRecords(stage.records));
const cosponsorAbsent = items.flatMap((i) => absentRecords(i.records));
const crossAdministration = items.flatMap((i) =>
  i.supporters.filter((s) => presidentOn(s.date).party !== presidentOn(i.vote.date).party).map((s) => `${s.memberId}/${i.vote.id} signed ${s.date}, introduced ${i.vote.date}`),
);
const count = (list: { kind: string }[]) => list.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.kind]: (acc[d.kind] ?? 0) + 1 }), {});

const createdAt = new Date().toISOString();
const staging = {
  kind: "legacy-history-import",
  createdAt,
  complete: false,
  publishable: false,
  requiresReview: true,
  snapshot,
  rollcalls: stages.map(({ key, stage }) => ({ key, criterion: byKey.get(key)!, stage })),
  cosponsorships: items.map((i) => ({ ...i, criterion: byKey.get(i.key)! })),
  identity: { ...identity, mergedCrosswalkSize: Object.keys(crosswalk).length },
  excluded: selection.excluded,
  summary: {
    rollcalls: { House: houseStages.length, Senate: senateStages.length, byYear: stages.reduce<Record<string, number>>((acc, { stage }) => ({ ...acc, [`${stage.chamber} ${stage.date.slice(0, 4)}`]: (acc[`${stage.chamber} ${stage.date.slice(0, 4)}`] ?? 0) + 1 }), {}) },
    ballots: stages.reduce((n, { stage }) => n + stage.records.length, 0),
    senateLisIds: new Set(ballots.map((b) => b.lisId)).size,
    newCrosswalkMappings: Object.keys(identity.crosswalk).length,
    unmappedLisIds: unmappedLis,
    unmappedBallots: unmappedBallots.length,
    rollcallBallotsWithoutDatasetMember: rollcallWithheld.length,
    cosponsorshipItems: items.length,
    cosponsorRecords: items.reduce((n, i) => n + i.records.length, 0),
    withdrawnExcluded: items.reduce((n, i) => n + i.withdrawn.length, 0),
    lateExcluded: items.reduce((n, i) => n + i.late.length, 0),
    unsupportedPartyWithheld: items.reduce((n, i) => n + i.withheld.length, 0),
    cosponsorRecordsWithoutDatasetMember: cosponsorAbsent.length,
    crossAdministrationSignOns: crossAdministration,
    newCandidateMembers: identity.candidateMembers.length,
    newTermRows: identity.affiliations.length,
    discrepancies: count(identity.discrepancies),
    excludedCriteria: selection.excluded.length,
  },
  withheld: { unmappedBallots, rollcallWithheld, cosponsorAbsent, unsupportedParty: items.flatMap((i) => i.withheld.map((w) => `${w.memberId}/${i.vote.id} (${w.party})`)) },
  warnings: [
    "Placeholder data only: directions come from legacy point values and wording, not editorial review.",
    "A bill-support item is dated at introduction; scoring context (administration, recency) uses that date, not each sign-on date.",
    "Non-cosponsors have no record for a bill-support item; withdrawn cosponsors and sign-ons after a legacy cutoff are excluded.",
    "Candidate members have placeholder status 'inactive'; congress-legislators identities are supplemental and need review.",
  ],
};
await writeFile(join(historyDir, "staging.json"), JSON.stringify(staging, null, 2), { flag: "wx" });
console.log(JSON.stringify(staging.summary, null, 2));
console.log(`Staged in ${join(historyDir, "staging.json")}. Review required; nothing published.`);
