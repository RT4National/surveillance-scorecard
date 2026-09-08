/** Preserve report/filter parameters and anchors while carrying the selected archive. */
export function publicationUrl(
  path: string,
  publicationId?: string,
  asOf?: string,
): string {
  if (!path.startsWith("/scorecard") || path.startsWith("//")) return path;
  const url = new URL(path, "https://scorecard.invalid");
  if (url.pathname !== "/scorecard" && !url.pathname.startsWith("/scorecard/"))
    return path;
  if (
    url.pathname === "/scorecard/editor" ||
    url.pathname.startsWith("/scorecard/editor/")
  ) {
    url.searchParams.delete("publication");
    url.searchParams.delete("asOf");
  } else {
    if (publicationId) url.searchParams.set("publication", publicationId);
    if (asOf) url.searchParams.set("asOf", asOf);
  }
  return url.pathname + url.search + url.hash;
}
