import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const origin = "https://scorecard.invalid";
const [html, headers] = await Promise.all([
  readFile(new URL("../../dist/index.html", import.meta.url), "utf8"),
  readFile(new URL("../../dist/_headers", import.meta.url), "utf8"),
]);
const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
assert(scripts.length, "Expected a bundled script in the public shell");
for (const [, attributes] of scripts) {
  const source = /(?:^|\s)src\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(
    attributes,
  );
  assert(
    source &&
      new URL(source[1] ?? source[2] ?? source[3], origin).origin === origin,
    "Public scripts must be served from the same origin",
  );
}

const policies = [
  ...headers.matchAll(/^\s*Content-Security-Policy:\s*(.+)$/gim),
];
assert.equal(policies.length, 1, "Expected one public content-security policy");
const directives = new Map();
for (const entry of policies[0][1].split(";")) {
  const [name, ...sources] = entry.trim().split(/\s+/);
  if (!name) continue;
  assert(!directives.has(name), `Duplicate CSP directive: ${name}`);
  directives.set(name, sources);
}
for (const name of ["script-src", "connect-src"])
  assert.deepEqual(
    directives.get(name),
    ["'self'"],
    `${name} must allow only the site's own origin`,
  );
assert.match(headers, /^\s*Permissions-Policy:.*\bgeolocation=\(\)/im);
const sourceRoot = new URL("../../src/", import.meta.url);
const entries = await readdir(sourceRoot, {
  recursive: true,
  withFileTypes: true,
});
for (const entry of entries) {
  if (
    !entry.isFile() ||
    !/\.(?:[cm]?[jt]sx?|json)$/.test(entry.name) ||
    /\.(?:test|spec)\./.test(entry.name) ||
    /(?:^|[\/\\])(?:fixtures|__fixtures__)(?:[\/\\]|$)/.test(entry.parentPath)
  )
    continue;
  const data = await readFile(`${entry.parentPath}/${entry.name}`, "utf8");
  assert(
    !/\b[A-Z][0-9]{6}\b/.test(data),
    `Hard-coded Bioguide ID in ${entry.name}`,
  );
}
console.log(
  "Public shell, privacy policy, and source provenance checks passed.",
);
