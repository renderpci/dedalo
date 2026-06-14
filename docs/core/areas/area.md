# area

> The server class `area` — a top-level grouping in the back-office menu (Resources,
> Activity, Admin, Thesaurus, Ontology, Maintenance, Graph, Development, Tools, Root).
> An area is an *ontology node*, not a table: it holds no records, only structure,
> permission context and an aggregated dashboard over its descendant sections.

> See also: [Architecture overview](../architecture_overview.md) ·
> [Sections](../sections/index.md) · [Components](../components/index.md) ·
> [Ontology](../ontology/index.md)

## Role

`area` (in `core/area/class.area.php`, `class area extends area_common`) is the
PHP runtime representation of a **top-level menu grouping**. Areas are the major
divisions of the back-office menu — Resources, Activity, Administration,
Thesaurus, Ontology, Maintenance, Graph, Development, Tools, Root — and each one
is an ontology node whose `model` is `area` (or a model-name variant such as
`area_root`, `area_admin`, `area_thesaurus`).

An area is **not** backed by a `matrix` table and owns no records of its own. It
is a structural/configuration node that *contains* sections and sub-areas as
ontology children. Areas anchor three things:

- the **menu tree** (areas are the top-level nodes; sections and sub-areas are
  their children, resolved through the ontology parent/children graph);
- **permission scoping** (an area is a node over which `common::get_permissions`
  can be evaluated, even though it has no record id);
- the **dashboard** that aggregates metrics over an area's descendant sections.

It sits in a three-class chain:

