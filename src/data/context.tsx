import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { dataset as demoMetadata, members, votes, records } from "./demo";
import { rubric, scoreMember } from "../core/scoring";
import {
  publishedScore,
  verifyPublicationScoring,
} from "../core/publication-scores";
import type { Dataset, Publication } from "../core/publication";
import type { Member } from "../core/types";

export const demoDataset: Dataset = {
  ...demoMetadata,
  members,
  votes,
  records,
  rubric,
  sources: [],
  coverage: [
    "Fictional demonstration records. Not an official congressional dataset.",
  ],
};
type DataState = {
  dataset: Dataset;
  publication?: Publication;
  state: "loading" | "published" | "demo" | "error";
  error?: string;
};
const DataContext = createContext<DataState>({
  dataset: demoDataset,
  state: "loading",
});

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({
    dataset: demoDataset,
    state: "loading",
  });
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
        if (!pinned) {
          const url = new URL(window.location.href);
          url.searchParams.set("publication", publication.id);
          window.history.replaceState(
            null,
            "",
            url.pathname + url.search + url.hash,
          );
        }
        setState({
          dataset: publication.dataset,
          publication,
          state: "published",
        });
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
  return <DataContext.Provider value={state}>{children}</DataContext.Provider>;
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
