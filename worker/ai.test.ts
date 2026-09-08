import { describe, it, expect, vi } from "vitest";
import { interpretModelResponse, research } from "./ai";
import { demoDataset } from "../src/data/context";
import { encodeStoredJson } from "./storage";
describe("grounded AI boundary", () => {
  it("reads compressed evidence before deterministic AI-query execution", async () => {
    // Only a controlled test fixture; never published or sent to a real model.
    const dataset = {
      ...demoDataset,
      demo: false,
      coverage: ["Fixture coverage ".repeat(10000)],
    };
    const metadata = {
      id: "compressed-fixture",
      createdAt: "2026-09-07T00:00:00Z",
      publishedBy: "fixture@example.com",
      summary: "Controlled AI storage fixture",
      digest: "fixture-only",
      previousId: null,
      datasetId: dataset.id,
    };
    const { datasetId: _datasetId, ...publicationMetadata } = metadata;
    const snapshot = await encodeStoredJson(
      { ...publicationMetadata, dataset },
      metadata,
    );
    expect(JSON.parse(snapshot).storage).toBe("gzip-v1");
    const run = vi
      .fn()
      .mockResolvedValue({ response: { kind: "ranking", limit: 10 } });
    const env = { AI_MODEL: "@cf/meta/llama-3.1-8b-instruct-fast" } as Env;
    const unexpected = (): never => {
      throw new Error("Unexpected platform call in AI test");
    };
    env.AI = {
      run,
      aiGatewayLogId: null,
      gateway: unexpected,
      aiSearch: unexpected,
      autorag: unexpected,
      models: unexpected,
      toMarkdown: unexpected,
    };
    env.DB = {
      batch: unexpected,
      exec: unexpected,
      withSession: unexpected,
      dump: unexpected,
      prepare: vi.fn().mockImplementation((sql: string) => ({
        bind() {
          return this;
        },
        first: async () =>
          sql.startsWith("SELECT snapshot") ? { snapshot } : { count: 1 },
        run: async () => ({ success: true }),
      })),
    };
    const response = await research(
      new Request("https://example.com/scorecard/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "Top ten reformers",
          publicationId: "compressed-fixture",
        }),
      }),
      env,
    );
    const report = (await response.json()) as {
      publicationId: string;
      rows: unknown[];
    };
    expect(report.publicationId).toBe("compressed-fixture");
    expect(report.rows.length).toBeGreaterThan(0);
    expect(run).toHaveBeenCalledOnce();
  });
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
