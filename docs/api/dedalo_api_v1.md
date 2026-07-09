# Dédalo JSON API v1

> See also: [RQO field mapping](RQO_FIELD_MAPPING.md) · [Diffusion API](diffusion_api_documentation.md) · [Class reference](classes/dd_manager.md)

This page describes the JSON API entry point, the Request Query Object (RQO) format that callers send, and the API classes and actions implemented under `core/api/v1/common/`.

## API entry point

- HTTP POST with a JSON body to `/core/api/v1/json/index.php`.
- `Content-Type: application/json`.

A minimal call:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"dd_api":"dd_core_api","action":"start","options":{"menu":true}}' \
  https://your-host/path/to/dedalo/core/api/v1/json/index.php
```

## How the endpoint handles input

- The endpoint reads the JSON body (`php://input`) and decodes it into an object (`$rqo`).
- If `$_FILES` is present (multipart uploads), the endpoint creates a default upload RQO (`dd_api: dd_utils_api`, `action: upload`) and populates `rqo->options` with the form fields and files.
- For GET/POST requests it also accepts an `rqo` string parameter, or it maps request keys into `request_query_object::$direct_keys`.

## Request Query Object (RQO): shape and rules

The API expects a normalized object, the `request_query_object` DTO. Its core fields are:

- `dd_api` (string) — API class to call (e.g. `dd_core_api`, `dd_utils_api`).
- `action` (string) — method/action to run on that API class (e.g. `start`, `read`, `upload`).
- `source` (object) — caller information (component, section, mode, locators, and so on).
- `api_engine` (string) — engine name (defaults to `dedalo`).
- `sqo`, `show`, `search`, `choose` (objects) — search and display configuration objects.
- `options` (object) — heterogeneous payloads (file metadata, flags, auxiliary data).
- `prevent_lock` (bool) — when `true`, the session is not locked during the request.
- `pretty_print` (bool) — when `true`, the server returns pretty-printed JSON.

Minimal example RQO:

```json
{
  "dd_api": "dd_core_api",
  "action": "start",
  "options": { "menu": true }
}
```

Multipart upload example. When files are present the endpoint auto-creates an upload RQO:

```bash
curl -X POST \
  -F "file=@/path/to/image.jpg" \
  -F "other_field=value" \
  https://your-host/path/to/dedalo/core/api/v1/json/index.php
```

The endpoint populates `rqo->options` with `other_field` and the uploaded `file` data, then calls `dd_manager->manage_request($rqo)`.

## API classes and example calls

