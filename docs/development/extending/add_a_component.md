# Add a new component model

Create a brand-new component type (a new `model`) in Dédalo v7 — its server-side descriptor, the one registry line, any engine wiring, the client JS/CSS, and the ontology node — by copying an existing sibling and renaming.

## When do you need this?

Most "new fields" do **not** need code. A component **model** (`component_input_text`, `component_email`, `component_image`, …) is the *behaviour*; an ontology node with `model: "component_input_text"` is an *instance* of that behaviour wired into a section. You add a field by creating a node, not code.

| You want… | Do this |
| --- | --- |
| A new field in a section (title, date, a picker, an image…) | **Ontology only** — create a node with an existing `model`. See [ontology instances](../../core/components/component_input_text.md#ontology-instantiation). No code. |
| Tweak how a field looks/validates on one section | **Ontology only** — set `properties` / `css` / `view` on the node. |
| A genuinely new *kind* of value or interaction that no existing model gives you (with its own validation, storage shape, render, search) | **New component model** — this guide. |

Before writing code, confirm no existing model fits: scan the [components index](../../core/components/index.md) and the [base-class decision guide](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend). New models are rare; a thin `properties` tweak on an existing model is almost always the answer.

In the Bun/TS rewrite there is **no per-model server class, no `component_X_json.php`, and no autoloader**. Component behavior lives in **horizontal engines** that dispatch on the `model` string:

- `src/core/section/read.ts` (`emitDdoData`) — emits a component's `{context, data}` on a section read.
- `src/core/relations/` — the relation family's row emission and search.
- `src/core/resolve/` — literal value resolution, translation gating, info-widget compute.

A model is **declared** by a small `descriptor.ts` collected in `src/core/components/registry.ts`. The directory `src/core/components/component_X/` is the model's *named home*; the registry line is the whole server-side contract. That descriptor is declarative — it holds small data (which column, is it class-translatable, which relation resolver) and links out to the engine modules; it must never grow inline logic.

!!! note "Components have no `apiActions`"
    `apiActions` is a **tools-only** surface (see [creating tools](../tools/creating_tools.md)). A component never registers remote actions of its own — its server data is emitted by the section-read engine. Do not give a component model an action registry.

---

## Worked example

Throughout, we add **`component_phone`**: a literal-direct phone-number string, sitting alongside `component_email`. It owns its own value (it is not a locator and not media) and is language-neutral, so it stores in the **`string`** matrix column — the same column as [`component_email`](../../core/components/component_email.md) and [`component_input_text`](../../core/components/component_input_text.md). The fastest, most accurate path is to **copy `component_email`'s descriptor** (server) and the copied client's `core/component_email/` directory (client), then rename every `email` token.

---

## 1. Choose the matrix column (what the value IS)

Pick where the value is stored and which engine path emits it. Work top-down, stop at the first match (full rationale in the [base-class decision guide](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend)):

| If the value is… | `column` | Emitted by | Reference model |
| --- | --- | --- | --- |
| A **locator** to another section/record (picker, select, portal, parent/children) | `relation` | a `RelationModelResolver` in `src/core/relations/models/` (dispatched by `getRelationResolver`) | `component_portal`, `component_select` |
| A **file** on disk (image, audio/video, pdf, 3d, svg) | `media` | the media branch of `emitDdoData` + `src/core/media/` | `component_image` |
| A **single-/multi-line string** needing sanitisation, language fallback | `string` | the generic literal branch of `emitDdoData` | `component_input_text`, `component_email` |
| A **literal with its own format** | `number` / `date` / `iri` / `geo` / `misc` | the generic literal branch (or the `component_info` widget framework under `src/core/components/component_info/widgets/` for computed) | `component_number`, `component_date`, `component_json` |
| The record's own **id** | `section_id` | the `component_section_id` short-circuit in `emitDdoData` | `component_section_id` |

The recognised `column` values (verified in `src/core/components/*/descriptor.ts`) are exactly: `string`, `relation`, `media`, `number`, `date`, `geo`, `iri`, `section_id`, `misc`.

For our example, a phone number is its own literal string value → **`column: 'string'`**, emitted by the generic literal branch.

---

## 2. Create the descriptor

Create `src/core/components/component_phone/descriptor.ts` exporting one `ComponentModel` (the interface is `src/core/components/types.ts`). Keep it **declarative** — small data only:

``` ts
/**
 * component_phone — literal-direct phone-number string. Stores {id,value,lang}
 * items in the `string` matrix column. Language-neutral, so NOT class-translatable.
 */
import type { ComponentModel } from '../types.ts';

export const component_phone: ComponentModel = {
	model: 'component_phone',
	column: 'string',
	// classSupportsTranslation omitted → phone items are not lang-filtered.
};
```

The `ComponentModel` fields the engines actually read:

- **`model`** — the canonical name; must equal the directory name and the client export.
- **`column`** — the matrix JSONB column its data lands in (step 1). `getColumnNameByModel()` (`src/core/ontology/resolver.ts`) returns it. **Omit it only for an alias-only stub that never stores under its own name.**
- **`classSupportsTranslation`** — CLASS-level translation support (independent of the ontology `translatable` flag). Only models with this `true` lang-filter their data items on read (consumed by `resolve/component_data.ts`). `component_input_text`/`component_email` set it; a language-neutral phone omits it.
- **`resolveData`** — a `RelationModelResolver` (relation-column models only); its presence is how the registry knows a model is a resolvable relation. See step 4.
- **`search`** — relation search coverage (`{ status: 'ported' | 'unported', reason? }`, relation models only).
- **`alias`** — a legacy stored model name → canonical runtime model, for obsolete v5/v6 names.

!!! note "The descriptor never holds logic"
    A descriptor DECLARES deltas and LINKS OUT to behavior in a file comment. `component_relation_parent/descriptor.ts` is the model: it sets `resolveData: portalResolver` and points, in a comment, to `relations/parent.ts` (hierarchy/order) and `relations/dataframe.ts` (id_key order). If you find yourself writing an algorithm in `descriptor.ts`, it belongs in an engine module.

---

## 2b. A relation or media model (if that is what you picked)

Only if step 1 landed on `relation` or `media`:

- **relation** — the descriptor also needs `resolveData` (a resolver from `src/core/relations/models/`) and `search`. For a link that renders like a portal cell, reuse `portalResolver` (`src/core/relations/models/portal.ts`), exactly as `component_relation_parent` does; give it its own resolver only when row emission must diverge. The model's distinctive behavior (directionality, inverse, children walk) lives in `src/core/relations/` — the descriptor points to it, it does not contain it.
- **media** — set `column: 'media'`; the paths/URLs/quality/upload machinery is `src/core/media/`, dispatched by the media branch of `emitDdoData`. There is no per-media class to implement — the media engine is horizontal.

---

## 3. Register the model (the one registry edit)

Add the import and the array entry in `src/core/components/registry.ts` — alphabetically, next to its siblings:

``` ts
import { component_phone } from './component_phone/descriptor.ts';
// …
const ALL_DESCRIPTORS: readonly ComponentModel[] = [
	// …
	component_password,
	component_phone,   // ← add yours
	component_pdf,
	// …
];
```

That is the whole server-side registration. `buildRegistry()` runs a **load-time integrity check**: a duplicate model, or an `alias` pointing at a non-existent / column-less model, throws at boot — turning a stale registry into a startup failure instead of a runtime surprise. The equivalence is pinned by `test/unit/component_registry.test.ts`.

This replaces the old PHP `section_record_data::$column_map` central edit: the column map is now **decentralised**, one `column` per descriptor, and `getColumnNameByModel(model)` reads `descriptor.column ?? null`.

!!! danger "Forget the `column` (or the registry line) and DB reads/writes silently break"
    `getColumnNameByModel('component_phone')` returns `null` if the descriptor has no `column` or the model was never registered. Callers that don't guard fail to persist or read the component's data. Our `component_phone` stores a string, so `column: 'string'`.

---

## 4. Engine wiring (only for bespoke behavior)

A plain literal needs **no** further server code — the generic literal branch of `emitDdoData` (`src/core/section/read.ts`) reads the descriptor's `column`, pulls the stored `{id,value,lang}` items, applies the translation gate (`classSupportsTranslation`) and lang fallback, and emits the `{context, data}` item. That is why `component_email`'s descriptor is three lines: the engine already does the work.

Add engine code only for genuinely new behavior:

- **Server-side validation / normalisation** (e.g. reject a malformed phone number, strip spaces) goes on the **write path**, `src/core/section/record/save_component.ts` — the TS equivalent of PHP `set_data`/`save`. Add the check keyed on the model.
- **A relation particularity** goes in `src/core/relations/` and is referenced from the descriptor's `resolveData`.
- **A computed/read-only value** (an info-widget style calculation) goes in the `component_info` widget framework (`src/core/components/component_info/widgets/`, dispatched by `computeInfoWidgets`), which the `component_info` emit path calls. See [add a widget](add_a_widget.md).

Do **not** re-implement datum load/save, permissions, request_config or search in a new place — if you are, you mismodelled the column ([keep the descriptor thin](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend)).

---

## 5. Implement the client class

The client is the **copied vanilla-JS client**, unchanged from PHP-era Dédalo. Copy `client/dedalo/core/component_email/` to `client/dedalo/core/component_phone/` and rename. The model is dynamically imported by `client/dedalo/core/common/js/instances.js` from `core/<model>/js/<model>.js` (the default branch; `service_*` and `tool_*` have their own branches). **The named export must match the model exactly.**

``` js
// imports
import {common}            from '../../common/js/common.js'
import {component_common}  from '../../component_common/js/component_common.js'
import {render_edit_component_phone}   from './render_edit_component_phone.js'
import {render_list_component_phone}   from './render_list_component_phone.js'
import {render_search_component_phone} from './render_search_component_phone.js'

// named export MUST equal the model
export const component_phone = function(){
	this.id           = null
	this.model        = null
	this.tipo         = null
	this.section_tipo = null
	this.section_id   = null
	// … declare the rest, mirroring component_email.js
}
```

Then assign the lifecycle prototypes from `component_common` / `common` (`init`, `build`, `render`, `save`, `change_value`, `destroy`) and the per-mode `edit` / `list` / `search` aliases, exactly as `component_email.js` does. The instance inherits the full `init → build → render → save → destroy` lifecycle from `component_common`. The client contract is what the server context must satisfy — the shape the engine emits is verified against these client modules.

---

## 6. Implement render dispatchers and views

Mirror the `component_email` set in the copied client (file nomenclature: `render_<mode>_component_<name>.js` and `<view>_<mode>_<name>.js` — see the [components index nomenclature](../../core/components/index.md#nomenclature-of-files)):

- **Per-mode dispatchers** — `js/render_edit_component_phone.js`, `js/render_list_component_phone.js`, `js/render_search_component_phone.js`. Each imports and routes to the right view by `context.view`.
- **View builders** (the actual DOM) — copy email's set and rename: `js/view_default_edit_phone.js`, `js/view_line_edit_phone.js`, `js/view_mini_phone.js`, `js/view_default_list_phone.js`, `js/view_text_list_phone.js`.

Render only the views/modes the component supports (`edit`, `list`, `search`, `tm`; `tm` typically reuses the `list` renderer). Compare [`component_email` render views](../../core/components/component_email.md#render-views--modes) for a minimal set and [`component_input_text`](../../core/components/component_input_text.md#render-views--modes) for a richer one.

---

## 7. Add the CSS (LESS)

Create `client/dedalo/core/component_phone/css/component_phone.less` (plus per-view LESS if needed). LESS is **not** compiled standalone — the final CSS is bundled into `page.css`. Follow the *dedalo-css-styling* design-system conventions; style hangs off the `.wrapper_component` stamped from the node's `css` property.

---

## 8. Create the ontology node(s)

The model now exists; instantiate it. Create an ontology node with `model: "component_phone"` whose `parent`/`section_tipo` wire it into a section (or a section grouper). The `lg-*` terms are the field label; translatability and `properties` come from the node.

``` json
{
    "tipo"         : "tch443",
    "model"        : "component_phone",
    "parent"       : "tch1",
    "section_tipo" : "tch1",
    "lg-eng"       : "Contact phone",
    "lg-spa"       : "Teléfono de contacto",
    "properties"   : { "mandatory": false }
}
```

`section_tipo` is **mandatory** at instantiation. Wiring the node as a child (directly or via a grouper) of the section is what makes the field appear in that section's edit form. See [`component_email` ontology instantiation](../../core/components/component_email.md#ontology-instantiation) for the full node/`properties` shape, and the *dedalo-ontology-instances* skill for creating nodes in the UI. Node-shape references live in `core/ontology/templates/`. Regenerate the TLD to compile the edit into the runtime `dd_ontology` — no per-worker cache to clear (the single Bun process resolves it fresh).

---

## 9. (Optional) samples and a test

- **Samples** — drop `src/core/components/component_phone/samples/` (`data.json`, `context.json`, `api_data.json`) modelled on `component_email/samples/`. They mirror the copied client's `client/dedalo/core/component_*/samples/` tree — reference only, no runtime code reads them.
- **Test** — the registry equivalence is already pinned by `test/unit/component_registry.test.ts` (it will assert your descriptor exists and is well-formed). For bespoke `set_data` normalisation / `save` validation, add a `bun:test` under `test/` (a `*_differential.test.ts` if you want to diff the emitted item against the PHP oracle). Run with `bun test`.

---

## Recap — files to create/edit

``` shell
# --- server (Bun/TS) ---
src/core/components/component_phone/
├── descriptor.ts              # step 2  ({ model, column:'string' })
└── samples/                   # step 9  (optional reference set)
    ├── data.json
    ├── context.json
    └── api_data.json
src/core/components/registry.ts            # step 3  (import + array entry — the ONE registry edit)
src/core/section/record/save_component.ts  # step 4  (only if it needs server-side validation)

# --- client (copied vanilla JS) ---
client/dedalo/core/component_phone/
├── css/
│   └── component_phone.less           # step 7
└── js/
    ├── component_phone.js             # step 5  (named export == model)
    ├── render_edit_component_phone.js     # step 6
    ├── render_list_component_phone.js     # step 6
    ├── render_search_component_phone.js   # step 6
    ├── view_default_edit_phone.js         # step 6
    ├── view_line_edit_phone.js            # step 6
    ├── view_mini_phone.js                 # step 6
    ├── view_default_list_phone.js         # step 6
    └── view_text_list_phone.js            # step 6

# + ontology node(s) with model:"component_phone"     # step 8
```

---

## Common pitfalls

- **Missing `column` / registry line (steps 2–3).** The single non-convention edit. Without a `column` or without registering the descriptor, `getColumnNameByModel()` returns `null` and the component's data never persists/loads — silently. This is the most common omission.
- **JS export name ≠ model.** `instances.js` instantiates the module's named export *matching the model*. `export const component_phone = …` must equal the directory/model name, or instantiation fails.
- **Hunting for a PHP class or `_json.php`.** There is none in the TS server. The descriptor + registry entry is the whole server contract; the horizontal engines (`section/read.ts`, `relations/`, `resolve/`) emit the `{context, data}`.
- **Putting logic in the descriptor.** A descriptor is declarative. Bespoke behavior goes in an engine module (`relations/`, `save_component.ts`, `info_widgets.ts`) and is *referenced* from the descriptor, never inlined.
- **Adding `apiActions` to a component.** That belongs to [tools](../tools/creating_tools.md), not components.
- **Picking the wrong column.** If you find yourself re-implementing datum load/save, permissions or search, you mismodelled the value. Re-read the [decision guide](../../core/components/base_classes.md#decision-guide-which-base-should-a-new-component-extend) and pick the column that matches.
- **Forcing translatability the component should not have.** Set `classSupportsTranslation: true` only for models whose data items are lang-filtered; a language-neutral value (email, phone) omits it.
- **No scaffolder.** Unlike tools (which have `tools/tool_dev_template/` and `scripts/create_tool.ts`), components have **no generator**. Copy an existing descriptor + the copied client sibling directory, rename every token, and add the registry line plus the ontology node.

---

## Related

- [Component base classes](../../core/components/base_classes.md) — the value-typology decision guide (which column a new component stores in).
- [Introduction to components](../../core/components/index.md) — file nomenclature, datum, context, data, permissions.
- [`component_input_text`](../../core/components/component_input_text.md) — reference `string` component to copy (translatable variant).
- [`component_email`](../../core/components/component_email.md) — reference `string` component to copy (non-translatable).
- [Locators](../../core/locator.md) — the locator object, if your model stores in the `relation` column.
- [Creating new tools](../tools/creating_tools.md) — the companion guide for the tools extension surface (and where `apiActions` lives).
- Source of truth: `src/core/components/registry.ts`, `src/core/components/types.ts`, `src/core/components/README.md`, `src/core/section/read.ts` (`emitDdoData`), `src/core/relations/` (relation resolvers).
- Skills: *dedalo-relations-ts* (the relation family), *dedalo-section-family-ts* (the read engine + client context contract), *dedalo-context-data-layers*, *dedalo-ontology-instances* (creating nodes), *dedalo-css-styling*, *dedalo-search*.
