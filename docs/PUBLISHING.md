# Editorial publishing and operations

The Cloudflare Worker serves the application under `/scorecard` and the JSON API under `/scorecard/api`. D1 stores complete drafts, immutable publications, the audited current-publication pointer, corrections, and short-lived abuse counters. No cloud resources have been provisioned by this implementation. The checked-in database UUID is deliberately a placeholder.

## Local qualification

Run `npm run build`, `npx wrangler d1 migrations apply surveillance-scorecard --local`, then `npx wrangler dev --local`. Where the machine restricts Wrangler's default log directory, prefix commands with `WRANGLER_LOG_PATH=/tmp/scorecard-wrangler.log`.

`npx vitest run worker/publishing.test.ts` exercises real local D1 via Miniflare and verifies independent review, optimistic concurrency, immutable snapshots, audited pointer changes, correction limits, and cryptographic Access token validation. Test identities are mocked only in workflow tests; separate RSA-signed fixtures test authentication. There is no local HTTP authentication bypass.

Generate binding types after changing configuration with `npx wrangler types worker/env.d.ts --strict-vars=false`. Do not edit generated `Env` types. The Worker and static application are both typechecked by the root TypeScript configuration.

## Authentication and deployment configuration

1. Create separate staging and production D1 databases. Replace the placeholder ID in the appropriate deployment configuration and apply migrations to that specific database. Never use a live database for fixtures.
2. Configure a Cloudflare Access self-hosted application covering `/scorecard/editor*` and `/scorecard/api/staff/*`. Set `ACCESS_ISSUER` to the exact `https://TEAM.cloudflareaccess.com` issuer and `ACCESS_AUDIENCE` to its application audience.
3. Set `STAFF_ROLES` to a JSON email-to-role map, for example `{"editor@example.org":"editor","reviewer@example.org":"reviewer","publisher@example.org":"publisher"}`. This is a deployment-managed allowlist; browser-supplied roles are never accepted. An editor stages and edits; reviewer/publisher can approve another person's draft; only publisher can publish or change the current pointer. All staff may handle corrections.
4. Configure the production Worker route narrowly to the host's `/scorecard*` paths. This Worker does not proxy or replace the organization's other website routes. Asset files live under `/scorecard/assets`. Test `/scorecard`, all detail links, archival links, and unrelated website routes on staging before activating the route.
5. The default local environment has no AI binding and keeps `AI_MODEL` empty. The explicit `production` environment has the optional AI binding/model configuration and its own database placeholder; use `--env production` only after that environment is configured and budgeted. Disabled requests fail explicitly; no generated answers replace deterministic evidence queries.
6. Run the full test/build suite and `npx wrangler deploy --dry-run`. After deployment, confirm unauthenticated staff writes return 401, authorized staff identity/role mapping works, valid detail pages return 200 and unknown IDs return 404, and an archived publication retains its digest after a new publication.

The Worker verifies RS256 signatures against the issuer's Access JWKS, the exact issuer and audience, expiry/issue time, and a configured email role. Missing auth configuration fails closed. There is no development flag or deployed hostname that disables signature verification. Same-origin JSON is required for writes when an Origin header is present; cross-origin writes fail.

## Editorial workflow

Use the editor's import control to load an ingestion-produced Dataset JSON file or clone an existing publication into a new correction draft. Importing does not publish anything. Structured fields support vote selection and creation, rationale, weights, source links, recorded member outcomes and party at the vote, scoring-policy parameters and grade bands, member details, committee/caucus lists, and portrait rights review. Inspect the per-member grade preview before saving. Advanced JSON import/edit/export remains available for full dataset interchange and sourced affiliation histories. Review and publish buttons are disabled while form changes are unsaved.

Every save increments the version and clears approval. Another staff member reviews the saved draft. A publisher then publishes that reviewed version. Dataset validation checks unique member/vote IDs, valid referenced evidence, outcomes and party values, source capture digests, vote dates, weights, rationale, rubric constraints, and explicit demo status. Known fictional identifiers cannot be relabeled live. This structural validation does not establish that a source or editorial claim is truthful; source reconciliation and human review remain required.

Each draft records the exact current publication acknowledged at creation (`basePublicationId`, explicitly `null` only before any publication). If another draft is published, the earlier draft cannot be saved, approved, or published over it. Refresh the current comparison, reconcile the retained draft against current evidence, then explicitly rebase the saved draft. Rebase retains draft contents, records the prior/new base in the audit, increments the draft version and clears review. It does not merge datasets automatically. Drafts created before migration `0002_draft_base.sql` conservatively require rebasing when a current publication exists.

Every live vote must point to an official congressional HTTPS source and an exactly matching `votes` source capture. Public URLs must omit credentials and token/API-key query parameters. Cached portrait paths under `/scorecard/portraits/` are accepted with complete rights-review metadata. Sourced affiliation intervals are preserved; overlapping histories and a recorded party that contradicts exact-day history are refused. Cross-chamber ballots require an exact-day historical term covering the vote. Coarse year-only terms are retained as chronology but cannot alone establish vote-day service; enriching those boundaries is a review task, not an automatic date inference.

Publishing is one conditional SQL insert; database triggers transition the draft, update the pointer, and write the audit within the same transaction. A competing edit or publication returns 409. Each publication contains the complete Dataset and rubric plus publication metadata. `digest` is SHA-256 of `JSON.stringify(dataset)` as stored, so consumers must preserve serialized field order when checking it; it is a content checksum, not an attestation signature. Database triggers reject updates/deletes of published snapshots and audit events.

