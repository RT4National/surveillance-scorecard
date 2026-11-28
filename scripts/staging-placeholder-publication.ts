import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { capture, reconcileRoster } from "../src/ingestion/members";
import {
  applyMemberships,
  type CaucusList,
} from "../src/ingestion/memberships";
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
import {
  criterionDirection,
  presidentOn,
  type CriterionRow,
} from "../src/ingestion/history";
import { digest, validateDataset } from "../worker/validation";
import { encodeStoredJson } from "../worker/storage";

// Publishes the staged real data to the STAGING D1 only, as demo: true, with the
// placeholder directions from LAUNCH-RUNBOOK.md step 0: each roll call's direction is
// the one the pinned legacy scorecard scored positively, at weight 1. Senate 115-2-12
// is excluded. With --history, the legacy-history staging (stage-history.ts) adds older
// roll calls and bill-support items, directions again from the legacy points. Never point
// this at production; the database ID is fixed below.
const STAGING_DB = "1eeaa6f2-983e-4cc5-8fc7-27449033b022";
const EXCLUDED = new Set(["senate-115-2-12"]);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const option = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const membershipsDir = option("--memberships");
const portraitsPath = option("--portraits");
const historyPath = option("--history");
const [manifestPath, rosterPath, legislatorsPath] = args.filter(
  (a) => a !== "--dry-run",
);
if (!manifestPath || !rosterPath || !legislatorsPath)
  throw new Error(
    "Usage: staging-placeholder-publication.ts REVIEW_MANIFEST ROSTER_STAGING LEGISLATORS_STAGING [--history HISTORY_STAGING] [--memberships DIR] [--portraits CACHE_STAGING] [--dry-run]",
  );
const evidenceDir = join(manifestPath, "..");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const roster = JSON.parse(await readFile(rosterPath, "utf8")).run;
const legislators = JSON.parse(await readFile(legislatorsPath, "utf8"));
const history = historyPath
  ? JSON.parse(await readFile(historyPath, "utf8"))
  : undefined;
