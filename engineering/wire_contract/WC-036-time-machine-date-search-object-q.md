# WC-036 — time-machine date search: object-q handled + directional operators implemented (PHP dropped both)

- **Date:** 2026-07-17 (reported: "When" (dd547) search in section Activity
  (dd542) does not filter; then: its operators `>`/`<` fail).
- **Context:** date components on the `matrix_activity` / `matrix_time_machine`
  tables store their value in the dedicated `timestamp` timestamptz column, so
  PHP routes them to `trait.search_component_date_tm` (SARGable `"timestamp"`
  ranges) instead of the JSONB `date` path. `builder_date.ts` gained that
  routing. Two behaviours here deliberately go BEYOND the frozen oracle:
- **Object-q (the parity FIX, restores PHP behaviour — recorded for context, not
  a divergence):** the date search widget sends its value as a STRUCTURED object
  (`data.entries: [{start:{year,month,day?}, id}]`), never plain text. PHP
  passes structured q straight through (`extract_normalized_date_q`
  is-object branch); the earlier TS builder `String()`-ified it to
  `"[object Object]"`, failed the `YYYY-MM-DD` regex, and DROPPED the clause —
  so every date search ran unfiltered. TS now normalizes object-q. This matches
  PHP, so it is not a divergence.
- **Shape before (PHP, the real divergence):** the `_tm` handler's operator
  switch has NO directional cases — `<`, `>`, `>=`, `<=`, `=` and the default
  all fall through to one body that builds the SAME half-open equality range.
  PHP's own comment: directional operators "are not yet implemented and all
  fall through to the range equality treatment." So `>2026` matched the 2026
  range (behaved like `=`); nothing "after"/"before" a date was ever reachable.
- **Shape after (TS):** each typed value defines a precision-sized half-open
  period `[lower, upper)` (whole year / month / day), and the operator picks the
  boundary: `=`/none → `>= lower AND < upper`; `>` → `>= upper` (strictly after
  the whole period); `>=` → `>= lower`; `<` → `< lower`; `<=` → `< upper`.
  Partial dates thus compare as spans — `>2026` → `>= 2027-01-01`. Bounds travel
  as bound `_Q_` params (a plain column comparison, not jsonpath). The in-string
  op prefix (`>2026`) still wins over the sqo `q_operator` (PHP
  `dd_date->set_op`). Existence `*`/`!*` test the `timestamp` column
  (`IS [NOT] NULL`).
- **Why:** functionality — the frozen PHP left this a documented gap; a date
  field whose operators silently no-op is a defect, not a contract. Same
  functionality-over-parity posture as WC-012 / WC-014. Ordinary (non-TM) JSONB
  sections keep the v0 `start.time <op> t` predicate (range-mode still ledgered
  known-open in `rewrite/LEDGER.md`).
- **Gate reconciliation:** no differential reds — no parity gate sends a date-q
  operator (they would now deliberately diverge), and the object-q path only
  reaches PHP-agreeing behaviour. TS ground truth pinned in
  `test/unit/search_date_builder.test.ts` (object/plain-text q, all five
  comparison operators + whole-period spans, in-string-op precedence,
  existence ops, drop-on-unparseable). No re-harvest needed (the golden store
  has no Activity date-search fixture).

## Addendum 2026-08-09 — the "ordinary sections keep the v0 predicate" tail is RETIRED

The entry above closed with: *"Ordinary (non-TM) JSONB sections keep the v0
`start.time <op> t` predicate (range-mode still ledgered known-open in
`rewrite/LEDGER.md`)."* **That sentence no longer describes the engine and must
not be cited.** It described a v0 scope gap, not a divergence — and the gap was
a silent wrong answer.

**What the tail was hiding.** A partial date is a PERIOD, not an instant. PHP's
ordinary-table handler (`resolve_date_mode_date_range_sql`) expands the typed
value to `[time, final_range]` via `component_date::get_final_search_range_seconds`
and emits an INTERVAL OVERLAP; its `>` and `<=` compare against `final_range`,
not against the period's first second. The v0 TS predicate compared a single
`start.time` against the period's FIRST SECOND, so a year-only search matched
only records stamped on 1 January: measured on the live `oh1` archive,
**0 of 29 matching records** (audits/2026-08_oh1_beta §5.5), with no error.
`>` and `<=` were wrong by up to a whole period in the same way.

**What is live now (PHP parity, so nothing here is a divergence):**

- `date` / `range` — `'<'`/`'>='` threshold on the period start; `'>'`/`'<='`
  threshold on the period END; `'='`/default the two-branch overlap
  `(start <= t && end >= t) || (start >= t && start <= final)`.
- `period` — equality on the `period` container (`@.period.time == t`), every
  operator, as PHP.
- `time` — `'='` is a window over the typed precision (`14` → 14:00:00–14:59:59);
  other operators compare the exact typed second.
- `date_time` — same boundary choice as `date`/`range`, but `'='` is a plain
  `start.time` window (a date_time value has no `end` container).
- `date_mode` reaches the builder as `BuilderContext.dateMode`, read in
  `conform.ts` from the node's effective properties — PHP's
  `get_date_search_context` reads the same property, with the same `?? 'date'`
  fallback.

**Unchanged by this addendum:** everything else in the entry above. The
time-machine (`matrix_activity` / `matrix_time_machine`) `"timestamp"` routing,
its directional-operator implementation and the object-q normalization are as
originally recorded, and `timeMachineDatePredicates` remains the single source
of truth shared with `resolve/tm_filter.ts`. One clarification: the in-string op
prefix (`>2026`) winning over the sqo `q_operator` is a TS choice on BOTH paths
— PHP stores it on the dd_date via `set_op` but never consults it when building
SQL.

**Two things about the rebuilt ordinary path that ARE divergences** — an
uncovered `date_mode` throwing instead of emitting no predicate, and the
comparison ordinal always being derived rather than taken from the client's
`time` field — have their own entry:
`WC-2026-08-09-date-search-uncovered-mode-throws`.

**Gate:** `test/unit/search_date_and_ancestors_native.test.ts` asserts the
real-world case against real stored rows (a year-only q matching a record dated
1628-06-09) through the live conform → render path, plus the per-mode and
per-operator shapes. **No re-harvest** — the golden store has no ordinary-table
date-search fixture, and there is no live oracle left to diff against.
