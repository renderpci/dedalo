# WC-2026-10-21-unpublish-markers-durable — a record-delete target is confirmed only once its media markers are withdrawn and durable

- **Date:** 2026-10-21 (W4 cross-diffusion:r3, review-diff finding "Media-access marker
  unlinks on the unpublish path are not made durable (no directory fsync), unlike the
  files-unlink door the same change hardened"). Amends the S2-31 media_index port and
  `WC-2026-09-30-diffusion-target-fence` (the delete door's outcome per target).
- **Decision:** DEC-12 (gated: `test/unit/media_index_marker_durability_native.test.ts`).
- **Shape before (TS, = old engine delete_handler.ts:129-141):** the MariaDB delete executor
  (`executeSqlDeleteTargets`, the record-delete settle and the retry drains through
  `deleteDiffusionRecord`) confirmed a target (`deleted: ['<db>|<table>']` → dd1758
  `unpublished`) as soon as its rows were gone; the marker withdrawal ran after, its failure
  only logged. The marker store's writes (`dbs/<db>/<table>/K`, `pub/K`) had no fsync: a power
  cut could bring an unlinked marker back, the boot reconcile re-derived `pub/K` from it, and
  the withdrawn record's media was anonymously readable again with dd1758 saying
  `unpublished` — nothing retried it.
- **Shape after (TS):** every marker door flushes ONE directory barrier (core/files/durable.ts)
  before it answers — applyTableState, the reconcile apply, the rebuild's diff-sync and its
  stale-table sweep — and the pub/ transition seam hears a flip only after that flush. The
  delete executor confirms a target only once applyTableState returned (markers gone and
  durable). A withdrawal that throws leaves the target OUT of `deleted`, with
  `'<db>|<table>: media markers not withdrawn (<reason>) — the unpublish stays pending for the
  retry queue'` in `errors`: the dd1758 row stays `pending`, and the retry re-runs the
  idempotent DELETE and the withdrawal. The publish side is unchanged (a failed marker
  publish is logged, fail-closed, never failing the run).
- **Reason:** "unpublished" over media the web server still serves is a false record of a
  withdrawal — the one fact a heritage archive's public tier must not get wrong.
- **Gate reconciliation:** TS-only (the delete door's per-target outcome has no oracle shape;
  no re-harvest). `media_index_marker_durability_native` (a)-(e) on a temp marker store and
  the suite MariaDB (a never-created table, errno 1146): durability measured at each door's
  answer by a page-cache model of the store's calls and the directory fsyncs after them; (c)
  pins the pending outcome.
