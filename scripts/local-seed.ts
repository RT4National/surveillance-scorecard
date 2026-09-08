import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { members, votes, records, dataset } from "../src/data/demo";
import { rubric } from "../src/core/scoring";
import { createPublicationScoring } from "../src/core/publication-scores";
import type { Dataset, Publication } from "../src/core/publication";

// This command has no remote flag and only writes Wrangler's local D1 simulator.
if (process.argv.slice(2).length)
  throw new Error("This local-only seeder accepts no arguments");
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
    coverage: ["Fictional local-only publication for workflow verification."],
  };
  const id = `demo-publication-${index + 1}`;
  const p: Publication = {
    id,
    createdAt: `${asOf}T12:00:00.000Z`,
    publishedBy: "local-fixture",
    previousId: index ? "demo-publication-1" : null,
    summary: `Fictional local publication ${index + 1}`,
    digest: createHash("sha256").update(JSON.stringify(d)).digest("hex"),
    dataset: d,
    scoring: await createPublicationScoring(d),
  };
  statements.push(
    `INSERT OR IGNORE INTO drafts(id,dataset,summary,status,author,reviewer,updated_at,base_publication_id) VALUES(${sql(id)},${sql(JSON.stringify(d))},${sql(p.summary)},'review','local-fixture','local-reviewer',${sql(p.createdAt)},${p.previousId ? sql(p.previousId) : "NULL"});`,
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
    "--local",
    "--file",
    file,
    ...(process.env.SCORECARD_LOCAL_PERSIST
      ? ["--persist-to", process.env.SCORECARD_LOCAL_PERSIST]
      : []),
  ],
  { stdio: "inherit" },
);
console.log(
  "Two immutable demo publications are available in local D1. No remote resources changed.",
);
