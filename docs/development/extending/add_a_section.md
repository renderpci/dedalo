# Add a section

> **Goal:** create a new kind of record (a "table") in Dédalo by authoring ontology nodes — usually with **no PHP at all**.

A section is the Dédalo equivalent of an SQL table, but it is **not** a physical
table: it is an ontology node with `model: "section"` plus the generic
`core/section/class.section.php` runtime that reads, writes, relates and renders
the records that belong to it. Adding a section therefore means **authoring
nodes**, not writing classes.

Before you start, read the concept and reference pages this guide builds on — it
does not repeat them:

- [Sections concept](../../core/sections/index.md) — the `matrix` table model, typed-JSONB storage, the `section` / `sections` / `section_record` class family.
- [`section` class reference](../../core/sections/section.md) — `get_instance()`, modes, the relations bag, children resolution.
- [Ontology authoring](../../core/ontology/authoring.md) — the node shape, the `properties` grammar, the regenerate (compile) step that makes an edit live.
- [request_config examples](../../core/request_config_examples.md) — copy-pasteable list and edit configs.

## When do you need this — ontology-only vs code

| You want to… | What to author | Need PHP? |
| --- | --- | --- |
| A new record type with standard fields, layout, search and lists | A `section` node + `component_*` children + grouper layout | **No** |
| Group fields into panels/tabs | `section_group` / `section_tab` grouper nodes | **No** |
| Tune what columns the list shows, the edit form layout, pagination | `request_config` in the section node's `properties` | **No** |
| Bespoke server logic on the section itself (custom record creation, a non-standard relations rule, a special save path) | A `section` subclass in `core/section_X/` | **Yes** (rare) |

