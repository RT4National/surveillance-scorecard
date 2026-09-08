import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Party } from "../core/types";
import { bioguide, capture, object, party, requiredString } from "./members";

export interface DirectoryObservation {
  memberId: string;
  name: string;
  state: string;
  party: Party;
  chamber: "House" | "Senate";
  district?: number;
  swornDate?: string;
  committees: { code: string; name: string }[];
}
const list = (v: unknown): unknown[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];
function parse(xml: string) {
  if (
    xml.length > 2_000_000 ||
    /<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    throw new Error("Invalid or oversized directory XML");
  return object(
    new XMLParser({
      ignoreAttributes: false,
      parseTagValue: false,
      processEntities: false,
    }).parse(xml),
  );
}
function unique(rows: DirectoryObservation[]) {
  if (
    !rows.length ||
    rows.length > 600 ||
    new Set(rows.map((r) => r.memberId)).size !== rows.length
  )
    throw new Error("Directory empty or duplicate identities");
}
/** Public directory observations never masquerade as a completed Congress.gov roster run. */
export async function parseHouseDirectory(
  xml: string,
  now = new Date().toISOString(),
) {
  const url = "https://clerk.house.gov/xml/lists/MemberData.xml";
  const root = object(parse(xml).MemberData),
    members: DirectoryObservation[] = [],
    vacancies: { district: string; note: string }[] = [];
  const committees = new Map(
    list(object(root.committees).committee).map((value) => {
      const row = object(value);
      return [
        requiredString(row["@_comcode"]),
        requiredString(row["committee-fullname"]),
      ];
    }),
  );
  const seats = new Set<string>();
  for (const value of list(object(root.members).member)) {
    const row = object(value),
      info = object(row["member-info"]),
      seat = requiredString(row.statedistrict);
    if (!/^[A-Z]{2}\d{2}$/.test(seat) || seats.has(seat))
      throw new Error("Invalid or duplicate House seat");
    seats.add(seat);
    if (!info.bioguideID) {
      vacancies.push({ district: seat, note: requiredString(info.footnote) });
      continue;
    }
    const state = requiredString(object(info.state)["@_postal-code"]);
    // Clerk MemberData uses AQ00 as the statedistrict for American Samoa (postal AS).
    if (state !== seat.slice(0, 2) && !(state === "AS" && seat === "AQ00"))
      throw new Error("House district and state disagree");
    const sworn = info["sworn-date"]
      ? object(info["sworn-date"])["@_date"]
      : undefined;
    let swornDate: string | undefined;
    if (sworn) {
      if (typeof sworn !== "string" || !/^\d{8}$/.test(sworn))
        throw new Error("Invalid sworn date");
      swornDate = `${sworn.slice(0, 4)}-${sworn.slice(4, 6)}-${sworn.slice(6, 8)}`;
      if (
        !Number.isFinite(Date.parse(swornDate)) ||
        new Date(swornDate).toISOString().slice(0, 10) !== swornDate
      )
        throw new Error("Invalid sworn date");
    }
    const assignments = row["committee-assignments"]
      ? object(row["committee-assignments"])
      : {};
    const memberships = list(assignments.committee).flatMap((value) => {
      const assignment = object(value);
      if (
        Object.keys(assignment).every((key) => key === "@_rank") &&
        assignment["@_rank"] === ""
      )
        return [];
      const code = requiredString(assignment["@_comcode"]),
        name = committees.get(code);
      if (!name) throw new Error("Unknown House committee code");
      return [{ code, name }];
    });
    members.push({
      memberId: bioguide(info.bioguideID),
      name: requiredString(info["official-name"]),
      state,
      party: party(info.party),
      chamber: "House",
      district: Number(seat.slice(2)),
      swornDate,
      committees: memberships,
    });
  }
  unique(members);
  return {
    complete: false as const,
    kind: "supplemental-public-directory" as const,
    requiresReview: true as const,
    members,
    vacancies,
    listedSeats: seats.size,
    upstreamPublishedAt: requiredString(root["@_publish-date"]),
    source: await capture(xml, url, "members", now),
    warnings: [
      "Current House directory observation only, not complete historical service or a Congress.gov reconciliation.",
      "Committee assignments are observed at capture time; their historical start dates are not established.",
      "Sworn dates apply to listed service and do not establish uninterrupted historical tenure.",
    ],
  };
}
export async function parseSenateDirectory(
  xml: string,
  now = new Date().toISOString(),
) {
  const url =
    "https://www.senate.gov/general/contact_information/senators_cfm.xml";
  const members: DirectoryObservation[] = list(
    object(parse(xml).contact_information).member,
  ).map((value) => {
    const row = object(value),
      state = requiredString(row.state);
    if (!/^[A-Z]{2}$/.test(state)) throw new Error("Invalid Senate state");
    return {
      memberId: bioguide(row.bioguide_id),
      name: `${requiredString(row.first_name)} ${requiredString(row.last_name)}`,
      state,
      party: party(row.party),
      chamber: "Senate",
      committees: [],
    };
  });
  unique(members);
  return {
    complete: false as const,
    kind: "supplemental-public-directory" as const,
    requiresReview: true as const,
    members,
    source: await capture(xml, url, "members", now),
    warnings: [
      "Current Senate contact directory only; no exact service dates or LIS identity crosswalk are supplied.",
      "Member counts do not prove historical completeness.",
    ],
  };
}
