# Dédalo API: RQO field mapping

> See also: [JSON API v1](dedalo_api_v1.md) · [Class reference](classes/dd_core_api.md) · [The diffusion engine](../diffusion/native_engine.md)

This page documents the precise, method-specific RQO field usage for the actions the server implements. Every action here is verified against the action registry in `src/core/api/dispatch.ts` — if an action is not in that registry, it is not callable and it is not documented here.

## dd_core_api

### start()
**Purpose**: Initialize the client — return the boot context plus the full environment block.
**RQO fields used**:
- `options`: object (optional)
  - `search_obj`: object (optional) — the client's URL vars: `t`/`tipo`, `st`/`section_tipo`, `id`/`section_id`, `m`/`mode`, `view`, `tool`, or a whole `locator`.
  - `menu`: boolean (optional) — also describe the menu element so the client mounts the header.

Unauthenticated (`session === null`) `start` returns the **login element context** (this is what renders the login form). Authenticated `start` returns the page element context derived from `search_obj`, plus the environment.

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "start",
  "options": { "search_obj": {}, "menu": true }
}
```

**Example response** (authenticated):
```json
{
  "result": { "context": [ /* section/menu element contexts */ ], "data": [] },
  "environment": { "page_globals": {}, "plain_vars": {}, "labels": {} },
  "msg": "OK"
}
```

---

### read()
**Purpose**: Retrieve record / component data. The concrete strategy branches on `source.action` and whether a `section_id` is present (`readSection`, `readComponentData`, `resolveSearchData`, `buildRelationList`).
**RQO fields used**:
- `source`: object
  - `section_tipo`: string — section type identifier
  - `section_id`: string|int (optional) — specific record to read (kept as given; leading zeros are preserved)
  - `tipo`: string (optional) — component type
  - `model`: string (optional) — component model (a `component_*` model routes to a component read)
  - `mode`: string (optional) — `edit`, `list`, `search`
  - `action`: string (optional) — `get_data` (component pagination), `resolve_data` (search filter chips), `get_relation_list` (the References panel)
  - `lang`: string (optional)
- `sqo`: object (optional) — search query object (`limit`, `offset`, filters); `sqo.mode: "tm"` routes to the Time Machine read source.

**Permission gate**: read requires level ≥ 1 on `(section_tipo, tipo)` and on every SQO target section.

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "read",
  "source": { "section_tipo": "rsc167", "mode": "list" },
  "sqo": { "limit": 10, "offset": 0 }
}
```

**Example response**:
```json
{
  "result": { "context": [ /* structure contexts */ ], "data": [ /* records */ ] },
  "msg": "OK"
}
```

---

### read_raw()
**Purpose**: Return the raw stored value(s) for a SQO's matched records.
**RQO fields used** (note: these live in **`options`**, not `source`):
- `options`: object (required)
  - `section_tipo`: string (required)
  - `tipo`: string (required)
  - `model`: string (optional)
  - `type`: string (optional)
- `sqo`: object (optional) — target sections default to `[options.section_tipo]` when absent.

**Permission gate**: level ≥ 1 on every SQO target section.

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "read_raw",
  "options": { "section_tipo": "rsc167", "tipo": "rsc167" },
  "sqo": { "section_tipo": ["rsc167"], "limit": 1 }
}
```

**Example response**:
```json
{
  "result": [ /* raw stored values per matched record */ ],
  "table": "matrix",
  "msg": "OK. Request done"
}
```

---

### create()
**Purpose**: Create a new (blank) section record.
**RQO fields used**:
- `source`: object (required)
  - `section_tipo`: string (required) — target section type

**Permission gate**: level ≥ 2 on the section. Returns the new `section_id`.

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "create",
  "source": { "section_tipo": "rsc167" }
}
```

**Example response**:
```json
{
  "result": 125,
  "msg": "OK. Request done"
}
```

---

### duplicate()
**Purpose**: Clone a record into a new one, with all its data.
**RQO fields used**:
- `source`: object (required)
  - `section_id`: int (required) — source record to duplicate
  - `section_tipo`: string (required) — section type

