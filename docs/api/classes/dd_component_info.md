# dd_component_info

Overview

- Generic component information API (widget helpers and lightweight component queries).

How to call

- POST JSON with `dd_api: "dd_component_info"` and `action: "get_widget_dato"`.

Common fields

- `source` should include locator fields used by the component to identify the widget (see method Accepts).

Methods

## get_widget_dato

- **Purpose:** Return the current widget data for a component instance.
- **Accepts:** `source.tipo` (component tipo), `source.section_tipo` (section tipo), `source.section_id` (section id), optional `source.mode` (string, e.g. `"edit"`), and `options.widget_name` (string) to select the widget.
- **Returns:** object with three top-level properties:
- `result`: object|false — the widget dato structure when available (object), otherwise `false`.
- `msg`: string|array — informational message or array of messages (e.g. error messages).
- `errors`: array — validation or runtime errors (empty array when none).

### Example Request: get_widget_dato

```json
{
  "dd_api": "dd_component_info",
  "action": "get_widget_dato",
  "source": {
    "tipo": "oh87",
    "section_tipo": "on1",
    "section_id": "2",
    "mode": "edit"
  },
  "options": {
    "widget_name": "descriptors"
  }
}

```

### Example Response: get_widget_dato

```json
{
  "result": {
    "widget_name": "descriptors",
    "path": "components/widgets/descriptors.php",
    "ipo": "default",
    "data": {
      "title": "Example Widget",
      "descriptors": [
        { "label": "Author", "value": "Jane Doe" },
        { "label": "Year", "value": "1999" }
      ]
    }
  },
  "msg": "OK. Request done successfully",
  "errors": []
}

```

Notes

- If widgets are not defined for the component or the requested `widget_name` cannot be found, the response `result` will be `false` and `msg` will contain error information.
