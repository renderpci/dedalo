# dd_core_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [RQO field mapping](../RQO_FIELD_MAPPING.md) · [dd_manager](dd_manager.md)

Core Dédalo API for the section/record lifecycle and page context. It is the API that front-end page builders and components use most.

## How to call

- POST JSON to `/api/v1/json` (or the client-relative `/dedalo/core/api/v1/json`) with `dd_api: "dd_core_api"` and `action: "<method>"`.
- The request uses the Request Query Object (RQO) shape: `dd_api`, `action`, `source`, `sqo`, `show`, `options`, `data`.
- Every action is registered in `ACTION_REGISTRY` in `src/core/api/dispatch.ts` and gated (auth, CSRF, per-action permissions) before it runs.

## Notes

- `source` and `sqo` are central: when one is missing, the server builds a sensible default from the `source` metadata.
- For file uploads, use `multipart/form-data`; the media ingest branch of the API path (`src/server.ts`) handles them, not the JSON dispatcher.

## start

### Purpose

Initialize the application, retrieve environment and session state.

### Accepts

- `options`: object (optional)
  - `search_obj`: object (optional) — URL parameters
  - `menu`: boolean (optional) — whether to load menu state
  - `recovery`: string (optional) — recovery key for maintenance mode

### Returns

`{ result: true|false, msg: string, environment: {...} }`

### Usage

Typically called on page load. Sets up session, checks recovery mode, and returns environment data.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "start",
  "options": {
    "search_obj": {},
    "menu": false
  }
}
```

### Example Response

```json
{
  "result": { "context": [ /* section/menu element contexts */ ], "data": [] },
  "environment": { "page_globals": {}, "plain_vars": {}, "labels": {} },
  "msg": "OK"
}
```

> Unauthenticated `start` returns the login element context (this is what renders the login form). The environment block is built by `src/core/resolve/environment.ts`.

## read

### Purpose

Retrieve record/component data with optional filtering.

### Accepts

- `source`: object (required)
  - `section_tipo`: string (required) — section type identifier
  - `section_id`: int (optional) — specific record to read
  - `action`: string (optional) — "get_value" or default (build_json_rows)
  - `tipo`: string (optional) — component type
  - `model`: string (optional) — component model
  - `mode`: string (optional) — "edit" or "list"
  - `lang`: string (optional) — language code
- `sqo`: object (optional)
  - `limit`: int (optional) — max records to return
  - `offset`: int (optional) — pagination offset
  - `section_tipo`: array (optional) — filter by section types

### Returns

`{ result: { context: [...], data: [...] }, msg: string }` — the section (or component) structure contexts plus the resolved records.

### Usage

Core method for reading record data. Can fetch full section data or a single component (`source.action: "get_data"`), search filter chips (`resolve_data`), or the References panel (`get_relation_list`). Read requires permission level ≥ 1 on the section.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "read",
  "source": {
    "section_tipo": "rsc167",
    "section_id": 1,
    "action": null
  },
  "sqo": {
    "limit": 10,
    "offset": 0
  }
}
```

### Example Response

```json
{
  "result": {
    "context": [ /* structure contexts */ ],
    "data": [
      { "section_id": 1, "section_tipo": "rsc167", "tipo": "oh1", "value": ["Sample Title"] }
    ]
  },
  "msg": "OK"
}
```

## read_raw

### Purpose

Retrieve full raw data from database for section or component.

### Accepts

Note: `read_raw` reads its identifiers from **`options`** (not `source`), matching `src/core/api/dispatch.ts`.

- `options`: object (required)
  - `section_tipo`: string (required) — section type
  - `tipo`: string (required) — component/section type
  - `model`: string (optional) — component model
  - `type`: string (optional)
- `sqo`: object (optional) — target sections default to `[options.section_tipo]` when absent.

### Returns

`{ result: [...], table: string, msg: string }` — the raw stored value(s) for the SQO's matched records.

### Usage

Returns raw stored data for the SQO's matched records. Read requires level ≥ 1 on every SQO target section.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "read_raw",
  "options": {
    "section_tipo": "rsc167",
    "tipo": "rsc167"
  },
  "sqo": {
    "section_tipo": ["rsc167"],
    "limit": 1
  }
}
```

### Example Response

```json
{
  "result": [ /* raw stored values per matched record */ ],
  "table": "matrix",
  "msg": "OK. Request done"
}
```

## create

### Purpose

Create a new record in a section.

### Accepts

- `source`: object (required)
  - `section_tipo`: string (required) — target section type

### Returns

`{ result: <new section_id>, msg: string }`

### Usage

Creates a new blank record and returns its `section_id`. Requires permission level ≥ 2 on the section.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "create",
  "source": {
    "section_tipo": "rsc167"
  }
}
```

### Example Response

```json
{
  "result": 125,
  "msg": "OK. Request done"
}
```

## duplicate

### Purpose

Duplicate an existing record with all its data.

### Accepts

- `source`: object (required)
  - `section_id`: int (required) — source record to duplicate
  - `section_tipo`: string (required) — section type

### Returns

`{ result: <new section_id>, msg: string }`

### Usage