if (history && history.kind !== "legacy-history-import")
  throw new Error("--history expects a legacy-history staging file");

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
  const { party: presidentParty, administration } = presidentOn(stage.date);
  return {
    title: `${stage.question}: ${stage.bill}`,
    administration,
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
const expectedBase =
  manifest.houseStages.length +
  manifest.senatePending.length -
  [
    ...manifest.houseStages.map((s: { id: string }) => s.id),
    ...manifest.senatePending.map(
      (s: { congress: number; session: number; roll: number }) =>
        `senate-${s.congress}-${s.session}-${s.roll}`,
    ),
  ].filter((id) => EXCLUDED.has(id)).length;
if (stages.length !== expectedBase)
  throw new Error(
    `Expected ${expectedBase} roll calls from the manifest, found ${stages.length}`,
  );

/** Older roll calls and bill support: direction from the inventory's legacy points, per chamber. */
type HistoryRollcall = {
  key: string;
  criterion: CriterionRow;
  stage: RollcallStage;
};
type HistoryBill = {
  key: string;
  criterion: CriterionRow;
  signedBefore?: string;
  vote: Pick<Vote, "id" | "kind" | "chamber" | "date" | "bill" | "source"> & {
    officialTitle: string;
  };
  records: Dataset["records"];
  sources: Dataset["sources"];
};
const historyRollcalls: HistoryRollcall[] = history?.rollcalls ?? [];
const historyBills: HistoryBill[] = history?.cosponsorships ?? [];
if (
  history &&
  (historyRollcalls.length !==
    history.summary.rollcalls.House + history.summary.rollcalls.Senate ||
    historyBills.length !== history.summary.cosponsorshipItems)
)
  throw new Error("History staging does not match its own summary");
function placeholder(
  criterion: CriterionRow,
  chamber: Vote["chamber"],
  date: string,
) {
  const { reformVote, points, info } = criterionDirection(criterion, chamber);
  const { party: presidentParty, administration } = presidentOn(date);
  return { reformVote, points, info, presidentParty, administration };
}

const now = new Date().toISOString();
const strip = ({ filename: _f, ...source }: { filename?: string }) => source;
let dataset: Dataset = {
  id: "staging-base",
  asOf: now.slice(0, 10),
  demo: true,
  members: [
    ...legislators.candidateMembers,
    ...(history?.identity.candidateMembers ?? []),
  ],
  votes: [],
  records: [],
  rubric: { ...rubric, version: `PLACEHOLDER-${rubric.version}` },
  sources: legislators.sources.map(strip),
  coverage: [
    "Staging dry run: real members and official roll calls; every vote direction is an unreviewed PLACEHOLDER taken from the legacy scorecard.",
    `${legislators.candidateMembers.length} historical members from congress-legislators have placeholder status 'inactive'.`,
    "Senate roll call 115-2-12 (S. 139) is excluded pending editorial review.",
    ...(history
      ? [
          `${history.identity.candidateMembers.length} further historical members from congress-legislators, referenced by older roll calls or bill support, also have placeholder status 'inactive'.`,
          "Bill support (PLACEHOLDER): each sponsor and current cosponsor of a scored bill has a Yes record; non-cosponsors have no record and withdrawn cosponsors do not count. Each bill is dated at introduction, so administration context and recency use that date rather than each sign-on date.",
          `Legacy criteria not imported pending decisions: ${history.excluded.map((e: { key: string }) => e.key).join(", ")}.`,
        ]
      : []),
  ],
} as Dataset;
dataset = reconcileRoster(dataset, roster).dataset;
const bySource = new Map<string, unknown[]>();
for (const row of [
  ...legislators.affiliations,
  ...(history?.identity.affiliations ?? []),
] as { source: string }[])
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
for (const { key, criterion, stage } of historyRollcalls) {
  const p = placeholder(criterion, stage.chamber, stage.date);
  const { vote, records } = reviewRollcall(stage, {
    title: `${stage.question}: ${stage.bill}`,
    administration: p.administration,
    presidentParty: p.presidentParty,
    reformVote: p.reformVote,
    weight: 1,
    topic: "PLACEHOLDER-surveillance",
    rationale: `PLACEHOLDER- Direction implied by the legacy scorecard (${key}, ${p.points} points): "${p.info.trim()}"`,
  });
  dataset.votes.push(vote);
  for (const r of records)
    if (memberIds.has(r.memberId)) dataset.records.push(r);
    else withheld.push(`${r.memberId}/${r.voteId}`);
  dataset.sources.push(...stage.sources);
}
for (const item of historyBills) {
  const p = placeholder(item.criterion, item.vote.chamber, item.vote.date);
  const { officialTitle, ...vote } = item.vote;
  dataset.votes.push({
    ...vote,
    kind: "cosponsorship",
    title: `Bill support: ${vote.bill}, ${officialTitle}`,
    administration: p.administration,
    presidentParty: p.presidentParty,
    reformVote: p.reformVote,
    weight: 1,
    topic: "PLACEHOLDER-surveillance",
    rationale: `PLACEHOLDER- Sponsors and cosponsors${item.signedBefore ? ` who signed on before ${item.signedBefore}` : ""} are recorded as supporting this bill; the legacy scorecard gave ${p.points} points for "${p.info.trim()}" (${item.key}), so support counts as ${p.reformVote === "Yes" ? "aligned" : "not aligned"}. Non-cosponsors have no record.`,
  });
  for (const r of item.records)
    if (memberIds.has(r.memberId)) dataset.records.push(r);
    else withheld.push(`${r.memberId}/${r.voteId}`);
  dataset.sources.push(...item.sources);
}
if (withheld.length)
  dataset.coverage.push(
    `${withheld.length} ballot or bill-support record(s) withheld for members without a supported party: ${withheld.join(", ")}.`,
  );
if (membershipsDir) {
  const committees = JSON.parse(
    await readFile(join(membershipsDir, "committees.json"), "utf8"),
  );
  const caucuses = JSON.parse(
    await readFile(join(membershipsDir, "caucuses.json"), "utf8"),
  ).caucuses.filter(
    (c: { sourceUrl?: string; members: unknown[] }) =>
      c.sourceUrl && c.members.length,
  ) as (CaucusList & {
    sourceUrl: string;
    sourceKind: string;
    asOf: string;
  })[];
  const applied = applyMemberships(dataset.members, committees.rows, caucuses);
  dataset.members = applied.members;
  // Committee rows come from the pinned congress-legislators snapshot.
  const committeeUrl = `https://raw.githubusercontent.com/unitedstates/congress-legislators/${legislators.snapshot}/committee-membership-current.json`;
  dataset.sources.push(
    await capture(
      await readFile(
        join(membershipsDir, "raw-congress-legislators", "cm.json"),
        "utf8",
      ),
      committeeUrl,
      "memberships",
      now,
    ),
  );
  const raw = join(membershipsDir, "raw-caucus");
  const rawFiles = await readdir(raw);
  for (const caucus of caucuses) {
    const oldid = /oldid=(\d+)/.exec(caucus.sourceUrl)?.[1];
    const file = rawFiles.find((f) =>
      oldid
        ? f.includes(`.${oldid}.`)
        : (caucus.sourceUrl.includes("newdemocrat") && f.includes("ndc")) ||
          (caucus.sourceUrl.includes("mainstreet") && f.includes("rmsp")) ||
          (caucus.sourceUrl.includes("lofgren") && f.includes("fourth")),
    );
    if (file)
      dataset.sources.push(
        await capture(
          await readFile(join(raw, file), "utf8"),
          caucus.sourceUrl,
          "memberships",
          now,
        ),
      );
  }
  dataset.coverage.push(
    "Committees are top-level assignments from the congress-legislators snapshot; they are current memberships, not dated history.",
    `Caucus rosters (each from its cited source, many incomplete or stale): ${caucuses.map((c) => `${c.name} (${c.sourceKind}, ${c.asOf})`).join("; ")}.`,
  );
  console.log(
    `Memberships applied; skipped ${JSON.stringify(applied.skipped)}`,
  );
}
if (portraitsPath) {
  const { images } = JSON.parse(await readFile(portraitsPath, "utf8")) as {
    images: {
      memberId: string;
      portrait: NonNullable<Dataset["members"][number]["portrait"]>;
      source: Dataset["sources"][number];
    }[];
  };
  const byId = new Map(images.map((i) => [i.memberId, i]));
  dataset.members = dataset.members.map((m) =>
    byId.has(m.id) ? { ...m, portrait: byId.get(m.id)!.portrait } : m,
  );
  dataset.sources.push(
    ...images.filter((i) => memberIds.has(i.memberId)).map((i) => i.source),
  );
  dataset.coverage.push(
    "Portraits are Wikimedia Commons images, shown as cleared at the user's direction; each keeps its Commons license and attribution.",
  );
}
dataset.id = `staging-placeholder-${now.slice(0, 10)}`;

const errors = validateDataset(dataset);
const scoring = await createPublicationScoring(dataset);
const counted = Object.values(scoring.scores).map((s) => s.counted);
console.log(
  JSON.stringify(
    {
      members: dataset.members.length,
      votes: dataset.votes.length,
      rollcalls: dataset.votes.filter((v) => v.kind !== "cosponsorship").length,
      billSupportItems: dataset.votes.filter((v) => v.kind === "cosponsorship")
        .length,
      records: dataset.records.length,
      maxScoredItemsPerMember: Math.max(...counted),
      membersWithScoredItems: counted.filter((n) => n > 0).length,
      groups: Object.values(scoring.scores).reduce<Record<string, number>>(
        (acc, s) => ({ ...acc, [s.group]: (acc[s.group] ?? 0) + 1 }),
        {},
      ),
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
if (dryRun) {
  console.log("Dry run: validated; the staging D1 was not contacted.");
  process.exit(0);
}

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
  scoring,
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
