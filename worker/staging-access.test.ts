import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { authenticate } from "./auth";

const access = {
  ACCESS_ISSUER: "",
  ACCESS_AUDIENCE: "",
  STAFF_ROLES: "{}",
};
const named = (name: string) =>
  new Request("https://staging.example/", {
    headers: { "X-Staging-Staff": name },
  });

describe("open staff access on staging", () => {
  it("gives a named visitor a staging-only publisher identity", async () => {
    await expect(
      authenticate(named("  Ada Lovelace "), {
        ...access,
        STAFF_OPEN_STAGING: "true",
      }),
    ).resolves.toEqual({
      email: "ada-lovelace@staging.invalid",
      role: "publisher",
      open: true,
    });
  });

  it("decodes the URL-encoded name the editor sends", async () => {
    await expect(
      authenticate(named(encodeURIComponent("Zoë Q")), {
        ...access,
        STAFF_OPEN_STAGING: "true",
      }),
    ).resolves.toMatchObject({ email: "zo-q@staging.invalid" });
    await expect(
      authenticate(named("%E0%A4%A"), {
        ...access,
        STAFF_OPEN_STAGING: "true",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("requires a usable name in open mode", async () => {
    for (const request of [
      new Request("https://staging.example/"),
      named("!!!"),
      named("x".repeat(65)),
    ])
      await expect(
        authenticate(request, { ...access, STAFF_OPEN_STAGING: "true" }),
      ).rejects.toMatchObject({ status: 401 });
  });

  it("ignores the staging header unless open mode is exactly enabled", async () => {
    for (const flag of [undefined, "", "1", "TRUE"])
      await expect(
        authenticate(named("ada"), { ...access, STAFF_OPEN_STAGING: flag }),
      ).rejects.toMatchObject({ status: 401 });
  });

  it("is enabled for staging and never for production", async () => {
    const raw = await readFile(
      new URL("../wrangler.jsonc", import.meta.url),
      "utf8",
    );
    const config = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1"));
    expect(config.vars.STAFF_OPEN_STAGING).toBeUndefined();
    expect(config.env.staging.vars.STAFF_OPEN_STAGING).toBe("true");
    for (const [name, env] of Object.entries(config.env ?? {}))
      if (name !== "staging")
        expect(
          (env as { vars?: Record<string, string> }).vars?.STAFF_OPEN_STAGING,
        ).toBeUndefined();
    expect(
      await readFile(
        new URL("../cloudflare.config.ts", import.meta.url),
        "utf8",
      ),
    ).not.toContain("STAFF_OPEN_STAGING");
  });
});
