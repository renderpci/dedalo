# tool_ontology

Developer-only tool that parses ontology section records and synchronises them into the `dd_ontology` runtime table, from both single-record edit and batch list modes.

## What it does / why & when to use it

Dédalo's data model is *ontology-driven*: every section and component is described by ontology records (in the `area_ontology` / `area_thesaurus` sections, with tipos such as `ontology16`…`ontology35` and the per-project TLD roots like `dmm0`). At runtime, however, the resolver does not read those editorial records directly — it reads a flattened, denormalised projection of them held in the **`dd_ontology`** table. That projection is what the ontology resolver (`src/core/ontology/resolver.ts`) and the thesaurus/tree builder consult to answer "what is the model of this tipo, what is its label, what are its children". When a developer edits the ontology, the editorial record changes but the `dd_ontology` projection does **not** update automatically — it must be re-parsed and re-written.

`tool_ontology` is the operator-facing button that performs exactly that re-parse and re-write. It takes the ontology record(s) the developer is looking at (one record in edit mode, or the whole current list/selection in list mode), feeds them through `ontology::set_records_in_dd_ontology()`, and upserts the resulting node definitions into `dd_ontology`. After a successful run it also clears the `active_elements` session cache used by the thesaurus tree API, so the change is visible immediately.

Because it rewrites the rows that drive the live data model, the tool is **strictly developer/superuser only** — both the server method and the surfacing are gated to developers. It is not a cataloguing aid for end users; it is an ontology-maintenance control.

Concrete heritage scenario: a numismatics project (`dmm`) ontology engineer adds a new component to the *Coin* section in the ontology editor — say a new "countermark position" select. They save the editorial record. The new component is still invisible to the running application because no `dd_ontology` row describes it yet. The engineer opens `tool_ontology` on that ontology record, presses **Process** (or hits Ctrl+S), and the tool calls `set_records_in_dd_ontology` for that single record: a new `dd_ontology` node is inserted, the active-elements cache is dropped, and the component immediately appears in the *Coin* edit form and in the thesaurus tree. To rebuild a whole branch after a larger refactor, the engineer instead filters the ontology list to the affected records and runs the tool from the inspector in **list mode**, which re-syncs every matched record in one batch with partial-success reporting.

Use it when: you have edited ontology records (single or in bulk) and need the `dd_ontology` runtime projection to reflect them — typically right after an ontology editor save, or to repair/regenerate a TLD branch. Use `tool_ontology_parser` instead when you want to *export* ontology records to JSON or regenerate from a JSON snapshot.

## How it works (server + client)

**Server.** `tools/tool_ontology/server/{index,tool_ontology}.ts` is a thin, privileged wrapper around the TS ontology write engine (`src/core/ontology/ontology_write.ts::setRecordsInDdOntology` — see the `dedalo-ontology-ts` skill). It declares a **declaratively-gated** `apiActions` entry, `set_records_in_dd_ontology: { permission: 'developer', handler: toolOntologySetRecords }` — a design difference from the PHP oracle, which lists the action in list form and asserts `assert_developer()` imperatively as the method's first statement (because the gate lives inside the method body there). The TS handler additionally re-checks `context.principal.isDeveloper` itself as defense-in-depth, so the developer requirement is enforced twice.

`toolOntologySetRecords` reads `section_tipo` (required — refuses with an error if missing) and `section_id` (optional), then processes records in one of two modes:

- **Edit mode** (`section_id` present): a single-record scan — just that one `{section_tipo, section_id}` locator.
- **List mode** (`section_id` absent): ⬜ **diverges from the PHP oracle here.** PHP reloads the user's session-stored list SQO for that `section_tipo` (`$_SESSION['dedalo']['config']['sqo'][...]`, cloned with order/limit/offset cleared) so it processes exactly the records the user's current list filter matches. The TS engine has no session-SQO store to reload (per `rewrite/STATUS.md` "sqo_session"), so list mode instead does a **full-section scan** — every record of `section_tipo`, unfiltered. This is ledgered in `ontology_write.ts`'s own comments; a filtered batch re-sync (the PHP "re-sync only what I'm currently looking at" behavior) is not currently reproducible on the TS engine.

