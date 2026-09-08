# Congressional-scale storage qualification

Qualification date: 2026-09-08 UTC. Every member, vote, outcome and explanation in these tests is **fictional**. The fixture has 435 House members and 100 senators, and records only members of the chamber voting. These results establish behavior on generated data, not completeness or correctness of congressional evidence.

## Why storage changed

The old 1.8 MB limit applied to the full uncompressed Publication. It was adequate for a small scorecard but rejected a reasonable 50-rollcall history. Current [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) specify a 2,000,000-byte maximum string, BLOB or row. Increasing a raw JSON column past that boundary would not fix the problem.

`node --import tsx scripts/qualification/measure.ts` produced:

| Rollcalls | Member/vote records | Raw Dataset bytes | Raw Publication bytes | Gzip Publication bytes | Create frozen scores | Verify frozen scores |
| --------- | ------------------: | ----------------: | --------------------: | ---------------------: | -------------------: | -------------------: |
| 12        |               3,210 |           487,926 |             1,293,107 |                 44,863 |                24 ms |                18 ms |
| 50        |              13,375 |         1,640,872 |             4,441,880 |                146,552 |                80 ms |                45 ms |
| 250       |              66,875 |         7,709,222 |            20,841,455 |                651,975 |               420 ms |               381 ms |

Timing is a single Node measurement, not a distribution, edge latency or CPU-time claim. Compression ratios reflect a deterministic synthetic corpus with repeated schema and fictional prose; do not assume identical ratios for new data.

## Versioned compressed storage

The existing D1 columns now store either legacy inline JSON or a `gzip-v1` JSON envelope. The envelope contains gzip/base64 data, the exact expanded byte length, a SHA-256 checksum over the expanded UTF-8 bytes, and the small metadata fields needed by SQL. Payloads below 128 KB remain inline. No database migration or extra Cloudflare binding is needed.

The public API still returns the same full Dataset/Publication format. Decode validates the encoding version, lengths and checksum with a bounded decompression stream. Every copied metadata field must match the decoded payload; unknown fields and missing required metadata are refused. Dataset and frozen-score checksums remain independently available to client verification. Unsupported versions, corrupt payloads and deceptive expansion lengths fail closed. These are consistency checks, not signatures or publisher authentication.

These limits are intentional and separate:

| Boundary                                       |                  Limit |
| ---------------------------------------------- | ---------------------: |
| Incoming JSON request                          | 12,000,000 UTF-8 bytes |
| Public corrections and staff control requests  |     20,000 UTF-8 bytes |
| Expanded stored payload                        | 32,000,000 UTF-8 bytes |
| Compressed gzip bytes                          |        1,340,000 bytes |
| Encoded D1 payload/envelope                    |  1,800,000 UTF-8 bytes |
| Editorial summaries and resolution/reason text |       4,000 characters |

Large or poorly compressing data can still exceed these bounds and receives a clear 413. Evidence is never truncated automatically. Payload compression occurs before the existing conditional D1 insert, so publication insertion, draft transition, current-pointer selection and audit remain one atomic transaction. Failed compression or a stale base cannot change the current publication. Existing immutable snapshot/audit triggers remain in force.

Review constructs the complete prospective publication, including frozen scores, and preflights its capacity before recording approval. It reserves a maximum-length publisher identity and an extra 4 KB of stored metadata space. A stageable draft may still be too large to publish; such a draft stays unreviewed, receives a precise 413, and can be reduced by its editor. A deliberately over-capacity 390-rollcall fixture verifies this boundary; it is not an additional supported scale claim.

The publication list selects metadata directly in SQL and never loads all snapshot payloads. The staff draft list similarly returns only `{id, summary, version, status, author, reviewer, updated_at, base_publication_id, datasetId, asOf, demo}`. `GET /scorecard/api/staff/drafts/:id` loads one complete draft on demand. This avoids accidentally inflating 100 large drafts in a single response.

## Actual local workerd qualification

`node --import tsx scripts/qualification/workerd.ts` bundles the actual Worker and runs it in local workerd with local D1. It uses freshly generated RSA identities and a local JWKS response, exercises the real authentication code, and refuses unrelated outbound requests. No auth bypass is shipped or used. The run first confirms anonymous writes return 401, then creates, independently reviews, publishes, loads and verifies each scale fixture.

| Rollcalls | Stored Publication bytes | Complete workflow | Publish request and response parse | Public load and client verification |
| --------- | -----------------------: | ----------------: | ---------------------------------: | ----------------------------------: |
| 12        |                   60,270 |            115 ms |                              33 ms |                               31 ms |
| 50        |                  193,824 |            334 ms |                             120 ms |                               91 ms |
| 250       |                  864,667 |          1,522 ms |                             533 ms |                              444 ms |

All three workflows succeeded in the local Worker runtime and kept each D1 row below the reserved 1.8 MB boundary. Differences from the standalone gzip measurement include base64, metadata, generated IDs, predecessor references and the runtime's compression implementation. The measured workflow includes local SQL, authentication and JSON transport; it is not isolated server CPU time. Client verification occurs in the harness after public load.

The same runtime run also stages the intentionally oversized 390-rollcall fixture and verifies review returns 413 while the saved draft remains in `draft` status. The measurements above are the final run after adding metadata consistency validation and review-capacity preflight; timing varies with local load.

For comparison, `node --import tsx scripts/qualification/local-d1.ts` runs the same handler in Node with real local D1 and RSA fixtures. Its 250-rollcall workflow completed in 1,280 ms, with a 869,868-byte stored publication. Host Node heap reached about 149 MB because that process also holds Miniflare and multiple request/response/test objects; it is **not** a measurement of the Worker isolate. The actual workerd test does not expose peak isolate heap, and a successful local run is not proof of deployment memory headroom or production concurrency. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and the chosen account's CPU settings still apply. No claim of a measured 128 MB peak or deployed capacity is made.

## Regression coverage and remaining qualification

`npx vitest run worker/capacity.test.ts worker/storage.test.ts worker/publishing.test.ts` covers all three 535-member workflows against local D1, list/detail behavior, immutable publication roundtrips, legacy reading, checksum/expansion failures, oversized inputs, roles, review and stale-base protections. The standalone workerd script is an additional runtime check, not a substitute for these assertions.

Before production, repeat against the real staged dataset, verify its compression ratio and payload size, and measure edge latency/CPU, concurrency and failure recovery on the actual Cloudflare plan. Re-run after changing the schema, score snapshot format or codec. If legitimate data exceeds the compressed-row or expansion bounds, implement separate object storage or period partitioning while preserving immutable references and checksums; do not merely raise the D1 row limit or drop evidence. This implementation qualifies the specified synthetic 250-rollcall scope locally, not unlimited multi-decade history.
