# Agent notes

- Reading data, running scoring experiments and proposing drafts: see `docs/AGENT-GUIDE.md`.
- Scoring lives in `src/core/scoring.ts`; experiments reuse it through `src/core/experiment.ts`
  and `npm run experiment`. Do not reimplement the formula elsewhere.
- Tests: `npm test`. Build and type check: `npm run build`.
- Never publish placeholder (`PLACEHOLDER-`) or demo data to production. Staging open staff mode
  (`STAFF_OPEN_STAGING`) must never be set for production.
- Never commit API keys; ingestion keys live in the gitignored `.env.ingestion`.
