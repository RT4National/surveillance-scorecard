// The fictional preview as a complete Dataset. Shared by the app (no publication yet) and the
// Worker's server-rendered first paint, so both show the same thing. Free of browser globals.
import { dataset as demoMetadata, members, votes, records } from "./demo";
import { rubric } from "../core/scoring";
import type { Dataset } from "../core/publication";

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
