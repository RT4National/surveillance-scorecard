import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { scoreMember } from "../core/scoring";
import {
  publishedScore,
  verifyPublicationScoring,
} from "../core/publication-scores";
import type {
  Dataset,
  Publication,
  PublicationSummary,
} from "../core/publication";
import {
  bindingOf,
  checkIndex,
  checkSlice,
  sameBinding,
  type IndexScore,
  type MemberSlice,
  type PublicationIndex,
} from "../core/publication-index";
import type { ActionCounts } from "../core/copy";
import { matchRoute } from "../core/routes";
import type { Member } from "../core/types";
import { demoDataset } from "./demo-dataset";

export { demoDataset };
type Score = ReturnType<typeof scoreMember>;
/**
 * A score as the app shows it. Headline scores from the slim index carry precomputed `actions`
 * and no evidence rows: reading `evidence` on one throws, so a view that needs evidence cannot
 * silently show an empty record.
 */
export type ViewScore = Score & { actions?: ActionCounts };
/**
 * The dataset the app shows. On slim views (home, finder, a profile) it holds the active roster,
 * votes and rubric from the index, plus one member's records on a profile; `sourceCount` stands
 * in for the source captures, which are not loaded there.
 */
export type ViewDataset = Dataset & { sourceCount?: number };
/**
 * How much of the publication is loaded. "index": the slim index (home, finder). "member": the
 * index plus one member's evidence (a profile). "full": the complete, verified publication.
 */
export type Level = "index" | "member" | "full";
type LoadState = {
  dataset: ViewDataset;
  publication?: Publication;
  state: "loading" | "published" | "demo" | "error";
  error?: string;
  level?: Level;
  index?: PublicationIndex;
  slice?: MemberSlice;
};
type DataState = LoadState & {
  /**
   * Publication to carry in links: set only when the visitor arrived pinned to one with
   * ?publication=. Exports and reports record `publication.id` instead, pinned or not.
   */
  linkId?: string;
  /** Newest first. Null until loaded, and if the list request fails. */
  publications: PublicationSummary[] | null;
  score: (member: Member, asOf?: string) => ViewScore;
};
const demoScore = (member: Member, asOf = demoDataset.asOf) =>
  scoreMember(
    member,
    demoDataset.votes,
    demoDataset.records,
    demoDataset.rubric,
    asOf,
  );
const DataContext = createContext<DataState>({
  dataset: demoDataset,
  state: "loading",
  publications: null,
  score: demoScore,
});

const isSummary = (p: unknown): p is PublicationSummary =>
  !!p &&
  typeof (p as PublicationSummary).id === "string" &&
  typeof (p as PublicationSummary).createdAt === "string" &&
  ((p as PublicationSummary).previousId === null ||
    typeof (p as PublicationSummary).previousId === "string");

/** The slim view a route needs. Everything not listed loads the full publication. */
export function levelFor(pathname: string): Level {
  const route = matchRoute(pathname);
  if (
    route.name === "home" ||
    route.name === "find" ||
    route.name === "notFound"
  )
    return "index";
  if (route.name === "member") return "member";
  return "full";
}

/** The publication the server rendered this page from (worker/index.ts, shell). */
function pageBinding(): { id: string; digest: string } | undefined {
  const root =
    typeof document === "undefined" ? null : document.getElementById("root");
  const id = root?.dataset.publication;
  const digest = root?.dataset.digest;
  return id && digest ? { id, digest } : undefined;
}

const mismatch =
  "The scorecard data does not match this page. Reload to try again.";
const api = "/scorecard/api/publications/";

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "Publication API is unavailable. Use the Cloudflare local preview for the complete application.",
    );
  return response.json();
}

