# component_security_access

## Overview

```json
{
    "could_be_translatable" : false,
    "is_literal": true,
    "is_related": false,
    "is_media": false,
    "modes": ["edit","list","tm","search"],
    "default_tools" : [
        "tool_propagate_component_data",
        "tool_time_machine"
    ],
    "render_views" :[
        {
            "view"    : "default | line | print",
            "mode"    : "edit"
        },
        {
            "view"    : "default | mini | text",
            "mode"    : "list"
        }
    ],
    "data": "array of permission objects",
    "sample_data": [
        {"id": 1, "tipo": "rsc197", "section_tipo": "rsc197", "value": 2},
        {"id": 2, "tipo": "rsc85",  "section_tipo": "rsc197", "value": 2},
        {"id": 3, "tipo": "rsc261", "section_tipo": "rsc197", "value": 1}
    ],
    "value": "array of permission objects",
    "sample_value": [
        {"id": 1, "tipo": "rsc197", "section_tipo": "rsc197", "value": 2}
    ]
}
```

!!! note "Atypical literal component"
    Unlike most literal components (whose value is an array of scalar strings keyed by lang), `component_security_access` stores an **array of permission objects**. It is a non-translatable, direct literal component — it owns and saves its own data — but the payload is a flat permission matrix, not a list of localized strings. The component is single-value at the section level (it is registered in `$components_monovalue`): one permission set per profile record.

## Definition

`component_security_access` is the access-control component of Dédalo. It stores, for a single security profile, the **permission level the profile holds over every reachable ontology element** (areas, sections, section groups, components, buttons, relation lists, etc.). It is the data backbone of role/profile-based security: when a user logs in, their profile's `component_security_access` data is read to build the permission table that gates every read, write and admin operation across the application.

It lives in the **Profiles** section (`dd234`) as component tipo `dd774` (`DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO`). Each profile record carries one instance whose data answers the question *"what may this profile do with each part of the ontology?"*.

The editing UI renders the whole ontology as an expandable tree. Each node exposes a set of radio buttons for the four permission levels:

| value | level |
| --- | --- |
| 0 | no access |
| 1 | read only |
| 2 | read and edit |
| 3 | admin (full control) |

Areas and sections do not store permissions themselves; they **derive and propagate** a calculated permission from the combination of their children's values (a parent shows a level only when all its children share it). Only the leaf nodes inside sections (components, buttons, groupers) carry stored permission rows.

**Why it exists.** Dédalo follows the standard schema: state lives in sections/components, never in bespoke tables. Security is no exception — profiles are ordinary section records and their permission map is an ordinary component datum. This keeps permissions versioned in Time Machine, propagable, and importable/exportable like any other component.

**When to use it.** Only inside the Profiles section to define what a profile may access. In a cultural-heritage installation, a typical profile might grant:

- `value: 2` (read+edit) over the *Archaeological objects* section and its description fields,
- `value: 1` (read only) over the linked *Thesaurus* sections so cataloguers can pick terms but not edit the controlled vocabulary,
- `value: 0` (implicit, simply absent) over the administration area,
- `value: 3` (admin) for a curator profile that manages section structure.

**When not to use it.** Never as a generic field in domain sections. It is not a data-entry widget for object metadata; it is the security configuration surface. To restrict a *single* record (not a whole profile) use the projects/filter machinery instead.

## Data model

**Data:** `array` of permission objects, or `null`.

**Value:** `array` of permission objects, or `null`. (For this component, *data* and *value* coincide — there is no per-lang split because the component is non-translatable.)

**Storage:** the persisted unit is the standard datum `{context, data}`; the values live in `data`. In the matrix table the data column for `component_security_access` is **`misc`** (`data_column_name = 'misc'`). The stored array is a flat list of permission rows, each carrying the standard counter `id`, the target element `tipo`, the owning `section_tipo`, and the integer permission `value`:

