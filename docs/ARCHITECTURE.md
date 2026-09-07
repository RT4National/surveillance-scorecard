# Production architecture

## Deployed preview

Vite compiles React to static files. Wrangler uploads `dist/`. `_redirects` resolves the known scorecard routes to the app shell; compiled JS and CSS live below `/scorecard/assets/`. There is no external runtime service, tracking, browser API key, data mutation endpoint, or database in this preview.

Cloudflare references consulted September 7, 2026:

- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/
- https://developers.cloudflare.com/workers/wrangler/configuration/

Use only the `restorethe4th.com/scorecard` and `restorethe4th.com/scorecard/*` route patterns on the intended zone. Do not attach this project as a custom domain over the whole existing site. Test route precedence and trailing slashes in staging first. Account and route configuration are intentionally absent from the preview. Cloudflare deployment has not been performed.

## Production services (planned, not provisioned)

| Service                   | Responsibility                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Worker + static assets    | Public pages, read API, parameterized research queries; SSR/profile metadata for permanent links                                        |
| D1                        | Members, dated terms, party histories, memberships, bills, exact roll calls, votes, versioned rubrics and immutable publication records |
| R2                        | Licensed portraits with metadata; immutable raw source captures and publication exports                                                 |
| Scheduled Worker / Queues | Fetch and reconcile updates, retry failed batches, stage changes for review                                                             |
| Cloudflare Access         | Protect editorial UI; verify JWT signature, issuer and audience server-side, enforce editor/reviewer roles                              |
| Workers AI                | Parse natural language into a bounded research query; never calculate or publish grades                                                 |

## Data contracts

Use Bioguide ID for legislator identity; retain name aliases and stable IDs when people change office or name. A term has start/end, chamber, state, district, party and provenance. A caucus/committee membership has start/end and independent source freshness. Being absent from one fetch must not mark a member inactive: only a complete, reviewed reconciliation may change status. Deceased status is explicit and distinct from inactivity. Keep historical memberships while hiding defunct committees from current filtering.

Use Congress.gov as the primary source (https://github.com/LibraryOfCongress/api.congress.gov). API access needs a key, stored as a Worker secret. Bill identity alone is insufficient: a roll call also needs chamber, Congress, session, date and vote number. Use House Clerk and Senate official vote records when Congress.gov does not supply the required historical or individual vote coverage. Never assume a bill's passage identifies every member's vote. Caucus membership may require additional primary sources and manual review.

Each evidence row needs source URL, fetched-at time, source content digest, event date, reviewed reform direction, weight and reviewer attribution. Validate uniqueness of member/roll-call pairs, outcomes, chamber eligibility, chronology, and source completeness before staging a publication. Cosponsorships need their own event type and scoring policy; do not silently reinterpret them as votes.

Store immutable publication versions binding the complete source set, rubric JSON/digest, scores, explanations and publication date. Archive links select a publication ID. Corrections create a new publication; they never rewrite old scores. Compare original published scores separately from recomputation under a new rubric.

Wikipedia can contain fair-use images. Require a Commons file or another individually verified reusable source, license identifier, author, attribution text and source link. Cache approved assets in R2; do not load visitors' portraits from third-party tracking hosts.

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
