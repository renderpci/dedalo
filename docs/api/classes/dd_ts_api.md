
# dd_ts_api

Overview

- Thesaurus / hierarchical tree API. Used to read nodes, children and manage tree ordering.

How to call

- POST JSON with `dd_api: "dd_ts_api"` and `action` set to one of the methods below.

Common fields

- `source` typically contains node identifiers or locator information. `options` may include payload data for add/update operations.

Methods

- get_node_data

## Methods

### Example Request

```json
{
  "dd_api": "dd_ts_api",
  "action": "get_node_data",
  "source": {
    "section_tipo": "doc_tipo_1"
  },
  "sqo": {
    "limit": 10
  }
}
```

### Example Response

```json
{
  "result": true,
  "msg": "OK",
  "data": []
}
```

- Purpose: Return information for a thesaurus node.

### Example Request - 2

```json
{
  "dd_api": "dd_ts_api",
  "action": "get_node_data",
  "options": {}
}
```

### Example Response - 2

```json
{
  "result": true,
  "msg": "OK"
}
```

- Accepts: `source.section_tipo` (string), `source.section_id` (string|int), optional `source.children_tipo` (component tipo), optional `source.area_model` (string, defaults to `area_thesaurus`), optional `options.thesaurus_view_mode` (`default`|`model`).
- Returns: `response.result` contains the parsed child data object (as produced by `ts_object::parse_child_data`) or `false` on error; `msg` provides status and `errors` holds issues.
- Example:

    ```json
    {
      "dd_api": "dd_ts_api",
      "action": "get_node_data",
      "source": { "node_id": 123 },
      "options": {}
    }

    ```

- get_children_data

### Example Request - 3

```json
{
  "dd_api": "dd_ts_api",
  "action": "get_children_data",
  "source": {
    "section_tipo": "doc_tipo_1"
  },
  "sqo": {
    "limit": 10
  }
}
```

### Example Response - 3

```json
{
  "result": true,
  "msg": "OK",
  "data": []
}
```

- Purpose: List children nodes for a given node.

### Example Request - 4

```json
{
  "dd_api": "dd_ts_api",
  "action": "get_children_data",
  "options": {}
}
```

### Example Response - 4

```json
{
  "result": true,
  "msg": "OK"
}
```

- Accepts: `source.section_tipo`, `source.section_id`, optional `source.children_tipo`, optional `source.children` (array of locator objects), optional `source.model` (area model string), `options.pagination` (object with `limit`, `offset`, `total`), optional `options.thesaurus_view_mode`.
- Returns: object in `response.result` with keys: `ar_children_data` (array of parsed children) and `pagination` (object with `limit`, `offset`, `total`). `msg` contains status.
- Example:

    ```json
    {
      "dd_api": "dd_ts_api",
      "action": "get_children_data",
      "source": { "node_id": 123, "recursive": true },
      "options": { "limit": 50 }
    }

    ```

- add_child

### Example Request - 5

```json
{
  "dd_api": "dd_ts_api",
  "action": "add_child",
  "source": {
    "section_tipo": "doc_tipo_1"
  },
  "data": {
    "component_tipo_1": "value"
  }
}
```

### Example Response - 5

```json
{
  "result": true,
  "msg": "Record created",
  "section_id": 123
}
```

- Purpose: Add a child node under a parent.

### Example Request - 6

```json
{
  "dd_api": "dd_ts_api",
  "action": "add_child",
  "options": {}
}
```

### Example Response - 6

```json
{
  "result": true,
  "msg": "OK"
}
```

- Accepts: `source.section_tipo` (string, new child tipo), `source.section_id` (string|int, parent section id).
- Returns: `response.result` is the newly created `section_id` (int) on success; `msg` contains status and `errors` may include issues.
- Example:

    ```json
    {
      "dd_api": "dd_ts_api",
      "action": "add_child",
      "source": { "parent_node_id": 123 },
      "data": { "label": "New child", "properties": {} }
    }

    ```

- update_parent_data

### Example Request - 7

```json
{
  "dd_api": "dd_ts_api",
  "action": "update_parent_data",
  "source": {
    "section_id": 1,
    "section_tipo": "doc_tipo_1"
  },
  "data": {
    "component_tipo_1": "updated value"
  }
}
```

### Example Response - 7

```json
{
  "result": true,
  "msg": "Record updated"
}
```

- Purpose: Update parent metadata for a node.

### Example Request - 8

```json
{
  "dd_api": "dd_ts_api",
  "action": "update_parent_data",
  "options": {}
}
```

### Example Response - 8

```json
{
  "result": true,
  "msg": "OK"
}
```

- Accepts: `source.section_tipo`, `source.section_id`, `source.old_parent_section_id`, `source.old_parent_section_tipo`, `source.new_parent_section_id` (or `parent_section_id`), `source.new_parent_section_tipo`.
- Returns: boolean `response.result` (`true` on success); `msg` contains status and `errors` on failure.
- Example:

    ```json
    {
      "dd_api": "dd_ts_api",
      "action": "update_parent_data",
      "source": { "node_id": 123 },
      "data": { "parent": 45 }
    }

    ```

- save_order

### Example Request - 9

```json
{
  "dd_api": "dd_ts_api",
  "action": "save_order",
  "source": {
    "section_id": 1,
    "section_tipo": "doc_tipo_1"
  },
  "data": {
    "component_tipo_1": "updated value"
  }
}
```

### Example Response - 9

```json
{
  "result": true,
  "msg": "Record updated"
}
```

- Purpose: Save ordering for children of a node.

### Example Request - 10

```json
{
  "dd_api": "dd_ts_api",
  "action": "save_order",
  "options": {}
}
```

### Example Response - 10

```json
{
  "result": true,
  "msg": "OK"
}
```

- Accepts: `source.section_tipo` (string) and `source.ar_locators` (array of locators with ordering information).
- Returns: `response.result` is the value returned by `component_relation_children::sort_children` (an array of changed values) or `false` on error; `response.msg` explains the result and `response.result` may also be used to count changes.
- Example:

    ```json
    {
      "dd_api": "dd_ts_api",
      "action": "save_order",
      "dd_api": "dd_ts_api",
      "source": { "section_tipo": "ds1", "ar_locators": [{ "section_id": "321", "order": 1 }, { "section_id": "322", "order": 2 }] }
    }

    ```