```json
[
    {"id": 1, "tipo": "rsc197", "section_tipo": "rsc197", "value": 2},
    {"id": 2, "tipo": "rsc85",  "section_tipo": "rsc197", "value": 2},
    {"id": 3, "tipo": "rsc261", "section_tipo": "rsc197", "value": 1},
    {"id": 4, "tipo": "rsc170", "section_tipo": "rsc170", "value": 2}
]
```

Each row reads as: *"this profile has permission `value` over element `tipo`, located in section `section_tipo`."* When `tipo === section_tipo` the row is the section (or area) itself; otherwise it is a leaf element belonging to that section.

!!! note "Non-translatable, no lang split"
    The component is instantiated with `lang = lg-nolan` and `translatable: false`. There is no `lg-spa` / `lg-eng` variant of the permission matrix — a single map applies across all languages.

!!! note "Zero values are not persisted"
    Rows whose `value` is `0` (no access) are **not** saved. The client builds a full `filled_value` array (every datalist node, defaulting absent ones to `0`) for the UI, but on save (`save_changes()`) it strips every `value <= 0` entry before persisting. Absence of a row therefore means *no access*.

### Datalist (the tree), not stored

In `edit` mode the datum also ships a `datalist`: the complete ontology hierarchy (areas → sections → elements) used to render the tree. This is **derived, not stored data** — it is computed by `get_datalist()` and is identical for all profiles (permissions differ, the tree does not). In PHP, because resolving it is expensive (≈3–6 s), the login sequence pre-calculates it in the background and `dd_cache::cache_from_file()` caches it per application language as `cache_tree_<lang>.php`. The TS server ports the tree builder faithfully — `src/core/resolve/security_access_datalist.ts` (`getSecurityAccessDatalist`, a documented line-by-line port of `get_datalist()` / `get_element_datalist()` / `get_children_recursive_security_access()`) — but **not** the per-language file cache: there is no `cache_tree_<lang>` equivalent under `src/`, so the TS server recomputes the tree on every read. Each datalist item carries its full parent chain in `ar_parent`, letting the client resolve children/parents (and propagate values up the tree) without re-walking the ontology:

```json
{
    "tipo"        : "rsc85",
    "section_tipo": "rsc197",
    "model"       : "component_input_text",
    "label"       : "Title",
    "parent"      : "rsc76",
    "ar_parent"   : ["rsc197", "rsc76"]
}
```

!!! danger "Gap: TS datalist covers only the GLOBAL-ADMIN (unfiltered) branch"
    PHP's `get_datalist()` narrows the returned **area list** by
    `security::get_user_security_access($user_id)` for non-global-admin
    callers. The TS port (`security_access_datalist.ts`) implements **only**
    the global-admin/unfiltered branch — its own module header records this as
    a ledgered gap: *"This port implements ONLY the global-admin / unfiltered
    branch, because the TS read path currently runs as admin/root. A future
    ACL-threading pass must pass the principal here and filter `getAreas` to
    the areas present in the user's own security-access data."* Until that
    lands, requesting this datalist as a non-admin principal would return the
    full unfiltered tree rather than the PHP-narrowed one.

## Ontology instantiation

`component_security_access` is a singular core component: in a stock install there is one instance, `dd774`, wired into the Profiles section `dd234`. You normally do not create new instances; the node already exists. The node definition looks like:

```json
{
    "tipo"          : "dd774",
    "model"         : "component_security_access",
    "parent"        : "dd234",
    "parent_grouper": "dd1718",
    "lg-eng"        : "Permissions",
    "lg-spa"        : "Permisos"
}
```

Wiring into the section:

