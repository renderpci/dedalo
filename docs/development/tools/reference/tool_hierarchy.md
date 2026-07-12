# tool_hierarchy

Generates a custom ontology / virtual section from a hierarchy-definition record, building the hierarchy elements and thesaurus general terms needed to make a new browseable, hierarchical section appear in the menu.

## What it does / why & when to use it

`tool_hierarchy` is the v7 replacement for the old v5/v6 *Create structure* buttons. Given a **hierarchy-definition record** (a row in the *Hierarchies* authoring section, tipo `hierarchy1`) that points at an existing real section, it materializes a new **virtual section** on top of that real one: it creates the runtime ontology elements (`ontology`, `dd_ontology`, …) and the thesaurus **general term** root nodes so the new hierarchy is immediately navigable as a thesaurus and visible in the menu.

In plain terms: the user describes the hierarchy they want (a name, a TLD, the source real section, language, typology, active = yes) by filling in a few components, then presses **Generate**. The tool turns that description into a live, hierarchical section.

Concrete heritage scenario: a numismatics team keeps a flat *Coin types* list (a real section) but wants to organize those types **within the mints that struck them** — a "Mints → types" tree the cataloguers can browse and into which they can file records. A curator opens the *Hierarchies* section, creates a definition record (name "Mints", TLD, source real section = *Coin types*, active = yes), opens `tool_hierarchy` on that record, fills the few required fields, and presses **Generate**. The tool builds the virtual section and its general-term roots; after the menu refreshes, the new "Mints" hierarchy appears as a thesaurus the team can populate and browse. (The companion [tool_cataloging](tool_cataloging.md) is then used to drag real records into the tree.)

Use it when: you are an administrator/ontology editor standing on a hierarchy-definition record and you want to (re)generate the virtual section it describes. Do not use it for everyday record editing — it is a one-shot structural generator, and re-running it with **Force to create** ticked deletes the previously generated hierarchy first.

## How it works (server + client)

**Server** (`tools/tool_hierarchy/server/{index,tool_hierarchy}.ts`). One API action, `generate_virtual_section`, declaratively gated `permission: 'section', minLevel: 2` — generating a new virtual section + thesaurus terms is a structural privilege, so the framework requires write level (≥2) on `section_tipo` **before** the handler runs. The handler:

1. Reads `section_id`, `section_tipo` and `force_to_create` from `options`; refuses (returns `result:false` with an error) if `section_id` or `section_tipo` is missing.
2. If `force_to_create === true`, deletes the previously generated hierarchy first (`deleteOntologyMain`, `src/core/resolve/ontology_delete.ts` — the TS `ontology::delete_main` equivalent), merging any delete errors into the response (non-fatal).
3. Delegates the real work to `generateVirtualSection` (`src/core/resolve/hierarchy_provision.ts`). That core validates the definition record (the *active* flag must be Yes, the TLD and the source real section tipo are mandatory) and builds the new hierarchy's ontology elements (`<tld>1` descriptors, `<tld>2` models, dd_ontology nodes).
4. Creates the two thesaurus **general term** roots via `createThesaurusGeneralTerm` (same module) — `hierarchy45` "General term" and `hierarchy59` "General term model". Without these roots the thesaurus view would show no root nodes.
5. Invalidates the ontology-derived caches (`clearOntologyDerivedCaches`, `src/core/ontology/cache_invalidation.ts`) so the menu picks up the new section.

The response carries the standard `result` / `msg` / `errors` plus `created_general_term` and `created_general_term_model` (the booleans from the two general-term creations).

**Client** (`tools/tool_hierarchy/js/`). `tool_hierarchy.js` is the instance (standard `init`/`build` via `tool_common`); `render_tool_hierarchy.js` builds the body. The `edit` view renders six components of the **caller record** in `edit` mode so the user can complete the definition before generating: TLD (`hierarchy6`), name (`hierarchy5`), active (`hierarchy4`), typology (`hierarchy9`), language (`hierarchy8`) and the source real section tipo (`hierarchy109`). The **Generate** button validates that all six have valid values (active must equal Yes), then asks for confirmation **twice** (`Sure?` then the localized `absolute_sure`) before calling `self.generate_virtual_section({force_to_create: <checkbox>})`. That helper builds the `dd_tools_api` / `tool_request` RQO (with a 60 s timeout, one retry) using `self.caller.section_id` / `self.caller.section_tipo` as the options. On success it refreshes the caller section and the menu instance so the new hierarchy shows up. A **Force to create** checkbox next to the button maps to the `force_to_create` option.

## Actions & options