It then delegates the real work to `setRecordsInDdOntology`. That core function runs the same per-record logic as the PHP oracle: for a `matrix_ontology_main` (TLD root, `ontology35`) record it deletes the TLD's `dd_ontology` nodes when the TLD is inactive or upserts the root node when active; otherwise it upserts the node. It uses **partial-success** semantics (some-ok/some-failed → `result: true` with a "Partial success" message and the failing records enumerated in `errors`) and returns `{result, msg, errors, total, processed_count}`. ⬜ The PHP oracle's post-success session-cache clear (`$_SESSION['dedalo']['config']['active_elements']`, consumed by the tree children endpoint) has **no visible TS equivalent** — `toolOntologySetRecords`/`setRecordsInDdOntology` do not clear any cache after a successful sync. Whether this matters depends on whether the TS tree-children path caches per-session at all; verify against `rewrite/STATUS.md` / the `dedalo-tree-ts` skill before assuming a freshly-synced node appears immediately in the tree without a page reload.

**Client (JS).** `tools/tool_ontology/js/` wires the standard `tool_common` lifecycle:

- `tool_ontology.js` is the instance (`init` / `build` delegate to `tool_common`). Its `set_records_in_dd_ontology()` method builds the request envelope (`dd_api: 'dd_tools_api'`, `action: 'tool_request'`, `source` from `create_source(self, 'set_records_in_dd_ontology')`) with `options: { section_id, section_tipo, mode }` taken from `self.caller`, and sends it via `data_manager.request({ body, retries: 1, timeout: 60000 })`. `on_close_actions()` destroys the instance so the modal can be reopened.
- `render_tool_ontology.js` builds the panel body (`get_content_data`): a header showing the tool label and, depending on caller type, either the component's `tld + section_id` (edit) or the section's tipo plus a **total records** count, a components container, the **Process** button, and a messages container. For a **component** caller it derives the TLD by stripping trailing digits from `section_tipo` (`dmm0 → dmm`) and uses the component's `section_id`; for a **section** caller (inspector) it reads the TLD/section_id from the caller's `hierarchy6` / `ontology7` datum entry. The Process button shows a spinner, calls `self.set_records_in_dd_ontology()`, and renders `msg`/`errors`, flagging the messages container with the `error` class when `result === false`.

The tool opens **as a modal** and registers a `keyup` event so **Ctrl+S** triggers the Process action (see `properties` below).

## Actions & options

`tool_ontology` exposes exactly one remotely callable action. There is **no** `backgroundRunnable` (the sync runs inline within the request).

