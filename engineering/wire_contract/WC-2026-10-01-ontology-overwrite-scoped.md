# WC-2026-10-01-ontology-overwrite-scoped — local-ontology overrides link through ontology42 only; identity and storage fields stay canonical; term merges per lang; properties replace per top-level key

- **Date:** 2026-10-01 (owner decision, after the first real override on a dev
  install — `localontology0/1` over `rsc85` — parsed into a node `localontology85`
  and left `rsc85` untouched).
- **Shape before (PHP, ported verbatim):** `ontology::get_overwrite` matched a
  `localontology0` record holding the node's locator in ANY relation component.
  `parse_section_record_to_ontology_node` then took the override's value for tld,
  parent, model, translatable, relations, propiedades, properties, css, source and
  term, each replacing the canonical value whole. Model protection read the node's
  current `dd_ontology` row. Several overrides → an unordered `LIMIT 1`. Parsing a
  `localontology0` record directly produced a node `<its ontology7><its own id>`.
- **Shape after (TS)** — `dd_ontology` rows produced by the parser (`src/core/ontology/parser.ts`):
  - the link is `ontology42` ("Overwrite") ONLY; an override's own parent
    (`ontology15`) or relations (`ontology10`) no longer make it the override of
    THOSE nodes (measured under the old rule: the parent node took the override's
    term and became its own parent);
  - CANONICAL-ONLY: `tld` (the node's identity — the override's `ontology7` is
    `localontology` by default and re-homed the node), `is_model`,
    `is_translatable` (it fixes how the component's data is STORED; the override's
    create-door default YES silently made every overridden node translatable),
    `order_number`;
  - `term` MERGED per lang (a filled override lang wins, empty values do not
    count, every other lang keeps the canonical value — each lang is its own
    translation);
  - `properties` per TOP-LEVEL KEY, `css` (`ontology16`) and `source`
    (`ontology17`) included: a key the override states replaces the canonical key
    WHOLE (no deep merge — an override's css is the node's whole css); unstated
    keys are kept (PHP replaced the whole `ontology18` object, silently dropping
    every key the override did not repeat); a key stated as `null` in the
    override's `ontology18` REMOVES it; `null` for `css`/`source` there while
    `ontology16`/`ontology17` is filled is a contradiction → `ontology.invalid_node`
    thrown, never resolved by picking a winner. All keys removed → SQL NULL;
  - replace-when-present (unchanged): parent, model/model_tipo, relations,
    propiedades (v5 text blob);
  - model protection reads the canonical record's `ontology30`;
  - several overrides of one node → the lowest `section_id` wins;
  - a `localontology0` record is never parsed as a node: the parser throws
    `ontology.invalid_node`, `setRecordsInDdOntology` refuses the section
    (`ok:false`, nothing written), `ontology_state` parses no node out of it (a
    stale `localontology<n>` row is `orphaned` drift, removed by rebuild), and
    `update_ontology`'s re-derive skips it.
- **Reason:** an override is a local adjustment of a shared node (Cultural-heritage
  installs restyle or relabel a field without forking the shared ontology). Under the
  PHP rule the most natural override — add a background colour, relabel one language —
  moved the node to another namespace, erased its other translations, dropped its
  other properties and flipped its data storage. Owner decision on properties: a
  deep css merge was rejected as unreadable (the result is not visible in the
  override alone, and a single rule cannot be removed) — the key replaces whole,
  which costs the author a full css value but states exactly what the node gets.
  The override still applies only when the overridden node is (re-)parsed; editing
  the override does not re-parse it.
- **Gate reconciliation:** no parity gate covers overrides (the frozen fixture store
  holds none; PHP's own `test_get_overwrite` asserted only the null cases). TS ground
  truth: `test/unit/ontology_overwrite_native.test.ts` (scratch tld `zzlo` +
  `localontology0` records, every rule above).
- **Fixture interaction (DEC-14b):** NO re-harvest; no harvested record carries an
  override.
