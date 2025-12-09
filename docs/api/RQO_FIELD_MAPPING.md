# Dédalo API — RQO Field Mapping

This document contains **precise, method-specific RQO field usage** extracted directly from Dédalo PHP API source code.

## dd_core_api

### start()
**Purpose**: Initialize the application, retrieve environment and session state.  
**RQO Fields Used**:
- `options`: object (optional)
  - `search_obj`: object (optional) — URL parameters
  - `menu`: boolean (optional) — whether to load menu state
  - `recovery`: string (optional) — recovery key for maintenance mode

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "start",
  "options": {
    "search_obj": {},
    "menu": false,
    "recovery": null
  },
  "pretty_print": true
}
```

**Example Response**:
```json
{
  "result": true,
  "msg": "OK",
  "environment": {
    "user_id": 1,
    "user_name": "admin",
    "dedalo_version": "6.0.0",
    "dedalo_build": "2024.01"
  }
}
```

---

### read()
**Purpose**: Retrieve record/component data with optional filtering.  
**RQO Fields Used**:
- `source`: object (required)
  - `section_tipo`: string (required) — section type identifier
  - `action`: string (optional) — "get_value" or default (build_json_rows)
  - Other fields depending on context (section_id, tipo, model, mode, lang)
- `sqo`: object (optional) — search query object with limit, offset, filters

**Example Request**:
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

**Example Response**:
```json
{
  "result": [
    {
      "section_id": 1,
      "section_tipo": "rsc167",
      "data": [
        {
          "tipo": "oh1",
          "value": ["Sample Title"]
        }
      ]
    }
  ],
  "msg": "OK"
}
```

---

### read_raw()
**Purpose**: Retrieve full raw data from database for section or component.  
**RQO Fields Used**:
- `source`: object (required)
  - `tipo`: string (required) — component/section type
  - `section_tipo`: string (required) — section type
  - `section_id`: string/int (required) — section identifier
  - `mode`: string (optional) — "edit" or "list" (default)
  - `model`: string (optional) — component model (auto-derived if not provided)
  - `lang`: string (required) — language code
- `sqo`: object (optional)
  - `section_tipo`: array (required) — section types to query
  - `limit`: int (optional) — max records
  - `filter_by_locators`: array (optional) — specific section/record filters

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "read_raw",
  "source": {
    "tipo": "rsc167",
    "section_tipo": "rsc167",
    "section_id": 1,
    "mode": "edit",
    "model": "section",
    "lang": "lg-eng"
  },
  "sqo": {
    "section_tipo": ["rsc167"],
    "limit": 1
  }
}
```

**Example Response**:
```json
{
  "result": {
    "section_id": 1,
    "section_tipo": "rsc167",
    "data": {
      "oh1": [{value: "Title", lang: "lg-eng"}],
      "oh2": [{value: "Description", lang: "lg-eng"}]
    }
  },
  "msg": "OK"
}
```

---

### create()
**Purpose**: Create a new record in a section.  
**RQO Fields Used**:
- `source`: object (required)
  - `section_tipo`: string (required) — target section type
- `data`: object (optional)
  - `fields`: object (optional) — initial field values

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "create",
  "source": {
    "section_tipo": "rsc167"
  },
  "data": {
    "fields": {
      "title": "New Record"
    }
  }
}
```

**Example Response**:
```json
{
  "result": {
    "section_id": 125,
    "section_tipo": "rsc167"
  },
  "msg": "OK. Record created successfully"
}
```

---

### duplicate()
**Purpose**: Duplicate an existing record.  
**RQO Fields Used**:
- `source`: object (required)
  - `section_id`: int (required) — source record to duplicate
  - `section_tipo`: string (required) — section type

**Example Request**:
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

**Example Response**:
```json
{
  "result": {
    "section_id": 126,
    "section_tipo": "rsc167"
  },
  "msg": "OK. Record duplicated successfully"
}
```

---

### delete()
**Purpose**: Delete a record or section data.  
**RQO Fields Used**:
- `source`: object (required)
  - `tipo`: string (required) — component/section type
  - `section_tipo`: string (required) — section type
  - `section_id`: int (required) — record to delete
  - `delete_mode`: string (optional, default: "delete_data") — deletion strategy
- `options`: object (optional)
  - `delete_with_children`: boolean (optional, default: false) — cascade delete
  - `delete_diffusion_records`: boolean (optional) — delete linked diffusion records
- `sqo`: object (optional) — search criteria for bulk deletion

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "delete",
  "source": {
    "tipo": "rsc167",
    "section_tipo": "rsc167",
    "section_id": 1
  },
  "options": {
    "delete_with_children": false,
    "delete_diffusion_records": false
  }
}
```