**Permission gate**: level ≥ 2 on the section; non-admins must also have the source record in their projects scope. Returns the new `section_id`.

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "duplicate",
  "source": { "section_id": 1, "section_tipo": "rsc167" }
}
```

**Example response**:
```json
{
  "result": 126,
  "msg": "OK. Request done"
}
```

---

### delete()
**Purpose**: Delete a record (`delete_record`) or empty its data (`delete_data`, the default).
**RQO fields used**:
- `source`: object (required)
  - `section_tipo`: string (required; `tipo` is accepted as a fallback)
  - `section_id`: int (required unless `sqo` is present)
  - `delete_mode`: string (optional, default `"delete_data"`) — `"delete_data"` empties every component and keeps the row; `"delete_record"` removes the row (TM snapshot first).
- `sqo`: object (optional) — bulk delete by search; **global-admin only**, and constrained to the gated section.

Returns the array of deleted ids. Ontology-main sections cascade (uninstall the TLD) under `delete_record`, global-admin only.

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "delete",
  "source": { "section_tipo": "rsc167", "section_id": 1, "delete_mode": "delete_record" }
}
```

**Example response**:
```json
{
  "result": ["rsc167_1"],
  "msg": "OK. Request done"
}
```

---

### save()
**Purpose**: Save component data to a record.
**RQO fields used**:
- `source`: object (required)
  - `tipo`: string (required) — component type
  - `section_tipo`: string (required) — parent section type
  - `section_id`: int (required) — parent section id
  - `lang`: string (optional, default `"lg-nolan"`) — language code
  - `caller_dataframe`: object (optional) — dataframe pairing context (`main_component_tipo`, `id_key`)
- `data`: object (required)
  - `changed_data`: array (required) — change objects, each `{ action, key, value }` where `action` ∈ `update` / `insert` / `remove` / `add_new_element` / `sort_data`.

**Permission gate**: level ≥ 2 on `(section_tipo, tipo)`. On success the server echoes the saved component in the canonical DataItem envelope (relation/select-family saves also carry `datalist` / `pagination` / `context`), triggers server-side observers, and writes an activity-log entry.

**Example request**:
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
    "changed_data": [ { "action": "update", "key": 0, "value": "Updated Title" } ]
  }
}
```

**Example response**:
```json
{
  "result": {
    "context": [],
    "data": [ { "tipo": "oh16", "section_tipo": "oh1", "section_id": 124, "mode": "edit", "lang": "lg-eng", "value": ["Updated Title"] } ]
  },
  "msg": "OK"
}
```

---

### count()
**Purpose**: Count records matching a SQO. The read strategy owns counting (the default matrix source runs the SQO full-count; the TM source counts `matrix_time_machine`).
**RQO fields used**:
- `sqo`: object (required) — `section_tipo`, filters, `mode` (`related` counts inverse references).

**Permission gate**: level ≥ 1 on every SQO target section.

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "count",
  "sqo": { "section_tipo": ["rsc167"] }
}
```

**Example response**:
```json
{
  "result": { "total": 42 },
  "msg": "OK"
}
```

---

### get_element_context()
**Purpose**: One element's structure context (no data). Covers section / component / area / tool models.
**RQO fields used**:
- `source`: object (required)
  - `tipo`: string (required for section/component; omitted for a tool, which sends `model: "tool_x"`)
  - `section_tipo`: string (optional, defaults to `tipo`)
  - `mode`: string (optional, default `"list"`)
  - `lang`: string (optional)
  - `model`: string (optional)

**Permission gate**: level ≥ 1 on `(section_tipo, tipo)`. Returns `result` as an array of one context entry.

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "get_element_context",
  "source": { "section_tipo": "rsc167", "tipo": "oh16", "mode": "edit" }
}
```

---

### get_section_elements_context()
**Purpose**: The edit-mode search-filter panel's element list.
**RQO fields used**:
- `options`: object — passed to `buildSectionElementsContext`. Permissions are **always** enforced server-side (the client's `skip_permissions` flag is ignored).

**Example request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "get_section_elements_context",
  "options": { "section_tipo": "rsc167" }
}
```

---

> The ontology locator of a `tipo` is not exposed as an API action: it is resolved internally through the ontology resolver (`src/core/ontology/resolver.ts`).

---

## dd_utils_api

### login()
**Purpose**: Authenticate a user (Argon2id via `Bun.password`; rotating server-side session).
**RQO fields used**:
- `options`: object (required)
  - `username`: string (required)
  - `auth`: string (required) — the password

**Example request**:
```json
{
  "dd_api": "dd_utils_api",
  "action": "login",
  "options": { "username": "admin", "auth": "secret" }
}
```

