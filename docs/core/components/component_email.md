# component_email

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_time_machine",
        "tool_replace_component_data",
        "tool_add_component_data"
    ],
    "render_views" :[
        {
            "view"    : "default | mini",
            "mode"    : "edit | list"
        },
        {
            "view"    : "line | print",
            "mode"    : "edit"
        },
        {
            "view"    : "text",
            "mode"    : "list"
        }
    ],
    "data": "object",
    "sample_data": {
        "lg-nolan": [{"id":1,"lang":"lg-nolan","value":"my_email@dedalo.dev"}]
    },
    "value": "array of strings",
    "sample_value": ["my_email@dedalo.dev", "other@dedalo.dev"]
}
```

!!! note "Typology and base class"
    `component_email` is a **literal-direct** component. In the server it does **not** extend `component_common` directly: it extends [`component_string_common`](base_classes.md) (the shared base for `component_input_text`, `component_text_area` and `component_email`), which in turn extends `component_common`. The string base provides the empty-value detection, fallback resolution and string search traits; `component_email` adds e-mail validation, cleaning and the mailto helpers on top.

## Definition

`component_email` manages one or more **e-mail addresses** as plain strings, with format validation on both the client and the server. It is a literal-direct component: it owns and stores its own value, never a locator to another section.

It exists so that addresses are not stored as free `component_input_text`, where nothing guarantees a well-formed `local-part@domain.tld`. By concentrating the address handling in a dedicated model, Dédalo can:

- validate the format before saving (rejecting malformed input);
- clean / normalize the raw string against header-injection payloads;
- offer "write e-mail" affordances (single `mailto:` and a batch BCC `mailto:` over a whole list of records).

E-mail addresses are inherently language-neutral, so the component is **non-translatable**: it always works under `DEDALO_DATA_NOLAN` (the constructor forces `lang = DEDALO_DATA_NOLAN`).

**When to use it.** Any cultural-heritage record that needs a contact address: the e-mail of a museum or archive (institution section), the contact of a project's principal investigator, a donor's or a lender's address, the maintainer of a digital collection.

**When not to use it.** Do not use it for a generic web address or a contact form URL (use `component_external` / a URL component), nor for a person you want to *link to* as a related record (use `component_portal` / a relation component and put the e-mail on the linked person's record). It is not a rich-text field — use [component_text_area](component_text_area.md) for formatted notes and [component_input_text](component_input_text.md) for free single-line text.

## Data model

**Data:** `object` keyed by language (always `lg-nolan` for this component), whose value is an array of data items.

**Value:** `array` of `strings`, or `null`.

Each data item is an object `{id, lang, value}` where `value` is the e-mail string, `lang` is always `lg-nolan`, and `id` is the per-item counter assigned by `component_common`. `set_data()` normalizes input: bare scalars are wrapped into `{value, lang:'lg-nolan'}`, every value is passed through `component_email::clean_email()`, and empty arrays/`[null]`/`['']` collapse to `null`.

**Storage shape** inside the matrix `data` column (language-keyed object, value as array of items):

```json
{
    "lg-nolan": [
        {"id": 1, "lang": "lg-nolan", "value": "raspa@dedalo.dev"},
        {"id": 2, "lang": "lg-nolan", "value": "other@other.org"}
    ]
}
```

Because the component is non-translatable, there is a single language group, `lg-nolan`; there is no per-language variant and no transliteration. When the component is instantiated it reads its data from the section and resolves only the `lg-nolan` group.

### Validation

The string `value` must be a well-formed address: a *local-part*, the `@` symbol, and a *domain* with at least one dot before a top-level label.

- **Server** (`class.component_email.php`): `save()` rejects the write if any non-empty value fails `is_valid_email()`, which combines `filter_var($email, FILTER_VALIDATE_EMAIL)` with the extra `/@.+\./` check (the address must contain a dot in the domain). `clean_email()` strips control characters, quotes and CR/LF sequences (`\n`, `\r`, `%0A`, `%0D`, ...) and trims the rest, as a defence against header injection.
- **Client** (`component_email.js` `verify_email()`): validates with the regex `/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i`. The `{2,}` TLD quantifier accepts long modern TLDs (`.museum`, `.travel`). When several addresses are present **all** must validate. An empty value is allowed (so the user can clear the field).

!!! note "Local-part and domain rules"
    The local-part may use the ASCII letters `a–z`, digits `0–9`, the special characters `!#$%&'*+-/=?^_{|}~` and a dot `.` (not first/last, not consecutive). The domain must be a dot-separated list of DNS labels (letters, digits, and `-` not first/last), each up to 63 characters; the TLD must not be all-numeric.

## Ontology instantiation

To define an e-mail field, create an ontology node with `model: "component_email"` whose parent is the target section (or a section grouper). The `lg-*` localized labels carry the human name of the field. A minimal node:

```json
{
    "tipo"   : "tch442",
    "model"  : "component_email",
    "parent" : "tch1",
    "lg-eng" : "Contact e-mail",
    "lg-spa" : "Correo de contacto"
}
```

The `section_tipo` is the section the component lives in; it is resolved from the node's `parent` chain and is **mandatory** at instantiation (auto-resolution was removed — an empty `section_tipo` returns `null`). Wiring the node as a child (directly or through a grouper) of section `tch1` is what makes the field appear in that section's edit form.

A realistic `properties` block for this component (all keys optional):

```json
{
    "mandatory": true,
    "has_dataframe": false
}
```

