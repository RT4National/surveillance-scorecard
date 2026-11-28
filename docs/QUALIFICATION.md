# Application qualification — September 7, 2026

This is a bounded local qualification record, not a production accessibility or capacity certification. All browser fixtures are explicitly fictional; no real legislator was graded during these checks.

## Browser checks

The previously interrupted browser connection recovered using a fresh managed tab. Desktop and 390 × 844 mobile checks exercised:

- Published-data loading and permanent member links.
- Search for Maya reducing the directory to one member.
- Mobile profile layout, frozen grade explanation, source-linked vote evidence, and disabled demo corrections.
- Exact vote intersections: DEMO-H1 Yes matches Maya Chen and Thomas Reed; No matches Elena Rivera.
- Copyable spreadsheet output containing publication, dataset, query, coverage and membership semantics.
- Local policy simulation: raising the shared-topic minimum to one changes four of twelve members; reset restores the published policy.
- Archive comparison: two frozen publications show four versus six counted votes and explain the evidence/cutoff changes.
- State lookup selecting California returns the fictional House member and explicitly does not claim address-to-district resolution.
- Two- and three-member comparisons with issue/date/context controls and evidence limitations.
- Legislation index and mobile vote-detail rendering, with demo source absence explicitly labeled.

Home, profile, research, methodology, state finder and comparison views had matching viewport/document widths at 390 px in the observed states. Desktop and mobile profile screenshots were visually inspected. These checks do not establish every breakpoint, screen-reader behavior, contrast ratio or full WCAG conformance.

Browser testing found archive selection was lost through some back, brand, CTA and footer links. A shared navigation helper now preserves publication IDs, existing queries and anchors. Staff navigation deliberately opens the latest workspace. Regression tests cover homepage and profile anchors.

After rebuilding, browser checks confirmed pinned brand/navigation and the source link retaining both its publication query and `#sources` anchor. Browser DOM inspection intermittently lost its debugger attachment; fresh tabs and the documented screenshot fallback allowed bounded checks to continue. Authenticated staff UI is covered by component tests, not a live Access browser session. Its impact preview now verifies the current publication and compares against frozen grades, with a regression for scorer-version differences.

## Storage and data tracks

See [capacity evidence](CAPACITY.md) for synthetic congressional-scale sizes and runtime measurements. Compressed storage retains immutable publication inputs/results and checksum validation; staff lists retrieve summaries, with full draft data fetched only when selected. Browser checks above used small fixtures, not a mobile device benchmark against the largest publication.

See [real-data staging](REAL-DATA-STAGING.md) for captured official roll calls, current-directory observations, identity gaps and the discrepancy identified in legacy vote wording. Source data is private staging material and is not publishable without further reconciliation and review.

## External gates

No Congress API credential was present in the local environment or the repository secret-name listing. Cloudflare authentication was checked through Wrangler: its saved login expired and could not refresh. No cloud resources, identities or public publications were created. Full Access sign-in, live AI qualification, edge load testing, operator recovery and final editorial approval remain launch gates.

## UX rebuild table checks — November 27, 2026

Local Chrome used the production build and a loopback-only synthetic publication fixture.

- At 390, 768 and 1280 px, the directory, methodology, rubric lab, vote detail and comparison pages fit the viewport. Their tables had captions, scoped column headings and named, keyboard-focusable regions.
- The 768 px check exposed page-wide overflow in the rubric lab. Allowing the grid columns to shrink kept overflow in the table region. All three widths passed after the fix.
- The directory column heading measured 5.70:1 against its table header background. This is one measured color pair.
- Earlier 390 px checks also verified reduced-motion vote bars and a 1200 × 630 profile card downloaded by the browser.

The launch qualification still needs a screen-reader pass, broader contrast measurements, and a complete walkthrough of the six journeys with the launch candidate publication.

## Six reader journeys at 390 px — November 27, 2026

Chrome exercised the production build using loopback-only synthetic fixtures. The fixture included a frozen publication and a test licence so the gated downloads could be exercised. No fixture, licence, correction, or grade was sent to a live service.

