# area_thesaurus

> The server class `area_thesaurus` — the back-office area that renders and edits the **hierarchical thesaurus trees** (taxonomies under the `hierarchy` TLD and project thesauri), and the host of the client TS-tree widget.

> See also: [Areas base classes](area_common.md) · [TS tree (ts_object)](../ontology/ts_object.md) · [Sections](../sections/index.md) · [Components](../components/index.md)

This page is the **class-level + subsystem reference** for `area_thesaurus`. It
assumes you already know what an *area* is (a top-level menu grouping that is an
ontology node, owns no records of its own, and groups sections) — read
[Areas](area_common.md) and the [Architecture overview](../architecture_overview.md)
first. The tree machinery itself (node builder, mutations API, client widget) is
documented in [TS tree](../ontology/ts_object.md); this page covers only how
`area_thesaurus` *drives* that machinery.

## Role

`area_thesaurus` (in `core/area_thesaurus/class.area_thesaurus.php`,
`class area_thesaurus extends area_common`) is the area whose job is to present
**every active thesaurus as an expandable tree** in one screen: it resolves
which hierarchies/ontologies are active, groups them by typology, supplies the
root terms each tree starts from, and powers thesaurus search with full
ancestor-path resolution. The actual tree rows are *not* rendered by this class —
each row is a section rendered as a [`ts_object`](../ontology/ts_object.md) node, on
both the server (the `ts_object` PHP class) and the client (the `ts_object.js`
widget).

Inheritance and the area family:

