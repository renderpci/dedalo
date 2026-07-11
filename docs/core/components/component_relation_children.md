# component_relation_children

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal"            : false,
    "is_related"            : true,
    "is_media"              : false,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools" : [
        "tool_propagate_component_data"
    ],
    "render_views" : [
        {
            "view" : "default | line",
            "mode" : "edit | list"
        },
        {
            "view" : "text | mini",
            "mode" : "list"
        }
    ],
    "data"        : "array of locators (calculated, not stored)",
    "sample_data" : [
        {
            "type"                : "dd48",
            "section_tipo"        : "test3",
            "section_id"          : "2",
            "from_component_tipo" : "test201"
        }
    ],
    "value"        : "array of strings",
    "sample_value" : ["Bronze coins"]
}
```

!!! note "Typology"
    `component_relation_children` is a **related** component. It stores
    [locators](../locator.md), not literal values. It is **non-translatable**
    (`lg-nolan`); the displayed value is resolved from the *target* child sections,
    not held locally. The default relation type is
    `DEDALO_RELATION_TYPE_CHILDREN_TIPO = 'dd48'`.

!!! warning "Read-only / calculated component"
    Unlike most related components, `component_relation_children` **does not store any
    data of its own**. Its `save()` is a no-op (`return true`) and `get_data()`
    *calculates* the list of children at read time by searching every section that
    points at the current record through a [component_relation_parent](component_relation_parent.md)
    (`type = dd47`). It is the **inverse view** of `component_relation_parent`:
    the parent records own the link, the children component only reflects them.

!!! info "Client is an alias of `component_portal`"
    The client class is a direct alias —
    `export const component_relation_children = component_portal` (see
    `core/component_relation_children/js/component_relation_children.js`). All client
    behaviour, views and modes are inherited verbatim from
    [component_portal](component_portal.md); there is no bespoke JS render or view
    file for this component beyond the alias.

!!! info "TS server implementation"
    The descriptor `src/core/components/component_relation_children/descriptor.ts` registers `resolveData: relationChildrenResolver` (`src/core/relations/models/relation_children.ts`). It computes the inverse locators via `getChildren()` (`src/core/relations/children.ts`, the inverse dd47 "who declares me as parent?" query, sibling-ordered through `resolveParentLinkIdKey`), grafts them into a synthetic copy of the record under this component's own tipo, and delegates to the shared portal engine (`src/core/relations/models/portal.ts`) for pagination/child-ddo expansion/re-stamping. Unlike a generic relation, an EMPTY children component still emits its own item (`entries: []`, `pagination.total: 0`) in every non-search mode. Search mode reads the stored matrix value like a normal relation (the generic portal path). Search over the inverse-parent SQL pipeline is not yet ported. See the *dedalo-relations-ts* and *dedalo-tree-ts* skills.

## Definition

`component_relation_children` exposes the **downstream** side of a parent/child
hierarchy. Where [component_relation_parent](component_relation_parent.md) records *"my parent is X"* on each
child record, `component_relation_children` answers the reverse question on the
parent record: *"which records declare me as their parent?"*. It is the component
that powers the expandable branches of a thesaurus / ontology tree (see the
*dedalo-ts-tree* skill), where a broader term shows its narrower terms.

**Why it exists.** Hierarchies in Dédalo are stored once, on the child, as a parent
locator. Without a children component, a parent record would have no way to list or
order its descendants. `component_relation_children` provides that list by querying
the parent relations, so the hierarchy stays single-sourced (no duplicated
parent+child links that could drift out of sync) while still being navigable from
both directions.

**When to use it.**

- Thesaurus / classification trees: a broader term (*Coins*) showing its narrower
  terms (*Bronze coins*, *Silver coins*), or an ontology node showing its child
  nodes.
- Any "contains / is composed of" hierarchy where the relationship is authored on
  the child (*Archaeological site* → its *Stratigraphic units*; *Fonds* → its
  *Series* in an archival arrangement).
- Read-only display of descendants on the parent record, with the hierarchy order
  managed through the thesaurus tree.

**When not to use it.**

- A generic, symmetric link between records that is not a parent/child hierarchy →
  use [component_portal](component_portal.md) or
  [component_relation_related](component_relation_related.md).
- The *child's* side of the relation (the authored link "my parent is X") →
  use [component_relation_parent](component_relation_parent.md).
- A literal value the record owns → use [component_input_text](component_input_text.md)
  or another direct component.

## Data model

**Data:** `array of locators`. The array is **calculated**, never persisted in this
component's matrix column.

**Value:** `array` of `strings` (the resolved term/label of each child record), or `null`.

**Storage shape.** This component has no storage of its own. The link lives on each
**child** record's `component_relation_parent`, stored in that record's matrix
`relation` column as `{parent_tipo: [locator]}` with `type = dd47`
(`DEDALO_RELATION_TYPE_PARENT_TIPO`). At read time `get_data()` runs a search for
every record whose parent locator points back at the current record, and builds one
children locator per result:

```json
[
    {
        "type"                : "dd48",
        "section_tipo"        : "test3",
        "section_id"          : "2",
        "from_component_tipo" : "test201"
    }
]
```

Each locator field:

- `type` — the children relation type, always `dd48` (`DEDALO_RELATION_TYPE_CHILDREN_TIPO`).
- `section_tipo` / `section_id` — the **target child** record.
- `from_component_tipo` — the owning `component_relation_children` tipo (e.g. `test201`),
  which lets `relation_list` and grid resolution slice the right subset out of the
  section-wide relations bag.

In the JSON-API datum the locators are surfaced under `data.entries` (see
`samples/api_data.json`), accompanied by `parent_tipo`, `parent_section_id` and a
`pagination` block (`total`, `limit`, `offset`). Children lists are paginated:
`get_data_paginated()` resolves only the current page and `count_children()` resolves
the total with a single `full_count` SQL query rather than loading every row.

!!! note "Datum vs. stored data"
    The transmitted unit is a `{context, data}` datum. Because the value is resolved
    from the target child records (`get_locator_value()` / `ts_object::get_term_by_locator()`),
    the `context` carries the description (`tipo`, `model`, `section_tipo`, `mode`,
    `properties`, `request_config`, `tools`, `view`, `children_view`,
    `fields_separator`, `records_separator`) and `data` carries only the locators —
    never the child literal values. See the *dedalo-context-data-layers* skill.

## Ontology instantiation

A `component_relation_children` is created as an ontology node whose `model` is
`component_relation_children`. Its `parent` is the section (or grouper) it belongs
to, and `section_tipo` wires it into that section. For the hierarchy to resolve, the
**same section must also contain a `component_relation_parent`** node, and the two
must be paired so the engine can resolve the parent tipo for this section (TS:
`getParentTipo()`, `src/core/relations/children.ts`); if that pairing is missing the
component falls back to locating *any* `component_relation_parent` in the section
(PHP logs a "Bad definition in ontology" warning in that fallback path).

Node definition (shape):

```json
{
    "tipo"         : "test201",
    "model"        : "component_relation_children",
    "parent"       : "test3",
    "section_tipo" : "test3",
    "lg-eng"       : "Children",
    "lg-spa"       : "Hijos",
    "translatable" : false,
    "properties"   : { }
}
```

Realistic `properties` block. The `source` block defines how the target child
records are searched and shown (the RQO); `records_mode` controls how each resolved
child is rendered in the list:

```json
{
    "source": {
        "records_mode": "list",
        "request_config": [
            {
                "sqo": {
                    "section_tipo": [
                        { "source": "self" }
                    ]
                },
                "show": {
                    "ddo_map": [
                        {
                            "tipo": "test52",
                            "parent": "self",
                            "section_tipo": "self",
                            "value_with_parents": true
                        }
                    ]
                }
            }
        ]
    }
}
```

`section_tipo: "self"` lets a children list mix records from different section tipos
(useful when a tree root spans several sections). `show.ddo_map` names the child
component(s) whose value renders as the visible label of each branch, and
`value_with_parents` prepends the ancestor term(s) to that label.

No `save_path` is ever produced: `save()` returns `true` immediately. When the user
adds or removes a child through the UI, the change is routed to the related
`component_relation_parent` instance (see *Notes*), which is the single writer to the
database.

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. Verified
names consumed by this component (most via the shared base / portal alias):

### source

- **Values:** object. The relation configuration block shared by all related
  components. Relevant keys for children:
    - `records_mode` — `"list"` (default `list`, read by `common::get_records_mode()`):
      the mode used to render each resolved child record.
    - `request_config` — the **RQO** array (`sqo` / `show` / `choose`) that defines the
      target section(s) and which child component(s) supply the visible value. With
      `section_tipo: [{"source":"self"}]` the children may span several section tipos.
    - `config_relation` — when present, `config_relation.relation_type` overrides the
      default relation type and `config_relation.relation_type_rel` sets directionality
      (`$relation_type_rel`); both are read in the base constructor.
- **Effect:** drives the value resolution and the datalist of selectable target
  records. See the *dedalo-datalist-resolution* skill.

### children_view

- **Values:** string view name (e.g. `"text"`, `"line"`); falls back to `view`, then
  to `"default"` (or `"text"` for the `mini` view).
- **Effect:** the view used to render each resolved child inside the relation list.
  Read by the inherited portal views (`view_*_portal.js`,
  `render_search_component_portal.js`). In `samples/context.json` it is `"text"`.

### css

- **Values:** object mapping CSS selectors to style declarations (e.g.
  `{".wrapper_component": {"grid-column": "span 6"}}`).
- **Effect:** style stamped on the component wrapper, like every component.

### request_config

- **Values:** the parsed RQO carried into `context.request_config`.
- **Effect:** the ready-to-use search configuration for resolving and listing the
  target child records. See the *dedalo-request-config* skill.

!!! note "Inherited related-component properties"
    Generic related-component properties such as `sort_by_column` (used by
    [component_portal](component_portal.md)) are part of the shared base but the
    practical ordering of children is governed by the **thesaurus order**, not by a
    per-portal column sort — see *Notes*. Any other custom key seen in production
    should be verified in the ontology (`verify in ontology`).

## Render views & modes

The client is an alias of [component_portal](component_portal.md), so the views and
modes are portal's. Verified from `test/client/js/test_component_relation_children.js`
and `samples/context.json` (default `view` is `line`, `children_view` is `text`):

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | (via search render) | Full wrapper with `content_data` and one entry per child locator. |
| `line` | yes | yes | — | Compact inline list. |
| `text` | — | yes | — | Plain joined value, no chrome. |
| `mini` | — | yes | — | Minimal view for tight spaces. |

Modes:

- **edit** — shows the resolved children; add/remove is delegated to the related
  parent component (the children component itself never persists).
- **list / tm** — read-only listing of the resolved children (`tm` reuses list).
- **search** — **special case**: `get_data()` and `set_data()` delegate to
  `parent::` (i.e. behave like a normal stored relation component) because search
  operates over the actually-stored parent locators, not over calculated data.
  `search_operators_info()` is overridden to return an empty operator set.

DOM (edit / default), inherited from portal:
`wrapper_component component_relation_children <tipo> <mode>` → `label`, `buttons`,
`content_data` → one entry per resolved child.

## Import / export model

**Import.** Handled by the shared `component_relation_common::conform_import_data()`.
The default format is a JSON array of locators; a bare `section_id` (or comma list)
is also accepted when a single target section can be resolved. The column name may be
the bare component tipo (`test201`) or a `tipo_targetsection` form (`test201_test3`):

```json
[{"section_tipo":"test3","section_id":"2","from_component_tipo":"test201"}]
```

Because this component is calculated, importing a children link ultimately writes the
corresponding **parent** locator on the child record. An empty cell clears the
relation. See [importing data](../importing_data.md#related-data).

**Export.** Handled by the shared base. `get_export_value()` / `get_grid_value()`
iterate the resolved child locators and, per the `ddo_map`, instantiate the named
child component(s) against each `section_id`/`section_tipo` to resolve sub-columns;
`records_separator` (default `" | "`) joins multiple children for flat output.
See [exporting data](../exporting_data.md).

## Notes

- **Inverse of `component_relation_parent`.** Adds/removes are routed through the
  related parent component: PHP `add_child()` / `remove_child()` resolve the parent tipo,
  instantiate `component_relation_parent` and call `make_me_your_parent()` /
  `remove_me_as_your_parent()`, then save on the parent. TS mirrors this at the
  primitive level: `addParent()` / `removeParent()` (`src/core/relations/parent.ts`)
  are the single write path — a child's parent edge (and this component's computed
  reflection of it) is always mutated from the child's `component_relation_parent`,
  never from this component's own column (its `save()` is a no-op both sides).
- **Thesaurus integration.** `getChildrenOfType()` (`src/core/relations/parent.ts`, over
  `getChildrenOfTypeLocators` in `src/core/relations/children.ts`) filters by descriptor
  vs non-descriptor using the section map's `thesaurus->is_descriptor` (a locator to the
  Si/No section `dd64`). `sortChildren()` / `recalculateSiblingOrders()`
  (`src/core/relations/parent.ts`) persist branch order by writing the section map's
  `thesaurus->order` component (a [component_number](component_number.md)) on each
  child, as an **`id_key` dataframe** of the child's parent-link locator (resolved
  via `resolveParentLinkIdKey()`, `src/core/relations/children.ts`); the read-side list
  ordering is exposed by `getChildren()` / `getChildrenRecursive()` /
  `countChildren()` in the same file, STRING-section-id, sibling-ordered. The `dd_ts_api`
  save-order action is documented in the *dedalo-tree-ts* skill.
- **Caching.** PHP memoises resolved data (`data_resolved`) and parent-tipo lookups
  as per-request instance state that must survive one PHP request only. `getChildren()`
  (`src/core/relations/children.ts`) recomputes on every call with no equivalent
  instance-level memoization in this checkout — a coverage gap to watch if a very
  wide/deep tree read shows up as a hot path.
- **Default tools.** A non-translatable related instance exposes
  `tool_propagate_component_data` in `context.tools` (verified from
  `samples/context.json`); the toolbar is assembled from the model + ontology, not
  hardcoded in the class.
- **Observers / observables.** Configured in the ontology `properties` like any other
  component (see the index page *Observers and observables* section); none are
  hardcoded here.
- **Related components:** [component_relation_parent](component_relation_parent.md),
  [component_relation_related](component_relation_related.md), [component_portal](component_portal.md),
  [component_select](component_select.md), [component_check_box](component_check_box.md),
  [component_number](component_number.md), [component_input_text](component_input_text.md).
