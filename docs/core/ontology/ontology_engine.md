# ontology_engine

> The runtime read/resolve layer over the `dd_ontology` table: the per-node
> wrapper `ontology_node` and the multi-node helper `ontology_utils`.

> See also: [Ontology concept](index.md) · [Architecture overview](../architecture_overview.md) · [Sections](../sections/index.md) · [Components](../components/index.md)

This page is the **subsystem reference** for `core/ontology_engine/`. For the
conceptual model — *what the ontology is*, that it **is** the active schema, the
TLD + sequence `tipo`, and the per-node JSON shape — read
[Ontology](index.md) first; this document does not repeat that material at
length.

## Role

`core/ontology_engine/` is a **two-class, server-side (PHP) subsystem** that
gives the rest of Dédalo read-only, cached access to the active ontology. It is
the layer every `get_instance()` reaches for first: before a `section` or
`component_*` can be built, the runtime must resolve a `tipo`'s model, label,
parent, children and relations — and that resolution is exactly what this
subsystem owns.

It contains two classes (neither `extends` anything — both are plain classes):

| class | file | role |
| --- | --- | --- |
| **`ontology_node`** | `class.ontology_node.php` | Runtime wrapper around **one** ontology node, identified by its `tipo`. Read-only metadata access (label, model, parent, children, relations, TLD, properties) plus a small pair of node-level write helpers (`insert()` / `delete()`) used only by ontology-maintenance tooling. |
| **`ontology_utils`** | `class.ontology_utils.php` | Stateless helpers that resolve **many** nodes at once (all tipos of a model, all model nodes, all tipos of a model_tipo), validate a tipo, and manage TLD-level concerns (active-TLD list, TLD delete, backup/restore tables). |

Both classes sit **on top of** `dd_ontology_db_manager` (the
`core/db/` data-access object for the `dd_ontology` table) and **below** every
model class (`section`, `component_*`, …). They are the runtime *reader* of the
ontology.

