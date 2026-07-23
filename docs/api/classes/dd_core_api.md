# dd_core_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [RQO field mapping](../RQO_FIELD_MAPPING.md) · [dispatch](dispatch.md)

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
  - `changed_data`: array (required) — change objects, each `{ action, key, value }` where `action` ∈ `update` / `insert` / `remove` / `set_data` / `sort_data` / `sort_by_column` / `add_new_element`.

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

## get_section_terms

### Purpose

Batch-resolve the `section_map` display term for a set of records in one call — the graph view labels all of its nodes with a single request instead of one datum read per node.

### Accepts

The locators, scope and lang ride at the **top level** of the RQO (not under `source`/`options`), matching the client's `build_graph_data.js`:

- `locators`: array (required) — `{ section_tipo, section_id }` entries. Hard-capped at 1000; a longer batch is truncated.
- `scope`: string (optional) — a `section_map` scope; `null` uses the main → thesaurus → relation_list chain.
- `lang`: string (optional) — defaults to the request data language.

### Returns

`{ result: { "<section_tipo>_<section_id>": "<term>|null", ... }, msg: string, errors: [] }` — keyed per resolved record, deduped by composite key. An empty or invalid `locators` array returns `{ result: false, msg, errors: ["bad_locators"] }`.

### Usage

Read permission (level ≥ 1) is required per section; unreadable, invalid, or non-`section_map` sections are skipped silently (never leaked, never clobbering the client's provisional node label).

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "get_section_terms",
  "locators": [
    { "section_tipo": "oh1", "section_id": 3 },
    { "section_tipo": "rsc197", "section_id": 12 }
  ]
}
```

### Example Response

```json
{
  "result": { "oh1_3": "Interview with…", "rsc197_12": "Smith, John" },
  "msg": "OK. Request done successfully",
  "errors": []
}
```

## get_indexation_grid

### Purpose

Build the thesaurus "show indexations" grid for a term component in a record.

### Accepts

- `source`: object (required)
  - `section_tipo`: string (required) — the term's section type
  - `section_id`: int (required) — the term record
  - `tipo`: string (required) — the component whose indexations are gridded
- `sqo`: object (optional) — grid paging/filter tuning.

### Returns

`{ result: <grid object>, msg: string, errors: [] }`. When any of the mandatory `source` fields is missing the handler returns `{ result: false, msg, errors: ["invalid rqo source"] }` (HTTP 200).

### Usage

Read permission (level ≥ 1) on the term's section is required; a denial rides as an HTTP-200 `result: false` with `errors: ["permissions_denied"]`.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "get_indexation_grid",
  "source": {
    "section_tipo": "oh1",
    "section_id": 3,
    "tipo": "oh16"
  }
}
```

### Example Response

```json
{
  "result": { "columns": [ /* … */ ], "rows": [ /* … */ ] },
  "msg": "OK. Request done successfully",
  "errors": []
}
```

## get_activity_metric

### Purpose

Fetch an on-demand activity-metric dataset for the area dashboard's timeline range switch (3m / 6m / 1y). The dashboard read serves only the recent range inline; wider ranges are fetched here so the initial payload stays small.

### Accepts

- `options`: object (required)
  - `area_tipo`: string (required) — must resolve to an area model
  - `range_days`: int (required) — one of the supported ranges (`ACTIVITY_RANGE_DAYS`, `src/core/area/dashboard.ts`)

### Returns

`{ result: true, data: <activity dataset>, msg: string }`

### Usage

Gated identically to the dashboard read — read permission (level ≥ 1) on the area. An invalid `area_tipo`, a non-area tipo, or an unsupported `range_days` returns a 400.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "get_activity_metric",
  "options": {
    "area_tipo": "dd542",
    "range_days": 90
  }
}
```

### Example Response

```json
{
  "result": true,
  "data": { /* timeline buckets for the requested range */ },
  "msg": "OK. Request done"
}
```

## get_ip_country

### Purpose

Resolve an IP address to a country for the Activity (`dd542`) IP-list view. Resolution is **local and offline** against the openly-licensed DB-IP Country Lite database (`src/core/geoip`) — no third-party request.

### Accepts

- `options`: object (required)
  - `ip`: string (required) — the address to resolve (1–64 chars)

### Returns

`{ result: true, data: { country_code: <ISO code|null> }, msg: string }`. `country_code` is `null` for private/reserved/unresolved addresses and when the database is not loaded, so the client simply shows no flag.

### Usage

Authenticated (the dispatch session + CSRF gates already ran). Returns a 400 for a missing or malformed `ip`.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "get_ip_country",
  "options": {
    "ip": "8.8.8.8"
  }
}
```

### Example Response

```json
{
  "result": true,
  "data": { "country_code": "US" },
  "msg": "OK. Request done"
}
```

## get_environment

### Purpose

Return the full client environment payload — `page_globals` + `plain_vars` + `get_label` (the same block `start` embeds). The copied client injects it via `set_environment()` at boot.

### Accepts

No arguments. The block is built for the current session (or the anonymous environment when unauthenticated).

### Returns

The environment object (`page_globals`, `plain_vars`, `get_label`), built by `src/core/resolve/environment.ts`.

### Usage

`get_environment` is a `NO_LOGIN` action — it serves the anonymous environment before a session exists and the authenticated one after login. The page-globals / plain-vars / label payloads are not separate actions; they are all served through this one block.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "get_environment"
}
```

### Example Response

```json
{
  "page_globals": { /* … */ },
  "plain_vars": { /* … */ },
  "get_label": { /* … */ }
}
```

> The ontology locator of a `tipo` is not exposed as an API action: it is resolved internally through the ontology resolver (`src/core/ontology/resolver.ts`).
