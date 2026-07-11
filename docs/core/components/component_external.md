# component_external

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [],
    "render_views" :[
        {
            "view"    : "default | line | mini | print",
            "mode"    : "edit"
        },
        {
            "view"    : "default | line | text | mini",
            "mode"    : "list"
        }
    ],
    "data": "object",
    "sample_data": {
        "entries": ["Santa María de Ripoll : informe sobre las obras realizadas en la basílica"]
    },
    "value": "array of strings",
    "sample_value": ["Santa María de Ripoll : informe sobre las obras realizadas en la basílica"]
}
```

!!! note "Live, read-only value"
    `component_external` is a literal-direct component, but it is special: its
    value is not authored by the user. The displayed value is fetched
    on-demand from a configured external API every time the component loads
    its data (`get_data()` calls `load_data_from_remote()`). There is no edit
    input — the `edit` view renders the resolved remote text read-only.

!!! warning "TS gap: the remote fetch itself is not ported"
    Only half of this component's server behaviour has a confirmed TS port. The **request_config plumbing** — attaching the target section's `api_config` to a non-`dedalo` (`api_engine`) config item so the client/engine know an external source is in play — is done: `resolveExternalConfig()` in `src/core/relations/request_config/external.ts` (PHP reference in its own header comment: `class.component_external.php:110 load_data_from_remote`), exercised in the corpus gate (`rewrite/STATUS.md`: "the component_external remote-fetch proxy (config attach done; the HTTP proxy is unused by the corpus install)"). The actual **read-time HTTP call to the remote API** (ZENON-style `load_data_from_remote()` / entity classes / SSRF guard) has no confirmed TS port in this checkout. Separately, `src/core/components/component_external/descriptor.ts` currently registers this model with `resolveData: portalResolver` and a `column: 'relation'` (i.e. it is dispatched through the relation-locator family), which does not match the PHP model documented on this page (a literal `misc`-column component with no stored locators) — treat that descriptor as a placeholder/coverage gap, not as the intended final TS shape, until the remote-proxy read path is implemented.

## Definition

`component_external` retrieves and displays data from a **remote external API**
and integrates it into a Dédalo section as if it were a normal literal field.
It exists for the common cultural-heritage scenario where the authoritative
record lives in a third-party catalogue and Dédalo must surface selected fields
of that record without copying (and then having to re-synchronise) the data
locally.

The reference implementation targets **DAINST ZENON** (the German
Archaeological Institute's bibliographic catalogue,
`https://zenon.dainst.org/api/v1/record`), where a Dédalo bibliography section
holds only the ZENON record identifier and each `component_external` field
(Title, Authors, Publication dates, Physical description, …) is resolved live
from the ZENON API.

**Use it when:**

- The canonical data lives in an external system (library catalogue, museum
  database, authority file) and should be displayed but not stored/edited in
  Dédalo.
- You want each external field to behave like a separate column in list and
  search views (so it can be shown in grids, used as a list label, etc.).
- The remote system exposes a per-record HTTP/JSON endpoint that can be keyed
  by the Dédalo `section_id`.

**Do not use it when:**

- The user must edit or own the value locally — use
  [component_input_text](component_input_text.md) or
  [component_text_area](component_text_area.md).
- You only need to *link* to another Dédalo section — use a relation component
  such as [component_portal](component_portal.md).
- The remote source is unreliable and you need data to persist offline:
  external values are recomputed on every load and the component goes dark when
  the entity is unavailable (see Notes).

## Data model

**Data:** `object`. The client/data layer carries the resolved value under an
`entries` array (the JSON-API data item). Each entry is a plain string already
formatted by the server.

**Value:** `array` of `strings`, or `null`.

**Storage:** `component_external` belongs to the `misc` matrix data-type
column (the configuration/miscellaneous column, shared with
`component_filter_records`, `component_info`, etc.). The component does **not**
persist the remote payload: the authored value of a real record (for example
the ZENON identifier) lives elsewhere in the section, and the external value is
derived live. As a literal-direct component it transmits its data through the
standard `{context, data}` datum.

Data item produced by `get_data_item()` (`mode: list`):

