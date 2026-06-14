---
name: dedalo-context-data-layers
description: How Dédalo builds, structures, and consumes the context and data layers in JSON API output for sections, components, and portals — including the core/stamp structure-context cache, subdatum resolution, and the mutation/injection rules callers must follow.
---

# Dédalo Context & Data Layers Skill

This skill covers the two-layer JSON architecture that every Dédalo API response follows: **`context`** (structural/configuration) and **`data`** (instance-specific values). Understanding the boundary between these layers — and the caching contract behind context — is essential for modifying JSON controllers, debugging missing data, and deciding where new properties belong.

> Architecture note (June 2026): the structure-context build was refactored into a **core/stamp split** with a semantically transparent cache (commit `ccd9e510d` + hardening pass). If you remember the old single-method `get_structure_context` with a `{tipo}_{section_tipo}_{mode}` cache key, that design is gone. The new rules are documented below and enforced by `test/server/common/context_cache_determinism_Test.php` (9 tests) — keep that suite passing.

---

## Top-Level Structure

Every `get_json()` call returns:

```json
{
  "context": [dd_object, dd_object, ...],
  "data":    [data_item, data_item, ...],
  "debug":   {}  // only when SHOW_DEBUG=true
}
```

Built by `common::build_element_json_output($context, $data)` at `core/common/class.common.php:1299`. Entry point: `common::get_json()` at `:1321`, which includes the element's `{model}_json.php` controller in instance scope.

---

## Context Layer

### Purpose
Context describes **what** an element is and **how** to display it. It is structural and cacheable; per-call fields are stamped on top (see "Build pipeline").

### Build pipeline (core/stamp split)

`get_structure_context(int $permissions, bool $add_request_config)` (`core/common/class.common.php:1390`) and `get_structure_context_simple(...)` (`:1989`) are thin wrappers over:

1. **`build_structure_context_core(bool $add_request_config, bool $simple)`** (`:1520`) — builds and caches the **invariant** part: deep-cloned ontology `properties` (+ `section_list` override in list mode), `css`, `tools`, `buttons`, `label`, `legacy_model`, `translatable`, `sortable`, base `columns_map`, `filter_by_list`, `state_of_component` (resolved msgs), `search_operators_info`/`new_dataframe`, `show_interface` for shared sections, and section extras (`section_map`, `config->relation_list_tipo`, `matrix_table`).
   - **Cache key:** `{user_id}_{tipo}_{section_tipo}_{mode}_{add_request_config}_{simple}`, with `section_tipo` json_encoded when it is an array, **plus** `_p{md5(properties)}` when properties were injected (see below). Cache: `common::$cache_structure_context`, bounded by `manage_cache_size()`, purged by `common::clear()` (worker mode runs this per request).
2. **`build_structure_context($permissions, $add_request_config, $simple)`** (`:1410`) — **clones** the cached core (never returns the cache entry by reference), **deep-clones `properties`** onto the clone, then **stamps the variant fields per call**:
   - `permissions` (callers inject inherited/capped values — see subdatum)
   - `parent` via `resolve_context_parent()` (`:1922`): session ddo → injected `from_parent` → `section_tipo` → ontology parent
   - `parent_grouper` (instance override wins over structure value)
   - `lang`, `view`, `children_view` (all injectable per ddo)
   - `request_config` (instance-memoized `build_request_config()`; subdatum injects narrowed children configs) and `columns_map` (null when request_config absent)
   - sortable `path` via `get_order_path()` (memoized in `common::$cache_order_path`, deep-copied both ways because subclasses mutate `$path[0]->column`)
   - `sqo_session` (sections), search-mode `config->parent_grouper_label` (clones `config` first)

**Invariant:** a cache hit returns exactly what a fresh build would return for that instance and call. Never rely on (or reintroduce) "first caller wins" behavior.

### Context types
- **`default`**: full context — includes tools, buttons.
- **`simple`**: `get_structure_context_simple()` skips tools/buttons computation via the `simple` flag (separate cache key). It does **not** mutate the instance (the old version force-emptied `$this->tools`/`$this->buttons_context` and set permissions — that corruption is gone).

### Core context properties

| Property | Type | Description |
|----------|------|-------------|
| `tipo` / `section_tipo` / `model` / `legacy_model` | string | Identity (core) |
| `parent` | string | Hierarchy link, **stamped per call** — client matches data↔context with it |
| `parent_grouper` | string\|null | Structure parent for grouping (stamped) |
| `lang` / `mode` / `view` / `children_view` | string | Display state (lang/view stamped) |
| `label` / `translatable` / `css` | mixed | Presentation (core) |
| `properties` | object | Ontology properties — **deep-cloned per call, safe to mutate** |
| `permissions` | int | 0=none, 1=read, 2=write (stamped) |
| `tools` / `buttons` | array | **Shared with the cache entry — treat as read-only** |
| `request_config` / `columns_map` | array\|null | Only when `add_request_config=true` (stamped) |
| `sortable` / `path` | bool / array | Column sorting (path stamped) |

