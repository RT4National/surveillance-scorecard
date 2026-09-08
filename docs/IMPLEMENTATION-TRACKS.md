# Feature-completeness implementation tracks

The user authorized parallel subagents to build the remaining feature set on September 7, 2026. Work is integrated in the existing clean checkout with exclusive file ownership.

1. Data agent: official-source ingestion, normalized provenance, reconciliation safeguards, legacy migration and source validation. Owns `src/ingestion/`, `scripts/ingestion/`, and its tests/docs.
2. Publishing agent: Cloudflare Worker/D1 backend, immutable publications, Access authentication, editor workflow, corrections and operational endpoints. Owns `worker/`, `migrations/`, `src/features/editor/`, `wrangler.jsonc`, and backend docs/tests. Coordinates dependencies and binding contracts with root.
3. Research agent: legislation pages, comparisons, change explanations, research/export/report functionality and immutable archive browsing. Owns `src/features/public/`, `src/core/reports.ts`, and its tests/docs. Uses shared Dataset/Publication contracts.
4. Root: shared contracts, application integration, source-backed UI state, scoring safeguards and policy controls, regression coverage, deployment validation, docs and GitHub publishing.

Acceptance: each implemented path must be exercised locally. Production ingestion must preserve source provenance and reject incomplete replacement. Editorial writes require authorization; published versions remain immutable. Public queries must bind to a publication and distinguish insufficient evidence. Fictional data stays explicitly marked. External credentials, actual domain changes, reviewed live data and editorial policy approval are deployment gates, not claims satisfied by code alone.

No subagent may deploy externally, change Git history, push independently, or overwrite another track's files. Root integrates and publishes the combined implementation.