/** Full publication: dataset digest and frozen scoring are verified here, as they always were. */
async function loadFull(
  id: string,
  pinned: string | null,
  page: { id: string; digest: string } | undefined,
  signal: AbortSignal,
): Promise<Publication | null> {
  const response = await fetch(api + encodeURIComponent(id), { signal });
  if (response.status === 404 && !pinned && !page) return null;
  if (!response.ok)
    throw new Error(
      pinned
        ? "The requested publication could not be loaded."
        : "The published scorecard could not be loaded.",
    );
  const publication = (await readJson(response)) as Publication;
  if (
    !publication.id ||
    !publication.dataset ||
    !Array.isArray(publication.dataset.members) ||
    !publication.dataset.rubric
  )
    throw new Error("Invalid publication response.");
  if (pinned && publication.id !== pinned)
    throw new Error(
      "The server returned a different publication than the requested archive.",
    );
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(publication.dataset)),
  );
  const digest = Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== publication.digest)
    throw new Error(
      "Publication integrity check failed. The scorecard was not displayed.",
    );
  await verifyPublicationScoring(publication);
  if (page && !sameBinding(page, publication)) throw new Error(mismatch);
  return publication;
}

async function loadIndex(
  id: string,
  pinned: string | null,
  page: { id: string; digest: string } | undefined,
  signal: AbortSignal,
): Promise<PublicationIndex | null> {
  const response = await fetch(`${api}${encodeURIComponent(id)}/index`, {
    signal,
  });
  if (response.status === 404 && !pinned && !page) return null;
  if (!response.ok)
    throw new Error(
      pinned
        ? "The requested publication could not be loaded."
        : "The published scorecard could not be loaded.",
    );
  const index = checkIndex(await readJson(response));
  if (pinned && index.publication.id !== pinned)
    throw new Error(
      "The server returned a different publication than the requested archive.",
    );
  // The index is derived on the server; it must name the publication this page shows.
  if (page && !sameBinding(index.publication, page)) throw new Error(mismatch);
  return index;
}

