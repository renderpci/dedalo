# area_ontology

> The back-office area that edits **Dédalo's own ontology tree** — the same thesaurus-editing machinery as `area_thesaurus`, retargeted at the ontology hierarchy through two overridden resolvers and a handful of runtime model checks.

> See also: [area_thesaurus](area_thesaurus.md) · [Ontology](../ontology/index.md) · [TS tree / ts_object](../ontology/ts_object.md) · [Architecture overview](../architecture_overview.md)

This page is the **class-level reference** for `area_ontology`. It assumes you
have read [area_thesaurus](area_thesaurus.md) — `area_ontology` is a thin
subclass of it and inherits virtually all of its behaviour. For the conceptual
model of *what an area is* (a top-level menu grouping, an ontology node with no
records of its own), read the [Architecture overview](../architecture_overview.md#the-areas-sections-components-data-hierarchy)
first; this document does not repeat that material.

## Role

`area_ontology` (in `core/area_ontology/class.area_ontology.php`,
`class area_ontology extends area_thesaurus`) is the PHP runtime object for the
**Ontology editing area** of the back office. Functionally it is the *same*
hierarchical tree editor as the Thesaurus area, but pointed at a different
hierarchy: instead of editing curatorial thesauri (the `hierarchy*` family
stored in `matrix_hierarchy_main`), it edits **Dédalo's own ontology** — the
nodes that define sections, components, areas and tools — stored in the
`ontology*` family in `matrix_ontology_main`.

!!! note "Inheritance"
    `area_ontology extends area_thesaurus extends area_common extends common`.
    It overrides **only two methods** (`get_hierarchy_section_tipo()` and
    `get_main_table()`). Everything else — the structure walk, the metrics,
    permissions, JSON output, the tree-search/path resolution, the hierarchy /
    typology resolvers — is inherited unchanged from `area_thesaurus` and
    `area_common`. The class body is ~44 lines.

It sits in the area layer of the system, alongside its siblings:

| class | role |
| --- | --- |
| **`area`** | The concrete top-level menu/security assembler that enumerates every root area (including `area_ontology`) and builds the menu tree. |
| **`area_thesaurus`** | The hierarchical-tree editor base: hierarchy/typology resolution, `search_thesaurus()` path-building, the `ts_object` tree stack. |
| **`area_ontology`** *(this class)* | `area_thesaurus` retargeted at the ontology hierarchy via two overrides + runtime model checks. |
| **`area_common`** | The shared area layer (construction, `get_json()` fallback, dashboard child-section walk, permission-aware metrics). |

## The relationship to area_thesaurus

The single most important fact about this class: **it is the same machinery as
`area_thesaurus`, differentiated by runtime flags, not by parallel code.** The
two areas share their server controller, their client class, their tree widget
and almost their entire method surface. The behaviour diverges only where the
code branches on *which* class/model is running.

### Server-side differentiation

The two overrides answer "which hierarchy am I editing?":

```php
// area_ontology overrides
public function get_hierarchy_section_tipo() : string {
    return DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35'  (area_thesaurus → 'hierarchy1')
}
public function get_main_table() : string {
    return ontology::$main_table; // 'matrix_ontology_main' (area_thesaurus → 'matrix_hierarchy_main')
}
```

Beyond those two overrides, the **inherited** `area_thesaurus` code branches on
the running class/model name:

- **`get_hierarchy_sections()`** picks its data source with
  `get_called_class() === 'area_thesaurus' ? 'hierarchy' : 'ontology'`. For
  `area_ontology` (and any non-`area_thesaurus` subclass) it calls
  `ontology::get_active_elements()` / `ontology::get_root_terms()` instead of
  the `hierarchy` equivalents, uses the fixed `ontology::$children_tipo`
  (`'ontology14'`) as the children component tipo, hard-codes the typology
  section id to `'14'`, and **skips the "no root terms" / `active_in_thesaurus`
  skip rules** that apply to ordinary thesauri (ontology hierarchies are always
  shown).
- The **shared JSON controller** (`area_thesaurus_json.php`, see below) grants
  `area_ontology` a special privilege: when `$this->get_model() === 'area_ontology'`
  **and** `logged_user_is_global_admin()`, every hierarchy section is included
  unconditionally — so a global admin sees the full ontology search-type list
  (`dd`, `rsc`, `lg`, …) without the per-target-section read-permission filter
  applied to thesauri.

### The shared JSON controller

`area_ontology_json.php` does not implement anything; it forwards to the
thesaurus controller:

```php
// core/area_ontology/area_ontology_json.php
return include dirname(__FILE__, 2) .'/area_thesaurus/area_thesaurus_json.php';
```

`area_common::get_json()` looks for a `<class>_json.php` next to the class
(found: `area_ontology_json.php`), includes it in the object's scope, and that
file in turn includes `area_thesaurus_json.php`. So the *same* controller builds
the context/data envelope for both areas; it reads `$this->get_model()` and
`$this->get_properties()->thesaurus_mode` at runtime to specialise the output.

### Client-side differentiation

There is **no client class** for `area_ontology`. The JS module is a literal
alias:

```javascript
// core/area_ontology/js/area_ontology.js
import {area_thesaurus} from '../../area_thesaurus/js/area_thesaurus.js'
export const area_ontology = area_thesaurus
```

The client `area_thesaurus` then branches on `self.model === 'area_ontology'` to
turn on ontology-only behaviour, notably:

- **`show_models` defaults to `true`** for `area_ontology` (Thesaurus defaults to
  `false`) — ontology nodes display their model in the tree line.
- **`search_tipos`** (an array of tipos passed in the URL, typically by an
  "open node in tree" button) triggers an auto-search: the rqo filter is built
  from the tipos, the `section_tipo` is set to `<tld>0` per tipo, and the
  search highlights the matching ontology nodes in the tree.

The only dedicated client asset is `css/area_ontology.less`, which sets the
ontology-green accent (`@color_green_ontology`) on the area's tool button
(`tool_ontology_parser`) and on the typology-name blocks.

## Responsibilities

`area_ontology` itself owns very little; it *retargets* what `area_thesaurus`
owns. Concretely:

- **Hierarchy targeting** — declare that the edited hierarchy is the ontology
  section (`ontology35`) stored in `matrix_ontology_main`, via the two overrides.
- **(inherited) Tree assembly** — resolve the active ontology hierarchies and
  their root terms into the tree's typology blocks (`get_hierarchy_sections()`).
- **(inherited) Tree search + path resolution** — run an SQO and rebuild the
  full ancestor path of every hit as `ts_object` nodes (`search_thesaurus()`).
- **(inherited) Name / typology / order resolution** — resolve and cache
  hierarchy names, typology names and typology order values.
- **(inherited) JSON output** — produce the `{context, data}` dashboard/tree
  envelope through the shared `area_thesaurus_json.php` controller.
- **(inherited from `area_common`/`area`) Menu + permission scaffolding** — be
  enumerated by `area::get_areas()` as a top-level menu node and carry the
  permission context, while holding no records of its own.

## Key concepts / Data model

`area_ontology` is a *structural* node, not a record-bearing section — it holds
no `section_id` and no matrix row of its own (`get_section_id()` returns `null`,
inherited from `area_common`). The "data" it serves is the **ontology tree**:

| concept | value for `area_ontology` | value for `area_thesaurus` |
| --- | --- | --- |
| hierarchy section tipo | `ontology35` (`DEDALO_ONTOLOGY_SECTION_TIPO`) | `hierarchy1` (`DEDALO_HIERARCHY_SECTION_TIPO`) |
| main table | `matrix_ontology_main` | `matrix_hierarchy_main` |
| active-elements source | `ontology::get_active_elements()` | `hierarchy::get_active_elements()` |
| children component tipo | `ontology::$children_tipo` = `ontology14` | resolved per target section (`component_relation_children`) |
| typology section id | hard-coded `'14'` | `element->typology_id` |
| root-terms / `active_in_thesaurus` skip | **not applied** (always shown) | applied (skips hierarchies without roots) |
| global-admin full list | yes (sees all search types) | no |
| client `show_models` default | `true` | `false` |

The actual node objects are built by the [`ts_object`](../ontology/ts_object.md) stack
(node builder, repository, term resolver), exactly as for the thesaurus — the
ontology is just another hierarchy of parent/children relations, walked through
`component_relation_parent` / `component_relation_children`.

## Instantiation & lifecycle

`area_ontology` does not define its own factory or constructor; it inherits the
`area_common` singleton-style factory. The protected constructor sets
tipo/mode/lang and calls `parent::load_structure_data()` to pull the area's
ontology context.

```php
public static function get_instance(
    string $model,            // 'area_ontology'
    string $tipo,             // the area's ontology tipo (resolved via ontology_utils::get_ar_tipo_by_model)
    string $mode  = 'list'    // areas run in 'list' mode
) : area_common
```

```php
// resolve the ontology area's tipo, then instance it
$ar_tipo = ontology_utils::get_ar_tipo_by_model('area_ontology');
$area    = area_ontology::get_instance('area_ontology', $ar_tipo[0], 'list');

// which hierarchy / table is this area bound to?
$area->get_hierarchy_section_tipo(); // 'ontology35'
$area->get_main_table();             // 'matrix_ontology_main'

// build the tree envelope ({context, data}) the client renders
$json = $area->get_json(); // → area_ontology_json.php → area_thesaurus_json.php
```

!!! note "No record id"
    Areas anchor menu trees and permission scoping; they have no record of their
    own. `get_section_id()` returns `null` and `get_section_tipo()` returns the
    area's own tipo — these exist only to keep areas compatible with
    section-shaped APIs (e.g. building `request_config`).

## Public API / Key methods

Grouped by concern. *static?* marks class-level methods. Methods marked
*(inherited)* live on `area_thesaurus` (or higher) and are listed here because
they define the area's behaviour at runtime — `area_ontology` does not
re-declare them.

### Defined on `area_ontology` (the two overrides)

| method | static? | purpose |
| --- | --- | --- |
| `get_hierarchy_section_tipo()` | | Return `DEDALO_ONTOLOGY_SECTION_TIPO` (`'ontology35'`) — the section whose records are the ontology hierarchies. Overrides the thesaurus' `'hierarchy1'`. |
| `get_main_table()` | | Return `ontology::$main_table` (`'matrix_ontology_main'`). Overrides the thesaurus' `'matrix_hierarchy_main'`. |

### Inherited from `area_thesaurus` (tree building + search)

| method | static? | purpose |
| --- | --- | --- |
| `get_hierarchy_sections($hierarchy_types_filter=null, $hierarchy_sections_filter=null, $terms_are_model=false)` | | Resolve the active hierarchies into tree items; for `area_ontology` it reads from `ontology::get_active_elements()` / `ontology::get_root_terms()` and uses `ontology14` as the children tipo. |
| `get_hierarchy_typologies()` | | All `section_id`s of the typologies section (unfiltered). |
| `get_typology_data($section_id)` | | Resolve the typology locator (`component_select`) for a hierarchy record. |
| `get_typology_name($typology_section_id)` | | Resolve (and cache) the typology's display name. |
| `get_typology_order($typology_section_id)` | | Resolve (and cache) the typology's order value. |
| `get_hierarchy_name($hierarchy_section_id)` | | Resolve (and cache) the hierarchy term's name. |
| `search_thesaurus($search_query_object)` | | Run the SQO and rebuild each hit's full ancestor path as `ts_object` nodes (with ancestor memoization and batched `is_indexable` prefetch); returns `{result, total, found}`. |
| `get_hierarchy_terms_sqo($hierarchy_terms)` | | Build an SQO whose custom `OP_OR` filter targets specific hierarchy nodes (used for scoped tree search). |

### Inherited from `area_common` (lifecycle, JSON, metrics)

| method | static? | purpose |
| --- | --- | --- |
| `get_instance($model, $tipo, $mode='list')` | ✓ | The singleton-style factory (sets tipo/mode/lang, loads structure data). |
| `get_json($request_options=null)` | | Build the `{context, data}` envelope; finds `area_ontology_json.php`, which forwards to `area_thesaurus_json.php`. |
| `get_section_tipo()` | | Return the area's own tipo (section-shaped-API compatibility). |
| `get_section_id()` | | Return `null` — an area has no record id. |
| `get_dashboard_child_sections()` | | Recursively walk ontology children, returning descendant section tipos. |
| `count_section_records($section_tipo)` | | Permission-aware record count (`search::count()`); `null` when no read permission / no matrix table. |
| `get_dashboard_data()` | | Assemble the dashboard object (label, color, per-section metrics, activity badges). |

!!! warning "Verify before extending"
    `area_ontology` deliberately carries almost no logic of its own. Before
    adding behaviour here, check whether it belongs on `area_thesaurus` (shared
    with the Thesaurus area) or whether a runtime `get_model()` / `get_called_class()`
    branch in the existing shared code is the right place — the two areas are
    intentionally kept as one machine.

## How it fits with the rest of Dedalo

- **[area_thesaurus](area_thesaurus.md)** — the parent class; `area_ontology` is
  the same editor retargeted. Read it for the full method behaviour.
- **[Ontology](../ontology/index.md)** — the data this area edits: the active
  schema (sections, components, areas, tools) stored in `matrix_ontology_main`.
  `area_ontology` is the back-office UI for that tree; the `ontology` class is
  the model that reads/writes it.
- **[TS tree / ts_object](../ontology/ts_object.md)** — the node builder, repository and
  term resolver that turn parent/children relations into the renderable tree
  nodes both areas serve.
- **[Sections](../sections/index.md)** / **[Components](../components/index.md)**
  — the record-bearing leaves that the ontology *defines*; editing an ontology
  node in this area changes how those sections/components behave at runtime, with
  no code change.
- **`area` / menu** — `area::get_areas()` enumerates `area_ontology` as one of
  the root menu areas (resolved via `ontology_utils::get_ar_tipo_by_model('area_ontology')`,
  with a graceful warning when the ontology is out of date).

## Examples

### Tell the two areas apart at runtime

```php
$thesaurus = area_thesaurus::get_instance('area_thesaurus', $t_tipo, 'list');
$ontology  = area_ontology::get_instance('area_ontology',  $o_tipo, 'list');

$thesaurus->get_hierarchy_section_tipo(); // 'hierarchy1'
$thesaurus->get_main_table();             // 'matrix_hierarchy_main'

$ontology->get_hierarchy_section_tipo();  // 'ontology35'
$ontology->get_main_table();              // 'matrix_ontology_main'

// the inherited code branches on the running model/class:
$ontology->get_model();                   // 'area_ontology'  → ontology data source, full admin list
get_class($ontology);                     // 'area_ontology'  → get_called_class() != 'area_thesaurus'
```

### Auto-search ontology nodes from the client

```javascript
import {area_ontology} from 'core/area_ontology/js/area_ontology.js' // === area_thesaurus

const area = await get_instance({ model: 'area_ontology', tipo: area_tipo, mode: 'list' })
area.search_tipos = ['rsc197', 'oh1'] // set by an "open in tree" button (URL param)
await area.build({ autoload: true })  // builds an rqo filter, highlights the nodes in the tree
```

## Related

- [area_thesaurus](area_thesaurus.md) — the parent editor class (full behaviour).
- [Ontology](../ontology/index.md) — the active schema this area edits.
- [TS tree / ts_object](../ontology/ts_object.md) — the hierarchical-tree node stack.
- [Sections](../sections/index.md) · [Components](../components/index.md) — the
  record-bearing nodes the ontology defines.
- [Architecture overview](../architecture_overview.md) — areas → sections →
  components → data, and the ontology-as-active-schema model.