**Example Response**:
```json
{
  "result": true,
  "msg": "OK. Record deleted successfully"
}
```

---

### save()
**Purpose**: Save component data to a record.  
**RQO Fields Used**:
- `source`: object (required)
  - `type`: string (required, typically "component") — object type being saved
  - `model`: string (required) — component model (e.g., "component_input_text")
  - `tipo`: string (required) — component type
  - `section_tipo`: string (required) — parent section type
  - `section_id`: int (required) — parent section id
  - `mode`: string (optional, default: "list") — "edit" or "list"
  - `lang`: string (required) — language code
  - `view`: string (optional) — component view variant
  - `caller_dataframe`: object (optional) — parent context
- `data`: object (required)
  - `changed_data`: array (required) — array of change objects
    - `action`: string — "update", "insert", "remove", "add_new_element", "sort_data"
    - `key`: int — index in dato array (for update/remove)
    - `value`: any — new value to set
  - `datalist`: array (optional) — parent datalist context
  - `pagination`: object (optional) — pagination state (limit, offset)

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "save",
  "source": {
    "type": "component",
    "model": "component_input_text",
    "tipo": "oh16",
    "section_tipo": "oh1",
    "section_id": 124,
    "mode": "edit",
    "lang": "lg-eng"
  },
  "data": {
    "changed_data": [
      {
        "action": "update",
        "key": 0,
        "value": "Updated Title"
      }
    ]
  }
}
```

**Example Response**:
```json
{
  "result": {
    "tipo": "oh16",
    "value": ["Updated Title"],
    "context": {
      "model": "component_input_text",
      "permissions": 3
    }
  },
  "msg": "OK. Request save done successfully"
}
```

---

### count()
**Purpose**: Count records matching SQO criteria.  
**RQO Fields Used**:
- `sqo`: object (required)
  - `section_tipo`: array (required) — section types to count
  - `limit`: int (optional) — max results
  - `offset`: int (optional) — pagination offset
  - Other filter criteria (filters, search terms, etc.)

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "count",
  "sqo": {
    "section_tipo": ["rsc167"],
    "limit": 100
  }
}
```

**Example Response**:
```json
{
  "result": 42,
  "msg": "OK"
}
```

---

### get_element_context()
**Purpose**: Retrieve context information for a specific component/element.  
**RQO Fields Used**:
- `source`: object (required)
  - `section_tipo`: string (required)
  - `section_id`: int (required)
  - `tipo`: string (required) — component type

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "get_element_context",
  "source": {
    "section_tipo": "rsc167",
    "section_id": 1,
    "tipo": "oh16"
  }
}
```

---

### get_section_elements_context()
**Purpose**: Retrieve context for all components in a section.  
**RQO Fields Used**:
- `source`: object (required)
  - `section_tipo`: string (required)
  - `section_id`: int (required)

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "get_section_elements_context",
  "source": {
    "section_tipo": "rsc167",
    "section_id": 1
  }
}
```

---

### get_ontology_info()
**Purpose**: Retrieve ontology type information.  
**RQO Fields Used**:
- `source`: object (optional)
  - `tipo`: string (optional) — specific type to query

**Example Request**:
```json
{
  "dd_api": "dd_core_api",
  "action": "get_ontology_info",
  "source": {
    "tipo": "rsc167"
  }
}
```

---

## dd_utils_api

### login()
**Purpose**: Authenticate user with username and password.  
**RQO Fields Used**:
- `options`: object (required)
  - `username`: string (required) — user login name
  - `auth`: string (required) — user password

**Example Request**:
```json
{
  "dd_api": "dd_utils_api",
  "action": "login",
  "options": {
    "username": "admin",
    "auth": "password123"
  }
}
```

**Example Response**:
```json
{
  "result": true,
  "msg": "OK",
  "user_id": 1,
  "user_name": "admin",
  "session_id": "sess_abc123xyz"
}
```

---

### quit()
**Purpose**: Logout current user session.  
**RQO Fields Used**:
- `options`: object (optional) — typically empty

**Example Request**:
```json
{
  "dd_api": "dd_utils_api",
  "action": "quit",
  "options": {}
}
```