Because the component is non-translatable, the instantiated `context` reports `"translatable": false` and `"lang": "lg-nolan"` regardless of the user interface language. A representative instantiation context (from `core/component_email/samples/context.json`):

```json
{
    "model"        : "component_email",
    "tipo"         : "test208",
    "section_tipo" : "test3",
    "parent"       : "test3",
    "lang"         : "lg-nolan",
    "mode"         : "edit",
    "translatable" : false,
    "properties"   : {},
    "permissions"  : 2,
    "sortable"     : true,
    "type"         : "component",
    "view"         : "default"
}
```

## Properties & options

| Property | Values | Default | Effect |
| --- | --- | --- | --- |
| `mandatory` | `true` \| `false` | `false` | Read in `render_edit_component_email.js`. When `true` and the field is empty, the input is rendered with the `mandatory` CSS class to flag to the user that a value is required. |
| `has_dataframe` | `true` \| `false` | `false` | Read in `component_email_json.php`. When `true` the controller builds the dataframe subdatum (uncertainty / qualifier frame records paired with each item via the shared dataframe contract) and ships the extra dataframe DDO context to the client. See [component_dataframe](component_dataframe.md). |

!!! warning "`multi_line` does not apply"
    Unlike [component_input_text](component_input_text.md), `component_email` does **not** read a `multi_line` property — there is no reference to it anywhere in the component. Multiple addresses are handled by adding rows (one item per address), not by switching to a textarea. For multi-line free text use [component_text_area](component_text_area.md).

!!! note "Other ontology keys"
    `css` and `request_config` (search configuration) flow from the ontology node into the datum `context` like any other component. Observer/observable wiring, if needed, is configured in `properties` as documented in the [components index](index.md#observers-and-observables). Any other key not listed above is not consumed by this component — verify in the ontology before relying on it.

## Render views & modes

Modes: `edit`, `list`, `tm`, `search` (`tm` reuses the `list` renderer).

| View | Modes | File | Notes |
| --- | --- | --- | --- |
| `default` | edit, list | `view_default_edit_email.js`, `view_default_list_email.js` | Edit: one `input` per address inside `content_data`, with per-row **email** button (single `mailto:`) and a **remove** button on rows after the first; the toolbar carries an **add** button and the **email_multiple** batch button. List: addresses joined by `fields_separator`, click opens edit-in-list as a modal. |
| `mini` | edit, list | `view_mini_email.js` | Compact value-only wrapper (shared between edit and list). |
| `line` | edit | `view_line_edit_email.js` | Inline single-line edit; hides the row buttons, appends an *exit edit* button. |
| `print` | edit | (handled in `render_edit_component_email.js`) | Forces `permissions = 1` and falls through to the `default` renderer, so values render as read-only nodes. |
| `text` | list | `view_text_list_email.js` | Plain `span`, addresses joined by `fields_separator`; no DOM controls. Used for exports / flat-table text rendering. |
| `default` (search) | search | `render_search_component_email.js` | Renders a `q_operator` input plus one value input per filter entry; changes publish `change_search_element`. |

## Import / export model

The canonical v7 import is an array of value objects (no language key, since the component is non-translatable):

```json
[{"value":"user@example.com"},{"value":"admin@example.com"}]
```

`conform_import_data()` accepts several shapes:

- **JSON array of value objects** (canonical) — `[{"value":"..."}]`; bare strings inside the array are auto-wrapped into `{"value":...}`.
- **Single value object** — `{"value":"user@example.com"}` (wrapped into an array).
- **Lang-keyed object** (legacy raw export) — `{"lg-nolan":["user@example.com"]}`; the first language group is extracted and normalized into v7 items.
- **Plain string** — `user@example.com`.
- **Pipe-separated string** — multiple addresses with the fixed ` | ` separator (space-pipe-space), e.g. `user@example.com | admin@example.com`, split into one item each. The separator is not configurable; an address containing a literal ` | ` must be imported via the JSON array form.

See the dedicated import section [Email](../importing_data.md#email) and the general [importing data](../importing_data.md) reference. For export formats (value / grid_value / `dedalo_raw`) see [exporting data](../exporting_data.md); the `dedalo_raw` round-trip re-imports cleanly through the lang-keyed branch above.

## Notes

- **Default tools.** `tool_time_machine`, `tool_replace_component_data`, `tool_add_component_data` (plus `tool_propagate_component_data` when configured). Tools and nested buttons arrive read-only in the `context` toolbar.
- **Mailto helpers.** The single-address **email** button calls `send_email(value)` → `window.location.href = 'mailto:' + value`. The toolbar **email_multiple** button calls `get_ar_emails()`, which re-runs the builder's (section or portal) search restricted to this component to gather every address across the result set, joins them with `;`, and opens a BCC `mailto:?bcc=...`. On Windows the URL is chunked under a ~2000-character limit; when more than one chunk is needed a modal offers one button per chunk.
- **Validation gotcha.** A save with an invalid address is silently refused server-side (`save()` returns `false` after a `logger::ERROR`). Always rely on the client `verify_email()` to surface the error to the user; the server check is the authoritative backstop.
- **Non-translatable by design.** The constructor pins `lang` to `DEDALO_DATA_NOLAN`; do not expect `tool_lang` or per-language variants. This differs from [component_input_text](component_input_text.md), which can be translatable or transliterated.
- **Related components.** [component_input_text](component_input_text.md) (sibling string component, free text), [component_text_area](component_text_area.md) (multi-line / rich text), [component_dataframe](component_dataframe.md) (frame records when `has_dataframe` is set). See the [components index](index.md) for the full literal/related typology.

