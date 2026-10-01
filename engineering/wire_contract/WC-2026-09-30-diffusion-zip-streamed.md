# WC-2026-09-30-diffusion-zip-streamed — consolidated archives are streamed, byte-identical, and refuse ambiguity

- **Date:** 2026-09-30, adopted with the change that closes audit rows
  PERF-2 / DIFF-4 (audit 2026-09-26, closure plan Step 6).
- **Decision:** DEC-12 (gates: `test/unit/diffusion_artifact_rss_native.test.ts`
  — spawned-child peak RSS —, `test/unit/zip_stream_native.test.ts` A + F,
  `test/unit/diffusion_rdfxml_writers.test.ts` streamed merge == frozen oracle,
  `test/unit/ops_runtime_pin.test.ts` outcome leg).

## Shape before (TS, to 2026-09-29)

`createZip` read every input whole and concatenated them into one more buffer
(`buildStoreZip`) — peak memory about twice the archive; the rdf/xml merge
joined every part in memory. Duplicate basenames overwrote each other silently
(the last one won); an empty archive was an untyped `Error`.

## Shape after

- **Archive bytes UNCHANGED** for the same inputs: STORE, zeroed time/date,
  sizes + CRC in the local header, no data descriptor, input order — now
  written by the kernel's `addStoredFile` (two passes from disk) through an
  fsynced temp + rename. The merged rdf/xml documents are byte-identical to the
  frozen in-memory merge (test/helpers/merge_oracle.ts), streamed one part at a
  time.
- **Duplicate entry names are REFUSED** (case-insensitive), typed
  `internal.invariant`, leaving no archive and no temp — never a silently
  dropped entry.
- **Zero valid entries** is the typed `internal.invariant` (was an untyped
  `Error`), leaving nothing.
- A source that changes between the two passes is refused, typed — its size
  OR, at the same size, its bytes (the CRC; zip_stream_native "rewritten in
  place").
- A file MISSING — at its stat, or gone when pass 1 opens it (nothing is
  written and no name claimed yet) — is skipped with a warning, the archive
  byte-identical to one built without it; one gone BETWEEN the passes (a
  partial entry is in the sink) is the typed `internal.invariant` and the
  archive is abandoned (diffusion_file_writers "createZip: a file gone…").
