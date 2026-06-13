# component_input_text

## Overview

```json
{
    "could_be_translatable" : true,
    "is_literal"            : true,
    "is_related"            : false,
    "is_media"              : false,
    "modes"                 : ["edit","list","tm","search"],
    "default_tools" : [
        "tool_lang",
        "tool_lang_multi",
        "tool_propagate_component_data",
        "tool_time_machine"
    ],
    "render_views" :[
        {
            "view" : "default | line | text | mini",
            "mode" : "edit | list"
        },
        {
            "view" : "colorpicker | print",
            "mode" : "edit"
        },
        {
            "view" : "ip",
            "mode" : "list"
        }
    ],
    "data"        : "array of items",
    "sample_data" : [
        {"id": 1, "lang": "lg-eng", "value": "Raspa jumps"},
        {"id": 2, "lang": "lg-eng", "value": "Raspa purrs"}
    ],
    "value"        : "array of strings",
    "sample_value" : ["Raspa jumps", "Raspa purrs"]
}
```

!!! note "Typology"
    `component_input_text` is a **literal-direct** component. It owns and controls its own value format, persists its data directly through its section, and never resolves a [locator](../locator.md) to another section. In server context it extends `component_string_common` (the shared string base for `component_input_text`, `component_text_area` and `component_email`), which in turn extends `component_common`.

!!! info "About `default_tools`"
    The list above is what a **translatable** instance receives in `context.tools` (verified from the model sample). When the component is instantiated as non-translatable, `tool_lang` / `tool_lang_multi` are not added; when `with_lang_versions` is enabled the transliteration tooling is kept. The toolbar is assembled from the model + ontology, the component class does not hardcode it.

## Definition

`component_input_text` is the basic single-line text field of Dédalo. It manages short, plain strings without format: the value does not support (and is not rendered as) HTML markup. For rich text or multi-paragraph content use [component_text_area](component_text_area.md) instead; for e-mail addresses use [component_email](component_email.md), which shares the same string base but adds address validation.

**Why it exists.** Most descriptive fields in a cultural-heritage catalogue are short literal strings: a title, an inventory number, a person's name, a place name, a numismatic legend, a measurement note. `component_input_text` is the default building block for all of them. It is data-owning (literal), so it reads and saves its own value without depending on any other ontology node, and it is multilingual by default, so the same field can hold a Spanish, English and German version of a title.

**When to use it.**

- Free short text the cataloguer types directly: *Title*, *Object name*, *Alternative name*, *Inventory number*, *Author note*.
- Codes and identifiers that are literal strings rather than relations: *Signature*, *Old catalogue code*, numismatic *Legend* (`[Ac]` style bracketed text is accepted).
- Values that need light client-side input shaping (regex `validation`), duplicate detection across the section (`unique`), or a colour value (`colorpicker` view).

**When not to use it.**

- Long, formatted or multi-paragraph text, or content with embedded tags / time codes -> use [component_text_area](component_text_area.md).
- A value that points at another record (a person, a place, a thesaurus term) -> use a related component such as [component_portal](component_portal.md) or [component_select](component_select.md).
- Numbers that need numeric ordering / formatting -> use [component_number](component_number.md). Dates -> [component_date](component_date.md).

## Data model

**Data:** `array of items`. Each item is an object `{id, value, lang?}`.

**Value:** `array` of `strings`, or `null`.

**Storage shape.** A component never touches the database; it reads and writes through its section, which stores the component data in its matrix `data` column. For `component_input_text` the persisted value is an **array of value items**, one per data entry. `value` carries the literal string and `id` is the per-item counter id; `lang` is present on every item only when the component is translatable.

Translatable variant (one item per language version, ids paired across languages):

```json
[
    {"id": 1, "lang": "lg-eng", "value": "Raspa jumps"},
    {"id": 2, "lang": "lg-eng", "value": "Raspa purrs"},
    {"id": 1, "lang": "lg-spa", "value": "Raspa salta"},
    {"id": 2, "lang": "lg-spa", "value": "Raspa ronronea"}
]
```

When the component is instantiated, it only resolves the items for the language it was instantiated with (e.g. an instance in `lg-spa` exposes `Raspa salta` / `Raspa ronronea`). If that language is empty, `component_string_common::get_component_data_fallback()` walks the fallback hierarchy (main lang -> `lg-nolan` -> any other project lang) and the resolved values are surfaced as `data.fallback_value`.

Non-translatable variant (single language slot, `lg-nolan`):

```json
[
    {"id": 1, "lang": "lg-nolan", "value": "Augustus"}
]
```

Transliterated variant (`with_lang_versions: true`) — the main value lives in `lg-nolan` but other languages can be added through `tool_lang`:

