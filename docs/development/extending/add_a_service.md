# Add a service

Build a reusable, mostly client-side helper (upload, rich-text, autocomplete, …) that one or more components, sections and tools can share without re-implementing it.

This page is the **step-by-step extension guide**. The companion references are:

- [services subsystem reference](../../core/system/services.md) — what a service is, every shipped service, the public API tables, the caller relationship
- [Service Upload](../services/service_upload.md) — the worked-example service used throughout this guide
- [Creating new tools](../tools/creating_tools.md) — the sibling guide for the *task* abstraction (a tool), whose house style this guide mirrors
- [Components](../../core/components/index.md) — the *field* abstraction services plug into

## When do you need this — and when you don't

A service is the **shared building block underneath** components, sections and tools. Reach for one only when the same interface-plus-logic must be reused by *unrelated* callers — the same upload machinery powers `component_3d`, `tool_upload` and `tool_import_dedalo_csv`; the same CKEditor wrapper powers `component_text_area`.

Pick the right abstraction first:

| You want… | Build a… | Guide |
| --- | --- | --- |
| A new **field** (own value, search, save) | component | [Components](../../core/components/index.md) |
| A discrete **task / panel** on a record | tool | [Creating new tools](../tools/creating_tools.md) |
| **Shared logic/UI** reused by several of the above | **service** | this page |

!!! warning "A service is *not* an ontology node"
    Unlike a component, section or area, a service has **no ontology node, no `tipo`, no `properties`, no record data and no matrix column**. You do **not** create or edit an ontology node, and there is **no** component descriptor / registry entry. A service is pure code: it is instanced *by* a caller and acts on the caller's behalf. This is the opposite of the "ontology-only" path some extensions take — a service is "code-only".

Services are **entirely client-side** — ES6 modules in the copied vanilla-JS client under `client/dedalo/core/services/<service>/js/`. The copied client is unchanged by the rewrite, so this is the same code the PHP-era client shipped. A service has **no server module** in the TS server: its server side is whatever *generic* API action it already calls, which is now a **TS dispatch handler** (`dd_utils_api`, `dd_core_api`, the read API in `src/core/api/dispatch.ts`), not a PHP class. Do not add a bespoke server endpoint for a service.

## 1. Create the directory

There is **no scaffolder** for services (the CLI generator, `scripts/create_tool.ts`, exists only for tools). In the copied client, copy an existing sibling that matches the shape you need and rename every `service_<old>` occurrence — directory, file names, the exported identifier, the CSS/LESS basename. Good starting points:

- `core/services/service_upload/` — single-file upload, factory **and** standalone-function consumption, full `init`/`build`/`render` lifecycle.
- `core/services/service_tmp_section/` — in-memory ephemeral section (`ddo_map` in, collected values out).
- `core/services/service_time_machine/` — read-only list driven from the caller's record.

The file nomenclature mirrors [components](../../core/components/index.md), and lives in the copied client tree:

``` text
client/dedalo/core/services/
└── service_myhelper/
    ├── css/service_myhelper.less     # bundled into page.css
    ├── img/icon.svg                  # optional, square SVG artboard
    └── js/
        ├── service_myhelper.js       # the class: named export `service_myhelper`
        └── render_edit_service_myhelper.js   # the DOM/view builder(s)
```

The main class is `<service>/js/<service>.js`; render helpers are `render_*_<service>.js`; views are `view_*_<service>.js`.

## 2. Write the client class

The module's **named export must equal the directory/model name exactly** — this is what the instance factory news up. Borrow the shared lifecycle from `common` so the service lives in the caller's `ar_instances` and tears down uniformly. Pattern verified against `core/services/service_upload/js/service_upload.js`:

