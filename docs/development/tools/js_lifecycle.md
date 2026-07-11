# Tools JS lifecycle

The client-side contract of a Dédalo tool — copied as-is from the PHP client tree and unchanged by the TS rewrite (only the server side changed). Base module: `src/core/tools/client/js/tool_common.js`, served at `/dedalo/core/tools_common/js/tool_common.js` (see *Roots & static serving* in `engineering/TOOLS_SPEC.md`). Reference implementation: `tools/tool_dev_template/js/`.

## Files

| File | Role |
| --- | --- |
| `js/index.js` | module entry; `export * from './tool_x.js'` |
| `js/tool_x.js` | tool constructor, wiring, custom logic |
| `js/render_tool_x.js` | render module: `edit()` (and/or `list()`) building the DOM |
| `css/tool_x.css` | tool stylesheet, loaded on demand (LESS/SASS sources welcome; the compiled file must keep this name) |

## Wiring

`wire_tool` performs the standard prototype assignments every tool needs:

``` js
import {tool_common, wire_tool} from '../../../core/tools_common/js/tool_common.js'
import {render_tool_x} from './render_tool_x.js'

export const tool_x = function () { /* declare instance vars */ }

wire_tool(tool_x, render_tool_x)
// equals:
// tool_x.prototype.render  = tool_common.prototype.render
// tool_x.prototype.destroy = common.prototype.destroy
// tool_x.prototype.refresh = common.prototype.refresh
// tool_x.prototype.edit    = render_tool_x.prototype.edit   (when defined)
// tool_x.prototype.list    = render_tool_x.prototype.list   (when defined)
```

Add further prototype methods after the call as usual.

## Lifecycle: init → build → render

A tool is opened by `open_tool({tool_context, caller, open_as})` (bound automatically to the tool buttons that the section/component tool filter — `getElementTools`, `src/core/tools/registry.ts` — placed in the element context).

1. **init(options)** — call super first: `await tool_common.prototype.init.call(this, options)`. It assigns the common vars (`model`, `section_tipo`, `section_id`, `lang`, `mode`), resolves the `caller` (directly, or reconstructed from the compressed URL when the tool opens in its own window) and the `tool_config`. When no `tool_config.ddo_map` is defined, a fallback ddo_map is built from the caller.
2. **build(autoload)** — call super: it awaits the tool CSS (`load_style`) and resolves every `ddo_map` entry into a live component/section instance in `self.ar_instances`. Pass `{load_ddo_map: fn}` as the third argument to replace the default loader. Locate your elements by role:
   ``` js
   const ddo = self.tool_config.ddo_map.find(el => el.role==='main_element')
   self.main_element = self.ar_instances.find(el => el.tipo===ddo.tipo)
   ```
3. **render()** — delegates to your `edit()` / `list()` (matching `self.mode`). The render must return a wrapper that exposes a `tool_header` node; build it with the helpers:
   ``` js
   const content_data = ui.tool.build_content_data(self)
   // ...append your nodes to content_data...
   const wrapper = ui.tool.build_wrapper_edit(self, { content_data })
   return wrapper
   ```

Wrap custom init/build code in `try/catch` and set `self.error = error` on failure — `tool_common.prototype.render` then renders the standard error view instead of your `edit()`. Build/render exceptions inside the modal are also surfaced visibly to the user (standard `content_data_error` block).

### ddo_map

`tool_config.ddo_map` declares the elements the tool operates on:

``` json
{
	"ddo_map": [{
		"model": "component_input_text",
		"tipo": "rsc36",
		"section_tipo": "rsc197",
		"section_id": "self",
		"lang": "lg-eng",
		"role": "main_element",
		"autoload": true,
		"mode": "edit"
	}]
}
```

`"section_id": "self"` is substituted with the caller's record id. `"autoload": false` entries are skipped by the default loader (load them yourself later). `role` is your own label for locating instances.

## Calling the server: tool_request

``` js
const response = await self.tool_request({
	action  : 'my_method',          // key of the server module's apiActions map
	options : { section_tipo: '...', section_id: '...', my_param: 1 },
	background : false,             // true = detached run (the action must be in the module's backgroundRunnable)
	url        : null               // optional API URL override
})
// response: { result, msg, errors }
```

The helper builds the full rqo (source via `create_source`, `prevent_lock: true`) and posts it through `data_manager`. Permission errors arrive as the standard `permissions_denied` response. For streaming (NDJSON) use `data_manager.request_fetch_stream` directly (see `tool_export`).

!!! note "`prevent_lock` is vestigial in TS"
    `prevent_lock` released a PHP per-session write-lock so a long tool request didn't block the user's other tabs. The TS engine has no such lock (its request-scoped `AsyncLocalStorage` context replaces the PHP global-static-plus-session-lock model entirely — see `rewrite/REWRITE_SPEC.md`); the field is still accepted by the RQO schema for wire compatibility with the unchanged client but is not read by the TS dispatcher.

## Modal and window modes

`open_tool` routes by `open_as` (from the call or the tool `properties.open_as`, default `modal`):

- **modal** — the tool renders inside a Dédalo modal; CSS is awaited before first paint; on close, `on_close_actions('modal')` is called if you define it, otherwise the caller is refreshed.
- **window** — the caller state is LZString-compressed into the URL and the tool opens at `/core/page/?tool={name}&raw_data=...`; the caller refreshes on window focus. Size/position via `properties.windowFeatures`.

## Labels

UI strings declared in register.json `labels` are retrieved with language fallback (current → default → any):

``` js
const text = self.get_tool_label('my_first_label') || 'Fallback text'
```

## Events

Use the global `event_manager` for cross-component communication (e.g. `upload_file_done_{id}` from `service_upload` — see the template). Push subscriptions into `self.events_tokens` so `destroy()` unsubscribes them.

## Assets and multi-root tools

Tool JS modules, CSS and icons resolve per tool: tools living in a `DEDALO_ADDITIONAL_TOOLS` root are loaded from their configured URL (`DEDALO_TOOLS_URLS` map / `tool_base_url()` util); in-repo tools keep the historical `DEDALO_TOOLS_URL` paths. This is transparent to tool code — never hardcode tool asset URLs; the framework builds them.