```json
[
    {"id": 1, "lang": "lg-nolan", "value": "Augustus"},
    {"id": 1, "lang": "lg-spa",   "value": "Augusto"}
]
```

!!! note "Datum vs. API `entries`"
    The transmitted unit is a `{context, data}` datum (the JSON-API contract). `data` carries values only; in the API payload the value items are surfaced under `data.entries`, accompanied by `parent_tipo`, `parent_section_id`, `fallback_value` and (for transliterables) `transliterate_value`. `context` carries the description (`tipo`, `model`, `mode`, `lang`, `label`, `properties`, `permissions`, `tools`, `view`, `fields_separator`) and never the values. See the *dedalo-context-data-layers* skill for the full layering rules.

## Ontology instantiation

A `component_input_text` is created as an ontology node whose `model` is `component_input_text`. Its `parent` is the section (or grouper) it belongs to, and its `section_tipo` wires it into that section. The node also declares its label and translatability through the standard `lg-*` term + `is_translatable` ontology flags; the component reads them in `load_structure_data()` at construction.

Node definition (shape):

```json
{
    "tipo"         : "oh14",
    "model"        : "component_input_text",
    "parent"       : "oh1",
    "section_tipo" : "oh1",
    "lg-eng"       : "Title",
    "lg-spa"       : "Título",
    "translatable" : true,
    "properties"   : { }
}
```

Realistic `properties` block for a mandatory, single-value title field with a colour swatch sibling and a default value:

```json
{
    "mandatory"     : true,
    "dato_default"  : [{"value": "Untitled"}],
    "css" : {
        ".wrapper_component": { "grid-column": "span 6" }
    }
}
```

`section_tipo` / `parent` tell the section which column owns this component's data; on `save()` the component resolves `get_my_section_record()` and hands a `save_path` (its data column + the `meta` counter, plus `relation_search` when autocomplete is involved) to `section_record->save_component_data()`. The section is the single writer to the database.

In `edit` mode, if the stored data is empty and `properties->dato_default` is present, `set_data_default()` seeds the value (a literal array, or the result of `dato_default->method` when a method name is given). Defaults are only written for users with write permission (level >= 2).

## Properties & options

All properties are optional and live in the ontology node `properties` JSON. Verified names consumed by this component:

### with_lang_versions

- **Values:** `true` | `false` (default `false`).
- **Effect:** turns an otherwise non-translatable instance into a *transliterable* one. The main value stays in `lg-nolan`, but the component keeps `tool_lang` so other languages can be added (e.g. a personal name transliterated to other scripts). The render layer shows the transliteration in parentheses in list view and as a `transliterate_value` line in edit view, and it is the flag that lets exports emit all language versions in JSON.

### unique

- **Values:** `true` | `false` (default `false`).
- **Effect:** on input the client calls `find_equal()` — a search over the same `section_tipo` excluding the current record — and, if a duplicate value is found, shows an inline alert with a link to the matching record. It is a soft warning (cached, debounced, re-checked on activation), not a hard save block.

### mandatory

- **Values:** `true` | `false` (default `false`).
- **Effect:** informs the user the field requires a value. An empty mandatory input gets a `mandatory` CSS class (highlighted); the class is toggled live as the user types. It is a UI signal, not a server-enforced constraint.

### validation

- **Values:** an object `{mode, regex, options, replace, process}`. Currently the only implemented `mode` is `"replace"`.
- **Effect:** client-side input shaping. On change, `validate()` builds `new RegExp(regex, options)` and runs `value.replace(regex, replace)`; an optional `process` names a String method to apply afterwards (e.g. `"toLowerCase"`). Used to strip or normalise characters as the user types.

```json
{
    "validation": {
        "mode"    : "replace",
        "regex"   : "[\\d\\s]",
        "options" : "g",
        "replace" : "",
        "process" : "toLowerCase"
    }
}
```

### records_separator

- **Values:** string (default `" | "`, from `component_string_common::$default_records_separator`).
- **Effect:** the string used to join multiple value items when the component is flattened to a single string for grid display and flat-table export (`get_export_value` uses it as the leaf segment separator for flat-output parity).

### dato_default

- **Values:** an array of value items (e.g. `[{"value": "Untitled"}]`), or `{"method": "<method_name>"}` to compute the default.
- **Effect:** seeds the value in `edit` mode when the stored data is empty and the user has write permission. Handled by the shared `component_common::set_data_default()`.

### has_dataframe

- **Values:** `true` | `false` (default `false`).
- **Effect:** marks the component as paired with a [component_dataframe](component_dataframe.md). When set, the JSON controller adds the RQO to the context and builds the dataframe subdatum; the edit/list views attach the dataframe control per value item via the shared `attach_item_dataframe()` glue. See the *dedalo-dataframe* skill.

