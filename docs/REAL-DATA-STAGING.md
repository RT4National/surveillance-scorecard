# Real evidence qualification — September 7, 2026

The private review packet is at `private/real-evidence-2026-09-07-final/review-manifest.json`. Its 26 exact UTF-8 source captures are alongside it in `sources/`. This directory is ignored by Git and is not a deployed asset. The packet explicitly has `complete: false`, `publishable: false`, and `requiresReview: true`; it contains no new grades, weights, or inferred advocacy positions. Earlier partial staging directories from adapter qualification are not the final packet.

## Evidence actually captured

| Item                                             | Verified result                                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy source                                    | `RT4National/DecideTheFuture` revision `0dc6397c8f0262888b96329bbb9ace9abc15fdd3`, political scorecard component captured verbatim                   |
| Official roll calls referenced by that component | 23 distinct URLs resolved to official XML; all 23 fetched successfully                                                                               |
| House roll calls                                 | 12 normalized stages; 5,204 ballot records, with unique identities and counts checked against official totals                                        |
| Senate roll calls                                | 11 source stages; 1,100 raw ballots with LIS uniqueness and total counts checked; no Bioguide mapping assumed                                        |
| Public House directory                           | 439 listed members, 2 vacancies, 441 total listed seats including delegates/territorial representation; upstream publication label September 2, 2026 |
| Public Senate directory                          | 100 listed senators with official Bioguide IDs; no service dates or LIS crosswalk supplied                                                           |
| Historical House identity gap                    | 314 distinct ballot identities absent from the current House/Senate directories                                                                      |
| Historical chamber transitions                   | 14 current senators have House ballots in the captured evidence; exact-day historical House terms remain required                                    |
| Senate identity gate                             | 130 distinct LIS IDs require a reviewed LIS-to-Bioguide crosswalk                                                                                    |

These are capture-time observations, not a claim that the current directory reconstructs historical membership. Vacancies remain explicit. House committee codes are joined to names in the same source, but no historical committee start date is invented. The Clerk's `AQ00` identifier for American Samoa is explicitly recognized with postal state `AS`; empty committee placeholders are treated as unassigned, not invalid memberships.

## Scope and source selection

The captured [legacy component](https://github.com/RT4National/DecideTheFuture/blob/0dc6397c8f0262888b96329bbb9ace9abc15fdd3/app/javascript/bundles/main/components/ScorecardPolitical.jsx) identifies selected official roll-call links in its scoring logic. The packet extracts those citations without executing the old JavaScript and records their original line numbers and links. It normalizes House modern vote pages and old Senate vote-list links to official XML. It does not copy the old numeric scoring increments or reinterpret sponsorships as ballots.

House coverage is: 2018 roll 14; 2019 roll 345; 2020 roll 98; 2021 roll 281; 2022 roll 221; 2023 roll 616; and 2024 rolls 114, 116, 117, 118, 119, and 136. Senate coverage is: Congress 115 session 2 roll 12; Congress 116 session 2 rolls 89–92; Congress 118 session 1 roll 342; and Congress 118 session 2 rolls 144, 146, 148, 149, and 150. These span 2018–2024. Earlier criteria, unlinked claims, cosponsorships, committee votes, and newly relevant legislation are outside this automatically selected packet.

The public rosters come from the [House Clerk MemberData feed](https://clerk.house.gov/xml/lists/MemberData.xml) and [Senate contact directory](https://www.senate.gov/general/contact_information/senators_cfm.xml). They are supplemental observations with `complete: false`, not a successful Congress.gov API reconciliation.

## Concrete legacy discrepancy requiring review

The legacy component's Senate branch for `s_139` links roll 12 of Congress 115 session 2, while its prose calls the event cloture. The captured [official Senate roll 12](https://www.senate.gov/legislative/LIS/roll_call_votes/vote1152/vote_115_2_00012.xml) instead identifies a motion to concur in the House amendment. The packet preserves the actual official question and source; neither the legacy wording nor its advocacy direction is automatically approved. An editor must decide which event the original criterion intended and correct the mapping or description before scoring.

## Inputs still required before publication

1. Congress API credentials and a completed current-roster reconciliation. `CONGRESS_API_KEY` was absent locally and the repository secret-name listing returned no names during qualification; no secret values were printed.
2. Historical identity/service records, including exact-day historical House terms for the 14 members now listed as senators. Current chamber labels must not rewrite their old ballots.
3. A sourced, reviewed crosswalk for the 130 Senate LIS IDs. The current Senate directory provides Bioguide IDs but no LIS IDs; no name-only identity join was performed.
4. The original Google Sheets `newsb` values export, which is the legacy data source. The code repository's Rails schema is empty and does not supply the sheet rows. No sheet data or access credential was extracted or fabricated.
5. An editorial decision for each selected bill/amendment/procedural vote: scope, reform direction, rationale, administration, topic, weight, and rubric. The historical legacy discrepancy above must be resolved.
6. Durable retention of captures, candidate validation, and independent editorial review before publishing. The staging script never calls a publication endpoint.

## Reproduce and validate

```sh
mkdir -p private
node --import tsx scripts/ingestion/stage-real-evidence.mjs private/NEW_RUN_DIRECTORY
npx vitest run src/ingestion
npx tsc --noEmit
```

The output directory must be new. Each capture has source URL, retrieval timestamp, SHA-256, and local filename. The final packet's 26 digests were checked against the saved file bytes. Qualification passed 23 ingestion tests and TypeScript. Directory tests cover real-world territory aliases, vacancies, empty committee placeholders, source committee joins, duplicate seats/identities, invalid dates, malformed XML, and the explicit incomplete-reconciliation boundary. No external publication, configuration write, or deployment was performed.
