# dd_ts_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_core_api](dd_core_api.md)

Thesaurus / hierarchical-tree API. Use it to read nodes and their children, and to manage tree ordering and parentage.

## How to call

- POST JSON with `dd_api: "dd_ts_api"` and `action` set to one of the methods below.

## Common fields

- `source` carries the node identifiers (`section_tipo`, `section_id`) and related locator information.
- `options` may carry payload data for the add/update operations.

## get_node_data

- **Purpose:** return the parsed data for a thesaurus node.
- **Accepts:** `source.section_tipo` (string), `source.section_id` (string|int), optional `source.children_tipo` (component tipo), optional `source.area_model` (string, defaults to `area_thesaurus`), optional `options.thesaurus_view_mode` (`default` | `model`).
- **Returns:** `result` holds the parsed child-data object (as produced by `ts_object::parse_child_data`), or `false` on error; `msg` carries the status and `errors` holds any issues.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "get_node_data",
  "source": { "section_tipo": "oh1", "section_id": "1" },
  "options": {}
}
```

### Example response

```json
{
  "result": true,
  "msg": "OK",
  "data": []
}
```

## get_children_data

- **Purpose:** list the children of a given node.
- **Accepts:** `source.section_tipo`, `source.section_id`, optional `source.children_tipo`, optional `source.children` (array of locator objects), optional `source.model` (area model string), `options.pagination` (object with `limit`, `offset`, `total`), optional `options.thesaurus_view_mode`.
- **Returns:** `result` is an object with `ar_children_data` (array of parsed children) and `pagination` (object with `limit`, `offset`, `total`); `msg` carries the status.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "get_children_data",
  "source": { "section_tipo": "oh1", "section_id": "1" },
  "options": { "pagination": { "limit": 50, "offset": 0 } }
}
```

### Example response

```json
{
  "result": {
    "ar_children_data": [],
    "pagination": { "limit": 50, "offset": 0, "total": 0 }
  },
  "msg": "OK"
}
```

## add_child

- **Purpose:** add a child node under a parent.
- **Accepts:** `source.section_tipo` (string, new child tipo), `source.section_id` (string|int, parent section id).
- **Returns:** `result` is the newly created `section_id` (int) on success; `msg` carries the status and `errors` may hold issues.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "add_child",
  "source": { "section_tipo": "oh1", "section_id": "1" }
}
```

### Example response

```json
{
  "result": 123,
  "msg": "Record created"
}
```

## update_parent_data

- **Purpose:** move a node to a new parent.
- **Accepts:** `source.section_tipo`, `source.section_id`, `source.old_parent_section_id`, `source.old_parent_section_tipo`, `source.new_parent_section_id`, `source.new_parent_section_tipo`.
- **Returns:** boolean `result` (`true` on success); `msg` carries the status and `errors` on failure.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "update_parent_data",
  "source": {
    "section_tipo": "oh1",
    "section_id": "1",
    "old_parent_section_id": "45",
    "old_parent_section_tipo": "oh1",
    "new_parent_section_id": "67",
    "new_parent_section_tipo": "oh1"
  }
}
```

### Example response

```json
{
  "result": true,
  "msg": "Record updated"
}
```

## save_order

- **Purpose:** save the ordering of a node's children.
- **Accepts:** `source.section_tipo` (string) and `source.ar_locators` (array of locators with ordering information).
- **Returns:** `result` is the value returned by `component_relation_children::sort_children` (an array of changed values), or `false` on error; `msg` explains the result.

### Example request

```json
{
  "dd_api": "dd_ts_api",
  "action": "save_order",
  "source": {
    "section_tipo": "oh1",
    "ar_locators": [
      { "section_id": "321", "order": 1 },
      { "section_id": "322", "order": 2 }
    ]
  }
}
```

### Example response

```json
{
  "result": true,
  "msg": "Record updated"
}
```

