# tool_dev_template

The production-shaped **exemplar** tool: the reference implementation you copy (or scaffold from) to start a new Dédalo tool, demonstrating every part of the `ToolServerModule` contract and the client tool lifecycle.

## What it does / why & when to use it

`tool_dev_template` is not a feature for cataloguers — it is the canonical **template** every new tool is built from. Its server module exercises the whole [server contract](../server_contract.md) in one file: `apiActions` in map form with all four permission kinds plus a `null`-spec action, the `backgroundRunnable` allowlist, the `isAvailable` toolbar hook, and the `onRegister` / `onRemove` lifecycle hooks. Its client half shows the standard `init → build → render → destroy` lifecycle, `wire_tool` wiring, `this.tool_request(...)` server calls, and two file-upload integrations.

Use it when you are **creating a tool**: either run the CLI scaffolder (preferred), which copies this directory and renames everything, or copy it by hand. Read it alongside [Creating new tools](../creating_tools.md), the [server contract](../server_contract.md), the [register.json reference](../register_json.md), [security](../security.md) and the [JS lifecycle](../js_lifecycle.md) — this page is the annotated map of what those documents describe in the abstract.

!!! info "This is a developer tool"
    `tool_dev_template` is a sample/reference only. Do not grant it in a production install and do not build a real workflow on it — copy it into a new tool instead.

## How it works (server + client)

**Server** (`tools/tool_dev_template/server/index.ts`). A single `ToolServerModule` export that is deliberately minimal — each handler returns a small envelope so the *shape* of the contract is what you read, not business logic:

```ts
export const tool: ToolServerModule = {
	name: 'tool_dev_template',
	apiActions: {
		status: { permission: null, handler: status },
		read_demo: { permission: 'tipo', minLevel: 1, handler: readDemo },
		write_demo: { permission: 'record', minLevel: 2, handler: writeDemo },
		long_job: { permission: 'section', minLevel: 2, handler: longJob },
	},
	backgroundRunnable: ['long_job'],
	isAvailable: (context) => context.callerModel !== 'component_relation_children',
	onRegister: async () => { console.log('[tool_dev_template] registered'); },
	onRemove: async () => { console.log('[tool_dev_template] removed'); },
};
```

