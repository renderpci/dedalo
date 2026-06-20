# area_common

> The server base class shared by every *area* — the menu-grouping nodes that sit one level above sections. It is to areas what `component_common` is to components: the common machinery (identity, structure context, JSON output, dashboard metrics) that every concrete `area_*` class inherits.

> See also: [Architecture overview](../architecture_overview.md) · [Sections](../sections/index.md) · [section](../sections/section.md) · [Components](../components/index.md)

This page is the **class-level reference** for `area_common`. For the wider
conceptual model — *what an area is* and how areas, sections and components form
the menu tree — read the [Architecture overview](../architecture_overview.md)
(`areas → sections → components → data`) first; this document does not repeat
that material at length.

## Role

`area_common` (in `core/area_common/class.area_common.php`,
`class area_common extends common`) is the shared PHP layer for the back-office's
top-level groupings: Resources, Activity, Admin, Thesaurus, Ontology,
Maintenance, Graph, Development, Tools and Root. An *area* is an ontology node
whose `model` is `area` (or a model-name variant such as `area_resource`,
`area_admin`, `area_thesaurus`). Unlike a [section](../sections/section.md), an
area has **no matrix table and no records of its own** — it is a structural /
configuration node that *contains* sections and sub-areas as ontology children.
Areas anchor the menu tree, scope permissions, and host the dashboard that
aggregates metrics over their descendant sections.

It sits in a three-layer inheritance chain:

| class | role |
| --- | --- |
| **`common`** | The universal element machinery: identity (`tipo`/`mode`/`lang`), `load_structure_data()`, `get_structure_context()`, permissions, the `{context,data}` JSON helpers, ontology/matrix-table resolution and the static caches. See [section](../sections/section.md) for how the same base serves sections. |
| **`area_common`** *(this class)* | The shared area layer: construction, area-shaped identity shims (`get_section_tipo()` / `get_section_id()`), the generic `get_json()` fallback, the recursive structure walk, and the permission-aware dashboard metrics. |
| **`area`** (and `area_resource`, `area_admin`, `area_thesaurus`, …) | The concrete top-level classes. `area` adds the menu/security assembly (`get_areas()`); other concrete areas are mostly thin, distinguished by their ontology node and an optional `<class>_json.php` controller. |

!!! note "Inheritance"
    `area_common extends common`, so it inherits the shared object machinery:
    the `$tipo`, `$mode`, `$lang`, `$label`, `$permissions` and `$properties`
    fields, and methods such as `load_structure_data()`, `get_tipo()` /
    `get_mode()`, `get_properties()`, `get_structure_context()`,
    `get_permissions()` and `get_matrix_table_from_tipo()`. See the
    [Architecture overview](../architecture_overview.md) for the `common`
    contract these areas rely on.

## Responsibilities

- **Construction & identity** — instance a concrete `area_*` model for a tipo,
  set `tipo` / `mode` / `lang`, and load the ontology structure once
  (`parent::load_structure_data()`).