Sections add `section_map`, `config->relation_list_tipo`, `matrix_table` (core) and `sqo_session` (stamped). Components add `new_dataframe`, `filter_by_list`, `state_of_component`, search-mode `search_operators_info`/`search_options_title`.

### Mutation & injection rules (critical)

1. **Never write `$element->properties = ...` directly — always `$element->set_properties($value)`.** The setter raises `properties_injected`, which extends the core cache key with a properties hash. A direct write silently bakes per-request values into (or serves stale values from) the shared cache. `dd_core_api`'s area branch is the reference fix.
2. **The returned context is a clone**: adding top-level properties (`target_section_tipo`, `set_config(...)`, `section_id`) is safe. Mutating nested `properties` is safe (deep-cloned). Mutating nested `tools`/`buttons`/`section_map` is **not** — they are shared with the cache entry.
3. **New static caches** must be class-level properties cleared in `common::clear()` and bounded with `manage_cache_size()` — never function-local `static` (invisible to the worker's per-request purge → stale data for the life of the worker process).
4. A context that needs `request_config` later (e.g. for `get_subdatum`) must request it explicitly with `add_request_config=true` — it is never present "by cache luck".

---

## Data Layer

### Purpose
Data contains the **instance-specific** values for a given section_id. Dynamic, request-scoped, never cached across instances.

### Builder
Each component's `{model}_json.php` controller builds data items around `component_common::get_data_item($value)` (`core/component_common/class.component_common.php:3550`):

| Property | Description |
|----------|-------------|
| `section_id` / `section_tipo` | Record identity |
| `tipo` / `mode` / `lang` | Component identity and state |
| `from_component_tipo` | Origin component (portal children) |
| `entries` | The actual value(s) |
| `literal` | Resolved value (only `mode==='solved'`) |

### Mode-dependent value resolution

| Mode | Typical method | Notes |
|------|---------------|-------|
| `edit` | `get_data_lang()` | Lang-filtered full data |
| `list` / `tm` | `get_value()` / `get_list_value()` / `get_data_paginated()` | Display-ready |
| `search` | `get_data()` | Raw data |
| `solved` | `get_value()` | Resolved literal |

`get_data()` memoizes per instance (`$this->data_resolved`), so repeated calls within one controller are cheap.

### Component-specific data additions
`component_select`/`radio_button`/`check_box` add `datalist`; `component_portal` adds `pagination`, `parent_tipo`, `parent_section_id`; `component_text_area` adds `fallback_value`, `tags_persons`, and TM metadata in tm mode.

---

## The Context vs. Data Boundary

Rule of thumb: *"If I load this for section_id=1 vs section_id=2, does it change?"* → **Yes: data. No: context.**

| Property | Layer | Why |
|----------|-------|-----|
| `datalist` | data | Depends on lang/filters/record |
| `request_config`, `properties`, `tools` | context | Same structure for all records |
| `pagination`, `fallback_value` | data | Per-record |
| `permissions` | context | Per-tipo (but stamped per call — portal children may differ from direct access) |

---

## Subdatum

`common::get_subdatum(?string $from_parent, array $ar_locators)` at `core/common/class.common.php:2008` resolves child elements (portal columns, related components). Signature note: a third `$subdatum_options` parameter existed historically but was dead code and has been removed.

### Flow
1. Requires `$this->context->request_config` (returns empty otherwise — a frequent "empty subdatum" cause).
2. Builds `full_ddo_map` from all request_config objects (show + hide), dedupes by `tipo_parent_section_tipo`, pre-groups by section_tipo (dataframes separate).
3. Per locator × ddo: instantiate the child (instances cached per tipo+section_id), inject permissions, lang, view, narrowed `request_config` (children resolved recursively, cached per ddo+api_engine; `component_request_config` pre-indexed by api_engine), `from_parent`, and ddo `properties` (via `set_properties` → hash-keyed context cache).
4. Calls `get_json()` per child; merges child data with `row_section_id` + `parent_tipo` for row coherence.
5. **Subcontext is deduplicated inline** by `common::context_key()` — first occurrence wins.

### Permissions inheritance
Component callers grant children minimum read (1) when the user lacks target-section access, and cap children at 1 when the caller is read-only. The stamped `permissions` makes this per-call correct (no cache freezing).

### Context dedup helpers
- `common::context_key(object $item)` (`:50`) — identity = `tipo + section_tipo + mode` (arrays json_encoded so they can't collide with strings). This matches how the client `.find()`s context, so dropping later duplicates is lossless by design.
- `common::merge_unique_context(array $context, array $items)` (`:72`) — use this in JSON controllers instead of hand-rolled dedup loops (used by `section_json.php`, `component_portal_json.php`; `sections_json.php` uses the incremental variant).

---

## JSON Controller Pattern

```php
<?php declare(strict_types=1);
if (!isset($this)) { http_response_code(404); exit; }

$permissions = $this->get_component_permissions();
$mode        = $this->get_mode();

// context
$context = [];
$this->context = $this->get_structure_context($permissions, true); // true if subdatum needed
$context[] = $this->context;

// data (skip entirely when permissions === 0)
$data = [];
if ($permissions > 0) {
    $value = /* mode-dependent resolution */;
    $item  = $this->get_data_item($value);
    $data[] = $item;

    if (!empty($value) && !empty($this->context->request_config)) {
        $subdatum = $this->get_subdatum($this->tipo, $value);
        $context  = common::merge_unique_context($context, $subdatum->context);
        array_push($data, ...$subdatum->data);
    }
}

return common::build_element_json_output($context, $data);
```

---

## Client Consumption

- **context** matched by `tipo` (+ `section_tipo`, + `mode`) via `.find()` — first match wins, one context per identity key.
- **data** matched by `tipo + section_tipo + section_id + parent` (`row_section_id` preserves portal row identity).

Key files: `core/common/js/common.js`, `core/section/js/section_record.js`, `core/component_common/js/common.js`.

---

## Worker mode (RoadRunner)

`worker/class.cache_manager.php` runs `\common::clear()` at the start of every worker request, purging `$cache_structure_context`, `$cache_order_path`, tools/buttons caches, etc. The context cache key also embeds `logged_user_id()` as defense in depth — cross-user context leakage is impossible even if a clearer is disabled.

---

## Debugging

### Missing data item
1. `permissions > 0`? Data is skipped entirely at 0.
2. `$options->get_data === true`?
3. Does the mode-resolution method return non-empty data?

### Missing / wrong context item
1. `$options->get_context === true`?
2. Needs `request_config` but was built with `add_request_config=false`? It will be `null` — deterministically, not cache-dependent.
3. Injected properties not reflected? The injection must go through `set_properties()` (check `properties_injected`).
4. Stale value after mutating `tools`/`buttons`? Those are shared with the cache — you mutated the cache entry; copy first.

### Subdatum empty
1. `$this->context->request_config` present? (Build context with `add_request_config=true`.)
2. `ddo_map` has entries for the locator's `section_tipo`?
3. Non-direct children (ddo `parent !== $this->tipo`) are intentionally skipped — they resolve through their parent.

### Regression safety
Run `test/server/common/context_cache_determinism_Test.php` (from `test/server/`: `../../vendor/bin/phpunit common/context_cache_determinism_Test.php`). Its 9 tests encode the cache-transparency invariants (per-call permissions/parent/request_config, simple/full isolation, no cache pollution top-level or nested, injected-properties isolation, order-path memo isolation). Also `common_Test.php` `test_get_cache_structure_context` asserts equal-but-not-same on cache hits.

---

## Code References

| What | File | Line |
|------|------|------|
| `context_key` / `merge_unique_context` | `core/common/class.common.php` | 50 / 72 |
| `clear` (worker purge) | `core/common/class.common.php` | 427 |
| `build_element_json_output` / `get_json` | `core/common/class.common.php` | 1299 / 1321 |
| `get_structure_context` (wrapper) | `core/common/class.common.php` | 1390 |
| `build_structure_context` (stamp) | `core/common/class.common.php` | 1410 |
| `build_structure_context_core` (cached core) | `core/common/class.common.php` | 1520 |
| `resolve_context_parent` | `core/common/class.common.php` | 1922 |
| `get_structure_context_simple` | `core/common/class.common.php` | 1989 |
| `get_subdatum` | `core/common/class.common.php` | 2008 |
| `get_data_item` | `core/component_common/class.component_common.php` | 3550 |
| `get_order_path` (memoized) | `core/component_common/class.component_common.php` | 4232 |
| Section / sections / portal controllers | `core/section/section_json.php`, `core/sections/sections_json.php`, `core/component_portal/component_portal_json.php` | — |
| Determinism regression tests | `test/server/common/context_cache_determinism_Test.php` | — |

(Line numbers drift with edits — confirm with grep when precision matters.)

---

## Related Skills

- **dedalo-datalist-resolution** — How `datalist` (data-layer) is resolved for selection components
- **dedalo-request-config** — How `request_config` (context-layer) is built from ontology
- **dedalo-flow-analysis** — Tracing data from API response through the client lifecycle
- **dedalo-ontology-mapping** — How ontology properties feed both layers
