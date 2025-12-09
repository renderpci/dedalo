# dd_component_3d_api

Overview

- 3D component helpers: file management and posterframe handling for 3D assets.

How to call

- POST JSON with `dd_api: "dd_component_3d_api"` and `action` such as `move_file_to_dir`, `delete_posterframe`.

Common fields

- `options.file_data` or `options.target_dir` for move operations; `source` holds identifiers.

## move_file_to_dir

- **Purpose:** Move an uploaded 3D file to a target folder (usually used to install uploaded posterframes or 3D assets).
- **Accepts:** `source.tipo`, `source.section_tipo`, `source.section_id`; `options.file_data` (object with `name`, `tmp_dir`, `key_dir`, `tmp_name`), and `options.target_dir` (string, e.g. `posterframe`).
- **Returns:** boolean `response.result` indicating success and `msg`; `errors` array contains failures. When `target_dir==='posterframe'` the API also creates thumbs and saves the component.

### Example Request: move_file_to_dir

```json
{
  "dd_api": "dd_component_3d_api",
  "action": "move_file_to_dir",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": "2" },
  "options": {
    "file_data": { "name": "test26_test3_1.obj", "tmp_dir": "DEDALO_UPLOAD_TMP_DIR", "key_dir": "3d", "tmp_name": "tmp_test.obj" },
    "target_dir": "models"
  }
}

```

### Example Response: move_file_to_dir

```json
{
  "result": true,
  "msg": "OK. Request done successfully dd_component_3d_api::move_file_to_dir",
  "errors": []
}

```

## delete_posterframe

- **Purpose:** Delete generated posterframe images for a 3D model.
- **Accepts:** `source.tipo`, `source.section_tipo`, `source.section_id`.
- **Returns:** boolean `response.result` indicating success and `msg` with status; `errors` for failure.

### Example Request: delete_posterframe

```json
{
  "dd_api": "dd_component_3d_api",
  "action": "delete_posterframe",
  "source": { "tipo": "rsc36", "section_tipo": "rsc167", "section_id": "2" }
}

```

### Example Response: delete_posterframe

```json
{
  "result": true,
  "msg": "OK. Request done successfully dd_component_3d_api::delete_posterframe",
  "errors": []
}
