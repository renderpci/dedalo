# WC-029 — the tree icon empty-skip judges a data item by its VALUE, not by "has any property"

- **Date:** 2026-07-13 (post-cutover; PHP is decommissioned dead code).
- **PHP behaviour:** `ts_object::resolve_element_value` (:1565) suppresses an icon
  element when `is_empty($component_data)` — a helper whose own docblock says it
  exists to stop "pseudo-empty values like `<p></p>`" from counting as content.
  Its object branch, however, is `foreach ($data as $property) { return false; }`:
  ANY property makes an object non-empty, and it never looks at the values. Every
  stored data item is a `{id, lang?, value}` wrapper, and clearing a component
  leaves the wrapper behind (`[{"id":1,"value":null}]` — the real shape of, e.g.,
  `dd0_1772`'s properties). So in PHP the empty-skip can never fire for a wrapped
  component: an ontology term whose `properties` are EMPTY still renders its `P`
  icon, and clicking it opens an empty JSON editor. Verified directly against the
  frozen oracle (`php -r` over `shared/core_functions.php`).
- **TS behaviour:** `isEmptyData` (`src/core/ts_object/ts_object.ts`) ports
  `is_empty` faithfully for scalars/strings/arrays (`0`, `''`, `'0'`, `'<p></p>'`,
  `[]`, and arrays whose entries are all empty), and diverges on objects: a data-item
  wrapper (an object carrying a `value` key) is judged by that `value` alone —
  `id`/`lang` are pairing metadata, never content — while any other object (a
  locator) stays empty only when every property is. The icon is then suppressed for
  a cleared component, which is what the rule always meant.
- **Blast radius:** icons only (`term` and `link_children` keep PHP's plain
  `empty()` semantics). The TS pre-image was `componentData.length === 0`, which was
  ALSO not PHP-faithful: it rendered icons for `['']`/`['<p></p>']`/`[0]` that PHP
  skipped. No frozen parity fixture carries an `ar_elements` icon
  (`ts_node_read_differential.json` has none), so the pinned oracle-harvest store is
  untouched by this edit.
- **Gate:** `test/unit/ts_tree_semantics.test.ts` — the `isEmptyData` table (the
  PHP-faithful rows and the wrapper divergence rows); `test/unit/ts_tree_db_semantics.test.ts`
  — the cleared-properties node (`dd0_1772`, no `ontology18` icon) against the
  positive control (`dd0_1`, icon present).