- **Section-shaped identity shims** — expose `get_section_tipo()` (returns the
  area's own tipo) and `get_section_id()` (returns `null`) so areas can be passed
  to section-shaped APIs (e.g. building `request_config`) even though an area has
  no record id.
- **JSON output** — override `common::get_json()` to fall back to the shared
  `area_common_json.php` controller when the concrete subclass ships no
  `<class>_json.php`, so every area gets a generic dashboard payload without
  per-class boilerplate.
- **Structure listing** — walk the ontology children recursively and collect the
  tipos of all descendant sections (`get_dashboard_child_sections()`), with cycle
  protection and model filtering.
- **Permission-aware metrics** — count a section's records through the search
  layer so the result respects user permissions and project filters
  (`count_section_records()`), and assemble the dashboard object with per-section
  and area-level metrics (`get_dashboard_data()`, `metric_total`,
  `metric_activity_30d`).
- **On-demand metric entry point** — the static `get_activity_metric()` the API
  action `get_activity_metric` calls to fetch larger activity ranges lazily.

!!! warning "What area_common does NOT do"
    It does not build the menu tree (that is the concrete `area::get_areas()`)
    and it does not read or write any record data — areas have no matrix table.
    Its only data reads are permission-aware **counts** and a direct read of the
    `matrix_activity` log for the activity metric.

## Key concepts

### Areas have no records, only structure

An area is a node in the ontology tree, not a row in a matrix table. It exists to
group sections (and sub-areas) for the menu and the dashboard. This is why
`get_section_id()` is overridden to return `null` and `get_section_tipo()` simply
returns the area's own `tipo`: those methods exist purely to keep an area
compatible with code that expects a section-shaped object (e.g. when building a
`request_config`).

### The dashboard payload

`get_dashboard_data()` produces the object the client area builder renders. Its
shape (verified against the source doc-comment):

```json
{
  "area_tipo"    : "dd14",
  "area_label"   : "Resources",
  "generated_at" : 1731768000,
  "metrics"      : ["total"],
  "sections"     : [
    {
      "section_tipo" : "rsc167",
      "label"        : "Audiovisual",
      "model"        : "section",
      "color"        : "#3b82f6",
      "total"        : 4321,
      "recent_7d"    : 12
    }
  ],
  "activity_30d" : { "date_from": "…", "date_to": "…", "days": [ … ], "users": [ … ], "available_ranges": [ … ] }
}
```

- `sections` is one item per descendant section tipo, each carrying the requested
  per-section metrics (e.g. `total`) and a `recent_7d` badge derived from the
  `activity_30d` payload (no extra SQL).
- `activity_30d` is an **area-level** metric (not per section): activity grouped
  by day and by section over the last 30 days, read directly from
  `matrix_activity` with JSONB operators. Larger ranges are fetched on demand via
  the `get_activity_metric` API action — the dashboard only pre-loads one month.
- `color` is a deterministic per-tipo HSL→hex color from `get_dashboard_color()`,
  so a given section always renders the same color.

### Metric convention

Per-section metrics follow the convention `metric_<name>(string $section_tipo)`.
`get_dashboard_data()` is driven by a list of metric names (default `['total']`)
and, for each name `N`, calls the matching `metric_N` method if it exists. The
metric list can be overridden **per area without code changes** via the area's
ontology properties:

```json
{ "dashboard": { "metrics": ["total"], "disabled": false } }
```

`area_common_json.php` reads `properties.dashboard.metrics` (and a
`properties.dashboard.disabled` switch) and passes the list into
`get_dashboard_data()`. Adding a new metric is therefore: write a
`metric_<name>()` method and add its name to the ontology properties. The
default `metric_total` simply delegates to `count_section_records()`.

## Instantiation & lifecycle

`area_common::get_instance()` is a thin singleton-style factory that instances the
**concrete model** passed to it (it does `new $model(...)`, so callers pass the
resolved area model name, e.g. `'area_resource'`):

```php
public static function get_instance(
    string $model,          // concrete area model, e.g. 'area_resource' / 'area_admin'
    string $tipo,           // the area ontology tipo, e.g. 'dd14'
    string $mode = 'list'   // runtime mode flag (areas are typically 'list')
) : object
```

The protected constructor sets the identity and loads the structure:

```php
protected function __construct( string $tipo, string $mode ) {
    $this->set_tipo($tipo);
    $this->set_mode($mode);
    $this->set_lang(DEDALO_DATA_LANG);
    parent::load_structure_data(); // pull ontology_node / model / label once
}
```

!!! note "Resolve the model from the ontology first"
    `get_instance()` does **not** resolve the model from the tipo itself — the
    caller must pass the concrete model name. The usual pattern (as in the
    `get_activity_metric` entry point) is to resolve it via
    `ontology_node::get_model_by_tipo($tipo, true)` and pass that as `$model`:

    ```php
    $model   = ontology_node::get_model_by_tipo($area_tipo, true); // e.g. 'area_resource'
    $element = area_common::get_instance($model, $area_tipo, 'list');
    ```

!!! warning "No per-process instance cache"
    Unlike `section::get_instance()` (which caches in
    `section::$ar_section_instances`) and `component_common::get_instance()`,
    `area_common::get_instance()` builds a **fresh** object on every call. It is
    "singleton-style" by intent, not by a cache. Areas are cheap (no record I/O),
    and the heavy resolution they touch — structure context, permissions,
    ontology lookups — is cached in the `common` static caches, which are purged
    by `common::clear()` per worker request.

## Public API

Grouped by concern. *static?* marks class-level (static) methods. All names below
are verified against `core/area_common/class.area_common.php`.

### Construction & identity

| method | static? | purpose |
| --- | --- | --- |
| `get_instance($model, $tipo, $mode='list')` | ✓ | Build a fresh concrete `area_*` instance. Returns an `object` (the new model instance). |
| `get_section_tipo()` | | Return the area's own `tipo` — a section-shaped shim (areas have no separate section tipo). |
| `get_section_id()` | | Override `common::get_section_id()` to return `null` — areas have no record id. |

### JSON output

| method | static? | purpose |
| --- | --- | --- |
| `get_json($request_options=null)` | | Override `common::get_json()`. If the concrete subclass has its own `<class>_json.php` it defers to `parent::get_json()`; otherwise it builds the standard options and includes the shared `core/area_common/area_common_json.php` in the object scope (with a fail-safe empty `{context,data}` on error). |

### Structure listing

| method | static? | purpose |
| --- | --- | --- |
| `get_dashboard_child_sections()` | | Walk the area's ontology children recursively and return the tipos of all descendant **sections**. Descends through `area`/`section`, accepts `section`, excludes `login`/`tools`/`section_list`/`filter`/`section_tool`; cycle-protected and order-preserving deduped. |

### Dashboard metrics

| method | static? | purpose |
| --- | --- | --- |
| `count_section_records($section_tipo)` | | Build an SQO (`full_count`, `limit 0`) and call `search::count()` so the total respects user permissions and project filters. Returns `null` when the user lacks read permission or the section has no matrix table. |
| `get_dashboard_data($ar_metric_names=null)` | | Assemble the full dashboard object: area label/tipo, per-section items with their `metric_*` results and `color`, plus the area-level `activity_30d` and the per-section `recent_7d` badge. Metric list defaults to `['total']`. |
| `metric_total($section_tipo)` | | *(protected)* Per-section total-records metric; delegates to `count_section_records()`. |
| `metric_activity_30d($range_days=30)` | | *(protected)* Area-level activity metric. Reads `matrix_activity` directly with JSONB operators, counts events whose WHERE value matches one of the area's child sections, grouped by day / section / user; fills empty days for continuous charts. |
| `get_activity_metric($area_tipo, $range_days=30)` | ✓ | Public static entry point for the `get_activity_metric` API action: resolves the area model, instances it, and delegates to `metric_activity_30d()`. |
| `get_dashboard_color($tipo)` | ✓ | Deterministic `#RRGGBB` color from a stable HSL hue derived from `crc32($tipo)`, so a section's color is stable across reloads/sessions. |

!!! note "Metric naming convention"
    Add a per-section metric by defining `metric_<name>(string $section_tipo)` and
    listing `<name>` in the area's ontology `properties.dashboard.metrics`.
    `get_dashboard_data()` invokes only the methods that exist.

## How it fits with the rest of Dédalo

- **[common](../sections/section.md)** *(base)* — `area_common` inherits identity,
  `load_structure_data()`, `get_structure_context()`, permissions and the JSON
  helpers. The same base serves `section` and `component_common`; see the
  [Architecture overview](../architecture_overview.md) for the shared contract.
- **`area` (concrete)** — `class area extends area_common` adds the menu/security
  assembly: `area::get_areas()` iterates the major root areas and recursively
  collects child areas/sections (`get_ar_children_areas_recursive()`), filtered by
  `config_areas.php` (`areas_deny`/`areas_allow`). The result feeds both the menu
  and `component_security_access`.
- **[Sections](../sections/index.md)** — areas group sections; the record-bearing
  leaves an area aggregates. `get_dashboard_child_sections()` walks down to them,
  and the metrics count their records.
- **[search / SQO](../sqo.md)** — `count_section_records()` builds a
  `search_query_object` and calls `search::count()`, inheriting the search
  layer's permission and project-filter behaviour (no hand-written SQL for
  counts).
