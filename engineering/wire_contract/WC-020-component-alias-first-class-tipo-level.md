# WC-020 — `component_alias`: first-class tipo-level aliasing (TS-native; PHP emits the raw model and cannot serve alias reads/saves)

- **Date:** 2026-07-10 (owner decision: the alias node is THE config carrier
  for tool components — single source of truth instead of inline ddo_map
  property copies; contract: `src/core/ontology/alias.ts`).
- **Shape:** an ontology node `model:'component_alias'` with REQUIRED
  `properties.alias_of:'<target component tipo>'` (single hop; alias-of-alias,
  missing target, missing alias_of and the retired v5 keys
  `max_records`/`look_inside`/`edit_view` all THROW). Effective properties =
  `{...target.properties, ...alias.properties minus alias_of}` — TOP-LEVEL-KEY
  wholesale replacement; precedence rqo `source.properties` override → alias
  merge → target. Wire identity: context/data emit the ALIAS tipo with the
  TARGET's `model`/`legacy_model`/translatable and the alias's OWN label; the
  byte-identical client instantiates the target's JS class with zero client
  changes (instances.js keys purely on `model`). DATA identity: reads, writes,
  search WHERE/ORDER, item-id counters, TM audit and the relation_search index
  all key the TARGET's column slot (`resolveDataTipo`) — stored data NEVER
  contains an alias tipo. ACL hops to the target (an alias is a view with the
  target's exact rights). v1 wires the portal family + literal emission +
  save/search/order; other relation faces throw loudly (LEDGER known-open gap).
- **Divergence:** PHP has NO alias resolution (dead since v5): it enriches
  ddo_map entries with `model:'component_alias'` verbatim and its client
  cannot build them. After `scripts/migrate_component_alias.ts --execute`
  re-points numisdata201's coins role at numisdata203, the PHP epigraphy
  coins panel is DEGRADED (COEXISTENCE row).
- **Gate reconciliation:** `section_tool_start_differential` byte-pins
  numisdata201's config through a coins-entry normalizer (strips the entry
  both sides, byte-compares the rest, pins the TS alias shape explicitly —
  no-op pre-migration); `tool_component_read_differential` pins the
  `source.properties` override MECHANISM against numisdata77 via a frozen
  fixture (`test/parity/fixtures/coins_override_properties.json`). TS ground
  truth: `test/unit/component_alias.test.ts` (scratch contract + data/save
  round-trip) and `test/unit/component_alias_tool_ddo_map.test.ts`
  (post-migration, visibly gated on the DB state).
