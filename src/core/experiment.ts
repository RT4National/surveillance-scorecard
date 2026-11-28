import type { Dataset } from "./publication";
import { defaultGradeBands, scoreMember, validateRubric } from "./scoring";
import type { Group, Member, RecordEntry, Rubric, Vote } from "./types";

/**
 * A what-if run against a published dataset: rubric changes plus per-vote overrides.
 * Shared by the experiment CLI so agents and the Rubric Lab score with the same code.
 */
export interface VoteOverride {
  reformVote?: "Yes" | "No";
  weight?: number;
  exclude?: boolean;
}
export interface Experiment {
  name?: string;
  rubric: Partial<Rubric>;
  votes: Record<string, VoteOverride>;
  filter: {
    chamber?: Member["chamber"];
    party?: Member["party"];
    status?: Member["status"];
  };
}
type Snapshot = Pick<
  ReturnType<typeof scoreMember>,
  "value" | "grade" | "group" | "counted" | "ownScore" | "otherScore"
>;
export interface ExperimentRow {
  id: string;
  name: string;
  party: Member["party"];
  state: string;
  chamber: Member["chamber"];
  before: Snapshot;
  after: Snapshot;
  delta: number | null;
}
interface Totals {
  groups: Record<Group, number>;
  grades: Record<string, number>;
}
export interface ExperimentResult {
  name: string;
  datasetId: string;
  demo: boolean;
  rubricBefore: Rubric;
  rubricAfter: Rubric;
  members: number;
  before: Totals;
  after: Totals;
  rows: ExperimentRow[];
  changed: ExperimentRow[];
}

const RUBRIC_KEYS: (keyof Rubric)[] = [
  "version",
  "minVotes",
  "minPerContext",
  "consistencyThreshold",
  "gradeBands",
  "lookbackYears",
  "halfLifeYears",
  "minSharedTopics",
];
function plain(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${what} must be an object`);
  return value as Record<string, unknown>;
}
function only(obj: Record<string, unknown>, keys: string[], what: string) {
  for (const k of Object.keys(obj))
    if (!keys.includes(k)) throw new Error(`Unknown field ${what}.${k}`);
}

/** Strict parse: a typo in an agent-written file should fail, not silently do nothing. */
export function parseExperiment(input: unknown): Experiment {
  const raw = plain(input, "Experiment");
  only(raw, ["name", "rubric", "votes", "filter"], "experiment");
  if (raw.name !== undefined && typeof raw.name !== "string")
    throw new Error("experiment.name must be a string");
  const rubric = plain(raw.rubric ?? {}, "experiment.rubric");
  only(rubric, RUBRIC_KEYS, "rubric");
  const votes: Record<string, VoteOverride> = {};
  for (const [id, value] of Object.entries(
    plain(raw.votes ?? {}, "experiment.votes"),
  )) {
    const o = plain(value, `votes.${id}`);
    only(o, ["reformVote", "weight", "exclude"], `votes.${id}`);
    if (
      o.reformVote !== undefined &&
      o.reformVote !== "Yes" &&
      o.reformVote !== "No"
    )
      throw new Error(`votes.${id}.reformVote must be "Yes" or "No"`);
    if (
      o.weight !== undefined &&
      (typeof o.weight !== "number" ||
        !Number.isFinite(o.weight) ||
        o.weight <= 0)
    )
      throw new Error(`votes.${id}.weight must be a positive number`);
    if (o.exclude !== undefined && typeof o.exclude !== "boolean")
      throw new Error(`votes.${id}.exclude must be true or false`);
    votes[id] = o as VoteOverride;
  }
  const filter = plain(raw.filter ?? {}, "experiment.filter");
  only(filter, ["chamber", "party", "status"], "filter");
  return {
    ...(raw.name ? { name: raw.name as string } : {}),
    rubric: rubric as Partial<Rubric>,
    votes,
    filter: filter as Experiment["filter"],
  };
}

function totals(rows: Snapshot[], bands: { label: string }[]): Totals {
  const groups: Record<Group, number> = {
    reformer: 0,
    mixed: 0,
    unproven: 0,
    surveillance: 0,
  };
  const grades: Record<string, number> = Object.fromEntries(
    [...bands.map((b) => b.label), "—"].map((l) => [l, 0]),
  );
  for (const r of rows) {
    groups[r.group]++;
    grades[r.grade] = (grades[r.grade] ?? 0) + 1;
  }
  return { groups, grades };
}
const snap = (s: ReturnType<typeof scoreMember>): Snapshot => ({
  value: s.value,
  grade: s.grade,
  group: s.group,
  counted: s.counted,
  ownScore: s.ownScore,
  otherScore: s.otherScore,
});

export function runExperiment(
  dataset: Dataset,
  experiment: Experiment,
): ExperimentResult {
  const rubricAfter: Rubric = {
    ...dataset.rubric,
    version: `${dataset.rubric.version}+experiment`,
    ...experiment.rubric,
  };
  validateRubric(rubricAfter);
  const known = new Set(dataset.votes.map((v) => v.id));
  for (const id of Object.keys(experiment.votes))
    if (!known.has(id)) throw new Error(`Unknown vote ${id}`);
  const excluded = new Set(
    Object.entries(experiment.votes)
      .filter(([, o]) => o.exclude)
      .map(([id]) => id),
  );
  const votesAfter: Vote[] = dataset.votes
    .filter((v) => !excluded.has(v.id))
    .map((v) => {
      const o = experiment.votes[v.id];
      return o
        ? {
            ...v,
            ...(o.reformVote ? { reformVote: o.reformVote } : {}),
            ...(o.weight ? { weight: o.weight } : {}),
          }
        : v;
    });
  const byMember = new Map<string, RecordEntry[]>();
  for (const r of dataset.records) {
    const list = byMember.get(r.memberId);
    if (list) list.push(r);
    else byMember.set(r.memberId, [r]);
  }
  const { chamber, party, status } = experiment.filter;
  const members = dataset.members.filter(
    (m) =>
      (!chamber || m.chamber === chamber) &&
      (!party || m.party === party) &&
      (!status || m.status === status),
  );
  const rows: ExperimentRow[] = members.map((m) => {
    const own = byMember.get(m.id) ?? [];
    const before = snap(
      scoreMember(m, dataset.votes, own, dataset.rubric, dataset.asOf),
    );
    const after = snap(
      scoreMember(
        m,
        votesAfter,
        own.filter((r) => !excluded.has(r.voteId)),
        rubricAfter,
        dataset.asOf,
      ),
    );
    return {
      id: m.id,
      name: m.name,
      party: m.party,
      state: m.state,
      chamber: m.chamber,
      before,
      after,
      delta:
        before.value !== null && after.value !== null
          ? after.value - before.value
          : null,
    };
  });
  const changed = rows
    .filter(
      (r) =>
        r.before.grade !== r.after.grade || r.before.group !== r.after.group,
    )
    .sort(
      (a, b) =>
        Math.abs(b.delta ?? 101) - Math.abs(a.delta ?? 101) ||
        a.name.localeCompare(b.name),
    );
  return {
    name: experiment.name ?? "experiment",
    datasetId: dataset.id,
    demo: dataset.demo,
    rubricBefore: dataset.rubric,
    rubricAfter,
    members: rows.length,
    before: totals(
      rows.map((r) => r.before),
      dataset.rubric.gradeBands ?? defaultGradeBands,
    ),
    after: totals(
      rows.map((r) => r.after),
      rubricAfter.gradeBands ?? defaultGradeBands,
    ),
    rows,
    changed,
  };
}