- **API (`dd_core_api`)** — `core/api/v1/common/class.dd_core_api.php` exposes the
  `get_activity_metric` action, which validates the RQO `options` (clamps
  `range_days` to 1–365) and delegates to `area_common::get_activity_metric()`.
- **Ontology** — `ontology_node` resolves the area model (`get_model_by_tipo`),
  labels (`get_term_by_tipo`) and the child graph (`get_ar_children_of_this`); the
  [Ontology](../ontology/index.md) is the active schema the whole walk reads.
- **`matrix_activity`** — `metric_activity_30d()` reads the activity log directly
  (via `matrix_db_manager::exec_search`) using the `logger_backend_activity`
  component tipos (`dd546` WHERE, `dd543` WHO) for JSONB extraction.

## Examples

### Build a dashboard for an area

```php
// resolve the concrete area model from its tipo, then instance it
$area_tipo = 'dd14'; // e.g. Resources
$model     = ontology_node::get_model_by_tipo($area_tipo, true); // 'area_resource'
$area      = area_common::get_instance($model, $area_tipo, 'list');

// descendant section tipos (recursively, sub-areas included)
$section_tipos = $area->get_dashboard_child_sections(); // ['rsc167', 'rsc171', ...]

// the full dashboard payload (default metric: 'total')
$dashboard = $area->get_dashboard_data();

// or with an explicit metric list (each name N needs a metric_N method)
$dashboard = $area->get_dashboard_data(['total']);
```

