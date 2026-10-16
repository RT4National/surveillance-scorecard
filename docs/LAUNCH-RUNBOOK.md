# Launch runbook

October 13, 2026. Assembled from [PLAN](PLAN.md), [PUBLISHING](PUBLISHING.md), [DATA-PIPELINE](DATA-PIPELINE.md), [REAL-DATA-STAGING](REAL-DATA-STAGING.md) and [FEATURE-STATUS](FEATURE-STATUS.md), all dated September 7. Credential and account state has not been re-checked since then.

Stage 1 (design preview) is complete. Stages 2 and 3 are implemented and locally tested but not qualified against live services. This runbook moves the project through stage 4 (launch). Editorial decisions use placeholders so infrastructure and data work can proceed; placeholders are allowed on staging only.

## 0. Placeholder register

Every placeholder value contains the token `PLACEHOLDER-`. Unless noted, each must be replaced before step 6.

| Decision                     | Placeholder                                                                                                                                                                                                                                            | Lives in                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Staff roles                  | `{"PLACEHOLDER-editor@restorethe4th.com":"editor","PLACEHOLDER-reviewer@restorethe4th.com":"reviewer","PLACEHOLDER-publisher@restorethe4th.com":"publisher"}`                                                                                          | `STAFF_ROLES` var, staging environment                                         |
| Scoring rubric               | Existing `proposal-0.1` (`src/core/scoring.ts`): 3 cast votes for a grade, 2 per presidential-party context, 75% consistency threshold, default grade bands, no lookback or decay. Version string set to `PLACEHOLDER-proposal-0.1` in staging drafts. | Draft dataset `rubric`                                                         |
| Content license              | CC BY 4.0 (`PLACEHOLDER-` until the exact license is confirmed)                                                                                                                                                                                        | Methodology and footer copy                                                    |
| Correction retention         | `PLACEHOLDER-` 90 days, then manual purge of resolved and dismissed corrections                                                                                                                                                                        | Staff operations notes                                                         |
| Alert destination            | `PLACEHOLDER-` GitHub Actions failure notifications plus Cloudflare notifications to the publisher's address                                                                                                                                           | Cloudflare notification policy                                                 |
| Per-roll-call direction (22) | Direction implied by the legacy scoring lines recorded in the review manifest (`legacyLines`), weight 1, rationale prefixed `PLACEHOLDER-`                                                                                                             | `reviewRollcall` editorial input                                               |
| Senate 115-2-12 (`s_139`)    | Excluded from scoring. Legacy prose says cloture; the official record is a motion to concur. No placeholder direction is assigned.                                                                                                                     | Not imported until an editor resolves it                                       |
| AI research                  | Disabled (`AI_MODEL` empty) until a model budget is approved. Launching with AI off is acceptable.                                                                                                                                                     | Production vars; may stay disabled at launch, so this one need not be replaced |

Constraints that apply even with placeholders:

- **Two real sign-ins are required for step 4.** Review must be by a different identity than the editor (the server returns 403 otherwise), and placeholder addresses cannot sign in through Access. Map at least two real Access identities before the dry run.
- **Staging datasets that use placeholder directions set `demo: true`.** Validation accepts real Bioguide IDs with `demo: true`. The UI then shows its fictional-data banner and disables corrections and AI questions. This keeps placeholder grades for real legislators from presenting as editorial positions.
- **Never promote a placeholder dataset.** `reconcileRoster` carries the prior `demo` flag forward and the rubric version is frozen into every publication. Build the launch dataset from the staged artifacts, not by cloning a placeholder publication.
- **Production gate:** `grep -rn --exclude=LAUNCH-RUNBOOK.md 'PLACEHOLDER-' cloudflare.config.ts wrangler.jsonc docs src <LAUNCH_DRAFT>.json` must return nothing before step 6. The launch draft JSON is where the rubric version and rationales live.

## 1. Tooling and credentials

