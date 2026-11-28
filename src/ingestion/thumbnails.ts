// Generates portrait thumbnails with macOS `sips` (built in; no image dependency).
// Used by scripts/ingestion/cache-portraits.mjs and scripts/ingestion/portrait-thumbnails.mjs.
import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  THUMBNAIL_QUALITY,
  THUMBNAIL_WIDTH,
  isThumbnail,
  thumbnailName,
} from "../core/thumbnails";

/** Throws a clear error anywhere but macOS, before any work is done. */
export function requireMacos(platform: string = process.platform): void {
  if (platform !== "darwin")
    throw new Error(
      `Portrait thumbnails are made with macOS sips, which is built into macOS only. This machine is "${platform}": run the thumbnail step on a Mac. No thumbnails were written.`,
    );
}

/** macOS's built-in sRGB profile. */
export const SRGB_PROFILE =
  "/System/Library/ColorSync/Profiles/sRGB Profile.icc";
/**
 * sips arguments: convert to sRGB (some originals are CMYK with a 550 KB print profile, which
 * would otherwise be copied into the thumbnail), resample to THUMBNAIL_WIDTH wide (height
 * follows), JPEG at THUMBNAIL_QUALITY.
 */
export const sipsArgs = (input: string, output: string) => [
  "--matchTo",
  SRGB_PROFILE,
  "--resampleWidth",
  String(THUMBNAIL_WIDTH),
  "-s",
  "format",
  "jpeg",
  "-s",
  "formatOptions",
  String(THUMBNAIL_QUALITY),
  input,
  "--out",
  output,
];

const portraitFile = /\.(jpe?g|png|webp)$/i;
type Runner = (command: string, args: string[]) => Promise<void>;
const sips: Runner = (command, args) =>
  new Promise((resolve, reject) =>
    execFile(command, args, (error) => (error ? reject(error) : resolve())),
  );

export interface ThumbnailReport {
  originals: number;
  made: string[];
  skipped: string[];
  /** Originals without a thumbnail (check mode only). */
  missing: string[];
  /** Thumbnail byte sizes, for every original's thumbnail present afterwards. */
  sizes: number[];
}

/**
 * Makes a thumbnail beside every original portrait in `dir` that lacks one (or every one with
 * `force`). `check` only reports missing thumbnails and works on any platform.
 */
export async function makeThumbnails(
  dir: string,
  {
    platform = process.platform,
    run = sips,
    force = false,
    check = false,
  }: {
    platform?: string;
    run?: Runner;
    force?: boolean;
    check?: boolean;
  } = {},
): Promise<ThumbnailReport> {
  if (!check) requireMacos(platform);
  const names = new Set(await readdir(dir));
  const originals = [...names]
    .filter((n) => portraitFile.test(n) && !isThumbnail(n))
    .sort();
  const report: ThumbnailReport = {
    originals: originals.length,
    made: [],
    skipped: [],
    missing: [],
    sizes: [],
  };
  for (const name of originals) {
    const thumb = thumbnailName(name);
    if (check) {
      if (!names.has(thumb)) report.missing.push(name);
    } else if (names.has(thumb) && !force) report.skipped.push(thumb);
    else {
      await run("sips", sipsArgs(join(dir, name), join(dir, thumb)));
      report.made.push(thumb);
      names.add(thumb);
    }
    if (names.has(thumb))
      report.sizes.push((await stat(join(dir, thumb))).size);
  }
  return report;
}

/** One line for the console: counts and thumbnail sizes. */
export function describeReport(r: ThumbnailReport): string {
  const total = r.sizes.reduce((a, b) => a + b, 0);
  const sorted = [...r.sizes].sort((a, b) => a - b);
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  return [
    `${r.originals} originals`,
    `${r.made.length} thumbnails made`,
    `${r.skipped.length} already present`,
    ...(r.missing.length ? [`${r.missing.length} missing`] : []),
    ...(sorted.length
      ? [
          `thumbnails ${kb(total)} total, ${kb(total / sorted.length)} average, ${kb(sorted[0])} to ${kb(sorted.at(-1)!)}`,
        ]
      : []),
  ].join("; ");
}
