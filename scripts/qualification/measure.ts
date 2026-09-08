import { gzipSync } from "node:zlib";
import { congressionalFixture } from "./fixtures";
import {
  createPublicationScoring,
  verifyPublicationScoring,
} from "../../src/core/publication-scores";
import type { Publication } from "../../src/core/publication";
import { digest, validateDataset } from "../../worker/validation";

for (const count of [12, 50, 250] as const) {
  const dataset = congressionalFixture(count);
  const errors = validateDataset(dataset);
  if (errors.length) throw new Error(errors.join("; "));
  const start = performance.now();
  const scoring = await createPublicationScoring(dataset);
  const createMs = performance.now() - start;
  const publication: Publication = {
    id: `capacity-${count}`,
    createdAt: "2026-09-07T00:00:00Z",
    publishedBy: "fictional-capacity@example.invalid",
    previousId: null,
    summary: "Fictional capacity qualification only",
    digest: await digest(dataset),
    dataset,
    scoring,
  };
  const verifyStart = performance.now();
  await verifyPublicationScoring(publication);
  const verifyMs = performance.now() - verifyStart;
  const draft = JSON.stringify(dataset),
    snapshot = JSON.stringify(publication);
  console.log(
    JSON.stringify({
      fictional: true,
      members: 535,
      rollcalls: count,
      records: dataset.records.length,
      draftBytes: Buffer.byteLength(draft),
      publicationBytes: Buffer.byteLength(snapshot),
      gzipPublicationBytes: gzipSync(snapshot).byteLength,
      createMs: Math.round(createMs),
      verifyMs: Math.round(verifyMs),
      nodeHeapUsedBytes: process.memoryUsage().heapUsed,
    }),
  );
}