- `parent` / `section_tipo` is the **Profiles** section `dd234` (`DEDALO_SECTION_PROFILES_TIPO`).
- `parent_grouper` places it inside a section group of the profile edit view.
- The constants `DEDALO_SECTION_PROFILES_TIPO` (`dd234`) and `DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO` (`dd774`) in `core/base/dd_tipos.php` bind the security subsystem to this node in PHP; `calculate_tree()` reads exactly this section_tipo/tipo pair to build the per-profile permission tree. The TS server has no equivalent named constants module for these two tipos — the modules that need them (`src/core/section/read.ts`, `src/core/resolve/structure_context.ts`, `src/core/resolve/security_access_datalist.ts`) match on the literal model string `'component_security_access'` and the tipo `'dd774'`/`'dd234'` inline, with a comment pointing back to the PHP constant name.

Realistic `properties` block — in practice **empty**:

```json
{}
```

The component is configuration-free in the ontology: it consumes no special properties of its own. Its behavior (tree shape, exclusions, permission levels) is derived from the live ontology and from the section's own structure, not from per-node properties. Only the generic, common-level context applies (e.g. an optional `css` block). What it *does* read from the ontology is structural, resolved at runtime by `get_element_datalist()`:

- **`exclude_elements`** — a relation on the *target* section being walked. If a section declares an `exclude_elements` child, the elements it lists are dropped from that section's permission tree (they will never get a permission row).
- A section's `source.request_config` `show.ddo_map` (v6-style virtual sections) is honored to enumerate the virtual components shown for permissioning.

Hard-coded structural exclusions (not configurable via properties) are also applied while walking: models `component_security_administrator`, `section_list`, `search_list`, `component_semantic_node`, `box_elements`, `exclude_elements`, `edit_view`, plus any tipos listed in the install constant `DEDALO_AR_EXCLUDE_COMPONENTS`. The whole **Admin** area and its children are likewise excluded from the tree (`get_ar_tipo_admin()`).

## Properties & options

This component defines **no component-specific ontology properties**. In stock installations `properties` is `{}` and the JSON controller only inspects the generic `unique` flag (shared by all components) to decide whether to attach a search RQO — it is not meaningful for security access and is not used in practice.

| property | accepted values | default | effect |
| --- | --- | --- | --- |
| `css` | object | `null` | Generic, common-level style block stamped into `context.css` (e.g. `grid-column` span). Not specific to this component. |

