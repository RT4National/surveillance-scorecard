# Data ingestion and migration

The first credential-free official-source qualification is recorded in [REAL-DATA-STAGING.md](REAL-DATA-STAGING.md), including the private evidence packet, legacy mapping discrepancy, coverage counts, and remaining publication gates. `stage-real-evidence.mjs` captures official rollcalls cited by a pinned legacy component plus public House/Senate directory observations; these supplemental observations explicitly cannot be passed off as a complete Congress.gov roster run.

The importer writes reviewable staging artifacts and exact source captures. It does not publish, infer an advocacy position, deactivate absent members, or replace fictional votes with purported real evidence. The production editorial workflow must approve the staged dataset separately.

## Commands

From the repository root after `npm ci`:

```sh
# Set CONGRESS_API_KEY in the environment through your secret manager or shell.
# Do not include the value in command arguments or committed files.
node --import tsx scripts/ingestion/import.mjs members --out /tmp/scorecard-roster-unique

# Optional reconciliation with a previously published Dataset JSON:
node --import tsx scripts/ingestion/import.mjs members --previous /path/to/dataset.json --out /tmp/scorecard-roster-reviewed-base

node --import tsx scripts/ingestion/import.mjs house --url https://clerk.house.gov/evs/2025/roll003.xml --out /tmp/scorecard-house-003

# A reviewed JSON object maps Senate LIS IDs to Bioguide IDs, e.g. {"S123":"A000001"}.
node --import tsx scripts/ingestion/import.mjs senate --url https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00001.xml --crosswalk /path/to/lis-bioguide.json --out /tmp/scorecard-senate-001

# Export the original newsb sheet as Google Sheets values JSON first.
node --import tsx scripts/ingestion/import.mjs legacy --input /path/to/newsb.json --source https://sheets.googleapis.com/v4/spreadsheets/SHEET_ID/values/newsb --out /tmp/scorecard-legacy

# Supplemental sourced party, committee, caucus, and term intervals:
node --import tsx scripts/ingestion/import.mjs affiliations --input /path/to/affiliations.json --dataset /path/to/dataset.json --source https://example.org/editorial-import --out /tmp/scorecard-affiliations
```

Each output directory must be new and its parent must exist. Successful runs contain `staging.json` and numbered `source-001.txt` captures. The stage contains the SHA-256 digest, retrieval time, source URL, and coverage warnings. Persist the entire directory in controlled object storage alongside a reviewed import; a digest without its underlying bytes is insufficient to reconstruct an import. Imports fail before writing a directory on source validation failures. Filesystem failures can leave an incomplete output directory; never submit that directory for review.

Congress credentials are sent in the `X-Api-Key` request header, never captured URLs. Pagination is restricted to the expected Congress.gov endpoint, redirects are refused, repeated pages/identities and count changes abort the run, and the final unique count must equal the advertised total. A source outage cannot produce an empty replacement roster. Run-wide results remain subject to editorial reconciliation: advertised counts are consistency checks, not proof that upstream records are perfectly current.

## Callable integration

`.github/workflows/ingestion.yml` runs daily and on manual dispatch. It checks for a private repository and a `CONGRESS_API_KEY` secret, reporting an explicit skip when either prerequisite is absent. It tests adapters, stages the roster, and uploads exact captures as a repository artifact retained for 14 days. It never publishes, deactivates members, or embeds the API key in source URLs. Failed jobs report that no publication occurred. Download and reconcile the artifact against the actual current publication before submitting an editorial draft; archive approved evidence durably before artifact expiry. Workflow failure notifications use the repository's normal GitHub Actions notification settings.

- `ingestCurrentMembers({apiKey, fetcher?, now?, maxPages?})` returns a `RosterRun` only after all pages validate. The injectable fetcher allows source bytes to be retained by a Worker or CLI.
- `reconcileRoster(previousDataset, run)` returns `{dataset, missingMemberIds, requiresReview: true}`. Existing absent members remain intact. Missing active members require an explicit, independently evidenced editorial status change. Existing committee/caucus fields are preserved. The prior `demo` flag is preserved to prevent real roster data from relabeling fictional votes as real.
- `parseHouseRollcall(xml, sourceUrl)` and `parseSenateRollcall(xml, sourceUrl, lisToBioguide)` return unscored ballot stages. Vote identity, source URL, member uniqueness, total count, and Yes/No counts must agree. Malformed XML, entity declarations, unsupported outcomes, unresolved Senate IDs, and source mismatches abort.
- `reviewRollcall(stage, editorial)` constructs a `Vote` and its `RecordEntry[]` only when title, administration, president party, reform direction, positive weight, topic, and rationale are supplied. This validates required fields; the authenticated editorial review/publish workflow supplies actual approval authority. Confirm every ballot's member exists in the target dataset before submission.
- `stageLegacySheet(rawJson, sourceUrl, {reviewedPaths?})` preserves all cells and maps `entry[16]` to validated Bioguide IDs. Optional redirects require reviewed local paths and known identities. These mappings are an artifact for a routing migration, not a deployed redirect configuration.

