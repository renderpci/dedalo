# tool_dd_label

A UI-only editor that renders a tool's multi-language label set — the JSON stored in a `component_json` (`dd1372`) field — as an editable key × language matrix, and writes edits straight back into the field's editor. It generates the `dd1372` labels payload; it has no server actions.

!!! note "UI-only tool"
    `tool_dd_label` ships **no `server/` package** — there is no `tools/tool_dd_label/server/` directory. All behavior is client-side; the tool never calls `tool_request`. It reads and writes the caller `component_json`'s in-memory editor value, and persistence is deferred to that component's own save.

## What it does / why & when to use it

A Dédalo tool's interface strings — button captions, panel titles, confirmation prompts — are stored as a flat array of label objects in a `component_json` field, `dd1372` (*Tool labels*). Each element is `{ lang, name, value }`: `name` is the machine-readable label key, `lang` is an IETF-style language code (`lg-eng`, `lg-spa`), and `value` is the translated string. Multiple elements share a `name` and differ by `lang`.

`tool_dd_label` renders that array as a matrix so a tool author edits a table instead of raw JSON:

- **rows** = the unique `name` keys (`self.ar_names`, derived from `ar_data`);
- **columns** = one per project language, from `page_globals.dedalo_projects_default_langs` (`self.loaded_langs`).

Each cell is a `contenteditable` div. It is used while authoring or translating a tool — to compose the labels its UI reads. It is not a content-translation tool.

## How it works (server + client)

**Server.** None. `tools/tool_dd_label/` ships only `register.json`, `js/`, `css/` and `img/`. Any action dispatched against this tool through `dd_tools_api` is refused at the dispatch gate (no server module).

**Client** (`tools/tool_dd_label/js/`):

