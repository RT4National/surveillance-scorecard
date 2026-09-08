import type { Dataset } from "../src/core/publication";
import { validateRubric } from "../src/core/scoring";
export function validateDataset(value: unknown): string[] {
  try {
    return checkDataset(value);
  } catch {
    return ["Malformed dataset field or collection entry"];
  }
}
function checkDataset(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object") return ["Dataset must be an object"];
  const d = value as Dataset;
  if (Object.hasOwn(d, "storage"))
    return ["Dataset field storage is reserved for the persistence envelope"];
  const nonempty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const https = (v: unknown) => {
    try {
      if (typeof v !== "string") return false;
      const url = new URL(v);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        ![...url.searchParams.keys()].some((k) =>
          /^(api[_-]?key|key|token|access[_-]?token|authorization|password|signature|x-amz-credential|x-amz-signature)$/i.test(
            k,
          ),
        )
      );
    } catch {
      return false;
    }
  };
  if (
    !nonempty(d.id) ||
    typeof d.asOf !== "string" ||
    !Number.isFinite(Date.parse(d.asOf)) ||
    typeof d.demo !== "boolean"
  )
    errors.push("Dataset identity, asOf and demo flag are required");
  if (
    ![d.members, d.votes, d.records, d.sources, d.coverage].every(Array.isArray)
  )
    return [...errors, "Dataset collections are required"];
  const unique = (ids: string[], name: string) => {
    if (
      ids.some((id) => typeof id !== "string" || !id) ||
      new Set(ids).size !== ids.length
    )
      errors.push(`${name} IDs must be unique and nonempty`);
  };
  unique(
    d.members.map((m) => m.id),
    "Member",
  );
  unique(
    d.votes.map((v) => v.id),
    "Vote",
  );
  const members = new Map(d.members.map((m) => [m.id, m]));
  const votes = new Map(d.votes.map((v) => [v.id, v]));
  const dateBoundary = (v: unknown, precision: string) =>
    typeof v === "string" &&
    (precision === "year"
      ? /^\d{4}$/.test(v) && Number(v) >= 1789
      : /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v);
  if (d.affiliations !== undefined) {
    if (!Array.isArray(d.affiliations))
      return ["Affiliations must be an array"];
    for (const a of d.affiliations)
      if (
        !members.has(a.memberId) ||
        !["party", "committee", "caucus", "term"].includes(a.kind) ||
        !["day", "year"].includes(a.precision) ||
        !nonempty(a.name) ||
        !https(a.source) ||
        !dateBoundary(a.start, a.precision) ||
        (a.end !== undefined &&
          (!dateBoundary(a.end, a.precision) || a.end < a.start))
      )
        errors.push("Invalid affiliation history");
    for (let i = 0; i < d.affiliations.length; i++)
      for (let j = i + 1; j < d.affiliations.length; j++) {
        const a = d.affiliations[i],
          b = d.affiliations[j];
        if (
          a.memberId !== b.memberId ||
          a.kind !== b.kind ||
          (a.kind !== "party" &&
            !(
              a.kind === "term" &&
              a.precision === "day" &&
              b.precision === "day"
            ) &&
            a.name !== b.name)
        )
          continue;
        const start = (v: typeof a) =>
          v.precision === "year" ? `${v.start}-01-01` : v.start;
        const end = (v: typeof a) =>
          v.end
            ? v.precision === "year"
              ? `${v.end}-12-31`
              : v.end
            : "9999-12-31";
        if (start(a) <= end(b) && start(b) <= end(a))
          errors.push("Overlapping affiliations need editorial resolution");
      }
  }
  if (!d.members.length || !d.votes.length || !d.records.length)
    errors.push("Members, votes and evidence cannot be empty");
  const states = new Set(
    "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|Puerto Rico|Guam|American Samoa|Northern Mariana Islands|Virgin Islands".split(
      "|",
    ),
  );
  const codes = new Set(
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR GU AS MP VI".split(
      " ",
    ),
  );
  if (!d.coverage.every(nonempty))
    errors.push("Coverage notes must be nonempty strings");
  for (const m of d.members)
    if (
      !nonempty(m.name) ||
      !["House", "Senate"].includes(m.chamber) ||
      !["Democratic", "Republican", "Independent"].includes(m.party) ||
      !(codes.has(m.state) || states.has(m.state)) ||
      !["active", "inactive", "deceased"].includes(m.status) ||
      !Array.isArray(m.committees) ||
      !Array.isArray(m.caucuses) ||
      !m.committees.every(nonempty) ||
      !m.caucuses.every(nonempty) ||
      !Number.isInteger(m.since) ||
      (m.district !== undefined &&
        (!Number.isInteger(m.district) || m.district < 0)) ||
      (m.portrait !== undefined &&
        (!(
          https(m.portrait.url) ||
          /^\/scorecard\/portraits\/[a-zA-Z0-9_-]+\.(?:png|jpg|jpeg|webp)$/.test(
            m.portrait.url,
          )
        ) ||
          !https(m.portrait.rightsSource) ||
          !nonempty(m.portrait.attribution) ||
          !nonempty(m.portrait.reviewedBy) ||
          !["public-domain", "licensed"].includes(m.portrait.rights)))
    )
      errors.push(`Invalid member ${m.id}`);
  for (const v of d.votes)
    if (
      ![v.title, v.bill, v.rationale, v.topic, v.administration].every(
        nonempty,
      ) ||
      !["Democratic", "Republican", "Independent"].includes(v.presidentParty) ||
      typeof v.date !== "string" ||
      !Number.isFinite(Date.parse(v.date)) ||
      !["Yes", "No"].includes(v.reformVote) ||
      !Number.isFinite(v.weight) ||
      v.weight <= 0 ||
      v.weight > 100 ||
      !["House", "Senate"].includes(v.chamber) ||
      (v.source !== null && !https(v.source)) ||
      (!d.demo && !https(v.source))
    )
      errors.push(`Invalid vote or missing rationale/source: ${v.id}`);
  const pairs = new Set<string>();
  for (const r of d.records) {
    const key = `${r.memberId}/${r.voteId}`;
    if (
      !members.has(r.memberId) ||
      !votes.has(r.voteId) ||
      pairs.has(key) ||
      !["Yes", "No", "Not voting", "Not eligible"].includes(r.outcome) ||
      !["Democratic", "Republican", "Independent"].includes(r.partyAtVote)
    )
      errors.push(`Invalid or duplicate evidence ${key}`);
    pairs.add(key);
    const event = votes.get(r.voteId);
    const knownParty = d.affiliations?.filter(
      (a) =>
        a.memberId === r.memberId &&
        a.kind === "party" &&
        a.precision === "day" &&
        a.start <= (event?.date ?? "") &&
        (!a.end || a.end >= (event?.date ?? "")),
    );
    if (knownParty?.some((a) => a.name !== r.partyAtVote))
      errors.push(`Recorded party contradicts exact-day affiliation: ${key}`);
    const exactTerm = d.affiliations?.some(
      (a) =>
        a.memberId === r.memberId &&
        a.kind === "term" &&
        a.precision === "day" &&
        (a.name === event?.chamber ||
          (event?.chamber === "House" &&
            a.name === "House of Representatives")) &&
        a.start <= (event?.date ?? "") &&
        (!a.end || a.end >= (event?.date ?? "")),
    );
    if (
      r.outcome !== "Not eligible" &&
      members.get(r.memberId)?.chamber !== event?.chamber &&
      !exactTerm
    )
      errors.push(
        `Cross-chamber evidence requires exact-day historical service: ${key}`,
      );
  }
  if (
    !d.rubric?.version ||
    !Number.isInteger(d.rubric.minVotes) ||
    d.rubric.minVotes < 1 ||
    !Number.isInteger(d.rubric.minPerContext) ||
    d.rubric.minPerContext < 1 ||
    !Number.isFinite(d.rubric.consistencyThreshold) ||
    d.rubric.consistencyThreshold < 0 ||
    d.rubric.consistencyThreshold > 100
  )
    errors.push("Invalid scoring rubric");
  for (const s of d.sources)
    if (
      !https(s.url) ||
      !["members", "votes", "memberships", "portrait", "legacy"].includes(
        s.kind,
      ) ||
      !/^[a-f0-9]{64}$/.test(s.sha256) ||
      !Number.isFinite(Date.parse(s.retrievedAt))
    )
      errors.push("Invalid source capture");
  if (!d.demo && !d.sources.length)
    errors.push("Live datasets require captured sources");
  if (!d.demo)
    for (const v of d.votes) {
      const host = new URL(v.source!).hostname;
      const official = ["congress.gov", "house.gov", "senate.gov"].some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      );
      if (!official)
        errors.push(
          `Live vote needs an official congressional source: ${v.id}`,
        );
      if (!d.sources.some((s) => s.kind === "votes" && s.url === v.source))
        errors.push(`Live vote lacks a matching captured source: ${v.id}`);
    }
  if (
    !d.demo &&
    (d.id.includes("fictional") ||
      d.members.some((m) => m.id.startsWith("demo-")) ||
      d.votes.some((v) => v.id.startsWith("demo-")))
  )
    errors.push("Fictional evidence cannot be published as live");
  if (d.votes.some((v) => Date.parse(v.date) > Date.parse(d.asOf)))
    errors.push("Vote dates cannot exceed the dataset cutoff");
  try {
    validateRubric(d.rubric);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "Invalid rubric");
  }
  return errors.slice(0, 100);
}
export async function digest(value: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
