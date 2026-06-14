# Add a new area

Add a new top-level grouping to the back-office menu — a node that contains sections and sub-areas, scopes permissions and shows an aggregated dashboard, but owns no records of its own.

This is a *how-to* guide. For the conceptual model and the class reference, read first:

- [Areas (index)](../../core/areas/index.md) — what an area is, the inheritance chain, and the roster of every shipped area
- [area_common](../../core/areas/area_common.md) — the shared base class (`get_instance()`, the JSON fallback, the dashboard structure-walk and metrics)
- [area](../../core/areas/area.md) — the concrete top-level class that builds the menu and security roster (`get_areas()`)

## When do you need this

An area is **almost always ontology-only**. The generic machinery in `area_common` and `area` already gives any area its identity, JSON dashboard payload, structure-walk and metrics, so most areas are just an ontology node plus a thin model-named subclass.

| You need | Then |
| --- | --- |
| A new menu grouping with the standard dashboard | Ontology node + thin subclass (steps 1–4). No bespoke PHP. |
| Custom server logic — a different JSON payload, a tree view, extra API actions | Add a `<area_X>_json.php` controller and/or override methods in your subclass (step 5). `area_thesaurus` and `area_ontology` do this. |
| A new per-section dashboard metric | No code in the area at all — add a `metric_<name>()` method on `area_common` (or your subclass) and list `<name>` in the node's `properties.dashboard.metrics`. See [area_common → Metric convention](../../core/areas/area_common.md#metric-convention). |

!!! note "Why a subclass at all, if it is empty?"
    The autoloader and client mirror are convention-based: a node with `model: 'area_X'` resolves to `core/area_X/class.area_X.php`. So the model name on the node *requires* a matching class file to exist, even when its body is empty (`class area_X extends area_common {}`). The alternative is to reuse the existing `model: 'area'` and only add a node — but then your area shares the generic class and cannot be told apart for per-area JS, CSS or future logic. Thin subclasses are the house pattern; `area_admin`, `area_resource`, `area_root` and others are all empty bodies.

## 1. Create the PHP subclass

There is no scaffolder for areas (unlike [tools](../tools/creating_tools.md)). Copy an existing thin sibling and rename. `core/area_admin/class.area_admin.php` is the canonical template — its entire body is empty:

``` php
<?php declare(strict_types=1);
/**
* AREA_NUMISDATA
*/
class area_numisdata extends area_common {



}//end area_numisdata
```

The class **name must equal the directory name** (`area_numisdata` → `core/area_numisdata/class.area_numisdata.php`). The [autoloader](../../core/areas/index.md) resolves the bare model name `area_numisdata` to `DEDALO_CORE_PATH/area_numisdata/class.area_numisdata.php` — no registration array, no include edit. The name must also pass the SEC-048 allowlist (`^[A-Za-z_][A-Za-z0-9_]{0,127}$`) and resolve inside `DEDALO_CORE_PATH`; a plain `area_*` name satisfies both.

!!! note "No matrix table — by design"
    `common::get_matrix_table_from_tipo()` short-circuits and returns `null` for any model whose name starts with `area` (plus `menu` and `section_tool`). That is what makes an area record-less: it is a structural node, not a table. Do not give your area a `matrix_table` term.

## 2. Add the ontology node

Create one ontology node for the area with `model: 'area_numisdata'`. Areas use the parent/children grouper shape, not a section's `matrix_table` wiring — see the node-shape reference at `core/ontology/templates/area_grouper_data.json` and the [Ontology](../../core/ontology/index.md) docs. The node needs:

- `model` = your subclass name (`area_numisdata`)
- a **term/label** (the menu caption, per language)
- a **parent** in the ontology so it is reachable by the menu walk (step 3)
- the sections it groups, attached as **ontology children** (step 4)