The overwhelming majority of sections are **ontology-only**. You only write a
PHP subclass in the last row — see [When a PHP subclass is warranted](#when-a-php-subclass-is-warranted).
This is the same flow as the generic authoring procedure in
[Ontology authoring → Step-by-step](../../core/ontology/authoring.md#step-by-step-add-a-section-component-group-or-tool);
this page is the **section-specific** walk-through.

## Step-by-step

You author every node in the **Ontology area** (System administration →
Ontology). Each step below is one node or one field on a node.

### 1. Create the section node

Create a child record under the area (or TLD root) that will contain the
section, and set:

| field | value |
| --- | --- |
| `model` | `section` |
| `parent` | the container node (e.g. an area tipo); auto-set when you create under a node |
| `tld` | the two-or-more-letter TLD prefix (e.g. `rsc`) |
| `lg-*` term | the section's display label, per language |

The node's `tipo` is **TLD + the editable record's `section_id`** — a record
with `section_id = 197` under TLD `rsc` compiles to node `rsc197`. That numeric
suffix is exactly the `section_tipo` that ends up in the `matrix` table.

```json
{
  "tipo": "rsc197",
  "parent": "tch188",
  "model": "section",
  "model_tipo": "dd6",
  "tld": "rsc",
  "lg-eng": "People", "lg-spa": "Personas", "lg-cat": "Persones"
}
```

### 2. Point the section at its physical table (`matrix_table`)

`section` does not invent a table — it resolves one with
`common::get_matrix_table_from_tipo()`. That method reads a **related term of
model `matrix_table`** off the section node; its term value *is* the physical
table name. If you author no `matrix_table` relation the resolver logs a warning
and **falls back to the shared `matrix` table**, which is the normal case for an
ordinary section. Author a `matrix_table` term only when the section must live
in its own physical table.

!!! note "Built-in exceptions"
    Two core sections short-circuit this lookup by tipo constant:
    `DEDALO_SECTION_PROJECTS_TIPO → matrix_projects` and
    `DEDALO_SECTION_USERS_TIPO → matrix_users` (see
    `common::get_matrix_table_from_tipo()`). You do not author those.

### 3. Add the component children (the "columns")

A section's columns are its **component children**. Create each field as a node
whose:

- `parent` = the section tipo (logical ownership), and
- `parent_grouper` = the layout container it renders under (the section itself,
  or a `section_group` / `section_tab` from step 4).

Pick each component's `model` for what it stores — see
[Add a component](add_a_component.md) for the base-class decision and the full
component checklist. Literal components (e.g. `component_input_text`) store their
value in the record's typed JSONB columns; relation-bearing components
(e.g. `component_portal`) write [locators](../../core/locator.md) into the
record's shared `relations` array, which the **section** owns (see
[Relations are section-owned](../../core/sections/index.md#relations-are-section-owned)).

```json
[
  { "tipo": "rsc85", "model": "component_input_text",
    "parent": "rsc197", "parent_grouper": "rsc197", "lg-eng": "Name" },
  { "tipo": "rsc86", "model": "component_input_text",
    "parent": "rsc197", "parent_grouper": "rsc197", "lg-eng": "Surname" }
]
```

At runtime `section::get_ar_children_tipo_by_model_name_in_section()` walks the
recursive children and filters them by model — you never register them anywhere.

!!! tip "Record identity is automatic"
    Every section gets an implicit `component_section_id` that surfaces the
    record's `section_id`; you do not author the id field. Parent/child links
    between records use `component_relation_parent` / `component_relation_children`
    component nodes when you need a hierarchy.

### 4. Group fields into panels and tabs (layout)

Layout is done with **grouper** models, which hold **no data** and produce no
tools — they exist purely to organise the form. The recognised groupers are
exactly (`section::get_ar_grouper_models()`):

```text
section_group · section_group_div · section_tab · tab
```

To add a panel, create a `section_group` (or `section_tab`) node under the
section, then point your component children's `parent_grouper` at that grouper
instead of at the section. The component's `parent` stays the section — only the
*layout* placement moves. See [section_group](../../core/sections/section_group.md)
and [section_tab](../../core/sections/section_tab.md) for the grouper reference.

```json
[
  { "tipo": "rsc197a", "model": "section_group",
    "parent": "rsc197", "parent_grouper": "rsc197", "lg-eng": "Identity" },

  { "tipo": "rsc85", "model": "component_input_text",
    "parent": "rsc197", "parent_grouper": "rsc197a", "lg-eng": "Name" }
]
```

### 5. Configure list vs edit with `request_config`

What the list view shows and how the edit form is laid out are driven by the
**`request_config`** descriptor in the section node's `properties` (authored in
`ontology17`; see [Ontology authoring → properties](../../core/ontology/authoring.md#source--request_config)).
The list and edit modes are separate configs distinguished by the `type` /
`mode` they target. Do **not** invent the JSON — copy the closest scenario from
[request_config examples](../../core/request_config_examples.md):

- list columns → [Section List Configuration](../../core/request_config_examples.md#1-section-list-configuration)
- edit form → [Section Edit Configuration](../../core/request_config_examples.md#2-section-edit-configuration)

A list config selects which component tipos appear as columns via a `show.ddo_map`;
an edit config lays out the same children for the record form. With no
`request_config` the section still works with sensible defaults — add it to
control ordering, hidden fields, pagination and views.

### 6. Wire the section into a menu

A section that no menu links to is reachable only by direct tipo. Add it to the
ontology **menu tree** (model `menu`) under the relevant area so it appears in
the UI navigation, exactly as existing sections are wired.

### 7. Regenerate (compile) so the edit goes live

Edits live in the **editable** ontology layer; the runtime reads the compiled
flat `dd_ontology` table. Nothing is live until you **regenerate** the TLD — see
[Ontology authoring → How changes apply live](../../core/ontology/authoring.md#how-changes-apply-live).
After regenerating, open the section: `section::get_instance($tipo)` resolves the
model, refuses anything that is not `section`, and builds the runtime object from
your nodes — no code deploy, no schema migration.

## Worked example — a "People" section

A minimal People section with two literal fields and one relation to
interviews, stored in the shared `matrix` table (no `matrix_table` relation
authored). This mirrors the full
[worked example in the sections concept doc](../../core/sections/index.md#worked-example-a-people-section).

```json
[
  { "tipo": "rsc197", "model": "section", "parent": "tch188",
    "model_tipo": "dd6", "tld": "rsc",
    "lg-eng": "People", "lg-spa": "Personas" },

  { "tipo": "rsc197a", "model": "section_group",
    "parent": "rsc197", "parent_grouper": "rsc197", "lg-eng": "Identity" },

  { "tipo": "rsc85", "model": "component_input_text",
    "parent": "rsc197", "parent_grouper": "rsc197a", "lg-eng": "Name" },

  { "tipo": "rsc86", "model": "component_input_text",
    "parent": "rsc197", "parent_grouper": "rsc197a", "lg-eng": "Surname" },

  { "tipo": "rsc198", "model": "component_portal",
    "parent": "rsc197", "parent_grouper": "rsc197", "lg-eng": "Interviews",
    "relations": [ /* target section/components: the interview section */ ] }
]
```

A saved record then lives in `matrix` as `(section_tipo = "rsc197", section_id = N)`
with `data` holding `rsc85`/`rsc86` values plus the shared `relations` array for
the portal — no other wiring. Regenerate, add it to a menu, and the section is
fully usable: list, edit, search and the relations bag all come from the generic
`section` runtime.

## When a PHP subclass is warranted

Almost never. Create `core/section_X/class.section_X.php` (extending `section`)
**only** when the generic runtime cannot express your behavior in nodes — e.g. a
non-standard record-creation rule, a bespoke relations policy, or a custom save
path. The autoloader is pure convention: a model name `section_X` resolves to
`core/section_X/class.section_X.php` with no registration array to edit (see
`core/base/class.loader.php`). Then set the section node's `model` to `section_X`
instead of `section`. Everything else in this guide is unchanged — the subclass
is an override layer, not a replacement for the ontology authoring.

If you only need a *different storage shape per component*, that belongs in the
component (and its `section_record_data::$column_map` entry), not in a section
subclass — see [Add a component](add_a_component.md).

## Common pitfalls

- **Forgetting to regenerate.** The editable layer is not the runtime layer. An
  un-compiled section will not load. Always regenerate the TLD after editing.
- **`parent` vs `parent_grouper` confusion.** `parent` is logical ownership
  (always the section); `parent_grouper` is layout placement (the section, a
  `section_group`, or a `section_tab`). Mixing them up drops fields from the form
  or detaches them from the section.
- **Expecting a grouper to store data.** `section_group` / `section_group_div` /
  `section_tab` / `tab` are layout only — they hold no value and emit no tools.
- **Authoring a `matrix_table` relation you did not mean to.** Without it the
  section correctly defaults to the shared `matrix` table. Add it only for a
  section that needs its own physical table.
- **Setting `model` to `section` on a node meant to be something else.**
  `section::get_instance()` refuses any tipo whose model is not `section`
  (returns `false` and logs), and `common::get_matrix_table_from_tipo()` rejects
  non-section tipos — keep the model accurate.
- **Trying to change a shared node's `model` from a local override.** `model`
  and `is_model` are always read from the canonical node (see
  [Ontology authoring](../../core/ontology/authoring.md#step-by-step-add-a-section-component-group-or-tool)).

## Related

- [Sections concept](../../core/sections/index.md)
- [`section` class reference](../../core/sections/section.md)
- [`section_record` reference](../../core/sections/section_record.md)
- [section_group](../../core/sections/section_group.md) · [section_tab](../../core/sections/section_tab.md) · [section_list](../../core/sections/section_list.md)
- [Ontology authoring](../../core/ontology/authoring.md)
- [request_config examples](../../core/request_config_examples.md)
- [Add a component](add_a_component.md)
