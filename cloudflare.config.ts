import { bindings, defineConfig } from "cf/config";

/**
 * Wrangler environments are selected through ctx.mode and the cf --mode flag.
 * @see https://developers.cloudflare.com/workers/wrangler/environments/
 *
 * D1 migrations are not part of this config. Apply them with
 * `cf d1 migrations apply <DATABASE_ID> --dir migrations`.
 */

export default defineConfig((ctx) => {
  switch (ctx.mode) {
    case "staging": {
      return {
        worker: {
          name: "restore-the-fourth-scorecard-staging",
          compatibilityDate: "2026-09-07",
          compatibilityFlags: ["nodejs_compat"],
          entrypoint: "worker/index.ts",
          observability: {
            enabled: true,
            headSamplingRate: 1,
          },
          assets: {
            htmlHandling: "none",
            notFoundHandling: "none",
            runWorkerFirst: ["/scorecard", "/scorecard/*"],
          },
          env: {
            ACCESS_ISSUER: bindings.text(""),
            ACCESS_AUDIENCE: bindings.text(""),
            STAFF_ROLES: bindings.text("{}"),
            AI_MODEL: bindings.text(""),
            DB: bindings.d1({
              name: "surveillance-scorecard-staging",
              id: "00000000-0000-0000-0000-000000000000",
            }),
            ASSETS: bindings.assets(),
          },
        },
      };
    }
    case "production": {
      return {
        worker: {
          name: "restore-the-fourth-scorecard-production",
          compatibilityDate: "2026-09-07",
          compatibilityFlags: ["nodejs_compat"],
          entrypoint: "worker/index.ts",
          observability: {
            enabled: true,
            headSamplingRate: 1,
          },
          assets: {
            htmlHandling: "none",
            notFoundHandling: "none",
            runWorkerFirst: ["/scorecard", "/scorecard/*"],
          },
          env: {
            ACCESS_ISSUER: bindings.text(""),
            ACCESS_AUDIENCE: bindings.text(""),
            STAFF_ROLES: bindings.text("{}"),
            AI_MODEL: bindings.text("@cf/meta/llama-3.1-8b-instruct-fast"),
            DB: bindings.d1({
              name: "surveillance-scorecard-production",
              id: "00000000-0000-0000-0000-000000000000",
            }),
            AI: bindings.ai({}),
            ASSETS: bindings.assets(),
          },
        },
      };
    }
    default: {
      return {
        worker: {
          name: "restore-the-fourth-scorecard",
          compatibilityDate: "2026-09-07",
          compatibilityFlags: ["nodejs_compat"],
          entrypoint: "worker/index.ts",
          observability: {
            enabled: true,
            headSamplingRate: 1,
          },
          assets: {
            htmlHandling: "none",
            notFoundHandling: "none",
            runWorkerFirst: ["/scorecard", "/scorecard/*"],
          },
          env: {
            ACCESS_ISSUER: bindings.text(""),
            ACCESS_AUDIENCE: bindings.text(""),
            STAFF_ROLES: bindings.text("{}"),
            AI_MODEL: bindings.text(""),
            DB: bindings.d1({
              name: "surveillance-scorecard",
              id: "00000000-0000-0000-0000-000000000000",
            }),
            ASSETS: bindings.assets(),
          },
        },
      };
    }
  }
});
