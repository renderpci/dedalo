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
    on-demand from a configured external API every time the component's data is
    read. There is no edit
    input — the `edit` view renders the resolved remote text read-only.

!!! warning "Gap: the remote fetch itself is not implemented"
    Only half of this component's behaviour described below has a confirmed implementation. The **request_config plumbing** — attaching the target section's `api_config` to a non-`dedalo` (`api_engine`) config item so the client/engine know an external source is in play — is done: `resolveExternalConfig()` in `src/core/relations/request_config/external.ts`. The actual **read-time HTTP call to the remote API** (entity-specific request building, response mapping, an SSRF guard on the constructed URL) has no confirmed implementation in this checkout. Separately, `src/core/components/component_external/descriptor.ts` currently registers this model with `resolveData: 'portal'` and a `column: 'relation'` (dispatched through the relation-locator family), which does not match the model described on this page (a literal `misc`-column value with no stored locators) — treat that descriptor as a placeholder/coverage gap, not as the intended final shape, until the remote-proxy read path is implemented.

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

Data item emitted to the client (`mode: list`):

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
forced to `lg-nolan`. The requested remote language is derived from the
current data language and mapped to a two-letter code by the entity-specific
mapping (for ZENON, `lgn=en` etc. — see the gap warning above for the current
implementation status).

Saving is meant to only sanitise: every entry coerced to a string before
storing. Because the value is normally re-derived from the API on load,
persisting is rarely meaningful for this component; this checkout's descriptor
does not wire it as a literal `misc`-column save at all (see the gap warning
above), so this save behaviour has no confirmed implementation either.

### How the value is designed to resolve

This is the intended design the ontology configuration below targets; only the request_config attach step (1) has a confirmed implementation today (see the gap warning above) — steps 2-5 describe the read-time proxy that still needs to be built.

1. Read the **section** ontology node properties (`api_config`) for `entity`,
   `api_url` and `response_map`.
2. Collect the `remote` field names declared by sibling components
   (`properties.fields_map` entries whose `local` is `dato`).
3. An entity-specific request builder constructs the per-record URL for the
   configured `entity` (e.g. `zenon`).
4. The URL is validated by an SSRF guard, then fetched with a short-timeout
   HTTP request.
5. Each component extracts its own field from the row using its own
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
connection in its own `properties.api_config`:

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
  are read when the value is resolved, and only they contribute to the
  section's requested remote field list).
- `remote` — the key to read from the remote row object (e.g. `"title"`,
  `"authors"`, `"physicalDescriptions"`).
- `format` *(optional)* — server-side transform applied to the remote value:
    - `array_values` — joins an array remote value with ` | ` (scalars are
      stringified).
    - `zenon_authors` — flattens the ZENON `authors` object into
      `role: name - name | role: …`.
    - *(any other / absent value)* — the raw remote value is used (coerced to a
      string when a `format` is present but unrecognised).

### `api_config` (section node, not the component node)

Read from the **section** ontology node properties; drives the remote call for
all external components in that section:

- `entity` — the entity key selecting which request-builder/response-mapping logic to use, and seeding the per-entity availability flag in the session (see *Notes*). Documented entity: `zenon`.
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

`component_external` has no per-model import/export override; it goes through
the generic literal import/export path like any other component without one.
In practice there is little to import: the
value is owned by the remote system and resolved live, so the meaningful local
datum is the **identifier** stored by the section (or by a neighbouring
component such as a [component_portal](component_portal.md) /
[component_input_text](component_input_text.md) that holds the record id). The
external fields then render from that identifier on each load.

For the generic literal import/export contract and CSV formats, see
[../importing_data.md](../importing_data.md) and
[../exporting_data.md](../exporting_data.md).

## Notes

The following describe the intended design for the remote-fetch proxy; the fetch itself has no confirmed implementation yet (see the gap warning near the top of this page).

- **No default tools.** The shipped ontology context exposes `tools: []` for
  this component (no `tool_time_machine`/`tool_lang`/add/replace data tools),
  consistent with its read-only, remote nature.
- **Entity availability circuit-breaker (intended).** When the remote host is
  unreachable or returns an empty/invalid response, the component is meant to
  flip a session-scoped per-entity availability flag to false and return
  `null` from then on, to avoid hammering the API request after request. The
  flag would be session-scoped: a fresh login (new session) lets it try again.
- **Remote cache (intended).** Resolved rows are meant to be memoised per
  request, keyed by `section_tipo_section-id_lang`, so multiple external
  fields of the same record trigger a single API call. As request-scoped
  state, such a cache must be cleared between requests, not held as a
  persistent-worker global.
- **SSRF guard (intended).** Even though the `api_url` is admin-owned
  ontology, the fully constructed URL should be re-checked before the fetch
  to block cloud-metadata / internal-service reads; an unsafe URL should mark
  the entity unavailable.
- **Adding a new entity (intended).** A new entity is meant to be added by
  registering a request builder for it (constructs the per-record URL from
  `api_url`, the requested fields, `section_id` and `lang`) and referencing
  its key via `api_config.entity`.
- **No observers/observables** are configured for this component.
- Related component docs: [component_input_text](component_input_text.md)
  (editable literal alternative), [component_text_area](component_text_area.md),
  [component_portal](component_portal.md) (linking to other sections),
  [component_iri](component_iri.md) (external resource locators stored locally).