**Example Response**:
```json
{
  "result": true,
  "msg": "OK. Session terminated"
}
```

---

### upload()
**Purpose**: Upload a file to server.  
**RQO Fields Used**:
- `options`: object (required)
  - `file_to_upload` or `file` or `upload`: object (required) — PHP $_FILES entry
    - `name`: string — original filename
    - `type`: string — MIME type
    - `tmp_name`: string — temporary file path
    - `error`: int — upload error code
    - `size`: int — file size in bytes
  - `key_dir`: string (required) — upload directory key (e.g., "media/upload")
  - `tipo`: string (optional) — media type (if media upload)
  - `chunked`: boolean|string (optional) — whether this is a chunked upload

**Example Request** (multipart/form-data):
```json
{
  "dd_api": "dd_utils_api",
  "action": "upload",
  "options": {
    "key_dir": "media/upload",
    "tipo": null,
    "chunked": false
  }
}
```

**Example Response**:
```json
{
  "result": true,
  "msg": "OK. File uploaded",
  "file_info": {
    "name": "image.jpg",
    "size": 102400,
    "path": "/media/upload/image.jpg"
  }
}
```

---

### list_uploaded_files()
**Purpose**: List files in upload directory.  
**RQO Fields Used**:
- `options`: object (required)
  - `key_dir`: string (required) — directory key to list

**Example Request**:
```json
{
  "dd_api": "dd_utils_api",
  "action": "list_uploaded_files",
  "options": {
    "key_dir": "media/upload"
  }
}
```

**Example Response**:
```json
{
  "result": [
    {"name": "image1.jpg", "size": 102400, "date": "2024-01-15"},
    {"name": "image2.png", "size": 204800, "date": "2024-01-14"}
  ],
  "msg": "OK"
}
```

---

### get_system_info()
**Purpose**: Retrieve system and server information.  
**RQO Fields Used**:
- `options`: object (optional) — typically empty

**Example Request**:
```json
{
  "dd_api": "dd_utils_api",
  "action": "get_system_info",
  "options": {}
}
```

**Example Response**:
```json
{
  "result": {
    "php_version": "8.3.0",
    "postgresql_version": "16.0",
    "disk_space": "500GB free",
    "memory": "16GB"
  },
  "msg": "OK"
}
```

---

## dd_area_maintenance_api

### class_request()
**Purpose**: Execute maintenance/admin class operations.  
**RQO Fields Used**:
- `source`: object (optional)
  - `action`: string (optional) — specific action (e.g., "reindex")
- `options`: object (optional)
  - `params`: object (optional) — action-specific parameters
  - `background_running`: boolean (optional) — run in background

**Example Request**:
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

**Example Response**:
```json
{
  "result": true,
  "msg": "OK. Reindexing completed"
}
```

---

### lock_components_actions()
**Purpose**: Manage component locking state.  
**RQO Fields Used**:
- `options`: object (required)
  - `fn_action`: string (required) — "get_active_users", "lock", "unlock", etc.
  - `section_tipo`: string (optional) — section type for lock operations
  - `section_id`: int (optional) — section id for lock operations
  - `tipo`: string (optional) — component type for lock operations

**Example Request**:
```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "lock_components_actions",
  "options": {
    "fn_action": "get_active_users"
  }
}
```

**Example Response**:
```json
{
  "result": [
    {"user_id": 1, "user_name": "admin", "locked_since": "2024-01-15T10:30:00Z"}
  ],
  "msg": "OK"
}
```

---

## Standard RQO Envelope

All API calls use a standard envelope structure:

```json
{
  "dd_api": "dd_core_api",
  "action": "read",
  "source": {},
  "sqo": {},
  "show": [],
  "options": {},
  "data": {},
  "prevent_lock": false,
  "pretty_print": false
}
```

### Envelope Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dd_api` | string | Yes | Target API class (e.g., "dd_core_api", "dd_utils_api") |
| `action` | string | Yes | Method name to call |
| `source` | object | No* | Source context (record, section, component info) |
| `sqo` | object | No* | Search query object (filtering, pagination) |
| `show` | array | No | Fields to return in response |
| `options` | object | No | Method-specific options |
| `data` | object | No | Payload data (for save, create operations) |
| `prevent_lock` | boolean | No | Skip component locking |
| `pretty_print` | boolean | No | Format JSON response for readability |

*Required fields depend on specific method (indicated in method documentation above).
