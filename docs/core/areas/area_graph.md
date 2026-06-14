# area_graph

> The **Graph** area — the back-office menu node that renders the thesaurus/hierarchy *networks* as a typology-grouped, collapsible tree, resolving each hierarchy's root terms and (on search) the full ancestor path of every matching record.

> See also: [area_common](area_common.md) · [area](area.md) · [area_thesaurus](area_thesaurus.md) · [Sections](../sections/index.md) · [TS tree / ts_object](../ontology/ts_object.md) · [Locator](../locator.md) · [SQO](../sqo.md)

This page is the **subsystem reference** for `area_graph` (the `area_graph` ontology node, its PHP class + JSON controller, and its client viewer). For *what an area is in general* — the menu grouping, the `area → area_common → common` inheritance, the dashboard machinery — read [area_common](area_common.md) and [area](area.md) first; this document does not repeat that material.

## Role

`area_graph` (in `core/area_graph/class.area_graph.php`, `class area_graph extends area_common`) is the concrete PHP class behind the **Graph** top-level menu area. Like every area it holds **no records of its own**; it is a structural ontology node (model `area_graph`, e.g. tipo `dd630`) that aggregates and *visualizes* data living in other sections.

Unlike the thin dashboard-only areas (`area_admin`, `area_resource`, …), `area_graph` ships its **own** `area_graph_json.php` controller and its own client viewer (`js/area_graph.js` + `js/render_area_graph.js`), so it produces a bespoke payload instead of the generic dashboard. What it visualizes is the **thesaurus/hierarchy networks**: the active *hierarchy* sections (model-`hierarchy` records under `hierarchy1`) grouped by their *typology*, with each hierarchy presented as a root node that the client expands into a `ts_object` tree. It is therefore a close sibling of [`area_thesaurus`](area_thesaurus.md) / [`area_ontology`](area_ontology.md) and reuses the same TS-tree stack ([`ts_object`](../ontology/ts_object.md)).

!!! note "Parallel implementation of the thesaurus methods"
    `area_graph` and `area_thesaurus` both extend `area_common` directly (neither extends the other), yet both define the same hierarchy/typology resolvers and `search_thesaurus()` path-building. They are **sibling, near-duplicate** implementations of the thesaurus-tree machinery — `area_graph` is *not* a subclass of `area_thesaurus`. If you change one, check whether the other needs the same change.

