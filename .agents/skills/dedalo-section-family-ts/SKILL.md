---
name: dedalo-section-family-ts
description: The Dédalo v7 TypeScript/Bun rewrite of the SECTION family (src/core/section/) and the vanilla-JS CLIENT RENDERING CONTRACT that the section structure-context must satisfy or the client silently crashes. Use when working in v7/master_dedalo on section reads/edits, structure-context (resolve/structure_context.ts), the section module (section/context.ts, buttons.ts, read.ts, record/, list_definitions/), virtual sections, the section_list/list-mode css, groupers, buttons, section_map, or when the copied client renders a blank/broken edit or list view. Covers the exact context fields the client requires (type='grouper', features, target_sections, css swap), how each missing field crashes which client file, virtual-section resolution, and the Chrome-MCP debugging + stale-server-restart workflow.
---

# Dédalo TS Section Family & Client Rendering Contract

Covers the TypeScript/Bun rewrite (`v7/master_dedalo`) of Dédalo's **section family** and — critically — the **rendering contract** the copied vanilla-JS client demands from the section structure-context. Most "the edit/list view is blank" bugs are NOT missing data: they are a **single missing context field** that makes a client component's render throw, which cascades and zeroes the whole form.

Standing spec: `engineering/SECTION_SPEC.md`. PHP reference (read-only): `v7/master_dedalo`. Every claim below is anchored to PHP `file:line` and/or a client `file:line`.

---

## 1. Where the TS section family lives

```
src/core/concepts/section.ts | section_record.ts | sections.ts   pure contracts (family partition,
                                                                  grouper registry, traversal law, envelope)
src/core/section/
  context.ts       stampSectionContext — section-only context extras (matrix_table,
                   config.relation_list_tipo, buttons, tools, section_map)
  buttons.ts       buildSectionButtons (per-button ACL), sectionRelationListTipo (virtual-aware)
  read.ts          readSection / readSectionRows / deriveSectionDdoMap + the sections envelope
                   (was resolve/read_rows.ts — the shared emitDdoData lives here; relations re-enters via callback)
  locks.ts         component edit locks (TS-native) + forceUnlockAllComponents (read-path unlock hook)
  record/          create_record / duplicate_record / delete_record / save_component
  list_definitions/
    node_find.ts             findSectionChildByModel(sectionTipo, model) — VIRTUAL-AWARE lookup
    section_list.ts          list-cell substitution (was resolve/list_cell_config.ts)
    section_list_thesaurus.ts  tree element list (PHP ts_object::get_ar_elements)
    indexation_list.ts       tag-indexation grid config (head/row ddo_maps)
    time_machine_list.ts     inspector-TM ACCESS gate (canAccessTimeMachineList)
  media_features.ts          media component `features` (quality ladder + upload whitelist)
src/core/resolve/structure_context.ts   buildStructureContext (shared for section/component/area);
                                         section branch delegates to section/context.ts
src/core/ontology/labels.ts  labelByTipo (dd_ontology.term lookup, shared, cycle-free)
src/core/ontology/section_map.ts  getSectionMap (virtual-aware)
```

`buildStructureContext(options)` is the ONE entry that builds a context entry for any element (section, component, area). Its cached `buildCore` holds request-invariant fields; per-call stamps (permissions, parent, lang, view, buttons, tools, features, target_sections) go on a clone. The core cache key is `tipo_sectionTipo_mode` — tools/buttons are stamped per-call (not cached), so there is no cross-user bleed.

---

## 2. THE CLIENT RENDERING CONTRACT (the silent-crash fields)

The copied client (`client/dedalo/core/...`) is unchanged PHP-era JS. It reads specific `context.*` fields and **throws (uncaught, cascading) when they are absent** — the section_record render dies and the DOM shows 0 components even though the server returned correct data. When an edit/list view is blank, **check the console first** (`mcp__chrome-devtools__list_console_messages` types `["error"]`), get the stack, and map it to the table below.