### multi_line *(deprecated)*

- **Values:** `true` | `false` (default `false`).
- **Effect:** when `true`, the edit view renders a `<textarea>` instead of an `<input>`. **Deprecated** — use [component_text_area](component_text_area.md) for multi-line content instead.

!!! note "Standard context properties"
    Like every component, `component_input_text` also honours the generic ontology context blocks carried into the datum `context`: `css` (style stamped on `.wrapper_component`), `request_config` (RQO) and `view` (the render view to use). These are not component-specific options. Any other custom key seen in production should be verified in the ontology.

## Render views & modes

Views are selected from `context.view` (default `default`) and dispatched by the per-mode render files. Verified from the source:

| View | edit | list / tm | search | Notes |
| --- | :---: | :---: | :---: | --- |
| `default` | yes | yes | (via search render) | Full wrapper: label, buttons, `content_data` with one `content_value` per item; one empty input is always forced for new entries. |
| `line` | yes | — | — | Same as default but without label (compact inline). |
| `text` | yes | yes | — | Plain `<span>` with the joined value, no chrome. |
| `mini` | yes | yes | — | Minimal `<span class="component_input_text_mini">`, used by service autocomplete. |
| `colorpicker` | yes | — | — | Pairs the text input with a native `<input type="color">`; the swatch and field stay in sync. |
| `print` | yes | — | — | Reuses the `default` view but forces read-only rendering (`permissions=1`) and tags the wrapper with `view_print`. |
| `ip` | — | yes | — | Renders the value as an IP and asynchronously resolves a country-flag link (uses the `IP_API` config). |

Modes:

- **edit** — read/write a real record; applies `dato_default`, supports add/remove of items, `unique` and `mandatory` UI, transliteration.
- **list / tm** — read-only listing; `tm` (Time Machine) reuses the list render. `get_list_value()` adds one special case: in `tm` mode, on the users section, the root user (`section_id = -1`) resolves to `Root`.
- **search** — builds an SQO filter input; one text input per filter, with a language-behaviour checkbox for translatable components, and the `ontology7` TLD-split special case (a pasted/typed `rsc170` splits into `rsc` + `170`). Saves are blocked in search mode.

DOM (edit / default): `wrapper_component component_input_text <tipo> <mode>` -> `label`, `buttons`, `content_data` -> one or more `content_value` -> `input.input_value`.

## Import / export model

**Import.** The default import format is the multi-language JSON object (lang keys -> array of strings). `conform_import_data()` accepts:

```json
{
    "lg-spa" : ["mi dato para importar", "Otro dato"],
    "lg-eng" : ["my import data", "Other data to import"]
}
```

It also accepts a v7 item array (`[{"value":"x"}]`), a single object item (`{"value":"x"}` — wrapped automatically), and a plain string. Plain strings are wrapped into `[{"value": "..."}]`; values that look like malformed JSON (begin with `["` or end with `"]`) are rejected and logged as `IGNORED: malformed data` rather than stored. Bracketed literals such as `[Ac]` are accepted as plain text. See [importing data](../importing_data.md#plain-text).

**Export.** `get_export_value()` emits one export atom per value item in the current language; when the current language is empty it emits the fallback items flagged `is_fallback`. The leaf segment's `fields_separator` is set to the resolved `records_separator` so multiple items are joined consistently with the legacy grid output (flat-table parity). Object-valued items are JSON-encoded defensively. See [exporting data](../exporting_data.md).

## Notes

- **Observers / observables.** `events_subscription.js` ships with no active subscriptions for this component (the handlers are commented-out examples). Observer/observable wiring, when needed, is configured in the ontology `properties` like any other component (see the index page *Observers and observables* section), not in the component code.
- **Default tools.** A translatable instance exposes `tool_lang`, `tool_lang_multi`, `tool_propagate_component_data` and `tool_time_machine` in `context.tools`; the set narrows for non-translatable instances. Tools are read-only context.
- **Security.** Saves are refused in `search` / `tm` modes and short-circuited when `save_to_database === false`. The string base provides `sanitize_text()` (SEC-034 denylist hardening) used by string components for stored-XSS defence in depth; `component_input_text` stores plain strings and is not rendered as HTML.
- **Permissions.** Resolved via `get_component_permissions()` (0 none / 1 read / 2 read+write / 3 admin). Read users (level 1) get the read-only `content_value`; defaults and saves require level >= 2.
- **Related components:** [component_text_area](component_text_area.md), [component_email](component_email.md), [component_number](component_number.md), [component_date](component_date.md), [component_iri](component_iri.md), [component_dataframe](component_dataframe.md), [component_select](component_select.md), [component_portal](component_portal.md).
