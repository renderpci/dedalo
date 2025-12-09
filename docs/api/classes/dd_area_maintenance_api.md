# dd_area_maintenance_api

Overview

- Maintenance and administrative operations: system reindexing, component locking, ontology updates, and maintenance class requests.

How to call

- POST JSON to `/core/api/v1/json/index.php` with `dd_api: "dd_area_maintenance_api"` and `action: "<method>"`.

Notes

- Most methods require admin/maintenance privileges.
- Long-running operations can be checked via `get_process_status` in `dd_utils_api`.

## class_request

### Purpose

Execute maintenance/admin class operations and system maintenance tasks.

### Accepts

- `source`: object (optional)
  - `action`: string (optional) — specific action (e.g., "reindex", "cache_clear", "rebuild_indexes")
- `options`: object (optional)
  - `params`: object (optional) — action-specific parameters
  - `background_running`: boolean (optional, default: false) — run in background
  - `class_name`: string (optional) — specific class to target

### Returns

`{ result: true|false, msg: string, errors: [...], process_id: string }`

### Usage

Generic entry point for maintenance operations. The action parameter determines which maintenance routine runs.

### Example Request

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "class_request",
  "source": {
    "action": "reindex"
  },
  "options": {
    "params": {},
    "background_running": false
  }
}
```

### Example Response

```json
{
  "result": true,
  "msg": "OK. Reindexing completed",
  "process_id": "reindex_2024_01_15_001"
}
```

## lock_components_actions

### Purpose

Manage component locking state and view active user locks.

### Accepts

- `options`: object (required)
  - `fn_action`: string (required) — operation type: "get_active_users", "lock", "unlock", "release_all"
  - `section_tipo`: string (optional) — section type for lock operations
  - `section_id`: int (optional) — section id for lock operations
  - `tipo`: string (optional) — component type for lock operations
  - `user_id`: int (optional) — user performing lock operation

### Returns

`{ result: array|boolean, msg: string }`

### Usage

Prevents concurrent editing conflicts by locking components. Retrieve active locks to display to administrators.

### Example Request (Get Active Users)

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "lock_components_actions",
  "options": {
    "fn_action": "get_active_users"
  }
}
```

### Example Response (Get Active Users)

```json
{
  "result": [
    {
      "user_id": 1,
      "user_name": "admin",
      "locked_section_tipo": "rsc167",
      "locked_section_id": 1,
      "locked_since": "2024-01-15T10:30:00Z"
    },
    {
      "user_id": 2,
      "user_name": "curator",
      "locked_section_tipo": "rsc167",
      "locked_section_id": 5,
      "locked_since": "2024-01-15T10:45:00Z"
    }
  ],
  "msg": "OK"
}
```

### Example Request (Lock Component)

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "lock_components_actions",
  "options": {
    "fn_action": "lock",
    "section_tipo": "rsc167",
    "section_id": 1,
    "tipo": "oh16",
    "user_id": 1
  }
}
```

### Example Response (Lock Component)

```json
{
  "result": true,
  "msg": "OK. Component locked"
}
```

## modify_counter

### Purpose

Increment or reset counter values for system metrics.

### Accepts

- `options`: object (required)
  - `counter_name`: string (required) — counter identifier
  - `operation`: string (required) — "increment", "reset", "get"
  - `value`: int (optional) — value to add (for increment)

### Returns

`{ result: int|true|false, msg: string }`

### Usage

Administrative counter management for tracking usage metrics or system events.

### Example Request

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "modify_counter",
  "options": {
    "counter_name": "api_calls",
    "operation": "increment",
    "value": 1
  }
}
```

### Example Response

```json
{
  "result": true,
  "msg": "OK. Counter updated"
}
```

## parse_simple_schema_changes_files

### Purpose

Parse uploaded schema change files for ontology updates.

### Accepts

- `options`: object (required)
  - `file_path`: string (required) — path to uploaded schema change file
  - `validate_only`: boolean (optional, default: true) — if true, validate without applying changes

### Returns

`{ result: { changes: [...], warnings: [...] }, msg: string, errors: [...] }`

### Usage

Validates ontology schema changes before applying them. Dry-run by default.

### Example Request

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "parse_simple_schema_changes_files",
  "options": {
    "file_path": "/upload/schema_changes_2024.json",
    "validate_only": true
  }
}
```

### Example Response

```json
{
  "result": {
    "changes": [
      {
        "tipo": "oh_new_123",
        "operation": "add_component",
        "model": "component_input_text"
      }
    ],
    "warnings": ["No version match detected"]
  },
  "msg": "OK. Schema validation passed",
  "errors": []
}
```

## widget_request

### Purpose

Execute widget operations and queries.

### Accepts

- `options`: object (required)
  - `widget_name`: string (required) — widget identifier
  - `widget_action`: string (required) — operation to perform
  - `params`: object (optional) — action-specific parameters

### Returns

`{ result: {...}, msg: string }`

### Usage

Handles requests to different administrative widgets (dashboard widgets, stat widgets, etc.).

### Example Request

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "widget_request",
  "options": {
    "widget_name": "stat_widget",
    "widget_action": "get_stats",
    "params": {
      "period": "month"
    }
  }
}
```

### Example Response

```json
{
  "result": {
    "total_records": 1250,
    "new_records_this_month": 45,
    "updated_records": 320
  },
  "msg": "OK"
}
```

## get_widget_value

### Purpose

Retrieve the value of a specific widget.

### Accepts

- `options`: object (required)
  - `widget_name`: string (required) — widget identifier
  - `section_tipo`: string (optional) — section type context

### Returns

`{ result: any, msg: string }`

### Usage

Quick value retrieval from widget without full widget initialization.

### Example Request

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "get_widget_value",
  "options": {
    "widget_name": "record_count",
    "section_tipo": "rsc167"
  }
}
```

### Example Response

```json
{
  "result": 1250,
  "msg": "OK"
}
```
