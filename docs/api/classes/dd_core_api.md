# dd_core_api

Overview

- Core Dédalo API for section/record lifecycle and page context. Commonly used by front-end page builders and components.

How to call

- POST JSON to `/core/api/v1/json/index.php` with `dd_api: "dd_core_api"` and `action: "<method>"`.
- The request uses the Request Query Object (RQO) shape: `dd_api`, `action`, `source`, `sqo`, `show`, `options`, `data`, `prevent_lock`, `pretty_print`.

Notes

- `source` and `sqo` are central: when missing the server frequently builds sensible defaults from `source` metadata.
- For file uploads use multipart/form-data; the index auto-creates the upload RQO and forwards `$_FILES` into `rqo->options`.

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

`{ result: [records], msg: string, errors: [...] }`

### Usage

Core method for reading record data. Can fetch full section data or specific component values.

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
  "result": [
    {
      "section_id": 1,
      "section_tipo": "rsc167",
      "data": [
        {
          "tipo": "oh1",
          "value": ["Sample Title"]
        },
        {
          "tipo": "oh2",
          "value": ["Sample Description"]
        }
      ]
    }
  ],
  "msg": "OK"
}
```

## read_raw

### Purpose

Retrieve full raw data from database for section or component.

### Accepts

- `source`: object (required)
  - `tipo`: string (required) — component/section type
  - `section_tipo`: string (required) — section type
  - `section_id`: string/int (required) — section identifier
  - `mode`: string (optional, default: "edit") — "edit" or "list"
  - `model`: string (optional) — component model (auto-derived if not provided)
  - `lang`: string (required) — language code
- `sqo`: object (optional)
  - `section_tipo`: array (required) — section types to query
  - `limit`: int (optional) — max records
  - `filter_by_locators`: array (optional) — specific section/record filters

### Returns

`{ result: { section_id, section_tipo, data: {...} }, msg: string }`

### Usage

Returns all raw data from database without filtering. Useful for exports or admin purposes.

### Example Request

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

### Example Response

```json
{
  "result": {
    "section_id": 1,
    "section_tipo": "rsc167",
    "data": {
      "oh1": [
        {
          "value": "Title",
          "lang": "lg-eng"
        }
      ],
      "oh2": [
        {
          "value": "Description",
          "lang": "lg-eng"
        }
      ]
    }
  },
  "msg": "OK"
}
```

## create

### Purpose

Create a new record in a section.

### Accepts

- `source`: object (required)
  - `section_tipo`: string (required) — target section type
- `data`: object (optional)
  - `fields`: object (optional) — initial field values

### Returns

`{ result: { section_id, section_tipo }, msg: string }`

### Usage

Creates a new blank record. Optional `data.fields` can pre-populate values.

### Example Request

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

### Example Response

```json
{
  "result": {
    "section_id": 125,
    "section_tipo": "rsc167"
  },
  "msg": "OK. Record created successfully"
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

`{ result: { section_id, section_tipo }, msg: string }`

### Usage

Creates a complete copy of the source record, including all component data.

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
  "result": {
    "section_id": 126,
    "section_tipo": "rsc167"
  },
  "msg": "OK. Record duplicated successfully"
}
```

## delete

### Purpose

Delete a record or section data.

### Accepts

- `source`: object (required)
  - `tipo`: string (required) — component/section type
  - `section_tipo`: string (required) — section type
  - `section_id`: int (required) — record to delete
  - `delete_mode`: string (optional, default: "delete_data") — deletion strategy
- `options`: object (optional)
  - `delete_with_children`: boolean (optional, default: false) — cascade delete child records
  - `delete_diffusion_records`: boolean (optional) — delete linked diffusion records
- `sqo`: object (optional) — search criteria for bulk deletion

### Returns

`{ result: true|false, msg: string, errors: [...] }`

### Usage

Deletes a record. By default, does not cascade. Use `delete_with_children: true` for recursive deletion.

### Example Request

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

### Example Response

```json
{
  "result": true,
  "msg": "OK. Record deleted successfully"
}
```

## save

### Purpose

Save component data to a record.

### Accepts

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
  - `changed_data`: array (required) — array of change objects:
    - `action`: string — "update", "insert", "remove", "add_new_element", "sort_data"
    - `key`: int — index in dato array (for update/remove)
    - `value`: any — new value to set
  - `datalist`: array (optional) — parent datalist context
  - `pagination`: object (optional) — pagination state (limit, offset)

### Returns

`{ result: { tipo, value, context }, msg: string, errors: [...] }`

### Usage

Core method for saving component changes. Each change is wrapped in a change object with action type and value.

### Example Request

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

### Example Response

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

`{ result: number, msg: string }`

### Usage

Returns the total count of records matching the search query object criteria.

### Example Request

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

### Example Response

```json
{
  "result": 42,
  "msg": "OK"
}
```

## get_element_context

### Purpose

Retrieve context information for a specific component/element.

### Accepts

- `source`: object (required)
  - `section_tipo`: string (required)
  - `section_id`: int (required)
  - `tipo`: string (required) — component type

### Returns

`{ result: { context_data }, msg: string }`

### Usage

Returns metadata and validation rules for a specific component instance.

### Example Request

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

### Example Response

```json
{
  "result": {
    "tipo": "oh16",
    "model": "component_input_text",
    "label": "Title",
    "permissions": 3,
    "required": true
  },
  "msg": "OK"
}
```

## get_section_elements_context

### Purpose

Retrieve context for all components in a section.

### Accepts

- `source`: object (required)
  - `section_tipo`: string (required)
  - `section_id`: int (required)

### Returns

`{ result: [{ context_for_each_element }], msg: string }`

### Usage

Returns metadata for all components in a section record.

### Example Request

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

## get_ontology_info

### Purpose

Retrieve ontology type information.

### Accepts

- `source`: object (optional)
  - `tipo`: string (optional) — specific type to query

### Returns

`{ result: { ontology_data }, msg: string }`

### Usage

Returns schema/metadata about a specific ontology type or all types if no tipo specified.

### Example Request

```json
{
  "dd_api": "dd_core_api",
  "action": "get_ontology_info",
  "source": {
    "tipo": "rsc167"
  }
}
```

### Example Response

```json
{
  "result": {
    "tipo": "rsc167",
    "model": "section",
    "label": "Resource",
    "components": [
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
    ]
  },
  "msg": "OK"
}
```
