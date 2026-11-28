import { ingestCurrentMembers, type RosterRun } from "../src/ingestion/members";
import { HttpError } from "./auth";

export async function authorizeRosterCapture(
  request: Request,
  secret?: string,
) {
  if (!secret)
    throw new HttpError(503, "Scheduled roster intake is not configured.");
  const supplied = request.headers
    .get("Authorization")
    ?.match(/^Bearer ([!-~]{1,512})$/)?.[1];
  if (!supplied)
    throw new HttpError(401, "Roster capture credential required.");
  const encoder = new TextEncoder();
  const expected = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const candidate = await crypto.subtle.importKey(
    "raw",
    encoder.encode(supplied),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const label = encoder.encode("scorecard scheduled roster capture");
  const proof = await crypto.subtle.sign("HMAC", candidate, label);
  if (!(await crypto.subtle.verify("HMAC", expected, proof, label)))
    throw new HttpError(401, "Roster capture credential required.");
}

export async function normalizeRosterCapture(
  input: Record<string, unknown>,
): Promise<RosterRun> {
  const { asOf, pages } = input;
  if (
    typeof asOf !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(asOf) ||
    !Number.isFinite(Date.parse(asOf)) ||
    new Date(asOf).toISOString() !== asOf ||
    Date.parse(asOf) > Date.now() + 5 * 60_000 ||
    !Array.isArray(pages) ||
    !pages.length ||
    pages.length > 20
  )
    throw new HttpError(422, "A complete dated roster capture is required.");

  // Replay the signed-in workflow's captured responses through the same importer.
  // The adapter supplies captured strings and never makes an outbound request.
  let consumed = 0;
  try {
    const run = await ingestCurrentMembers({
      apiKey: "local-capture-replay",
      now: asOf,
      fetcher: async (url) => {
        const page = pages[consumed++];
        if (!page || page.url !== String(url) || typeof page.body !== "string")
          throw new Error("Roster capture pages do not match");
        return new Response(page.body);
      },
    });
    if (consumed !== pages.length) throw new Error("Unused capture pages");
    return run;
  } catch {
    throw new HttpError(
      422,
      "Roster capture pages are incomplete or inconsistent.",
    );
  }
}
