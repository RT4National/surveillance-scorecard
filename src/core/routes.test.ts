import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { appPaths, matchRoute, redirectFor } from "./routes";

describe("shared route list", () => {
  it("matches every static page, with or without a trailing slash", () => {
    expect(matchRoute("/scorecard")).toEqual({ name: "home" });
    expect(matchRoute("/scorecard/")).toEqual({ name: "home" });
    expect(matchRoute("/scorecard/former")).toEqual({ name: "former" });
    expect(matchRoute("/scorecard/former/")).toEqual({ name: "former" });
    expect(matchRoute("/scorecard/archive")).toEqual({ name: "archive" });
    expect(matchRoute("/scorecard/archives")).toEqual({ name: "archive" });
    expect(matchRoute("/scorecard/reports")).toEqual({ name: "research" });
    expect(matchRoute("/scorecard/research")).toEqual({ name: "research" });
    for (const name of ["compare", "find", "methodology", "editor"])
      expect(matchRoute(`/scorecard/${name}`)).toEqual({ name });
    expect(matchRoute("/scorecard/legislation")).toEqual({
      name: "legislation",
    });
  });
  it("matches detail pages and decodes their IDs", () => {
    expect(matchRoute("/scorecard/members/A000001")).toEqual({
      name: "member",
      id: "A000001",
    });
    expect(matchRoute("/scorecard/members/a%20b/")).toEqual({
      name: "member",
      id: "a b",
    });
    expect(matchRoute("/scorecard/legislation/v1")).toEqual({
      name: "legislation",
      voteId: "v1",
    });
  });
  it("treats everything else as not found", () => {
    for (const path of [
      "/",
      "/scorecard/nope",
      "/scorecard/history",
      "/scorecard/members",
      "/scorecard/members/a/b",
      "/scorecard/members/%E0%A4%A",
      "/scorecard/legislation/a/b",
      "/scorecard/assets/app.js",
      "/scorecardx",
    ])
      expect(matchRoute(path), path).toEqual({ name: "notFound" });
  });
  it("redirects /scorecard/history to the publications archive", () => {
    expect(redirectFor("/scorecard/history")).toBe("/scorecard/archive");
    expect(redirectFor("/scorecard/history/")).toBe("/scorecard/archive");
    expect(redirectFor("/scorecard/archive")).toBeNull();
    expect(redirectFor("/scorecard/nope")).toBeNull();
  });
  it("lists every static page path, and each one matches", () => {
    const paths = appPaths();
    expect(paths).toContain("/scorecard/former");
    expect(paths).toContain("/scorecard/archive");
    for (const path of paths)
      expect(matchRoute(path).name, path).not.toBe("notFound");
  });
  it("keeps public/_redirects scorecard rewrites inside the shared list", async () => {
    const rules = (
      await readFile(
        new URL("../../public/_redirects", import.meta.url),
        "utf8",
      )
    )
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter(([from]) => from?.startsWith("/scorecard"));
    expect(rules.length).toBeGreaterThan(0);
    for (const [from] of rules) {
      const sample = from.replace(":member", "A000001");
      expect(matchRoute(sample).name, from).not.toBe("notFound");
    }
    expect(rules.some(([from]) => from === "/scorecard/former")).toBe(true);
  });
});