| `apiActions` (declarative) | Permission gate | Reads from `options` | Returns |
| --- | --- | --- | --- |
| `set_records_in_dd_ontology` | `permission: 'developer'` (dispatcher-enforced before the handler) **plus** an imperative `isDeveloper` re-check inside the handler (defense in depth) — a design difference from the PHP oracle, which lists the action in list form and gates entirely imperatively. | `section_tipo` (**required**); `section_id` (optional — its presence selects edit vs. list mode; list mode is a full-section scan on TS, not the PHP oracle's session-SQO filter — see above). `mode` is sent by the client but the server infers edit/list from `section_id`. | `{ result: bool, msg: string, errors: string[] }`. On success, `result`/`msg`/`errors` are forwarded from `setRecordsInDdOntology()` (which additionally carries `total` and `processed_count`, and may report *Partial success*). |

Two operating modes of the single action:

| Mode | Triggered when | SQO built | Effect |
| --- | --- | --- | --- |
| **Edit** | `section_id` is present | single-record SQO (`limit: 1`, `filter_by_locators: [{section_tipo, section_id}]`) | Re-syncs that one ontology record into `dd_ontology`. |
| **List / batch** | `section_id` is absent | the session list SQO for `section_tipo`, cloned, with order/limit/offset cleared (whole result set) | Re-syncs every record the current list/filter matches; errors a record without losing the others (partial success). |

> Lifecycle hooks: `tool_ontology`'s module does **not** declare `isAvailable`, `onRegister` or `onRemove` — surfacing is governed by `affected_models` / `affected_tipos` and the developer-only authorization, not by an availability hook. (As always, these hooks must never appear inside `apiActions`.)

## How it is registered & surfaced

`tools/tool_ontology/register.json` is a **column-keyed record dump** for the registry section (dd1340), carrying the registry component tipos directly (see `tool_ontology_map` constants — never hardcode these). The essentials:

- `dd1326` name = `tool_ontology`; `dd1327` version = `1.0.4`; `dd1328` minimum Dédalo version = `7.0.0`; `dd1644` developer = `Dédalo team`; `dd612` description (*Handles Ontology transformation to 'jer_dd' records*).
- `dd799` label = *Ontology* (localized across all project languages).
- `dd1330` **affected_models** — the models the button attaches to (the ontology/registry record models, related from dd1342).
- `dd1350` **affected_tipos** — `["ontology16","ontology17","ontology18","ontology19","ontology35","/^[a-z]+0$/"]`. The trailing regex matches every per-project **TLD root tipo** (e.g. `dmm0`, `oh0`), so the tool surfaces on any project's ontology root as well as on the generic ontology component tipos. (This is the `affected_tipos`-restriction path in `getElementTools`: only matching tipos pass.)
- `dd1331` **show_in_inspector** = yes — the button renders in the section **inspector** panel (the path used for **list / batch** mode).
- `dd1332` **show_in_component** = yes — the button renders inline on the matching **component** (the path used for **edit** mode on a single record).
- `dd1333` require_translatable = no; `dd1354` active = yes; `dd1601` always_active = no.
- `dd1335` **properties** (UI hints): `open_as: "modal"`, `windowFeatures: { width: "40rem" }`, and an `events` entry binding a `keyup` with `ctrlKey + s` to the click/Process action (the Ctrl+S shortcut).
- `dd1372` **labels** — the localized UI strings the client reads via `get_tool_label(...)`: `process` (the button) and `export_to_jer_dd` (the header).

**Where it appears.** On ontology elements whose tipo matches `affected_tipos`: inline on the matching **component** (`show_in_component`, edit mode) and in the section **inspector** (`show_in_inspector`, list/batch mode). It does **not** appear on ordinary content sections/components, nor on areas. Profile authorization applies as for any tool, but the action itself is hard-gated to developers/superusers regardless of profile, so non-developers who reach the button get a `permissions_denied` response.

## Examples

The action is dispatched through `dd_tools_api`. The request envelope the client builds (from `tool_ontology.js`), here in **edit mode** (single record):

```js
const source = create_source(self, 'set_records_in_dd_ontology')
const rqo = {
    dd_api  : 'dd_tools_api',
    action  : 'tool_request',
    source  : source,                       // { model:'tool_ontology', action:'set_records_in_dd_ontology', … }
    options : {
        section_tipo : self.caller.section_tipo,   // e.g. 'dmm0' (ontology TLD root) or 'ontology16'
        section_id   : self.caller.section_id,     // present → edit mode (single record)
        mode         : self.caller.mode
    }
}
const response = await data_manager.request({
    body    : rqo,
    retries : 1,
    timeout : 60 * 1000
})
// response → { result:true, msg:"OK. Request completed … | 12 ms", errors:[] }
```

**List / batch mode** is the same call with `section_id` omitted — the server then rebuilds the SQO from the user's session list selection for that `section_tipo` and processes the whole result set:

```js
options : {
    section_tipo : self.caller.section_tipo,   // list SQO is read from the session for this tipo
    section_id   : null,                       // absent → list mode (batch)
    mode         : self.caller.mode
}
// response → { result:true, msg:"OK. … | 84 ms", errors:[] }
// or partial:  { result:true, msg:"… Partial success", errors:["Failed to process dd_ontology record …"] }
```

A non-developer (or an unauthenticated caller) is refused before any work: the dispatcher returns the standard `permissions_denied` response because `assert_developer()` throws a `permission_exception`.

## Related

- [`tool_ontology_parser`](index.md) — the companion developer tool: retrieve/export ontology records to JSON (`get_ontologies`, `export_ontologies`) and regenerate `dd_ontology` from a snapshot (`regenerate_ontologies`). Use it to dump/restore; use `tool_ontology` to re-sync edited records.
- [`tool_hierarchy`](tool_hierarchy.md) — generates custom ontologies / virtual sections (creating hierarchy elements and thesaurus general terms) rather than syncing existing ontology records.
- [`tool_diffusion`](tool_diffusion.md) — also reads from the ontology, but to publish *work data* to external targets; contrast its `is_available`-gated surfacing with `tool_ontology`'s `affected_tipos` + developer gate.
- [Creating new tools](../creating_tools.md) — the end-to-end tool tutorial.
- [Server contract](../server_contract.md) — the `ToolServerModule` contract, `apiActions` permission kinds, and the lifecycle-hook rule.
- [Security](../security.md) — what the framework enforces; here the `developer` permission kind is dispatcher-enforced, with an imperative re-check inside the handler as defense in depth.
- [Tools catalog](index.md) — index of all per-tool reference pages.
- Ontology core docs: [Ontology class](../../../core/ontology/ontology_class.md), [Ontology engine](../../../core/ontology/ontology_engine.md), [Hierarchy](../../../core/ontology/hierarchy.md), [`ts_object` / thesaurus tree](../../../core/ontology/ts_object.md).
