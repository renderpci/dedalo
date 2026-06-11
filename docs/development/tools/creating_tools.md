# Creating new tools

## Introduction

Dédalo tools are isolated blocks of code that extend components, sections and areas. A tool consists of a server PHP class, client JS/CSS files, and a `register.json` file describing it. Tools can add their own user interface for complex interaction and data analysis.

This page is the end-to-end tutorial. The companion references are:

- [register.json reference](register_json.md) — every field of the registration file
- [Server contract](server_contract.md) — the PHP class contract, API actions, configuration, hooks
- [JS lifecycle](js_lifecycle.md) — the client tool lifecycle and helpers
- [Security](security.md) — what the framework enforces and what you must do

## 1. Scaffold the tool

The fastest start is the CLI scaffolder, which copies the reference template (`tools/tool_dev_template`) and renames everything:

``` shell
php tools/tool_common/cli/create_tool.php \
    --name=tool_numisdata_import \
    --label="Numismatic import" \
    --models=section
```

Options:

| Option | Description |
| --- | --- |
| `--name` | Required. Tool name: `^tool_[a-z0-9_]+$`. Becomes the directory, class and file names |
| `--label` | Required. Display label (stored as `lg-eng`; add more languages later) |
| `--models` | Comma-separated affected models, e.g. `section,component_input_text`. Default `section` |
| `--path` | Target tools root. Default: the in-repo `/tools` directory (see [out-of-repo tools](#out-of-repo-tools)) |
| `--register` | Register the tool immediately after scaffolding (CLI; requires server shell access) |

You can also copy `tools/tool_dev_template` by hand and rename every `tool_dev_template` occurrence (directory, file names, class name, JS identifiers, register.json).

### Naming rules

- snake_case, lowercase ASCII only, no spaces or accents
- mandatory `tool_` prefix, then your organization/TLD acronym, then the feature:
  `tool_numisdata_import` = `tool_` + `numisdata` (org) + `import` (feature)
- the PHP class is `class.{tool_name}.php` and the class name equals the directory name — this is validated at registration

### Directory layout

``` shell
├── tool_numisdata_import
    ├── class.tool_numisdata_import.php
    ├── register.json
    ├── css
    │   └── tool_numisdata_import.css
    ├── img
    │   └── icon.svg               # square SVG, ~1024×1024 artboard
    └── js
        ├── index.js               # module entry (re-exports the tool)
        ├── tool_numisdata_import.js
        └── render_tool_numisdata_import.js
```

## 2. Edit register.json

`register.json` is hand-authorable (v7 format) and schema-validated. A minimal valid file:

``` json
{
	"$schema": "../tool_common/register.schema.json",
	"name": "tool_numisdata_import",
	"version": "1.0.0",
	"label": { "lg-eng": "Numismatic import" },
	"affected_models": ["section"]
}
```

One language label is enough — the client falls back across languages. The `$schema` pointer gives you autocomplete and validation in any JSON-schema-aware editor. See the [register.json reference](register_json.md) for all fields (description, properties, labels, config, ontology...).

!!! note "Legacy v6 files"
    Tools created with Dédalo v6 ship a different register.json (a raw record dump with `components`/`relations` keys). Those keep working — they are converted automatically at registration. New tools must use the v7 format above.

## 3. Implement the server class

The class extends `tool_common` and declares its callable methods in the `API_ACTIONS` allowlist, preferably in **map form** so the framework enforces the permission gate before your code runs:

``` php
class tool_numisdata_import extends tool_common {

	public const API_ACTIONS = [
		'import_file' => ['permission' => 'section', 'min_level' => 2]
	];

	public static function import_file(object $options) : object {

		$response = new stdClass();
			$response->result = false;
			$response->msg    = 'Error. Request failed';
			$response->errors = [];

		// your logic here...

		$response->result = true;
		$response->msg    = 'OK';

		return $response;
	}
}
```

Full contract (signatures, background execution, configuration, lifecycle hooks): [Server contract](server_contract.md). Security model: [Security](security.md).

## 4. Implement the client

The template wires the standard lifecycle for you with `wire_tool` and calls the server through `this.tool_request`:

``` js
import {tool_common, wire_tool} from '../../tool_common/js/tool_common.js'
import {render_tool_numisdata_import} from './render_tool_numisdata_import.js'

export const tool_numisdata_import = function () { /* instance vars */ }

wire_tool(tool_numisdata_import, render_tool_numisdata_import)

tool_numisdata_import.prototype.do_import = async function() {
	return this.tool_request({
		action  : 'import_file',
		options : { section_tipo: this.caller.section_tipo, file: '...' }
	})
}
```

Lifecycle, `ddo_map`, modal/window modes, labels: [JS lifecycle](js_lifecycle.md).

## 5. Register the tool

Either:

- **UI:** System administration → Maintenance → "Register tools" panel → press the register button. Your tool appears in the list when its directory, register.json and required files are in place.
- **CLI:** `php tools/tool_common/cli/create_tool.php ... --register`, or any later re-run of the Maintenance registration.

Registration validates the tool before persisting: register.json structure, name/directory match, semantic version, class file loads and extends `tool_common`, minimum Dédalo version (`dedalo_version_min`), and ontology integrity. Failures appear in the import report with explicit messages — nothing registers silently broken.

## 6. Authorize and use

Grant the tool to user profiles: System administration → Profiles → Tools. Superusers see all registered tools. Tools flagged `always_active` bypass profile authorization.

The tool button now appears on matching elements (per `affected_models` / `affected_tipos` and the `show_in_component` / `show_in_inspector` flags).

## 7. Test

Copy the reference test `test/server/tools/tool_dev_template_Test.php`: it validates your register.json against the schema, your `API_ACTIONS` resolution, and invokes an action directly. Run with:

``` shell
cd test/server && ../../vendor/bin/phpunit tools/tool_yourname_Test.php
```

## Out-of-repo tools

Third-party tools can live **outside** the Dédalo checkout (surviving `git pull`, independently versioned). Define in `config.php`:

``` php
define('DEDALO_ADDITIONAL_TOOLS', [
	['path' => '/srv/custom_tools', 'url' => '/custom_tools']
]);
```

- `path`: absolute directory containing `tool_*` folders
- `url`: same-origin web URL serving that directory (web-server alias) — the browser loads tool JS/CSS from it; cross-origin URLs are refused

The in-repo `/tools` root always wins on name collisions (reported in the import report). Tools in additional roots still require registration and profile authorization, exactly like in-repo tools. Scaffold directly into the root with `--path=/srv/custom_tools`.

Done! Now it is your time to create an amazing tool.
