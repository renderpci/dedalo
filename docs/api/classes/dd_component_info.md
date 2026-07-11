# dd_component_info

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_core_api](dd_core_api.md)

The single-widget compute channel of the [component_info](../../core/components/component_info.md) framework: `get_widget_data` returns one widget's data for a record. It is the byte-identical client's `widget_common.js` autoload path and the **only** delivery path for **async** widgets (`user_activity`).

> **Ported (2026-07-10).** `dd_component_info` **is registered** in the TS action registry (`src/core/api/dispatch.ts` → `componentInfoApiActions`, `src/core/api/handlers/dd_component_info.ts`), `API_ACTIONS = ['get_widget_data']`. Read-time (non-async) widgets are computed during the section read (the `component_info` emit hook → `computeInfoWidgets`); this action serves single-widget and async delivery. Full framework reference: [component_info](../../core/components/component_info.md) and the [widget cookbook → R4](../../core/components/component_info_cookbook.md#r4--make-a-widget-async).

## How to call

- POST JSON with `dd_api: "dd_component_info"` and `action: "get_widget_data"`.

## Common fields

- `source` carries the record coordinates (`tipo`, `section_tipo`, `section_id`, optional `mode`); `options.widget_name` selects the widget.

!!! note "TS is stronger — AUTHZ-01"
    The handler gates the record with `principalCanAccessRecord(section_tipo, section_id, principal)` **before any compute** (a forbidden record returns `{result:false, msg:[' Forbidden record'], errors:['forbidden']}`). PHP computes for any coordinates a logged-in user names. This is a permitted stronger-only divergence.

## get_widget_data

- **Purpose:** Return one widget's data for a record.
- **Accepts:** `source.tipo` (the `component_info` tipo), `source.section_tipo`, `source.section_id`, optional `source.mode` (default `"list"`), and `options.widget_name` (string).
- **Returns:** the `{result, msg, errors}` envelope:
- `result`: array|false — on success the widget's **raw item array** (the same `{widget, key, widget_id, value}` shape the read aggregate emits); `false` on any failure.
- `msg`: string|array — `"OK. Request done successfully"` on success, else the PHP error-envelope byte string(s).
- `errors`: array — empty on success.

### Example Request: get_widget_data

```json
{
  "dd_api": "dd_component_info",
  "action": "get_widget_data",
  "source": {
    "tipo": "dd1633",
    "section_tipo": "dd64",
    "section_id": 42,
    "mode": "edit"
  },
  "options": {
    "widget_name": "user_activity"
  }
}
```

### Example Response: get_widget_data

```jsonc
// success — result is the widget's item array
{
  "result": [
    { "widget": "user_activity", "key": 0, "widget_id": "totals",
      "value": { "who": [], "what": [], "where": [], "when": [], "publish": [] } }
  ],
  "msg": "OK. Request done successfully",
  "errors": []
}
```

## Notes

- Unknown `widget_name` → `{result:false, msg:[" Empty widget_obj for widget <name>"], errors:[]}`; a widgets-less tipo → `{result:false, msg:[" Empty defined widgets for dd_component_info : <label> [<tipo>] "], errors:[]}`; a forbidden record → `{result:false, msg:[' Forbidden record'], errors:['forbidden']}`.
- Handler failures ride as **HTTP 200** (PHP contract), never an HTTP error code.
