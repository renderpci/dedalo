This document describes the JSON API entry point, the Request Query Object (RQO) format used by callers, and the available API classes and actions under `core/api/v1/common/`.

**API entry point**

- HTTP POST (JSON body) to: `/core/api/v1/json/index.php`
- Content-Type: `application/json`

Example curl (simple JSON POST):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"dd_api":"dd_core_api","action":"start","options":{"menu":true}}' \
  https://your-host/path/to/dedalo/core/api/v1/json/index.php
```

**How the endpoint handles input**

- The endpoint reads the JSON body (php://input) and decodes it into an object (`$rqo`).
- If `$_FILES` is present (multipart uploads), the endpoint creates a default upload RQO (`dd_api: dd_utils_api`, `action: upload`) and populates `rqo->options` with form fields and files.
- For GET/POST requests it also accepts an `rqo` string parameter or maps request keys into `request_query_object::$direct_keys`.

**Request Query Object (RQO) — shape & rules**

- The API expects a normalized object commonly represented by the `request_query_object` DTO. Core fields:
  - `dd_api` (string) — API class to call (e.g. `dd_core_api`, `dd_utils_api`).
  - `action` (string) — method/action to execute on that API class (e.g. `start`, `read`, `upload`).
  - `source` (object) — caller information (component, section, mode, locators, etc.).
  - `api_engine` (string) — engine name (defaults to `dedalo`).
  - `sqo`, `show`, `search`, `choose` (objects) — search/display configuration objects.
  - `options` (object) — arbitrary, heterogeneous payloads (file metadata, flags, auxiliary data).
  - `prevent_lock` (bool) — when true, the session is not locked during the request.
  - `pretty_print` (bool) — when true, server prints JSON with pretty formatting.

Minimal example RQO:

```json
{
  "dd_api": "dd_core_api",
  "action": "start",
  "options": { "menu": true }
}
```

Multipart upload example (browser / curl form upload): the endpoint will auto-create an upload RQO when files are present. Example using `curl`:

```bash
curl -X POST \
  -F "file=@/path/to/image.jpg" \
  -F "other_field=value" \
  https://your-host/path/to/dedalo/core/api/v1/json/index.php
