import { describe, expect, it } from "vitest";
import { publicationUrl } from "./navigation";
describe("publication navigation", () => {
  it("preserves existing query fields and fragment and replaces an older pin", () => {
    const result = publicationUrl(
      "/scorecard/methodology?topic=Privacy&publication=old#sources",
      "pub/2026",
      "2026-01-01",
    );
    expect(result).toBe(
      "/scorecard/methodology?topic=Privacy&publication=pub%2F2026&asOf=2026-01-01#sources",
    );
  });
  it("preserves encoded research queries and existing cutoff when none supplied", () => {
    const query = JSON.stringify({ kind: "ranking", parties: ["Republican"] });
    const params = new URLSearchParams({ query, asOf: "2025-01-01" });
    const result = new URL(
      publicationUrl(`/scorecard/reports?${params}`, "archived"),
      "https://example.org",
    );
    expect(result.searchParams.get("query")).toBe(query);
    expect(result.searchParams.get("asOf")).toBe("2025-01-01");
    expect(result.searchParams.get("publication")).toBe("archived");
  });
  it("intentionally opens the staff workspace without archive or date pins", () => {
    expect(
      publicationUrl(
        "/scorecard/editor?publication=old&asOf=2020-01-01&draft=7#review",
        "new",
      ),
    ).toBe("/scorecard/editor?draft=7#review");
  });
  it("does not attach publication identifiers to external links or same-page anchors", () => {
    for (const path of [
      "https://example.org",
      "//example.org/scorecard",
      "#main",
      "/scorecard-other",
    ])
      expect(publicationUrl(path, "private-id")).toBe(path);
  });
});