!!! note "Inheritance"
    `area_graph extends area_common extends common`. From `area_common` it gets `get_instance($model,$tipo,$mode)`, the `__construct(tipo,mode)` that sets lang to `DEDALO_DATA_LANG` and calls `load_structure_data()`, `get_section_tipo()` (returns the area's own tipo) and `get_section_id()` (returns `null`). From `common` it gets identity/accessors, `get_properties()`, `get_structure_context()`, permissions and the `?object $build_options` property the controller reads. `area_graph` is itself enumerated by `area::get_areas()` (via `ontology_utils::get_ar_tipo_by_model('area_graph')`, with a graceful warning when the ontology is out of date) so it appears in the main menu.

## Responsibilities

- **Resolve the active networks** — find every *active* hierarchy section (the `nexus40`/`hierarchy1` records flagged active) ordered by their order field.
- **Group hierarchies by typology** — read each hierarchy's typology select, then resolve the typology's display name and sort order so the client can render one collapsible block per typology.
- **Describe each hierarchy root** — for every active hierarchy resolve its *target section tipo*, its localized name, its order, and the relation-children tipo the client uses to lazy-load the tree.
- **Build the JSON payload** — `area_graph_json.php` assembles `{context, data}`: the context carries `graph_mode` and uses the **area tipo as `section_tipo`** (so search presets store against the area), and the data carries a single item whose `value` is the merged `[typologies …, hierarchy_sections …]` list.
- **Search the thesaurus** — given an SQO, run the search and compute the **full ancestor path** of each hit (recursive parents + self), combine those paths into a single hierarchized tree, and resolve each node through `ts_object` so the client can render and highlight the result subtree.
- **Drive the client viewer** — the JS `area_graph` instance loads the payload, owns a `search` filter instance and a page-global `ts_object`, and renders the typology → hierarchy-root → children-container DOM that the TS tree expands into.

## Key concepts / data model

`area_graph` does not own a matrix table; it reads from the **hierarchy** subsystem. The concepts it stitches together:

| concept | where it lives | resolved by |
| --- | --- | --- |
| **Network / hierarchy** | a record in `hierarchy1` (`nexus40` in the search), flagged active via `nexus44`, ordered by `nexus42` | `get_active_networks_sections()` |
| **Typology** | a `component_select` (`hierarchy9` / `DEDALO_HIERARCHY_TYPOLOGY_TIPO`) on the hierarchy, pointing into the typologies section `nexus57` | `get_typology_data()` → name `get_typology_name()` (`hierarchy16`), order `get_typology_order()` (`hierarchy106`) |
| **Target section** | the section a hierarchy describes — `hierarchy53` (terms) or `hierarchy58` (models) | `get_hierarchy_sections()` |
| **Hierarchy name** | localized term of the hierarchy node (`hierarchy5` / `DEDALO_HIERARCHY_TERM_TIPO`) | `get_hierarchy_name()` |
| **Children link tipo** | `hierarchy45` (terms) or `hierarchy59` (models) — the relation-children component the client tree expands | `get_hierarchy_sections()` (item `children_tipo`) |

The toggle between the *terms* view and the *models* view is the `terms_are_model` flag (the JS `build_options.terms_are_model`, read server-side as `$this->build_options->terms_are_model`). When `true`, `get_hierarchy_sections()` swaps the term-oriented tipos (`hierarchy53`/`hierarchy45`) for their model-oriented twins (`hierarchy58`/`hierarchy59`).

The single `data` item produced by the controller looks like:

```json
{
  "tipo"  : "dd630",
  "value" : [
    { "type": "typology",  "section_id": 3, "label": "Places", "order": 1 },
    { "type": "hierarchy", "section_id": 12, "section_tipo": "hierarchy1",
      "target_section_tipo": "ts1", "target_section_name": "Geographic terms",
      "typology_section_id": 3, "order": 0, "children_tipo": "hierarchy45" }
  ],
  "ts_search": { "result": { }, "total": 0, "msg": "Records found: 0" }
}
```

`ts_search` is present only when the request carries `hierarchy_terms` (a focused-terms SQO) or a `properties.action === 'search'` payload; it is the output of `search_thesaurus()`.

!!! warning "Path / network graph naming clash"
    Do not confuse this subsystem with `core/section/js/build_graph_data.js`, which builds a **relation network graph** (nodes = records, edges = relation-model locators) for a section's record graph view. That file is unrelated to the `area_graph` area; `area_graph` renders a *thesaurus hierarchy list*, not a node-link relation graph.

## Files & structure

```text
core/area_graph/
├── class.area_graph.php      # PHP class (extends area_common): networks/typology/hierarchy resolution + thesaurus search
├── area_graph_json.php       # JSON controller: builds {context, data} (deferred to by area_common::get_json)
├── css/
│   └── area_graph.less       # currently an empty .area_graph rule (styling comes from the shared TS-tree CSS)
└── js/
    ├── area_graph.js         # client instance: init / build / render / navigate, owns filter + ts_object
    └── render_area_graph.js  # DOM builder: typology blocks, hierarchy roots, search-result rendering
```

The PHP class falls into two concerns: the **structure/typology resolvers** (top of the file) consumed by the controller, and the **thesaurus search** block (`search_thesaurus` and helpers, marked `@ others`) consumed when a search SQO is present.

## Public API

Grouped by concern. *static?* marks class-level methods. All names verified against `core/area_graph/class.area_graph.php`.

### Networks & typologies (structure resolvers)

| method | static? | purpose |
| --- | --- | --- |
| `get_networks_typologies()` | | Return all `section_id`s of the typologies section (`nexus57`), unfiltered, via `section::get_ar_all_section_records_unfiltered()`. |
| `get_active_networks_sections()` | ✓ | Build an SQO over `nexus40` (hierarchy1) filtered to *active* networks (`nexus44`), ordered by `nexus42`, run `search`, and return the `db_result` (or `false`). |
| `get_hierarchy_sections($hierarchy_types_filter=null, $hierarchy_sections_filter=null, $terms_are_model=false)` | | The core resolver: for each active network, resolve its typology, target section tipo, localized name, order and children tipo; skip networks without a typology or empty target; optionally filter by typology and/or target-section tipo. Returns an array of `hierarchy` items. |
| `get_typology_data($section_id)` | | Read the hierarchy's typology select (`hierarchy9`) for one section_id; returns the first locator object (or `null`). |
| `get_typology_name($typology_section_id)` | | Resolve the localized typology name (`hierarchy16`), with a `get_value_with_fallback_from_data` fallback and a static per-call cache; returns a placeholder string when untranslated. |
| `get_typology_order($typology_section_id)` | | Resolve the typology's numeric order (`hierarchy106`), statically cached; returns `0` when absent. |
| `get_hierarchy_name($hierarchy_section_id)` | | Resolve the localized hierarchy/term name (`hierarchy5`), with fallback and a static `$hierarchy_name_cache`; returns a placeholder when untranslated. |

### Thesaurus search (path building)

| method | static? | purpose |
| --- | --- | --- |
| `search_thesaurus($search_query_object)` | | Run the SQO, and for each hit compute its full path (`component_relation_parent::get_parents_recursive()` reversed + the record itself); combine paths (`combine_ar_data`), walk them (`walk_hierarchy_data`), and return `{result, total, msg}` (plus `debug` under `SHOW_DEBUG`). |
| `get_hierarchy_terms_sqo($hierarchy_terms)` | | Build a `search_query_object` (id `thesaurus`, limit 100) whose filter `$or`-groups each focused term by its `section_id` (`hierarchy22`) **and** `section_tipo`, restricting the searched `section_tipo`s to those terms. |
| `combine_ar_data($ar_path_mix)` | ✓ | Turn an array of ancestor paths into a single hierarchized associative tree, keyed `"<section_tipo>_<section_id>"`, merged recursively across paths. |
| `walk_hierarchy_data($ar_data_combined)` | ✓ | Recursively resolve each `"<tipo>_<id>"` key through `new ts_object(...)->get_data()`, nesting children under a `heritage` container. |
| `get_siblings($ckey)` | ✓ | Helper that reads a node's `component_relation_children` (`DEDALO_THESAURUS_RELATION_CHILDREN_TIPO` / `hierarchy49`) data and returns its sibling keys. *(Currently called only from a commented-out branch in `combine_ar_data`; kept for the sibling-expansion path.)* |

### Identity / config (inherited, commonly used here)

| method | static? | source | purpose |
| --- | --- | --- | --- |
| `get_instance($model, $tipo, $mode='list')` | ✓ | `area_common` | Factory; build (cached) the area instance. |
| `get_section_tipo()` | | `area_common` | Returns the area's own tipo (areas have no separate section). |
| `get_section_id()` | | `area_common` | Always `null` — areas have no record id. |
| `get_json($request_options=null)` | | `common`/`area_common` | Defers to `parent::get_json()` because `area_graph_json.php` exists; that controller produces `{context, data}`. |
| `get_structure_context($permissions, $add_rqo)` | | `common` | Builds the context the controller stamps `section_tipo` and `graph_mode` onto. |

### Class fields

| field | type | purpose |
| --- | --- | --- |
| `$typologies_section_tipo` (static) | `string` = `'nexus57'` | Section that stores typology definitions. |
| `$typologies_name_tipo` (static) | `string` = `'nexus61'` | Component for the typology name. |
| `$model_view` (protected) | `bool` = `false` | Whether to show the model-view variant (set from `GET['model']`). |
| `$thesaurus_mode` | `?string` | The active thesaurus display mode for this instance. |
| `$hierarchy_name_cache` (protected static) | `array` | Memoizes hierarchy `section_id → name`. |

!!! note "`get_valor` is a magic accessor, not a real method"
    `get_typology_name()` calls `$component->get_valor($lang)`. `component_common` defines no `get_valor()`; it resolves through `common`'s `__call` accessor (returns the `valor` property if one exists, else `false`), after which the code falls back to `model::get_value_with_fallback_from_data(...)`. Treat the `get_valor` call as best-effort, with the fallback doing the real work.

## How it fits with the rest of Dedalo

- **[area_common](area_common.md) / [area](area.md)** — `area_graph` is one of the root areas enumerated by `area::get_areas()` and rendered in the menu. It inherits all of `area_common`'s structure/identity scaffolding but overrides the payload via its own JSON controller.
- **[TS tree / `ts_object`](../ontology/ts_object.md)** — the viewer is a thesaurus tree: each hierarchy root is a `wrap_ts_object` whose children load through the page-global `ts_object`, and `walk_hierarchy_data()` resolves search-path nodes with `new ts_object(section_id, section_tipo)->get_data()`. This is the same stack used by [`area_thesaurus`](area_thesaurus.md) / [`area_ontology`](area_ontology.md).
- **[Sections](../sections/index.md) / hierarchy** — the data comes from `hierarchy1` (networks) and `nexus57` (typologies); networks are read with `section::get_ar_all_section_records_unfiltered()` and via SQO `search`.
- **[SQO](../sqo.md) & [search](../sqo.md)** — `get_active_networks_sections()`, `search_thesaurus()` and `get_hierarchy_terms_sqo()` all build SQOs and call `search::get_instance(...)->search()`; results respect search/permission semantics.
- **[Components](../components/index.md)** — every name/order/typology value is read by instancing a `component_common` in `list` mode against the hierarchy section and calling `get_data()` / `get_data_lang()`; the typology link is a `component_select` locator and parents come from [`component_relation_parent`](../components/component_relation_parent.md).
- **[Locator](../locator.md)** — paths and combined keys are `"<section_tipo>_<section_id>"` derived from `locator` objects produced by `component_relation_parent::get_parents_recursive()`.
- **Client search** — the JS instance owns a keyed [`search`](../sqo.md) filter instance (`id_variant: self.model`) and a `search_container`, toggled by `toggle_search_panel`; the context's `section_tipo` is set to the **area tipo** specifically so search presets persist per area rather than per section.

## Examples

### Resolve the active hierarchy/typology structure (PHP)

```php
// instance the Graph area (model, tipo, mode); tipo is the area_graph ontology node
$area = area::get_instance('area_graph', 'dd630', 'list');

// 1. all active networks, ordered (db_result | false)
$networks = $area->get_active_networks_sections();

// 2. the hierarchy roots grouped/described for the viewer
//    (optionally filtered by typology and/or target section, and term vs model view)
$hierarchy_sections = $area->get_hierarchy_sections(
    null,  // hierarchy_types_filter
    null,  // hierarchy_sections_filter
    false  // terms_are_model: false = descriptor terms, true = model hierarchies
);
// each item: { section_id, section_tipo, target_section_tipo, target_section_name,
//              typology_section_id, order, type:'hierarchy', children_tipo }
```

### Search the thesaurus and build the result tree (PHP)

```php
$area = area::get_instance('area_graph', 'dd630', 'list');

// build an SQO focused on a set of terms, or pass any search_query_object
$sqo = $area->get_hierarchy_terms_sqo($hierarchy_terms);

$response = $area->search_thesaurus($sqo);
// $response->result : hierarchized {key => ts_object_data, heritage:{…}} tree
// $response->total  : matched record count
// $response->msg    : 'Records found: N'
```

### What the client does with the payload (JavaScript)

```javascript
// in area_graph.js build(): after build_autoload(self)
self.data    = self.datum.data.filter(element => element.tipo === self.tipo)
self.widgets = self.datum.context.filter(el => el.parent === self.tipo && el.typo === 'widget')
// render_area_graph.js then groups self.data value by typology and
// renders one collapsible 'thesaurus_type_block' per typology, each holding
// 'hierarchy_root_node' wrappers that the page-global ts_object expands.
```

!!! warning "Data-item tipo lookup in the renderer"
    `area_graph.js` stores the data filtered by `self.tipo` (the area tipo, e.g. `dd630`), and the JSON controller sets the item's `tipo` to `$this->get_tipo()` (the area tipo). But `render_area_graph.js` looks the item up with `self.data.find(item => item.tipo === 'dd100')` (`DEDALO_THESAURUS_TIPO`). These only line up when the graph area's tipo is `dd100`; for a differently-tipo'd `area_graph` node the renderer's `find` returns the `|| {}` empty fallback and no hierarchy blocks render. Verify the deployed `area_graph` node tipo against this hard-coded `'dd100'` before relying on the list view, and treat the constant as a likely fix target.

## Related

- [area_common](area_common.md) / [area](area.md) — what an area is, the menu/dashboard machinery, the inheritance chain.
- [area_thesaurus](area_thesaurus.md) — the sibling area that defines the same hierarchy/typology + `search_thesaurus` machinery.
- [Sections](../sections/index.md) — the record-bearing nodes (`hierarchy1`, `nexus57`) this area reads from.
- [TS tree / ts_object](../ontology/ts_object.md) — the thesaurus tree the viewer expands and that `walk_hierarchy_data()` resolves.
- [component_relation_parent](../components/component_relation_parent.md) — supplies the recursive ancestor paths for search results.
- [SQO](../sqo.md) — the query objects built by `get_active_networks_sections()`, `search_thesaurus()` and `get_hierarchy_terms_sqo()`.
- [Locator](../locator.md) — the typed pointers behind the `"<section_tipo>_<section_id>"` path keys.
