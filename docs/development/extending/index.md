# Extending Dédalo

> How to add new capabilities to Dédalo v7 — and how to recognise that most
> "new" work is **ontology authoring**, not code.

> See also: [Ontology authoring](../../core/ontology/authoring.md) ·
> [Component base classes](../../core/components/base_classes.md) ·
> [Sections](../../core/sections/index.md) ·
> [Areas](../../core/areas/index.md) · [Creating new tools](../tools/creating_tools.md)

This is the **overview** for extending Dédalo. It explains the one principle
that governs every extension — *ontology-first* — gives you a decision guide for
when you need code at all, and links to the per-typology cookbooks. Each
cookbook is a focused step-by-step procedure; this page tells you *which* one you
need and *why*.

## The ontology-first principle

In Dédalo **there is no schema file and no model registry to edit.** The
[ontology](../../core/ontology/authoring.md) *is* the schema, and the schema is
data you author in the back office. A new record type, a new field on an
existing section, a new menu area that reuses existing field models, a portal
wired to a target section — all of these are created by adding or editing
**ontology nodes**, never by writing PHP or SQL.

This works because the framework is **convention-driven**, not
registration-driven:

- **Server resolution is the directory name.** The autoloader
  (`core/base/class.loader.php::loader()`) maps a model name `X` to
  `DEDALO_CORE_PATH/X/class.X.php` by pure convention (names are gated by a
  SEC-048 allowlist regex plus a realpath-containment check). There is no array
  to register a new class in.
- **The node carries the `model`.** Each ontology node stores a `model` value
  (`section`, `component_input_text`, `area_admin`, `tool_export`, …). The
  runtime reads it via `ontology_node::get_model_by_tipo($tipo)`, surfaces it to
  PHP as `common::get_model()` / `load_structure_data()`, and to the client as
  `options.model` / `self.model`.
- **Client resolution is by prefix.** `core/common/js/instances.js` dynamically
  imports the ES module for a model by prefix: `service_*` →
  `core/services/<model>/js/<model>.js`, `tool_*` → the tools root, default →
  `core/<model>/js/<model>.js`. The named export inside must equal the model
  exactly (`export const component_email = function(){…}`).

So the default for *most* extension tasks is: **author a node, regenerate, done.**
Code only enters the picture when you need a *new kind of behaviour* that no
existing model provides.

## When do you need this? (ontology-only vs code)

Decide with one question: **does an existing model already do what I need?**

| You want to… | Existing model exists? | What you do |
| --- | --- | --- |
| Add a record type (a "table") | Yes — `section` | **Ontology only.** Author a `section` node + child component nodes. |
| Add a field to a section (text, number, date, picker, image, …) | Yes — `component_*` | **Ontology only.** Author a `component_<type>` node under the section. |
| Group/lay out fields (tabs, groups) | Yes — `section_tab`, `section_group`, … | **Ontology only.** Author grouper nodes (they store no data). |
| Add a back-office area that reuses existing fields | Often — a thin `area_*` plus menu nodes | **Mostly ontology**, optionally a thin PHP subclass. |
| Add a *new field type* with its own value shape, render and validation | **No** | **Code:** new `component_<X>` (PHP + JS + CSS + the `$column_map` entry) **and** an ontology node. |
| Add a reusable client interaction (uploader, picker UI) hosted by a component | **No** | **Code:** new `service_<X>` (mostly JS), consumed by a host component. |
| Add a computed read-only display embedded in a host | **No** | **Code:** new widget under `core/widgets/<X>/`, hosted by a component/area. |
| Add an isolated block of UI/logic attached to a section/component/area | **No** | A **tool** — see its own guide: [Creating new tools](../tools/creating_tools.md). |

The rule of thumb: **new sections, fields, groupers and most areas are
ontology-only.** You write code only for a genuinely new **component model**,
**service**, or **widget** — and tools have their own dedicated path.

!!! tip "Reuse before you build"
    Before authoring a new component model, check the
    [components index](../../core/components/index.md): Dédalo ships text,
    number, date, email, IRI, JSON, geolocation, the media family (image, av,
    3d, pdf, svg), and the relation family (select, check_box, radio_button,
    portal, dataframe, parent/children, …). A new model is rarely the answer.