``` js
import { common } from '../../../common/js/common.js'
import { event_manager } from '../../../common/js/event_manager.js'
import { render_edit_service_myhelper } from './render_edit_service_myhelper.js'

/**
* SERVICE_MYHELPER
* Shared helper instanced by a component, section or tool.
*/
export const service_myhelper = function () {
    this.id          = null
    this.model       = null
    this.mode        = null
    this.node        = null
    this.ar_instances = null
    this.caller      = null   // MANDATORY — the service acts on this
}

// borrow the shared client lifecycle
service_myhelper.prototype.render  = common.prototype.render
service_myhelper.prototype.destroy = common.prototype.destroy
service_myhelper.prototype.refresh = common.prototype.refresh
service_myhelper.prototype.edit    = render_edit_service_myhelper.prototype.edit

service_myhelper.prototype.init = async function(options) {
    const self = this
    // run the shared init (sets id, mode, caller, …) then your own state:
    const common_init = await common.prototype.init.call(self, options)
    self.caller = options.caller || null
    return common_init
}

service_myhelper.prototype.build = async function(autoload=false) {
    const self = this
    // fetch limits / prepare data via a GENERIC api action, not a bespoke one
    return true
}
```

The service contract, in one sentence: **bind to a caller, reuse the `common` lifecycle, and call only generic server actions.** Concretely:

- **Caller is mandatory.** Keep `self.caller` and operate on it (read `caller.context` / `caller.request_config`, call `caller.save_value()`, publish events the caller subscribes to). `service_upload` logs an error if no caller is set.
- **No bespoke endpoint.** Call the existing generic actions — now TS dispatch handlers in `src/core/api/dispatch.ts`. `service_upload` uses `dd_utils_api.get_system_info` / `dd_utils_api.join_chunked_files_uploaded` (plus the multipart chunk-upload endpoint in `src/server.ts` → `handleMediaUpload`, the port of PHP `dd_utils_api::upload`); `service_dropzone` uses `dd_utils_api.list_uploaded_files`; `service_autocomplete` builds an SQO and runs the read API through the caller. Permission enforcement is the caller's and the API action's job — the multipart upload endpoint is session- and CSRF-guarded, and a tool that consumes the result re-checks write permission on its own action (step 5).
- **Reuse the lifecycle.** `init` → `build` → `render` → `destroy`, borrowed from `common`.

!!! note "Two services skip `common.prototype.init`"
    `service_autocomplete` and `service_ckeditor` set their own minimal state instead of borrowing `init`. Follow the `service_upload` pattern above unless you have a specific reason not to.

## 3. Add the view / render helper(s)

The class delegates DOM construction to `render_*_<service>.js` (and any `view_*_<service>.js`). Copy the matching file from your sibling service and rename it; its `.prototype.edit` (or `.render`) is what step 2 wires onto the service prototype.

## 4. Add styles

`core/services/service_myhelper/css/service_myhelper.less`, compiled to `.css` like every other module. Keep the basename equal to the service name. See [CSS / styling guidelines](../../core/system/common.md) and the project LESS conventions.

## 5. Wire consumption from the caller

There is nothing to register — the service becomes "live" the moment a caller instances it. The instance factory resolves the module path from the `service_` prefix (`core/common/js/instances.js`): `service_*` → `core/services/<model>/js/<model>.js`. Two consumption styles exist:

### a. Factory object (tools, sections — the common case)

``` js
import { get_instance } from '../../../core/common/js/instances.js'

// inside a tool's build():
self.service_myhelper = await get_instance({
    model   : 'service_myhelper',  // resolves to core/services/service_myhelper/js/service_myhelper.js
    caller  : self,                // MANDATORY
    mode    : 'edit',
    id_variant : 'my_use_' + Date.now() // optional, avoids instance-cache collisions
})
self.ar_instances.push(self.service_myhelper) // tear down with the caller
await self.service_myhelper.build()

const service_node = await self.service_myhelper.render()
my_container_node.appendChild(service_node)
```

### b. Standalone function import (a single component)

When only one component needs the logic (not the whole lifecycle object), export a plain function alongside the class and `import` it directly — this is how `component_3d` consumes `service_upload`:

``` js
// component_3d/js/component_3d.js
import { upload } from '../../services/service_upload/js/service_upload.js'

const api_response = await upload({ self, id: self.id, file, /* … */ })
```

A service is wired as a **child render target inside the host's edit view**, not as an ontology data node. Push factory-instanced services into the host's `ar_instances` so `destroy()` cascades.

## Worked example — `service_upload` end to end