Creates a complete copy of the source record, including all component data. Requires level ≥ 2; non-admins must also have the source record in their projects scope.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "duplicate",
  "source": {
    "section_id": 1,
    "section_tipo": "rsc167"
  }
}
```

### Example Response

```json
{
  "result": 126,
  "msg": "OK. Request done"
}
```

## delete

### Purpose

Delete a record or section data.

### Accepts

- `source`: object (required)
  - `section_tipo`: string (required; `tipo` is accepted as a fallback)
  - `section_id`: int (required unless `sqo` is present)
  - `delete_mode`: string (optional, default `"delete_data"`) — `"delete_data"` empties every component and keeps the row; `"delete_record"` removes the row (a Time Machine snapshot is taken first).
- `sqo`: object (optional) — bulk delete by search. **Global-admin only**, and constrained to the gated section.

### Returns

`{ result: [<deleted ids>], msg: string }`

### Usage

Deletes a record. Requires level ≥ 2 on the section. Ontology-main sections cascade (uninstall the TLD) under `delete_record`, global-admin only.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "delete",
  "source": {
    "section_tipo": "rsc167",
    "section_id": 1,
    "delete_mode": "delete_record"
  }
}
```

### Example Response

```json
{
  "result": ["rsc167_1"],
  "msg": "OK. Request done"
}
```

## save

### Purpose

Save component data to a record.

### Accepts

The TS handler reads these from `source` (`src/core/api/dispatch.ts` → `saveComponentData`):

- `source`: object (required)
  - `tipo`: string (required) — component type
  - `section_tipo`: string (required) — parent section type
  - `section_id`: int (required) — parent section id
  - `lang`: string (optional, default `"lg-nolan"`) — language code
  - `caller_dataframe`: object (optional) — dataframe pairing context (`main_component_tipo`, `id_key`)
- `data`: object (required)
  - `changed_data`: array (required) — change objects, each `{ action, key, value }` where `action` ∈ `update` / `insert` / `remove` / `add_new_element` / `sort_data`.

### Returns

`{ result: { context: [...], data: [<saved DataItem>] }, msg: string }`

### Usage

Saves component changes. Requires level ≥ 2 on `(section_tipo, tipo)`. On success the server echoes the saved component in the canonical DataItem envelope (relation and select-family saves also carry `datalist` / `pagination` / `context`), triggers server-side observers, and writes an activity-log entry.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "save",
  "source": {
    "tipo": "oh16",
    "section_tipo": "oh1",
    "section_id": 124,
    "lang": "lg-eng"
  },
  "data": {
    "changed_data": [
      { "action": "update", "key": 0, "value": "Updated Title" }
    ]
  }
}
```

### Example Response

```json
{
  "result": {
    "context": [],
    "data": [
      { "tipo": "oh16", "section_tipo": "oh1", "section_id": 124, "mode": "edit", "lang": "lg-eng", "value": ["Updated Title"] }
    ]
  },
  "msg": "OK"
}
```

## count

### Purpose

Count records matching SQO criteria.

### Accepts

- `sqo`: object (required)
  - `section_tipo`: array (required) — section types to count
  - `limit`: int (optional) — max results
  - `offset`: int (optional) — pagination offset
  - Other filter criteria (filters, search terms, etc.)

### Returns

`{ result: { total: number }, msg: string }`

### Usage

Returns the total count of records matching the SQO. The read strategy owns counting (the default matrix source runs the SQO full-count; `sqo.mode: "related"` counts inverse references; `sqo.mode: "tm"` counts `matrix_time_machine`). Requires level ≥ 1 on every SQO target section.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "count",
  "sqo": {
    "section_tipo": ["rsc167"]
  }
}
```

### Example Response

```json
{
  "result": { "total": 42 },
  "msg": "OK"
}
```

## get_element_context

### Purpose

Retrieve context information for a specific component/element.

### Accepts

- `source`: object (required)
  - `tipo`: string (required for section/component; a tool sends `model: "tool_x"` with no `tipo`)
  - `section_tipo`: string (optional, defaults to `tipo`)
  - `mode`: string (optional, default `"list"`)
  - `lang`: string (optional)
  - `model`: string (optional)

Covered models: `section`, `component_*`, and the area models. Tool contexts require the tool to be authorized for the caller.

### Returns

`{ result: [<one context entry>], msg: string }`

### Usage

Returns the structure context (no data) for one element. Requires level ≥ 1 on `(section_tipo, tipo)`.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "get_element_context",
  "source": {
    "section_tipo": "rsc167",
    "tipo": "oh16",
    "mode": "edit"
  }
}
```

### Example Response

```json
{
  "result": [
    { "tipo": "oh16", "model": "component_input_text", "label": "Title", "permissions": 3 }
  ],
  "msg": "OK"
}
```

## get_section_elements_context

### Purpose

Retrieve context for all components in a section.

### Accepts

- `options`: object — forwarded to `buildSectionElementsContext` (`src/core/resolve/section_elements_context.ts`). Permissions are **always** enforced server-side (the client's `skip_permissions` flag is ignored).

### Returns

`{ result: [{ context_for_each_element }], msg: string }`

### Usage

Returns the "simple" structure-context set for a section — the edit-mode search-filter panel's element list.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "get_section_elements_context",
  "options": {
    "section_tipo": "rsc167"
  }
}
```

### Example Response

```json
{
  "result": [
    {
      "tipo": "oh1",
      "label": "Title",
      "model": "component_input_text"
    },
    {
      "tipo": "oh2",
      "label": "Description",
      "model": "component_text_area"
    }
  ],
  "msg": "OK"
}
```

## get_matrix_ontology_locator — *not ported (gap)*

The PHP `dd_core_api::get_matrix_ontology_locator` action is **not registered** in the TS action registry (`src/core/api/dispatch.ts`). The ontology locator of a `tipo` is resolved internally through `src/core/ontology/resolver.ts` rather than exposed as a public API action. See `rewrite/STATUS.md`.
