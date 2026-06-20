# dd_component_portal_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_core_api](dd_core_api.md)

API for portal component operations (locators and portal-specific actions).

## How to call

- POST JSON with `dd_api: "dd_component_portal_api"` and `action` (for example, `delete_locator`).

## Common fields

- `source` contains component locators/identifiers (`section_tipo`, `section_id`, `tipo`, `lang`).
- `options` contains component-specific payloads such as `locator` and `ar_properties`.

## delete_locator

- **Purpose:** remove matching locators from a component's `dato` (used when unlinking or clearing portal selections).
- **Accepts:**
    - `source.section_tipo` (string)
    - `source.section_id` (string|int)
    - `source.tipo` (string)
    - optional `source.lang` (string)
    - `options.locator` (object) — full or partial locator, e.g. `{ "tag_id": "2", "type": "dd96" }`
    - optional `options.ar_properties` (array of property names to compare, e.g. `["tag_id","type"]`)
- **Returns:** an object with:
    - `result`: integer — number of removed locators (`0` when none removed)
    - `msg`: array|string — informational messages
    - `errors`: array — errors, if any

### Example request

```json
{
  "dd_api": "dd_component_portal_api",
  "action": "delete_locator",
  "source": { "section_tipo": "rsc167", "section_id": "2", "tipo": "rsc36", "lang": "lg-spa" },
  "options": { "locator": { "tag_id": "2", "type": "dd96" }, "ar_properties": ["tag_id","type"] }
}
```

### Example response

```json
{
  "result": 3,
  "msg": ["Deleted 3 locators (model - rsc36)"],
  "errors": []
}
```
