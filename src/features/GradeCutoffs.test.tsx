// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GradeCutoffs, setCutoff } from "./GradeCutoffs";
import { defaultGradeBands, validateRubric } from "../core/scoring";

afterEach(cleanup);
const valid = (gradeBands: { label: string; minimum: number }[]) =>
  validateRubric({
    version: "t",
    minVotes: 1,
    minPerContext: 1,
    consistencyThreshold: 75,
    gradeBands,
  });

describe("Grade cutoffs", () => {
  it("keeps cutoffs in descending order when one is pushed past its neighbour", () => {
    // B (index 2) cannot rise to or above A (90)
    const raised = setCutoff(defaultGradeBands, 2, 95);
    expect(raised[2].minimum).toBe(89);
    expect(() => valid(raised)).not.toThrow();
    // A (index 1) cannot drop to or below B (80)
    const lowered = setCutoff(defaultGradeBands, 1, 10);
    expect(lowered[1].minimum).toBe(81);
    expect(() => valid(lowered)).not.toThrow();
    // A+ cannot exceed 100; the final grade stays at zero
    expect(setCutoff(defaultGradeBands, 0, 140)[0].minimum).toBe(100);
    expect(setCutoff(defaultGradeBands, 5, 30)[5].minimum).toBe(0);
    expect(defaultGradeBands[2].minimum).toBe(80);
  });

  it("offers a labelled slider and step buttons for every grade except the last", () => {
    const onChange = vi.fn();
    render(<GradeCutoffs bands={defaultGradeBands} onChange={onChange} />);
    const b = screen.getByLabelText("Lowest score for a B") as HTMLInputElement;
    expect(b.type).toBe("range");
    expect(b.value).toBe("80");
    expect(screen.queryByLabelText("Lowest score for a F")).toBeNull();
    fireEvent.change(b, { target: { value: "93" } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([{ label: "B", minimum: 89 }]),
    );
    fireEvent.click(screen.getByRole("button", { name: "Raise the B cutoff" }));
    expect(onChange.mock.lastCall?.[0][2]).toEqual({ label: "B", minimum: 81 });
  });

  it("disables a step button when the neighbouring grade blocks it", () => {
    const tight = [
      { label: "A", minimum: 90 },
      { label: "B", minimum: 89 },
      { label: "F", minimum: 0 },
    ];
    render(<GradeCutoffs bands={tight} onChange={() => {}} />);
    expect(
      (
        screen.getByRole("button", {
          name: "Raise the B cutoff",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Lower the A cutoff",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
