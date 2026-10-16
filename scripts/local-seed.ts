import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { members, votes, records, dataset } from "../src/data/demo";
import { rubric } from "../src/core/scoring";
import { createPublicationScoring } from "../src/core/publication-scores";
import type { Dataset, Publication } from "../src/core/publication";

// Writes Wrangler's local D1 simulator. `--staging` is the only remote target: the staging
// D1, never production. Seeded publications are fictional (demo: true) and immutable.
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== "--staging"))
  throw new Error("Usage: local-seed.ts [--staging]");
const staging = args[0] === "--staging";
const target = staging ? "staging" : "local";
const sql = (value: string) => `'${value.replaceAll("'", "''")}'`;
const statements: string[] = [];
for (const [index, asOf] of ["2024-12-31", "2026-09-07"].entries()) {
  const d: Dataset = {
    ...dataset,
    id: `demo-publication-data-${index + 1}`,
    asOf,
    members,
    votes: votes.filter((v) => v.date <= asOf),
    records: records.filter((r) =>
      votes.some((v) => v.id === r.voteId && v.date <= asOf),
    ),
    rubric,
    sources: [],
    coverage: [`Fictional ${target} publication for workflow verification.`],
  };
  const id = `demo-publication-${index + 1}`;
  const p: Publication = {
    id,
    createdAt: `${asOf}T12:00:00.000Z`,
    publishedBy: `${target}-fixture`,
    previousId: index ? "demo-publication-1" : null,
    summary: `Fictional ${target} publication ${index + 1}`,
    digest: createHash("sha256").update(JSON.stringify(d)).digest("hex"),
    dataset: d,
    scoring: await createPublicationScoring(d),
  };
  statements.push(
    `INSERT OR IGNORE INTO drafts(id,dataset,summary,status,author,reviewer,updated_at,base_publication_id) VALUES(${sql(id)},${sql(JSON.stringify(d))},${sql(p.summary)},'review',${sql(`${target}-fixture`)},${sql(`${target}-reviewer`)},${sql(p.createdAt)},${p.previousId ? sql(p.previousId) : "NULL"});`,
  );
  statements.push(
    `INSERT OR IGNORE INTO publications(id,draft_id,snapshot,created_at) VALUES(${sql(id)},${sql(id)},${sql(JSON.stringify(p))},${sql(p.createdAt)});`,
  );
}
const dir = await mkdtemp(join(tmpdir(), "scorecard-local-seed-"));
const file = join(dir, "seed.sql");
await writeFile(file, statements.join("\n"));
execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "DB",
    ...(staging ? ["--env", "staging", "--remote"] : ["--local"]),
    "--file",
    file,
    ...(!staging && process.env.SCORECARD_LOCAL_PERSIST
      ? ["--persist-to", process.env.SCORECARD_LOCAL_PERSIST]
      : []),
  ],
  { stdio: "inherit" },
);
console.log(
  staging
    ? "Two immutable demo publications are available in the staging D1. Production was not touched."
    : "Two immutable demo publications are available in local D1. No remote resources changed.",
);
