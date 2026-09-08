#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { capture, readSource } from "../../src/ingestion/members.ts";
import {
  parseHouseDirectory,
  parseSenateDirectory,
} from "../../src/ingestion/public-directories.ts";
import { parseHouseRollcall } from "../../src/ingestion/rollcalls.ts";

const revision = "0dc6397c8f0262888b96329bbb9ace9abc15fdd3";
const codeUrl = `https://raw.githubusercontent.com/RT4National/DecideTheFuture/${revision}/app/javascript/bundles/main/components/ScorecardPolitical.jsx`;
const now = new Date().toISOString();
const [destination] = process.argv.slice(2);
if (!destination)
  throw new Error(
    "Usage: node --import tsx scripts/ingestion/stage-real-evidence.mjs NEW_OUTPUT_DIRECTORY",
  );
const output = resolve(destination);
await mkdir(output, { recursive: false });
await mkdir(resolve(output, "sources"));
const captures = [],
  failures = [];
async function fetchCapture(url, name, kind) {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const raw = await readSource(response);
  const source = await capture(raw, url, kind, now);
  const filename = `sources/${name}`;
  await writeFile(resolve(output, filename), raw, { flag: "wx" });
  captures.push({ ...source, filename });
  return raw;
}
function officialXml(link) {
  const url = new URL(link.replace(/^http:/, "https:"));
  if (url.hostname === "clerk.house.gov") {
    const modern = url.pathname.match(/^\/Votes\/(\d{4})(\d+)$/);
    if (modern)
      return `https://clerk.house.gov/evs/${modern[1]}/roll${modern[2].padStart(3, "0")}.xml`;
    if (/^\/evs\/\d{4}\/roll\d+\.xml$/.test(url.pathname))
      return url.toString();
  }
  if (url.hostname === "www.senate.gov") {
    if (
      /^\/legislative\/LIS\/roll_call_votes\/vote\d+\/vote_\d+_\d+_\d+\.htm$/.test(
        url.pathname,
      )
    )
      return url.toString().replace(/\.htm$/, ".xml");
    if (
      url.pathname === "/legislative/LIS/roll_call_lists/roll_call_vote_cfm.cfm"
    ) {
      const congress = url.searchParams.get("congress"),
        session = url.searchParams.get("session"),
        vote = url.searchParams.get("vote");
      if (
        /^\d+$/.test(congress ?? "") &&
        /^[12]$/.test(session ?? "") &&
        /^\d+$/.test(vote ?? "")
      )
        return `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${vote.padStart(5, "0")}.xml`;
    }
  }
}
const code = await fetchCapture(
  codeUrl,
  "legacy-ScorecardPolitical.jsx",
  "legacy",
);
const citations = new Map();
for (const match of code.matchAll(/https?:\/\/[^\s'"`<>]+/g)) {
  let normalized;
  try {
    normalized = officialXml(match[0]);
  } catch {
    continue;
  }
  if (!normalized) continue;
  const entry = citations.get(normalized) ?? {
    url: normalized,
    legacyLinks: [],
    legacyLines: [],
  };
  entry.legacyLinks.push(match[0]);
  entry.legacyLines.push(code.slice(0, match.index).split("\n").length);
  citations.set(normalized, entry);
}
const houseDirectory = await parseHouseDirectory(
  await fetchCapture(
    "https://clerk.house.gov/xml/lists/MemberData.xml",
    "house-directory.xml",
    "members",
  ),
  now,
);
const senateDirectory = await parseSenateDirectory(
  await fetchCapture(
    "https://www.senate.gov/general/contact_information/senators_cfm.xml",
    "senate-directory.xml",
    "members",
  ),
  now,
);
const known = new Set(
  [...houseDirectory.members, ...senateDirectory.members].map(
    (m) => m.memberId,
  ),
);
const houseStages = [],
  senatePending = [];
const parser = new XMLParser({
  parseTagValue: false,
  ignoreAttributes: false,
  processEntities: false,
});
for (const [index, entry] of [...citations.values()].entries()) {
  try {
    const raw = await fetchCapture(
      entry.url,
      `rollcall-${String(index + 1).padStart(3, "0")}.xml`,
      "votes",
    );
    if (entry.url.includes("clerk.house.gov")) {
      const stage = await parseHouseRollcall(raw, entry.url, now);
      houseStages.push({
        ...stage,
        legacyReference: entry,
        editorial: null,
        absentFromCurrentDirectories: stage.records
          .filter((r) => !known.has(r.memberId))
          .map((r) => r.memberId),
      });
    } else {
      if (/<!ENTITY/i.test(raw) || XMLValidator.validate(raw) !== true)
        throw new Error("Invalid Senate source XML");
      const root = parser.parse(raw).roll_call_vote;
      const ballots = Array.isArray(root.members.member)
        ? root.members.member
        : [root.members.member];
      const expected = ["yeas", "nays", "present", "absent"].reduce(
        (sum, key) => sum + Number(root.count[key] || 0),
        0,
      );
      if (
        ballots.length !== expected ||
        new Set(ballots.map((b) => b.lis_member_id)).size !== ballots.length ||
        ballots.some((b) => !/^S\d+$/.test(b.lis_member_id))
      )
        throw new Error("Senate totals or LIS identity validation failed");
      senatePending.push({
        ...entry,
        congress: root.congress,
        session: root.session,
        roll: root.vote_number,
        date: root.vote_date,
        question: root.question,
        title: root.vote_title,
        officialCounts: root.count,
        ballots: ballots.map((b) => ({
          lisId: b.lis_member_id,
          name: b.member_full,
          state: b.state,
          party: b.party,
          outcome: b.vote_cast,
        })),
        editorial: null,
        gate: "Raw official ballots only. Reviewed LIS-to-Bioguide crosswalk required before record normalization or scoring.",
      });
    }
  } catch (error) {
    failures.push({
      url: entry.url,
      reason: error instanceof Error ? error.message : "Capture failed",
    });
  }
}
const manifest = {
  kind: "real-evidence-review-packet",
  createdAt: now,
  complete: false,
  publishable: false,
  requiresReview: true,
  legacy: {
    repository: "RT4National/DecideTheFuture",
    revision,
    codeUrl,
    sheetRange: "newsb",
    sheetExportAvailable: false,
  },
  scope:
    "Official roll-call URLs cited by the pinned legacy political scorecard only; not every legacy criterion and not a complete surveillance universe.",
  directories: { house: houseDirectory, senate: senateDirectory },
  houseStages,
  senatePending,
  captures,
  failures,
  qualification: {
    requestedOfficialRollcalls: citations.size,
    validatedHouseRollcalls: houseStages.length,
    rawSenateRollcalls: senatePending.length,
    normalizedHouseBallots: houseStages.reduce(
      (n, s) => n + s.records.length,
      0,
    ),
    missingHistoricalHouseIdentities: [
      ...new Set(houseStages.flatMap((s) => s.absentFromCurrentDirectories)),
    ],
    missingSenateLisIds: [
      ...new Set(senatePending.flatMap((s) => s.ballots.map((b) => b.lisId))),
    ],
    currentHouseMembers: houseDirectory.members.length,
    currentSenators: senateDirectory.members.length,
    houseVacancies: houseDirectory.vacancies.length,
    currentSenatorsWithHistoricalHouseBallots: senateDirectory.members
      .filter((m) =>
        houseStages.some((s) =>
          s.records.some((r) => r.memberId === m.memberId),
        ),
      )
      .map((m) => ({
        memberId: m.memberId,
        name: m.name,
        gate: "Exact-day House service history required; current Senate directory does not authorize historical House eligibility.",
      })),
  },
  gates: [
    "Congress.gov API key and complete reconciliation",
    "Reviewed historical service/member identities including chamber changes",
    "Reviewed Senate LIS-to-Bioguide crosswalk",
    "Legacy newsb sheet export and column interpretation",
    "Editorial vote selection, reform direction, rationale, administration and weights",
    "Approved rubric and second-person publication review",
    "Source captures archived durably before publishing",
  ],
};
await writeFile(
  resolve(output, "review-manifest.json"),
  JSON.stringify(manifest, null, 2),
  { flag: "wx" },
);
console.log(
  JSON.stringify(
    {
      output,
      ...manifest.qualification,
      missingHistoricalHouseIdentities:
        manifest.qualification.missingHistoricalHouseIdentities.length,
      missingSenateLisIds: manifest.qualification.missingSenateLisIds.length,
      failures,
    },
    null,
    2,
  ),
);