| Missing context field | Client crash site | Symptom | Fix (PHP source) |
|---|---|---|---|
| `type: 'grouper'` on grouper entries | `view_default_edit_section_record.js:218` (`parent_instance.type==='grouper'`) | groupers don't render; components ungrouped/flat | `elementTypeOf` must map grouper models → `'grouper'` (PHP `dd_object::resolve_type_from_model`, class.dd_object.php:2162) |
| `context.features` on media components | `render_edit_component_image.js:130` (`context.features.quality`) | whole media-section edit blank | `section/media_features.ts` — PHP `component_<media>_json.php` default branch (component_image_json.php:80-95) |
| `context.target_sections` on relation components | `render_edit_component_check_box.js:391` (`target_sections.length`) | whole edit form blank | stamp `target_sections=[{tipo,label}]` from the resolved request_config targets (PHP `set_target_sections`, component_check_box_json.php:96-109) |
| correct `css` in LIST mode | client lays out `.list_body` grid from `context.css` | list columns **cascade diagonally** (misaligned) | list-mode css = the **section_list child's** css, not the section's own (§4) |
| component `css` NULLED in LIST mode | client injects `context.css` per component wrapper (`ui.js build_wrapper_list :513`) | component EDIT css (grid-row/grid-column placement) bleeds into every list row | plain components emit `css:null` in list (PHP `remove_edit_css`, §4) |

Key mental model: **the ddo_map and data can be byte-perfect vs PHP and the client still shows nothing.** A differential gate that only compares the ddo_map/data (or a field subset) will pass while the client is broken. Gate the *client-load-bearing* fields explicitly (compare `type`, `features`, `target_sections`, `css`).

### 2a. `elementTypeOf` must match PHP `resolve_type_from_model` exactly
`component_*`/`field_*`→`component`, `section`→`section`, `relation_list`→`relation_list`, grouper models (`section_group`/`section_group_div`/`section_tab`/`tab`)→`grouper`, `button*`→`button`, `area*`→`area`, `tool_*`→`tool`, else the model name. Groupers being `'grouper'` is load-bearing for DOM nesting; components carry `parent_grouper` (= their ontology parent grouper) so the client mounts them into the grouper's `content_data` node.

### 2b. Media `features` (edit mode)
Shape (PHP `context->features`): `allowed_extensions`, `default_target_quality`, `ar_quality`, `default_quality`, `quality`, `key_dir` (`'<mediaType>_<tipo>_<sectionTipo>'`), `alternative_extensions`, `extension`. TS uses PHP **sample-config defaults**; the actual `allowed_extensions`/`alternative_extensions` are install-config specific (e.g. this install drops `webp`, moves `avif` to alternative) — **ledgered**, since TS has no media config catalog. The client only needs `features.quality`/`ar_quality` to not crash; extension lists only affect upload validation.

