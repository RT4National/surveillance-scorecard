import { describe, expect, it } from "vitest";
import { evidenceLabel } from "./evidence";

describe("evidence labels", () => {
  it("shows bill support as Cosponsored and roll calls as cast", () => {
    expect(evidenceLabel({ kind: "cosponsorship" }, "Yes")).toBe("Cosponsored");
    expect(evidenceLabel({ kind: "rollcall" }, "Yes")).toBe("Yes");
    expect(evidenceLabel({}, "Not voting")).toBe("Not voting");
  });
});
