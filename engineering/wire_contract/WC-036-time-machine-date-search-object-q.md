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
