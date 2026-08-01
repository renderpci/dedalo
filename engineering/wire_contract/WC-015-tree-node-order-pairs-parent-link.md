# WC-015 — tree node `order` pairs by the parent-link item `id` (PHP returns the FIRST item's stale value)

- **Date:** 2026-07-10 (reported: ontology tree reorder reverts on reload —
  dd15 under dd207 saved at 6, redisplayed at its old position).
- **Shape before (PHP):** `ts_node_repository::pick_order_value_for_parent`
  matches order-dataframe entries on `$item->id_key` — a field NO write path
  has ever produced (`trait.dataframe_common::add_value_by_id_key` writes
  `{value, id}`). Its "legacy unkeyed" scan then treats id-keyed entries as
  unkeyed and returns the FIRST entry's value. Single-item dataframes work by
  accident; a multi-item dataframe (multi-parent node, or a node MOVED between
  parents — dd15's `[{id:1,value:2},{id:2,value:6}]`) yields the stale item.
  Verified live 2026-07-10: PHP `get_children_data` dd0/207 returns dd15
  `order: 2`; the client sorts children by `order` (ts_object.js:667), so the
  saved reorder visually reverts on reload.
- **Shape after (TS):** `node_repository.ts pickOrderValueForParent` step 1
  pairs on `item.id_key ?? item.id` (the field actually written by both
  engines; `id_key` honoured first for any row carrying the name PHP
  expected), and the unkeyed scan requires NO pairing key of any generation.
  dd15 emits `order: 6` — the value `save_order` wrote.
- **Reason:** functionality — save_order/sortChildren, dd_ontology
  order_number sync and the children ARRAY order (getChildren pairs correctly
  via getInlineValueByIdKey) all already use `id`; the node-payload picker was
  the one reader pairing on the phantom field, and it feeds the client's sort.
  Upstream PHP should adopt the same one-line pairing fix.
- **Gate reconciliation:** no differential reds — the tchi1 fixture nodes
  (`ts_node_read_differential`, `ts_mutations_differential`) carry single-item
  order dataframes, where both pickers agree byte-for-byte (ran green against
  the live oracle 2026-07-10). TS ground truth pinned in
  `test/unit/ts_tree_semantics.test.ts` (cases 1b–1d: the dd15 multi-item
  shape, id-keyed ≠ unkeyed, and the no-link-id fallback). No re-harvest
  needed (no golden-store gate covers a multi-item order dataframe).