### Permission-aware record count for one section

```php
$area  = area_common::get_instance('area_resource', 'dd14', 'list');
$total = $area->count_section_records('rsc167');
// int total, or null when the user has no read permission
// or the section has no matrix table (virtual sections, etc.)
```

### On-demand activity metric (the API path)

```php
// what the `get_activity_metric` API action calls under the hood
$data = area_common::get_activity_metric('oh1', 90); // last 90 days
// returns { date_from, date_to, days:[…], users:[…], available_ranges:[…] } or null
```

### The generic JSON fallback

```php
// area_resource ships no area_resource_json.php, so get_json() includes
// the shared core/area_common/area_common_json.php controller, which emits:
//   context -> get_structure_context(permissions, true)
//   data    -> [{ tipo, section_tipo:tipo, section_id:null, dashboard:{…} }]
$area = area_common::get_instance('area_resource', 'dd14', 'list');
$json = $area->get_json(); // { context:[…], data:[…] }
```

!!! note "Client side"
    The client counterpart lives in `core/area_common/js/area_common.js` and
    `dashboard.js`; it consumes the `{context, data}` envelope (the `dashboard`
    item) and renders the area dashboard and the activity timeline, requesting
    larger ranges through the `get_activity_metric` action.

## Related

- [Architecture overview](../architecture_overview.md) — the `areas → sections →
  components → data` hierarchy and the `{context, data}` datum contract.
- [Sections concept](../sections/index.md) — the record-bearing leaves an area
  groups. · [section](../sections/section.md) — the class-level reference for
  `section` (the sibling that extends the same `common` base).
- [Components](../components/index.md) · [base classes](../components/base_classes.md)
  — `component_common`, the component-side analogue of `area_common`.
- [SQO](../sqo.md) — the search query object `count_section_records()` builds.
- [request_config](../request_config.md) — what `get_structure_context()` stamps
  into the area's context.
- [Ontology](../ontology/index.md) — the active schema the structure walk reads.