**Example response** (a session cookie is set on the HTTP response; the session token is never returned in the body — the client uses the fresh `csrf_token`):
```json
{
  "result": true,
  "msg": "ok",
  "user_id": 1,
  "csrf_token": "…"
}
```

---

### quit()
**Purpose**: Log out — destroy the server-side session and clear the cookie.
**RQO fields used**: none.

**Example request**:
```json
{ "dd_api": "dd_utils_api", "action": "quit" }
```

**Example response**:
```json
{ "result": true, "msg": "OK. Request done" }
```

---

### get_system_info()
**Purpose**: The upload / import / media-edit init call — the client reads it before it can transfer a file.
**RQO fields used**: none. The payload comes from the media/upload config catalog; there is no runtime `.ini` to consult.

**Example request**:
```json
{ "dd_api": "dd_utils_api", "action": "get_system_info" }
```

**Example response** (shape from `src/core/api/handlers/system_info.ts`):
```json
{
  "result": {
    "max_size_bytes": 10485760,
    "sys_get_temp_dir": "/tmp",
    "upload_tmp_dir": "/…/media/tmp",
    "upload_tmp_perms": 16877,
    "session_cache_expire": 180,
    "upload_service_chunk_files": 20,
    "pdf_ocr_engine": true
  },
  "msg": "OK. Request done"
}
```

---

### change_lang()
**Purpose**: Persist the user's interface / data language on the session. Every subsequent request rebuilds with the stored language (`src/core/resolve/request_lang.ts`).
**RQO fields used**:
- `options`: object
  - `dedalo_application_lang`: string (optional) — validated against the ontology lang allowlist
  - `dedalo_data_lang`: string (optional) — validated against the allowlist

**Example request**:
```json
{
  "dd_api": "dd_utils_api",
  "action": "change_lang",
  "options": { "dedalo_application_lang": "lg-eng", "dedalo_data_lang": "lg-eng" }
}
```

**Example response**:
```json
{ "result": true, "msg": "OK. Request done. Changed dedalo_application_lang to lg-eng, dedalo_data_lang to lg-eng" }
```

---

### list_uploaded_files()
**Purpose**: List the user's pending chunked uploads. The action is registered and honors the `[{url, name, size}]` shape, but currently always returns an empty array — the common boot state, where the user has no pending chunked upload.
**RQO fields used**: none required.

**Example response**:
```json
{ "result": [], "msg": "OK. Request done" }
```

---

> **Uploads**: file `upload` is not a JSON-dispatched action — multipart uploads are handled by the media ingest branch of the API path in `src/server.ts`. `join_chunked_files_uploaded` (a JSON RQO) reassembles a completed chunked upload.

---

## dd_area_maintenance_api

> Maintenance operations are widget methods, not top-level actions. Execution goes through `widget_request` / `get_widget_value`; the widget registry and its per-widget `API_ACTIONS` allowlists live in `src/core/area_maintenance/widgets/registry.ts`. Counter administration, for example, is a `modify_counter` method of the `counters_status` widget, invoked through `widget_request`.

### lock_components_actions()
**Purpose**: Area-level lock operations.
**RQO fields used**:
- `options`: object
  - `fn_action`: string (required) — one of `get_active_users`, `force_unlock_all_components` (admin-gated inside the dispatcher).

**Example request**:
```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "lock_components_actions",
  "options": { "fn_action": "get_active_users" }
}
```

---

## Standard RQO envelope

All API calls use a standard envelope (`rqoSchema`, `src/core/concepts/rqo.ts`):

```json
{
  "dd_api": "dd_core_api",
  "action": "read",
  "source": {},
  "sqo": {},
  "show": {},
  "options": {},
  "data": {}
}
```

### Envelope fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dd_api` | string | No (defaults to `dd_core_api`) | Target API class |
| `action` | string | Yes | Registered action name |
| `source` | object | No* | Request target (record, section, component, mode) |
| `sqo` | object | No* | Search query object (filtering, pagination) |
| `show` / `search` / `choose` | object | No | ddo_map + per-block `sqo_config` |
| `options` | object | No | Action-specific options |
| `data` | object | No | Payload (for `save`) |
| `api_engine` | string | No | Resolution engine (defaults to `dedalo`) |

*Required fields depend on the specific action (see above). Authentication and CSRF gates are enforced by `dispatchRqo` before any handler runs — see [JSON API v1](dedalo_api_v1.md#security-gates).
