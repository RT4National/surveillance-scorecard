import {
  createContext,
  useContext,
  useEffect,
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
import type { Member } from "../core/types";
import { demoDataset } from "./demo-dataset";

export { demoDataset };
type LoadState = {
  dataset: Dataset;
  publication?: Publication;
  state: "loading" | "published" | "demo" | "error";
  error?: string;
};
type DataState = LoadState & {
  /**
   * Publication to carry in links: set only when the visitor arrived pinned to one with
   * ?publication=. Exports and reports record `publication.id` instead, pinned or not.
   */
  linkId?: string;
  /** Newest first. Null until loaded, and if the list request fails. */
  publications: PublicationSummary[] | null;
};
const DataContext = createContext<DataState>({
  dataset: demoDataset,
  state: "loading",
  publications: null,
});

const isSummary = (p: unknown): p is PublicationSummary =>
  !!p &&
  typeof (p as PublicationSummary).id === "string" &&
  typeof (p as PublicationSummary).createdAt === "string" &&
  ((p as PublicationSummary).previousId === null ||
    typeof (p as PublicationSummary).previousId === "string");

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
    const pinned = new URLSearchParams(window.location.search).get(
      "publication",
    );
    const path =
      "/scorecard/api/publications/" +
      (pinned ? encodeURIComponent(pinned) : "latest");
    void fetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404 && !pinned) {
          setState({ dataset: demoDataset, state: "demo" });
          return;
        }
        if (!response.ok)
          throw new Error(
            pinned
              ? "The requested publication could not be loaded."
              : "The published scorecard could not be loaded.",
          );
        if (!response.headers.get("content-type")?.includes("application/json"))
          throw new Error(
            "Publication API is unavailable. Use the Cloudflare local preview for the complete application.",
          );
        const publication = (await response.json()) as Publication;
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
        if (controller.signal.aborted) return;
        // The latest publication leaves the address clean; only a pinned visit keeps ?publication=.
        setState({
          dataset: publication.dataset,
          publication,
          state: "published",
        });
        // Small second request for the freshness label and newer-version notice.
        // Failure leaves the list null and the page falls back to the date.
        void fetch("/scorecard/api/publications", {
          signal: controller.signal,
        })
          .then(async (r) => (r.ok ? ((await r.json()) as unknown) : null))
          .then((body) => {
            const rows = (body as { publications?: unknown } | null)
              ?.publications;
            if (
              !controller.signal.aborted &&
              Array.isArray(rows) &&
              rows.every(isSummary)
            )
              setPublications(rows);
          })
          .catch(() => undefined);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
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
  return (
    <DataContext.Provider value={{ ...state, publications, linkId }}>
      {children}
    </DataContext.Provider>
  );
}
export function useScorecard() {
  const state = useContext(DataContext);
  return {
    ...state,
    ...state.dataset,
    score: (member: Member, asOf = state.dataset.asOf) =>
      state.publication
        ? publishedScore(state.publication, member, asOf)
        : scoreMember(
            member,
            state.dataset.votes,
            state.dataset.records,
            state.dataset.rubric,
            asOf,
          ),
  };
}
