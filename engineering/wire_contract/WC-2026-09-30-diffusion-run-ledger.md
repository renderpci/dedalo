# WC-2026-09-30-diffusion-run-ledger — a resumed publication run publishes what an uninterrupted one does

- **Date:** 2026-09-30, adopted with the change that closes audit row DIFF-1
  (audit 2026-09-26, closure plan Step 6).
- **Decision:** DEC-12 (lands with its gates:
  `test/unit/diffusion_resume_ledger_native.test.ts` — runner level —,
  `test/unit/diffusion_frontier_replay.test.ts` — the replay at every cut of a
  real resolution, the manifest SQL against a Set replay —, and the csv/json
  legs of `test/unit/diffusion_file_writers.test.ts`).

## Shape before (TS, to 2026-09-29)

The job row's `checkpoint` was `{cursor, run_started_at, processed}` — the
PRIMARY keyset position and nothing else. The relation FRONTIER (records the
primaries queued, drained after them), the set of records already used, the
queue-time publishable overrides (PHP's snapshot, see below) and the list of files the run wrote lived only
in the runner's memory. A resumed runner therefore:

- restarted the primaries after the cursor with an EMPTY frontier — a run that
  died after its primaries never published their linked records;
- consolidated (`diffusion_md.zip`, the rdf/xml merged document + zip) from the
  RESUMED session's files only — or not at all;
- for csv/json, finalized a fresh temp — the published "complete" snapshot lost
  every row written before the crash;
- reported counts of the resumed session only.
A cancel called `close()`: a cancelled run consolidated its partial work over
the last complete archive. The docs claimed a byte-identical resume keystone.

## Shape after

- **The run ledger** — `dedalo_ts_diffusion_job_ledger` (seam:
  `<jobs table>_ledger`), `(job_id, batch_seq, ord)` keyed, `ON DELETE
  CASCADE` with the job. Each committed batch appends, in its own fenced unit
  (WC-2026-09-30-diffusion-target-fence), the resolver's frontier transitions
  (`queue`/`open`/`used`, `section_id` as jsonb — 940101 ≠ '940101') and the
  writer's per-record artifacts (`wrote`/`removed`), together with the
  checkpoint. A completed run clears it; a cancelled or failed run keeps it (an
  admin requeue resumes).
- **Checkpoint v2** — `{v: 2, cursor, run_started_at, processed, batch_seq,
  writer, errors}`. `cursor` is only the primary keyset position; `writer` is
  the writer session's own resumable state (its counters AND its summary error
  lines); `errors` is the run's error lines so far (capped at 50, deduplicated),
  committed with the batch that produced them — a resumed run still ends
  "Partial success" for what the batches before the crash reported (the
  first-invocation dd1758 retry debt included). A non-empty checkpoint WITHOUT `v: 2`
  restarts the run from zero (its `run_started_at` is kept) — a pre-ledger
  checkpoint cannot say what the run already published.
- **Resume** replays the ledger into the exact frontier / used state (a key
  half-drained finishes first), restarts the primaries after the cursor, and
  reopens the writer from `writer`: summaries count the WHOLE run.
- **No queue-time publishable decision — a deliberate divergence from PHP.**
  PHP's `dd_diffusion_api::$publishable_overrides` snapshots, at queue time, the
  gate the drain would evaluate anyway (in TS: the target section's table-node
  `is_publishable`, else the record's own publication value), and the drain
  obeyed the snapshot. Replayed on resume it is days old (a cancelled job's
  ledger lives until the purge; an admin requeue resumes it), and since the
  snapshot is only ever "publish" it fails OPEN: a record a curator unpublished
  while the run was down was republished to the public site. TS carries no
  snapshot — in-run or in the ledger (the ledger has no `publishable` column) —
  and the drain asks the gate against the record as it is when drained. Within
  one run nothing observable changes (the drain reads the record through the
  run's own memo); across a resume, the record's CURRENT flag wins. Gate:
  diffusion_resume_ledger_native "stale publish" (red with a replayed
  queue-time "publish").
- **The ledger readers page** (keyset for the frontier, server-side cursors for
  the manifest and the removed ids; default page 5000 rows). Gate:
  diffusion_frontier_replay (d) — every reader at page sizes 1/2/3/7 and at the
  default page over a ledger several pages long, one batch alone larger than a
  page — equals the in-memory replay.
- **Close** consolidates the run's MANIFEST (a Set replay of its artifact
  events, first write after the last removal) — never a session's memory. A
  manifest record whose file is gone is a summary error line ("Partial
  success"), skipped — never a crash (gated per consolidating writer:
  diffusion_file_writers, diffusion_rdfxml_writers "file is GONE").
- **A job-scoped session keeps O(batch) memory.** Its artifact events live
  until the runner takes them into the ledger; only a session opened WITHOUT a
  job keeps a history (the stand-in manifest of a hand-driven close), and a
  job-scoped session refuses a close without the ledger's context (typed
  `internal.invariant`).
- **Cancel** never consolidates: the session releases its handles, the result
  carries the counts so far, the published archive is untouched.
- **dd1758** `published` rows are written in the batch's unit and are FATAL on
  failure (a published record without its row would never be unpublished on
  delete): exactly one row per committed publishable primary, crash or not.
- **csv / json** stream onto a JOB-scoped partial `<final>.part-<jobId>`;
  `checkpoint()` fsyncs it and records its durable length; a resumed session
  truncates it back to that length (`resumed`), and a partial that is gone or
  short answers `restart_required` (the runner resets the run). This contract
  is gated at WRITER level only: the plan compiler cannot reach csv/json today
  (`plan/formats.ts` KNOWN_FORMATS is the PHP validate set).
- `DEDALO_DIFFUSION_BATCH_RECORDS` is now honoured by the runner (read at run
  start; gated: the resume legs assert the crashed attempt committed batches).
- The batch TAIL (dd1758 rows, ledger append, progress, checkpoint) commits
  with its batch or not at all — gated by crashes INSIDE the tail (a test
  trigger at the ledger append, and at the checkpoint UPDATE).

## Why

A publication run is the public face of the archive: a resume that silently
drops the linked records, or an archive that lists a third of the run, is a
wrong public record with a green job row.
