# Dédalo JSON API v1

> See also: [RQO field mapping](RQO_FIELD_MAPPING.md) · [The diffusion engine](../diffusion/native_engine.md) · [Class reference](classes/dd_manager.md)

This page describes the JSON API entry point, the Request Query Object (RQO) format that callers send, and the API classes and actions the TypeScript/Bun server implements. The **conceptual API contract is preserved** from the PHP server (same RQO vocabulary, same `dd_api`/`action` names, same six security gates); the implementation is a single long-lived Bun process with an **explicit action registry** — `src/core/api/dispatch.ts` — rather than PHP's dynamic method reflection.

The single source of truth for what the API can do is the `ACTION_REGISTRY` map in `src/core/api/dispatch.ts`. An `(dd_api, action)` pair that is not registered simply does not exist — there is no autoloader fallback.

## API entry point

- HTTP POST with a JSON body. The Bun server accepts the RQO on two paths (`src/server.ts`, `API_PATHS`):
  - `/api/v1/json` — the direct path.
  - `/dedalo/core/api/v1/json[/]` — the alias the copied client computes relatively from its page URL (`data_manager` fallback `../api/v1/json/`).
- `Content-Type: application/json`.
- Note: unlike the PHP server there is no `index.php`; the endpoint is a native Bun route.

A minimal call:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"dd_api":"dd_core_api","action":"start","options":{"menu":true}}' \
  https://your-host/api/v1/json
```

## How the endpoint handles input

- The endpoint reads the JSON body and validates it against the RQO Zod schema (`src/core/concepts/rqo.ts`).
- Multipart uploads are handled by a dedicated branch of the API path in `src/server.ts` (the TS re-expression of PHP `dd_utils_api::upload`), which routes `$_FILES`-style form data into the media ingest pipeline rather than into the JSON dispatcher.
- The dispatcher (`dispatchRqo`) runs the request through the gates below before reaching a handler.

## Security gates

Every request passes through the gates in `dispatchRqo` (mirroring PHP `dd_manager::manage_request`), in this order:

1. **Allowlist** — the `(dd_api, action)` pair must be explicitly registered in `ACTION_REGISTRY`; otherwise the request is refused with *"Undefined or unauthorized method (action)"*.
2. **Authentication** — a session is required unless the action is in `NO_LOGIN_ACTIONS` (`login`, `get_environment`, `start`, `get_login_context`).
3. **CSRF** — authenticated, non-exempt actions must present a valid CSRF token (constant-time compare). Exempt actions are `CSRF_EXEMPT_ACTIONS` (`login`, `get_environment`, `start`, `get_login_context`). A CSRF failure returns the exact shape the client's transparent retry keys on: `errors: ['csrf_failed']` plus the session's current `csrf_token`.
4. **Request-scoped language** — the handler runs inside a language context (`AsyncLocalStorage`, `src/core/resolve/request_lang.ts`) seeded from the session, replacing PHP's per-request `DEDALO_*_LANG` constants.
5. **Per-action permission gates** — each handler resolves the caller's `Principal` and checks section/component permission levels before any DB work (read requires level ≥ 1, write ≥ 2).

Auth is a **new native TS mechanism** (Argon2id via `Bun.password`, rotating server-side sessions in `src/core/security/`) — it is not PHP-session-compatible, but the guarantees checklist is preserved.

## Request Query Object (RQO): shape and rules

The API expects a normalized object validated by `rqoSchema` (`src/core/concepts/rqo.ts`). Its core fields are:

- `dd_api` (string) — API class to dispatch to (e.g. `dd_core_api`, `dd_utils_api`). Defaults to `dd_core_api`.
- `action` (string, required) — action to run on that API class (e.g. `start`, `read`, `save`).
- `source` (object) — the request target (`model`, `tipo`, `section_tipo`, `section_id`, `mode`, `lang`, `action`, `view`, plus pass-through keys).
- `api_engine` (string) — resolution engine name (defaults to `dedalo`).
- `sqo`, `show`, `search`, `choose` (objects) — search and display configuration objects (each carries a `ddo_map` and optional `sqo_config`).
- `options` (object) — heterogeneous payloads (file metadata, flags, auxiliary data).
- `data` (object) — payload for write actions (e.g. `changed_data` for `save`).

Minimal example RQO:

```json
{
  "dd_api": "dd_core_api",
  "action": "start",
  "options": { "menu": true }
}
```

Multipart upload example (routed to the media ingest branch, not the JSON dispatcher):

```bash
curl -X POST \
  -F "file=@/path/to/image.jpg" \
  -F "other_field=value" \
  https://your-host/api/v1/json
