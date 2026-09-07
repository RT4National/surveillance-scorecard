# Surveillance scorecard: implementation plan

## Inputs

- User recordings: `Sep 6 at 12-24 PM.m4a` (4:10) and `Sep 7 at 9-28 AM.m4a` (4:23), transcribed locally with faster-whisper base.en on September 7, 2026. The following are paraphrases, not certified transcripts.
- Inspiration: https://github.com/RT4National/DecideTheFuture, inspected September 7, 2026. Rails 5.2 / React on Rails, Heroku, browser-side Google Sheets data and scoring. Preserve searchable records, vote-level explanations, and explicit methodology. User confirmed authorization to reuse all original code on September 7, 2026. This first implementation uses new code and fictional records.

## User stories and acceptance criteria

| Recording        | Story                                                     | Acceptance                                                                                                                                        |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sep 6, 0:00–0:25 | As chair, host inside Restore the Fourth                  | Every route and asset works under `/scorecard`; existing site remains outside this route.                                                         |
| Sep 6, 0:25–0:54 | Current House and Senate roster                           | Source timestamps, stable Bioguide IDs, active-status reconciliation, review of vacancies.                                                        |
| Sep 6, 0:54–1:56 | Transparent letter grades without cumulative polarization | Deterministic, versioned rubric; show numerator, denominator, excluded records and thresholds.                                                    |
| Sep 6, 1:56–4:09 | Three groups based on presidential party                  | Separate grade from consistency; compare own-party versus opposing-party evidence; new members start conditional/unproven.                        |
| Sep 7, 0:00–0:51 | Maintain member status and memberships                    | Separate active, inactive and deceased; remove defunct Weaponization membership from current filters while retaining historical evidence.         |
| Sep 7, 0:57–1:29 | Reusable headshots                                        | Prefer Commons/Wikipedia provenance; retain each file's author, license, source and attribution. Wikipedia presence alone is not a reuse license. |
| Sep 7, 1:29–2:04 | Better search and distributable profile URLs              | Search by normalized name/state, independent filters, stable member URLs, URL-based state.                                                        |
| Sep 7, 2:04–2:44 | Historical profile archives                               | Immutable published snapshots; show grade and rubric at the time, particularly presidential transitions.                                          |
| Sep 7, 2:44–3:57 | Freeform AI research, Congress.gov by default             | Translate questions into validated structured queries; exact vote intersections and party rankings; citations and explicit data coverage.         |
| Sep 7, 3:57–4:12 | Copyable graphs and tables                                | Table copy, CSV download, SVG chart export, shareable filtered URLs.                                                                              |
| Sep 7, 4:12–4:22 | Open licensing (“CCBYA”)                                  | Interpreted provisionally as CC BY 4.0; confirm exact license. Third-party material retains its own terms.                                        |

## Delivery stages

1. **Working design preview:** responsive React/TypeScript application, fictional fixtures, permanent profiles, date-based historical exploration, normalized scorer, party-context classification, filter/search, research query builder, exports and interactive rubric inspection. Cloudflare Workers Static Assets build and route verification. No credentials needed.
2. **Production data and editorial workflow:** Congress.gov ingestion with a server-side API key; House Clerk/Senate roll calls where necessary; current and historical member terms, memberships and reviewed image licenses; D1 evidence storage; immutable publication versions; Access-protected editor and reviewer roles. Proposed scores must be reviewed before publication.
3. **Grounded AI research:** Workers AI translates natural language into an allowlisted query schema. The server validates identifiers and executes parameterized queries. AI never assigns grades, invents citations, or executes arbitrary SQL. Answer includes dataset version, matched evidence, and coverage.
4. **Launch:** reconcile complete roster against official directories; approve rubric and license; review accessibility; configure only `/scorecard` and `/scorecard/*` on the existing domain; protect editor routes; exercise rollback; publish.

## Proposed scoring decision

Score = 100 × weighted reform-aligned votes / weighted cast votes. “Not voting” and “Not eligible” are excluded and displayed. Three cast votes are required for a letter grade. Repeating an identical distribution does not inflate a grade. This does not force a bell curve or guarantee a middle category: observed votes determine the distribution.

An independently calculated consistency category requires at least two scored votes with a president of the member's party at the time of the vote, and two with a president of a different party. At least 75% alignment in both contexts means consistent reformer; at most 25% in both means consistent surveillance supporter. Everyone else is conditional/unproven, with evidence insufficiency distinguished from an observed mixed record. Independent members require an explicit editorial caucus/alignment policy before they can establish an own-party context; the preview conservatively keeps them unproven.

Open editorial decisions: thresholds, lookback windows/recency, bill weighting, abstentions, co-sponsorship weighting, independents, party changes, and whether deceased profiles should remain publicly archived. Preview preserves deceased records separately rather than deleting them. Historical recalculation in the preview is explicitly not a substitute for immutable historical publications.