`apiActions = { generate_virtual_section: { permission: 'section', minLevel: 2, handler: toolHierarchyGenerateVirtualSection } }` — a single, **declaratively** gated action. There is no `backgroundRunnable` — the work runs synchronously within the request (the client allows up to 60 s).

| Action | Permission gate | Background | Reads from `options` |
| --- | --- | --- | --- |
| `generate_virtual_section` | declarative: `permission: 'section', minLevel: 2` | no | `section_id`, `section_tipo`, `force_to_create` |

Options read by `generate_virtual_section`:

| Option | Type | Required | Meaning |
| --- | --- | --- | --- |
| `section_id` | int | yes | ID of the hierarchy-definition record to generate from (the caller record). Missing → error response. |
| `section_tipo` | string | yes | Tipo of that record's section (the hierarchies authoring section, `hierarchy1`). Missing → error response; also the section the write gate is asserted on. |
| `force_to_create` | bool | no (default `false`) | When `true`, first deletes the previously generated hierarchy (`deleteOntologyMain`) before regenerating. Use to rebuild a hierarchy from scratch. |

Response: `{ result: bool, msg: string, errors: string[], created_general_term: bool, created_general_term_model: bool }`.

## How it is registered & surfaced

`tools/tool_hierarchy/register.json` is a **column-keyed dump** (`string`/`relation`/`misc`/… keyed by component tipo — a seeded matrix-row snapshot, not a hand-authored file); `importTools()` passes it through as-is (see [register.json reference](../register_json.md)). The essentials it carries:

- `dd1326` name = `tool_hierarchy`; `dd1327` version (`1.0.3`); `dd1328` minimum Dédalo version (`6.0.0`); `dd1644` developer ("Dédalo team"); `dd799` label ("Hierarchy tool").
- `dd1350` affected_tipos = `["hierarchy1"]` → the tool only attaches to the **hierarchies authoring section** (`hierarchy1`), i.e. the records where a hierarchy is defined.
- `dd1335` properties = `{ "mode": "edit" }` → the tool opens in **edit** mode (the user edits the definition components inline before generating). No `open_as` is set, so it uses the default modal presentation.
- `dd1372` labels supply the localized UI strings across project languages: `generate`, `force_to_create`, `user_info`, `absolute_sure`, `all_fields_mandatory`, `insert_value`.

Surfacing (in `getElementTools`, `src/core/tools/registry.ts`): because the tool is restricted by `affected_tipos` to `hierarchy1`, the **Generate** button appears only on hierarchy-definition records — when an administrator is editing a row of the *Hierarchies* section. It is not an inspector- or component-toolbar tool for ordinary data sections.

## Examples

Client-side `tool_request` (built by `tool_hierarchy.js::generate_virtual_section`, sent through `dd_tools_api`):

```js
const source = create_source(self, 'generate_virtual_section') // → tool_hierarchy::generate_virtual_section
const rqo = {
    dd_api : 'dd_tools_api',
    action : 'tool_request',
    source : source,
    options : {
        section_id      : self.caller.section_id,   // the hierarchy-definition record
        section_tipo    : self.caller.section_tipo,  // 'hierarchy1'
        force_to_create : false                      // true → delete + rebuild
    }
}
const response = await data_manager.request({
    body    : rqo,
    retries : 1,
    timeout : 60 * 1000 // 60 s
})
```

Successful response shape:

```json
{
    "result": true,
    "msg": "Ok",
    "errors": [],
    "created_general_term": true,
    "created_general_term_model": true
}
```

A failure (e.g. the definition's *active* flag is not Yes, or the TLD / source real section is empty) comes back with `result:false`, a localized `msg` and the specific cause in `errors` — the client renders `errors` under the form and re-activates the offending component.

## Related

- [tool_cataloging](tool_cataloging.md) — the natural follow-up: drag real records into the hierarchy this tool generates.
- [tool_ontology](tool_ontology.md) (and its sibling `tool_ontology_parser`) — developer tools that parse/sync ontology records into the `dd_ontology` runtime table that this tool writes into.
- [Creating new tools](../creating_tools.md) · [Server contract](../server_contract.md) — the tool model, `apiActions`, gates and lifecycle this page builds on.
- [Exporting data](../../../core/exporting_data.md) — once a hierarchy holds data, [tool_export](tool_export.md) flattens its records (with ancestor chains) to a spreadsheet.
- Source: `tools/tool_hierarchy/server/{index,tool_hierarchy}.ts`, `tools/tool_hierarchy/register.json`, `tools/tool_hierarchy/js/{tool_hierarchy,render_tool_hierarchy}.js`; core: `src/core/resolve/hierarchy_provision.ts` (`generateVirtualSection`, `createThesaurusGeneralTerm`), `src/core/resolve/ontology_delete.ts` (`deleteOntologyMain`).
