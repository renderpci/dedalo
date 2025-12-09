# dd_component_portal_api

Overview

- API for portal component operations (locators, portal-specific actions).

How to call

- POST JSON with `dd_api: "dd_component_portal_api"` and `action` (e.g. `delete_locator`).

Common fields

- `source` contains component locators/identifiers (e.g. `section_tipo`, `section_id`, `tipo`, `lang`).
- `options` contains component-specific payloads such as `locator` and `ar_properties`.

Methods

## delete_locator

- **Purpose:** Remove matching locators from a component's `dato` (used when unlinking or clearing portal selections).
- **Accepts:**
- `source.section_tipo` (string)
- `source.section_id` (string|int)
- `source.tipo` (string)
- optional `source.lang` (string)

### Example Request: delete_locator

```json
{
  "dd_api": "dd_component_portal_api",
  "action": "optional",
  "options": {}
}
```

### Example Response: delete_locator

```json
{
  "result": true,
  "msg": "OK"
}
```

- `options.locator` (object — full or partial locator, e.g. `{ "tag_id": "2", "type": "dd96" }`)
- optional `options.ar_properties` (array of property names to compare, e.g. `["tag_id","type"]`)

### Example Request: delete_locator - 2

```json
{
  "dd_api": "dd_component_portal_api",
  "action": "optional",
  "options": {}
}
```

### Example Response: delete_locator - 2

```json
{
  "result": true,
  "msg": "OK"
}
```

- **Returns:** object with:
- `result`: integer — number of removed locators (0 when none removed)
- `msg`: array|string — informational messages
- `errors`: array — errors if any

### Example Request: delete_locator - 3

```json
{
  "dd_api": "dd_component_portal_api",
  "action": "delete_locator",
  "source": { "section_tipo": "rsc167", "section_id": "2", "tipo": "rsc36", "lang": "lg-spa" },
  "options": { "locator": { "tag_id": "2", "type": "dd96" }, "ar_properties": ["tag_id","type"] }
}

```

### Example Response: delete_locator - 3

```json
{
  "result": 3,
  "msg": ["Deleted 3 locators (model - rsc36)"],
  "errors": []
}
