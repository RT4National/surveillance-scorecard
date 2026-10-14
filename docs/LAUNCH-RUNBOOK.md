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

The project moves from Wrangler to the Cloudflare CLI ([`cf`](https://developers.cloudflare.com/cf/)). `cf` is in beta (npm `cf@1.0.0-beta.16` as of this date). Its commands, configuration and build output can change before the stable release.

1. **Approve the dependency.** `cf` is not in the approved-dependency list. Package details: MIT OR Apache-2.0, published by Cloudflare (`wrangler-publisher`), 7 direct dependencies including `miniflare` beta.
2. Install it and sign in. `cf` does not reuse the Wrangler login.

   ```sh
   npm install --global cf
   cf auth login
   ```

3. Migrate the project config. `cf migrate` writes `cloudflare.config.ts` beside `wrangler.jsonc` and adds `cf` as a dev dependency. It keeps the Worker name, bindings, resource IDs, routes and environments. Each `env` block becomes a `--mode` case.

   ```sh
   cf migrate --dry-run
   cf migrate
   ```

   Resolve every `TODO(@cloudflare)` it leaves. This project has no Durable Objects or Workflows. Expect these follow-ups:
   - **D1 migrations directory:** pass `--dir migrations` to `cf d1 migrations apply`, because it is not converted.
   - **Package scripts:** update the scripts in `package.json`.
   - **Assets:** confirm `assets.run_worker_first` became `worker.assets.runWorkerFirst`.

4. **Keep `wrangler.jsonc` and the Wrangler dev dependency for now.** The test harness still uses Wrangler and Miniflare: `npm run preview`, `npm run db:migrate`, `npm run test:capacity`, and the D1 tests in `worker/publishing.test.ts`. Wrangler does not read `cloudflare.config.ts`, so keep binding changes in both files until the harness is ported. Do not run `cf dev`, `cf build` or `cf deploy` before `cf migrate`.
5. Get a `CONGRESS_API_KEY`. Locally it lives in the gitignored `.env`; run importers with `node --env-file=.env`. Set it as the `CONGRESS_API_KEY` secret on `RT4National/surveillance-scorecard` for the daily ingestion workflow. The repository is public, so roster artifacts (official public data) are downloadable by any signed-in GitHub user for 14 days.

**Undocumented `cf` commands.** The `cf` docs do not show commands for D1 create, D1 export, routes or Access applications. Find each with `cf cli search "<task>"` and `cf schema <command>` before use. Where `cf` has no equivalent, use the Wrangler command already in [PUBLISHING](PUBLISHING.md).

## 2. Staging infrastructure

1. **Create the D1 databases.** Create `surveillance-scorecard-staging` and `surveillance-scorecard-production`. Find the create command with `cf cli search "create a D1 database"`.
2. **Add a staging mode.** Add a `staging` case to `cloudflare.config.ts` and an `env.staging` block to `wrangler.jsonc`. Use the real staging database ID in both, and replace the all-zeros production ID.
3. **Apply migrations.** `cf d1 migrations apply` applies to the remote database unless you pass `--local`.

   ```sh
   cf d1 migrations apply <STAGING_DATABASE_ID> --dir migrations
   ```

4. **Set up Access.** Create a Cloudflare Access self-hosted application covering `/scorecard/editor*` and `/scorecard/api/staff/*`. In staging, set `ACCESS_ISSUER`, `ACCESS_AUDIENCE` and the placeholder `STAFF_ROLES` from step 0, with two real identities mapped.
5. **Verify.** Generate types and run the full local suite:

   ```sh
   cf workers types
   npm test
   npm run test:capacity
   npm run build
   ```

   `cf workers types` writes `.cloudflare/types/index.d.ts`. The Worker currently reads `worker/env.d.ts`, so point `tsconfig.json` at the new file or keep `npm run types` until then.

6. **Deploy to staging.** `cf deploy --dry-run` makes no API requests.

   ```sh
   cf deploy --dry-run --mode staging
   cf deploy --mode staging
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
- **Recovery:** export the staging D1 database (find the command with `cf cli search "export a D1 database"`). Restore it into a separate database and verify the publication count, current pointer, digests and audit history.
- **Alerts:** configure alerts at the step 0 destination for 5xx responses, ingestion failures and data freshness.
- **AI:** if it is enabled, run live question-answer qualification within an approved budget.

## 6. Launch

1. **Clear placeholders.** Replace every step 0 placeholder with an approved decision and pass the `PLACEHOLDER-` grep gate. Build the launch dataset from staged artifacts with `demo: false`.
2. **Production database.**

   ```sh
   cf d1 migrations apply <PRODUCTION_DATABASE_ID> --dir migrations
   ```

3. **Deploy production.** Set production `ACCESS_*` and `STAFF_ROLES` with real identities.

   ```sh
   cf deploy --dry-run --mode production
   cf deploy --mode production
   ```

4. **Route.** Route only `restorethe4th.com/scorecard` and `restorethe4th.com/scorecard/*` to the Worker.
5. **Publish.** Publish the first reviewed publication through the editor, then rerun the step 5 API checks against production.
6. **Back up.** Take a post-launch D1 export to a protected operator location.
