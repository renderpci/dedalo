---
name: dedalo-dataframe
description: The Dédalo v7 dataframe system — pairing frame records (uncertainty, qualifiers, context) with individual data items of main components via the unified id_key contract. This also covers the relation sibling-ordering, which is itself an id_key dataframe (the order component_number on component_relation_parent/children). Use when modifying core/component_dataframe/, trait.dataframe_common.php, class.dataframe_caller.php, core/component_common/js/dataframe.js, dataframe_v7_migration, the dataframe_control widget, the *_by_id_key order helpers or child-ordering in component_relation_parent/component_relation_children, any *_dataframe_Test.php, or when wiring dataframe support into a component's JSON controller or JS views.
---

# Dédalo v7 dataframe system

A **dataframe** attaches frame records (uncertainty, qualifiers, contextual metadata — Wikidata-qualifier style) to INDIVIDUAL data items of a main component. Frame content lives in ontology-defined sections; the pairing locators live in the **relation column of the same section record** as the main component, under the frame slot's tipo key. Works for relation mains (portal, select…) and literal mains (input_text, text_area, date, number, email, iri). User docs: `docs/core/components/component_dataframe.md`.

## The pairing contract (memorize this)

Frame locator (one per frame record, lang-agnostic):

```json
{"type":"dd490","section_tipo":"dd1706","section_id":"3","from_component_tipo":"dd560","main_component_tipo":"rsc217","id_key":2}
```

- **`id_key` = the main data item's stable counter `id`** — for relation AND literal mains. NEVER a target section_id, NEVER an array index. **CUTOVER DONE (2026-06, branch v7_developer): `id_key` is the SINGLE pairing key.** The legacy `section_id_key`/`section_tipo_key` were removed from ALL live dataframe code (including `from_legacy`, which is now id_key-only). They survive ONLY in: the **old-CSV import** (`import_dataframe_data` reads `?? $frame->section_id_key` then strips it) and the **v6→v7 update** (`transform_data`/`v6_to_v7`/`dataframe_v7_migration`, plus the `matrix_time_machine.section_id_key` DB column). The `dataframe_caller` DTO does not declare those properties.
- **`type` = `DEDALO_RELATION_TYPE_DATAFRAME` = `dd490`** (term reused from retired `DEDALO_RELATION_TYPE_STRUCT_TIPO`; stale STRUCT define still in `core/base/dd_tipos.php`; JS constant `DATAFRAME_TYPE` in `core/component_common/js/dataframe.js`). Positive marker — **`is_dataframe_entry()` is now `type===dd490` ONLY** (no legacy-shape fallback), PHP + JS. All frames carry `type` after the migration.
- **Match predicate**: `(type, from_component_tipo, main_component_tipo, id_key)` — `id_key` only, no `section_id_key` fallback, no `section_tipo_key` check. Implemented ONCE in `dataframe_common::dataframe_entry_matches()` (PHP) and the datum find in `dataframe.js`. Never hand-roll key comparisons.
- `section_tipo`/`section_id` of the locator point at the frame TARGET record (e.g. a label in dd1706).
- **The old server band-aid `resolve_target_keyed_id_key()` was REMOVED** — the client now pairs correctly at the source (see Client pairing source below), so no server normalization is needed.

## Single authorities (route everything through these)

- **PHP**: `core/component_common/trait.dataframe_common.php` (mixed into `component_common`, so every component has it): `is_dataframe_entry()`, `dataframe_entry_matches()`, `build_dataframe_caller()`, `get_dataframe_instance()`, `get_item_dataframe_data()`, `remove_dataframe_data_by_id()` (the server cascade), `build_dataframe_subdatum()` (JSON controller helper), `get_export_dataframe_data()`/`import_dataframe_data()` (round-trip), `get_diffusion_data_with_dataframe()` (diffusion fn hook), `get_dataframe_delete_policy()`.
- **Caller DTO**: `core/common/class.dataframe_caller.php` — typed `{section_tipo, section_id, main_component_tipo, id_key}`. **No `section_id_key`/`section_tipo_key` properties anymore.** `component_common::set_caller_dataframe()` just assigns the caller; `dataframe_caller::from_legacy()` normalizes an UNTYPED stdClass (`{section_tipo, id_key, main_component_tipo}`) into the DTO — it is now **id_key-only** (no longer reads `section_id_key`/`section_tipo_key`; a legacy-only shape returns null).
- **JS**: `core/component_common/js/dataframe.js` — `DATAFRAME_TYPE`, `get_dataframe()`, `delete_dataframe()`, `get_dataframe_keys()` (throws on missing item.id), `attach_item_dataframe()` (the literal-view glue). All id_key-only. Re-exported through `component_common.js` for back-compat imports.

## Client pairing source (the root fix — read before touching render)

