import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

try {
  const dir = process.argv[2];
  const token = process.env.ROSTER_INGESTION_TOKEN;
  const endpoint = new URL(process.env.SCORECARD_ROSTER_URL ?? "");
  if (
    !dir ||
    !token ||
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/scorecard/api/ingestion/roster"
  )
    throw new Error("Roster upload configuration is incomplete.");

  const { run } = JSON.parse(await readFile(join(dir, "staging.json"), "utf8"));
  const pages = await Promise.all(
    run.sources.map(async (source, i) => {
      const filename = `source-${String(i + 1).padStart(3, "0")}.txt`;
      const body = await readFile(join(dir, filename), "utf8");
      if (createHash("sha256").update(body).digest("hex") !== source.sha256)
        throw new Error("Roster artifact digest mismatch.");
      return { url: source.url, body };
    }),
  );
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ asOf: run.asOf, pages }),
  });
  if (!response.ok)
    throw new Error(`Roster storage returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.capturedAt !== run.asOf || typeof result.stored !== "boolean")
    throw new Error("Roster storage response was invalid.");
  console.log(
    result.stored
      ? "Stored the roster for staff review."
      : "The staff workspace already has this capture or a newer one.",
  );
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Roster storage failed.";
  const token = process.env.ROSTER_INGESTION_TOKEN;
  console.error(token ? message.replaceAll(token, "[redacted]") : message);
  process.exitCode = 1;
}
