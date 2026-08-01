# WC-026 — component_info entries carry BOTH `id` and `widget_id` matching keys

- **Date:** 2026-07-10 (component_info widget framework rebuild — the
  "widgets render blank" root cause).
- **Shape:** every top-level widget item in a component_info data item's
  `entries` (section read; stored-misc AND live-compute branches) carries
  BOTH `id` and `widget_id` when either is a string:
  `{widget, key, id, widget_id, value, …}`. Normalizer:
  `src/core/components/component_info/widgets/widget_common.ts`
  `normalizeWidgetEntryKeys` (applied in the `info` emit hook). Scalar
  string keys only — media_icons row objects (whose `id` key holds a CELL
  object) and nested shapes (state's `value.widget_id`) pass through
  verbatim; the tags widget's leading raw text items (no `widget` tag) are
  untouched. The single-widget API channel (`dd_component_info`
  `get_widget_data`) stays PHP-byte-verbatim — the divergence covers the
  section-read `entries` and the save response's merged observer item
  (`observers_data` — the same client renders consume it); observer
  matrix_time_machine rows stay RAW computed shape (PHP-byte, coexistence).
- **Divergence rationale:** the client widget renders match on `widget_id`
  (`render_get_archive_weights.js:249` et al.) while the grid/export
  builders match on `id` — and PHP emits ONE key per widget class
  (weights/state live = `widget_id`, calculation live = `id`) with all
  STORED misc values id-keyed. Verified live 2026-07-10: the PHP client
  renders every stored numisdata archive (17,087 records) AND every live
  calculation BLANK. The server must satisfy the client's contract
  (AGENTS.md hard rule) — emitting both keys is the test_info widget's own
  precedent and repairs rendering without mutating stored data.
- **Gate reconciliation:** `test/parity/info_widget_differential.test.ts`
  `phpEntries` normalizes the PHP response with the SAME production
  function before diffing (the WC-001 pattern); the calculation empty-input
  pin asserts the added `widget_id` explicitly.