## File-layout conventions

Every code-bearing extension follows the same shape, because the autoloader and
the client mirror both resolve by directory name:

```text
core/<model>/                       # or core/services/<model>/, core/widgets/<model>/, tools/<tool>/
├── class.<model>.php               # server class (extends the right base)
├── <model>_json.php                # JSON API controller (components/widgets that expose data)
├── js/
│   ├── <model>.js                  # client class; named export === <model>
│   ├── render_edit_<model>.js      # per-mode render dispatchers
│   └── view_*.js                   # the actual DOM builders
├── css/<model>.less                # compiled to css
└── img/icon.svg                    # where an icon is needed
```

There is **one** place that is not pure convention: a new **component** must
register its storage column in
`core/section_record/class.section_record_data.php::$column_map`
(`'component_X' => 'string'|'relation'|'media'|'number'|'date'|'geo'|'iri'|'misc'`).
Without it `get_column_name()` returns `null` and DB reads/writes break. Nothing
else needs a central edit.

A real **scaffolder + template** exists **only for tools**
(`tools/tool_dev_template/` + `tools/tool_common/cli/create_tool.php`). For
components, sections, areas, services and widgets there is no generator: you
**copy an existing sibling directory, rename every occurrence**, and add the
ontology node (plus the `$column_map` entry for components). The ontology JSON
templates at `core/ontology/templates/` (`main_section_data.json`,
`area_grouper_data.json`, `virtual_section_data.json`) are node-shape
references, not generators.

## Step-by-step (the universal checklist)

Whatever you extend, the procedure is the same skeleton — the cookbooks fill in
the specifics:

1. **Confirm you need code.** Run the table above. If an existing model fits,
   stop here and author the ontology node (steps 5–6 only).
2. **Pick the base class** (code paths only). For a component this is the most
   important decision — see [base classes](../../core/components/base_classes.md)
   and its decision guide. For an area it is `area_common`; for a service the
   relevant `*_common`; for a widget `widget_common`.
3. **Create the directory by copying a sibling** and rename every occurrence
   (directory, `class.*.php`, the class name, the JS named export,
   `register.json` for tools). The autoloader will find it by name — no include
   edit.
4. **Implement the halves.** Server class (override only what differs), the
   `*_json.php` controller if the thing exposes data (open with the SEC-026
   guard `if (!isset($this)) { http_response_code(404); exit; }`), and the client
   `js/` + `css/`. For a **component only**, add the
   `$column_map` entry (step in the file-layout note above).
5. **Author the ontology node** with the right `model` value, `parent`,
   `term`/`lg-*` label, `order_number`, and any `properties` /`relations`. See
   [Ontology authoring](../../core/ontology/authoring.md).
6. **Wire it into the tree.** Sections need a `matrix_table` term; areas need a
   `menu` entry; components are children of their section; services/widgets are
   hosted (rendered inline) by a component or area rather than placed as a data
   node.
