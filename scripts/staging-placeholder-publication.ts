import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { reconcileRoster } from "../src/ingestion/members";
import {
  reconcileAffiliations,
  stageAffiliations,
} from "../src/ingestion/affiliations";
import {
  parseSenateRollcall,
  reviewRollcall,
  type RollcallStage,
} from "../src/ingestion/rollcalls";
import { rubric } from "../src/core/scoring";
import { createPublicationScoring } from "../src/core/publication-scores";
import type { Dataset, Publication } from "../src/core/publication";
import type { Vote } from "../src/core/types";
import { digest, validateDataset } from "../worker/validation";
import { encodeStoredJson } from "../worker/storage";

// Publishes the staged real data to the STAGING D1 only, as demo: true, with the
// placeholder directions from LAUNCH-RUNBOOK.md step 0: each roll call's direction is
// the one the pinned legacy scorecard scored positively, at weight 1. Senate 115-2-12
// is excluded. Never point this at production; the database ID is fixed below.
const STAGING_DB = "1eeaa6f2-983e-4cc5-8fc7-27449033b022";
const EXCLUDED = new Set(["senate-115-2-12"]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [manifestPath, rosterPath, legislatorsPath] = args.filter(
  (a) => a !== "--dry-run",
);
if (!manifestPath || !rosterPath || !legislatorsPath)
  throw new Error(
    "Usage: staging-placeholder-publication.ts REVIEW_MANIFEST ROSTER_STAGING LEGISLATORS_STAGING [--dry-run]",
  );
const evidenceDir = join(manifestPath, "..");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const roster = JSON.parse(await readFile(rosterPath, "utf8")).run;
const legislators = JSON.parse(await readFile(legislatorsPath, "utf8"));

/** The legacy branch that scored a ballot positively gives the placeholder direction. */
const legacy = (
  await readFile(
    join(
      evidenceDir,
      manifest.captures.find((c: { kind: string }) => c.kind === "legacy")
        .filename,
    ),
    "utf8",
  )
).split("\n");
function legacyDirection(lines: number[]) {
  for (const line of lines) {
    let inc: number | undefined, cond: string | undefined;
    for (let j = line - 1; j > Math.max(line - 13, 0); j--) {
      inc ??= Number(/var inc\s*=\s*([+-]?\d+)/.exec(legacy[j])?.[1] ?? NaN);
      if (Number.isNaN(inc)) inc = undefined;
      cond = /== '(Yes|No)'/.exec(legacy[j])?.[1];
      if (cond) break;
    }
    const info = legacy
      .slice(line - 4, line + 10)
      .map((t) => /info\s*[:=]\s*(['"])(.+?)\1,?\s*;?$/.exec(t.trim())?.[2])
      .find(Boolean);
    if (inc === undefined || !info) continue;
    // A preceding line without its own condition belongs to the Yes branch.
    const positive = (cond ?? "Yes") === "Yes" ? inc > 0 : inc < 0;
    return { reformVote: positive ? "Yes" : "No", info } as const;
  }
  throw new Error(`No legacy scoring found at lines ${lines.join(",")}`);
}
const president = (date: string) =>
  date >= "2021-01-20" && date < "2025-01-20" ? "Democratic" : "Republican";
function editorial(
  stage: RollcallStage,
  lines: number[],
): Pick<
  Vote,
  | "title"
  | "administration"
  | "presidentParty"
  | "reformVote"
  | "weight"
  | "topic"
  | "rationale"
> {
  const { reformVote, info } = legacyDirection(lines);
  const presidentParty = president(stage.date);
  return {
    title: `${stage.question}: ${stage.bill}`,
    administration: `${presidentParty} administration`,
    presidentParty,
    reformVote,
    weight: 1,
    topic: "PLACEHOLDER-surveillance",
    rationale: `PLACEHOLDER- Direction implied by the legacy scorecard: "${info}"`,
  };
}

const crosswalk = legislators.crosswalk as Record<string, string>;
const files = new Map<string, string>(
  manifest.captures.map((c: { url: string; filename: string }) => [
    c.url,
    c.filename,
  ]),
);
const stages: { stage: RollcallStage; lines: number[] }[] = [
  ...manifest.houseStages.map(
    (
      stage: RollcallStage & { legacyReference: { legacyLines: number[] } },
    ) => ({
      stage,
      lines: stage.legacyReference.legacyLines,
    }),
  ),
  ...(await Promise.all(
    manifest.senatePending.map(
      async (s: { url: string; legacyLines: number[] }) => ({
        stage: await parseSenateRollcall(
          await readFile(join(evidenceDir, files.get(s.url)!), "utf8"),
          s.url,
          crosswalk,
        ),
        lines: s.legacyLines,
      }),
    ),
  )),
].filter(({ stage }) => !EXCLUDED.has(stage.id));
if (stages.length !== 22)
  throw new Error(`Expected 22 roll calls, found ${stages.length}`);

const now = new Date().toISOString();
const strip = ({ filename: _f, ...source }: { filename?: string }) => source;
let dataset: Dataset = {
  id: "staging-base",
  asOf: now.slice(0, 10),
  demo: true,
  members: legislators.candidateMembers,
  votes: [],
  records: [],
  rubric: { ...rubric, version: `PLACEHOLDER-${rubric.version}` },
  sources: legislators.sources.map(strip),
  coverage: [
    "Staging dry run: real members and official roll calls; every vote direction is an unreviewed PLACEHOLDER taken from the legacy scorecard.",
    `${legislators.candidateMembers.length} historical members from congress-legislators have placeholder status 'inactive'.`,
    "Senate roll call 115-2-12 (S. 139) is excluded pending editorial review.",
  ],
} as Dataset;
dataset = reconcileRoster(dataset, roster).dataset;
const bySource = new Map<string, unknown[]>();
for (const row of legislators.affiliations as { source: string }[])
  bySource.set(row.source, [...(bySource.get(row.source) ?? []), row]);
for (const [url, rows] of bySource)
  dataset = (
    await reconcileAffiliations(
      dataset,
      await stageAffiliations(
        JSON.stringify(rows),
        url,
        dataset.members.map((m) => m.id),
        now,
      ),
    )
  ).dataset;

const memberIds = new Set(dataset.members.map((m) => m.id));
const withheld: string[] = [];
for (const { stage, lines } of stages) {
  const { vote, records } = reviewRollcall(stage, editorial(stage, lines));
  dataset.votes.push(vote);
  for (const r of records)
    if (memberIds.has(r.memberId)) dataset.records.push(r);
    else withheld.push(`${r.memberId}/${r.voteId}`);
  dataset.sources.push(...stage.sources);
}
if (withheld.length)
  dataset.coverage.push(
    `${withheld.length} ballot(s) withheld for members without a supported party: ${withheld.join(", ")}.`,
  );
dataset.id = `staging-placeholder-${now.slice(0, 10)}`;

const errors = validateDataset(dataset);
console.log(
  JSON.stringify(
    {
      members: dataset.members.length,
      votes: dataset.votes.length,
      records: dataset.records.length,
      withheld,
      directions: Object.fromEntries(
        dataset.votes.map((v) => [v.id, v.reformVote]),
      ),
      errors: errors.slice(0, 10),
    },
    null,
    2,
  ),
);
if (errors.length) throw new Error(`${errors.length} validation errors`);

const d1 = (body: unknown) => {
  const file = join(evidenceDir, "..", `staging-d1-${Date.now()}.json`);
  return writeFile(file, JSON.stringify(body)).then(() =>
    JSON.parse(
      execFileSync(
        "npx",
        ["cf", "d1", "query", STAGING_DB, "--batch", `@${file}`],
        { encoding: "utf8", maxBuffer: 64_000_000 },
      ),
    ),
  );
};
const current = await d1([
  { sql: "SELECT publication_id FROM current_publication", params: [] },
]);
const previousId: string | null =
  JSON.stringify(current).match(/"publication_id":"([^"]+)"/)?.[1] ?? null;
const summary = `PLACEHOLDER staging dry run ${now.slice(0, 10)}: real data, unreviewed directions`;
const publication: Publication = {
  id: crypto.randomUUID(),
  createdAt: now,
  publishedBy: "staging-placeholder-script",
  previousId,
  summary,
  digest: await digest(dataset),
  dataset,
  scoring: await createPublicationScoring(dataset),
};
const storedDataset = await encodeStoredJson(dataset, {
  id: dataset.id,
  asOf: dataset.asOf,
  demo: dataset.demo,
});
const storedPublication = await encodeStoredJson(publication, {
  id: publication.id,
  createdAt: publication.createdAt,
  publishedBy: publication.publishedBy,
  summary,
  digest: publication.digest,
  previousId,
  datasetId: dataset.id,
});
console.log(
  `Publication ${publication.id} replaces ${previousId}; stored ${storedPublication.length} bytes.`,
);
if (dryRun) process.exit(0);
await d1([
  {
    sql: "INSERT INTO drafts(id,dataset,summary,status,author,reviewer,updated_at,base_publication_id) VALUES(?,?,?,'review','staging-placeholder-script','staging-placeholder-script',?,?)",
    params: [publication.id, storedDataset, summary, now, previousId],
  },
  {
    sql: "INSERT INTO publications(id,draft_id,snapshot,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM current_publication WHERE publication_id IS ?)",
    params: [
      publication.id,
      publication.id,
      storedPublication,
      now,
      previousId,
    ],
  },
]);
console.log(`Published ${publication.id} to the staging D1.`);
