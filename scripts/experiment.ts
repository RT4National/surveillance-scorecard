// Score a what-if experiment against a published scorecard and print what would change.
// Usage: npm run experiment -- [experiment.json | -] [--publication URL|PATH] [--json] [--limit N]
// See docs/AGENT-GUIDE.md for the experiment file format.
import { readFileSync } from "node:fs";
import type { Dataset, Publication } from "../src/core/publication";
import {
  parseExperiment,
  runExperiment,
  type ExperimentResult,
} from "../src/core/experiment";
import { groupLabels } from "../src/core/scoring";

const STAGING =
  "https://restore-the-fourth-scorecard-staging.zaki-0c1.workers.dev/scorecard/api/publications/latest";

function usage(code: number): never {
  console.error(
    "Usage: npm run experiment -- [experiment.json | -] [--publication URL|PATH] [--json] [--limit N]",
  );
  process.exit(code);
}
const args = process.argv.slice(2);
let file: string | undefined,
  source = STAGING,
  asJson = false,
  limit = 40;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--json") asJson = true;
  else if (a === "--publication") source = args[++i] ?? usage(1);
  else if (a === "--limit") {
    limit = Number(args[++i]);
    if (!Number.isInteger(limit) || limit < 0) usage(1);
  } else if (a.startsWith("--")) usage(1);
  else if (file === undefined) file = a;
  else usage(1);
}

async function loadPublication(from: string): Promise<Publication> {
  const text = /^https?:\/\//.test(from)
    ? await fetch(from, {
        headers: { "User-Agent": "surveillance-scorecard-experiment" },
      }).then((r) => {
        if (!r.ok) throw new Error(`${from}: HTTP ${r.status}`);
        return r.text();
      })
    : readFileSync(from, "utf8");
  const p = JSON.parse(text) as Publication;
  const d = p?.dataset as Dataset | undefined;
  if (
    !d ||
    !Array.isArray(d.members) ||
    !Array.isArray(d.votes) ||
    !Array.isArray(d.records) ||
    !d.rubric
  )
    throw new Error(
      "Not a scorecard publication (expected a dataset with members, votes, records and rubric)",
    );
  return p;
}

const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(1));
function report(r: ExperimentResult, pub: Publication) {
  const out: string[] = [];
  out.push(`Experiment: ${r.name}`);
  out.push(
    `Publication: ${pub.id} (${pub.createdAt})${r.demo ? " [demo data: vote directions are placeholders]" : ""}`,
  );
  const diff = Object.entries(r.rubricAfter).filter(
    ([k, v]) =>
      k !== "version" &&
      JSON.stringify(v) !==
        JSON.stringify(r.rubricBefore[k as keyof typeof r.rubricBefore]),
  );
  out.push(
    `Rule changes: ${diff.length ? diff.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ") : "none"}`,
  );
  out.push(
    "",
    `${r.changed.length} of ${r.members} members change grade or category.`,
    "",
  );
  out.push("Category                              before  after");
  for (const g of Object.keys(r.before.groups) as (keyof typeof groupLabels)[])
    out.push(
      `  ${groupLabels[g].padEnd(36)}${String(r.before.groups[g]).padStart(6)}${String(r.after.groups[g]).padStart(7)}`,
    );
  out.push("", "Grade   before  after");
  for (const grade of new Set([
    ...Object.keys(r.before.grades),
    ...Object.keys(r.after.grades),
  ]))
    out.push(
      `  ${grade.padEnd(6)}${String(r.before.grades[grade] ?? 0).padStart(6)}${String(r.after.grades[grade] ?? 0).padStart(7)}`,
    );
  if (r.changed.length) {
    out.push(
      "",
      `Largest changes${r.changed.length > limit ? ` (first ${limit}; use --limit or --json for all)` : ""}:`,
    );
    for (const c of r.changed.slice(0, limit))
      out.push(
        `  ${`${c.name} (${c.party[0]}-${c.state}, ${c.chamber})`.padEnd(44)} ${c.before.grade.padStart(2)} -> ${c.after.grade.padEnd(2)}  ${fmt(c.before.value).padStart(5)} -> ${fmt(c.after.value).padEnd(5)}  ${groupLabels[c.before.group]} -> ${groupLabels[c.after.group]}  [${c.id}]`,
      );
  }
  return out.join("\n");
}

try {
  const raw =
    file === undefined ? "{}" : readFileSync(file === "-" ? 0 : file, "utf8");
  const experiment = parseExperiment(JSON.parse(raw));
  const pub = await loadPublication(source);
  const result = runExperiment(pub.dataset, experiment);
  console.log(
    asJson
      ? JSON.stringify({ publicationId: pub.id, ...result }, null, 2)
      : report(result, pub),
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