The four actions map one-to-one onto the four declarative permission kinds (see [server contract](../server_contract.md#permission-kinds-srccoretoolssecurityts)): `status` gates itself (`permission: null`), `read_demo` uses a `tipo`/1 read gate, `write_demo` a `record`/2 write gate, `long_job` a `section`/2 gate. Only `long_job` is listed in `backgroundRunnable`, so it is the one action the framework may run detached. Each handler returns a `{ result, msg, errors }` envelope that **replaces the API response wholesale**; the declarative gate has already run before the handler, so inside it the caller is trusted. `server/` is never statically served.

**Client** (`tools/tool_dev_template/js/`):

- `tool_dev_template.js` is the instance. It declares every property up front (predictable shape), calls `wire_tool(tool_dev_template, render_tool_dev_template)` to attach the shared `render` / `destroy` / `refresh` and the module's own `edit`, and implements `init()` / `build()` around `tool_common.prototype.*` (seed common vars, resolve the `main_element` ddo role). Its action methods wrap server calls through `self.tool_request({ action, options })`, which adds the tool id, caller context and security token automatically — always prefer it over `data_manager.request()` directly.
- `render_tool_dev_template.js` builds the body: an info block, the `main_element` component rendered inline, and four demo buttons feeding a shared output area — reading a component's in-memory value, fetching from the server, a generic `service_upload` flow, and a `component_image` + `open_tool(tool_upload)` flow. It is annotated as the canonical starting point for a new tool's render layer.

!!! note "The scaffold's client is a reference, not a wired demo"
    The client's `js/` is intentionally illustrative — its demo buttons show the *patterns* (component render, `tool_request`, `service_upload`, `open_tool`). When you scaffold a real tool, replace the demo action names and payloads with your own module's actions (the four above are the server contract you build on).

## Actions & options

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `status` | `permission: null` — listed but self-gated (here: always open) | no | — |
| `read_demo` | `permission: 'tipo'`, `minLevel: 1` — level ≥ 1 on `(section_tipo, tipo)` | no | `section_tipo`, `tipo` |
| `write_demo` | `permission: 'record'`, `minLevel: 2` — section write + record-in-scope | no | `section_tipo`, `section_id` |
| `long_job` | `permission: 'section'`, `minLevel: 2` — level ≥ 2 on `(section_tipo, section_tipo)` | yes (`backgroundRunnable`) | reflects `context.background` |

`minLevel` defaults to `2` (write) when omitted; here it is stated on each action for clarity. A missing required option (e.g. no `section_tipo` for the `tipo` gate) is a fail-closed denial before the handler runs. Only `long_job` may be forked: the client sets `options.background_running = true`, and `scheduleBackground` enforces the `backgroundRunnable` allowlist a second time after the declarative gate has already passed.

The three lifecycle hooks are **framework-called, never in `apiActions`** — the loader refuses to load a module that lists a reserved hook key as an action. `isAvailable` runs in `getElementTools` after the `affected_models` / `affected_tipos` match and must be fast and side-effect-free; here it hides the tool on a `component_relation_children` caller as an example rule. `onRegister` / `onRemove` fire during `importTools()`; a throw is logged, never fatal.

## How it is registered & surfaced

`tools/tool_dev_template/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not the hand-authored authoring format a scaffolded tool gets); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). What it carries:

- `dd1326` name = `tool_dev_template`; `dd1327` version `1.0.1`; `dd1328` minimum Dédalo version `6.0.0`; `dd1644` developer = "Dédalo team".
- `dd799` label = *Development Template*; `dd612` description = "This a sample of Dédalo tool. You can use it as start point to create new tools…".
- `dd1335` properties = `{ "open_as": "window", "windowFeatures": null }` → the tool opens in its own window.
- `dd1372` labels = the sample labels `my_first_label` / `my_second_label` (the two demo buttons).
- The affected_models / show_in_inspector / show_in_component / require_translatable / always_active / active flags (`dd1330` / `dd1331` / `dd1332` / `dd1333` / `dd1601` / `dd1354`) appear as **relations** to their ontology records in this dump rather than as inline values.

**Surfacing**: as a sample it is not meant to appear in a real install. When registered and granted, `getElementTools` (`src/core/tools/registry.ts`) attaches it per its `affected_models` match, subject to the `isAvailable` hook above.

## Examples

Scaffold a new tool from this template (copies `tools/tool_dev_template`, renames every occurrence, and writes an authoring-format `register.json`):

```shell
bun run scripts/create_tool.ts \
    --name=tool_myorg_mytool \
    --label="My tool"
```

A client → server call, the shape every action method uses (from `tool_dev_template.js`, adapted to the server's `read_demo` action):

```js
const response = await self.tool_request({
    action  : 'read_demo',
    options : {
        section_tipo : self.main_element.section_tipo,
        tipo         : self.main_element.tipo
    }
})
// response → { result: { section_tipo, tipo, read: true }, msg: 'OK', errors: [] }
```

A background action sets `background: true`, and the framework returns immediately with a job id:

```js
const response = await self.tool_request({
    action     : 'long_job',
    background  : true,
    options     : { section_tipo: self.main_element.section_tipo }
})
// response → { result: true, msg: 'OK. Background process started', background_job_id: … }
```

## Related

- [Creating new tools](../creating_tools.md) — the end-to-end tutorial that uses this template as its starting point.
- [Server contract](../server_contract.md) — the `ToolServerModule` contract, the four permission kinds, `backgroundRunnable`, and the lifecycle hooks demonstrated here.
- [register.json reference](../register_json.md) — the authoring format the scaffolder writes (vs. the seeded dump this tool ships).
- [Security](../security.md) — what the framework enforces around these gates and what your handler must still do.
- [JS lifecycle](../js_lifecycle.md) — the client `init → build → render → destroy` contract the client half implements.
- Source: `tools/tool_dev_template/server/index.ts`, `tools/tool_dev_template/js/{tool_dev_template,render_tool_dev_template,index}.js`, `tools/tool_dev_template/register.json`.