Deploys use Wrangler; account and D1 operations use the Cloudflare CLI ([`cf`](https://developers.cloudflare.com/cf/)). `cf` is in beta and pinned to `1.0.0-beta.16`. `cf deploy` cannot build this project: it detects `vite.config.ts`, runs plain `vite build`, and finds no Worker build output. Deploying through `cf` would require the Cloudflare Vite plugin beta, which is deferred until it has a numbered 2.0 release. `cloudflare.config.ts` (from `cf migrate`) is kept for that later switch but is not used by any current command; `wrangler.jsonc` is authoritative.

1. **Sign in to both CLIs.** `cf` does not reuse the Wrangler login, and both need an interactive browser sign-in.

   ```sh
   npx cf auth login
   npx wrangler login
   ```

2. **Congress API key.** Locally it lives in the gitignored `.env.ingestion` (not `.env`, which Wrangler would load into the local Worker); run importers with `node --env-file=.env.ingestion`. It is set as the `CONGRESS_API_KEY` secret on `RT4National/surveillance-scorecard` for the daily ingestion workflow. The repository is public, so roster artifacts (official public data, never the key) are downloadable by any signed-in GitHub user for 14 days.

`cf` resource commands take database IDs, not names. Find commands with `cf cli search "<task>"`. It has no D1 export command, so backups use `wrangler d1 export`.

## 2. Staging infrastructure

1. **Create the D1 databases.** Then replace the all-zeros IDs for `staging` and `production` in `wrangler.jsonc`.

   ```sh
   npx cf d1 create --help
   ```

2. **Apply migrations.** `cf d1 migrations apply` targets the remote database unless you pass `--local`, and uses the same bookkeeping table as Wrangler.

   ```sh
   npx cf d1 migrations apply <STAGING_DATABASE_ID> --dir migrations
   ```

3. **Open staff mode (current staging setup).** `env.staging` sets `STAFF_OPEN_STAGING="true"`: anyone with the link can use `/scorecard/editor` under a self-chosen name (stored as `<name>@staging.invalid`, publisher role). The name is not authentication; it only keeps author and reviewer distinct. Open-mode drafts must be `demo: true`. `worker/staging-access.test.ts` fails if production config sets the flag. Remove the flag when Access is set up.
4. **Set up Access (later).** Create a Cloudflare Access self-hosted application covering `/scorecard/editor*` and `/scorecard/api/staff/*`. In `env.staging`, set `ACCESS_ISSUER`, `ACCESS_AUDIENCE` and the placeholder `STAFF_ROLES` from step 0, with two real identities mapped.
5. **Verify.**

   ```sh
   npm run types
   npm test
   npm run test:capacity
   npm run build
   ```

6. **Deploy to staging.** First deployed October 14, 2026 (UTC) to the personal `zaki@iqlusion.io` Cloudflare account, which does not hold `restorethe4th.com`: <https://restore-the-fourth-scorecard-staging.zaki-0c1.workers.dev/scorecard/>, D1 `1eeaa6f2-983e-4cc5-8fc7-27449033b022`. Production must be created in the account that holds `restorethe4th.com`; Workers and D1 databases cannot be moved between accounts. The staging Worker is `restore-the-fourth-scorecard-staging` on its `workers.dev` URL; no route on the main site is touched.

   ```sh
   npx wrangler deploy --dry-run --env staging
   npx wrangler deploy --env staging
   ```

## 3. Real data

This is the critical path. Commands are in [DATA-PIPELINE](DATA-PIPELINE.md).

1. **Roster.** Run `import.mjs members` with the API key and reconcile it against the House Clerk and Senate directories.
2. **Senate crosswalk.** Build a sourced LIS-to-Bioguide crosswalk for the 130 Senate LIS IDs. Do not match on names.
3. **Historical House terms.** Get exact-day terms for the 14 current senators who have House ballots in the evidence. Resolve the 314 historical ballot identities that are not in the current directories.
4. **Legacy sheet.** Get the Google Sheets `newsb` values export and run `import.mjs legacy`.
5. **Editorial inputs.** Apply the step 0 per-roll-call placeholders through `reviewRollcall`. Leave Senate 115-2-12 out.
6. **Portraits and affiliations.** Run `cache-portraits.mjs` on a rights-reviewed manifest, then `import.mjs affiliations`.
7. **Durable storage.** Copy every staging directory with its source captures to durable storage. GitHub artifacts expire after 14 days.

## 4. Editorial dry run on staging

1. Import the dataset as a draft with `demo: true` and check the per-member impact preview.
2. Have the second identity review the draft, then publish it.
3. Inspect the grade distribution on real evidence. It informs the real rubric decision.
4. Exercise pointer rollback, rebase after a competing publish, and the corrections queue (corrections are disabled in the UI while `demo: true`; test them through the API).
5. Save a second copy of the dataset as a draft with `demo: false`, and never review or publish it. `demo: true` skips the live-source checks in `worker/validation.ts` (official host, matching source capture, fictional-ID refusal). Draft creation and save run the same validation, so this exercises those checks without exposing a placeholder publication that has no fictional-data banner. There is no draft delete endpoint; leave it unreviewed and label its summary `PLACEHOLDER-validation-only`.

## 5. Staging qualification

- **API checks:** unauthenticated staff writes return 401, staff roles map correctly, and valid detail pages return 200 while unknown IDs return 404. An archived publication keeps its digest after a new one is published.
- **Routing:** `/scorecard` and `/scorecard/*` work without affecting other site routes.
- **Accessibility and performance:** run an accessibility audit (WCAG, screen reader, contrast). Measure mobile performance with the real-size payload.
- **Recovery:** export the staging D1 database with `npx wrangler d1 export surveillance-scorecard-staging --remote --env staging --output <PATH>`. Restore it into a separate database and verify the publication count, current pointer, digests and audit history.
- **Alerts:** configure alerts at the step 0 destination for 5xx responses, ingestion failures and data freshness.
- **AI:** if it is enabled, run live question-answer qualification within an approved budget.

## 6. Launch

1. **Clear placeholders.** Replace every step 0 placeholder with an approved decision and pass the `PLACEHOLDER-` grep gate. Build the launch dataset from staged artifacts with `demo: false`.
2. **Production database.**

   ```sh
   npx cf d1 migrations apply <PRODUCTION_DATABASE_ID> --dir migrations
   ```

3. **Deploy production.** Set production `ACCESS_*` and `STAFF_ROLES` with real identities.

   ```sh
   npx wrangler deploy --dry-run --env production
   npx wrangler deploy --env production
   ```

4. **Route.** Route only `restorethe4th.com/scorecard` and `restorethe4th.com/scorecard/*` to the Worker.
5. **Publish.** Publish the first reviewed publication through the editor, then rerun the step 5 API checks against production.
6. **Back up.** Take a post-launch D1 export to a protected operator location.
