import { describe, expect, it } from "vitest";
import {
  newerPublication,
  publicationLabel,
  type PublicationSummary,
} from "./publication";

const row = (id: string, previousId: string | null): PublicationSummary => ({
  id,
  createdAt: "2026-09-07",
  summary: "",
  previousId,
});
// Newest first, as the API returns them.
const list = [row("c", "b"), row("b", "a"), row("a", null)];

describe("publicationLabel", () => {
  it("numbers publications from the oldest, by position in the chain", () => {
    expect(publicationLabel(list, "a")).toBe("Publication 1");
    expect(publicationLabel(list, "b")).toBe("Publication 2");
    expect(publicationLabel(list, "c")).toBe("Publication 3");
  });
  it("is stable for a given list however it is ordered", () => {
    expect(publicationLabel([...list].reverse(), "b")).toBe("Publication 2");
  });
  it("does not change an older label when a newer publication is added", () => {
    expect(publicationLabel([row("d", "c"), ...list], "b")).toBe("Publication 2");
  });
  it("gives no label when the list is missing or the chain is cut off", () => {
    expect(publicationLabel(null, "a")).toBeNull();
    expect(publicationLabel(undefined, "a")).toBeNull();
    expect(publicationLabel(list, "zzz")).toBeNull();
    expect(publicationLabel([row("c", "b"), row("b", "a")], "c")).toBeNull();
  });
  it("does not loop on a cyclic chain", () => {
    expect(publicationLabel([row("a", "b"), row("b", "a")], "a")).toBeNull();
  });
});

describe("newerPublication", () => {
  it("returns the latest when the id is older", () => {
    expect(newerPublication(list, "a")?.id).toBe("c");
  });
  it("returns null for the latest, an unknown id, or no list", () => {
    expect(newerPublication(list, "c")).toBeNull();
    expect(newerPublication(list, "zzz")).toBeNull();
    expect(newerPublication(null, "a")).toBeNull();
  });
});