- `index.js` is a barrel re-export of `tool_dd_label.js`.
- `tool_dd_label.js` is the instance. It wires the standard `tool_common` lifecycle: `render` / `build` from `tool_common`, `destroy` / `refresh` from `common`, and `edit` from `render_tool_dd_label`.
- `init(options)` calls `tool_common.prototype.init`, then: loads `page_globals.dedalo_projects_default_langs` into `self.loaded_langs`; resolves the caller's first editor (`self.caller.editors[0]` — the JSON editor of the `component_json`); reads the editor's **current in-memory value** via `editor.get()` (the editor returns either `{json}` or `{text}` depending on its parse state; both are normalized to a plain object) so unsaved edits are preserved; coerces the result to an array `self.ar_data`; and derives `self.ar_names` as the unique, ordered list of `name` values. If the caller has no editor, the error is caught into `self.error` and the base error renderer is shown.
- `render_tool_dd_label.js::edit` builds the wrapper (`ui.tool.build_wrapper_edit`) and the content. `get_content_data` builds a `<ul class="label_matix">` CSS-grid element with `grid-template-columns: 2em repeat(<lang_count + 1>, 1fr)` — a 2em action column, a `name` column, and one column per language — then a header row plus one `render_row` per entry in `ar_names`. The `<ul>` is stored as `self.label_matix` so the add-row handler can append to it.
- `render_row` builds each `<li>`: a leftmost action cell (an **add** button on the header row that appends a new blank data row; a **remove** button on data rows that confirms via `confirm()`, then splices every `ar_data` entry matching the row's key, drops the key from `ar_names`, calls `update_data()`, and removes the node); a `contenteditable` **name** cell whose edit (on blur / Enter) normalizes the text (trim → lowercase → spaces replaced with underscores), renames the matching `ar_data` items and the `ar_names` entry, and flushes; and one language cell per language via `render_language_label`.
- `render_language_label` builds each `name × lang` cell: on the header row a read-only div showing the language's display label; on data rows a `contenteditable` div pre-filled with the stored value (looked up in `ar_data` by `name` + `lang`), with a `placeholder` dataset of the key name. On blur and on Enter it calls `self.save_label_lang_sequence(textContent, key, lang)`.
- `save_label_lang_sequence(value, key, lang)` upserts or deletes one cell: an empty value with no existing record is a no-op; an empty value with an existing record splices it out; a non-empty value updates the matching record in place or pushes a new `{lang, name, value}`. It then calls `update_data()`.
- `update_data()` flushes `ar_data` to the caller: it deep-clones the array (`JSON.parse(JSON.stringify(...))`), pushes it into the editor with `editor.set({json})`, and notifies the component with `self.caller.set_value(immutable_value, 0)`. It skips redundant writes by comparing against `self.last_value`. **It does not save to the server** — persistence requires the user to click save on the caller `component_json`.
- `on_close_actions(open_as)` destroys the instance when opened as a modal so it can be reopened.

## Actions & options

`tool_dd_label` has **no API actions** — it is UI-only.

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| *(none)* | — | — | — |

*(no server module)*. What the **client** reads instead:

| Source | Field | Meaning |
| --- | --- | --- |
| caller | `caller.editors[0]` | the `component_json` (`dd1372`) JSON editor whose in-memory value the tool edits |
| globals | `page_globals.dedalo_projects_default_langs` | the project languages → one matrix column each |
| derived | `ar_data`, `ar_names` | the live `{lang, name, value}` array and the ordered unique key list driving the rows |

## How it is registered & surfaced

`tools/tool_dd_label/register.json` is a **column-keyed dump** (a seeded matrix-row snapshot, not hand-authored); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it carries:

- `dd1326` name = `tool_dd_label`; `dd1327` version = `1.0.2`; `dd1328` minimum Dédalo version = `6.0.1`; `dd1644` developer = *Dédalo team*.
- `dd799` label = *Label composition* (localized across project languages).
- `dd612` description = *"Creates tool labels in all available langs. This tool will generate JSON data and only will be applied to component_json (dd1372)"*.
- `dd1350` **affected_tipos** = `["dd1372"]` → the tool attaches **only** to `component_json` fields of tipo `dd1372`.
- `dd1335` **properties** = `{}` (empty). The client's `on_close_actions` still branches on `open_as` (`modal` / `window`), defaulting when properties do not set one.

Surfacing (`getElementTools`, `src/core/tools/registry.ts`): restricted by `affected_tipos` to `dd1372`, so the tool appears on the *Tool labels* field of a tool registry record. The record itself lives in the *Tools development* section (section tipo `dd1340`).

## Examples

There is no `tool_request` to show. The data the tool edits is the `dd1372` label array — one object per key × language:

```json
[
  { "lang": "lg-eng", "name": "process", "value": "Process" },
  { "lang": "lg-spa", "name": "process", "value": "Procesar" },
  { "lang": "lg-eng", "name": "confirm", "value": "Are you sure?" },
  { "lang": "lg-spa", "name": "confirm", "value": "¿Está seguro?" }
]
```

`process` and `confirm` become the two matrix rows; `lg-eng` and `lg-spa` become two columns; each `value` fills the corresponding cell. Emptying a cell removes that `{lang, name, value}` element; renaming the row's key rewrites `name` on every element that shares it.

## Related

- [tool_lang](tool_lang.md) — automatic translation of a **content** component's data (a different subject: it translates records, not tool labels).
- [Creating new tools](../creating_tools.md) — where tool labels fit in the registration flow; [register.json reference](../register_json.md) — the `dd1372` labels field.
- [Server contract](../server_contract.md) · [Security](../security.md) — why a UI-only tool with no `server/` package is refused cleanly at dispatch.
- [JS lifecycle](../js_lifecycle.md) — the `init` / `build` / `render` / `edit` flow this tool follows.
- [Tools catalog](index.md) — full list of shipped tools.
- Source: `tools/tool_dd_label/register.json` (no `server/` package), `tools/tool_dd_label/js/{index,tool_dd_label,render_tool_dd_label}.js`, `tools/tool_dd_label/css/tool_dd_label.less`.
