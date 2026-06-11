# register.json reference (v7 format)

Every tool ships a `register.json` in its root directory. It is read by `tools_register::import_tools()` (System administration → Maintenance → "Register tools") and persisted into the tools registry section (dd1324).

The machine-readable source of truth is the JSON Schema at `tools/tool_common/register.schema.json` — point your editor at it for autocomplete and validation:

``` json
{ "$schema": "../tool_common/register.schema.json", "...": "..." }
```

The same rules are enforced at registration by `tools_register::validate_register()`: an invalid file is refused with explicit errors in the import report.

## Minimal file

``` json
{
	"$schema": "../tool_common/register.schema.json",
	"name": "tool_myorg_mytool",
	"version": "1.0.0",
	"label": { "lg-eng": "My tool" }
}
```

Defaults applied at registration: `active: true`, `show_in_inspector/show_in_component/require_translatable/always_active: false`, `affected_tipos: []`.

## Fields

| Field | Type | Description |
| --- | --- | --- |
| `name` | string, **required** | Tool name, `^tool_[a-z0-9_]+$`, must equal the directory name |
| `version` | string, **required** | Semantic version, e.g. `1.0.0` |
| `label` | object, **required** | Display label keyed by lang code (`lg-eng`, `lg-spa`...). One language suffices; the client falls back |
| `description` | object | Free description per lang. HTML allowed |
| `developer` | string | Author name(s) |
| `dedalo_version_min` | string | Minimum compatible Dédalo version. Registration is **refused** on older installs |
| `affected_models` | string[] | Models the tool applies to, e.g. `["section"]`, `["component_input_text","component_text_area"]`, or `["all_components"]`. Resolved against the models section (dd1342) at registration; unknown names are skipped with an error log |
| `affected_tipos` | string[] | Optional restriction to specific ontology tipos (e.g. `["rsc36"]`). Empty = no restriction |
| `show_in_inspector` | bool | Tool button in the section inspector panel |
| `show_in_component` | bool | Tool button inline on matching components |
| `require_translatable` | bool | Only offer the tool on translatable components |
| `always_active` | bool | Available to every user regardless of tools-profile authorization |
| `active` | bool | Active status after registration (default true) |
| `properties` | object\|null | UI/behavior hints: `{"open_as": "modal"}` or `{"open_as": "window", "windowFeatures": {...}}`, optional `events` (keyboard shortcuts), optional `tool_config` with `ddo_map` |
| `labels` | array | UI strings: `[{"lang": "lg-eng", "name": "key", "value": "Text"}, ...]`, retrieved in JS via `get_tool_label('key')` |
| `ontology` | array\|null | Optional tool ontology extension nodes. Tipos are renumerated to unique `tool*` ids at registration; duplicate tipos are refused |
| `config` | object\|null | Runtime configuration definition. Properties flagged `"client": true` are exposed to the browser — never put secrets there |
| `default_config` | object\|null | Factory default configuration; per-install overridable in the Tools configuration section (dd996) |

## Where the data lands

At registration the file is converted into a record of the "Registered Tools" section (dd1324). The component map is declared in one place, `tools/tool_common/class.tool_ontology_map.php` — use those constants in any code reading registry data (never literal `dd1326`-style strings).

## Legacy v6 format

Files with top-level `components`/`relations` keys (raw v6 record dumps) are still accepted and converted automatically (`tools_register::convert_register_v6_to_v7`). They pass through the same validation gate. New tools must use the v7 format documented here.