The per-item `id_key` reaches the client ONLY in the DATA layer (`component_dataframe_json.php` stamps `el.id_key`); `ddo.caller_dataframe` is NEVER set server-side (structure-context cache is per-TYPE, can't hold a per-item value). So the client must supply the main item id itself:

- **Relation/portal mains**: the portal entry id lives in `self.locator.id`. `section_record.js` threads it explicitly — `get_ar_instances_edit` (~440) and `get_ar_columns_instances_list` (~634) pass `dataframe_id_key: self.locator?.id ?? null` into `get_component_data`, which sets `id_key = dataframe_id_key ?? ddo.caller_dataframe?.id_key ?? self.section_id`. **The bug it fixed:** the client used to throw `self.locator.id` away and fall back to `self.section_id` (the LINKED record's id), producing target-keyed frames. `create_source` (`common.js`) then reads the now-correct `self.data.id_key` into the request caller.
- **Literal mains** were always correct — `attach_item_dataframe({item})` passes `item.id` directly.
- Because the client now pairs correctly at the source, **no server normalization runs** — the removed `resolve_target_keyed_id_key()` band-aid is gone, not replaced.

## Lifecycle invariants (each backed by a real bug)

1. Item ids are minted SERVER-side only — `section_record::allocate_component_ids()` under a pg advisory lock (re-reads the persisted counter; in-memory read-increment-write races between processes). `raise_component_counter()` absorbs explicit import ids.
2. Clients address rows by item `id`, never array index (index broke pairing on reorder/delete — the original input_text bug).
3. New blank rows render frames with PROVISIONAL key `self.data.counter+1` (exposed by the controller); the value itself never carries a client-minted id.
4. Deletes cascade SERVER-side in `update_data_value('remove')` → `remove_dataframe_data_by_id()`. Client `delete_dataframe()` is only for explicit user unlink actions (select value change, portal delete-linked-record).
5. Reorder is a pairing no-op; re-pointing a relation locator KEEPS its frame (statement semantics — intended behavior change vs the old target-keyed model).
6. Frames merge into the MAIN component's time-machine row (`get_time_machine_data_to_save`); frame saves in cascades run with `tm_record::$save_tm = false`.
7. Translatable literals: cascade fires only when the id is gone from EVERY language.
8. Frame TARGET records are never hard-deleted (time machine renders past states). `properties->dataframe->delete_policy: 'delete_target'` opts into soft delete (`sections::delete` delete_data mode); default `'unlink'`.

## CRITICAL: caller-aware writes

`component_dataframe::get_data()` is caller-FILTERED (only the paired subset) but the storage slot holds frames of ALL items/mains. `component_dataframe::set_data()` therefore does a **caller-aware merge**: it preserves sibling entries not matching the caller and dedupes identical incomings. Without it, `set_data(null)` in the cascade wipes every frame in the slot (real data-loss bug, fixed). If you touch dataframe write paths, run `dataframe_common_Test::test_set_data_preserves_sibling_frames`.

## Wiring a new literal component (the whole pattern)

1. JSON controller: read `$has_dataframe = isset($properties->has_dataframe) && $properties->has_dataframe===true;` pass it as `add_request_config` to `get_structure_context(_simple)` (else the dataframe ddo never reaches the client RQO). Then:
   `$dataframe_subdatum = $this->build_dataframe_subdatum($value, $mode);` → merge `->context`/`->data` into the response, set `$item->counter = $dataframe_subdatum->counter` after `get_data_item()`.
2. JS views (default_edit, line_edit, default_list, mini): one call per data item — `attach_item_dataframe({self, item: current_value, container: content_value, view: self.view})`. No-op without `has_dataframe`. String-rendered list/mini views loop `self.data.entries`. Never inside a CKEditor container.
3. No remove-flow JS (invariant 4).
4. Activation is ONTOLOGY data, not code: instance `properties->has_dataframe: true` + a `component_dataframe` ddo in request_config `show.ddo_map`; the dataframe node's portal request_config points at the frame target section.
Reference implementations: input_text, date; `component_number`/`component_email` share one `get_content_value` in `render_edit_component_*.js` (one patch covers default+line edit). `component_iri` has its own line views and the fixed label slot (`dd560` → section `dd1706`, component `dd1715`), with `resolve_title()` falling back to the deprecated literal `title` until `materialize_iri_titles` runs.

## Migration / maintenance / round-trip

- `core/base/upgrade/class.dataframe_v7_migration.php` (registered as updates.php v=701, 7.0.0→7.0.1; **activation needs the version.inc bump**): `migrate_matrix` (relation mains: resolve target→item id; ambiguous→first match + report; unresolvable→left legacy + report), `migrate_time_machine` (row-local: TM rows hold main+frame merged), `migrate_activity` (literal mains only), `materialize_iri_titles`, `integrity_check` (orphan frames by id; fix removes locators only). All batched, idempotent, dry-run (`$save=false`).
- **Status: the cutover REQUIRES this migration to have run** (dual-read is gone — unmigrated legacy frames simply won't pair). Already run on **dedalo7_mib** (2026-06-15): 35 matrix + 408 TM frames re-keyed, `legacy_unmigrated=0`, 9 harmless orphans left (test junk, id_key with no matching item). For any OTHER DB: run `migrate_all(true)` (or version-bump to 7.0.1 / `dataframe_control` widget) and confirm `integrity_check` clean BEFORE expecting frames to render.
- Maintenance widget `dataframe_control` (area_maintenance): run_check / run_fix via widget_request, `API_ACTIONS` allowlisted.
- Export/import: raw export wraps `{"dedalo_data":{"dato":[...],"dataframe":[...]}}`; `unwrap_dedalo_data()` detects the envelope (incl. dataframe-only, `has_dato=false`); import writes frames via `import_dataframe_data()` preserving other components' frames in shared slots. Explicit item ids round-trip — that's why they're preserved on import.
- Diffusion opt-in: main ddo `fn: "get_diffusion_data_with_dataframe"` (items with `dataframe` property attached by id), or a `component_dataframe` ddo with `parent` scoping (`get_diffusion_data` publishes only that main's frames).

## Gotchas

- The phpunit entity is **monedaiberica** (private/config.inc default), NOT the dedalo_v7 DB — psql checks against dedalo_v7 don't see what tests touch.
- `component_dataframe_Test.php` is wholly `markTestSkipped('Temporarily disabled')` and pins the OLD `test_equal_properties` (no `id_key`) — fails if re-enabled without updating.
- `get_subdatum` (class.common.php dataframe branch) keys by `$current_locator->id ?? $current_locator->section_id` — literal controllers pass pseudo-locators whose section_id IS the item id; relation locators carry real `->id`. Don't "fix" that fallback.
- `'0'`-style truthiness: `has_dataframe` must be `===true` checked (strict_types controllers pass it to a `bool` param).
- Frame locators also carry their OWN `id` (they are data items of the dataframe component) — don't confuse with `id_key`.
- **Rating / selected value lives in `entries`, NOT `value`** — the v7 data model (`get_data_item` sets `$item->entries`, never a top-level `value`). The rating-colour views read `rating_data.entries ?? rating_data.value` (the `value` is only a legacy fallback). Reading `.value` alone silently loses the colour — the regression fixed in `view_default_list_dataframe.js` / `view_mini_list_dataframe.js`.
- **TM relation-main double-render**: `component_common::get_data()`'s time-machine relation branch (the `elseif($current_model!=='component_dataframe')` path) now skips frame entries via `if(self::is_dataframe_entry($el)) return false;`. Without it the frame renders twice in the Time Machine tool (once in the main's list, once as its own preview).
- **Migration gone-vs-pending**: dual-read no longer exists, so an unmigrated legacy frame (target-keyed, no `id_key`) won't match an id_key caller — it just won't render. If frames "disappear" on a DB, check `integrity_check`/migration ran there; don't re-add a fallback.
- **Relation sibling-ordering is now an id_key dataframe too (converted 2026-06-15, "no exceptions").** The order `component_number` (section_map→thesaurus→order) used to key each child's per-parent sort by the PARENT record coords; it now pairs by `id_key` = the child's **parent-link locator id**. Trait helpers renamed `*_by_context` → `*_by_id_key` (store `{value, id_key}`). `add_parent` PRE-ALLOCATES the parent locator id (`set_data_item_counter`) so the order can pair before save; `component_relation_children::resolve_parent_link_id_key()` resolves a child's parent-link id; `build_children_sqo` no longer uses a constant JSONB predicate — it PRECOMPUTES the order in PHP (`compute_ordered_child_ids`) and emits an `array_position(...)` ordering. Migration: `dataframe_v7_migration::migrate_order_components()` (row-local, **not yet wired into `migrate_all`** — verify on a real DB first). Live tree ordering is **untested** — needs DB verification.
- **`section_id_key`/`section_tipo_key` that legitimately REMAIN (do not "clean them up"):** the **old-CSV import** (`import_dataframe_data` accepts a pre-v7 `section_id_key` as the id_key source, then strips it); (C) the physical `matrix_time_machine.section_id_key` DB column; (D) v6 `transform_data`/`v6_to_v7` + the migration's dual-read (its job is to convert legacy data). Also benign: `unset($el->section_id_key,...)` cleanup-on-write and `// … no longer …` doc-comments. Everything else — dataframe pairing AND relation ordering — is id_key only.

## Testing

`cd test/server && ../../vendor/bin/phpunit components/dataframe_common_Test.php components/component_*_dataframe_Test.php base/upgrade/dataframe_v7_migration_Test.php section_record/component_counter_concurrency_Test.php` — plus `tools/` (round-trip invariant) and `api/dd_diffusion_api_Test.php` when touching export/diffusion. Baseline pre-existing failures: component_date `test218` tipo errors + media-environment failures; nothing dataframe-related may be red.