| class | role |
| --- | --- |
| `common` | the universal element base — identity (tipo/mode/lang), properties, structure-context cache, permissions, `{context,data}` JSON output. See the [common contract](../sections/section.md#role). |
| `area_common` | the shared area layer: `get_instance($model,$tipo,$mode)`, the generic `get_json()` fallback, dashboard child-section walking and metrics. See [Areas](area_common.md). |
| **`area_thesaurus`** *(this class)* | the thesaurus area: active-hierarchy resolution, typology grouping, root-term supply, and thesaurus search with path resolution. |
| `area_ontology` | `class area_ontology extends area_thesaurus` — **the same machinery in ontology mode** (see [below](#area_ontology-the-same-machinery-in-ontology-mode)). Overrides only `get_hierarchy_section_tipo()` and `get_main_table()`. |

!!! note "Inheritance"
    `area_thesaurus extends area_common extends common`. From `area_common` it
    inherits `get_instance()`, the `__construct(tipo, mode)` that sets
    `lang = DEDALO_DATA_LANG` and calls `load_structure_data()`,
    `get_section_tipo()` (returns the area's own tipo) and `get_section_id()`
    (returns `null`/empty — an area has no record id). From `common` it inherits
    the structure-context cache, properties, permissions and the
    `build_element_json_output()` / `get_json()` output path.

## Responsibilities

- **Active-hierarchy resolution** — ask `hierarchy::get_active_elements()` (or
  `ontology::get_active_elements()` in ontology mode) which hierarchies are live,
  skip those not `active_in_thesaurus`, without a typology, or without root
  terms, and apply optional typology/section filters.
- **Typology grouping** — resolve each hierarchy's typology id, name and order so
  the client can group the trees under collapsible typology blocks.
- **Root-term supply** — provide the root-term locators each tree starts from
  (via `hierarchy::get_root_terms()` / `ontology::get_root_terms()`), and the
  `children_tipo` the client needs to expand each root.
- **Thesaurus search with path resolution** — run an SQO and, for every hit,
  walk its recursive ancestors and emit the `ts_object` data for the whole
  branch so the client can rebuild and hilite the path to each result.
- **JSON output controller** — assemble the `{context, data}` payload the client
  area instance loads (`area_thesaurus_json.php`, shared with `area_ontology`).
- **Cache + name/order lookups** — resolve and per-process-cache typology names,
  typology order values and hierarchy names.

It does **not** own the tree nodes, the tree mutations (add/move/order), or term
resolution — those belong to [`ts_object` / `dd_ts_api`](../ontology/ts_object.md).
It does **not** persist anything: like every area it holds no records.

## Key concepts

### The storage model it reads (never changes)

A thesaurus is a hierarchy of section records linked by parent/child locators.
The **child** stores the parent reference in its `relation` column under the
`component_relation_parent` tipo (`type: dd47`,
`DEDALO_RELATION_TYPE_PARENT_TIPO`); children are always *computed* by searching
who points at a parent (`component_relation_children`, with
`use_db_data=false`). `area_thesaurus` only reads this graph — to find root
terms, to count/iterate children when building search paths, and to walk
ancestors. The authoritative description lives in
[TS tree](../ontology/ts_object.md) and the
[`component_relation_parent`](../components/component_relation_parent.md) /
[`component_relation_children`](../components/component_relation_children.md)
docs.

### Hierarchy element → tree-section item

`get_hierarchy_sections()` turns each active hierarchy element into a plain
`stdClass` the client renders as one tree root group. The fields it stamps:

| field | meaning |
| --- | --- |
| `section_id`, `section_tipo` | the hierarchy *definition* record (in `hierarchy1` / `ontology35`) |
| `target_section_tipo` | the section whose records *are* the tree terms |
| `target_section_name` | the hierarchy element's name |
| `children_tipo` | the `component_relation_children` tipo used by the client/API for fast child resolution (`ontology14` in ontology mode; otherwise the first `component_relation_children` child of the target section) |
| `typology_section_id` | the typology this hierarchy belongs to (`'14'` fixed in ontology mode) |
| `order` | the hierarchy's order |
| `type` | always `'hierarchy'` |
| `active_in_thesaurus` | the element's thesaurus-active flag |
| `root_terms` | the root-term locators the tree starts from |

### Identity / mode flags

- `$thesaurus_mode` (instance, nullable string) — the display mode, surfaced into
  the context as `thesaurus_mode` (`'default'` when unset). Read from properties.
- `$model_view` (protected bool, default `false`) — thesaurus "model view"
  switch.
- The **canonical section/typology tipos** are class statics and constants:
  `$typologies_section_tipo` = `DEDALO_HIERARCHY_TYPES_SECTION_TIPO` (`hierarchy13`),
  `$typologies_name_tipo` = `DEDALO_HIERARCHY_TYPES_NAME_TIPO` (`hierarchy16`);
  the hierarchy section is `DEDALO_HIERARCHY_SECTION_TIPO` (`hierarchy1`), the
  ontology section is `DEDALO_ONTOLOGY_SECTION_TIPO` (`ontology35`).

### Per-process name/order caches

`get_typology_name()`, `get_typology_order()` and `get_hierarchy_name()` memoize
into the class statics `$typology_names_cache`, `$typology_order_values_cache`
and `$hierarchy_names_cache`.

!!! warning "Worker state-bleed"
    These three caches are keyed by `section_id` only (not by user). They hold
    resolved *labels*, not permission-scoped data, so the leak is benign across
    users, but be aware they are **not** reset by `common::clear()` — the
    persistent-worker reset for the tree lives on `ts_object::clear()` /
    `hierarchy::clear()` (registered in `worker/class.cache_manager.php`), which
    is what evicts the term/children caches that *do* matter for correctness.

## Files & structure

`area_thesaurus` is a small server class plus a thin client area; the heavy
lifting is delegated to the shared TS-tree stack.

```text
core/area_thesaurus/
├── class.area_thesaurus.php          # the PHP area class (this doc)
├── area_thesaurus_json.php           # JSON {context,data} controller (shared with area_ontology)
├── css/
│   └── area_thesaurus.less
└── js/
    ├── area_thesaurus.js             # client area instance (build / render / search wiring)
    └── render_area_thesaurus.js      # list render: typology blocks + render_root_term

core/area_ontology/
├── class.area_ontology.php           # extends area_thesaurus (ontology mode)
├── area_ontology_json.php            # `return include .../area_thesaurus/area_thesaurus_json.php`
├── css/area_ontology.less
└── js/area_ontology.js               # `export const area_ontology = area_thesaurus`  (literal alias)
```

The tree rows themselves come from `core/ts_object/` (server + client), and tree
mutations from `core/api/v1/common/class.dd_ts_api.php`. See
[TS tree](../ontology/ts_object.md).

### Server build flow (`area_thesaurus_json.php`)

The controller is included inside the area instance's scope by
`common::get_json()`. Its shape:

1. **context** (`$options->get_context`): builds `get_structure_context()`, then
   overrides `section_tipo = $tipo` (the area tipo is used as a section_tipo so
   the search panel can store per-area presets) and stamps
   `thesaurus_mode = properties->thesaurus_mode ?? 'default'`.
2. **data** (`$options->get_data` and `permissions > 0`):
   - calls `get_hierarchy_sections()` with the property filters
     `hierarchy_types` / `hierarchy_sections` and `build_options->terms_are_model`;
   - **re-filters by permission per hierarchy**: drops any whose
     `target_section_tipo` lacks read permission, any inactive-in-thesaurus, any
     missing `children_tipo`, and filters each `root_terms` list down to
     readable roots (dropping the whole hierarchy when none remain). The
     `area_ontology` global-admin path skips these checks to expose the full TLD
     list;
   - builds the unique `typologies` list (`get_typology_name()` /
     `get_typology_order()`);
   - emits one data item `{tipo, value: hierarchy_sections, typologies}`;
   - if `properties->hierarchy_terms` is set, or `properties->action==='search'`,
     runs `search_thesaurus()` and attaches the result as `item->ts_search`.
3. returns `common::build_element_json_output($context, $data)`.

The search branch is reached from the API: when the client requests the area
with `search_action='search'`, `dd_core_api` injects `properties->action` and
`properties->sqo` onto the area instance via `set_properties()` (so the
request-specific values never bake into the shared structure-context cache),
which this controller then dispatches to `search_thesaurus()`.

### Client flow (`area_thesaurus.js` / `render_area_thesaurus.js`)

- `init()` defers to `area_common.prototype.init`, then subscribes the
  search-panel toggle, the per-area open-search-panel restore, and the **Ctrl+M**
  show/hide-models key command (persisted in the IndexedDB `status` table). It
  also reads `thesaurus_view_mode` and `search_tipos` from the URL.
- `build()` builds the RQO, autoloads `{context,data}` via `build_autoload`,
  splits out `context` / `data` / `widgets`, and creates a keyed `search`
  (`filter`) instance. **`show_models` defaults to `true` for `area_ontology`,
  `false` for `area_thesaurus`.** Builds are skipped from destroying
  dependencies during an active search so live `ts_object` instances survive for
  `parse_search_result`.
- `render_area_thesaurus.prototype.list` draws collapsible **typology blocks**
  and, for each hierarchy root term, calls `render_root_term()` which returns a
  placeholder and asynchronously instantiates a `ts_object` (`is_root_node:true`,
  `area_model`, `is_ontology`) that replaces the placeholder once rendered. The
  search-result branch calls `ts_object.parse_search_result(...)` instead.

## Instantiation & lifecycle

`area_thesaurus` has no factory of its own; it inherits `area_common::get_instance()`:

```php
public static function get_instance(
    string $model,          // 'area_thesaurus' (or 'area_ontology')
    string $tipo,           // the area ontology tipo, e.g. 'dd100' (thesaurus) / 'dd5' (ontology)
    string $mode = 'list'
) : object
```

It is a plain `new $model($tipo, $mode)` — there is **no per-process instance
cache** for areas (unlike `section`). In practice it is reached through
`area::get_instance($model, $tipo, $mode)` from the API dispatcher (`area`
inherits the same factory), or constructed directly.

```php
// instance the thesaurus area in list mode
$area = area_thesaurus::get_instance('area_thesaurus', 'dd100', 'list');

// which active hierarchies show up as trees?
$hierarchy_sections = $area->get_hierarchy_sections();
//  → [ { section_tipo, target_section_tipo, children_tipo, root_terms, ... }, ... ]

// resolve a typology label / order (cached)
$name  = $area->get_typology_name(7);   // e.g. 'Onomastics'
$order = $area->get_typology_order(7);  // e.g. 3
```

The JSON the client consumes is produced by `get_json()` (inherited from
`area_common`, which falls back to `area_common_json.php` only when no
`<class>_json.php` exists — here `area_thesaurus_json.php` is present, so it is
used; `area_ontology` re-includes the same file).

## Key methods

Grouped by concern. *static?* marks class-level (static) methods. All are
verified against `class.area_thesaurus.php`.

### Hierarchy / typology resolution

| method | static? | purpose |
| --- | --- | --- |
| `get_hierarchy_section_tipo()` | | The hierarchy definition section tipo — `DEDALO_HIERARCHY_SECTION_TIPO` (`hierarchy1`). Overridden by `area_ontology` to return `ontology35`. |
| `get_main_table()` | | The main matrix table of the current hierarchy — `hierarchy::$main_table` (`matrix_hierarchy_main`). Overridden by `area_ontology` (`matrix_ontology_main`). |
| `get_hierarchy_typologies()` | | All typology record ids, via `section::get_ar_all_section_records_unfiltered($typologies_section_tipo)`. |
| `get_hierarchy_sections(?$hierarchy_types_filter=null, ?$hierarchy_sections_filter=null, $terms_are_model=false)` | | The core resolver: turn each active hierarchy/ontology element into a tree-section item (skipping not-active, no-typology, no-root-term, and filtered ones). Picks `hierarchy` vs `ontology` by `get_called_class()`. |

### Names & order (cached)

| method | static? | purpose |
| --- | --- | --- |
| `get_typology_data($section_id)` | | The typology locator of a hierarchy record (reads `DEDALO_HIERARCHY_TYPOLOGY_TIPO`, `hierarchy9`, a `component_select`). Returns the first locator or `null`. |
| `get_typology_name($typology_section_id)` | | Resolve a typology's label (with fallback), memoized in `$typology_names_cache`. |
| `get_typology_order($typology_section_id)` | | Resolve a typology's order int (reads `DEDALO_HIERARCHY_TYPES_ORDER`, `hierarchy106`), memoized in `$typology_order_values_cache`. |
| `get_hierarchy_name($hierarchy_section_id)` | | Resolve a hierarchy term's name (reads `DEDALO_HIERARCHY_TERM_TIPO`, `hierarchy5`, with fallback), memoized in `$hierarchy_names_cache`. |

### Search (with path resolution)

| method | static? | purpose |
| --- | --- | --- |
| `search_thesaurus($search_query_object)` | | Run the SQO via `search::get_instance()`, then for every hit walk its recursive ancestors (`component_relation_parent::get_parents_recursive()`, memoized per call) and build the `ts_object` data for the whole branch (root + each parent + that parent's children), so the client can rebuild and hilite the path. Returns `{result, msg, errors, total, found}`. |
| `get_hierarchy_terms_sqo($hierarchy_terms)` | | Build a custom-filter SQO that matches a set of `{section_tipo, section_id}` terms (filters on `hierarchy22` id + section_tipo column, `$or` of `$and` groups, `limit 100`). Used to seed a search scoped to chosen hierarchy nodes. |

!!! note "How `search_thesaurus` builds the path"
    For each result it reverses the ancestor chain to put the root first, then
    for every parent in the path it instantiates the parent's
    `component_relation_children` component, reads its children, batch-resolves
    their `is_indexable` flag with `ts_node_repository::fetch_node_info()` (one
    query for the whole child set — the N+1 killer), and builds a
    [`ts_object`](../ontology/ts_object.md) per node keyed by
    `section_tipo:section_id` so shared branches are emitted once. Root nodes get
    their order from `hierarchy::get_main_order($tld)`.

### Inherited essentials (from `area_common` / `common`)

| method | from | purpose |
| --- | --- | --- |
| `get_instance($model,$tipo,$mode='list')` | `area_common` | `new $model(...)` — the area factory. |
| `get_json($request_options=null)` | `area_common` | Defers to `<class>_json.php` (`area_thesaurus_json.php`) for the `{context,data}` payload. |
| `get_section_tipo()` / `get_section_id()` | `area_common` | Section-shaped compatibility: returns the area tipo / `null`. |
| `get_structure_context()`, `get_properties()`, `set_properties()` | `common` | Context build + properties (the request-specific search vars are injected via `set_properties()`). |

## area_ontology — the same machinery in ontology mode

`area_ontology` is **not** a parallel implementation: it is `area_thesaurus`
specialized for the ontology TLD. On the server `class area_ontology extends
area_thesaurus` and overrides only two methods:

| override | thesaurus | ontology |
| --- | --- | --- |
| `get_hierarchy_section_tipo()` | `hierarchy1` | `ontology35` |
| `get_main_table()` | `matrix_hierarchy_main` | `matrix_ontology_main` |

Everything else branches at runtime on `get_called_class()` / `get_model()`:
`get_hierarchy_sections()` calls `ontology::get_active_elements()` /
`ontology::get_root_terms()` instead of `hierarchy::*`, uses the fixed
`ontology::$children_tipo` (`ontology14`) and typology id `'14'`, and **does not**
skip elements on the `active_in_thesaurus` / empty-root-term rules (the ontology
tree shows model nodes that may have no terms). The JSON controller adds a
global-admin fast path that exposes the full TLD list.

On the client the alias is literal:

```javascript
// core/area_ontology/js/area_ontology.js
export const area_ontology = area_thesaurus
```

and `area_ontology_json.php` is just `return include
.../area_thesaurus/area_thesaurus_json.php`. The differences are carried as
runtime flags (`area_model`, `is_ontology`, `show_models` default `true`,
`thesaurus_view_mode==='model'`, the `search_tipos` URL auto-search) rather than
new code paths.

## How it fits with the rest of Dedalo

- **[TS tree (`ts_object` / `dd_ts_api`)](../ontology/ts_object.md)** — the area is
  the *host*; every tree row is a `ts_object`. The area supplies roots and search
  paths; expand/collapse, children resolution, term rendering and all mutations
  (add child, move/reparent with cycle guard, save order) live in the TS-tree
  stack. Build a `ts_object` from a node, never reimplement node rendering here.
- **[`hierarchy`](../ontology/hierarchy.md) / `ontology`** — the active-element registry
  and root-term/main-order source (`hierarchy extends ontology`, so
  `get_root_terms()` / `get_main_order()` are inherited; `area_thesaurus` calls
  the `hierarchy::*` facet, `area_ontology` the `ontology::*` facet).
- **[Areas (`area_common` / `area`)](area_common.md)** — the base that provides
  construction, the `get_json()` fallback, dashboard metrics and the
  menu-assembly (`area::get_areas()` makes the thesaurus area a top-level menu
  node).
- **[Sections](../sections/index.md)** — each tree term is a record of a
  `section`; the area reads them through component instances, never by SQL.
- **[Components](../components/index.md)** — it leans on
  [`component_relation_parent`](../components/component_relation_parent.md)
  (`get_parents_recursive`, children-tipo resolution),
  [`component_relation_children`](../components/component_relation_children.md)
  (the child set), [`component_select`](../components/component_select.md)
  (typology), and the name components (`component_input_text`-family) for labels.
- **[Search (SQO)](../sqo.md)** — `search_thesaurus()` runs a Search Query Object
  through `search::get_instance()`; `get_hierarchy_terms_sqo()` constructs the
  scoped filter. The client `search`/`filter` instance feeds the search panel.

## Examples

### Run a thesaurus search and read the path

```php
$area = area_thesaurus::get_instance('area_thesaurus', 'dd100', 'list');

// build an SQO scoped to chosen hierarchy nodes …
$sqo = $area->get_hierarchy_terms_sqo($hierarchy_terms); // [{ value:[{section_tipo, section_id}, …] }]

// … or use any SQO you already have, then resolve full paths:
$result = $area->search_thesaurus($sqo);
//  $result->found  → [ {section_tipo, section_id}, … ]   (the raw hits)
//  $result->result → array of ts_object data covering every branch to a hit
//  $result->total  → matched-record count
```

### What the client gets back (data item shape)

```json
{
    "tipo": "dd100",
    "value": [
        {
            "section_id": "1",
            "section_tipo": "hierarchy1",
            "target_section_tipo": "es1",
            "target_section_name": "Onomastic places (Spain)",
            "children_tipo": "es44",
            "typology_section_id": "7",
            "order": 3,
            "type": "hierarchy",
            "active_in_thesaurus": true,
            "root_terms": [ { "section_tipo": "es1", "section_id": "1", "...": "..." } ]
        }
    ],
    "typologies": [
        { "section_id": "7", "type": "typology", "label": "Geographic", "order": 3 }
    ],
    "ts_search": { "result": [], "found": [], "total": 0 }
}
```

(`ts_search` is present only when a search/`hierarchy_terms` was requested.)

!!! note "Accuracy caveats"
    The example `tipo`/`section_tipo`/`children_tipo` values above are
    illustrative — the real values are installation-specific ontology tipos.
    The *structure* (field names and nesting) is taken from
    `area_thesaurus_json.php` and `get_hierarchy_sections()`.

## Related

- [TS tree (ts_object)](../ontology/ts_object.md) — the node builder, mutations API
  (`dd_ts_api`) and client tree widget the area hosts.
- [Areas (area_common)](area_common.md) — the base area class and dashboard.
- [hierarchy](../ontology/hierarchy.md) — active elements, root terms, main order.
- [component_relation_parent](../components/component_relation_parent.md) ·
  [component_relation_children](../components/component_relation_children.md) —
  the parent/child edges of the tree.
- [Sections](../sections/index.md) — the records that are the tree terms.
- [SQO](../sqo.md) — the query format used by `search_thesaurus()`.
- [Architecture overview](../architecture_overview.md) — areas → sections →
  components → data.
</content>
</invoke>
