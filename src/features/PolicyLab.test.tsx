// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { PolicyLab } from "./PolicyLab";
import { dataset, members, votes, records } from "../data/demo";
import { rubric } from "../core/scoring";

const fixture = {
  ...dataset,
  members,
  votes,
  records,
  rubric,
  sources: [],
  coverage: ["Fictional fixture"],
};
afterEach(cleanup);

describe("Rubric lab", () => {
  it("uses sliders and buttons instead of JSON for grading rules", () => {
    render(<PolicyLab dataset={fixture} />);
    const lab = screen.getByRole("region", {
      name: /try your own grading rules/i,
    });
    expect(lab.querySelector("textarea")).toBeNull();
    expect(within(lab).queryByText(/JSON/)).toBeNull();
    expect(
      within(lab).queryByRole("button", { name: /apply grade bands/i }),
    ).toBeNull();
    const a = within(lab).getByLabelText(
      "Lowest score for an A",
    ) as HTMLInputElement;
    expect(a.type).toBe("range");
    expect(
      (
        within(lab).getByLabelText(
          "Votes needed before we give a grade",
        ) as HTMLInputElement
      ).type,
    ).toBe("range");
  });

  it("re-grades the preview when a cutoff moves", () => {
    render(<PolicyLab dataset={fixture} />);
    const lab = screen.getByRole("region", {
      name: /try your own grading rules/i,
    });
    const before = screen.getByText(/members would change grade/).textContent;
    // Raise every cutoff to the top so most graded members fall a grade
    for (const label of ["A+", "A", "B", "C", "D"])
      fireEvent.change(
        within(lab).getByLabelText(
          new RegExp(`Lowest score for an? ${label.replace("+", "\\+")}$`),
        ),
        {
          target: { value: "100" },
        },
      );
    expect(screen.getByText(/members would change grade/).textContent).not.toBe(
      before,
    );
    expect(screen.getByRole("alert").textContent).toBe("");
  });
});