```

The endpoint will populate `rqo->options` with `other_field` and the uploaded `file` data and call `dd_manager->manage_request($rqo)`.

**API classes & example calls**
Below is a concise index of the v1 API classes (files in `core/api/v1/common`) with the primary actions and a representative RQO + curl example. Descriptions are inferred from class/method names and in-file docblocks.

- `dd_core_api` (core features)
  - Actions: `start`, `read`, `read_raw`, `create`, `duplicate`, `delete`, `save`, `count`, `get_element_context`, `get_section_elements_context`, `get_indexation_grid`, `get_environment`, `get_page_globals`, `get_js_plain_vars`, `get_lang_labels`, `get_ontology_info`, `test`
  - Example: start (get initial context)

    ```json
    { "dd_api": "dd_core_api", "action": "start", "options": { "menu": true }, "sqo": { "limit": 10 } }
    ```

    Curl:

    ```bash
    curl -X POST -H "Content-Type: application/json" -d '{"dd_api":"dd_core_api","action":"start","options":{"menu":true}}' https://host/core/api/v1/json/index.php
    ```

- `dd_utils_api` (utility and system operations)
  - Actions: `get_login_context`, `get_install_context`, `get_system_info`, `convert_search_object_to_sql_query`, `change_lang`, `login`, `quit`, `install`, `upload`, `join_chunked_files_uploaded`, `list_uploaded_files`, `delete_uploaded_file`, `update_lock_components_state`, `get_dedalo_files`, `get_process_status`, `stop_process`, `get_server_ready_status`, `get_ontology_update_info`, `get_code_update_info`
  - Example: upload (file upload via form); when using multipart the endpoint auto-assigns `dd_api: dd_utils_api`, `action: upload`.

    ```bash
    curl -X POST -F "file=@/tmp/img.jpg" https://host/core/api/v1/json/index.php
    ```

  - Example: login (JSON body)

    ```json
    { "dd_api":"dd_utils_api", "action":"login", "options": { "username":"admin","password":"secret" } }
    ```

- `dd_tools_api` (user tools)
  - Actions: `user_tools`, `tool_request`
  - Example:

    ```json
    { "dd_api":"dd_tools_api","action":"tool_request","options":{"tool_name":"mytool"},"source":{} }
    ```

- `dd_ts_api` (thesaurus / hierarchical tree operations)
  - Actions: `get_node_data`, `get_children_data`, `add_child`, `update_parent_data`, `save_order`
  - Example: get node data

    ```json
    { "dd_api":"dd_ts_api","action":"get_node_data","options":{},"source":{"node_id":123}} 
    ```

- `dd_component_portal_api` (portal component)
  - Actions: `delete_locator`, ... (see file for more)
  - Example:

    ```json
    { "dd_api":"dd_component_portal_api","action":"delete_locator","source":{"locator":"..."} }
    ```

- `dd_component_text_area_api` (text area component)
  - Actions: `delete_tag`, `get_tags_info`
  - Example: get tags info

    ```json
    { "dd_api":"dd_component_text_area_api","action":"get_tags_info","source":{"component_id":42} }
    ```

- `dd_component_av_api` (audio/video component)
  - Actions: `download_fragment`, `get_media_streams`, `create_posterframe`, `delete_posterframe`
  - Example:

    ```json
    { "dd_api":"dd_component_av_api","action":"get_media_streams","source":{"file_locator":"..."},"options":{} }
    ```

- `dd_component_3d_api` (3D component)
  - Actions: `move_file_to_dir`, `delete_posterframe`

- `dd_component_info` (component info)
  - Actions: `get_widget_dato`

- `dd_area_maintenance_api` (maintenance & admin)
  - Actions: `class_request`, `widget_request`, `get_widget_value`, `lock_components_actions`, `modify_counter`, `get_simple_schema_changes_files`, `parse_simple_schema_changes_files`

- `dd_component_portal_api`, `dd_component_text_area_api`, `dd_component_av_api`, `dd_component_3d_api`, `dd_component_info` — component-specific helpers used by front-end components and section tools (see respective `core/component_*` folders for how components construct RQO payloads).

**RQO `source` object (common properties)**

- Typical `source` properties sent by components include:
  - `model` / `tipo` / `section_tipo` — ontology model identifiers
  - `section_id` — specific section instance id
  - `mode` — `list`, `edit`, `search`, etc.
  - `lang` — language code
  - `value` — array or primitive used by portal/components to pre-resolve values
  - `autocomplete` — boolean

Example `source` snippet:

```json
"source": {
  "model": "section_map",
  "section_tipo": "numisdata3",
  "mode": "list",
  "section_id": 2
}
```

**Tips & gotchas**

- The `request_query_object` constructor sets `api_engine` to `dedalo` by default.
- When constructing RQO from client-side code prefer sending only the keys you need — the server creates sensible defaults (e.g. building SQO from `source` metadata when missing).
- The endpoint will log and safely return `null` for missing RQO properties (via the DTO magic getter). Use server logs to debug missing fields.
- For file uploads prefer multipart/form-data (the endpoint auto-detects files). For JSON file metadata use `options.file_data` as described in the `request_query_object` header comments.

**Where to look in the code**

- API implementations: `core/api/v1/common/*.php`
- Entry point: `core/api/v1/json/index.php`
- RQO DTO: `core/common/class.request_query_object.php`
- Manager/router: `core/api/v1/common/class.dd_manager.php`
- Example consumers and components: `core/component_*/*` and `core/page/*`

If you'd like, I can:

- Generate one example JSON call per API method (full list) saved under `docs/api/examples/`.
- Add a `docs/api/openapi.yaml` skeleton describing the JSON payload and the main endpoints.

Class reference files

- `docs/api/classes/dd_core_api.md` — core operations (start, read, create, save, delete, etc.)
- `docs/api/classes/dd_utils_api.md` — system and utility helpers (login, install, upload, system info)
- `docs/api/classes/dd_tools_api.md` — user tools and tool_request
- `docs/api/classes/dd_ts_api.md` — thesaurus and tree helpers
- `docs/api/classes/dd_component_portal_api.md` — portal component helpers
- `docs/api/classes/dd_component_text_area_api.md` — text area component (tags)
- `docs/api/classes/dd_component_av_api.md` — audio/video helpers
- `docs/api/classes/dd_component_3d_api.md` — 3D component helpers
- `docs/api/classes/dd_component_info.md` — generic component info helpers
- `docs/api/classes/dd_area_maintenance_api.md` — maintenance & admin endpoints
- `docs/api/classes/dd_manager.md` — internal request manager/router

Examples folder

- Example RQO JSON files (one per example) are in `docs/api/examples/`. Where a per-method example exists the class docs link to it.
perl -0777 -pe 's/```\n\n(json|bash)\n/```$1\n/g' -i /Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/docs/api/**/*.md
for f in /Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/docs/api/**/*.md; do perl -0777 -pe 's/```\n\n(json|bash)\n/```$1\n/g' -i "$f"; done
perl -0777 -pe 's/```\s*\njson/```json/g' -i /Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/docs/api/dedalo_api_v1.md
cat > /Users/render/Desktop/trabajos/dedalo/v6/master_dedalo/docs/api/dedalo_api_v1.md <<'EOF'
This document describes the JSON API entry point, the Request Query Object (RQO) format used by callers, and the available API classes and actions under `core/api/v1/common/`.

