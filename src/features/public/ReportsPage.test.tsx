// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { demoDataset } from "../../data/demo-dataset";
import { ReportsPage } from "./ReportsPage";

it("keeps saved filters available and explains the ranking caveat", () => {
  const query = { kind: "ranking", status: "inactive" };
  history.replaceState(
    null,
    "",
    `/scorecard/research?${new URLSearchParams({ query: JSON.stringify(query) })}`,
  );
  render(<ReportsPage dataset={demoDataset} />);
  expect(
    screen.getByRole("heading", { name: "Reporting accurately" }),
  ).toBeTruthy();
  expect(
    screen.getByText("One view of the evidence, not a verdict."),
  ).toBeTruthy();
  expect(
    (
      screen.getByRole("option", {
        name: "Former members",
      }) as HTMLOptionElement
    ).selected,
  ).toBe(true);
  expect(
    screen.queryByRole("link", { name: "Full publication (JSON)" }),
  ).toBeNull();
});