```json
{
    "section_id"          : "001338683",
    "section_tipo"        : "zenon1",
    "tipo"                : "zenon4",
    "mode"                : "list",
    "lang"                : "lg-nolan",
    "from_component_tipo" : "rsc368",
    "entries"             : [
        "Santa María de Ripoll : informe sobre las obras realizadas en la basílica"
    ]
}
```

The component is **non-translatable** (`translatable: false`); the lang is
forced to `lg-nolan`. The requested remote language is derived from
`DEDALO_DATA_LANG` and mapped to a two-letter code by the entity class (for
ZENON, `lgn=en` etc.).

`set_data(?array $data)` only sanitises: every entry is coerced to a string
(`to_string()`) before delegating to `component_common::set_data()`. Because the
value is normally re-derived from the API on load, persisting is rarely
meaningful for this component.

### How the value is resolved

1. `load_data_from_remote()` reads the **section** ontology node properties
   (`section_properties->api_config`) for `entity`, `api_url` and
   `response_map`.
2. It collects the `remote` field names declared by sibling components
   (`properties->fields_map` whose `local === 'dato'`).
3. The entity class (`core/component_external/entities/class.<entity>.php`,
   e.g. `class.zenon.php`) builds the per-record URL via the static
   `build_row_request_url()`.
4. The URL is validated by `is_safe_remote_url()` (SEC-075 SSRF confinement),
   then fetched with `curl_request()` (4s timeout, no headers).
5. `get_data()` extracts this component's own field from the row using its own
   `fields_map` `dato` entry and applies the optional `format` transform.

Sample remote row (ZENON `records[0]`) the component reads from:

```json
{
    "id": "000848571",
    "title": "Las acuñaciones provinciales romanas de Hispania",
    "authors": {
        "primary": { "Ripollès Alegre, P. P. (Pere Pau)": [] },
        "secondary": [],
        "corporate": []
    },
    "publicationDates": ["2010"],
    "recordPage": "/Record/000848571",
    "physicalDescriptions": ["328 p. : ill. ; 29 cm."]
}
```

## Ontology instantiation

`component_external` is wired in two layers: the **section** node carries the
connection (`api_config`), and each external **component** node maps one remote
field.

Component node (one per external field, e.g. *Title* `zenon4`):

```json
{
    "tipo"      : "zenon4",
    "model"     : "component_external",
    "parent"    : "zenon2",
    "lg-eng"    : "Title"
}
```

Its `properties` declare which remote field this component reads and how to
format it:

```json
{
    "fields_map": [
        {
            "local"  : "dato",
            "remote" : "title"
        }
    ]
}
```

An *Authors* field using a format transform:

```json
{
    "fields_map": [
        {
            "local"  : "dato",
            "remote" : "authors",
            "format" : "zenon_authors"
        }
    ]
}
```

The owning **section** node (`section_tipo`, e.g. `zenon1`) carries the API
connection in its own `properties->api_config`:

```json
{
    "api_config": {
        "entity"       : "zenon",
        "api_url"      : "https://zenon.dainst.org/api/v1/record",
        "response_map" : [
            { "local": "ar_records", "remote": "records" },
            { "local": "msg",        "remote": "status" }
        ]
    }
}
```

!!! warning "section_tipo is mandatory"
    Like every v7 component, `component_external` requires an explicit
    `section_tipo` at instantiation; auto-resolution was removed. The component
    reaches **up** to its section node to read `api_config`, so the external
    field only resolves when it is a child of a section configured for the
    matching entity. The external section_id is the remote record identifier
    (e.g. `"001338683"`), not a Dédalo numeric id.

## Properties & options

### `fields_map` (component node)

The only property this component reads on its own node. An array of mapping
objects:

- `local` — fixed marker. Use `"dato"` to designate the entry that supplies
  this component's value (it is the default `local` name; only `dato` entries
  are consumed by `get_data()` and contribute to the section's requested
  remote field list).
- `remote` — the key to read from the remote row object (e.g. `"title"`,
  `"authors"`, `"physicalDescriptions"`).
- `format` *(optional)* — server-side transform applied to the remote value:
    - `array_values` — joins an array remote value with ` | ` (scalars are
      stringified).
    - `zenon_authors` — flattens the ZENON `authors` object into
      `role: name - name | role: …`.
    - *(any other / absent value)* — the raw remote value is used (stringified
      via `to_string()` when a `format` is present but unrecognised).

