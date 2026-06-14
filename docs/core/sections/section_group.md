# section_group

> The server class `section_group` — a pure **layout grouper**: a non-data child node of a section under which sibling components are visually grouped (the collapsible "field group" box in edit/list).

> See also: [Sections concept](index.md) · [section](section.md) · [Components](../components/index.md) · [Architecture overview](../architecture_overview.md)

This page is the **class-level reference** for `section_group`. It is one of the
ontology *grouper* models — container nodes that carry **no data of their own**
and exist only to arrange a section's components for layout. For the conceptual
model of a section and its component children, read [Sections](index.md) first.

## Role

`section_group` (in `core/section_group/class.section_group.php`,
`class section_group extends common`) is the PHP runtime representation of **one
layout-group node** inside a section. In the ontology a section's components are
not children of the section directly; they hang under one or more
`section_group` nodes via `parent_grouper`, which is what lets the editor render
named, collapsible groups of fields (see the
[Architecture overview tree](../architecture_overview.md#the-areas-sections-components-data-hierarchy),
where the People section holds a `section_group` that in turn holds the Name and
Surname components).

It is deliberately minimal. The whole class is ~44 lines: a constructor and a
single override of `get_tools()`. It owns **no value**, reads/writes **nothing**
from the matrix table, and produces a context with an empty `data` array. Its
only job is to exist as a node in the ontology so that the structure-context
walk emits a grouper context the client can turn into a wrapper element.

It sits among `common`'s grouper family:

| model | role |
| --- | --- |
| **`section_group`** *(this class)* | A named, collapsible group of components inside a section. The default field-grouping container. |
| **`section_group_div`** | A *legacy model* that maps to `section_group` (`common::$ar_temp_map_models['section_group_div'] => 'section_group'`); rendered as an unlabelled `<div>` group (`add_label = false`). |
| **`section_tab`** / **`tab`** | Tabbed groupers — the same "no data, layout only" contract, rendered as tab strips rather than collapsible boxes. See [section_tab](section_tab.md). |

All four are registered in `common::$groupers` and in
`section::get_ar_grouper_models()` (`['section_group','section_group_div','section_tab','tab']`),
which is what tells the section's child-resolution walk that these nodes are
containers to descend into rather than data-bearing components.

!!! note "Inheritance"
    `section_group extends common`, so it inherits the shared object machinery:
    the `$tipo`, `$section_tipo`, `$mode`, `$lang`, `$label` and `$permissions`
    properties and the magic `get_X()`/`set_X()` accessors, plus
    `load_structure_data()`, `get_structure_context()`,
    `get_structure_context_simple()`, `get_properties()` and the static cache
    helpers. See the [`common` contract](../components/base_classes.md). It does
    **not** add a `get_instance()` factory or any data accessor of its own.

## Responsibilities

- **Be a layout container.** Mark a node in the section tree as a grouper so the
  structure walk descends into it and the client renders a wrapper for its
  children. It groups; it does not store.
- **Carry a label and CSS, nothing else.** The group's title (`label`) and any
  layout CSS come from the ontology node's term and `properties`, lifted into
  the context by the inherited `build_structure_context()`.
- **Refuse tools.** Override `get_tools()` to return `[]` so the tools subsystem
  never attaches inspector/component tools to a grouper (a grouper has no record
  to act on). This is the one behavioural difference from a bare `common`
  subclass.
- **Stay out of the data path.** Its JSON controller emits a context and an
  **empty `data` array**; it never touches `section_record` or the matrix table.

## Key concepts / Data model

`section_group` has **no data model**. The constructor sets only identity
(`tipo`, `section_tipo`, `mode`, `lang`) and calls `load_structure_data()` to
pull the node's label and properties from the ontology. There is no `$dato`, no
`get_data()`/`set_data()`, and the controller's `data` is always `[]`.

How children are attached to it:

- In the **ontology**, a component declares the group as its `parent_grouper`
  (the `parent_grouper` field documented on `common`,
  *"Links elements to their containing section_group or tab"*). The component's
  `parent` may still be the section; `parent_grouper` is the *layout* parent.
- On the **server**, when a section builds its structure context it walks the
  recursive children. Grouper nodes are matched by
  `case (in_array($model, common::$groupers))` and instantiated with the plain
  constructor `new $model($current_tipo, $current_section_tipo, $mode)` (for the
  legacy `section_group_div`, `$model` is normalised to `section_group` first).
  Each grouper contributes a context item; the components keep their own context
  items, tagged with the grouper via `parent_grouper`.
- On the **client**, `render_section_group` builds a `wrapper_section_group`
  element whose `wrapper.content_data` pointer is *"used as grouper selector from
  section_record"* — the section render places each child component into the
  grouper's `content_data` based on its `parent_grouper`. The group label is a
  collapsible toggle (`ui.collapse_toggle_track`) whose open/closed state is
  persisted in the local DB under `section_group_<section_tipo>_<tipo>`.

```text
section (rsc197)
└── section_group  (layout, no data)   ← this class
        ├── component_input_text  Name     (parent_grouper = section_group)
        └── component_input_text  Surname   (parent_grouper = section_group)
```

## Instantiation & lifecycle

`section_group` has **no `get_instance()` factory** (unlike `section` and
`component_common`). It is constructed directly with `new`, which is exactly how
the section structure walk creates it:

```php
public function __construct(
    string $tipo,         // grouper ontology tipo
    string $section_tipo, // section it belongs to
    string $mode          // 'list' | 'edit' | ... (inherited from the section build)
)
```

The constructor:

1. stamps `$tipo`, `$section_tipo`, `$mode`;
2. forces `$lang = DEDALO_DATA_LANG` (a grouper has no per-language value, only a
   label resolved in the app language);
3. calls the inherited `load_structure_data()` to populate `ontology_node`,
   `model` and `label` from the ontology.

```php
// how the section build instances a grouper (see common, grouper case)
$grouper_model = ($model === 'section_group_div') ? 'section_group' : $model;
$element       = new $grouper_model($current_tipo, $current_section_tipo, $mode);

// the grouper contributes a context only; its data is always []
$context = $element->get_structure_context($permissions);
```

!!! note "Why `new`, not `get_instance()`"
    Groupers are cheap, stateless and short-lived — they hold no data and need
    no instance cache. The expensive structure-context computation they perform
    is cached upstream in `common::$cache_structure_context`, so a fresh `new`
    per build is harmless.

## Public API / Key methods

`section_group` defines exactly one method of its own; everything else is
inherited from [`common`](../components/base_classes.md).

### Own methods

| method | static? | purpose |
| --- | --- | --- |
| `__construct($tipo, $section_tipo, $mode)` | | Stamp identity, force `lang = DEDALO_DATA_LANG`, and `load_structure_data()`. |
| `get_tools()` | | **Override returning `[]`** — *"Catch get_tools call to prevent load tools sections"*. A grouper never carries tools. |

### Inherited from `common` (used by the controller / build)

| method | static? | purpose |
| --- | --- | --- |
| `load_structure_data()` | | Lazily pull `ontology_node`, `model`, `label` from the ontology (called by the constructor). |
| `get_structure_context($permissions, $add_request_config=false)` | | Build the full grouper context (label, css, permissions, …) consumed by the client. |
| `get_structure_context_simple($permissions, $add_request_config=false)` | | The lighter context variant requested when `context_type === 'simple'`. |
| `get_properties()` | | The node's layout/CSS properties from the ontology. |
| `get_tipo()` / `get_section_tipo()` | | Identity accessors via the magic `get_X()` accessor. |
| `build_element_json_output($context, $data)` | ✓ | Wrap `{context, data}` for the wire (the controller's return). |

!!! warning "Do not invent data accessors"
    `section_group` has no `get_data()`, `set_data()`, `get_value()`,
    `create_record()` or relations methods. Asking it for data is a category
    error: it is layout, not storage. The `__get`/`__set` guard in `common`
    blocks the legacy `data` field outright.

## The JSON controller (`section_group_json.php`)

`common::get_json()` includes `section_group_json.php` inside the instance
scope. The controller is short and confirms the no-data contract:

1. Resolve `tipo`, `section_tipo` and `permissions`
   (`common::get_permissions($section_tipo, $tipo)`).
2. When `options->get_context === true` **and** `permissions > 0`, build either
   the simple or the full structure context (by `options->context_type`).
3. Set `add_label` on the context: `false` for the legacy `section_group_div`
   (an unlabelled `<div>` group), otherwise `true`. The client uses this to
   decide whether to render the collapsible label header.
4. `data` is initialised to `[]` and **never populated**.
5. Return `common::build_element_json_output($context, $data)`.

```php
// section_group_json.php (essence)
$data = []; // a grouper has no data, ever
return common::build_element_json_output($context, $data);
```

The file opens with the SEC-026 server-agnostic deny guard
(`if (!isset($this)) { http_response_code(404); exit; }`) shared by all JSON
controllers — reaching it through a URL means the web-server path block failed.

## Client side (`js/section_group.js`, `js/render_section_group.js`)

- **`section_group.js`** — the client object. It mixes in `common`'s `build`,
  `render` and `destroy`, and takes its `list`/`edit` renderers from
  `render_section_group`. `init()` copies identity and `context` off the options
  and sets `self.label = self.context.label`. Like the server class, it manages
  no data.
- **`render_section_group.js`** — `edit()` (and `list()`, which is an alias of
  `edit()`) builds:
  - a `wrapper` (`wrapper_section_group …`) whose `wrapper.content_data` is the
    placement target for child components;
  - a `content_data` div (initially `hide`, revealed once the persisted collapse
    state is read);
  - unless `context.add_label === false`, a collapsible label header wired with
    `ui.collapse_toggle_track`, persisting open/closed state under
    `section_group_<section_tipo>_<tipo>` in the local DB (table `status`).
- **`css/section_group.less`** — the group layout: inside `.section_record.edit`
  the `.content_data` is a CSS `grid` (collapsing to `block` below
  `@width_break_point_1`), and the label uses the shared `label_top()` mixin.

## How it fits with the rest of Dédalo

- It is one of the **grouper models** that [`section`](section.md) skips when
  collecting *data-bearing* children (`section::get_ar_grouper_models()` and
  `common::$groupers`), and descends into when building layout. A grouper is a
  node the children walk passes *through*.
- It produces a [context](../architecture_overview.md#the-datum-contract) with an
  empty `data` array — the clean illustration of the `{context, data}` contract
  where `context` (description) is everything and `data` (values) is nothing.
- It is the sibling of [`section_tab`](section_tab.md) / `tab` (tabbed groupers)
  and the canonical target of the legacy `section_group_div` model remap in
  `common::$ar_temp_map_models`.
- Its children are ordinary [components](../components/index.md) that point at it
  through `parent_grouper`; the section assembles their contexts and the client
  drops them into the grouper's `content_data`.

## Examples

### Server: a section build instances a grouper

```php
// inside the section's structure-context walk (common):
//   $model resolved from the ontology node, matched against common::$groupers
$grouper_model = ($model === 'section_group_div') ? 'section_group' : $model;
$grouper       = new $grouper_model($element_tipo, $section_tipo, $mode);

$context_item  = $grouper->get_structure_context($permissions);
// $context_item->add_label === false only for the legacy section_group_div
// the grouper contributes NO data items
```

### The emitted datum (no data)

```json
{
    "context": [
        {
            "tipo": "rsc76",
            "section_tipo": "rsc197",
            "model": "section_group",
            "label": "Identity",
            "add_label": true,
            "permissions": 2,
            "css": { ".wrapper_section_group": { "grid-column": "span 12" } }
        }
    ],
    "data": []
}
```

### Tools are always empty

```php
$grouper = new section_group('rsc76', 'rsc197', 'edit');
$grouper->get_tools(); // always [] — a grouper carries no tools
```

## Related

- [Sections concept](index.md) — what a section is and how its components hang
  under grouper nodes.
- [section](section.md) — the orchestrator that walks children and treats
  groupers as containers (`get_ar_grouper_models()`).
- [section_tab](section_tab.md) — the tabbed grouper sibling (same no-data
  contract).
- [Components](../components/index.md) — the data-bearing children placed inside
  a grouper via `parent_grouper`.
- [Architecture overview](../architecture_overview.md#the-areas-sections-components-data-hierarchy)
  — where groupers sit in the area → section → component → data tree.
- [Base classes](../components/base_classes.md) — what `common` gives every
  grouper.