`service_upload` (see [Service Upload](../services/service_upload.md) and the [reference table](../../core/system/services.md#service_upload)) is the canonical model. The full round-trip, all verified in the codebase:

**1. The host instances and builds it** (`tools/tool_dev_template`):

``` js
import { get_instance } from '../../../core/common/js/instances.js'

self.service_upload = await get_instance({
    model              : 'service_upload',
    caller             : self,
    allowed_extensions : ['jpg','jpeg','png','tiff'],
    mode               : 'edit'
})
self.ar_instances.push(self.service_upload)
await self.service_upload.build()        // fetches server limits via dd_utils_api.get_system_info
const service_node = await self.service_upload.render()
```

**2. The service does its work and publishes an event.** `upload_file()` slices the file into chunks, `POST`s each to the multipart upload endpoint (carrying the per-session CSRF token, with retry — the endpoint is `handleMediaUpload` in `src/server.ts`), then calls `dd_utils_api.join_chunked_files_uploaded` and publishes `upload_file_done_<caller.id>`.

**3. The host reacts via the event** — it never calls a service-specific endpoint; it routes the result through its **own** tool action. In `tool_dev_template` the client handler is `file_upload_handler`, which dispatches the tool action `handle_upload_file`. On the server that action is declared in the tool's `server/index.ts` `apiActions` map with a **declarative permission gate** — a record-level write spec (`{ permission: 'record', minLevel: 2 }`) that the dispatcher enforces *before* the handler runs (see [creating tools](../tools/creating_tools.md)):

``` js
event_manager.subscribe('upload_file_done_' + self.id, async (response) => {
    await self.tool_request({
        action  : 'handle_upload_file',
        options : {
            component_tipo : self.main_element.tipo,
            section_id     : self.main_element.section_id,
            section_tipo   : self.main_element.section_tipo,
            file_data      : response.file_data   // tmp_dir, key_dir, tmp_name, extension, …
        }
    })
})
```

The temp file then lives at `DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>/<tmp_name>`; the host moves or processes it. See [Service Upload → server side handle](../services/service_upload.md#server-side-handle) for the exact path reconstruction.

**4. Same service, different consumer.** `component_3d` imports the standalone `upload()` function (style b above) instead of the factory object — both paths end at the same `dd_utils_api` actions.

## Common pitfalls

- **Named export must equal the model.** `instances.js` does `new module[model](...)`. If the file is `service_myhelper.js` the export *must* be `export const service_myhelper = …` — a mismatch silently fails to construct.
- **Wrong directory shape.** The resolver hard-codes `core/services/<model>/js/<model>.js`. The folder, the JS file and the export all share one name.
- **Forgetting the caller.** A service has no standalone identity. Always pass `caller`, and read/write through it (`caller.context`, `caller.save_value()`, `upload_file_done_<caller.id>`). `service_upload` logs an error with no caller.
- **Adding an ontology node.** Don't. Services are not in the ontology — no `tipo`, no descriptor/registry entry, no permission row. If you find yourself wanting a node, you probably want a [component](../../core/components/index.md) or [tool](../tools/creating_tools.md) instead.
- **Inventing a server endpoint.** Call the existing generic actions and let the caller / the action enforce permissions. A bespoke service endpoint is an anti-pattern; the TS server ships no per-service module (and the legacy PHP `service_subtitles` forwarder was already dead code — see the [reference warning](../../core/system/services.md#service_subtitles)).
- **Leaking instances.** Push factory-instanced services into the host's `ar_instances`, or they will not be torn down with the host.
- **Instance-cache collisions.** When a host instances the same service more than once, pass a distinct `id_variant` so the factory cache key differs.

## Related

- [services subsystem reference](../../core/system/services.md) — full reference: every shipped service, public API tables, lifecycle and instancing.
- [Service Upload](../services/service_upload.md) — the worked-example service, with the event payload and server-side path reconstruction.
- [Creating new tools](../tools/creating_tools.md) — the sibling extension guide for tools (which frequently consume services).
- [Components](../../core/components/index.md) — the field abstraction; [media components](../../core/components/index.md#media-components) are the canonical upload-service consumers.
- [common](../../core/system/common.md) — the shared client object machinery services borrow (`render`/`destroy`/`refresh`/`init`).
