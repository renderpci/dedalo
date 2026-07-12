# Creating new tools

## Introduction

Dédalo tools are isolated blocks of code that extend components, sections and areas. A tool consists of a server TS module (`server/index.ts`, exporting a `ToolServerModule`), client JS/CSS files, and a `register.json` file describing it. Tools can add their own user interface for complex interaction and data analysis.

This page is the end-to-end tutorial. The companion references are:

- [Tools catalog](reference/index.md) — every tool shipped with Dédalo v7, grouped by purpose, with per-tool reference pages
- [register.json reference](register_json.md) — every field of the registration file
- [Server contract](server_contract.md) — the `ToolServerModule` contract, API actions, configuration, hooks
- [JS lifecycle](js_lifecycle.md) — the client tool lifecycle and helpers
- [Security](security.md) — what the framework enforces and what you must do

## 1. Scaffold the tool

The fastest start is the CLI scaffolder, which copies the reference template (`tools/tool_dev_template`) and renames everything:

``` shell
bun run scripts/create_tool.ts \
    --name=tool_numisdata_import \
    --label="Numismatic import" \
    --models=section
```

Options:

| Option | Description |
| --- | --- |
| `--name` | Required. Tool name: `^tool_[a-z0-9_]+$`. Becomes the directory name (class/file renames follow automatically) |
| `--label` | Display label (stored as `lg-eng`); defaults to `--name`. Add more languages later in `register.json` |
| `--models` | Comma-separated affected models, e.g. `section,component_input_text`. Default `all_components` |

The scaffolder copies `tools/tool_dev_template`, renames every `tool_dev_template` occurrence (directory, file names, JS identifiers), and writes a minimal **authoring-format** `register.json`. The new tool is created but **not registered** — run the area_maintenance "Register tools" widget (dry-run by default) to reconcile it with dd1324.

You can also copy `tools/tool_dev_template` by hand and rename every `tool_dev_template` occurrence yourself (directory, file names, JS identifiers, `register.json`).

### Naming rules

- snake_case, lowercase ASCII only, no spaces or accents
- mandatory `tool_` prefix, then your organization/TLD acronym, then the feature:
  `tool_numisdata_import` = `tool_` + `numisdata` (org) + `import` (feature)
- the tool's `server/index.ts` must export `tool.name` equal to the directory name — this is validated by the loader every time it scans (not only at registration)

### Directory layout

``` shell
├── tool_numisdata_import
    ├── register.json
    ├── css
    │   └── tool_numisdata_import.css
    ├── img
    │   └── icon.svg               # square SVG, ~1024×1024 artboard
    ├── js
    │   ├── index.js               # module entry (re-exports the tool)
    │   ├── tool_numisdata_import.js
    │   └── render_tool_numisdata_import.js
    └── server
        └── index.ts               # exports `tool: ToolServerModule` — never served
```

`tools/` is the repo-root, **TS-owned** tree. The common machinery (registry, loader, dispatch, security, config, the `tool_common` client base) is NOT a tool — it lives in `src/core/tools/`.

## 2. Edit register.json

`register.json` is hand-authorable (the flat **authoring** format) and schema-validated. A minimal valid file:

``` json
{
	"$schema": "../../src/core/tools/client/register.schema.json",
	"name": "tool_numisdata_import",
	"version": "1.0.0",
	"label": { "lg-eng": "Numismatic import" },
	"affected_models": ["section"]
}
```

One language label is enough — the client falls back across languages. The `$schema` pointer gives you autocomplete and validation in any JSON-schema-aware editor. See the [register.json reference](register_json.md) for all fields (description, properties, labels, config, ontology...).

!!! note "The 34 shipped tools are column-keyed dumps, not authoring files"
    Every in-repo `register.json` you will find under `tools/*/register.json` today is a seeded matrix-row dump (`data`/`string`/`relation`/… keyed by component tipo) of the "Tools development" section, imported as-is by `importTools()`. That is a **different, valid shape** the loader passes through unmodified — do not use it as a template for a *new* tool; use the authoring format above (what the scaffolder writes).

