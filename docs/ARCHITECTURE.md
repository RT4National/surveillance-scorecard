# Production architecture

## Implemented application

Vite compiles React to static files. The Worker serves known `/scorecard` routes, publication-aware profile metadata and API requests. D1 holds drafts, immutable publications, the current publication pointer, audit history, corrections and abuse counters. Compiled JS and CSS live below `/scorecard/assets/`. The browser loads one explicit publication and verifies its dataset checksum; API failure does not silently display demonstration evidence.

Large Dataset/Publication values use versioned gzip/base64 envelopes in the existing D1 columns, with bounded expansion, checksums and queryable metadata. Small and legacy inline JSON remain readable. Public APIs retain their original decoded contracts; staff lists return summaries and fetch a full draft only when selected. Storage bounds and actual local Workers runtime qualification are documented in [CAPACITY.md](CAPACITY.md); production memory, CPU and concurrency still require measurement on the chosen account.

Cloudflare references consulted September 7, 2026:

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/
- https://developers.cloudflare.com/workers/wrangler/configuration/

Use only the `restorethe4th.com/scorecard` and `restorethe4th.com/scorecard/*` route patterns on the intended zone. Do not attach this project as a custom domain over the whole existing site. Test route precedence and trailing slashes in staging first. Account and route configuration are intentionally absent from the preview. Cloudflare deployment has not been performed.

## Services and provisioning boundaries

| Service                 | Responsibility                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker + static assets  | Public pages, read API, parameterized research queries; SSR/profile metadata for permanent links                                                                              |
| D1                      | Members, dated terms, party histories, memberships, bills, exact roll calls, votes, versioned rubrics and immutable publication records                                       |
| Source/portrait staging | Implemented CLIs retain exact captures and reviewed portrait files. Approved portraits are served as static assets; long-term R2 storage is an optional deployment extension. |
| Scheduled ingestion     | GitHub Actions stages complete roster captures daily or on dispatch, skips explicitly without credentials, and never publishes automatically.                                 |
| Cloudflare Access       | Protect editorial UI; verify JWT signature, issuer and audience server-side, enforce editor/reviewer roles                                                                    |
| Workers AI              | Implemented optional production binding translates natural language into validated queries; deterministic code calculates results. Live inference is not yet qualified.       |

## Data contracts

Bioguide ID provides legislator identity. Sourced affiliation intervals retain terms, party and committee/caucus history; year-precision intervals do not establish exact transition days. Being absent from one fetch does not mark a member inactive: a complete, reviewed reconciliation is required. Deceased status is explicit and distinct from inactivity. Historical memberships remain available independently of current filtering. Name-alias expansion and external address lookup remain optional enhancements.

Use Congress.gov as the primary source (https://github.com/LibraryOfCongress/api.congress.gov). API access needs a key, stored as a repository Actions secret for scheduled staging or a local environment variable for the CLI. Bill identity alone is insufficient: a roll call also needs chamber, Congress, session, date and vote number. Use House Clerk and Senate official vote records when Congress.gov does not supply the required historical or individual vote coverage. Never assume a bill's passage identifies every member's vote. Caucus membership may require additional primary sources and manual review.

Each evidence row needs source URL, fetched-at time, source content digest, event date, reviewed reform direction, weight and reviewer attribution. Validate uniqueness of member/roll-call pairs, outcomes, chamber eligibility, chronology, and source completeness before staging a publication. Cosponsorships need their own event type and scoring policy; do not silently reinterpret them as votes.

Immutable publication versions bind the complete source set, rubric JSON/digest and publication cutoff. New publications also freeze complete per-member scoring results with a scorer version and checksum. Archive links select a publication ID and display those frozen results; alternate date cutoffs and filtered research explicitly recalculate from the selected evidence. Legacy snapshots without frozen results retain the old recalculation behavior. Corrections create a new publication and never overwrite its predecessor. Comparison explains changed evidence versus changed rubric or cutoff. Preserve release artifacts and introduce a new scorer version before changing scoring semantics.

Wikipedia can contain fair-use images. Require an individually verified reusable source, rights status, author/attribution text and rights source link. Cache approved assets under `/scorecard/portraits/`; optional R2 storage is a deployment extension. Do not load visitors' portraits from third-party tracking hosts.

## Research contract

An AI request produces only a validated query object: ranking or intersection, known party/chamber filters, exact event IDs, outcomes, date range and bounded limit. Bill names with multiple matches require disambiguation. Independent members must have an explicit handling policy in party comparisons. The execution layer owns SQL, score calculation and sorting. The answer includes query, dataset/publication version, methodology version, rows, matched source links and coverage caveats. Rate-limit and cap request size/model cost; never send admin notes or visitor identity to the model.

## Launch acceptance

1. Reconcile the complete active roster, vacancies, nonvoting delegates and memberships with dated official sources.
2. Approve rubric, independent alignment policy, historical scope, deceased-profile policy and exact license.
3. Review image attribution and copyable data/graph attribution.
4. Ingest historical votes and publish immutable versions; verify a presidential transition comparison manually.
5. Verify ingestion failures cannot replace a complete publication with partial data.
6. Test public accessibility, mobile layouts, real 404s, metadata, rate limits and editor authorization.
7. Configure the Cloudflare account, staging route and production subpath. Verify the existing site outside the route.
8. Remove preview markers and noindex only after all real data and scoring are reviewed; exercise publication and deployment rollback.
