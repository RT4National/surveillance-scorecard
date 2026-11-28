# Working with the scorecard from an AI agent

This guide is for people who want an AI agent (Claude Code, Codex, a custom script) to read the
scorecard, run scoring experiments, or prepare draft changes for human review. Agents can propose;
publishing always needs two named people.

Staging base URL: `https://restore-the-fourth-scorecard-staging.zaki-0c1.workers.dev`

Staging data is a demo: the members, votes and records are real, but every vote direction
("is YES good for privacy?") is an unreviewed placeholder. Do not quote staging grades as
Restore the Fourth's positions.

## 1. Read the data (no key needed)

| Request | Returns |
| --- | --- |
| `GET /scorecard/api/publications` | Up to 200 publications, newest first: `id`, `createdAt`, `summary`, `digest`, `datasetId`, `previousId` |
| `GET /scorecard/api/publications/latest` | The current publication (about 6 MB of JSON) |
| `GET /scorecard/api/publications/<id>` | A specific historical publication; publications never change once published |

A publication is `{ id, createdAt, publishedBy, previousId, summary, digest, dataset, scoring }`.
The `dataset` holds everything needed to recompute grades:

- `members[]`: `id` (Bioguide ID), `name`, `party`, `state`, `chamber`, `district`, `status`,
  `committees[]`, `caucuses[]`, `since`, optional `portrait`
- `votes[]`: scored items. `id`, `bill`, `title`, `date`, `chamber`, `presidentParty` (party of the
  president at the time), `reformVote` (`"Yes"` or `"No"`: the pro-privacy position), `weight`,
  `topic`, `rationale`, `source`, and `kind` (`"cosponsorship"` for bill support; absent for roll calls)
- `records[]`: `{ memberId, voteId, outcome, partyAtVote }`, where `outcome` is `Yes`, `No`,
  `Not voting` or `Not eligible`. Cosponsorship items only have `Yes` records for supporters.
- `rubric`: the grading rules (see below)
- `asOf`, `demo`, `sources[]`, `coverage[]` (known gaps), `affiliations[]`

`scoring.scores[memberId]` is the frozen result shown on the site.

## 2. How a grade is computed

Implemented in `src/core/scoring.ts` (`scoreMember`). Per member:

1. Take their `Yes`/`No` records (not voting and not eligible are ignored), optionally only within
   `lookbackYears`.
2. Each counted item contributes its `weight`, discounted by half every `halfLifeYears` if set.
3. Score = weighted share of items where the member's outcome equals `reformVote`, 0 to 100.
4. No grade (`—`) unless at least `minVotes` items count. Letter grades come from `gradeBands`
   (default A+ 97, A 90, B 80, C 65, D 50, F 0).
5. Category: the record is split into votes under a president of the member's own party and votes
   under the other party. With at least `minPerContext` in each (and `minSharedTopics` topics in
   common), a member scoring at least `consistencyThreshold` in both is a *consistent reformer*, at
   most `100 - consistencyThreshold` in both a *consistent surveillance supporter*, otherwise
   *mixed record*. Without enough evidence in both contexts the category is *not enough evidence*.

Rubric fields: `version`, `minVotes` (integer at least 1), `minPerContext` (integer at least 1),
`consistencyThreshold` (above 50, at most 100), optional `gradeBands`
(`[{label, minimum}]`, descending, last minimum 0), `lookbackYears`, `halfLifeYears`,
`minSharedTopics`.

## 3. Run an experiment

From a clone of `RT4National/surveillance-scorecard` (`npm install` once):

```sh
npm run experiment -- experiments/stricter-consistency.json
npm run experiment -- my-idea.json --json > result.json      # machine-readable
npm run experiment -- my-idea.json --publication saved.json  # offline, from a downloaded publication
echo '{"rubric":{"minVotes":5}}' | npm run experiment -- -    # from stdin
```

With no file it compares the current rules with themselves (no changes). By default it downloads the
latest staging publication. It uses the same `scoreMember` as the site, so results match the Rubric Lab.
Like the lab, "before" is recomputed from the publication's dataset and rules rather than read from
its frozen `scoring.scores`; the two agree unless the scoring code changes after a publication.

Experiment file (every field optional; unknown fields are rejected so typos fail loudly):

```json
{
  "name": "Short description of the idea",
  "rubric": { "consistencyThreshold": 85, "halfLifeYears": 8 },
  "votes": {
    "senate-118-1-342": { "reformVote": "No" },
    "house-118-2-114": { "weight": 3 },
    "cosponsor-118-s-686": { "exclude": true }
  },
  "filter": { "chamber": "Senate", "party": "Republican", "status": "active" }
}
```

- `rubric`: any rubric fields to override.
- `votes`: per-item overrides keyed by vote `id`: `reformVote`, `weight` (positive), `exclude`.
- `filter`: limit the report to a chamber, party or status. It does not change anyone's score.

Text output shows the rule changes, category and grade counts before and after, and the largest
changes. `--json` adds `rows` (every member before and after) and `changed` (members whose grade or
category moved, largest score movement first; members gaining or losing a grade come first).

Share an experiment by sharing its JSON file; anyone can rerun it against the same publication with
`--publication`.

## 4. Propose a change as a draft (staging)

Staging's staff API is open for collaboration. Identify yourself with a header instead of a login:

```
X-Staging-Staff: <your name>            (URL-encoded; stored as <name>@staging.invalid)
Content-Type: application/json
```

The name is URL-decoded, lowercased and reduced to letters, digits and hyphens (at most 40), so
`Jane Doe (agent)` is recorded as `jane-doe-agent@staging.invalid`. It only separates authors from
reviewers; it is not authentication. Requests without a name get 401.

| Request | Body | Notes |
| --- | --- | --- |
| `GET /scorecard/api/staff/drafts` | | Latest 100 drafts |
| `GET /scorecard/api/staff/drafts/<id>` | | Draft with full `dataset` and `version` |
| `POST /scorecard/api/staff/drafts` | `{ dataset, summary, basePublicationId }` | `basePublicationId` must be the current publication id |
| `PUT /scorecard/api/staff/drafts/<id>` | `{ dataset, summary, version, basePublicationId }` | `version` must match, or you get 409 and should reload |
| `POST /scorecard/api/staff/drafts/<id>/review` | `{ version }` | Approval; must be a different name from the author |
| `POST /scorecard/api/staff/drafts/<id>/publish` | `{ version }` | Only after review |
| `POST /scorecard/api/staff/drafts/<id>/rebase` | `{ version, basePublicationId }` | Move a draft onto a newer publication |

Rules an agent must follow:

- On staging, drafts must keep `dataset.demo: true`; anything else is refused.
- Change rules by editing `dataset.rubric`, vote directions and weights by editing `dataset.votes[]`.
  Start from `GET /publications/latest` and change only what you mean to.
- Write a `summary` a person can review: what changed, why, and the experiment output.
- Never approve your own draft under a second name. Review and publishing are for people.
- Production uses Cloudflare Access; there is no header shortcut there.

## 5. Report corrections

`POST /scorecard/api/corrections` with `{ publicationId, memberId?, voteId?, message }` files a reader
correction. At least one of `memberId` or `voteId` is required and must exist in that publication;
`message` is 10 to 4000 characters. Limited to 5 per hour per address. Staff see them in the
workspace's "Reader corrections" tab.
