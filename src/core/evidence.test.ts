import { describe, expect, it } from "vitest";
import { alignmentState, evidenceLabel } from "./evidence";
import type { Outcome } from "./types";

describe("evidence labels", () => {
  it("shows bill support as Cosponsored and roll calls as cast", () => {
    expect(evidenceLabel({ kind: "cosponsorship" }, "Yes")).toBe("Cosponsored");
    expect(evidenceLabel({ kind: "rollcall" }, "Yes")).toBe("Yes");
    expect(evidenceLabel({}, "Not voting")).toBe("Not voting");
  });
});

describe("alignment state", () => {
  const e = (outcome: Outcome, inWindow = true, aligned = false) => ({
    outcome,
    inWindow,
    scored: inWindow && (outcome === "Yes" || outcome === "No"),
    aligned,
  });
  it("names each state from the scorer's flags", () => {
    expect(alignmentState(e("Yes", true, true))).toBe("aligned");
    expect(alignmentState(e("No", true, false))).toBe("not-aligned");
    expect(alignmentState(e("Not voting"))).toBe("did-not-vote");
    expect(alignmentState(e("Not eligible"))).toBe("not-in-office");
    expect(alignmentState(e("Yes", false, true))).toBe("outside-window");
  });
  it("puts not in office and did not vote ahead of the scoring window", () => {
    expect(alignmentState(e("Not eligible", false))).toBe("not-in-office");
    expect(alignmentState(e("Not voting", false))).toBe("did-not-vote");
  });
});
