import { describe, it, expect } from "vitest";
import { interpretModelResponse, research } from "./ai";
import { demoDataset } from "../src/data/context";
describe("grounded AI boundary", () => {
  it("accepts only a valid query and rejects model-authored SQL or unknown facts", () => {
    expect(
      interpretModelResponse(
        { response: '{"kind":"ranking","limit":10}' },
        demoDataset,
      ).kind,
    ).toBe("ranking");
    expect(() =>
      interpretModelResponse(
        { response: { kind: "ranking", sql: "SELECT *" } },
        demoDataset,
      ),
    ).toThrow("outside");
    expect(() =>
      interpretModelResponse(
        {
          response: {
            kind: "intersection",
            conditions: [{ voteId: "invented", outcome: "Yes" }],
          },
        },
        demoDataset,
      ),
    ).toThrow("outside");
  });
  it("declines ambiguous questions and malformed output", () => {
    expect(() =>
      interpretModelResponse(
        { response: { clarification: true } },
        demoDataset,
      ),
    ).toThrow("clarification");
    expect(() =>
      interpretModelResponse({ response: "not json" }, demoDataset),
    ).toThrow("invalid query");
  });
  it("fails closed when no model is configured, without accessing external services", async () => {
    await expect(
      research(
        new Request("https://example.com/scorecard/api/research", {
          method: "POST",
        }),
        { AI_MODEL: "" } as Env,
      ),
    ).rejects.toThrow("not configured");
  });
});
