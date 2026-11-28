#!/usr/bin/env node
// Stage a reviewed-supplement identity packet from unitedstates/congress-legislators (CC0).
// Usage: node --import tsx scripts/ingestion/stage-legislators.mjs REVIEW_MANIFEST ROSTER_STAGING NEW_OUTPUT_DIRECTORY
// Never publishes. Every disagreement with official ballots is listed for editorial review.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { capture, readSource } from "../../src/ingestion/members.ts";
import {
  LEGISLATORS_MAX_BYTES,
  identitySupplement,
  isLegislatorsUrl,
  legislatorsUrl,
  parseLegislators,
  senateVoteDate,
} from "../../src/ingestion/legislators.ts";

// gh-pages build of main@d5af3d2d2490f8c6532c9490b1f47a76cacca699, September 24, 2026.
const snapshot = "577ca04282d14688cb14f6559eb27b52bdc50dfc";
const now = new Date().toISOString();
const [manifestPath, rosterPath, destination] = process.argv.slice(2);
if (!manifestPath || !rosterPath || !destination)
  throw new Error(
    "Usage: node --import tsx scripts/ingestion/stage-legislators.mjs REVIEW_MANIFEST ROSTER_STAGING NEW_OUTPUT_DIRECTORY",
  );
const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
const roster = JSON.parse(await readFile(resolve(rosterPath), "utf8")).run;
if (roster?.complete !== true)
  throw new Error("A complete roster run is required");

const sources = [],
  raw = {};
for (const file of ["current", "historical"]) {
  const url = legislatorsUrl(snapshot, file);
  if (!isLegislatorsUrl(url)) throw new Error("Unexpected source URL");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${file}`);
  raw[file] = await readSource(response, LEGISLATORS_MAX_BYTES);
  sources.push({
    ...(await capture(raw[file], url, "memberships", now)),
    filename: `source-${file}.json`,
  });
}
const current = parseLegislators(raw.current),
  historical = parseLegislators(raw.historical);
parseLegislators(raw.current, raw.historical); // rejects identities duplicated across files

const senateBallots = manifest.senatePending.flatMap((vote) => {
  const date = senateVoteDate(vote.date);
  return vote.ballots.map((b) => ({ ...b, date, voteUrl: vote.url }));
});
const houseBallots = manifest.houseStages.flatMap((stage) =>
  stage.records.map((r) => ({
    memberId: r.memberId,
    voteId: r.voteId,
    date: stage.date,
    partyAtVote: r.partyAtVote,
  })),
);

const rosterIds = new Set(roster.members.map((m) => m.id));
const identity = identitySupplement({
  current,
  historical,
  currentUrl: legislatorsUrl(snapshot, "current"),
  historicalUrl: legislatorsUrl(snapshot, "historical"),
  rosterIds,
  senateBallots,
  houseBallots,
});
const { crosswalk, affiliations } = identity;
const candidates = { members: identity.candidateMembers };
const discrepancies = identity.discrepancies.map((d) =>
  d.kind === "withheld-terms"
    ? {
        ...d,
        houseBallots: houseBallots.filter((b) => b.memberId === d.memberId)
          .length,
      }
    : d,
);
const count = (list) =>
  list.reduce((acc, d) => ({ ...acc, [d.kind]: (acc[d.kind] ?? 0) + 1 }), {});

const stage = {
  kind: "congress-legislators-identity-supplement",
  createdAt: now,
  snapshot,
  complete: false,
  publishable: false,
  requiresReview: true,
  sources,
  rosterAsOf: roster.asOf,
  summary: {
    senateLisIds: new Set(senateBallots.map((b) => b.lisId)).size,
    crosswalkMappings: Object.keys(crosswalk).length,
    houseBallots: houseBallots.length,
    membersWithTerms: new Set(affiliations.map((a) => a.memberId)).size,
    termRows: affiliations.length,
    candidateMembers: candidates.members.length,
    discrepancies: count(discrepancies),
  },
  crosswalk,
  affiliations,
  candidateMembers: candidates.members,
  candidateStatus:
    "Every candidate member has placeholder status 'inactive'. Retirement, defeat, resignation and death are not inferred and require review.",
  discrepancies,
  warnings: [
    "Supplemental, non-official source. Identity, party and term mappings require editorial review against official records before scoring.",
    `Snapshot ${snapshot} was built September 24, 2026; it predates the ${roster.asOf.slice(0, 10)} roster run.`,
    "A term whose end equals the next term's start is recorded as ending the previous day, because handover occurs at noon and day terms are inclusive.",
    "Party-change history is used only to compare against ballots; no party affiliation rows are emitted.",
  ],
};

const output = resolve(destination);
await mkdir(output, { recursive: false });
for (const file of ["current", "historical"])
  await writeFile(resolve(output, `source-${file}.json`), raw[file], {
    flag: "wx",
  });
await writeFile(
  resolve(output, "staging.json"),
  JSON.stringify(stage, null, 2),
  { flag: "wx" },
);
await writeFile(
  resolve(output, "crosswalk.json"),
  JSON.stringify(crosswalk, null, 2),
  { flag: "wx" },
);
await writeFile(
  resolve(output, "affiliations.json"),
  JSON.stringify(affiliations, null, 2),
  { flag: "wx" },
);
console.log(JSON.stringify(stage.summary, null, 2));
console.log(`Staged in ${output}. Review required; nothing published.`);