### `api_config` (section node, not the component node)

Read from the **section** ontology node properties; drives the remote call for
all external components in that section:

- `entity` — entity class key. Selects
  `core/component_external/entities/class.<entity>.php` and seeds the
  per-entity availability flag in the session. Bundled entity: `zenon`.
- `api_url` — base record endpoint of the external API.
- `response_map` — maps remote response keys to local roles. The entry with
  `local === "ar_records"` identifies the array of records in the response (the
  first record is used).

!!! note "No standard literal properties"
    `component_external` does **not** use `with_lang_versions`, `unique`,
    `mandatory` or other authoring properties of editable literals — its value
    is read-only and remote-derived. Any other property name not listed here
    should be treated as unsupported (verify in ontology before relying on it).

## Render views & modes

| Mode | Views | Notes |
| --- | --- | --- |
| `edit` | `default`, `line`, `mini`, `print` | Read-only; renders each entry as a `content_value` div (no input). `print` forces `permissions = 1` to use the read-only element. |
| `list` | `default`, `line`, `text`, `mini` | `default` joins entries with ` | ` and, on click, switches the instance to `edit`/`line`. `line`/`text` render an inline `span`. `mini` is used by autocomplete/datalist services. |
| `tm` | (as `list`) | Time Machine read; the JS `tm` renderer is aliased to `list`. |
| `search` | `default` | Renders a `q_operator` text input plus a free-text `value` input that writes back to `data.entries` and publishes `change_search_element`. |

DOM follows the shared structure: `wrapper_component component_external <tipo>
<mode>` → `label`, `buttons` (edit, when `permissions > 1`), `content_data` →
`content_value` nodes. The edit toolbar can show component tools and a
`full_screen` button.

## Import / export model

`component_external` does **not** override `conform_import_data`,
`get_export_value` or `get_diffusion_value`; it inherits the literal defaults
from [component_common](index.md). In practice there is little to import: the
value is owned by the remote system and resolved live, so the meaningful local
datum is the **identifier** stored by the section (or by a neighbouring
component such as a [component_portal](component_portal.md) /
[component_input_text](component_input_text.md) that holds the record id). The
external fields then render from that identifier on each load.

For the generic literal import/export contract and CSV formats, see
[../importing_data.md](../importing_data.md) and
[../exporting_data.md](../exporting_data.md).

## Notes

- **No default tools.** The shipped ontology context exposes `tools: []` for
  this component (no `tool_time_machine`/`tool_lang`/add/replace data tools),
  consistent with its read-only, remote nature.
- **Entity availability circuit-breaker.** When the remote host is unreachable
  or returns an empty/invalid response, the component sets
  `$_SESSION['dedalo']['config'][<entity>_is_available] = false` and returns
  `null` from then on, to avoid hammering the API request after request. The
  flag is session-scoped: a fresh login (new session) lets Dédalo try again.
- **Remote cache.** Resolved rows are memoised per request in the static
  `component_external::$data_from_remote_cache`, keyed by
  `section_tipo_section-id_lang`, so multiple external fields of the same
  record trigger a single API call. As a persistent-worker static, this cache
  is request-scoped state — it must be cleared between requests with the other
  class statics (see the worker state-bleed audit).
- **SSRF guard (SEC-075).** Even though the `api_url` is admin-owned ontology,
  the fully constructed URL is re-checked with `is_safe_remote_url()` before
  the cURL call to block cloud-metadata / internal-service reads; an unsafe URL
  marks the entity unavailable.
- **Adding a new entity.** Drop a `class.<entity>.php` into
  `core/component_external/entities/` exposing a static
  `build_row_request_url(object $options): string` (options:
  `api_url`, `ar_fields`, `section_id`, `lang`) and reference it via
  `api_config->entity`.
- **No observers/observables** are configured for this component.
- Related component docs: [component_input_text](component_input_text.md)
  (editable literal alternative), [component_text_area](component_text_area.md),
  [component_portal](component_portal.md) (linking to other sections),
  [component_iri](component_iri.md) (external resource locators stored locally).
