import { readSource } from "../src/ingestion/members";
import {
  parseHouseRollcall,
  parseSenateRollcall,
} from "../src/ingestion/rollcalls";
import { HttpError } from "./auth";

function officialXml(value: unknown) {
  let parsed: URL | undefined;
  try {
    if (typeof value === "string") parsed = new URL(value);
  } catch {
    // A malformed URL gets the same guidance as an unsupported source.
  }
  if (
    !parsed ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new HttpError(
      400,
      "Enter an official House Clerk or Senate roll-call link.",
    );

  if (parsed.origin === "https://clerk.house.gov") {
    const page = /^\/Votes\/(\d{4})(\d{1,4})$/.exec(parsed.pathname);
    if (page)
      parsed.pathname = `/evs/${page[1]}/roll${page[2].padStart(3, "0")}.xml`;
    if (/^\/evs\/\d{4}\/roll\d{1,4}\.xml$/.test(parsed.pathname))
      return { url: parsed.href, chamber: "House" as const };
  }
  if (
    parsed.origin === "https://www.senate.gov" &&
    /^\/legislative\/LIS\/roll_call_votes\/vote\d+\/vote_\d+_\d+_\d+\.(?:htm|xml)$/.test(
      parsed.pathname,
    )
  ) {
    parsed.pathname = parsed.pathname.replace(/\.htm$/, ".xml");
    return { url: parsed.href, chamber: "Senate" as const };
  }
  throw new HttpError(
    400,
    "Enter an official House Clerk or Senate roll-call link.",
  );
}

function senateCrosswalk(value: string | undefined): Record<string, string> {
  if (!value)
    throw new HttpError(
      503,
      "Load the reviewed Senate identity crosswalk before importing Senate votes.",
    );
  try {
    const data: unknown = JSON.parse(value);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const entries = Object.entries(data);
      if (
        entries.length &&
        entries.every(
          ([lis, id]) =>
            /^S\d{3,5}$/.test(lis) &&
            typeof id === "string" &&
            /^[A-Z]\d{6}$/.test(id),
        )
      ) {
        return Object.assign(Object.create(null), data);
      }
    }
  } catch {
    // Keep configuration contents out of error messages.
  }
  throw new HttpError(
    503,
    "The reviewed Senate identity crosswalk is invalid.",
  );
}

export async function stageOfficialRollcall(
  value: unknown,
  crosswalkJson?: string,
  fetcher: typeof fetch = fetch,
) {
  const { url, chamber } = officialXml(value);
  const crosswalk = chamber === "Senate" ? senateCrosswalk(crosswalkJson) : {};
  let xml: string;
  try {
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Official source unavailable");
    }
    xml = await readSource(response);
  } catch {
    throw new HttpError(
      502,
      "Could not read the roll call from the official source.",
    );
  }
  try {
    return chamber === "House"
      ? await parseHouseRollcall(xml, url)
      : await parseSenateRollcall(xml, url, crosswalk);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const missing =
      /^Missing reviewed Senate identity crosswalk for (S\d{3,5})$/.exec(
        message,
      );
    throw new HttpError(
      422,
      missing
        ? `Missing reviewed Senate identity mapping for ${missing[1]}.`
        : "The official roll call could not be parsed or its totals could not be verified.",
    );
  }
}