### 2c. Relation `target_sections`
`[{tipo, label}]` for each target section the relation links to (the client's "go to target section" buttons, gated by `show_interface.button_list`). Source = the resolved request_config's target section tipos (`extractSqoSectionTipos` over `entry.request_config`). `component_filter`/`component_filter_master` keep their fixed `dd153` target.

---

## 3. Virtual sections (edit + everywhere)

A **virtual section** has `dd_ontology.relations[0].tipo` pointing at a real section (e.g. `rsc170` → `rsc2`); a real section (numisdata3) has empty `relations`. Virtual sections borrow the real section's elements MINUS their `exclude_elements`.

- **Edit config** (`relations/request_config/implicit.ts` `buildImplicitSectionEditConfig`): resolve to the real section and walk ITS children; skip the tipos named by the **FIRST** `exclude_elements` child (by `order_number`). Skipping a grouper drops its whole subtree (matches PHP's flat exclude of recursive children). PHP: `get_ar_children_tipo_by_model_name_in_section` with `resolve_virtual=true`, class.section.php:897-940. **Without this the virtual section's edit form is empty** (its own children are only exclude_elements/section_list/buttons — no components).
- **List-column config** (`relations/request_config/build.ts` `buildRequestConfigForElement`, list/tm/list_thesaurus): the section's own `section_list` child swaps in its properties (Site-B, non-virtual by design). But a virtual section with **NO own `section_list`** — a hierarchy/thesaurus-instance section with ZERO ontology children (`es1` "Spain" → `hierarchy20` → `section_list` `hierarchy37` → 11 columns) — needs the PHP `resolve_ar_related_list_section` virtual fallback: own-tipo lookup misses → resolve the real tipo (`getSectionRealTipo`) → retry there → the resolved child flows through the same explicit/implicit builder (no `exclude_elements` subtraction — list inheritance is verbatim, unlike the edit walk). **Without it the list view emits an empty ddo_map — only the built-in `Id` column renders.** Landed 2026-07-17 (SECTION_SPEC §7.1 addendum); gate `test/unit/virtual_section_list_columns.test.ts`. This is the section_list analog of the §9 buttons virtual-fallback bug.
- **Any child-by-model lookup** must be virtual-aware: use `section/list_definitions/node_find.ts` `findSectionChildByModel` (falls back through `relations[0].tipo`). `getSectionMap`, `sectionRelationListTipo`, the list-definition resolvers all do this. A plain `WHERE parent = sectionTipo` query returns nothing for a virtual section (e.g. rsc167's relation_list rsc17 hangs under rsc2, not rsc167).

---

## 4. section_list: the list-mode css swap, the component css STRIP, and the two PHP resolution sites

PHP resolves an element's list-mode properties at THREE INDEPENDENT sites — emission, request_config feed, and view — and TS `buildCore` (structure_context.ts) mirrors all three since 2026-07-10 (SECTION_SPEC §7.1 addendum):

- **Site A — the EMITTED `properties`/`css`** (PHP `build_structure_context_core` class.common.php:1801-1846 → TS `resolveEmittedPropertiesAndCss`, pure + unit-gated): `(section|component_portal) && mode==='list'` swaps to the `section_list` child's properties (plain-parent lookup, FIRST by `order_number`, NO own-config skip) — this gives the list view the section_list's column css (numisdata122's `.column_numisdata77`) instead of the section's edit-form `.list_body` grid; **skipping it causes the diagonal column cascade**. **Every OTHER element in list mode emits `css: null`** (`remove_edit_css`) — component css add-ons are EDIT-oriented (grid-row/grid-column wrapper placement) and must never leak into list rows. tm/list_thesaurus emit the element's OWN properties/css (the swap is list-only at this site). `properties.css` is ALWAYS unset from the emitted properties (css travels only top-level). Then the **section-node override**: `section.properties.css->{tipo}` REPLACES a component's css in ANY mode, even over a stripped null. TS-only WC-016 extension: reserved `css.list`/`css.search` mode keys on any winning css object (bare objects stay byte-identical to PHP; `css.list` opts a component into list css despite the strip).
- **Site B — the request_config feed** (PHP trait `resolve_source_properties` trait.request_config_utils.php:264-309 → TS `resolveSourceProperties`, cached on the core as the INTERNAL `configSourceProperties` field, destructured out at stamp — never on the wire): swaps for **list / tm / list_thesaurus**, skipped when the section declares its own `source.request_config`. Feeds ONLY `buildRequestConfigForElement`/`getElementColumnsMap` at stamp time.
- **View** (PHP `get_view` class.common.php:4464-4506 → TS internal `structuralView`): ddo_map-injected view wins per-call; else in list mode ANY `component_*`/section prefers its section_list child's `properties.view`; else the element's **OWN** `properties.view` — NEVER the Site-A swapped object's (16 live mosaic portals, e.g. tch66/oh17, keep `view:'mosaic'` on the portal node while their child has none — reading the swapped properties melts them to the default renderer); else the model default.

The sites disagree on purpose — e.g. a tm-mode section emits its OWN css while its request_config still comes from the section_list child. `buildRequestConfigForElement` (relations/request_config/build.ts) additionally re-finds the child internally for list mode. Gates: `component_list_css_strip_differential` (component strip + portal swap/strip + tm), `section_list_css_differential` (section swap), `css` compared in `context_differential`, `test/unit/structure_context_css.test.ts` (full decision table + WC-016).

---

## 5. Other section-family facts

- **Per-button ACL** (`buttons.ts`): gate each button by `getPermissions(sectionTipo, buttonTipo) >= 2` when a principal is threaded (PHP get_buttons_context :4206) — not the caller-level cap.
- **section_map** is stamped onto the section entry (PHP :2075) = the section_map child node's `properties`.
- **Groupers already work** via the implicit edit config + the context loop — the read.ts "groupers contribute context only" skip is correct (groupers have no DATA); only their `type` needed fixing.
- **Read-path unlock hook**: `forceUnlockAllComponents(userId)` fires on the section list read (PHP dd_core_api:2321).
- **`prevent_lock`** is accepted on the wire but INERT (PHP session_write_close has no Bun equivalent; NOT the component locks).
- **List-definitions**: `indexation_list` (config only — this install's tag data is orphaned), `time_machine_list` (inspector-TM access gate, no editor), `section_list_thesaurus` (element-list resolver; the ts_object tree consumer is a separate subsystem).

---

## 6. Debugging the running client (Chrome MCP)

> General TS-vs-PHP parity workflow (probe scripts, differential gates, scratch-twin write hygiene, Chrome MCP driving) is in the **`dedalo-parity-debugging`** skill. This section is the section-family-specific overlay, especially the stale-server gotcha and the cascading-crash console workflow.

The reverse-proxy dev listener runs on `SERVER_TCP_PORT` (e.g. 3500): `http://localhost:3500/dedalo/core/page/`.

1. **THE #1 GOTCHA — the server is often stale.** If it was started as a detached `bun run src/server.ts` (PPID 1, launchd — check `ps -o ppid= -p <pid>`), it is **NOT** under `--watch` and will not pick up code changes. Verify with a fetch (`type` still `'section_group'`? → stale) and **restart**: `pkill -f "bun run src/server.ts"; SERVER_TCP_PORT=3500 nohup bun run src/server.ts > /tmp/dedalo_ts_server.log 2>&1 &`. Run under `bun run dev` (which is `--watch`) to auto-reload. Always restart + hard-reload (`ignoreCache:true`) before concluding a fix didn't work.
2. **Attach**: `mcp__chrome-devtools__list_pages` (fails with "browser already running" if the user's Chrome holds the profile — ask them to free it or use `--isolated`).
3. **Login**: creds are `PHP_API_USERNAME`/`PHP_API_PASSWORD` in `../private/.env` (e.g. root). Often a session already persists.
4. **Replay a read** (the fastest server-vs-DOM check) — the CSRF token is `window.page_globals.csrf_token`:
   ```js
   const csrf = window.page_globals.csrf_token;
   const rqo = { dd_api:'dd_core_api', action:'read', source:{model:'section',tipo:'rsc170',section_tipo:'rsc170',mode:'edit',lang:'lg-spa',action:'search'}, sqo:{section_tipo:['rsc170'],limit:1,offset:0} };
   const j = await (await fetch('/dedalo/core/api/v1/json/',{method:'POST',headers:{'Content-Type':'application/json','x-dedalo-csrf-token':csrf},body:JSON.stringify(rqo)})).json();
   ```
5. **Console first** for blank views: `list_console_messages {types:["error"]}`. To get stacks, reload with an `initScript` that pushes `e.error.stack` into a `window.__errs` array (the message list omits stacks).
6. **Edit flow**: the client edit read sends **no `show`** (`add_show=false` for edit, section.js `generate_rqo`), so the server derives the ddo_map. Direct `?tipo=X&mode=edit` works for a first record; or click `.button_edit` in the list. `get_ar_instances_edit` (section_record.js:414) filters `datum.context` by `section_tipo===self.section_tipo && parent===self.tipo && (type==='component'||'grouper') && mode===mode`.

---

## 7. Gates (all differential vs live PHP unless noted)

`grouper_context_differential` (compares `type`!), `section_context_extras_differential` (section_map/matrix_table/relation_list_tipo, 7-section §12 sweep), `section_list_css_differential` (the swap), `virtual_section_edit_differential` (rsc170 → 84 ddos), `virtual_section_list_columns` (unit — es1 inherits hierarchy20's list columns), `component_edit_context_differential` (media features + target_sections), `section_buttons_acl` (white-box user 16), `list_definitions` (the 3 list-defs). Keep the full suite green (`bun test`); the baseline has flaky full-suite timeouts in `server_state`/`agent_loop` that pass in isolation.

**Lesson to encode in every new gate:** compare the fields the CLIENT reads, not just the ddo_map/data. A field-subset differential passing ≠ the client working.