async function loadSlice(
  id: string,
  memberId: string,
  signal: AbortSignal,
): Promise<MemberSlice | null> {
  const response = await fetch(
    `${api}${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}`,
    { signal },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error("This member's evidence could not be loaded.");
  return checkSlice(await readJson(response));
}

/** The dataset and publication objects the app reads, built from the index (and a slice). */
export function slimView(
  index: PublicationIndex,
  slice?: MemberSlice,
): { dataset: ViewDataset; publication: Publication } {
  const extra =
    slice && !index.members.some((m) => m.id === slice.member.id)
      ? [slice.member]
      : [];
  const dataset: ViewDataset = {
    id: index.dataset.id,
    asOf: index.dataset.asOf,
    demo: index.dataset.demo,
    rubric: index.dataset.rubric,
    coverage: index.dataset.coverage,
    votes: index.dataset.votes,
    members: [...index.members, ...extra],
    records: slice?.records ?? [],
    affiliations: slice?.affiliations,
    sources: [],
    sourceCount: index.dataset.sourceCount,
  };
  const p = index.publication;
  return {
    dataset,
    publication: {
      id: p.id,
      createdAt: p.createdAt,
      publishedBy: "",
      previousId: p.previousId,
      summary: p.summary,
      digest: p.digest,
      dataset,
      // Only the loaded member's frozen evidence; everyone else's headline comes from the index.
      scoring:
        p.scoringDigest === null
          ? undefined
          : {
              version: "1",
              digest: p.scoringDigest,
              scores:
                slice?.score != null
                  ? { [slice.member.id]: slice.score }
                  : Object.create(null),
            },
    },
  };
}

/** A headline score from the index. Its evidence was never loaded; reading it throws. */
function headline(s: IndexScore): ViewScore {
  const score = { ...s } as ViewScore;
  Object.defineProperty(score, "evidence", {
    enumerable: false,
    get() {
      throw new Error("Evidence is not loaded for this view.");
    },
  });
  return score;
}

/**
 * The score lookup for a loaded state, memoized per member and date. At the publication's own
 * cutoff it returns the frozen published score (from the index on slim views); any other date
 * recalculates with the current engine (`publishedScore`), which needs that member's records.
 */
export function makeScorer(
  state: Pick<
    LoadState,
    "dataset" | "publication" | "level" | "index" | "slice"
  >,
): (member: Member, asOf?: string) => ViewScore {
  const cache = new Map<string, ViewScore>();
  const { dataset, publication, index, slice } = state;
  const compute = (member: Member, asOf: string): ViewScore => {
    if (!publication)
      return scoreMember(
        member,
        dataset.votes,
        dataset.records,
        dataset.rubric,
        asOf,
      );
    if (!index || state.level === "full")
      return publishedScore(publication, member, asOf);
    if (slice && member.id === slice.member.id)
      return publishedScore(publication, member, asOf);
    const frozen = index.scores?.[member.id];
    if (frozen && asOf === dataset.asOf) return headline(frozen);
    throw new Error(
      `Recalculating ${member.id} needs the full publication, not the slim index.`,
    );
  };
  return (member, asOf = dataset.asOf) => {
    const key = `${member.id}\u0000${asOf}`;
    let s = cache.get(key);
    if (!s) cache.set(key, (s = compute(member, asOf)));
    return s;
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadState>({
    dataset: demoDataset,
    state: "loading",
  });
  const [publications, setPublications] = useState<PublicationSummary[] | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const pinned = new URLSearchParams(window.location.search).get(
      "publication",
    );
    const page = pageBinding();
    // The page's own publication when the Worker named it, so every request is by ID (cacheable).
    const id = pinned ?? page?.id ?? "latest";
    const route = matchRoute(window.location.pathname);
    const level = levelFor(window.location.pathname);
    const memberId = route.name === "member" ? route.id : undefined;
    async function load(): Promise<LoadState | null> {
      if (level !== "full") {
        // A profile asks for the member's evidence alongside the index when the ID is known.
        const early =
          memberId && id !== "latest"
            ? loadSlice(id, memberId, signal)
            : undefined;
        early?.catch(() => undefined);
        const index = await loadIndex(id, pinned, page, signal);
        if (!index) return null;
        // Legacy publications without frozen scores keep the full, recalculated path.
        if (index.scores !== null) {
          if (!memberId)
            return { ...slimView(index), state: "published", level, index };
          const slice = await (early ??
            loadSlice(index.publication.id, memberId, signal));
          if (slice && !sameBinding(slice.publication, index.publication))
            throw new Error(mismatch);
          if (!slice && index.members.some((m) => m.id === memberId))
            throw new Error("This member's evidence could not be loaded.");
          return {
            ...slimView(index, slice ?? undefined),
            state: "published",
            level: "member",
            index,
            slice: slice ?? undefined,
          };
        }
        const full = await loadFull(index.publication.id, pinned, page, signal);
        if (!full) return null;
        if (!sameBinding(index.publication, bindingOf(full)))
          throw new Error(mismatch);
        return {
          dataset: full.dataset,
          publication: full,
          state: "published",
          level: "full",
        };
      }
      const full = await loadFull(id, pinned, page, signal);
      return full
        ? {
            dataset: full.dataset,
            publication: full,
            state: "published",
            level: "full",
          }
        : null;
    }
    void load()
      .then((loaded) => {
        if (signal.aborted) return;
        if (!loaded) {
          setState({ dataset: demoDataset, state: "demo" });
          return;
        }
        // The latest publication leaves the address clean; only a pinned visit keeps ?publication=.
        setState(loaded);
        // Small second request for the freshness label and newer-version notice.
        // Failure leaves the list null and the page falls back to the date.
        void fetch("/scorecard/api/publications", { signal })
          .then(async (r) => (r.ok ? ((await r.json()) as unknown) : null))
          .then((body) => {
            const rows = (body as { publications?: unknown } | null)
              ?.publications;
            if (!signal.aborted && Array.isArray(rows) && rows.every(isSummary))
              setPublications(rows);
          })
          .catch(() => undefined);
      })
      .catch((error) => {
        if (!signal.aborted)
          setState({
            dataset: demoDataset,
            state: "error",
            error:
              error instanceof Error
                ? error.message
                : "Publication request failed.",
          });
      });
    return () => controller.abort();
  }, []);
  const linkId =
    state.publication &&
    new URLSearchParams(window.location.search).get("publication") ===
      state.publication.id
      ? state.publication.id
      : undefined;
  const score = useMemo(() => makeScorer(state), [state]);
  return (
    <DataContext.Provider value={{ ...state, publications, linkId, score }}>
      {children}
    </DataContext.Provider>
  );
}
export function useScorecard() {
  const state = useContext(DataContext);
  return {
    ...state,
    ...state.dataset,
  };
}
