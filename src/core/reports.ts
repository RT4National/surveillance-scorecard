import type { Dataset, Publication } from "./publication";
import type { Outcome, Party, Status, Member } from "./types";
import { scoreMember } from "./scoring";
import { toCsv } from "./research";
import { publishedScore, verifyPublicationScoring } from "./publication-scores";

export interface ReportQuery {
  kind: "ranking" | "intersection";
  topic?: string;
  from?: string;
  to?: string;
  context?: "same" | "opposing";
  memberIds?: string[];
  conditions?: { voteId: string; outcome: Outcome }[];
  limit?: number;
  parties?: Party[];
  perParty?: boolean;
  status?: Status | "all";
  chamber?: Member["chamber"];
}
const outcomes = ["Yes", "No", "Not voting", "Not eligible"];
export const membershipSemantics =
  "Current party, current chamber, and member status describe the roster as of the selected publication, including the last recorded affiliation for former members. Date filters narrow votes, not roster membership. Presidential party context uses party at the time of each vote.";
export function validateReportQuery(
  input: unknown,
  data: Dataset,
): ReportQuery {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid report query");
  const q = input as ReportQuery;
  if (
    Object.keys(q).some(
      (k) =>
        ![
          "kind",
          "topic",
          "from",
          "to",
          "context",
          "memberIds",
          "conditions",
          "limit",
          "parties",
          "perParty",
          "status",
          "chamber",
        ].includes(k),
    )
  )
    throw new Error("Unsupported query field");
  if (!["ranking", "intersection"].includes(q.kind))
    throw new Error("Unsupported report type");
  if (
    q.parties !== undefined &&
    (!Array.isArray(q.parties) ||
      q.parties.some(
        (p) => !["Democratic", "Republican", "Independent"].includes(p),
      ))
  )
    throw new Error("Unknown party");
  if (q.perParty !== undefined && typeof q.perParty !== "boolean")
    throw new Error("Invalid party grouping");
  if (
    q.status !== undefined &&
    !["active", "inactive", "deceased", "all"].includes(q.status)
  )
    throw new Error("Unknown status");
  if (q.chamber !== undefined && !["House", "Senate"].includes(q.chamber))
    throw new Error("Unknown chamber");
  for (const date of [q.from, q.to])
    if (
      date !== undefined &&
      (typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date)
    )
      throw new Error("Invalid report date");
  if (q.from && q.to && q.from > q.to)
    throw new Error("Start date must precede end date");
  if (q.topic !== undefined && !data.votes.some((v) => v.topic === q.topic))
    throw new Error("Unknown issue");
  if (q.context !== undefined && !["same", "opposing"].includes(q.context))
    throw new Error("Unknown party context");
  if (
    q.limit !== undefined &&
    (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > 1000)
  )
    throw new Error("Limit must be 1–1000");
  if (
    q.memberIds !== undefined &&
    (!Array.isArray(q.memberIds) ||
      q.memberIds.length > 1000 ||
      q.memberIds.some((id) => !data.members.some((m) => m.id === id)))
  )
    throw new Error("Unknown member");
  if (
    q.conditions !== undefined &&
    (!Array.isArray(q.conditions) ||
      q.conditions.length > 20 ||
      q.conditions.some(
        (c) =>
          !c ||
          !data.votes.some((v) => v.id === c.voteId) ||
          !outcomes.includes(c.outcome),
      ))
  )
    throw new Error("Unknown vote or outcome");
  if (q.kind === "intersection" && !q.conditions?.length)
    throw new Error("Choose at least one vote condition");
  return q;
}
export function executeReport(
  data: Dataset,
  input: unknown,
  options: { includeUnrated?: boolean } = {},
) {
  const query = validateReportQuery(input, data);
  const cutoff = query.to && query.to < data.asOf ? query.to : data.asOf;
  const votes = data.votes.filter(
    (v) =>
      (!query.topic || v.topic === query.topic) &&
      (!query.from || v.date >= query.from) &&
      v.date <= cutoff,
  );
  const voteIds = new Set(votes.map((v) => v.id));
  if (query.conditions?.some((c) => !voteIds.has(c.voteId)))
    throw new Error(
      "A vote condition is outside the selected issue/date scope",
    );
  const records = data.records.filter((r) => {
    const vote = votes.find((v) => v.id === r.voteId);
    return (
      vote &&
      (!query.context ||
        (r.partyAtVote === vote.presidentParty) === (query.context === "same"))
    );
  });
  const ranked = data.members
    .filter(
      (m) =>
        (query.status === "all" || m.status === (query.status ?? "active")) &&
        (!query.parties || query.parties.includes(m.party)) &&
        (!query.chamber || m.chamber === query.chamber),
    )
    .filter((m) => !query.memberIds || query.memberIds.includes(m.id))
    .filter(
      (m) =>
        query.kind !== "intersection" ||
        query.conditions!.every((c) =>
          records.some(
            (r) =>
              r.memberId === m.id &&
              r.voteId === c.voteId &&
              r.outcome === c.outcome,
          ),
        ),
    )
    .map((member) => ({
      member,
      score: scoreMember(member, votes, records, data.rubric, cutoff),
    }))
    .filter(
      (r) =>
        options.includeUnrated ||
        query.kind !== "ranking" ||
        r.score.value !== null,
    )
    .sort(
      (a, b) =>
        (b.score.value ?? -1) - (a.score.value ?? -1) ||
        a.member.name.localeCompare(b.member.name),
    );
  const rows = query.perParty
    ? (["Democratic", "Republican", "Independent"] as const).flatMap((p) =>
        ranked
          .filter((r) => r.member.party === p)
          .slice(0, query.limit ?? 1000),
      )
    : ranked.slice(0, query.limit ?? 1000);
  const contributingVoteIds = new Set(
    rows.flatMap((row) =>
      row.score.evidence
        .filter(
          (e) =>
            e.scored || query.conditions?.some((c) => c.voteId === e.voteId),
        )
        .map((e) => e.voteId),
    ),
  );
  const resultMemberIds = new Set(rows.map((row) => row.member.id));
  return {
    query,
    cutoff,
    rows,
    votes,
    records: records.filter((r) => resultMemberIds.has(r.memberId)),
    sources: [
      ...new Set(
        votes
          .filter((v) => contributingVoteIds.has(v.id))
          .map((v) => v.source)
          .filter((s): s is string => !!s),
      ),
    ],
  };
}
function reportRows(data: Dataset, input: unknown, publicationId?: string) {
  const result = executeReport(data, input);
  return [
    [
      data.demo
        ? "FICTIONAL DEMO — not congressional evidence"
        : "Surveillance reform scorecard",
    ],
    [
      "Dataset",
      data.id,
      "Publication",
      publicationId ?? "Unpublished",
      "As of",
      data.asOf,
      "Rubric",
      data.rubric.version,
    ],
    ["Query", JSON.stringify(result.query)],
    ["Effective cutoff", result.cutoff],
    ["Coverage", data.coverage.join("; ")],
    ["Membership semantics", membershipSemantics],
    [
      "Scoring interpretation",
      "Research scores are recomputed from the selected evidence scope using the current scoring engine and the publication rubric; they are not frozen official publication grades.",
    ],
    [
      "Member ID",
      "Name",
      "Current party",
      "Current chamber",
      "State",
      "Grade",
      "Alignment percent",
      "Counted votes",
      "Evidence status",
    ],
    ...result.rows.map((r) => [
      r.member.id,
      r.member.name,
      r.member.party,
      r.member.chamber,
      r.member.state,
      r.score.grade,
      r.score.value ?? "Insufficient evidence",
      r.score.counted,
      r.score.reason,
    ]),
    ["Source URLs", ...result.sources],
  ];
}
export function reportCsv(
  data: Dataset,
  input: unknown,
  publicationId?: string,
) {
  return toCsv(reportRows(data, input, publicationId));
}
export function reportTsv(
  data: Dataset,
  input: unknown,
  publicationId?: string,
) {
  return reportRows(data, input, publicationId)
    .map((row) =>
      row
        .map((value) => {
          const text = String(value).replace(/[\t\r\n\u0000]/g, " ");
          return (/^\s*[=+@-]/.test(text) ? "'" : "") + text;
        })
        .join("\t"),
    )
    .join("\n");
}
export function findStateRepresentatives(data: Dataset, state: string) {
  return data.members
    .filter((m) => m.state === state && m.status === "active")
    .sort(
      (a, b) =>
        a.chamber.localeCompare(b.chamber) ||
        (a.district ?? 0) - (b.district ?? 0) ||
        a.name.localeCompare(b.name),
    );
}
export function decodeVoteId(value?: string) {
  if (value === undefined) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
export async function loadArchivedPublication(
  id: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<Publication> {
  const response = await fetcher(
    `/scorecard/api/publications/${encodeURIComponent(id)}`,
    { signal },
  );
  if (!response.ok)
    throw new Error(`Publication unavailable (${response.status})`);
  const body = (await response.json()) as Publication;
  if (
    body?.id !== id ||
    !body.dataset ||
    !Array.isArray(body.dataset.members) ||
    !Array.isArray(body.dataset.votes) ||
    !Array.isArray(body.dataset.records) ||
    !Array.isArray(body.dataset.coverage) ||
    !body.dataset.rubric ||
    typeof body.dataset.asOf !== "string"
  )
    throw new Error(
      "Publication response does not match the requested archive",
    );
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(body.dataset)),
  );
  const digest = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== body.digest)
    throw new Error("Publication integrity check failed");
  await verifyPublicationScoring(body);
  return body;
}
const xml = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function reportSvg(
  data: Dataset,
  query: ReportQuery,
  publicationId?: string,
) {
  const result = executeReport(data, query);
  const rows = result.rows.slice(0, 30);
  const metadata = {
    datasetId: data.id,
    publicationId: publicationId ?? null,
    demo: data.demo,
    asOf: data.asOf,
    effectiveCutoff: result.cutoff,
    rubric: data.rubric,
    query: result.query,
    coverage: data.coverage,
    sources: result.sources,
    displayedMemberIds: rows.map((r) => r.member.id),
    totalResults: result.rows.length,
    membershipSemantics,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${205 + rows.length * 34}" role="img" aria-labelledby="title description"><title id="title">Surveillance reform alignment${data.demo ? " — fictional demo" : ""}</title><desc id="description">${xml(`Published evidence through ${result.cutoff}. Showing ${rows.length} of ${result.rows.length} results. Bars range from 0 to 100 percent. Exact query and source URLs are embedded in metadata.`)}</desc><metadata>${xml(JSON.stringify(metadata))}</metadata><rect width="100%" height="100%" fill="#fafbf7"/><g font-family="sans-serif" fill="#173f36"><text x="24" y="32" font-size="22">Surveillance reform alignment${data.demo ? " — FICTIONAL DEMO" : ""}</text><text x="24" y="57" font-size="12">${xml(`Dataset ${data.id} | Publication ${publicationId ?? "unpublished"}`)}</text><text x="24" y="78" font-size="11">${xml(`Rubric ${data.rubric.version}; issue: ${query.topic ?? "all"}; dates: ${query.from ?? "earliest"}–${result.cutoff}; context: ${query.context ?? "all"}`)}</text><text x="280" y="98" font-size="10">0%</text><text x="653" y="98" font-size="10">100%</text>${rows.map((r, i) => `<text x="24" y="${131 + i * 34}" font-size="13">${xml(r.member.name)}</text><rect x="280" y="${116 + i * 34}" width="400" height="20" fill="#edf1ea"/><rect x="280" y="${116 + i * 34}" width="${(r.score.value ?? 0) * 4}" height="20" fill="#8ab798"/><text x="700" y="${131 + i * 34}" font-size="12">${r.score.value === null ? "Insufficient evidence" : Math.round(r.score.value) + "%"} (${r.score.counted} votes)</text>`).join("")}<text x="24" y="${163 + rows.length * 34}" font-size="11">${xml(`Showing ${rows.length} of ${result.rows.length}. Exact query, rubric, and original sources embedded in SVG metadata.`)}</text></g></svg>`;
}
export function publicationChanges(
  before: Publication,
  after: Publication,
  memberId: string,
) {
  const a = before.dataset,
    b = after.dataset;
  const oldMember = a.members.find((m) => m.id === memberId),
    newMember = b.members.find((m) => m.id === memberId);
  const relevant = (data: Dataset) =>
    data.records
      .filter((r) => r.memberId === memberId)
      .map((r) => ({
        record: r,
        vote: data.votes.find((v) => v.id === r.voteId),
      }))
      .sort((x, y) => x.record.voteId.localeCompare(y.record.voteId));
  const rubricChanged = JSON.stringify(a.rubric) !== JSON.stringify(b.rubric);
  const evidenceChanged =
    JSON.stringify(relevant(a)) !== JSON.stringify(relevant(b));
  return {
    rubricChanged,
    evidenceChanged,
    asOfChanged: a.asOf !== b.asOf,
    memberChanged: JSON.stringify(oldMember) !== JSON.stringify(newMember),
    before: oldMember ? publishedScore(before, oldMember) : null,
    after: newMember ? publishedScore(after, newMember) : null,
    explanation: [
      rubricChanged ? "The scoring methodology changed." : "",
      evidenceChanged
        ? "Vote evidence or its editorial interpretation changed; this may include corrections, not new behavior."
        : "",
      a.asOf !== b.asOf ? "The publication date cutoff changed." : "",
      !oldMember || !newMember
        ? "The member is absent from one publication."
        : "",
      !rubricChanged && !evidenceChanged && a.asOf === b.asOf
        ? "No scoring evidence, rubric, or date cutoff change."
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
