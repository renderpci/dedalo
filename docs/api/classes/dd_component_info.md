# dd_component_info

> See also: [JSON API v1](../dedalo_api_v1.md) · [component_info](../../core/components/component_info.md) · [dispatch](dispatch.md)

The single-widget compute channel of the [component_info](../../core/components/component_info.md) framework: `get_widget_data` returns one widget's data for one record. It is the client's autoload path and the **only** delivery path for **async** widgets (`user_activity`).

Registered actions (`src/core/api/handlers/dd_component_info.ts`): `get_widget_data`.

Read-time (non-async) widgets are not fetched through it: they are computed during the section read by the `component_info` emit hook. Full framework reference: [component_info](../../core/components/component_info.md) and the [widget cookbook → R4](../../core/components/component_info_cookbook.md#r4-make-a-widget-async).

## How to call

- POST JSON to `/api/v1/json` with `dd_api: "dd_component_info"` and `action: "get_widget_data"`.
- The record coordinates ride in `rqo.source`; `options.widget_name` selects the widget.
- A session is required and the dispatcher's CSRF gate applies.

## get_widget_data

### Purpose

Return one widget's data for one record.

### Accepts

- `source`: object (required)
    - `tipo`: string (required) — the `component_info` node.
    - `section_tipo`: string (required), `section_id`: int (required) — the host record. A record address is an integer.
    - `mode`: string (optional, default `"list"`).
- `options.widget_name`: string (required) — one of the `widget_name` values declared in the component's ontology `properties.widgets`.

### Authorization

The **record** is gated before anything is computed: the principal must pass the record-scope check for `section_tipo` / `section_id`. A caller cannot use widget coordinates to probe a record they may not read.

### Returns

`{ ok: true, request_id, data }` where `data` is the widget's **raw item array** — the same `{ widget, key, widget_id, value }` shape the read aggregate emits, one entry per IPO entry of the widget definition.

Envelope: **v2**. A refusal is `{ ok: false, request_id, error: { code, category, message, label_key, retryable } }`, and it carries the registry's HTTP status — a failure is no longer an HTTP-200 body with `result: false`. There is no `result` key; the v1 `{ result, msg, errors }` shape was removed on 2026-08-16.

### Errors

| code | when |
| --- | --- |
| `perm.denied` | the caller may not read the host record. |
| `widget.empty` | the `component_info` node declares no `properties.widgets` at all. |
| `widget.not_defined` | `options.widget_name` is not one of the node's declared widgets, or names a widget with no registry entry. |
| `widget.unported` | the widget is registered but its server compute is not implemented yet. |

### Example request

```json
{
  "dd_api": "dd_component_info",
  "action": "get_widget_data",
  "source": {
    "tipo": "dd1537",
    "section_tipo": "dd128",
    "section_id": 1,
    "mode": "edit"
  },
  "options": {
    "widget_name": "user_activity"
  }
}
```

!!! note
    `dd1537` is the `component_info` "User activity" of the **Users** section `dd128`; it declares exactly one widget, `user_activity`, which is the framework's async widget. These are core `dd` tipos, so they are the same on every install.

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee40",
  "data": [
    {
      "widget": "user_activity",
      "key": 0,
      "widget_id": "totals",
      "value": { "who": [], "what": [], "where": [], "when": [], "publish": [] }
    }
  ]
}
```

`value` is `null` when the widget has no actionable data in any dimension.
