#!/usr/bin/env node
// Backfills portrait thumbnails (NAME.w96.jpg) beside the cached originals, with macOS sips.
//   node --import tsx scripts/ingestion/portrait-thumbnails.mjs public/scorecard/portraits
//   ... --check   list originals without a thumbnail and exit 1 if any (any platform)
//   ... --force   remake every thumbnail
import { resolve } from "node:path";
import {
  describeReport,
  makeThumbnails,
} from "../../src/ingestion/thumbnails.ts";

try {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith("--"));
  const unknown = args.filter(
    (a) => a.startsWith("--") && !["--check", "--force"].includes(a),
  );
  if (!dir || unknown.length)
    throw new Error(
      "Usage: node --import tsx scripts/ingestion/portrait-thumbnails.mjs PORTRAITS_DIRECTORY [--check] [--force]",
    );
  const report = await makeThumbnails(resolve(dir), {
    check: args.includes("--check"),
    force: args.includes("--force"),
  });
  console.log(describeReport(report));
  if (report.missing.length) {
    console.error(
      `Missing thumbnails for: ${report.missing.slice(0, 10).join(", ")}${report.missing.length > 10 ? ", …" : ""}`,
    );
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Thumbnail generation failed",
  );
  process.exitCode = 1;
}