Official names and state names are preserved. Bioguide IDs are stable uppercase identifiers. Unsupported party labels fail closed instead of being silently mapped to Independent. House at-large district `0` is retained. Terms from the member list have year precision; exact service dates must not be inferred from them. API portrait attribution is retained as untrusted text, not rendered HTML.

`RosterRun.affiliations` represents dated terms and supports supplemental party, committee, and caucus records with source URL, interval, and date precision. Only terms are automatically populated today. Congress.gov explicitly warns that its current party field does not reflect party changes; historical party-at-vote values come from the ballot records, and a full party-change history still requires reviewed supplemental evidence.

`stageAffiliations` accepts a JSON array of `{memberId,kind,name,start,end?,precision,source}` with inclusive end dates, validates known identities and exact calendar dates, and rejects conflicting party intervals or overlapping duplicate memberships. `affiliationsOn` intentionally uses only exact-day intervals; year-level data cannot establish membership on a particular vote date. A sample entry is `{ "memberId": "A000001", "kind": "party", "name": "Independent", "start": "2025-01-03", "precision": "day", "source": "https://www.senate.gov/example" }`. This illustrative identity and URL must be replaced with actual sourced data.

Dataset candidates now carry `affiliations` for publication and profile history. Roster reconciliation retains published histories and merges term intervals without duplicating identical rows. `reconcileAffiliations(previousDataset, stage)` builds a publication-ready candidate, rechecks the combined chronology for conflicts, and retains captures and coverage warnings. The affiliations CLI emits both the original stage and this candidate under `reconciliation.dataset`; it still requires editorial review. Roster candidate cutoff dates are calendar dates; capture metadata retains complete timestamps.

`RosterRun.portraits` defaults every image to `rights: "unreviewed"`. `publishablePortrait` requires HTTPS source and rights URLs, attribution, explicit public-domain or licensed status, and a named reviewer. Attribution alone is not a license. Before setting a public member portrait, cache approved image bytes under a local `/scorecard/portraits/` path and preserve the original URL, rights evidence, and capture digest with the import. Rendering external image URLs would disclose visitor requests to the source.

## Coverage and publication boundaries

### Reviewed portrait cache

`node --import tsx scripts/ingestion/cache-portraits.mjs /path/to/reviewed-portraits.json /tmp/new-portrait-stage` downloads a reviewed manifest array containing `{memberId,url,attribution,rights,rightsSource,reviewedBy}`. Downloads require official Congress/House/Senate HTTPS hosts, refuse redirects, time out after 30 seconds, and enforce a 5 MB limit and matching PNG/JPEG/WebP MIME and byte signatures. SVG is not accepted. Other photo hosts require an explicit adapter extension after review; a Wikipedia origin is not treated as a license.

A successful stage includes `portraits/` image files and `staging.json` with source digests and public `Member.portrait` metadata. Review image contents visually before copying approved files into `public/scorecard/portraits/`, then apply the matching member metadata through the publication workflow. Vite copies these static assets to `/scorecard/portraits/`. Signature checks identify file format, not visual correctness or image decoding safety. The command creates a new staging directory only and never deploys or changes public member data. Portrait caching is an explicit reviewed operation; the automated roster workflow does not perform it.

Current members are implemented; a complete historical roster, death verification, exact party changes, committee/caucus feeds, cosponsorship scoring, address-to-district lookup, and image caching are not automatically supplied by this importer. House and Senate roll calls are ingested individually after editors choose evidence. Quorum and speaker-election ballots may have unsupported outcomes and must not be forced into binary advocacy scores. Present is represented as `Not voting` by the current public outcome schema, with exact original ballots preserved in capture files and a visible coverage warning. Vice-presidential Senate tie-breakers are outside member records.

No Congress API key was available during implementation. The current-member flow is fixture-tested, not claimed as a completed live roster. The CLI successfully captured and parsed the official 2025 House roll call 003 during implementation. Senate live source structure was inspected; complete Senate import requires a reviewed identity crosswalk. Legacy repository code is licensed for this project per user authorization, but access to its live Google Sheet is separate and no live sheet import is claimed.

## Source references

- [Congress.gov member API documentation](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/MemberEndpoint.md): current/historical filters, member identifiers, term precision, portrait attribution, and current-party limitation.
- [Official House roll call XML](https://clerk.house.gov/evs/2025/roll003.xml): actual House structure and totals.
- [Official Senate roll call XML](https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00001.xml): actual Senate structure, LIS IDs, and totals.
- [Original DecideTheFuture data mapping](https://github.com/RT4National/DecideTheFuture/blob/HEAD/app/javascript/bundles/main/components/ScorecardPolitical.jsx): `newsb` Google Sheets source and positional mapping. Its empty Rails schema is not the data source.

## Verification

`npx vitest run src/ingestion/ingestion.test.ts` checks pagination, missing pages, changed counts, duplicates, untrusted pagination, credential redaction, roster preservation, portrait rights, source/ballot identity, ballot totals, XML validation, Senate identity joins, explicit editorial direction, and legacy preservation/redirect rejection. No test fetches live data or uses credentials.
