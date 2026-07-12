# Add a new area

Add a new top-level grouping to the back-office menu — a node that contains sections and sub-areas, scopes permissions and shows an aggregated dashboard, but owns no records of its own.

This is a *how-to* guide. For the conceptual model and the reference, read first:

- [Areas (index)](../../core/areas/index.md) — what an area is, the behavior taxonomy, and the roster of every shipped area
- [area](../../core/areas/area.md) — the shared behavior (the dashboard structure-walk and its metrics) plus the top-level menu and security roster

## When do you need this

An area is **almost always ontology-only**, and it needs **no server module at all**. Areas are served by a single horizontal engine, `src/core/area/read.ts`, which dispatches by *behavior* (`dashboard` / `tree` / `maintenance`, resolved by `areaBehaviorOf(model)` in `src/core/concepts/area.ts`). A plain new grouping with the standard dashboard is just an ontology node reusing the generic `area` model.

| You need | Then |
| --- | --- |
| A new menu grouping with the standard dashboard | **Ontology only** — an `area` node child of a root area (steps 2–4). No code. |
| A new grouping that must be told apart for its **own client JS/CSS** or a future distinct behavior | Register a new area **model** in `src/core/concepts/area.ts` + add its client module (step 1). |
| Custom server logic — a different JSON payload, a tree view, extra actions | Extend the area engine (`src/core/area/read.ts` / `tree.ts` / `dashboard.ts`). `area_thesaurus` / `area_ontology` are the tree-behavior areas. |
| A new per-section dashboard metric | Extend `src/core/area/dashboard.ts` — see the metric gap note in [step 5](#5-optional-client-assets-and-metrics). |

!!! note "Why register a model at all, if you can reuse `area`?"
    The client resolves a node's `model` to a JS module by directory name: a node
    with `model: 'area_numisdata'` makes `instances.js` import
    `core/area_numisdata/js/area_numisdata.js`. So if you want per-area JS/CSS
    (or a name the UI can distinguish), the model must exist on **both** sides —
    a client module **and** an entry in the server's area-behavior registry. If
    you do **not** need that, reuse `model: 'area'`, add only a node, and skip
    step 1 entirely — `area_admin`, `area_resource`, `area_root` and the other
    stubs all share the generic `dashboard` behavior.

## 1. (Only for a distinct model) Register the area model

Skip this step if you are reusing `model: 'area'`. To introduce a distinct area model (`area_numisdata`) you register it in **two** places.

**Server (TS):** add it to the behavior map in `src/core/concepts/area.ts`. A standard grouping gets `dashboard` behavior:

``` ts
// src/core/concepts/area.ts — AREA_BEHAVIOR
const AREA_BEHAVIOR = new Map<string, AreaBehavior>([
	['area', 'dashboard'],
	['area_admin', 'dashboard'],
	// …
	['area_numisdata', 'dashboard'],   // ← add yours
	['area_thesaurus', 'tree'],
	['area_maintenance', 'maintenance'],
]);
```

`isAreaModel()` already recognises any `area_*` name, so the model is treated as record-less automatically (see step 2). Registering it in `AREA_BEHAVIOR` is what tells `areaBehaviorOf()` which read path (`dashboard` / `tree` / `maintenance`) to serve.

**Client (vanilla JS):** add `client/dedalo/core/area_numisdata/js/area_numisdata.js` with a named export equal to the model. The simplest form aliases the base area class, exactly like `core/area_admin/js/area_admin.js`:

``` js
// imports
    import {area} from '../../area/js/area.js'

/**
* AREA_NUMISDATA. Alias of area
*/
export const area_numisdata = area
```

`client/dedalo/core/common/js/instances.js` imports the default-prefix model from `core/<model>/js/<model>.js`, so this path is convention, not configuration. Add an optional `core/area_numisdata/css/area_numisdata.less` for styling.

!!! note "No matrix table — by design"
    `getMatrixTableFromTipo()` (`src/core/ontology/resolver.ts`) returns `null`
    for any node whose model is not `section`, so every `area*` model is
    record-less automatically. Do not give your area a `matrix_table` term.

## 2. Add the ontology node

Create one ontology node for the area. Use `model: 'area'` for a plain grouping, or `model: 'area_numisdata'` if you registered a distinct model in step 1. Areas use the parent/children grouper shape, not a section's `matrix_table` wiring — see the node-shape reference at `core/ontology/templates/area_grouper_data.json` and the [Ontology](../../core/ontology/index.md) docs. The node needs:

- `model` = `area` (or your registered model)
- a **term/label** (the menu caption, per language)
- a **parent** in the ontology so it is reachable by the menu walk (step 3)
- the sections it groups, attached as **ontology children** (step 4)

The model value lives on the node and is read server-side via `getModelByTipo(tipo)` (`src/core/ontology/resolver.ts`) and client-side as `options.model`; the area-read engine (`src/core/area/read.ts`) resolves that model to a behavior and serves the corresponding payload.

## 3. Wire it into the menu roster

A node alone does not appear in the menu. The menu is built from a **fixed order of root-area models** — `MENU_ROOT_MODEL_ORDER` in `src/core/concepts/area.ts` — each of whose children is collected recursively (filtered by the resolved deny/allow lists). You have two ways to surface a new area:

- **Sub-area (recommended):** attach your area node as an ontology **child of an existing root area** (e.g. under `area_resource` or `area_admin`). The menu walk descends children recursively, so it is picked up automatically — no code edit.
- **New root area:** if it must sit at the top level beside Resources/Admin/…, add its model to `MENU_ROOT_MODEL_ORDER` in `src/core/concepts/area.ts`. This is the one code edit a root-level area requires.

!!! warning "Allow/deny per installation"
    The menu and security roster honour a per-installation deny/allow list,
    resolved by `src/core/resolve/server_state.ts` (the `AREAS_DENY` config key
    supplies the default). If an installation lists your area tipo in the deny
    list it is hidden even though the node and model are correct. Check there
    first if a correctly-wired area does not appear.

## 4. Attach the sections it groups

An area is a container: it groups [sections](../../core/sections/index.md) (and sub-areas) as ontology children. Attach each section node as a child of your area node. `getDashboardChildSections()` (`src/core/area/dashboard.ts`) walks these children recursively and collects descendant **section** tipos — that list drives the dashboard. The walk descends through `area`/`section`, accepts `section`, and excludes the tools/list/filter models (`DASHBOARD_CHILD_EXCLUDE_MODELS` in `src/core/concepts/area.ts`). No file changes: the dashboard is assembled by `getDashboardData()`.

## 5. (Optional) Client assets and metrics

For a standard area you can stop at step 4 — the client falls through to the shared `core/area/js/area.js` + dashboard modules, and the server serves the generic dashboard payload from `src/core/area/dashboard.ts` (`getDashboardData`). There is no per-area controller; the area-read engine builds the payload horizontally.

Add code only if you need bespoke behaviour:

- **Client class** — a distinct `core/area_numisdata/js/area_numisdata.js` (step 1) with a named export matching the model, for area-specific JS/CSS.
- **A distinct payload / tree view** — extend the area engine (`src/core/area/read.ts` routes tree behavior to `tree.ts`; `area_thesaurus` / `area_ontology` are the tree areas).

!!! warning "A custom dashboard metric needs engine code"
    The dashboard engine (`src/core/area/dashboard.ts`, `getDashboardData`)
    dispatches the `properties.dashboard.metrics` names, but the only per-section
    metric it implements is **`total`** (the permission-aware record count),
    alongside the built-in 30-day activity timeline (`metricActivity`). Listing
    any other name on the node computes nothing: a genuinely new per-section
    metric means adding it to the dashboard engine.

## Worked example: a "Numismatic data" resource area

Goal: a new menu grouping under **Resources** that gathers a few numismatic sections and shows the standard dashboard.

1. **Model (optional)** — if you want area-specific JS/CSS, register `area_numisdata` in `src/core/concepts/area.ts` (`AREA_BEHAVIOR`, `dashboard`) and add `client/dedalo/core/area_numisdata/js/area_numisdata.js` aliasing `area`. Otherwise reuse `model: 'area'` and skip this.
2. **Node** — create one ontology node, `model: 'area_numisdata'` (or `'area'`), with the label `Numismatic data` (per language), parented so it can be reached.
3. **Menu** — attach the new node as an **ontology child of the `area_resource` node**. Because it is a sub-area, the recursive menu walk collects it — no code edit.
4. **Sections** — attach your existing `section` nodes (coins, hoards, mints…) as ontology children of the area node. They now appear under the new grouping, and `getDashboardChildSections()` returns their tipos for the dashboard.

Reload the back-office: "Numismatic data" appears under Resources, its dashboard counts each child section's records (permission-aware, via `countSectionRecords()` in `src/core/search/count.ts`), and the 30-day activity timeline renders from `matrix_activity`.

If instead it had to be a **top-level** grouping beside Resources/Admin, step 3 would become: add `area_numisdata` to `MENU_ROOT_MODEL_ORDER` in `src/core/concepts/area.ts`.

## Common pitfalls

- **Registering a client model with no server behavior (or vice-versa).** A distinct `area_X` model must exist on **both** sides: a client module **and** an `AREA_BEHAVIOR` entry in `src/core/concepts/area.ts`. Miss one and the node either has no JS module or resolves to an uncovered behavior.
- **Client export name ≠ directory name.** `core/area_numisdata/js/area_numisdata.js` must `export const area_numisdata = …`; the dynamic import in `instances.js` looks the export up by model name.
- **Expecting a root area to appear automatically.** The menu iterates a **fixed roster** (`MENU_ROOT_MODEL_ORDER`). A brand-new *root* area must be added to that list; only **sub-areas** (children of an existing root) are picked up by the recursive walk for free.
- **Hidden by `areas.deny`.** A correct area that never shows is often listed in the `areas.deny` config. Check there before debugging code.
- **Giving the area a matrix table.** Areas hold no records; `getMatrixTableFromTipo()` returns `null` for `area*` models by design. Store data in the **sections** the area groups, not the area.
- **Expecting a custom metric to work from ontology alone.** Only `total` is implemented; a new metric name requires extending `src/core/area/dashboard.ts`, not just a `properties.dashboard.metrics` entry.
- **Looking for a per-area server module.** There is none. Areas are horizontal: `src/core/area/read.ts` + `dashboard.ts` + `tree.ts` serve every area by its behavior.

## Related

- [Areas (index)](../../core/areas/index.md) — concept, behavior taxonomy, roster of shipped areas
- [area](../../core/areas/area.md) — the shared dashboard behavior, the menu root order (`MENU_ROOT_MODEL_ORDER`) and the deny/allow lists
- [Sections (index)](../../core/sections/index.md) — the record-bearing leaves an area groups
- [Menu](../../core/ui/menu.md) — the navigation tree built from the root-area roster
- [Ontology (index)](../../core/ontology/index.md) — the active schema the area walk reads
- [Creating tools](../tools/creating_tools.md) — the sibling extension guide (the one extension type with a scaffolder)
- Source of truth: `src/core/concepts/area.ts` (`AREA_BEHAVIOR`, `MENU_ROOT_MODEL_ORDER`), `src/core/area/read.ts`, `src/core/area/dashboard.ts`, `src/core/area/tree.ts`.
- Skill: *dedalo-area-maintenance* (the separate area_maintenance widget dashboard).
