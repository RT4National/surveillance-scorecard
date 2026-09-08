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
