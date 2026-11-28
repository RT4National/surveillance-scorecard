import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isThumbnail, thumbnailName } from "../core/thumbnails";
import {
  describeReport,
  makeThumbnails,
  requireMacos,
  sipsArgs,
} from "./thumbnails";

describe("thumbnail naming", () => {
  it("puts a predictable .w96.jpg name beside each original", () => {
    expect(thumbnailName("A000055-e602.jpg")).toBe("A000055-e602.w96.jpg");
    expect(thumbnailName("/scorecard/portraits/B1-ff.png")).toBe(
      "/scorecard/portraits/B1-ff.w96.jpg",
    );
    expect(thumbnailName("C2-aa.webp")).toBe("C2-aa.w96.jpg");
    expect(thumbnailName("D3-bb.JPEG")).toBe("D3-bb.w96.jpg");
    expect(thumbnailName("A000055-e602.w96.jpg")).toBe("A000055-e602.w96.jpg");
    expect(isThumbnail("A000055-e602.w96.jpg")).toBe(true);
    expect(isThumbnail("A000055-e602.jpg")).toBe(false);
    expect(() => thumbnailName("notes.txt")).toThrow(/Not a portrait/);
  });
  it("asks sips for a 96 px wide sRGB JPEG", () => {
    expect(sipsArgs("in.png", "in.w96.jpg")).toEqual([
      "--matchTo",
      "/System/Library/ColorSync/Profiles/sRGB Profile.icc",
      "--resampleWidth",
      "96",
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      "60",
      "in.png",
      "--out",
      "in.w96.jpg",
    ]);
  });
});

describe("thumbnail generation", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  async function cache(names: string[]) {
    dir = await mkdtemp(join(tmpdir(), "thumbs-"));
    for (const n of names) await writeFile(join(dir, n), "x");
  }
  it("fails with a clear message off macOS, before writing anything", async () => {
    expect(() => requireMacos("linux")).toThrow(/macOS sips/);
    expect(() => requireMacos("win32")).toThrow(/No thumbnails were written/);
    expect(() => requireMacos("darwin")).not.toThrow();
    await cache(["A1-aa.jpg"]);
    const calls: string[][] = [];
    await expect(
      makeThumbnails(dir, {
        platform: "linux",
        run: async (_c, a) => void calls.push(a),
      }),
    ).rejects.toThrow(/macOS sips/);
    expect(calls).toEqual([]);
    expect(await readdir(dir)).toEqual(["A1-aa.jpg"]);
  });
  it("makes missing thumbnails with sips and skips existing ones", async () => {
    await cache(["A1-aa.jpg", "B2-bb.png", "B2-bb.w96.jpg", "staging.json"]);
    const calls: string[][] = [];
    const report = await makeThumbnails(dir, {
      platform: "darwin",
      run: async (command, args) => {
        expect(command).toBe("sips");
        calls.push(args);
        await writeFile(args.at(-1)!, "thumb");
      },
    });
    expect(calls.map((a) => a.at(-1))).toEqual([join(dir, "A1-aa.w96.jpg")]);
    expect(report.made).toEqual(["A1-aa.w96.jpg"]);
    expect(report.skipped).toEqual(["B2-bb.w96.jpg"]);
    expect(report.sizes).toEqual([5, 1]);
    expect(describeReport(report)).toMatch(/2 originals; 1 thumbnails made/);
  });
  it("checks for missing thumbnails on any platform", async () => {
    await cache(["A1-aa.jpg", "B2-bb.jpg", "B2-bb.w96.jpg"]);
    const report = await makeThumbnails(dir, {
      platform: "linux",
      check: true,
    });
    expect(report.missing).toEqual(["A1-aa.jpg"]);
    expect(report.made).toEqual([]);
  });
});