New publications also preserve `scoring: {version:'1', scores, digest}`. The `scores` map contains the complete score, grade, classification, explanation, evidence and weighting for every member at the publication cutoff. Evidence stores vote IDs rather than repeating each full vote object; `publishedScore` restores those objects from the same frozen Dataset. Its SHA-256 checksum covers `JSON.stringify(scores)` separately from the Dataset checksum. Loading boundaries must call `verifyPublicationScoring` after Dataset integrity verification and fail closed on malformed, incomplete, unknown-version or mismatched scoring snapshots. `publishedScore` uses these frozen results only at the original cutoff. A different requested cutoff or a legacy publication without `scoring` explicitly uses the current scoring engine and must be presented as recalculation. Future releases must preserve existing snapshots and verification compatibility rather than silently regrading archives; changes to the stored format require a new version and an intentional reader migration. A checksum proves internal consistency, not publisher identity.

The D1-backed publication format deliberately caps the complete serialized Publication at **1,800,000 UTF-8 bytes**. Publishing a larger snapshot returns an explicit 413 before insertion and leaves the current publication unchanged. This limit includes the Dataset, metadata, and compact frozen scores. Qualify production datasets at realistic roster/evidence sizes; larger or multi-decade datasets require a bounded evidence period or a separately implemented snapshot-storage design. This implementation does not claim unlimited archive payload capacity, and it never silently truncates evidence to fit.

Rollback selects an existing publication ID using the current pointer revision and an explanatory reason. It creates an audit event and increments the pointer revision without changing any publication. Operational staff may change code/database infrastructure, so application immutability is not a claim against privileged database administrators.

## API contract

All responses are JSON with `Cache-Control: no-store`. Failures include `{error}` and validation errors include `errors`. Important status codes: 401 identity required/invalid; 403 role or independent review failure; 409 stale edit/pointer/state; 422 invalid dataset; 429 correction limit; 503 unavailable dependencies/configuration.

| Method and suffix                | Contract                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| GET `/publications/latest`       | Full Publication; 404 when none exists                                                    |
| GET `/publications`              | `{publications:[{id,createdAt,summary,digest,datasetId,previousId}]}`, newest 200         |
| GET `/publications/:id`          | Complete immutable Publication                                                            |
| POST `/corrections`              | `{publicationId,memberId?,voteId?,message}`; requires matching evidence, returns `{id}`   |
| GET `/staff/session`             | Verified email and role                                                                   |
| GET `/staff/drafts`              | Latest 100 full drafts                                                                    |
| POST `/staff/drafts`             | `{dataset,summary,basePublicationId}` → `{id,version}`                                    |
| PUT `/staff/drafts/:id`          | `{dataset,summary,version,basePublicationId}` → new version; clears review                |
| POST `/staff/drafts/:id/rebase`  | `{version,basePublicationId}` → retained content on explicit current base, review cleared |
| POST `/staff/drafts/:id/review`  | `{version}`; independent reviewer                                                         |
| POST `/staff/drafts/:id/publish` | `{version}` → immutable Publication                                                       |
| POST `/staff/rollback`           | `{publicationId,revision,reason}`                                                         |
| GET `/staff/status`              | Current pointer/revision, demo status, dataset cutoff, source ages                        |
| GET `/staff/audit`               | Most recent 200 audit events                                                              |
| GET `/staff/corrections`         | Most recent 200 corrections                                                               |
| PATCH `/staff/corrections/:id`   | `{status:'resolved'                                                                       | 'dismissed',resolution}`; audited |

Corrections collect no name, email, or address. They are tied to an immutable publication and require at least one member or vote; paired evidence must actually exist. Message limits are 10–4000 characters; a D1 counter caps submissions at five per IP-derived hourly bucket, retained for approximately 24 hours. These pseudonymous abuse counters are not guaranteed anonymization. Shared IPs share limits. Add edge WAF/rate rules for high-volume attacks; application counters alone do not protect bandwidth or D1 capacity. Review staff should redact personal information accidentally included in freeform reports according to the organization's retention policy; no self-service deletion is currently implemented.

## Operational handoff

The status endpoint reports evidence freshness, not scheduler health. The included GitHub workflow stages a roster daily or on dispatch only when private-repository checks and the Congress API secret are configured; without them it explicitly skips. Preserve captures and reconciliation reports, alert on failures or missing roster records, and stage updates for editorial review. Choose and configure a monitoring destination before production: this repository does not send external alert messages.

Enable provider logs and alert on 5xx, ingestion failures and freshness outside the organization's chosen threshold. Do not log JWTs, raw correction messages or Access email allowlists. Cloudflare observability is enabled; Worker failures log only event/error class.

Before migration, take a D1 export to a protected operator location with `wrangler d1 export DATABASE --remote --output PATH`. Configure Cloudflare D1 recovery/retention for each environment and rehearse restoration to a separate database, verifying publication count, current pointer, snapshot digest, and audit history before switching the binding. Never restore over the only good database. Application pointer rollback handles editorial mistakes; Worker version rollback handles code regressions; database restoration handles data/infrastructure loss. These are separate operations and need separate qualification.

Live Access configuration, independently reviewed congressional evidence, backups/recovery drills, ingestion schedules, alert destinations and staging-to-production smoke tests remain deployment prerequisites. Local fixture tests do not establish these operational properties.

References: [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [D1 database API and batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Access JWT verification](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).
