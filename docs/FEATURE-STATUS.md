# Feature completeness and qualification

September 7, 2026. Three implementation agents plus root integration built the feature set described in the stakeholder discussion. “Implemented” describes tested application paths, not completed live deployment or editorial approval.

| Feature                 | Implementation                                                                                                                  | Remaining live prerequisite                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Authoritative roster    | Paginated Congress adapter, source captures, complete-run validation, reconciliation preserving absent members                  | Congress API key; official roster reconciliation                                        |
| Voting records          | House/Senate XML import, exact identifiers, totals checks, reviewed advocacy direction                                          | Selected historical roll calls, Senate LIS/Bioguide crosswalk, human source review      |
| Histories and portraits | Dated affiliations, preserved member metadata, rights-checked portrait cache staging                                            | Sourced supplemental intervals, individual portrait review and approved assets          |
| Legacy continuity       | Positional sheet migration and reviewed redirect mappings staged                                                                | Original sheet export and reviewed old-to-new paths                                     |
| Editorial workflow      | Structured forms, draft import/export, impact preview, independent review, publish, role checks, audit, stale-write refusal     | Access application and named editor/reviewer/publisher identities                       |
| Scoring policy          | Versioned grade bands, evidence minimums, lookback, decay, topic-comparability requirement, member and whole-roster impact lab  | Editorial approval of explicit policy; distribution testing on real evidence            |
| Archives                | D1 immutable evidence and frozen compact scores, pinned public URLs, client digest verification, before/after explanations      | Import/reconstruct actual historic publications where available                         |
| Public research         | Legislation pages, comparisons, issue/date/context queries, per-party rankings, attributed exports, representative finder       | Reviewed publication data                                                               |
| Natural language        | Workers AI JSON translation, strict query validation, deterministic execution, publication binding, request/model budget limits | Configured production Workers AI and live question-answer qualification                 |
| Corrections             | Evidence-bound form, limits, staff queue, resolution audit                                                                      | Organization retention policy and staff operations                                      |
| Operations              | CI, daily private ingestion staging, freshness status, narrow routing, noindex demo, recovery instructions                      | Production account/D1/routes, external alert destination, production recovery rehearsal |

## Local evidence

- Local official House 2025 roll call 003 import succeeded with 434 ballot records and retained source bytes. This does not establish live roster or full historical coverage.
- All 79 tests pass across nine suites, exercising scoring policy, query scope, source adapters, signed Access JWT checks, publication loading, structured editing and real local D1 workflow/immutability. Type generation, production build and default/production Cloudflare deployment dry runs pass.
- Local D1 contains two explicitly fictional published snapshots for UI verification.
- Exported local D1 to SQL, restored into a separate SQLite database, verified two publications, pointer `demo-publication-2`, and SQLite `integrity_check = ok`. This is a local restore rehearsal, not production disaster-recovery qualification.
- A second fresh database applied both migrations and seeded compact frozen scores. SQLite backup to a separate database preserved two publications, the current pointer and both migrations; dataset and frozen-score digests verified after restoration. Wrangler export does not accept a custom `--persist-to` directory, so this second isolated rehearsal used SQLite backup instead.
- Earlier browser checks covered publication-backed rendering, archive comparison and pinned navigation. Final-build browser navigation/DOM inspection timed out repeatedly; a fresh final visual/mobile check remains outstanding. Final HTTP checks passed for public routes, both archived identities, unknown-member 404 and unauthenticated staff 401.

## Deliberate boundaries

No automatic classification of missing members as retired/deceased. No inference that Wikipedia image inclusion grants reuse. No execution of model-generated SQL or model-generated grades. No silent fixture fallback when the publication API fails. No mutable historical publication. No public cloud deployment until account, data, editorial policy and route configuration are supplied.

Address-to-district lookup is intentionally replaced with a state finder until a geocoding provider and address-retention policy are chosen. Non-voting delegates, exact historic service intervals, independent party alignment and co-sponsorship scoring require explicit policy/data treatment; unsupported cases are retained or rejected for review rather than guessed.

Draft requests and complete published snapshots are bounded at 1,800,000 UTF-8 bytes. Larger evidence collections require partitioned/object-backed storage before adoption; production capacity must be qualified against the intended historical scope. AI catalog translation is separately capped at 250 votes and 1,000 members, with structured research available beyond that catalog limit.