**API entry point**

- HTTP POST (JSON body) to: `/core/api/v1/json/index.php`
- Content-Type: `application/json`

Example curl (simple JSON POST):

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"dd_api":"dd_core_api","action":"start","options":{"menu":true}}' \
  https://your-host/path/to/dedalo/core/api/v1/json/index.php
```

**How the endpoint handles input**

- The endpoint reads the JSON body (php://input) and decodes it into an object (`$rqo`).
- If `$_FILES` is present (multipart uploads), the endpoint creates a default upload RQO (`dd_api: dd_utils_api`, `action: upload`) and populates `rqo->options` with form fields and files.
- For GET/POST requests it also accepts an `rqo` string parameter or maps request keys into `request_query_object::$direct_keys`.

**Request Query Object (RQO) — shape & rules**

- The API expects a normalized object commonly represented by the `request_query_object` DTO. Core fields:
  - `dd_api` (string) — API class to call (e.g. `dd_core_api`, `dd_utils_api`).
  - `action` (string) — method/action to execute on that API class (e.g. `start`, `read`, `upload`).
  - `source` (object) — caller information (component, section, mode, locators, etc.).
  - `api_engine` (string) — engine name (defaults to `dedalo`).
  - `sqo`, `show`, `search`, `choose` (objects) — search/display configuration objects.
  - `options` (object) — arbitrary, heterogeneous payloads (file metadata, flags, auxiliary data).
  - `prevent_lock` (bool) — when true, the session is not locked during the request.
  - `pretty_print` (bool) — when true, server prints JSON with pretty formatting.

Minimal example RQO:

```json
{
  "dd_api": "dd_core_api",
  "action": "start",
  "options": { "menu": true }
}
```

Multipart upload example (browser / curl form upload): the endpoint will auto-create an upload RQO when files are present. Example using `curl`:

```bash
curl -X POST \
  -F "file=@/path/to/image.jpg" \
  -F "other_field=value" \
  https://your-host/path/to/dedalo/core/api/v1/json/index.php