This is a concise index of the v1 API classes (files in `core/api/v1/common/`) with their primary actions and a representative RQO. For per-method field details and responses, see the [class reference pages](#class-reference) and the [RQO field mapping](RQO_FIELD_MAPPING.md).

### dd_core_api (core features)

Actions: `start`, `read`, `read_raw`, `create`, `duplicate`, `delete`, `save`, `count`, `get_element_context`, `get_section_elements_context`, `get_indexation_grid`, `get_environment`, `get_page_globals`, `get_js_plain_vars`, `get_lang_labels`, `get_matrix_ontology_locator`, `test`.

Example — `start` (get the initial context):

```json
{ "dd_api": "dd_core_api", "action": "start", "options": { "menu": true }, "sqo": { "limit": 10 } }
```

### dd_utils_api (utility and system operations)

Actions: `get_login_context`, `get_install_context`, `get_system_info`, `convert_search_object_to_sql_query`, `change_lang`, `login`, `quit`, `install`, `upload`, `join_chunked_files_uploaded`, `list_uploaded_files`, `delete_uploaded_file`, `update_lock_components_state`, `get_dedalo_files`, `get_process_status`, `stop_process`, `get_server_ready_status`, `get_ontology_update_info`, `get_code_update_info`.

Example — `login` (JSON body):

```json
{ "dd_api": "dd_utils_api", "action": "login", "options": { "username": "admin", "auth": "secret" } }
```

For uploads, prefer `multipart/form-data`. When files are present the endpoint auto-assigns `dd_api: dd_utils_api`, `action: upload`:

```bash
curl -X POST -F "file=@/tmp/img.jpg" https://host/core/api/v1/json/index.php
```

### dd_tools_api (user tools)

Actions: `user_tools`, `tool_request`.

For `tool_request`, the tool name is passed in `source.model` and the tool method in `source.action`:

```json
{ "dd_api": "dd_tools_api", "action": "tool_request", "source": { "model": "tool_indexation", "action": "reindex" }, "options": {} }
```

### dd_ts_api (thesaurus / hierarchical tree operations)

Actions: `get_node_data`, `get_children_data`, `add_child`, `update_parent_data`, `save_order`.

```json
{ "dd_api": "dd_ts_api", "action": "get_node_data", "source": { "section_tipo": "oh1", "section_id": "1" }, "options": {} }
```

### dd_diffusion_api (standardized diffusion API)

Actions: `diffuse`, `get_diffusion_info`, `validate`, `get_ontology_map`, `retry_pending_deletions`, `rebuild_media_index`.

Example — `diffuse` records:

```json
{ "dd_api": "dd_diffusion_api", "action": "diffuse", "source": { "diffusion_tipo": "rsc636" }, "sqo": { "section_tipo": ["oh1"] } }
```

See the [Diffusion API documentation](diffusion_api_documentation.md) for the full request and response shapes.

### Component APIs

These helpers are used by front-end components and section tools. See the respective `core/component_*` folders for how components construct their RQO payloads.

- `dd_component_portal_api` — portal component. Actions: `delete_locator`.
- `dd_component_text_area_api` — text area component (tags). Actions: `delete_tag`, `get_tags_info`.
- `dd_component_av_api` — audio/video component. Actions: `download_fragment`, `get_media_streams`, `create_posterframe`, `delete_posterframe`.
- `dd_component_3d_api` — 3D component. Actions: `move_file_to_dir`, `delete_posterframe`.
- `dd_component_info` — generic component info. Actions: `get_widget_data`.

### dd_area_maintenance_api (maintenance and admin)

Actions: `class_request`, `widget_request`, `get_widget_value`, `lock_components_actions`, `modify_counter`, `get_simple_schema_changes_files`, `parse_simple_schema_changes_files`.

## RQO `source` object (common properties)

Components typically send these `source` properties:

- `model` / `tipo` / `section_tipo` — ontology model identifiers.
- `section_id` — specific section instance id.
- `mode` — `list`, `edit`, `search`, and so on.
- `lang` — language code.
- `value` — array or primitive used by portals and components to pre-resolve values.
- `autocomplete` — boolean.

Example `source` snippet:

```json
"source": {
  "model": "section_map",
  "section_tipo": "numisdata3",
  "mode": "list",
  "section_id": 2
}
```

## Tips and gotchas

- The `request_query_object` constructor sets `api_engine` to `dedalo` by default.
- When building an RQO from client-side code, send only the keys you need. The server fills sensible defaults (for example, it builds an SQO from `source` metadata when one is missing).
- The endpoint logs and safely returns `null` for missing RQO properties (via the DTO magic getter). Use the server logs to debug missing fields.
- For file uploads, prefer `multipart/form-data` (the endpoint auto-detects files). For JSON file metadata, use `options.file_data` as described in the `request_query_object` header comments.

## Where to look in the code

- API implementations: `core/api/v1/common/*.php`
- Entry point: `core/api/v1/json/index.php`
- RQO DTO: `core/common/class.request_query_object.php`
- Manager/router: `core/api/v1/common/class.dd_manager.php`
- Example consumers and components: `core/component_*/*` and `core/page/*`

## Class reference

- **[dd_core_api](classes/dd_core_api.md)** — core operations (start, read, create, save, delete, count, context).
- **[dd_utils_api](classes/dd_utils_api.md)** — system and utility helpers (login, install, upload, system info).
- **[dd_tools_api](classes/dd_tools_api.md)** — user tools and `tool_request`.
- **[dd_ts_api](classes/dd_ts_api.md)** — thesaurus and tree helpers.
- **[dd_area_maintenance_api](classes/dd_area_maintenance_api.md)** — maintenance and admin endpoints.
- **[dd_component_portal_api](classes/dd_component_portal_api.md)** — portal component helpers.
- **[dd_component_text_area_api](classes/dd_component_text_area_api.md)** — text area component (tags).
- **[dd_component_av_api](classes/dd_component_av_api.md)** — audio/video helpers.
- **[dd_component_3d_api](classes/dd_component_3d_api.md)** — 3D component helpers.
- **[dd_component_info](classes/dd_component_info.md)** — generic component info helpers.
- **[dd_manager](classes/dd_manager.md)** — internal request manager/router.