```

## API classes and actions (from the action registry)

This index lists every `(dd_api, action)` pair registered in `src/core/api/dispatch.ts` at the time of writing. Actions the PHP server exposed that are **not yet registered in TS** are called out as gaps (see `rewrite/STATUS.md`).

### dd_core_api (section/record lifecycle and page context)

Registered actions: `start`, `read`, `save`, `read_raw`, `create`, `duplicate`, `delete`, `count`, `get_element_context`, `get_section_elements_context`, `get_environment`.

> Gap: the PHP-era actions `get_indexation_grid`, `get_page_globals`, `get_js_plain_vars`, `get_lang_labels`, `get_matrix_ontology_locator`, and `test` are **not registered** in the TS core API. The page-globals / labels payloads are served through `get_environment` / `start` instead.

Example — `start` (get the initial context):

```json
{ "dd_api": "dd_core_api", "action": "start", "options": { "menu": true } }
```

### dd_utils_api (utility and system operations)

Registered actions: `login`, `quit`, `get_login_context`, `get_install_context`, `get_system_info`, `change_lang`, `convert_search_object_to_sql_query`, `join_chunked_files_uploaded`, `list_uploaded_files`, `update_lock_components_state`, `get_lock_status`.

> Note: file `upload` itself is not a JSON-dispatched action in TS — multipart uploads are handled by the media ingest branch of the API path in `src/server.ts`. `join_chunked_files_uploaded` is the JSON RQO that reassembles a completed chunked upload.
>
> Gap: PHP `dd_utils_api` actions `install`, `delete_uploaded_file`, `get_dedalo_files`, `get_process_status`, `stop_process`, `get_server_ready_status`, `get_ontology_update_info`, and `get_code_update_info` are not registered in the TS core API.

Example — `login` (JSON body):

```json
{ "dd_api": "dd_utils_api", "action": "login", "options": { "username": "admin", "auth": "secret" } }
```

### dd_tools_api (user tools)

Registered actions: `user_tools`, `tool_request`.

For `tool_request`, the tool name is passed in `source.model` and the tool method in `source.action`; the per-tool action allowlist and dispatch live in `src/core/tools/dispatch.ts`:

```json
{ "dd_api": "dd_tools_api", "action": "tool_request", "source": { "model": "tool_indexation", "action": "reindex" }, "options": {} }
```

### dd_ts_api (thesaurus / hierarchical tree)

Registered actions: `get_node_data`, `get_children_data`, `add_child`, `update_parent_data`, `save_order`. These are thin wrappers over `src/core/ts_object/ts_api.ts`, which owns permission gating and the verbatim response envelopes.

```json
{ "dd_api": "dd_ts_api", "action": "get_node_data", "source": { "section_tipo": "oh1", "section_id": "1" }, "options": {} }
```

### dd_area_maintenance_api (maintenance and admin)

Registered actions: `widget_request`, `get_widget_value`, `lock_components_actions`. Widget execution and the widget registry live in `src/core/resolve/widget_request.ts`.

> Gap: PHP `class_request`, `modify_counter`, `get_simple_schema_changes_files`, and `parse_simple_schema_changes_files` are not registered as top-level actions. `modify_counter` survives as a per-widget method under `widget_request` (the `counters_status` widget), not as its own action.

### dd_diffusion_api (publication)

Registered actions: `diffuse`, `get_process_status`, `list_processes`, `cancel_process`, `get_diffusion_info`, `get_engine_advisory`, `retry_pending_deletions`, `validate`, `rebuild_media_index` — the full publication action set, served natively by the core dispatcher (jobs + spawned runner processes). See [The diffusion engine](../diffusion/native_engine.md#client-compatibility).

### dd_rag_api (semantic retrieval — greenfield)

Registered actions (from `src/ai/rag/api.ts`): `semantic_search`, `retrieve`, `get_agent_context`, `similar_to`, `ask`, `similar_objects`, `search_by_text_image`, `characterize_object`. Results are ACL-gated inside each handler (schema ACL + per-record projects filter). This subsystem has no PHP equivalent; see `rewrite/STATUS.md` §8.

### Component APIs

- `dd_component_portal_api` — portal component. Registered action: `delete_locator`.
- `dd_component_av_api` — audio/video component. Registered actions: `create_posterframe`, `delete_posterframe`, `get_media_streams`. (PHP `download_fragment` is a gap — not registered.)
- `dd_component_3d_api` — 3D component. Registered actions: `move_file_to_dir`, `delete_posterframe`.

> `dd_component_info` (`get_widget_data`) **is registered** (2026-07-10) — `src/core/api/handlers/dd_component_info.ts`, the single-widget / async-widget compute channel of the [component_info](../core/components/component_info.md) framework; read-time (non-async) widgets are computed during the section read (the `component_info` emit hook → `computeInfoWidgets`). Gap: `dd_component_text_area_api` (tags: `delete_tag`, `get_tags_info`) is **not registered**; read-time tag resolution is served through the section read pipeline instead (`src/core/section/media_features.ts`).

## RQO `source` object (common properties)

Callers typically send these `source` properties (`rqoSourceSchema`):

- `model` / `tipo` / `section_tipo` — ontology model identifiers.
- `section_id` — specific record id (string or number in the wild).
- `mode` — `list`, `edit`, `search`, `tm`, and so on.
- `lang` — language code.
- `action` — a sub-action discriminator used by some methods (e.g. `read` → `get_data`, `resolve_data`, `get_relation_list`).
- `view` — custom view name.

Example `source` snippet:

```json
"source": {
  "model": "section",
  "section_tipo": "numisdata3",
  "mode": "list",
  "section_id": 2
}
```

## Response envelope

- Handlers return an `ApiResult` (`src/core/api/response.ts`): an HTTP status plus a body. Most bodies use the `{ result, msg, errors }` shape.
- On an unexpected handler exception the dispatcher degrades to the client envelope — HTTP 200 with `result: false` and a PHP-shaped `msg` — rather than a raw 500, because the vanilla client only reads `api_response.result` to decide failure.
- When a session exists, the dispatcher appends the session's `csrf_token` to every response for the client's transparent-retry logic.

## Where to look in the code

- API dispatcher + action registry: `src/core/api/dispatch.ts`
- HTTP routing / entry point: `src/server.ts`
- RQO DTO (Zod schema): `src/core/concepts/rqo.ts`
- SQO DTO + boundary sanitizer: `src/core/concepts/sqo.ts` (`sanitizeClientSqo`)
- Auth + sessions: `src/core/security/` (`auth.ts`, `session_store.ts`, `permissions.ts`)
- Response envelope: `src/core/api/response.ts`

## Class reference

- **[dd_core_api](classes/dd_core_api.md)** — core operations (start, read, create, save, delete, count, context).
- **[dd_utils_api](classes/dd_utils_api.md)** — system and utility helpers (login, system info, change_lang).
- **[dd_tools_api](classes/dd_tools_api.md)** — user tools and `tool_request`.
- **[dd_ts_api](classes/dd_ts_api.md)** — thesaurus and tree helpers.
- **[dd_area_maintenance_api](classes/dd_area_maintenance_api.md)** — maintenance and admin endpoints.
- **[dd_component_portal_api](classes/dd_component_portal_api.md)** — portal component helpers.
- **[dd_component_av_api](classes/dd_component_av_api.md)** — audio/video helpers.
- **[dd_component_3d_api](classes/dd_component_3d_api.md)** — 3D component helpers.
- **[dd_component_text_area_api](classes/dd_component_text_area_api.md)** — text area component (tags) — *not yet ported*.
- **[dd_component_info](classes/dd_component_info.md)** — generic component info helpers — *not yet ported*.
- **[dd_manager](classes/dd_manager.md)** — the PHP request router; in TS its role is filled by `dispatchRqo` + the action registry.