The model value lives on the node and is surfaced server-side via `ontology_node::get_model_by_tipo($tipo)` and client-side as `options.model`; that resolved model is what `area_common::get_instance($model, $tipo, 'list')` instances (it does `new $model(...)` — see [area_common → Instantiation](../../core/areas/area_common.md#instantiation-lifecycle)).

## 3. Wire it into the menu roster

A node alone does not appear in the menu. The menu is built by `area::get_areas()`, which iterates a **fixed list of root-area models** and recursively collects each one's children (filtered by `config_areas.php`). See [area → get_areas](../../core/areas/area.md) and [Menu](../../core/ui/menu.md). You have two ways to surface a new area:

- **Sub-area (recommended):** attach your area node as an ontology **child of an existing root area** (e.g. under `area_resource` or `area_admin`). `get_areas()` walks children recursively, so it is picked up automatically — no PHP edit.
- **New root area:** if it must sit at the top level beside Resources/Admin/…, add its model to the `$ar_root_areas` roster inside `area::get_areas()` in `core/area/class.area.php`. This is the one PHP edit a root-level area requires; follow the existing `ontology_utils::get_ar_tipo_by_model('area_X')[0]` pattern (the newer entries guard a missing node with a warning instead of fataling).

!!! warning "Allow/deny per installation"
    `area::get_config_areas()` reads `config/config_areas.php` (`areas_deny` / `areas_allow`). If an installation lists your area tipo in `areas_deny` it is hidden from the menu and the security roster even though the node and class are correct. Check there if a correctly-wired area does not appear.

## 4. Attach the sections it groups

An area is a container: it groups [sections](../../core/sections/index.md) (and sub-areas) as ontology children. Attach each section node as a child of your area node. `area_common::get_dashboard_child_sections()` walks these children recursively and collects descendant **section** tipos — that list drives the dashboard. The walk descends through `area`/`section`, accepts `section`, and excludes `login` / `tools` / `section_list` / `filter` / `section_tool`. No file changes: the dashboard is assembled by the inherited `get_dashboard_data()`.

## 5. (Optional) Client assets and a JSON controller

For a standard area you can stop at step 4 — the client falls through to the shared `core/area_common/js/area_common.js` + `dashboard.js`, and the server falls through to `core/area_common/area_common_json.php` (the generic dashboard payload).

Add files only if you need bespoke behaviour:

- **Client class** — `core/area_numisdata/js/area_numisdata.js` with a named export matching the model. The simplest form aliases the base widget, exactly like `core/area_admin/js/area_admin.js`:

  ``` js
  // imports
      import {area} from '../../area/js/area.js'

  /**
  * AREA_NUMISDATA. Alias of area
  */
  export const area_numisdata = area
  ```

  The [client mirror](../../core/areas/index.md) in `core/common/js/instances.js` imports the default-prefix model from `core/<model>/js/<model>.js`, so this path is convention, not configuration. Optional `core/area_numisdata/css/area_numisdata.less` for styling.
- **JSON controller** — `core/area_numisdata/area_numisdata_json.php`. `area_common::get_json()` defers to a per-class controller when one exists and otherwise includes `area_common_json.php`. Add one only for a non-standard payload or a tree view (`area_thesaurus` / `area_ontology` do this).

## Worked example: a "Numismatic data" resource area

Goal: a new menu grouping under **Resources** that gathers a few numismatic sections and shows the standard dashboard.

1. **Subclass** — copy `core/area_admin/` to `core/area_numisdata/`, rename the directory and `class.area_admin.php` → `class.area_numisdata.php`, and change the class line to `class area_numisdata extends area_common {}`. Leave the body empty.
2. **Node** — create one ontology node, `model: 'area_numisdata'`, with the label `Numismatic data` (per language), parented so it can be reached.
3. **Menu** — attach the new node as an **ontology child of the `area_resource` node**. Because it is a sub-area, `area::get_areas()` collects it on its recursive walk — no edit to `core/area/class.area.php`.
4. **Sections** — attach your existing `section` nodes (coins, hoards, mints…) as ontology children of `area_numisdata`. They now appear under the new grouping, and `get_dashboard_child_sections()` returns their tipos for the dashboard.
5. **Client (optional)** — add `core/area_numisdata/js/area_numisdata.js` aliasing `area` (as in step 5 above) only if you later want area-specific JS; otherwise omit it and the shared base renders the dashboard.

Reload the back-office: "Numismatic data" appears under Resources, its dashboard counts each child section's records (permission-aware, via `count_section_records()` → `search::count()`), and the 30-day activity timeline renders from `matrix_activity`.

If instead it had to be a **top-level** grouping beside Resources/Admin, step 3 would become: add `$ar_root_areas[] = ontology_utils::get_ar_tipo_by_model('area_numisdata')[0];` to the roster in `area::get_areas()`.

## Common pitfalls

- **Node model with no matching class.** A node `model: 'area_numisdata'` with no `core/area_numisdata/class.area_numisdata.php` cannot be autoloaded. The directory name *is* the contract — create the file even if its body is empty.
- **Class name ≠ directory name.** `class.area_numisdata.php` must declare `class area_numisdata`. The loader resolves `area_numisdata` → `core/area_numisdata/class.area_numisdata.php`; a mismatch fails the realpath-containment / class-existence check.
- **Expecting a root area to appear automatically.** `area::get_areas()` iterates a **fixed roster** of root models. A brand-new *root* area must be added to that list in `core/area/class.area.php`; only **sub-areas** (children of an existing root) are picked up by the recursive walk for free.
- **Hidden by `config_areas.php`.** A correct area that never shows is often denied in `config/config_areas.php` (`areas_deny`). Check there before debugging code.
- **Giving the area a matrix table.** Areas hold no records; `get_matrix_table_from_tipo()` returns `null` for `area*` models by design. Do not attach a `matrix_table` term — store data in the **sections** the area groups, not the area.
- **Client export name mismatch.** If you add `core/area_numisdata/js/area_numisdata.js`, its named export must be exactly `area_numisdata`; the dynamic import in `instances.js` looks up the export by model name.
- **Per-area metrics need ontology, not just code.** Defining `metric_<name>()` is half the job — the name must also be listed in the node's `properties.dashboard.metrics`, or `get_dashboard_data()` never invokes it.

## Related

- [Areas (index)](../../core/areas/index.md) — concept, inheritance chain, roster of shipped areas
- [area_common](../../core/areas/area_common.md) — base class: `get_instance()`, JSON fallback, dashboard structure-walk, metric convention
- [area](../../core/areas/area.md) — concrete top-level class: `get_areas()`, `config_areas.php` allow/deny
- [Sections (index)](../../core/sections/index.md) — the record-bearing leaves an area groups
- [Menu](../../core/ui/menu.md) — the navigation tree built from `area::get_areas()`
- [Ontology (index)](../../core/ontology/index.md) — the active schema the area walk reads
- [Creating tools](../tools/creating_tools.md) — the sibling extension guide (the one extension type with a scaffolder)
