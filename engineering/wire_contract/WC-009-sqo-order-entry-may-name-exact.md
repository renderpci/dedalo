# WC-009 — `sqo.order` entry may name an exact column with `path:[{ column }]` (PHP requires `component_tipo`)

- **Date:** 2026-07-09 (user-requested: coherent order convention).
- **Shape before (PHP):** `trait.order.php build_sql_query_order` requires a
  `component_tipo` on every order entry (validated at :155-163: it must be a
  member of `search::$ar_direct_columns` or a valid tipo, else the entry is
  SKIPPED). PHP's `column` field is an OPTIONAL override that still needs
  `component_tipo` (it supplies the SELECT alias `<component_tipo>_order`). So an
  order authored as `path:[{ column:"section_id" }]` (no `component_tipo`) is
  IGNORED by PHP → the list falls back to `section_id ASC`.
- **Shape after (TS):** the `sqo.order` path end-step accepts EITHER
  `component_tipo` (order by a component's value — the generic case) OR a
  standalone `column` (order by an exact structural/flat matrix column —
  id/section_id/section_tipo/… — the direct case). `component_tipo` WINS when
  both are present. `buildOrderClauses` honors a `column`-only entry
  (`src/core/search/sql_assembler.ts`), so `path:[{ column:"section_id" }]`
  orders `section_id DESC`. `column` is gated by `assertValidDataColumn`
  (`VALID_DATA_COLUMNS`). Ontology carrier: dd542 Activity's `section_list`
  (dd549) default sort.
- **Why:** semantic coherence (owner, 2026-07-09) — `component_tipo` should name
  a component, not double as a raw-column slot; a dedicated `column` field makes
  "order by an exact column" self-documenting. The PHP-tolerated shortcut
  `component_tipo:"section_id"|"section_tipo"|"id"` is KEPT working for
  back-compat/parity; only the `column`-ONLY form is TS-exclusive.
- **Gate reconciliation:** no parity gate reds — the differentials that touch
  ordering (`activity_read_differential`, `multihop_order_differential`) send an
  EXPLICIT client order, and nothing compares the config-default sort across
  engines. Unit coverage: `test/unit/search_order_id.test.ts` (column-only,
  component_tipo-wins, gate rejection). Client-side: the sort-arrow UI keys on
  `component_tipo` (`ui.js:3011`), so a `column`-only DEFAULT shows no arrow —
  cosmetic, and the default sort is server-applied (never client round-tripped).
