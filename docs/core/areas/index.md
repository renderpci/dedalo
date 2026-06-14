# Areas

> The top-level groupings of the Dédalo back-office menu — Resources, Activity,
> Admin, Thesaurus, Ontology, Maintenance, Graph, Development, Tools and Root.
> An *area* is an ontology node that *contains* sections and sub-areas; it holds
> no records of its own, only structure, permission context and an aggregated
> dashboard over its descendant sections.

> See also: [Architecture overview](../architecture_overview.md) ·
> [Sections](../sections/index.md) · [Menu](../ui/menu.md) ·
> [Ontology](../ontology/index.md)

This page is the **index for the Areas domain**. It explains what an area is,
the inheritance model every area shares, and lists every `area*` class under
`core/` with a one-line purpose and a link to its full reference where one
exists. For the wider picture of how areas, sections and components form the
back-office, read the [Architecture overview](../architecture_overview.md)
first.

---

## What an area is

An *area* is a **top-level grouping** in the back-office menu — the major
divisions of the application: Resources, Activity, Admin, Thesaurus, Ontology,
Maintenance, Graph, Development, Tools and Root. Each area is an **ontology
node** whose `model` is `area` (or a model-name variant such as `area_root`,
`area_admin`, `area_thesaurus`).

Unlike a [section](../sections/section.md), an area is **not backed by a matrix
table and owns no records of its own**. It is a structural / configuration node
that *contains* sections and sub-areas as ontology children. Areas anchor three
things:

- the **menu tree** — areas are the top-level nodes; sections and sub-areas are
  their children, resolved through the ontology parent/children graph rather
  than a fixed map (see [Menu](../ui/menu.md));
- **permission scoping** — an area is a node over which permissions can be
  evaluated, even though it carries no record id;
- the **dashboard** — the aggregated view of metrics over an area's descendant
  sections.

### The inheritance model: area → area_common → common

Every area sits in a three-layer chain:

| layer | role |
| --- | --- |
| **`common`** | The universal element machinery: identity (`tipo`/`mode`/`lang`), `load_structure_data()`, `get_structure_context()`, permissions, ontology/matrix-table resolution, the `{context, data}` JSON helpers and the static caches. The same base serves [`section`](../sections/section.md) and `component_common`. |
| **`area_common`** | The shared area layer specialising `common` for menu-grouping nodes: the `get_instance()` factory, the section-shaped identity shims (`get_section_tipo()` returns the area's own tipo, `get_section_id()` returns `null`), the generic `get_json()` fallback to `area_common_json.php`, the recursive dashboard structure-walk, and the permission-aware dashboard metrics. |
| **`area`** | The concrete **top-level** class. Adds the menu / security assembly — `get_areas()` iterates all major root areas, recursively collects child areas/sections, and filters the result against `config_areas.php` (`areas_deny`/`areas_allow`). The output feeds both the menu and `component_security_access`. |

`class area extends area_common`, and `class area_common extends common`. The
concrete top-level areas (`area_admin`, `area_resource`, `area_thesaurus`, …)
are thin model-named subclasses distinguished by their ontology node and an
optional `<class>_json.php` controller; when a subclass ships no controller,
`area_common::get_json()` falls back to the shared `area_common_json.php` so
every area gets a generic dashboard payload without per-class boilerplate.
Heavier areas (`area_thesaurus`, `area_ontology`) add their own JSON controllers
and tree-building logic (the TS tree / `ts_object` stack) while still inheriting
the structure-walk, metrics and permission scaffolding.

The menu is built from `area::get_areas()`: areas are the menu's top-level
nodes, sections (and sub-areas) are their children. Sections are the
record-bearing leaves an area groups; an area itself holds no records — only
structure, permission context and the aggregated dashboard.

---

## All areas in `core/`

Every `area*` directory under `core/`, with a one-line purpose and a link to its
full reference where one exists.

### Base classes & documented areas

| area | model | purpose | doc |
| --- | --- | --- | --- |
| `area_common` | (base) | The shared PHP base class every concrete area inherits — identity, the `get_json()` fallback, the dashboard structure-walk and the permission-aware metrics. | [area_common.md](area_common.md) |
| `area` | `area` | The concrete top-level class adding the menu/security assembly (`get_areas()`, recursive children collection, `config_areas.php` allow/deny filtering). | [area.md](area.md) |
| `area_admin` | `area_admin` | Administration area — users, profiles, projects, configuration and other system-administration sections. | [area_admin.md](area_admin.md) |
| `area_thesaurus` | `area_thesaurus` | Thesaurus area — controlled vocabularies rendered as a hierarchical TS tree; ships its own JSON controller and tree-building logic. | [area_thesaurus.md](area_thesaurus.md) |
| `area_ontology` | `area_ontology` | Ontology area — the in-app editor over the ontology nodes themselves; ships its own JSON controller and tree view. | [area_ontology.md](area_ontology.md) |
| `area_maintenance` | `area_maintenance` | Maintenance area — operational widgets and tools (caches, indexing, media control, integrity checks) for keeping an installation healthy. | [area_maintenance.md](area_maintenance.md) |
| `area_graph` | `area_graph` | Graph area — the visual graph/network view over records and their relations. | [area_graph.md](area_graph.md) |

### Thin areas (no full doc)

These are **empty model-named subclasses of `area_common`** (their PHP class
body is empty and their JS is an alias of the base `area` widget). They exist to
give a distinct ontology node — and therefore a distinct menu grouping,
permission scope and dashboard — without adding behaviour. They inherit
everything from `area_common`.

| area | model | one-line description |
| --- | --- | --- |
| `area_root` | `area_root` | The root grouping — the top of the area tree from which `get_areas()` begins the recursive walk. |
| `area_resource` | `area_resource` | Resources area — the curatorial data sections (people, media, audiovisual, etc.); the primary working area, in the menu roster but with no full doc yet. |
| `area_activity` | `area_activity` | Activity area — groups the activity-log / `matrix_activity` views that record who changed what and when. |
| `area_tool` | `area_tool` | Tools area — the menu grouping under which the registered tools (import, export, diffusion, …) appear. |
| `area_development` | `area_development` | Development area — developer-facing sections and scaffolding visible only in development contexts. |
| `area_publication` | `area_publication` | Publication area — grouping for publication / diffusion-facing sections. |
| `area_activities` | — | Orphan directory (no class file; not in the `get_areas()` roster); the live activity grouping is `area_activity`. |

!!! note "Menu roster"
    `area::get_areas()` iterates ten major root areas in this order:
    `area_root`, `area_activity`, `area_resource`, `area_tool`,
    `area_thesaurus`, `area_graph`, `area_admin`, `area_maintenance`,
    `area_development`, `area_ontology`. Each is resolved through
    `ontology_utils::get_ar_tipo_by_model` (with graceful warnings/fallbacks
    when an ontology node is missing), then its child areas/sections are
    collected recursively and filtered against `config_areas.php`.

---

## See also

- [area_common](area_common.md) — the shared base class reference (identity,
  JSON fallback, dashboard structure-walk, permission-aware metrics).
- [area](area.md) — the concrete top-level class reference (menu/security
  assembly, `get_areas()`, `config_areas.php` filtering).
- [Architecture overview](../architecture_overview.md) — where areas sit in the
  `areas → sections → components → data` hierarchy.
- [Sections](../sections/index.md) — the record-bearing leaves an area groups.
- [Menu](../ui/menu.md) — the navigation tree built from `area::get_areas()`.
- [Ontology](../ontology/index.md) — the active schema the area walk reads.
