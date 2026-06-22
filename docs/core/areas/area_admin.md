# area_admin

> The **Administration** area: a thin, model-named subclass of `area_common` that groups the back-office's user, profile and security-configuration sections under one top-level menu node and contributes their aggregated dashboard.

> See also: [area](area.md) · [Sections](../sections/index.md) · [Architecture overview](../architecture_overview.md)

## Role

`area_admin` (in `core/area_admin/class.area_admin.php`,
`class area_admin extends area_common`) is the concrete class for the
**Administration** area node of the ontology (the `dd207` "Administración"
node in a stock installation). An *area* is a top-level grouping in the
Dédalo menu — it is **not** backed by a `matrix` table and owns no records of
its own; it is a structural/configuration node whose children are the
record-bearing sections it groups (Users, Profiles, …) and whose job is to
anchor the menu tree, scope permissions and produce the dashboard that
aggregates its descendant sections.

The class body is empty — about nine lines:

```php
<?php declare(strict_types=1);
/**
* AREA_ADMIN
*/
class area_admin extends area_common {

}//end area_admin
```

Everything it does is inherited from `area_common` (construction, identity,
the generic dashboard payload, child-section walking, permission-aware
metrics) and, above that, from `common` (structure loading, tipo/mode/lang
accessors, permissions, the structure-context cache). `area_admin` exists as a
**distinct class only so the ontology node `model = "area_admin"` resolves to
its own type** — which lets the system give the Administration area its own
optional `<class>_json.php` controller, its own CSS namespace and a stable
identity in `area::get_areas()`. This is the canonical "thin area subclass"
pattern (see [Key concepts](#key-concepts)).

It sits among the sibling concrete areas:

| class | area | nature |
| --- | --- | --- |
| **`area_admin`** *(this class)* | Administration (`dd207`) | Thin: empty body, falls back to `area_common_json.php`. |
| `area_resource` / `area_activity` / `area_root` / `area_tool` / `area_development` | Resources / Activity / Root / Tools / Development | Also thin model-named subclasses. |
| `area_maintenance` | Maintenance | Thin server class; richer client widget. |
| `area_thesaurus` / `area_ontology` / `area_graph` | Thesaurus / Ontology / Graph | Heavy: ship their own JSON controllers and tree/graph-building logic. |

## Responsibilities

`area_admin` itself owns **no** unique logic. What the Administration area
*does* (all via inherited behaviour) is:

- **Group the administration sections** — it is the parent ontology node of the
  back-office administration sections: **Users** (`DEDALO_SECTION_USERS_TIPO`,
  `dd128`), **Profiles** (`DEDALO_SECTION_PROFILES_TIPO`, `dd234`) and the
  security/permission configuration those sections carry (e.g.
  `component_security_access` on a profile record). These are ordinary
  `section` records; the area only *contains* them in the ontology tree.
- **Anchor a menu branch** — `area::get_areas()` lists `area_admin` among the
  major root areas, then recursively collects its child areas/sections so the
  client menu renders the "Administration" branch.
- **Scope permissions** — as a `common` descendant it carries the
  permission-resolution machinery; its child sections are permission-gated per
  user/profile by `security`.
- **Contribute a dashboard** — through `area_common::get_dashboard_data()` it
  produces the area dashboard (per-section `metric_total`, area-level
  `activity_30d`, per-section `recent_7d`) over its descendant sections.

!!! note "Why no record storage"
    An area is a configuration node. `area_admin::get_section_id()` returns
    `null` and `get_section_tipo()` returns the area's own tipo — these exist
    only to keep the area shaped like a section for APIs such as
    `request_config`, even though there is no record id. See the
    [area base reference](area.md).

## Key concepts

### The thin-area-subclass pattern

Most concrete areas (`area_admin`, `area_resource`, `area_activity`,
`area_root`, `area_tool`, `area_development`) are intentionally empty
subclasses. The pattern works because:

1. The ontology node's `model` field (resolved via `model_tipo`) names the PHP
   class to instantiate — so `model = "area_admin"` *requires* a class named
   `area_admin` to exist, even if it adds nothing.
2. `area_common::get_json()` checks for a per-class controller at
   `<core>/<class>/<class>_json.php`; if absent it falls back to the shared
   `core/area_common/area_common_json.php`. Because `area_admin` ships **no**
   `area_admin_json.php`, it gets the generic dashboard payload with zero
   boilerplate.
3. Per-class CSS (`core/area_admin/css/area_admin.less`) gives the area a
   styling hook (currently an empty `.area_admin {}` rule, reserved for
   installation overrides).

Compare this with the *heavy* areas (`area_thesaurus`, `area_ontology`,
`area_graph`) that override `get_json()` by shipping their own controller and
add real tree/graph logic. Choosing thin vs heavy is a matter of whether the
area needs behaviour beyond menu-grouping and the dashboard.

### Client side: `area_admin` is an alias of `area`

The client class is not a bespoke widget. `core/area_admin/js/area_admin.js`
simply re-exports the shared menu/area class:

```javascript
import {area} from '../../area/js/area.js'

/**
* AREA_ADMIN. Alias of area
*/
export const area_admin = area
```

So on the client, the Administration area behaves identically to every other
plain area (the same alias appears in `area_resource.js`, `area_root.js`,
`area_tool.js`, `area_development.js`, `area_activity.js`,
`area_publication.js`). The heavy areas instead alias something richer
(`area_ontology = area_thesaurus`) or define their own function
(`area_thesaurus`, `area_graph`, `area_maintenance`, `area_common`).

## Instantiation & lifecycle

`area_admin` does not define its own factory or constructor; it uses the ones
inherited from `area_common`:

```php
public static function get_instance(
    string $model,          // the area model/class name, e.g. 'area_admin'
    string $tipo,           // the area ontology tipo, e.g. 'dd207'
    string $mode = 'list'   // runtime mode flag
) : object
```

```php
// area_common::get_instance simply does:  return new $model($tipo, $mode);
// area_common::__construct (protected) sets tipo/mode, lang = DEDALO_DATA_LANG,
// then calls parent::load_structure_data() to pull the ontology context.
```

!!! warning "No per-process instance cache"
    Unlike `section::get_instance()`, `area_common::get_instance()` is a plain
    `new $model(...)` with **no** instance cache and no `cache` parameter — each
    call builds a fresh object. The model name is passed in by the caller
    (resolved from the ontology via `ontology_node::get_model_by_tipo()` /
    `ontology_utils::get_ar_tipo_by_model()`); `get_instance` does not validate
    that `$model` is an area model.

```php
// Build the Administration area object for its ontology tipo.
// In practice callers resolve the tipo from the model first:
$area_tipo = ontology_utils::get_ar_tipo_by_model('area_admin')[0]; // e.g. 'dd207'

$area = area_common::get_instance('area_admin', $area_tipo, 'list');

// generic dashboard payload (per-section totals + activity), via area_common
$json = $area->get_json();              // falls back to area_common_json.php
$dashboard = $area->get_dashboard_data(); // {area_tipo, area_label, sections[], activity_30d, ...}
```

## Key methods

`area_admin` declares **none of its own**. The table below lists the inherited
methods that define the Administration area's behaviour, grouped by concern and
by where they are declared. (`get_areas()` / `get_config_areas()` /
`get_ar_children_areas_recursive()` live on the *concrete* `area` class, not on
`area_common`; the Administration node is consumed *by* `area::get_areas()`
rather than calling it.)

### Construction & identity (from `area_common`)

| method | static? | purpose |
| --- | --- | --- |
| `get_instance($model, $tipo, $mode='list')` | ✓ | `new $model($tipo,$mode)` — the singleton-style area factory (no cache). |
| `__construct($tipo, $mode)` | | (protected) sets tipo/mode/`lang=DEDALO_DATA_LANG`, calls `parent::load_structure_data()`. |
| `get_section_tipo()` | | Returns the area's own tipo (section-shape compat). |
| `get_section_id()` | | Returns `null` — an area has no record id. |

### JSON output (from `area_common`)

| method | static? | purpose |
| --- | --- | --- |
| `get_json($request_options=null)` | | Overrides `common::get_json`: defers to the parent when a per-class controller exists, otherwise includes the shared `area_common_json.php`. For `area_admin` (no own controller) this is the generic dashboard payload. |

### Structure listing & metrics (from `area_common`)

| method | static? | purpose |
| --- | --- | --- |
| `get_dashboard_child_sections()` | | Recursively walk ontology children, descend through `area`/`section`, accept `section`, exclude `login`/`tools`/`section_list`/`filter`/`section_tool` and virtual/untabled nodes; returns descendant section tipos. Cycle-guarded. |
| `count_section_records($section_tipo)` | | Build an SQO and call `search::count()` (respects permissions + project filters). Returns `null` with no read permission or no matrix table. |
| `get_dashboard_data($ar_metric_names=null)` | | Assemble the dashboard object: area label/color, per-section `metric_*`, area-level `activity_30d`, per-section `recent_7d`. |
| `metric_total($section_tipo)` | | (protected) per-section total via `count_section_records()`. |
| `metric_activity_30d($range_days=30)` | | (protected) area-level activity grouped by day/section, read directly from `matrix_activity` with JSONB operators. |
| `get_activity_metric($area_tipo, $range_days=30)` | ✓ | Static entry point for the on-demand `get_activity_metric` API action; instances the area and delegates to `metric_activity_30d`. |
| `get_dashboard_color($tipo)` | ✓ | Deterministic per-tipo HSL→hex color. |

### Inherited from `common`

Identity accessors (`get_tipo`/`get_mode`/`get_lang`/`get_label`/…),
`load_structure_data()`, `get_properties()`, permissions
(`get_permissions()`), the structure-context cache and `clear()` — see the
[`common` base classes](../components/base_classes.md) and the
[Architecture overview](../architecture_overview.md).

## How it fits with the rest of Dédalo

- **[area](area.md)** — the area-base reference (the `area` / `area_common` /
  `common` chain); the shared layer `area_admin` extends supplies every method
  the Administration area actually runs.
- **`area` (concrete menu class)** — `area::get_areas()` lists `area_admin`
  among the root areas and recursively collects its children to build the menu
  and the `component_security_access` full view; results are filtered through
  the `areas.deny`/`areas.allow` config. The Administration area is
  `dd207` in a stock install (see the `areas.php` catalog domain).
- **[Sections](../sections/index.md)** — the record-bearing leaves the area
  groups: **Users** (`dd128`) and **Profiles** (`dd234`).
- **`security`** — consumes those sections: `security::get_user_profile()` and
  the permission resolution read `DEDALO_SECTION_USERS_TIPO` /
  `DEDALO_SECTION_PROFILES_TIPO` / `DEDALO_USER_PROFILE_TIPO` and the
  `component_security_access` stored on a profile record.
- **[component_security_access](../components/component_security_access.md)** —
  the per-profile permission-level field administered through this area.
- **`menu`** — built from `area::get_areas()`; the Administration area is one of
  its top-level nodes.

## Examples

### Resolve, instantiate and read the dashboard

```php
// 1. resolve the Administration area tipo from its model
$ar_admin   = ontology_utils::get_ar_tipo_by_model('area_admin');
$admin_tipo = $ar_admin[0] ?? null; // 'dd207' in a stock install
if (empty($admin_tipo)) {
    // ontology out of date — area_admin model not present
}

// 2. instance the area (fresh object; no cache)
$area = area_common::get_instance('area_admin', $admin_tipo, 'list');

// 3. its descendant sections (Users, Profiles, …)
$ar_sections = $area->get_dashboard_child_sections(); // ['dd128', 'dd234', ...]

// 4. the generic dashboard payload (per-section totals + activity)
$dashboard = $area->get_dashboard_data();
```

### On-demand activity metric (API action)

```php
// `get_activity_metric` API action: a 90-day window for the Administration area
$metric = area_common::get_activity_metric('dd207', 90);
// → { date_from, date_to, days:[…], users:[…], available_ranges:[…] }
```

!!! note "Accuracy / uncertainty"
    The tipos cited (`dd207` Administration, `dd128` Users, `dd234` Profiles)
    are the **stock** ontology values (`core/base/config/catalog/domains/areas.php`,
    `core/base/dd_tipos.php`); a given installation can differ. Always resolve
    the area via `ontology_utils::get_ar_tipo_by_model('area_admin')` and the
    sections via their `DEDALO_SECTION_*_TIPO` constants rather than hardcoding.

## Related

- [area](area.md) — the area-base reference (`area` / `area_common` / `common`).
- [Base classes](../components/base_classes.md) — the `common` machinery underneath.
- [Sections](../sections/index.md) — Users/Profiles are sections grouped here.
- [component_security_access](../components/component_security_access.md) — the
  per-profile permissions field administered in this area.
- [Architecture overview](../architecture_overview.md) — areas → sections →
  components → data, and where areas sit in the menu/ontology.
