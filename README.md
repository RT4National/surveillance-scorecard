# Surveillance Scorecard

A modern scorecard for Restore the Fourth, designed for `restorethe4th.com/scorecard` with a Cloudflare Worker, static assets, and D1 publications.

**Status: integrated implementation with local publication fixtures; not yet a launched congressional scorecard.** The supplied twelve members and twelve roll calls are fictional. Source adapters, authenticated publishing, archives, and public research are implemented. Live data, staff identities, rubric approval, and production configuration are still required. The app never labels fixture evidence as real.

## Run

Node.js 24.

```sh
npm ci
npm run db:migrate
npm run db:seed:local
npm run build
npm run preview
```

Open http://localhost:8787/scorecard/. The local-only seeder creates two immutable fictional publications for archive and comparison testing; it accepts no remote flag. To develop the frontend with hot reload, run `npm run dev` in a second terminal; Vite proxies the API to the local Worker.

```sh
npm test
npm run test:capacity
npm run types
npm run deploy:check
```

No Cloudflare login is needed for local preview, local D1 or deployment dry runs. The default environment has no AI binding. The `production` environment adds Workers AI; its placeholder D1 ID and Access settings must be configured before deploying. Staff HTTP endpoints always require a verified Access identity, including locally. Tests use signed identity fixtures and simulated D1; there is no authentication bypass.

Congressional-scale qualification exercises the actual local Workers runtime with 535 fictional legislators and 12, 50 and 250 roll calls. Larger snapshots use bounded, checksum-verified gzip envelopes in D1; old inline publications remain readable. See [capacity results](docs/CAPACITY.md) and [UI qualification](docs/QUALIFICATION.md). These are local checks, not production load certification.

## Included

- React, TypeScript, Vite and Lucide icons, with a responsive interface, accessible labels and keyboard controls.
- Search and independent chamber, state, party, committee/caucus and consistency filters; shareable query parameters.
- Stable `/scorecard/members/:id` URLs and date-based evidence exploration.
- Normalized weighted letter grades, separate own-party/opposing-party consistency, explicit evidence minimums, and a rubric sandbox.
- Immutable publication archives, source-pinned URLs, integrity checks and explanations of grade changes.
- Legislation pages, party roll-call breakdowns, member comparisons, issue/date/context filters, and state-based representative discovery.
- Validated vote intersections and separate party rankings; formula-safe table/CSV exports, attributed SVG charts, and printing.
- An optional Workers AI question-to-query adapter. All results are executed deterministically against one publication; unsupported or ambiguous questions fail explicitly. Live model inference has not been qualified.
- Staff draft/import/edit/review/publish workflow, structured editing forms, role enforcement, optimistic concurrency, impact preview, audit history, correction queue and pointer rollback.
- Congress.gov roster ingestion, House/Senate roll-call adapters, sourced affiliation histories, reviewed portrait staging, legacy sheet migration and a daily private staging workflow.
- Subpath routing, source-based profile metadata, true unknown-member 404s, security headers and deployment dry-run checks.

## Before production

See [the original stories](docs/PLAN.md), [architecture](docs/ARCHITECTURE.md), [data pipeline](docs/DATA-PIPELINE.md), [publishing operations](docs/PUBLISHING.md), and [feature status](docs/FEATURE-STATUS.md).

Supply a Congress API key, reviewed historical evidence and Senate identity crosswalk, current memberships, licensed portraits, staff Access identities, an approved rubric and exact content license. Configure and qualify the production D1 database, route and model budget. Reconcile staged data before publishing. No production infrastructure or public publication has been created by this implementation work.

A [real-evidence review packet](docs/REAL-DATA-STAGING.md) now captures 23 official roll calls referenced by the legacy application plus supplemental current directories. Its raw captures remain in ignored private staging. Historical identities, Senate mapping, editorial interpretations and Congress.gov reconciliation are explicitly incomplete; the public preview remains fictional.

Inspired by [RT4National/DecideTheFuture](https://github.com/RT4National/DecideTheFuture). The project owner confirmed authorization to reuse its code. This implementation is new code. The requested content license is provisionally interpreted as CC BY 4.0; exact terms await confirmation. Dependency licenses remain applicable.
