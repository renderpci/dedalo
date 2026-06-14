---
name: dedalo-dataframe
description: The Dédalo v7 dataframe system — pairing frame records (uncertainty, qualifiers, context) with individual data items of main components via the unified id_key contract. Use when modifying core/component_dataframe/, trait.dataframe_common.php, class.dataframe_caller.php, core/component_common/js/dataframe.js, dataframe_v7_migration, the dataframe_control widget, any *_dataframe_Test.php, or when wiring dataframe support into a component's JSON controller or JS views.
---

# Dédalo v7 dataframe system

A **dataframe** attaches frame records (uncertainty, qualifiers, contextual metadata — Wikidata-qualifier style) to INDIVIDUAL data items of a main component. Frame content lives in ontology-defined sections; the pairing locators live in the **relation column of the same section record** as the main component, under the frame slot's tipo key. Works for relation mains (portal, select…) and literal mains (input_text, text_area, date, number, email, iri). User docs: `docs/core/components/component_dataframe.md`.

## The pairing contract (memorize this)

Frame locator (one per frame record, lang-agnostic):

```json
{"type":"dd490","section_tipo":"dd1706","section_id":"3","from_component_tipo":"dd560","main_component_tipo":"rsc217","id_key":2}
```

- **`id_key` = the main data item's stable counter `id`** — for relation AND literal mains. NEVER a target section_id, NEVER an array index. `section_id_key`/`section_tipo_key` are the LEGACY pair (pre-migration), dual-read everywhere until `dataframe_v7_migration` runs.
- **`type` = `DEDALO_RELATION_TYPE_DATAFRAME` = `dd490`** (term reused from retired `DEDALO_RELATION_TYPE_STRUCT_TIPO`; the stale STRUCT define still sits in `core/base/dd_tipos.php`; JS constant `DATAFRAME_TYPE` in `core/component_common/js/dataframe.js`). Positive marker — detection is type-first, legacy-shape fallback (`is_dataframe_entry`).
- **Match predicate**: `(type, from_component_tipo, main_component_tipo, id_key)` — implemented ONCE in `dataframe_common::dataframe_entry_matches()` (PHP) and the datum find in `dataframe.js`. Never hand-roll key comparisons.
- `section_tipo`/`section_id` of the locator point at the frame TARGET record (e.g. a label in dd1706).

## Single authorities (route everything through these)

- **PHP**: `core/component_common/trait.dataframe_common.php` (mixed into `component_common`, so every component has it): `is_dataframe_entry()`, `dataframe_entry_matches()`, `build_dataframe_caller()`, `get_dataframe_instance()`, `get_item_dataframe_data()`, `remove_dataframe_data_by_id()` (the server cascade), `build_dataframe_subdatum()` (JSON controller helper), `get_export_dataframe_data()`/`import_dataframe_data()` (round-trip), `get_diffusion_data_with_dataframe()` (diffusion fn hook), `get_dataframe_delete_policy()`.
- **Caller DTO**: `core/common/class.dataframe_caller.php` — typed `{section_tipo, section_id, main_component_tipo, id_key}` with legacy aliases kept in sync. `component_common::set_caller_dataframe()` normalizes legacy stdClass via `dataframe_caller::from_legacy()`.
- **JS**: `core/component_common/js/dataframe.js` — `DATAFRAME_TYPE`, `get_dataframe()`, `delete_dataframe()`, `get_dataframe_keys()` (throws on missing item.id), `attach_item_dataframe()` (the literal-view glue). Re-exported through `component_common.js` for back-compat imports.

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
- Maintenance widget `dataframe_control` (area_maintenance): run_check / run_fix via widget_request, `API_ACTIONS` allowlisted.
- Export/import: raw export wraps `{"dedalo_data":{"dato":[...],"dataframe":[...]}}`; `unwrap_dedalo_data()` detects the envelope (incl. dataframe-only, `has_dato=false`); import writes frames via `import_dataframe_data()` preserving other components' frames in shared slots. Explicit item ids round-trip — that's why they're preserved on import.
- Diffusion opt-in: main ddo `fn: "get_diffusion_data_with_dataframe"` (items with `dataframe` property attached by id), or a `component_dataframe` ddo with `parent` scoping (`get_diffusion_data` publishes only that main's frames).

## Gotchas

- The phpunit entity is **monedaiberica** (private/config.inc default), NOT the dedalo_v7 DB — psql checks against dedalo_v7 don't see what tests touch.
- `component_dataframe_Test.php` is wholly `markTestSkipped('Temporarily disabled')` and pins the OLD `test_equal_properties` (no `id_key`) — fails if re-enabled without updating.
- `get_subdatum` (class.common.php dataframe branch) keys by `$current_locator->id ?? $current_locator->section_id` — literal controllers pass pseudo-locators whose section_id IS the item id; relation locators carry real `->id`. Don't "fix" that fallback.
- `'0'`-style truthiness: `has_dataframe` must be `===true` checked (strict_types controllers pass it to a `bool` param).
- Frame locators also carry their OWN `id` (they are data items of the dataframe component) — don't confuse with `id_key`.
- Legacy data: dual-read stays until migration runs; legacy relation frames are target-keyed and will NOT match item-id callers (by design — migrate first).

## Testing

`cd test/server && ../../vendor/bin/phpunit components/dataframe_common_Test.php components/component_*_dataframe_Test.php base/upgrade/dataframe_v7_migration_Test.php section_record/component_counter_concurrency_Test.php` — plus `tools/` (round-trip invariant) and `api/dd_diffusion_api_Test.php` when touching export/diffusion. Baseline pre-existing failures: component_date `test218` tipo errors + media-environment failures; nothing dataframe-related may be red.