| class | role |
| --- | --- |
| **`area`** *(this class)* | The concrete **top-level** class. Adds the menu/security assembly: `get_areas()`, recursive children collection, and `config_areas.php` allow/deny filtering. |
| **`area_common`** | The shared layer specialising `common` for menu-grouping nodes: construction/identity, the `get_json()` fallback, the dashboard structure-walk, and the permission-aware metrics. |
| **`common`** | The universal base ([base classes → Layer 1](../components/base_classes.md#layer-1-common)): structure loading, `tipo`/`mode`/`lang` accessors, permissions, ontology resolution, the `{context, data}` JSON output helpers and the static caches. |

!!! note "Inheritance"
    `area extends area_common`, and `area_common extends common`. From `common`
    an area inherits the shared object machinery — the `$tipo`, `$mode`, `$lang`,
    `$model`, `$label`, `$permissions` properties and methods such as
    `load_structure_data()`, `get_tipo()` / `get_mode()`,
    `get_structure_context()`, `get_properties()` and `get_permissions()`. An
    area does **not** carry a `$dato` / `get_data()` of its own (that lives in
    `component_common`); its "data" is the dashboard payload it builds at JSON
    time.

## Responsibilities

`area_common` (inherited by every area):

- **Construction & identity** — the `get_instance($model, $tipo, $mode)` factory
  and a protected constructor that sets tipo/mode/lang and loads the ontology
  structure. `get_section_tipo()` returns the area's own tipo and
  `get_section_id()` returns `null` (so areas stay compatible with
  section-shaped APIs that build `request_config`, even though an area has no
  record id).
- **JSON output** — `get_json()` overrides `common::get_json()` to fall back to
  the shared `area_common_json.php` controller when the concrete subclass ships
  no `<class>_json.php`.
- **Structure listing** — `get_dashboard_child_sections()` walks the ontology
  children recursively and returns the descendant section tipos.
- **Permission-aware metrics** — `count_section_records()`, `get_dashboard_data()`,
  the `metric_*` convention, the static API entry point `get_activity_metric()`,
  and the deterministic `get_dashboard_color()`.

`area` (the concrete top-level class) adds:

- **Menu / security assembly** — `get_areas()` enumerates every major root area
  and recursively collects its child areas/sections, filtered against
  `config_areas.php`. The result feeds both the menu and the security-access
  full view.
- **Children criterion** — the static include/exclude model-name allowlists.
- **Installation config** — `get_config_areas()` reads `config_areas.php`
  (`areas_deny` / `areas_allow`).
- **Identifier** — `get_identifier()` returns the area tipo as a flat string.

## Key concepts

### An area is an ontology node with model `area`

There is no `CREATE TABLE` and no area table. An area exists only as a node in
the ontology whose `model` resolves to `area` (or a variant). Like every node it
has a `tipo`, a `parent`, a translatable label (`lg-*` term keys) and
`properties`. `area::get_areas()` re-emits each area as a small JSON object
carrying exactly those fields:

```json
{
    "tipo"      : "dd14",
    "model"     : "area_resource",
    "parent"    : "dd2",
    "properties": { },
    "label"     : "Resources"
}
```

Because an area is a node, the same ontology parent/children graph that places
sections under areas also places sub-areas under areas — the menu tree is read
out of the graph, not from a fixed map.

### The major root areas

`get_areas()` iterates a fixed list of *root* area models, resolving each to a
tipo via `ontology_utils::get_ar_tipo_by_model()`:

`area_root`, `area_activity`, `area_resource`, `area_tool`, `area_thesaurus`,
`area_graph`, `area_admin`, `area_maintenance`, `area_development`,
`area_ontology`.

Three of these (`area_graph`, `area_maintenance`, `area_ontology`) are guarded:
if the installation's ontology is out of date and the model is missing, a
warning is logged and the area is skipped — except `area_maintenance`, which
falls back to a fixed `DEDALO_AREA_MAINTENANCE_TIPO` (`dd88`) so maintenance work
always remains reachable.

### Children inclusion criterion

Which descendants `get_areas()` collects is governed by two static allowlists on
the `area` class:

```php
public static array $ar_children_include_model_name = ['area','section','section_tool'];
public static array $ar_children_exclude_modelo_name = ['login','tools','section_list','filter'];
```

A child is collected only if its model is in the include list **and** not in the
exclude list; recursion descends through the same rule.

!!! note "Two different walks"
    `area::get_ar_children_areas_recursive()` (menu/security) and
    `area_common::get_dashboard_child_sections()` (dashboard) are **separate**
    walks with **different** model criteria. The menu walk includes
    `section_tool` and excludes `login/tools/section_list/filter`; the dashboard
    walk accepts only `section`, descends through `area`/`section`, additionally
    excludes `section_tool`, and drops virtual/untabled (no `matrix_table`)
    sections because they are not countable. Do not assume the two return the
    same set.

### The dashboard payload

`area_common` turns an area into an aggregate view over its sections.
`get_dashboard_data($ar_metric_names = ['total'])` returns:

```json
{
    "area_tipo"   : "dd14",
    "area_label"  : "Resources",
    "generated_at": 1731768000,
    "metrics"     : ["total"],
    "sections"    : [
        { "section_tipo":"rsc167", "label":"Audiovisual", "model":"section",
          "color":"#3b82f6", "total":4321, "recent_7d":12 }
    ],
    "activity_30d": { "date_from":"…", "date_to":"…", "days":[…], "users":[…] }
}
```

- Each requested metric `N` is computed by a `metric_<N>(string $section_tipo)`
  method (`metric_total` is the only built-in per-section metric; it delegates to
  `count_section_records()`). The metric list is read from the area's ontology
  `properties.dashboard.metrics` when present, else defaults to `['total']`, so
  the dashboard is extensible per-area with no code change.
- `activity_30d` is an **area-level** metric (`metric_activity_30d`) that queries
  `matrix_activity` directly with JSONB operators (no per-row component
  instances), grouped by day, section and user, for the last 30 days. Larger
  ranges are fetched on demand through the API.
- `recent_7d` is derived from the already-computed `activity_30d` payload (no
  extra SQL) and attached to each section item.

`count_section_records()` is the permission-correct way to size a section: it
checks read permission, refuses sections with no `matrix_table`, then builds a
`search_query_object` and calls `search::count()` so the count respects user
permissions and project filters (the same path as `dd_core_api::count`).

## Instantiation & lifecycle

Areas use a thin singleton-style factory on `area_common`. Note that — unlike
`section::get_instance()` — the **model name comes first** and there is no
instance cache or `cache` flag; each call constructs a fresh object.

```php
public static function get_instance(
    string $model,            // the concrete class, e.g. 'area', 'area_resource', 'area_thesaurus'
    string $tipo,             // the area's ontology tipo, e.g. 'dd14'
    string $mode = 'list'     // runtime mode flag (typically 'list')
) : object
```

The protected `__construct($tipo, $mode)` sets tipo/mode, sets
`lang = DEDALO_DATA_LANG`, and calls the inherited `load_structure_data()` to
pull the area's ontology context (model, label, properties). Concrete areas are
distinguished by their `$model` argument; the factory does `new $model(...)`,
so the model name must be a real area class.

```php
// instance the Resources area
$model  = ontology_node::get_model_by_tipo('dd14', true); // 'area_resource'
$area   = area_common::get_instance($model, 'dd14', 'list');

// the area knows its own tipo as a "section_tipo" but has no record id
$area->get_section_tipo(); // 'dd14'
$area->get_section_id();   // null

// build the dashboard payload over its descendant sections
$dashboard = $area->get_dashboard_data();        // default metric: ['total']
$dashboard = $area->get_dashboard_data(['total']); // explicit
```

!!! warning "No instance cache"
    Areas do not maintain a per-process instance cache (the way `section` does).
    `get_instance()` always returns a new object. The state-bleed surface for
    areas is therefore the **inherited** `common` static caches (structure
    context, properties, permissions), cleared by `common::clear()` — not an
    area-specific cache.

## Public API

Grouped by concern. *static?* marks class-level (static) methods.

### `area` — menu / security assembly & config

| method | static? | purpose |
| --- | --- | --- |
| `get_areas()` | ✓ | Enumerate all major root areas, resolve each via `ontology_utils::get_ar_tipo_by_model`, recursively collect their child areas/sections, filter against `config_areas.php` (`areas_deny`), and return an array of `{tipo, model, parent, properties, label}` objects. Drives the menu and the security full view. |
| `get_ar_children_areas_recursive($tipo)` | ✓ *(protected)* | Walk one area's ontology children and collect descendant area/section tipos, honouring `$ar_children_include_model_name` / `$ar_children_exclude_modelo_name`. |
| `get_config_areas()` | ✓ | Read `config_areas.php` and return `{areas_deny, areas_allow}` (empty arrays + error log if the file is missing). |
| `get_identifier()` | | Return a flat string identifier for the area — currently its tipo (e.g. `'dd42'`). Throws if the tipo is empty. |

### `area_common` — construction & identity

| method | static? | purpose |
| --- | --- | --- |
| `get_instance($model, $tipo, $mode='list')` | ✓ | The factory: `new $model($tipo, $mode)`. No cache. |
| `get_section_tipo()` | | Return the area's own tipo (compat shim for section-shaped APIs). |
| `get_section_id()` | | Always `null` — overrides `common::get_section_id()`; an area has no record id. |

### `area_common` — JSON output

| method | static? | purpose |
| --- | --- | --- |
| `get_json($request_options=null)` | | Override `common::get_json`: if the concrete subclass ships its own `<class>_json.php` controller, defer to the parent implementation; otherwise build standard options and include the shared `area_common/area_common_json.php` in object scope, returning `{context, data}` (with `build_element_json_output([],[])` on failure). |

### `area_common` — dashboard / metrics

| method | static? | purpose |
| --- | --- | --- |
| `get_dashboard_child_sections()` | | Recursively walk ontology children under this area; return descendant **section** tipos (accept `section`; descend `area`/`section`; exclude `login`/`tools`/`section_list`/`filter`/`section_tool` and virtual/untabled nodes). Cycle-protected and order-deduped. |
| `count_section_records($section_tipo)` | | Permission- and project-filter-aware record count for a section, via a `search_query_object` + `search::count()`. Returns `null` when there is no read permission or no `matrix_table`. |
| `get_dashboard_data($ar_metric_names=null)` | | Assemble the dashboard object: per-section items (label, model, color, each requested `metric_*`, plus `recent_7d`) and the area-level `activity_30d`. Default metric list `['total']`. |
| `metric_total($section_tipo)` | *(protected)* | Per-section metric: total record count (delegates to `count_section_records`). |
| `metric_activity_30d($range_days=30)` | *(protected)* | Area-level metric: activity grouped by day / section / user, queried directly from `matrix_activity` with JSONB operators. |
| `get_activity_metric($area_tipo, $range_days=30)` | ✓ | Public static entry point for the API action `get_activity_metric`: instance the area for `$area_tipo` and delegate to `metric_activity_30d`. |
| `get_dashboard_color($tipo)` | ✓ | Deterministic `#RRGGBB` color from a stable HSL hue derived from the tipo's CRC32 hash. |

### Inherited from `common` (not redefined here)

`load_structure_data()`, `get_tipo()` / `get_mode()` / `get_lang()`,
`get_model()`, `get_label()`, `get_properties()`, `get_permissions()`
(static), `get_structure_context()`, `get_matrix_table_from_tipo()` (static),
`clear()` (static). See [base classes → Layer 1 (`common`)](../components/base_classes.md#layer-1-common).

## Specialization by concrete areas

Concrete areas extend `area_common` (one extends another) and are mostly thin —
distinguished by their ontology node and, optionally, a `<class>_json.php`
controller. When present that controller is used; otherwise `get_json()` falls
back to `area_common_json.php`.

| class | extends | ships `<class>_json.php`? | notes |
| --- | --- | --- | --- |
| `area` | `area_common` | yes (`area_json.php`) | The concrete top-level/menu class; adds `get_areas()` and config. |
| `area_root` | `area_common` | no | Model-named node; generic dashboard fallback. |
| `area_resource` | `area_common` | no | Resources grouping. |
| `area_activity` | `area_common` | no | Activity grouping. |
| `area_admin` | `area_common` | no | Administration grouping. |
| `area_development` | `area_common` | no | Development grouping. |
| `area_tool` | `area_common` | no | Tools grouping. |
| `area_publication` | `area_common` | no | Publication grouping. |
| `area_graph` | `area_common` | yes (`area_graph_json.php`) | Network/graph; declares a typologies section tipo. |
| `area_maintenance` | `area_common` | yes (`area_maintenance_json.php`) | System-admin widgets (backup, review, ontology update); ships a CLI-callable method allowlist for background runs (SEC-024). |
| `area_thesaurus` | `area_common` | yes (`area_thesaurus_json.php`) | Hierarchy/TS tree logic: `get_hierarchy_sections()`, `get_hierarchy_typologies()`, `search_thesaurus()`, path resolution. |
| `area_ontology` | `area_thesaurus` | yes (`area_ontology_json.php`) | Manages the whole ontology hierarchy; overrides `get_hierarchy_section_tipo()` / `get_main_table()`. |

!!! note "Heavier areas vs thin ones"
    `area_admin`, `area_root`, `area_resource`, `area_activity`,
    `area_development`, `area_tool` and `area_publication` are empty bodies — they
    exist purely as model-named subclasses so the ontology node resolves to a
    real class and inherits the dashboard scaffolding. `area_thesaurus` /
    `area_ontology` are heavy: they add tree-building over the
    [thesaurus / TS tree](../thesaurus/index.md) stack while still inheriting the
    structure-walk, metrics and permission scaffolding.

## How it fits with the rest of Dedalo

- **Menu.** `menu::class` builds the back-office menu from `area::get_areas()`
  (honouring `config_areas.php` → `areas_deny`). Areas are the menu's top-level
  nodes; their children (sections and sub-areas) come from the ontology graph.
  See `core/menu/class.menu.php`.
- **Security.** `component_security_access` calls `area::get_areas()` to
  enumerate the full set of reachable ontology elements for the per-profile
  permission grid. See [component_security_access](../components/component_security_access.md).
- **Sections.** Sections are the record-bearing leaves an area groups. An area
  holds no records — only structure, permission context, and the aggregated
  dashboard. See [Sections](../sections/index.md).
- **Ontology.** An area is a node with `model = area`; everything about it
  (tipo, parent, label, properties, children) comes from the
  [Ontology](../ontology/index.md), resolved through `ontology_node` /
  `ontology_utils`.
- **Search.** The dashboard counts go through the [SQO](../sqo.md) /
  `search::count()` path so they respect permissions and project filters.
- **Activity log.** `metric_activity_30d` reads `matrix_activity` directly; the
  component tipos it extracts (`dd546` "where", `dd543` "who") come from
  `logger_backend_activity`.
- **API.** The dashboard ships inside the area's `{context, data}` JSON; the
  on-demand activity ranges are served by the API action `get_activity_metric`
  (`dd_core_api::get_activity_metric` → `area_common::get_activity_metric`).
  `area_common::get_instance('area_maintenance', …)` backs the maintenance API.

## Examples

### Build the menu / security area list

```php
// every major area + its recursive children, as flat JSON objects,
// filtered by config_areas.php → areas_deny
$areas = area::get_areas();
foreach ($areas as $area) {
    // $area->tipo, $area->model, $area->parent, $area->properties, $area->label
}
```

### Render an area's dashboard JSON

```php
// resolve the concrete model from the tipo, then instance and serialize
$model = ontology_node::get_model_by_tipo('dd14', true); // 'area_resource'
$area  = area_common::get_instance($model, 'dd14', 'list');

$json  = $area->get_json();   // { context:[…], data:[ { …, dashboard:{…} } ] }
```

### On-demand activity metric (API action)

```php
// what dd_core_api::get_activity_metric delegates to
$payload = area_common::get_activity_metric('dd14', 90); // last 90 days
// $payload->days, $payload->users, $payload->available_ranges, …
```

### A custom per-section metric without new code

Add to the area's ontology `properties`:

```json
{ "dashboard": { "metrics": ["total"] } }
```

Each name `N` in `metrics` invokes the matching `metric_<N>(string $section_tipo)`
method on the area class, so adding a metric is a node edit plus one method.

## Related

- [Architecture overview](../architecture_overview.md) — where areas sit in the
  areas → sections → components → data hierarchy.
- [Sections](../sections/index.md) — the record-bearing leaves an area groups.
- [Section class reference](../sections/section.md) — the sibling
  `extends common` orchestrator for one section type.
- [Components](../components/index.md) — the fields inside a section.
- [Ontology](../ontology/index.md) — the active schema that defines area nodes.
- [Thesaurus / TS tree](../thesaurus/index.md) — the hierarchy stack used by
  `area_thesaurus` / `area_ontology`.
- [SQO](../sqo.md) — the query object behind the dashboard counts.