7. **Regenerate and clear caches.** An ontology edit is not live until you
   regenerate (`tools/tool_ontology_parser`) and the per-worker static caches
   are cleared (`common::clear()`). See
   [How changes apply live](../../core/ontology/authoring.md#how-changes-apply-live).
8. **Add samples and a test** (optional but recommended) under `samples/` and
   `test/server/`.

## Worked example — add a field, two ways

**You want a "Wikidata QID" field on the Objects section.** Two scenarios show
the ontology-only / code split.

### Scenario A — reuse an existing model (ontology only, no code)

A QID is just a short string. Reuse [`component_input_text`](../../core/components/component_input_text.md):

1. In the [Ontology area](../../core/ontology/authoring.md), open the Objects
   section node (e.g. `tch1`) and create a child record.
2. Set `model = component_input_text`, `parent = tch1`, the term
   `{ "lg-eng": "Wikidata QID" }`, an `order_number`, and `translatable = no`.
3. Regenerate the TLD and clear caches.

The field now reads, writes, searches and exports — **zero lines of PHP or JS**,
because `component_input_text` already provides all of it and its column is
already in `$column_map` (`'component_input_text' => 'string'`).

### Scenario B — a genuinely new model (code)

Suppose instead you need a **validated** QID field (must match `^Q[0-9]+$`, links
out to wikidata.org). No existing model validates that, so you create
`component_qid`, mirroring [`component_email`](../../core/components/component_email.md)
(which is a literal-direct string with its own validators):

1. `core/component_qid/class.component_qid.php` —
   `class component_qid extends component_string_common` (it stores its own
   literal string, so the string base is right; see the
   [decision guide](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend)).
   Override only what differs (a validator, `set_data`/`save` if needed) —
   `component_email` even pins `DEDALO_DATA_NOLAN` in its constructor as a model
   for "non-translatable literal".
2. `core/component_qid/component_qid_json.php` — the controller, opened with the
   SEC-026 guard, building `{context, data}` like email's.
3. **`core/section_record/class.section_record_data.php::$column_map`** — add
   `'component_qid' => 'string'`.
4. `core/component_qid/js/component_qid.js` (named export `component_qid`) plus
   `render_edit_component_qid.js` and the `view_*` DOM builders, mirroring
   email's set; `core/component_qid/css/component_qid.less`.
5. Author the ontology node with `model = component_qid` under the Objects
   section, then regenerate.

Then *every* future "QID field" anywhere is Scenario A again — author a node, no
code.

## Common pitfalls

- **Forgetting the `$column_map` entry.** A new component class loads fine but
  silently fails to read/write because `get_column_name()` returns `null`. This
  is the single non-convention edit — do not skip it.
- **Mismatched client export name.** `instances.js` imports
  `core/<model>/js/<model>.js` and expects `export const <model> = …`. If the
  export name ≠ the model, the client import fails.
- **`new`-ing a component or area.** Always go through the factory
  (`component_common::get_instance()`, `area_common::get_instance()`,
  `widget_common::get_instance()`). Direct construction skips
  `load_structure_data()`, caching, defaults and translatability.
- **Skipping regenerate / cache clear.** Editing the ontology record updates the
  *editable* layer only; the runtime reads the compiled `dd_ontology` table. Until
  you regenerate **and** clear the per-worker caches, a long-lived worker keeps
  serving the old definition (see
  [How changes apply live](../../core/ontology/authoring.md#how-changes-apply-live)).
- **Subclassing when you do not need to.** A section almost never needs a PHP
  subclass — the generic `core/section/class.section.php` handles it. Areas are
  usually thin: `area_admin` is literally
  `class area_admin extends area_common {}`. Add a subclass only for genuinely
  bespoke server logic.
- **Picking the wrong component base.** Re-implementing datum load/save,
  permissions or search means you chose the wrong parent. Walk the
  [decision guide](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend)
  top-down and stop at the first match.
- **Treating a widget like a top-level model.** Widgets resolve through
  `widget_common::get_instance()` (which includes by the explicit
  `core/widgets/<name>/` path), **not** the bare autoloader convention. A new
  widget must go through that factory and be hosted by a component/area.

## Related

- Per-typology cookbooks (the step-by-step procedures):
    - [Add a component](add_a_component.md) — a new field model (PHP + JS + CSS + `$column_map`)
    - [Add a section](add_a_section.md) — a new record type (mostly ontology)
    - [Add an area](add_an_area.md) — a new back-office area (thin subclass + menu)
    - [Add a service](add_a_service.md) — a reusable client interaction hosted by a component
    - [Add a widget](add_a_widget.md) — a computed display embedded in a host
- [Creating new tools](../tools/creating_tools.md) — tools have their own
  scaffolder and registration flow.
- Reference docs:
    - [Component base classes](../../core/components/base_classes.md) — the
      inheritance chain and the base-class decision guide.
    - [Sections](../../core/sections/index.md) — what a section is and how it is
      defined.
    - [Areas](../../core/areas/index.md) — the area inheritance model and every
      `area_*` class.
    - [Ontology authoring](../../core/ontology/authoring.md) — the node shape,
      `properties` grammar, and the regenerate/cache-clear lifecycle.
