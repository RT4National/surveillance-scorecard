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
- All 102 tests pass across 14 suites, exercising scoring policy, query scope, source adapters, signed Access JWT checks, publication loading, structured editing, compressed storage, pinned navigation and real local D1 workflow/immutability. Production build passes; CI also runs the actual local Worker capacity harness.
- Private staging recovered all 23 official roll calls linked by the pinned legacy implementation: 12 House files with 5,204 normalized ballots and 11 Senate files with 1,100 raw ballots. Current public directories and unresolved historical identities are retained for review. No real grades were published; see [real-data staging](REAL-DATA-STAGING.md).
- Local D1 contains two explicitly fictional published snapshots for UI verification.
- Exported local D1 to SQL, restored into a separate SQLite database, verified two publications, pointer `demo-publication-2`, and SQLite `integrity_check = ok`. This is a local restore rehearsal, not production disaster-recovery qualification.
- A second fresh database applied both migrations and seeded compact frozen scores. SQLite backup to a separate database preserved two publications, the current pointer and both migrations; dataset and frozen-score digests verified after restoration. Wrangler export does not accept a custom `--persist-to` directory, so this second isolated rehearsal used SQLite backup instead.
- Fresh desktop and 390 px mobile browser checks covered profiles, research, comparisons, archives, state finding and policy simulation. Final rebuilt navigation preserved publication IDs and source anchors. Full accessibility, authenticated Access UI and large-payload mobile performance remain unqualified; see [bounded qualification](QUALIFICATION.md).

## Deliberate boundaries

No automatic classification of missing members as retired/deceased. No inference that Wikipedia image inclusion grants reuse. No execution of model-generated SQL or model-generated grades. No silent fixture fallback when the publication API fails. No mutable historical publication. No public cloud deployment until account, data, editorial policy and route configuration are supplied.

Address-to-district lookup is intentionally replaced with a state finder until a geocoding provider and address-retention policy are chosen. Non-voting delegates, exact historic service intervals, independent party alignment and co-sponsorship scoring require explicit policy/data treatment; unsupported cases are retained or rejected for review rather than guessed.

Draft requests are bounded at 12 MB; versioned compressed storage allows at most 32 MB expanded and 1.8 MB encoded per D1 payload. Review preflights the prospective frozen publication before approving a draft. The actual local Worker passed synthetic 535-member workflows at 12, 50 and 250 roll calls; this is not an edge load or memory-headroom certification. Larger evidence collections may require partitioned/object-backed storage; see [capacity evidence](CAPACITY.md). AI catalog translation is separately capped at 250 votes and 1,000 members, with structured research available beyond that catalog limit.

Cloudflare's saved login could not refresh, and no Congress API credential was configured. Private cloud staging, authoritative roster reconciliation and editorial approval remain external gates.
