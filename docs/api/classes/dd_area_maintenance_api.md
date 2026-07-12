# dd_area_maintenance_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_utils_api](dd_utils_api.md) · [dispatch](dispatch.md)

Maintenance and administrative operations: maintenance-widget execution, panel value loads, and component locking.

Registered actions (`src/core/api/dispatch.ts`): `widget_request`, `get_widget_value`, `lock_components_actions`. Widget dispatch and the widget registry live in `src/core/area_maintenance/widgets/registry.ts`; the widget modules sit alongside it in `src/core/area_maintenance/widgets/`.

## How to call

- POST JSON to `/api/v1/json` (or the client-relative `/dedalo/core/api/v1/json`) with `dd_api: "dd_area_maintenance_api"` and `action: "<method>"`.

## Notes

- Most methods require admin or maintenance privileges (enforced inside the dispatcher).
- The maintenance dashboard is a **widget** framework: each panel is one widget, run through `widget_request` (execute) / `get_widget_value` (load). There is no generic class dispatcher — a maintenance operation is always a method of a named widget, and only the methods in that widget's `API_ACTIONS` allowlist are reachable.

## lock_components_actions

### Purpose

Manage component locking state and view active user locks.

### Accepts

- `options`: object (required)
  - `fn_action`: string (required) — one of `get_active_users`, `force_unlock_all_components` (admin-gated inside the dispatcher, `dispatchLockComponentsActions`).

### Returns

`{ result: array|boolean, msg: string }`

### Usage

Area-level lock administration: list active users holding component locks, or force-release all locks. (Per-component focus/blur soft-locks are handled by `dd_utils_api::update_lock_components_state` / `get_lock_status`, not here.)

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

## widget_request

### Purpose

Execute a maintenance widget's action.

### Accepts

- `source`: object (required)
  - `model`: string (required) — the widget name (e.g. `database_info`, `counters_status`, `dataframe_control`)
  - `action`: string (required) — the widget method (per-widget `API_ACTIONS` allowlist)
- `options`: object (optional) — the widget-method arguments

### Returns

The object returned by the widget method (conventionally `{ result, msg, errors }`). The per-widget `API_ACTIONS` allowlist is enforced; a widget with no server implementation denies loudly rather than returning an empty success.

### Example Request

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "widget_request",
  "source": { "model": "dataframe_control", "action": "run_check" },
  "options": {}
}
```

Counter administration rides the same channel — it is a method of the `counters_status` widget (`source.model: "counters_status"`, `source.action: "modify_counter"`), not an action of its own.

## get_widget_value

### Purpose

Load a widget panel's value (always the widget's static `get_value`).

### Accepts

- `source`: object (required)
  - `model`: string (required) — the widget name

### Returns

`{ result: any, msg: string }`

### Example Request

```json
{
  "dd_api": "dd_area_maintenance_api",
  "action": "get_widget_value",
  "source": { "model": "database_info" }
}
```