!!! important "ontology_engine reads; `ontology` writes the structure"
    This subsystem is deliberately **read-mostly**. Structural changes to the
    ontology — building `dd_ontology` from the `matrix_ontology_main` source
    sections, importing/exporting an ontology, regenerating or deleting a whole
    TLD, parsing a section record into a node — are the job of the separate
    accessor class [`ontology`](#how-it-fits-with-the-rest-of-dédalo) in
    `core/ontology/class.ontology.php`. The header docblocks of both engine
    classes say so explicitly: *"Structural changes to ontology must be done via
    `class.ontology.php`."* The node-level `ontology_node::insert()` /
    `ontology_node::delete()` and the TLD/backup helpers in `ontology_utils`
    exist for that maintenance tooling, not for normal application code.

!!! note "Loading"
    The two engine classes are **explicitly included** by the loader
    (`core/base/class.loader.php`, alongside `dd_ontology_db_manager`), not lazily
    autoloaded, because they are needed very early in almost every request. The
    `ontology` accessor class, by contrast, is loaded on demand by the SPL
    autoloader.

## Responsibilities

- **Per-node metadata resolution** (`ontology_node`) — given a `tipo`, return its
  label/term (with language fallback), model (with legacy/forced/temporal model
  remapping), parent, order_number, relations, TLD, `properties`, `model_tipo`,
  and the `is_model` / `is_translatable` / `is_main` flags.
- **Tree navigation** (`ontology_node`) — direct children, recursive children
  (with model exclusion), recursive parents, siblings, and relation nodes;
  plus the combined "tipos by model **and** relation" resolver.
- **Lazy load + caching** (`ontology_node`) — each node loads its row once
  (`load_data()`), and the class keeps bounded static caches keyed by `tipo`
  for instances, labels, models, children, parents, siblings and
  model-and-relation results.
- **Cross-cutting lookups** (`ontology_utils`) — all tipos of a model name, all
  model nodes, all tipos of a model_tipo, and tipo validity checks.
- **TLD-level concerns** (`ontology_utils`) — the active/installed TLD list (with
  an on-disk cache file), per-tipo active-TLD checks, and the destructive
  TLD-node delete plus the backup/restore-table operations used during major
  ontology operations.
- **Node-level structural writes** (`ontology_node::insert()` / `delete()`) —
  the low-level create/delete of a single `dd_ontology` row, called by
  `ontology` and maintenance tooling.

## Data model

A node is one row of the `dd_ontology` table, exposed through
`ontology_node` as an `stdClass` (`$this->data`). The load-bearing columns,
as documented in the `ontology_node` class vars:

| field | type | meaning |
| --- | --- | --- |
| `parent` | `string\|null` | tipo of the parent node (`null` for a root) |
| `term` | `object\|null` | the multilingual label, e.g. `{"lg-eng":"Object"}` |
| `model` | `string\|null` | the model name (e.g. `section`, `component_portal`) |
| `model_tipo` | `string\|null` | tipo of the model node, e.g. `dd6` → `section` |
| `order_number` | `int\|null` | position among siblings |
| `relations` | `array\|null` | typed relation objects, e.g. `[{"tipo":"tch7"}]` |
| `tld` | `string` | the Top-Level-Domain namespace (`dd`, `rsc`, `oh`, …) |
| `properties` | `object\|null` | the per-node JSONB descriptor (behaviour/options/layout) |
| `is_model` | `bool` | true when the node is a *model* node, not a descriptor |
| `is_translatable` | `bool` | true when the node's data is translatable |
| `is_main` | `bool` | true for a TLD root node (`tipo` = `tld` + `0`) |
| `propiedades` | `string` | **deprecated** v5/v6 JSON-string properties, kept for compatibility |

!!! note "`properties` vs `propiedades`"
    v7 uses the JSONB `properties` object. The legacy `propiedades` string column
    is read only through `get_propiedades()` for v5/v6 compatibility — do not use
    it in new code (matches the v7 *"only `properties`"* convention).

### Caches (all static, bounded)

`ontology_node` keeps these class-static caches keyed by `tipo` (or a composite
key):

- `$instances` — the per-tipo singleton cache behind `get_instance()`.
- `$label_by_tipo_cache` — bounded at `MAX_LABEL_CACHE_SIZE` (5000); trimmed to
  the most-recent entries when exceeded.
- `$model_by_tipo_cache` — bounded at `MAX_MODEL_CACHE_SIZE` (5000), the same
  way.
- `$ar_children_of_this_stat_data`, `$ar_parents_of_this_data`,
  `$ar_siblings_of_this_data`, `$ar_tipo_by_model_name_and_relation_data` —
  per-node navigation caches.

`ontology_utils` keeps `$ar_tipo_by_model_name_cache` and
`$active_tlds_cache` (the latter also persisted to the
`cache_active_tlds.php` file via `dd_cache`).

!!! warning "Worker hygiene caveat"
    Unlike `section`/`ontology`, the engine classes expose **no** `clear()`
    method, and the label/model caches are bounded by trimming rather than
    being purged. The label and model caches are effectively immutable
    (ontology rarely changes within a worker lifetime), and `get_properties()`
    returns a **deep clone** so a cached node's properties cannot be mutated
    across requests. If you mutate ontology structure inside a long-lived
    worker, you must restart the worker or accept that these caches hold the
    pre-change view. State this as a known constraint, not a guarantee.

## Instantiation & lifecycle

Only `ontology_node` is instantiable; `ontology_utils` is a pure static
helper class (never instantiated).

```php
public static function get_instance( string $tipo ) : self
```

- The constructor is **private**; always use `get_instance()`.
- `get_instance()` is a per-`tipo` singleton over the static `$instances`
  cache — repeated calls for the same tipo return the same object.
- The constructor runs the `tipo` through `safe_tipo()` and, if it is malformed
  (non-empty but not equal to its sanitised form), logs an error and leaves the
  node un-loadable rather than throwing.
- The DB row is **not** read in the constructor. It is loaded lazily on the
  first accessor call, through `load_data()` (which delegates to
  `dd_ontology_db_manager::read($tipo)` and sets `is_loaded_data`). Every getter
  calls `load_data()` first, so a node is read at most once.

```php
// resolve a node's model and label
$node  = ontology_node::get_instance('rsc197');
$model = $node->get_model();          // 'section'
$label = $node->get_term('lg-eng');   // 'People' (with fallback)

// the common shortcut path most callers use (cached, static):
$model = ontology_node::get_model_by_tipo('rsc197');     // 'section'
$label = ontology_node::get_term_by_tipo('rsc197','lg-eng');
```

## Public API

Grouped by concern. *static?* marks class-level (static) methods. Every name
below is verified against the source.

### `ontology_node` — lifecycle & loading

| method | static? | purpose |
| --- | --- | --- |
| `get_instance($tipo)` | ✓ | Factory + per-tipo singleton cache. |
| `load_data()` | | Lazily read the node row into `$this->data` (once). Returns `false` on empty tipo / low-level error. |
| `get_data()` | | The full node payload as `stdClass` (loads first). |
| `get_tipo()` | | This node's `tipo`. |

### `ontology_node` — per-node getters

| method | static? | purpose |
| --- | --- | --- |
| `get_parent()` | | Parent tipo, or `null` for a root. |
| `get_term_data()` | | The raw multilingual `term` object. |
| `get_term($lang, $fallback=true)` | | The label in `$lang`; falls back to `DEDALO_STRUCTURE_LANG` then the first non-empty term. |
| `get_model()` | | The resolved model name, applying forced/temporal maps then the legacy model-replacement map. |
| `get_legacy_model()` | | The model name **without** v6/v7 replacements (transitional). |
| `get_order_number()` | | Position among siblings. |
| `get_relations()` | | Raw relation objects (`[{"tipo":…}]`) or `null`. |
| `get_relation_tipos()` | | The relation `tipo`s as a flat array. |
| `get_tld()` | | The node's TLD namespace. |
| `get_properties()` | | The `properties` object, returned as a **deep clone**. |
| `get_propiedades($json_decode=false)` | | The **deprecated** legacy `propiedades` (raw string, or decoded). |
| `get_model_tipo()` | | The tipo of the model node (e.g. `dd6`). |
| `get_is_model()` | | True when this is a model node. |
| `get_is_translatable()` | | True when the node's data is translatable. |
| `get_is_main()` | | True when this is a TLD root (`tld`+`0`). |

### `ontology_node` — per-node setters & structural writes

| method | static? | purpose |
| --- | --- | --- |
| `set_parent($parent)` / `set_term_data($term)` / `set_model($model)` / `set_order_number($n)` / `set_relations($rel)` / `set_tld($tld)` / `set_properties($p)` / `set_model_tipo($t)` / `set_is_model($b)` / `set_is_translatable($b)` / `set_is_main($b)` / `set_propiedades($s)` | | In-memory setters on `$this->data` (used while assembling a node before `insert()`). |
| `insert()` | | Persist `$this->data` as a `dd_ontology` row (adds TLD from tipo). Maintenance/`ontology` use. |
| `delete()` | | Delete this node's `dd_ontology` row. Maintenance/`ontology` use. |

### `ontology_node` — static resolvers (the hot path)

| method | static? | purpose |
| --- | --- | --- |
| `get_term_by_tipo($tipo,$lang=null,$from_cache=true,$fallback=true)` | ✓ | Cached label lookup (the common label entry point). |
| `get_model_by_tipo($tipo,$from_cache=true)` | ✓ | Cached model lookup (the common model entry point). |
| `get_legacy_model_by_tipo($tipo)` | ✓ | Cached legacy-model lookup. |
| `get_translatable($tipo)` | ✓ | Convenience boolean: is this tipo translatable. |
| `get_tipo_from_model($model)` | ✓ | Reverse lookup: model name → its (unique, `tld='dd'`) tipo. |
| `get_color($section_tipo)` | ✓ | `properties.color` or the default gray `#b9b9b9`. |

### `ontology_node` — tree navigation

| method | static? | purpose |
| --- | --- | --- |
| `get_ar_children_of_this()` | | Direct children tipos (first level, ordered), cached. |
| `get_ar_children($tipo)` | ✓ | Static wrapper over the above. |
| `get_ar_recursive_children_of_this($tipo,$is_recursion=0)` | | All descendant tipos (stateful; not fully cached — see source note re. `component_filter_master`). |
| `get_ar_recursive_children($tipo,$is_recursion=false,$ar_exclude_models=null,&$ar_resolved=null)` | ✓ | All descendants via a by-reference collector, with model-based exclusion. |
| `get_ar_parents_of_this($ksort=true)` | | All ancestor tipos up to (excluding) `dd0`, cached. |
| `get_ar_siblings_of_this()` | | Same-parent sibling tipos, cached. |
| `get_relation_nodes($tipo,$cache=false,$simple=false)` | ✓ | A node's relation objects (or just the tipos when `$simple`). |
| `get_ar_tipo_by_model_and_relation($tipo,$model_name,$relation_type,$search_exact=false)` | ✓ | Tipos reachable by `children`/`children_recursive`/`related`/`parent`, filtered by model (exact or substring). Cached. |

### `ontology_utils` — multi-node & TLD helpers (all static)

| method | static? | purpose |
| --- | --- | --- |
| `get_ar_tipo_by_model($model_name)` | ✓ | All tipos whose `model` matches, cached. |
| `get_ar_all_models()` | ✓ | All `is_model=true` tipos. |
| `get_ar_all_tipo_of_model_tipo($model_tipo)` | ✓ | All tipos whose `model_tipo` matches (e.g. all sections via `dd6`). |
| `check_tipo_is_valid($tipo)` | ✓ | True when the tipo is safe and resolves to a model (or is a model). |
| `get_active_tlds()` | ✓ | The installed-TLD list (static + on-disk file cache). |
| `check_active_tld($tipo)` | ✓ | Whether the tipo's TLD is installed (allows the `section_id` SQO pseudo-tipo). |
| `delete_tld_nodes($tld)` | ✓ | **Destructive**: delete every `dd_ontology` row of a TLD (safe-TLD checked). |
| `create_bk_table($tlds)` | ✓ | Build `dd_ontology_bk` from the given TLDs. |
| `delete_bk_table()` | ✓ | Drop `dd_ontology_bk`. |
| `restore_from_bk_table($tlds)` | ✓ | Restore the given TLDs from `dd_ontology_bk`. |

## How it fits with the rest of Dédalo

`ontology_engine` is the runtime *reader* in a three-layer ontology stack:

```mermaid
flowchart TB
    MODELS["section / component_* / tools<br/>(model classes)"] -->|get_model_by_tipo,<br/>get_term_by_tipo,<br/>children/parents/relations| ENGINE
    subgraph ENGINE["core/ontology_engine/ (runtime read layer)"]
        ON["ontology_node<br/>(one node, cached)"]
        OU["ontology_utils<br/>(many nodes, TLDs)"]
    end
    ENGINE -->|read / search / create / delete| DBM["dd_ontology_db_manager"]
    DBM --> T[("dd_ontology table")]
    ONTW["ontology (core/ontology/)<br/>build · import/export · regenerate · delete TLD"] -->|insert()/delete() nodes,<br/>parse_section_record_to_ontology_node| ENGINE
    MOM[("matrix_ontology_main<br/>source-of-truth sections")] -->|builds| ONTW
    ONTW -->|writes| T
```

- **Above it** sit the model classes. `section::get_instance()` calls
  `ontology_node::get_model_by_tipo()` to refuse non-section tipos;
  `section::get_ar_recursive_children()` wraps
  `ontology_node::get_ar_recursive_children()`; every component context resolves
  its label, model and `properties` through `ontology_node`. See
  [Sections / `section`](../sections/section.md) and
  [Components](../components/index.md).
- **Below it** sits `dd_ontology_db_manager` (in `core/db/`), which does
  the actual SQL `read` / `search` / `create` / `update` / `delete` on the
  `dd_ontology` table. The engine never writes SQL directly except for a few
  TLD/backup operations in `ontology_utils`.
- **Beside it** sits the **`ontology`** accessor class (`core/ontology/`), the
  *structural-write* counterpart. `ontology` builds `dd_ontology` from the
  `matrix_ontology_main` source sections (the editable ontology lives as normal
  Dédalo records; `parse_section_record_to_ontology_node()` turns a record into a
  node, and `regenerate_records_in_dd_ontology()` / `delete_ontology()` operate per
  TLD). It calls **into** the engine (`ontology_node::insert()` / `delete()`,
  `get_instance()`) to materialise individual nodes. For the conceptual picture
  of why the ontology *is* the active schema, see
  [Architecture overview](../architecture_overview.md#the-ontology-is-the-active-schema).
- The HTTP surface that exposes ontology operations is
  `core/api/v1/common/class.dd_ontology_api.php`.

## Examples

### Resolve a section's data-bearing component children

```php
// all direct children, then keep only component_input_text descendants
$people_tipo = 'rsc197';

// every recursive descendant, skipping layout/structural models
$ar_children = ontology_node::get_ar_recursive_children(
    $people_tipo,
    false,
    ['box elements', 'area'] // models to skip (and their subtrees)
);

// or: children of a given model reachable from a node
$ar_text = ontology_node::get_ar_tipo_by_model_and_relation(
    $people_tipo,
    'component_input_text',
    'children_recursive'
);
```

### Validate a tipo and check its TLD is installed

```php
if (!ontology_utils::check_tipo_is_valid($tipo)) {
    // unknown / malformed tipo, or its TLD is not installed
    return false;
}
if (!ontology_utils::check_active_tld($tipo)) {
    // the tipo's namespace (TLD) is not installed in this instance
    return false;
}
```

### Read a node's properties safely

```php
$node = ontology_node::get_instance('rsc91');

// get_properties() returns a DEEP CLONE: mutating it cannot corrupt the cache
$properties = $node->get_properties();
if (isset($properties->source->mode)) {
    // ... read configuration ...
}
```

!!! note "Read, don't mutate, in application code"
    Treat `ontology_node` as read-only outside ontology-maintenance tooling. The
    setters and `insert()`/`delete()` exist for the `ontology` builder; normal
    request code should only call the getters and static resolvers.

## Related

- [Ontology concept](index.md) — what the ontology is, TLDs, the node JSON shape.
- [Architecture overview](../architecture_overview.md) — the ontology as the
  active schema and the abstraction layers.
- [Sections / `section`](../sections/section.md) — the biggest consumer of the
  engine's children/model resolvers.
- [Components](../components/index.md) — how a component context resolves its
  model, label and `properties` through `ontology_node`.
- [request_config](../request_config.md) — how `properties.request_config` flows
  from the node into the rendered context.
- [Locator](../locator.md) — the typed pointers stored in node `relations` and in
  record data.
