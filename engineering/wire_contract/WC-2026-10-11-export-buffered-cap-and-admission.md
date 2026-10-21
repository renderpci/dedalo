# WC-2026-10-11-export-buffered-cap-and-admission — the export selection is a cursor; the buffered envelope is capped; exports are admitted

- **Date:** 2026-10-11 (audit 2026-09-26 closure plan, Step 8 PERF-1, lane 1).
- **Decision:** the export's record selection is materialized ONCE, in one snapshot, as a
  server-side hold cursor and paged into the walk (`src/diffusion/export/selection_cursor.ts`)
  — never loaded whole into the process. Two refusals become visible on the wire.
- **Shape before:** `tool_export` `get_export_grid` (and the background export) fetched
  every `(section_tipo, section_id)` of the selection with one statement before the first
  line; `meta.total` was that array's length. The buffered envelope (`ndjson_stream` not
  `true`) then held the whole grid in memory, whatever the selection size. Nothing bounded
  how many selections were open at once.
- **Shape after:**
  - **meta.total** — unchanged in value and type: the snapshot's exact count (from the
    cursor's `MOVE FORWARD ALL`), equal to the records emitted and to `end.records`. A
    record written while the export runs is neither emitted nor counted (it was: the old
    single statement also ran at open, so the observable set is the same).
  - **Buffered envelope cap** — a selection above `DEDALO_SEARCH_CLIENT_MAX_LIMIT` asked
    for in the buffered form is refused BEFORE any hydration with
    `export.format_limit` `{format:'json_envelope', limit:<ceiling>}` (400, not retryable).
    The same selection is served by the NDJSON stream and the background export.
  - **Admission** — at most `max(1, floor(DB_POOL_MAX / 4))` selections open per process.
    Beyond that, a REQUEST-path open (`get_export_grid`, buffered or streamed) is refused at
    once with `export.busy` `{slots}` (503, retryable) — never queued on the pool. A
    BACKGROUND export (`build_export_artifact`, lane `export`) that its lane already admitted
    is never refused for this: it waits FIFO for the next slot (a freed slot is handed to the
    first waiter, so eager opens cannot starve it), and its job signal ends the wait
    (`export.cancelled`). Effective background concurrency = `min(lane budget, slots)`. A
    server with `DB_POOL_MAX=1` admits none, in either path (a cursor would hold the
    connection its own hydration needs), and refuses with `export.busy`.
  - A consumer that stops early (stream cancelled, job failure) releases the cursor even
    before the first line; a cancelled NDJSON body resolves only once it is released.
  - **Consumer idle** — a consumer that holds control for 15 minutes without pulling the
    next line (an NDJSON client that stopped reading) is closed out: the cursor and its
    connection are released and the export ends with `export.consumer_idle` `{idle_s}`
    (429, retryable) — never `export.cancelled`, which stays the user's Stop. Only the
    consumer's time counts: the window is stopped while the export works (hydration,
    external prefetch, tabulation), so a slow export that keeps pulling is never cut,
    however long it runs (the export lane has no deadline by design).
- **Client:** `tool_export` already chooses the stream for large selections; the buffered
  refusal renders through the code's label.
- **Reason:** a whole selection held in the process (and, buffered, the whole grid) made
  an export's memory a function of the selection size; an unbounded number of open
  selections would starve the request pool.
- **Gate reconciliation:** no fixture edit, no re-harvest — the frozen `tool_export`
  differentials select a handful of records (`filter_by_locators`), below the ceiling, so
  their buffered answers are unchanged. Gate: `test/unit/export_selection_cursor_native.test.ts` (order = the one-statement
  order for admin and a narrowed non-admin; pages of at most `selectionPage` rows; total;
  snapshot; release — an open whose DECLARE fails, a consumer aborted while it holds control,
  a cursor never pulled past the idle window, a FETCH that fails and a PRODUCER that fails
  mid-run (buffered drain and NDJSON body, no `return()` from the consumer) give the slot and
  the connection back at once; admission — eager `export.busy`, a queued background build
  that completes once a slot frees, a queued wait ended by its signal, a queued open whose
  signal fired BEFORE it queued refused at once, `DB_POOL_MAX=1` refusing; buffered cap; the
  total's one source — the driver's MOVE command-tag count, pinned (no second counting path);
  consumer idle — a producer stalled past a seam-shortened window on the FIRST chunk of a page
  and on a LATER chunk of the same page (no page pull in between) and a slow consumer
  complete, a stalled consumer is closed out with `export.consumer_idle`; a cancelled stream
  resolves after release).

## Addendum 2026-10-21 — the selection is computed under the statement ceiling

- **Shape before:** the hold cursor was declared in autocommit; PostgreSQL computes a hold
  cursor IN FULL at commit and disarms `statement_timeout` before that commit, so the whole
  selection ran with NO ceiling (measured: 300 ms ceiling, a 2343 ms selection served) — an
  export's selection was the one request-path statement `DB_STATEMENT_TIMEOUT_MS` did not
  bound.
- **Shape after:** the cursor's transaction carries a transaction-local `transaction_timeout`
  equal to the reserved connection's own `statement_timeout` (the request pool's
  `DB_STATEMENT_TIMEOUT_MS`; 0 = unbounded, unchanged). A selection past it is refused at
  open — before `meta` — with `db.statement_timeout` (503, not retryable), the code every
  other statement past the ceiling already answers; the slot and the connection are back
  (PostgreSQL ends that backend; the pool replaces it). With the default `0` nothing changes.
- **Gate:** `test/unit/export_selection_cursor_native.test.ts` leg 15 (a process booted with
  a 300 ms ceiling: a 3 s selection refused with `db.statement_timeout` within the bound, a
  quick one served, every pooled connection fresh after the refusal and after a failed
  DECLARE) and leg 16 (a pre-aborted open answers its total and releases at once).
