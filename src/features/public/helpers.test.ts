import { describe, expect, it } from "vitest";
import { gradeTone } from "./helpers";
import { defaultGradeBands } from "../../core/scoring";

describe("gradeTone", () => {
  it("matches the old colours for the default bands", () => {
    const tones = defaultGradeBands.map((b) => gradeTone(b.label, 50, defaultGradeBands));
    expect(tones).toEqual(["good", "good", "good", "mixed", "mixed", "poor"]);
  });
  it("follows custom bands by position, not by percentage", () => {
    const bands = [
      { label: "Gold", minimum: 60 },
      { label: "Silver", minimum: 30 },
      { label: "Bronze", minimum: 0 },
    ];
    expect(gradeTone("Gold", 61, bands)).toBe("good");
    expect(gradeTone("Silver", 40, bands)).toBe("mixed");
    expect(gradeTone("Bronze", 10, bands)).toBe("poor");
  });
  it("is unrated without a value and mixed for unknown labels", () => {
    expect(gradeTone("—", null, defaultGradeBands)).toBe("unrated");
    expect(gradeTone("Q", 70, defaultGradeBands)).toBe("mixed");
  });
});