```

The endpoint will populate `rqo->options` with `other_field` and the uploaded `file` data and call `dd_manager->manage_request($rqo)`.

**API classes & example calls**
Below is a concise index of the v1 API classes (files in `core/api/v1/common`) with the primary actions and a representative RQO + curl example. Descriptions are inferred from class/method names and in-file docblocks.

- `dd_core_api` (core features)
  - Actions: `start`, `read`, `read_raw`, `create`, `duplicate`, `delete`, `save`, `count`, `get_element_context`, `get_section_elements_context`, `get_indexation_grid`, `get_environment`, `get_page_globals`, `get_js_plain_vars`, `get_lang_labels`, `get_ontology_info`, `test`
  - Example: start (get initial context)

    ```json
    { "dd_api": "dd_core_api", "action": "start", "options": { "menu": true }, "sqo": { "limit": 10 } }
    ```

    Curl:

    ```bash
    curl -X POST -H "Content-Type: application/json" -d '{"dd_api":"dd_core_api","action":"start","options":{"menu":true}}' https://host/core/api/v1/json/index.php
    ```

- `dd_utils_api` (utility and system operations)
  - Actions: `get_login_context`, `get_install_context`, `get_system_info`, `convert_search_object_to_sql_query`, `change_lang`, `login`, `quit`, `install`, `upload`, `join_chunked_files_uploaded`, `list_uploaded_files`, `delete_uploaded_file`, `update_lock_components_state`, `get_dedalo_files`, `get_process_status`, `stop_process`, `get_server_ready_status`, `get_ontology_update_info`, `get_code_update_info`
  - Example: upload (file upload via form); when using multipart the endpoint auto-assigns `dd_api: dd_utils_api`, `action: upload`.

    ```bash
    curl -X POST -F "file=@/tmp/img.jpg" https://host/core/api/v1/json/index.php
    ```

  - Example: login (JSON body)

    ```json
    { "dd_api":"dd_utils_api", "action":"login", "options": { "username":"admin","password":"secret" } }
    ```

- `dd_tools_api` (user tools)
  - Actions: `user_tools`, `tool_request`
  - Example:

    ```json
    { "dd_api":"dd_tools_api","action":"tool_request","options":{"tool_name":"mytool"},"source":{} }
    ```

- `dd_ts_api` (thesaurus / hierarchical tree operations)
  - Actions: `get_node_data`, `get_children_data`, `add_child`, `update_parent_data`, `save_order`
  - Example: get node data

    ```json
    { "dd_api":"dd_ts_api","action":"get_node_data","options":{},"source":{"node_id":123}} 
    ```

- `dd_component_portal_api` (portal component)
  - Actions: `delete_locator`, ... (see file for more)
  - Example:

    ```json
    { "dd_api":"dd_component_portal_api","action":"delete_locator","source":{"locator":"..."} }
    ```

- `dd_component_text_area_api` (text area component)
  - Actions: `delete_tag`, `get_tags_info`
  - Example: get tags info

    ```json
    { "dd_api":"dd_component_text_area_api","action":"get_tags_info","source":{"component_id":42} }
    ```

- `dd_component_av_api` (audio/video component)
  - Actions: `download_fragment`, `get_media_streams`, `create_posterframe`, `delete_posterframe`
  - Example:

    ```json
    { "dd_api":"dd_component_av_api","action":"get_media_streams","source":{"file_locator":"..."},"options":{} }
    ```

- `dd_component_3d_api` (3D component)
  - Actions: `move_file_to_dir`, `delete_posterframe`

- `dd_component_info` (component info)
  - Actions: `get_widget_dato`

- `dd_area_maintenance_api` (maintenance & admin)
  - Actions: `class_request`, `widget_request`, `get_widget_value`, `lock_components_actions`, `modify_counter`, `get_simple_schema_changes_files`, `parse_simple_schema_changes_files`

- `dd_component_portal_api`, `dd_component_text_area_api`, `dd_component_av_api`, `dd_component_3d_api`, `dd_component_info` — component-specific helpers used by front-end components and section tools (see respective `core/component_*` folders for how components construct RQO payloads).

**RQO `source` object (common properties)**

- Typical `source` properties sent by components include:
  - `model` / `tipo` / `section_tipo` — ontology model identifiers
  - `section_id` — specific section instance id
  - `mode` — `list`, `edit`, `search`, etc.
  - `lang` — language code
  - `value` — array or primitive used by portal/components to pre-resolve values
  - `autocomplete` — boolean

Example `source` snippet:

```json
"source": {
  "model": "section_map",
  "section_tipo": "numisdata3",
  "mode": "list",
  "section_id": 2
}
```

**Tips & gotchas**

- The `request_query_object` constructor sets `api_engine` to `dedalo` by default.
- When constructing RQO from client-side code prefer sending only the keys you need — the server creates sensible defaults (e.g. building SQO from `source` metadata when missing).
- The endpoint will log and safely return `null` for missing RQO properties (via the DTO magic getter). Use server logs to debug missing fields.
- For file uploads prefer multipart/form-data (the endpoint auto-detects files). For JSON file metadata use `options.file_data` as described in the `request_query_object` header comments.

**Where to look in the code**

- API implementations: `core/api/v1/common/*.php`
- Entry point: `core/api/v1/json/index.php`
- RQO DTO: `core/common/class.request_query_object.php`
- Manager/router: `core/api/v1/common/class.dd_manager.php`
- Example consumers and components: `core/component_*/*` and `core/page/*`

If you'd like, I can:

- Generate one example JSON call per API method (full list) saved under `docs/api/examples/`.
- Add a `docs/api/openapi.yaml` skeleton describing the JSON payload and the main endpoints.

Class reference files

- `docs/api/classes/dd_core_api.md` — core operations (start, read, create, save, delete, etc.)
- `docs/api/classes/dd_utils_api.md` — system and utility helpers (login, install, upload, system info)
- `docs/api/classes/dd_tools_api.md` — user tools and tool_request
- `docs/api/classes/dd_ts_api.md` — thesaurus and tree helpers
- `docs/api/classes/dd_component_portal_api.md` — portal component helpers
- `docs/api/classes/dd_component_text_area_api.md` — text area component (tags)
- `docs/api/classes/dd_component_av_api.md` — audio/video helpers
- `docs/api/classes/dd_component_3d_api.md` — 3D component helpers
- `docs/api/classes/dd_component_info.md` — generic component info helpers
- `docs/api/classes/dd_area_maintenance_api.md` — maintenance & admin endpoints
- `docs/api/classes/dd_manager.md` — internal request manager/router

Examples folder

- Example RQO JSON files (one per example) are in `docs/api/examples/`. Where a per-method example exists the class docs link to it.