!!! warning "Do not invent properties"
    There are no `permission_levels`, `tree`, `exclude`, etc. properties on this component. Tree construction and exclusions are driven by **ontology structure** (the section's own children, its `exclude_elements` relation, and the global exclude lists), not by node properties. If you think you need a new property here, verify in the ontology and against `get_element_datalist()` / `get_children_recursive_security_access()` first.

The values consumed at runtime that *behave like* configuration but originate elsewhere:

| source | where it lives | effect |
| --- | --- | --- |
| `exclude_elements` relation | on each walked **section** node | removes the listed elements from that section's permission tree |
| `DEDALO_AR_EXCLUDE_COMPONENTS` | install config constant | globally removes the listed tipos from the tree |
| Admin area (`area_admin`) | ontology | the admin area and its descendants are never shown for permissioning |

## Render views & modes

The client (`component_security_access.js`) maps modes to renderers as follows:

| mode | renderer | views |
| --- | --- | --- |
| `edit` | `render_edit_component_security_access` | `default`, `line`, `print` (all routed to `view_default_edit_security_access`; `print` forces read-only by setting `permissions = 1`) |
| `list` | `render_list_component_security_access` | `default`, `mini`, `text` |
| `tm` | (same as `list`) | `default`, `mini`, `text` |
| `search` | `render_search_component_security_access` | `default` (placeholder — search UI is minimal) |

- **edit** is the rich view: the ontology tree is rendered as nested `ul`/`li`, each node showing radio buttons for permission levels (color-coded in CSS: `val_0` red, `val_1` orange, `>=2` green). Selecting a value on a node propagates up the parent chain (`update_parents_radio_butons`) and a `button_save` (sticky) commits the change. A side `changes_container` can display schema change files.
- **list / tm** views are intentionally austere — the raw permission matrix is not human-friendly, so `view_default_list_security_access` renders the placeholder string `"View list unavailable"`. The Time Machine mode reuses the list renderer.
- **search** mode renders a placeholder (`"Working here! (search mode)"`); saving is blocked in search mode at the component level. In PHP, the Profiles section is explicitly **not** filtered by the search WHERE machinery (`trait.where.php` profiles branch applies no row filter). On the TS server there is no `component_security_access` branch in `src/core/search/conform.ts` at all, so a search filter against this model throws `builder for model 'component_security_access' not implemented yet` — the practical outcome (no filtering) is the same, but for a different reason (unimplemented rather than a deliberate pass-through).

!!! note "Web worker for tree math"
    `init()` registers `worker_security_access.js`. The recursive `get_children` / `get_parents` walks over the (potentially large) datalist are offloaded to this worker to keep the UI responsive while propagating permission values across the tree.

## Import / export model

`component_security_access` does **not** override `conform_import_data` or the export atoms, so it inherits the generic `component_common` behavior. The import/export unit is the JSON of its `data` — the array of permission objects:

```json
[
    {"id": 1, "tipo": "rsc197", "section_tipo": "rsc197", "value": 2},
    {"id": 2, "tipo": "rsc85",  "section_tipo": "rsc197", "value": 2},
    {"id": 3, "tipo": "rsc261", "section_tipo": "rsc197", "value": 1}
]
```

Because the meaning of each row depends on live ontology tipos, importing a permission matrix is only sound between installations that share the same ontology tipos. The canonical JSON-array-of-objects shape imports through the generic TS engine (`conformImportData()`, `src/core/tools/import_data.ts`) without any component-specific handling needed. In PHP there is **no diffusion value**: `get_diffusion_value()` is overridden to return the literal placeholder `"There is no diffusion value for this component"`, so permission data is never published to diffusion targets; not independently verified against the TS diffusion engine for this pass.

See the full import model in [importing data](../importing_data.md) and the export model in [exporting data](../exporting_data.md).

## Notes

- **Single source of truth for permissions — ported.** The stored matrix feeds the runtime permission table on both servers: TS `src/core/security/permissions.ts` reads a caller's grants straight from the `dd774` datum in their profile record (`dd234`, via the profile-select `dd1725`), the same source PHP's `security::get_security_permissions()` reads, with its own per-user cache (`clearPermissionsCache`) rather than PHP's `reset_permissions_table()`. Editing the matrix itself requires admin-level access.
- **`set_section_permissions()`** — the PHP programmatic entry point used when generating hierarchies for users (grants a profile a permission over a list of section tipos and all their children). No TS equivalent has been verified for this pass.
- **`calculate_tree()` / `get_datalist()` — tree logic ported, file cache not.** `src/core/resolve/security_access_datalist.ts` reproduces the tree-building algorithm (see the gap note under [Ontology instantiation](#ontology-instantiation) regarding the non-admin filtering branch), but there is no `cache_tree_<lang>.php`-style file cache in TS — the tree is recomputed per request.
- **`get_sortable()` returns `false`** in PHP — this component never offers sort buttons in list headers; the TS structure context hardcodes `sortable: false` for every component today, so this is not yet a distinguishing behaviour.
- **Default tools** (from `context.tools`): `tool_propagate_component_data` (copy a profile's permission set to other records) and `tool_time_machine` (permission changes are versioned like any other save). No `tool_lang` — the component is non-translatable.
- **Observers/observables:** none configured; permission propagation happens entirely client-side across the tree via `event_manager` topics (`update_item_value_*`, `update_area_radio_*`), not through the ontology observer mechanism.
- Related components: this is a literal-direct component like [component_input_text](component_input_text.md) and [component_number](component_number.md); for relational components see [component_portal](component_portal.md). Permission *levels* (0–3) are documented in [the components index](index.md#permissions).
