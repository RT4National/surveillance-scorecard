import type { Dataset } from "../../core/publication";
import { reconcileRoster, type RosterRun } from "../../ingestion/members";

export function previewRoster(draft: Dataset, run: RosterRun) {
  const existing = new Map(draft.members.map((member) => [member.id, member]));
  // Imported year-precision terms are useful for new members. Existing history may
  // contain more precise terms, so the scheduled roster leaves it for staff review.
  const proposal = reconcileRoster(draft, {
    ...run,
    affiliations: run.affiliations.filter((row) => !existing.has(row.memberId)),
  });
  const stagedIds = new Set(run.members.map((member) => member.id));
  const members = proposal.dataset.members.map(
    (member): Dataset["members"][number] => {
      if (!stagedIds.has(member.id) || member.chamber !== "Senate")
        return member;
      const { district: _district, ...senator } = member;
      return senator;
    },
  );
  const added = members.filter((member) => !existing.has(member.id));
  const changed = members.filter((member) => {
    const previous = existing.get(member.id);
    return (
      previous &&
      (
        [
          "name",
          "chamber",
          "party",
          "state",
          "district",
          "since",
          "status",
        ] as const
      ).some((field) => previous[field] !== member[field])
    );
  });
  const sources = [
    ...new Map(
      proposal.dataset.sources.map((source) => [
        `${source.url}\n${source.sha256}`,
        source,
      ]),
    ).values(),
  ];
  return {
    added,
    changed,
    missing: proposal.missingMemberIds.map((id) => existing.get(id)!.name),
    dataset: {
      ...proposal.dataset,
      id: draft.id,
      asOf: draft.asOf,
      members,
      sources,
      coverage: [...new Set(proposal.dataset.coverage)],
    },
  };
}
