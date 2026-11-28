// The single list of public routes. The app router (src/App.tsx) and the Worker
// (worker/index.ts) both decide what a path means through matchRoute, so a page
// cannot exist in one and 404 in the other. Keep this module free of browser and
// Worker globals so both can import it.

export const base = "/scorecard";

export type Route =
  | { name: "home" }
  | { name: "former" }
  | { name: "compare" }
  | { name: "find" }
  | { name: "legislation"; voteId?: string }
  | { name: "research" }
  | { name: "methodology" }
  | { name: "methodologyLab" }
  | { name: "archive" }
  | { name: "editor" }
  | { name: "member"; id: string }
  | { name: "notFound" };

export type StaticRouteName = Exclude<Route["name"], "member" | "notFound">;

/** Path segment under /scorecard/ to the page it shows. Aliases share a name. */
const staticRoutes: Record<string, StaticRouteName> = {
  "": "home",
  former: "former",
  compare: "compare",
  find: "find",
  legislation: "legislation",
  research: "research",
  reports: "research",
  methodology: "methodology",
  "methodology/lab": "methodologyLab",
  archive: "archive",
  archives: "archive",
  editor: "editor",
};

/** Retired paths and where they now live. Served as permanent redirects by the Worker. */
const redirects: Record<string, string> = {
  history: `${base}/archive`,
};

function segments(pathname: string): string[] | null {
  const path = pathname.replace(/\/+$/, "");
  if (path === base) return [];
  if (!path.startsWith(`${base}/`)) return null;
  return path.slice(base.length + 1).split("/");
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function matchRoute(pathname: string): Route {
  const parts = segments(pathname);
  if (!parts) return { name: "notFound" };
  if (parts.length === 0) return { name: "home" };
  if (parts.length === 1 || parts.join("/") === "methodology/lab") {
    const path = parts.join("/");
    const name = Object.hasOwn(staticRoutes, path)
      ? staticRoutes[path]
      : undefined;
    return name ? { name } : { name: "notFound" };
  }
  if (parts.length === 2 && parts[1]) {
    const id = decode(parts[1]);
    if (id === null) return { name: "notFound" };
    if (parts[0] === "members") return { name: "member", id };
    if (parts[0] === "legislation") return { name: "legislation", voteId: id };
  }
  return { name: "notFound" };
}

/** Target path for a retired route, or null. The caller keeps the query string. */
export function redirectFor(pathname: string): string | null {
  const parts = segments(pathname);
  if (!parts || parts.length !== 1) return null;
  return Object.hasOwn(redirects, parts[0]) ? redirects[parts[0]] : null;
}

/** Every static page path, aliases included. Detail pages are not listed. */
export function appPaths(): string[] {
  return Object.keys(staticRoutes).map((segment) =>
    segment ? `${base}/${segment}` : `${base}/`,
  );
}