## 3. Implement the server module

`server/index.ts` exports `const tool: ToolServerModule`, declaring its callable actions in `apiActions` — preferably with a **declarative permission** per action so the framework enforces the gate before your handler runs:

``` ts
import type { ToolActionContext, ToolResponse, ToolServerModule } from '../../../src/core/tools/module.ts';

async function importFile(context: ToolActionContext): Promise<ToolResponse> {
	// context.options is already permission-checked for (section_tipo, level>=2)
	// your logic here...
	return { result: true, msg: 'OK', errors: [] };
}

export const tool: ToolServerModule = {
	name: 'tool_numisdata_import',
	apiActions: {
		import_file: { permission: 'section', minLevel: 2, handler: importFile },
	},
};
```

Full contract (permission kinds, background execution, configuration, lifecycle hooks): [Server contract](server_contract.md). Security model: [Security](security.md).

## 4. Implement the client

The template wires the standard lifecycle for you with `wire_tool` and calls the server through `this.tool_request`:

``` js
import {tool_common, wire_tool} from '../../../core/tools_common/js/tool_common.js'
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

The relative import `../../../core/tools_common/js/tool_common.js` resolves through the **served** URL tree, not the repo tree: `tool_common.js` itself lives at `src/core/tools/client/js/tool_common.js` and is served at `/dedalo/core/tools_common/js/tool_common.js` (see *Roots & static serving* in `engineering/TOOLS_SPEC.md`). Lifecycle, `ddo_map`, modal/window modes, labels: [JS lifecycle](js_lifecycle.md).

## 5. Register the tool

Either:

- **UI:** System administration → Maintenance → "Register tools" panel → press the register button. Your tool appears in the report when its directory, `register.json` and (if declared) `server/index.ts` are in place. This runs **dry-run** by default (`config.tools.enableRegistryImport = false`) — see [Server contract](server_contract.md) for the write-parity procedure that must pass before the shared dd1324 registry is actually written from this engine.
- **CLI:** re-run the scaffolder's suggested next step, or invoke `importTools()` directly in a script.

Registration validates the tool before reporting: `register.json` structure (authoring files only — column-keyed dumps pass through), name/directory match, and (via the loader) that `server/index.ts` — if present — satisfies the `ToolServerModule` contract. Failures appear in the import report with explicit messages — nothing registers silently broken.

## 6. Authorize and use

Grant the tool to user profiles: System administration → Profiles → Tools. Superusers see all registered tools. Tools flagged `always_active` bypass profile authorization.

The tool button now appears on matching elements (per `affected_models` / `affected_tipos` and the `show_in_component` / `show_in_inspector` flags).

## 7. Test

Follow the existing test pattern for a real tool (e.g. `test/parity/tool_export_differential.test.ts` or `test/unit/tools_dispatch.test.ts`): drive the same `tool_request` through the dispatcher and assert on the response — parity gates replay the frozen fixture store (`test/parity/fixtures/oracle_harvest/`) rather than a live external server. See the `dedalo-ts-testing` skill for the two test tiers and the fixture-replay workflow.

## Out-of-repo tools

Third-party tools can live **outside** the Dédalo checkout (surviving `git pull`, independently versioned). Configure an additional root via `config.tools.additionalRoots` (env `DEDALO_ADDITIONAL_TOOLS`, JSON):

``` env
DEDALO_ADDITIONAL_TOOLS=[{"path":"/srv/custom_tools","url":"/custom_tools"}]
```

- `path`: absolute directory containing `tool_*` folders
- `url`: same-origin web URL serving that directory — the browser loads tool JS/CSS from it; cross-origin URLs are refused at config load

The in-repo `tools/` root always wins on name collisions (reported via `getToolLoadCollisions()`, never silently overridden). Tools in additional roots still require registration and profile authorization, exactly like in-repo tools.

Done! Now it is your time to create an amazing tool.