| Journey | Observed result |
| --- | --- |
| Find a member | The first keyboard Tab reached the skip link. Selecting California showed the fixture delegation and its member link. |
| Understand a grade | The member name and evidence heading appeared in Chrome’s accessibility tree, with the published evidence visible below the grade. |
| Check a vote | Chrome exposed the party table with its caption as its name. Selecting Yes narrowed the member rows to Yes ballots. |
| Share or act | The panel exposed named copy-link and PNG buttons. Chrome saved a 1200 × 630 PNG. |
| Research and reuse | Chrome exposed the full-publication download and “Reporting accurately” heading. The all-records CSV contained the test licence and pinned citation. |
| Dispute a record | The row action opened a named text field. The loopback server accepted the request only when it carried the fixture member, vote, and publication IDs. The form showed the neutral confirmation. |

Each view fit the 390 px viewport. Measured normal-text contrast was 4.70:1 for the finder label, 5.11:1 for the sampled evidence state, 14.24:1 for the vote breadcrumb and data download link, and 14.80:1 for the share button and correction label. These measurements cover those sampled pairs.

Chrome’s accessibility tree verifies exposed names and roles. The launch candidate still needs an actual screen-reader walkthrough, broader contrast checks, and a repeat of these journeys with reviewed data.

## Published profile first response and cache

The local workerd/D1 capacity harness now seeds a separate fictional frozen snapshot to exercise the public profile read path. With 250 roll calls and 66,875 records, one local run returned 17,638 bytes of HTML including the frozen summary and source links. The first request took 109 ms and reported a memo miss. The repeat took 1 ms, reported a memo hit, and returned byte-identical HTML.

These are local elapsed times from a synthetic fixture. The request harness does not expose isolate CPU time. Production CPU, edge latency, and the live share-unfurl and summary checks remain launch qualification items.

## Rebuild plan and launch gates

[PR #23](https://github.com/RT4National/surveillance-scorecard/pull/23) carries the implementation. This record distinguishes local checks from launch conditions.

| Plan phase | Evidence and remaining work |
| --- | --- |
| 1–2. Labels, evidence and profiles | Scorer-backed evidence and split display, frozen and recalculated labels, report form, and profile filters are exercised by the profile and correction tests. Staff still need to approve final absence policy, band descriptions, minimums, group wording, independent treatment, and the correction service policy. |
| 3. Finder and directory | Finder and Worker route tests cover state links and the former directory. Chrome exercised filtering, exit and entry animation, and reduced motion. The freshness tests and D1 rollback test verify the live publication pointer. |
| 4. Vote pages | Vote page tests cover order, tallies, non-participation, search, and cosponsorship. Export tests cover licence, pinned citation, and an empty party field for out-of-office records. The new download controls need the approved data licence recorded in a publication. |
| 5. Methodology and archives | Methodology, changelog, archive, and profile revision tests cover the current rules and older published evidence. The corrections review timeframe, retention period, public outcomes, and a reply-capable staff contact still need approval. |
| 6. Sharing | Worker tests cover frozen share metadata, the summary, and cache reuse. Chrome downloaded a profile PNG. Production unfurls, the summary, and edge CPU still need live verification. |
| 7. Compare and data | Compare and report tests cover pinned selection, saved queries, and publication data. An actual screen-reader check of the member picker is pending. The party and chamber median feature waits for the D7 decision. |
| 8. Accessibility | Local Chrome passed the six reader journeys at 390 px and the sampled contrast checks above. Repeat with the reviewed launch candidate and a screen reader before launch. |
| 9. Cutover | The October 14 legacy capture passed local digest and parser replay. The canonical domain, archive scope, reviewed redirect map, and designation of a cutover capture still need approval. Follow the launch runbook for the original domain, hosting, and old key. The code and route for the approved archive still need implementation after those decisions. |
| 10. Staff intake | Local tests cover official roll-call and bill intake, per-item impact, and durable scheduled roster staging. Apply the D1 migrations, configure real Cloudflare Access identities and ingestion credentials, and run the workflow against the target environment. |
| 11. Trends | Local tests cover curated series, counts, correct presidential context, and chart/CSV parity. Staff still need to approve the series and publish the reviewed vote directions before the trends appear publicly. |

### Legacy capture replay

The ignored October 14 `newsb` CSV matched its staged source copy and SHA-256 digest. Re-running the branch’s CSV importer reproduced all 165 columns, 65 identified rows, 35 unidentified rows, and zero reviewed redirects. The historical evidence manifest still requires review. The CSV and per-member data remain in private staging.
