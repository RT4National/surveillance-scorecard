# Surveillance Scorecard

A modern scorecard for Restore the Fourth, designed for `restorethe4th.com/scorecard` and Cloudflare Workers Static Assets.

**Status: working design preview, not a production congressional dataset.** All twelve members and twelve roll calls are fictional. Grades and consistency categories are calculated, not hardcoded. The interface identifies the preview, and indexing is disabled.

## Run

Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open http://localhost:5173/scorecard/.

```sh
npm test
npm run build
npm run preview
npm run deploy:check
```

`preview` serves the built site using Wrangler at http://localhost:8787/scorecard/. No Cloudflare login is needed for local preview or a deployment dry run. `npm run deploy` publishes to Cloudflare and requires the intended account to be configured.

## Included

- React, TypeScript, Vite and Lucide icons, with a responsive interface, accessible labels and keyboard controls.
- Search and independent chamber, state, party, committee/caucus and consistency filters; shareable query parameters.
- Stable `/scorecard/members/:id` URLs and date-based evidence exploration.
- Normalized weighted letter grades, separate own-party/opposing-party consistency, explicit evidence minimums, and a rubric sandbox.
- Former-member archive with distinct inactive and deceased statuses.
- Exact two-vote intersections and independent party rankings; copyable tables, CSV and SVG exports.
- A small natural-language ranking template. **No LLM is connected.** Unsupported questions are explicitly declined.
- Asset and application routes under `/scorecard`, with security headers and deployment dry-run checks.

## Before production

See [the stories and staged plan](docs/PLAN.md) and [production architecture](docs/ARCHITECTURE.md). Remaining work includes authoritative ingestion and reconciliation, licensed portraits, reviewed methodology, immutable historical publications, authenticated editorial operations, grounded AI, and deployment to the existing domain. The preview's historical view recomputes scores; it does not claim to preserve previously published grades.

Inspired by [RT4National/DecideTheFuture](https://github.com/RT4National/DecideTheFuture). The project owner confirmed authorization to reuse its code. This implementation is new code. The requested content license is provisionally interpreted as CC BY 4.0; exact terms await confirmation. Dependency licenses remain applicable.
