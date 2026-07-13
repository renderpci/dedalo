# Rebuild the Dédalo relation-component family in native TypeScript

Standing spec for the relation family, companion to `engineering/REWRITE_SPEC.md` (whose constraints — §2 absolute constraints, §2b code style, §7 security — apply here unchanged). PHP reference tree: `v7/master_dedalo` (read-only). All `file:line` anchors below point into that tree and have been verified against it.

---

## 1. Mission & status

> **ADDENDUM 2026-07-07 (S2-46 — read this before the rest of §1).** The
> rebuild this section instructs **already landed**: phases A–E completed
> 2026-07-03 (see `rewrite/STATUS.md` "Relations rebuild"); only Phase F (corpus
> parity sweep + ledger closure) remains. The files §1 names as the
> to-be-superseded state are **deleted**: `src/core/resolve/read_rows.ts` →
> `src/core/section/read.ts` (shared emitDdoData; relations re-enter via
> callback), `src/core/resolve/request_config_v6.ts` →
> `src/core/relations/request_config/` (build/implicit/explicit), and
> `src/core/resolve/save_component.ts` →
> `src/core/section/record/save_component.ts` + `src/core/relations/save.ts`.
> The live subsystem is `src/core/relations/` (registry.ts dispatch,
> relation_core.ts shared engine, models/, request_config/, dataframe.ts,
> parent.ts, children.ts, related.ts, datalist.ts, filter_projects.ts,
> save.ts) — do NOT plan a rebuild from the paragraphs below; they are kept
> as the design rationale and PHP-anchor record. The PHP `file:line` anchors
> throughout remain valid oracle references.

**Relation components are the first-class, critical part of Dédalo.** Sections connect to sections *only* through locators stored by relation components; the thesaurus tree, portals, indexation, access control (projects filter), and the dataframe system are all expressions of the same relation machinery. A rewrite that gets relations wrong gets Dédalo wrong.

The current TS implementation of relations is judged **not done correctly** and is hereby superseded as a foundation. It is concentrated in `src/core/resolve/read_rows.ts` (~1,600 lines, the portal/subdatum/dataframe renderer), `src/core/resolve/request_config_v6.ts`, `src/core/search/search_related.ts`, and `src/core/resolve/save_component.ts`, with good value objects in `src/core/concepts/locator.ts` and `src/core/concepts/ddo.ts`. **Audit it, salvage what is proven (the differential parity tests and the locator/ddo value objects are assets), then rebuild the relation family on the coherent model below — do not patch around the existing shape.** Known defects and ledgered gaps in the current code, which the rebuild must resolve rather than inherit:

- `src/core/concepts/subdatum.ts` and `src/core/concepts/request_config.ts` are contract-only stubs marked `TODO`, while the real logic lives elsewhere — the concept layer lies about where the semantics are. The rebuild must make the concept modules the real home of the contracts.
- Relation resolution is a single monolithic dispatcher (`read_rows.ts`) instead of a shared relation core + per-model particularities (§2). This is the structural defect: every new model grows the monolith.
- Deferred and still missing: `filter_by_list`/`fixed_filter` expansion, external `api_config` resolution, per-ddo permission gating, `fields_map`, dataframe **saves**, `relation_search` ancestor-index SQO wrapping for hierarchical autocomplete, the `_tm` (time machine) search twin, `filter_by_locators_op: 'AND'`, multi-ddo datalist labels.
- `component_indexation`-style tag indexation has no dedicated resolution path.

Never silently narrow: keep a coverage ledger of what the rebuild does not yet cover, exactly as the master spec demands.

## 2. The unifying model — one concept, many particularities

A **section** is an ontology definition of a group of components; every record of it is addressed by a unique pair (`section_tipo`, `section_id`). Sections connect to other sections **only** through relation components, and the connection value is always a **locator** (§3).

Every relation component, whatever its model, does the same thing:

> Declare, in the ontology, the **target section(s)** and **what information of the target section it needs** (a `request_config`, §4) — then resolve data from the target(s) and represent part of it inside the main section.

All relation components must work the same way through a **shared relation core**, with per-model *particularities* layered on top (§6):

- some need the **full list of records of the target section** as selectable options (select, radio_button, check_box → datalist, §5.1);
- some **calculate** their data instead of storing it — "who calls me?" via inverse relations (relation_index / indexation, children);
- some obtain data through a **mix of conditions or an external API** (external);
- some resolve **indirectly/transitively** (relation_related: if a=b and b=c then c=a);
- **dataframe** points at target section(s) like any relation, but its locators pair to *individual data items* of a main component via `id_key` (§6.2).

PHP shared core: `core/component_relation_common/class.component_relation_common.php:61` (abstract base of the family). Key methods: `add_locator_to_data` `:1223` (append with dedup, `type` mandatory), `remove_locator_from_data` `:1306` (default match on `['section_tipo','section_id','from_component_tipo','type']`), `validate_data_element` `:1058`, `get_locator_value` `:1412`, `get_filter_list_data` `:2375` (datalist attach at `:2404`), `sort_data_by_column` `:3310`, `add_new_element` `:3770`.

**Model inventory** (base class in parentheses; all under `v7/master_dedalo/core/`):

| Model | Base | Role |
|---|---|---|
| component_portal | relation_common | Editable, sortable, paginated locator list to target-section records |
| component_select | relation_common | Single choice from full target-section datalist |
| component_radio_button | relation_common | Single choice, radio semantics (new selection replaces prior) |
| component_check_box | relation_common | Multi choice from closed vocabulary |
| component_select_lang | relation_common | Select bound to the languages thesaurus |
| component_relation_parent | relation_common | Upward hierarchy link (stores parent locators) |
| component_relation_children | relation_common | **No own data** — computes children from who points at me via component_relation_parent (§6.3) |
| component_relation_related | relation_common | Associative links with directionality + transitive closure (§6.6) |
| component_relation_index | relation_common | Indexation / inverse relations, "who calls me?" (§6.4) |
| component_relation_model | relation_common | Model/template link (dd98) to a catalogue section |
| component_filter | relation_common | Projects filter — locators to project records, drives record visibility |
| component_filter_master | component_filter | User-section variant defining a user's project permissions |
| component_dataframe | component_portal | Frame records paired to main-data items via `id_key` (§6.2) |
| component_external | component_common | Read-only proxy to a third-party API (§6.5) |
| component_inverse | component_common | Generic read-only backlink viewer (same primitive as relation_index) |
| component_filter_records / component_security_access | component_common | Row-level ACL / ontology-permission editors — relation-shaped data, not relation_common |

**Legacy model aliases (load-bearing):** the ontology still names `component_autocomplete` and `component_autocomplete_hi` as models; v7 PHP maps both to **component_portal** via `common::$ar_temp_map_models` (`core/common/class.common.php:427-432`). "Autocomplete" is a client rendering/interaction mode of portal-family components, not a server model. `component_relation_struct` is in the excluded-legacy list (`:439`). The TS ontology resolver must reproduce this mapping table — several corpus rows in §7 hit it. The `component_autocomplete_hi` legacy model additionally maintains the `relation_search` ancestor-index column on save (`core/component_common/class.component_common.php:2020-2022`) so hierarchical targets can be searched by ancestry — preserve that write and the matching SQO wrap.

## 3. Locator — the universal relation pointer

Reference: `core/common/class.locator.php` (field schema in the class doc-block `:14-29`). Mandatory: `section_tipo`, `section_id`. Relational/optional: `component_tipo`, `from_component_tipo`, `type`, `type_rel`, `tag_id`/`tag_component_tipo`/`tag_type`, `lang`, `label`, `paginated_key`, and the dataframe pairing fields **`id_key`** + `main_component_tipo` (legacy `section_id_key`/`section_tipo_key` are read-only BC).

Equality/lookup semantics are the integrity foundation of all relation data — implement them as pure, exhaustively unit-tested functions:

- `compare_locators(l1, l2, ar_properties=[], ar_exclude=[])` — `class.locator.php:956`. Empty `ar_properties` = strict full-property compare; a subset = loose compare.
- `in_array_locator(l, ar, ar_properties=['section_tipo','section_id','type','component_tipo','tag_id'])` — `:1031`. Loose membership on that default 5-field predicate.
- `build_locator_lookup_key(l, properties=<same 5 fields>)` — `:1099`. Delimiter-joined compound key (`DELIMITER='_'`, `:50`).

Preserve the PHP quirks deliberately: string-vs-int `section_id` tolerance, and which fields participate in each default predicate. The existing `src/core/concepts/locator.ts` already models this correctly (passthrough schema, byte-compat) — keep it as the base and extend, don't rewrite it blind.

## 4. request_config — how a relation declares its targets (implicit vs explicit)

TS nomenclature: **explicit** ≡ PHP v6, **implicit** ≡ PHP v5 (the PHP trait/file names keep the version labels; the anchors below are verbatim oracle references).

Builder selection is **data-driven**, not per-model: `common::get_ar_request_config()` chooses the explicit builder when `properties->source->request_config` exists on the ontology node, else falls back to the implicit one (`core/common/class.common.php:3434`, branch at `:3502`).

- **IMPLICIT (legacy — deprecated but must work).** No explicit config; targets and child ddo tipos are derived by walking the ontology relation graph. When a relation is simple, the implicit walk is enough, and real installations still carry legacy `source` objects (see corpus row numisdata55). Entry: `trait.request_config_v5.php:78` `build_request_config_v5`, resolvers `:186-:441`, legacy ddo_map builder `:618`. `component_relation_parent`/`component_relation_children` are **not** supported implicitly — they require explicit config.
- **EXPLICIT (modern — the default builder).** `properties->source->request_config` is an array of config items, each carrying an **SQO naming the target section(s)** plus `show`/`search`/`choose`/`hide` ddo_maps and an optional `api_engine`/`api_config`. Entry: `trait.request_config_v6.php:69` `build_request_config_v6`; item parse `:158` (api_engine `:171`, external branch → `resolve_external_config` `:628`); target resolution `resolve_sqo_section_tipo` `:245` — note targets may be **fixed sections** (`["numisdata3"]`), **dynamic** (`hierarchy_types: [1,2,8]` resolved to the active hierarchies at runtime), or **self-targeting** (SQO with only `filter_by_list`, no `section_tipo` — see corpus rows numisdata36/numisdata1006).
- Wire object: `class.request_config_object.php:207`; client ddo whitelist `sanitize_client_ddo_map` `:673` (a §7 security chokepoint — client-supplied ddo fields are capped to the display allowlist).

Some components have **no** `source`/`request_config` at all and derive their target purely from ontology `relations` (corpus rows numisdata967, numisdata71, numisdata1562) — the implicit path must cover this.

> **ADDENDUM 2026-07-10 — user PRESET override (dd1244 layout maps, LANDED).**
> Before builder selection, a **SECTION** owner applies a STAGE-2 override that
> can REPLACE its `source.request_config` with a user/admin-saved layout preset
> (PHP `common::build_request_config` → `resolve_preset_properties`,
> `class.common.php:2986/3156`; store `class.request_config_presets.php`). An
> ACTIVE record in section **dd1244** (`dd1566 → dd64/1`) matching the
> `(tipo, section_tipo, mode)` triple — the caller's OWN preset (`dd654 = user`)
> first, then any PUBLIC one (`dd640 = yes`) — supplies a `request_config` array
> (component `dd625`) that is injected onto a CLONE of the section's properties,
> so the explicit builder parses it exactly as an ontology config. This narrows
> the section's rendered layout (edit-form tree / list columns) to the preset's
> `show.ddo_map`, carrying its per-ddo `properties`/`parent_grouper`/`width`/`view`
> overrides. TS home: `relations/request_config/presets.ts` (reader + per-user
> match, active-list cached and dropped by construction on any dd1244 write) and
> the injection at the `buildRequestConfigForElement` chokepoint (`build.ts`,
> section owners only). The match is computed LIVE from the request principal —
> never cached — so two users share the active list but resolve different
> presets. Gate: `test/parity/request_config_presets_differential.test.ts` +
> `test/unit/request_config_presets.test.ts`.

## 5. The resolution pipeline

### 5.1 Datalist — list-of-values models
select / radio_button / check_box need the **full records of the target section** as options. Built and cached by `component_common::get_list_of_values()` (`core/component_common/class.component_common.php:2740`, caches `:262-286`), attached as `->datalist` by `component_relation_common::get_filter_list_data()` (`:2404`). Edit payload shape (confirmed in `class.component_select.php:37`): `data: [{ value: <locator[]>, datalist: <option[]> }]`. Respect `fixed_filter`/`filter_by_list` when building the option set.

### 5.2 Subdatum — the recursive glue
`subdatum` expands a component's stored locators into resolved child structures + data through the ddo_map: output `{context, data}` (deduplicated child contexts + resolved rows). Base: `common::get_subdatum(?from_parent, ar_locators)` — `core/common/class.common.php:2254`, assembly `:2834-2836`. Dataframe variant `dataframe_common::build_dataframe_subdatum(value, mode)` — `trait.dataframe_common.php:395` — returns `{context, data, counter}`; gated on `properties->has_dataframe === true` and `mode !== 'search'`; when empty it fabricates a dummy locator at `counter+1` so the client still receives context for a blank frame row. `counter` is the main component's item-id allocator that mints new `id`/`id_key` values — it is part of the contract.

### 5.3 ddo_map depth
A ddo_map is a flat list made a tree by each ddo's `parent` (=`tipo` of the ddo it hangs under; `"self"` = the calling component). Relations to related sections carry further ddos resolved *in the target section*, to arbitrary depth, declaratively (`class.common.php:2295` get_children_recursive, `:2454` parent filter). Multi-hop chains (sort/search by a value two sections away) are normal, not edge cases.

## 6. The particular cases — same concept, specific twist

### 6.1 List-of-values (select, radio_button, check_box, select_lang) + portal/autocomplete
Datalist (§5.1) + single/multi selection semantics. Portal adds pagination (total = full locator count), drag-reorder (`sort_data`), `sort_by_column`, `add_new_element` (creates a target record inheriting the caller's projects filter, then appends the link), and nested-portal recursion. Autocomplete is portal/select with a search-driven choose flow (`choose` ddo_map + `search` SQO); the `_hi` (hierarchical) flavor targets thesaurus hierarchies and needs the `relation_search` ancestor index (§2).

### 6.2 Dataframe — relation data paired to main-data items
A dataframe works like any relation — it points to target section(s) and stores locators — but each frame locator is **connected to one data item of the main component** via `id_key → id`, where the locator's `id_key` equals the `id` of the item in the main component's data. The main component can be **any** component — relation or literal (text, date, iri, …). Dataframes are an *extension of the main data*: they qualify a specific item (uncertainty, context, references, qualifiers) without polluting it.

Contract (never pair by array index):
- Match predicate: `(type, from_component_tipo, main_component_tipo, id_key)` — `trait.dataframe_common.php:82` `dataframe_entry_matches` (id_key compare `:101-103`); `component_dataframe::$test_equal_properties = ['type','section_id','section_tipo','from_component_tipo','id_key','main_component_tipo']` (`class.component_dataframe.php:82`).
- `component_dataframe extends component_portal` (`class.component_dataframe.php:61`) — it *is* a portal, plus pairing.
- Inline id_key value API (also used by relation sibling order, §6.3): `get_data_by_id_key` `:833`, `add_value_by_id_key` `:864` (sets item `id = id_key`), `remove_by_id_key` `:882` in `trait.dataframe_common.php`.
- Save path stamps the caller's `id_key` onto incoming frames (`trait.dataframe_common.php:205-213`). **Dataframe saves are a known gap in the current TS code — mandatory in the rebuild.**
- Legacy `section_id_key`/`section_tipo_key` are accepted on import only (`import_dataframe_data` `:544`, alias strip `:577`).

### 6.3 Children/parent — nested sections, hierarchy
Some sections are nested; the hierarchy chain is stored only upward. `component_relation_parent` stores the parent locators. `component_relation_children` **has no data of its own**: its save pipeline is a no-op (doc `class.component_relation_children.php:80-83`); writes go to each child's component_relation_parent; reads compute "who declares me as parent" — `get_data` `:113` → `get_children` `:132`, paginated `:167`. **Sibling order** is itself an `id_key` dataframe: an order `component_number` (named by `section_map->thesaurus->order`) attached to the child's parent-link locator — `sort_children` `:1033`, order component resolution `:1077`. The thesaurus tree (`core/ts_object/`) is a consumer of exactly this machinery.

### 6.4 Indexation — inverse relations, "who calls me?"
`component_relation_index` stores nothing meaningful forward; it **calculates** its data by resolving inverse locators (backlinks) — every locator anywhere whose target is this record. Engine: `core/search/class.search_related.php:79`, which dispatches to four PostgreSQL flat-GIN stored functions (`data_relations_flat_st_si`, `_fct_st_si`, `_ty_st_si`, `_ty_st`; doc `:19-42`, DDL in `core/db/db_pg_definitions.php`); public entry `get_referenced_locators(filter_locators, limit, offset, count, target_section)` `:489` (SQO `mode='related'` + breakdown: one row per inverse locator, enriched with `from_section_tipo`/`from_section_id`). Model side: `class.component_relation_index.php` — `get_data` `:160` (cached `:797`), `get_data_paginated` `:205`, `count_data`/`count_data_group_by` `:298`/`:351`, `remove_locator` `:681`; default relation type dd96. Tag indexation (locators carrying `tag_id`/`tag_component_tipo` pointing into transcription text) rides the same inverse machinery and needs a real resolution path in TS.

### 6.5 External — mixed conditions / third-party sources
`component_external` (`class.component_external.php:54`, extends component_common) is a read-only proxy: `load_data_from_remote` `:110` reads `section_properties->api_config` (`api_url`, `response_map`, `entity` at `:166-169`); `set_data` refuses local writes `:449`. On the request_config side, an explicit-config item whose `api_engine !== 'dedalo'` routes through `resolve_external_config` (`trait.request_config_v6.php:210`/`:628`). More broadly, "external mode" components (e.g. hierarchy40 in the corpus, `source: {mode: "external"}`) obtain their data from a combination of other components/conditions resolved at runtime — the shared core must allow a model to supply its own data-acquisition strategy while keeping the same context/data/subdatum output contract.

### 6.6 relation_related — indirect resolution
Associative links with directionality (`type_rel`: uni/bi/multidirectional). For multidirectional relations the resolution is **transitive**: if a=b and b=c then c=a. `get_references_recursive` — `class.component_relation_related.php:274` (doc `:250-273`) computes the closure with a resolved-cache guarding against cycles; `get_data_with_references` `:114`, `get_calculated_references` `:152`, `get_type_rel` `:231`.

## 7. Verified real-world corpus (mandatory fixtures)

Every row below was resolved against the live ontology (`dd_ontology`, database `dedalo_mib_v7`) and is a **required differential-parity fixture** for the rebuild. Legacy model names appear as stored in the ontology; remember the §2 alias map.

Sections: numisdata3 = Type, numisdata4 = Numismatic object, numisdata6 = Mint, rsc167 = Audiovisual, rsc197 = People, cult1/tema1 = thesaurus sections (Cultura/Tema).

| Main → component | Model (ontology) | Label | request_config |
|---|---|---|---|
| numisdata4 → numisdata161 | component_autocomplete | Type | explicit; targets `["numisdata3"]`, `filter_by_list` numisdata3/numisdata309, show+search ddo_map, `$or` |
| numisdata4 → numisdata55 | component_relation_related | Equivalents | **legacy `source` object** (mode autocomplete, type_map numisdata147/151/159, hierarchy_sections) — the live implicit exercise |
| numisdata6 → numisdata20 | component_autocomplete_hi | Indexation | explicit; **dynamic targets** `hierarchy_types [1,2,8]`, show hierarchy25 with `value_with_parents` |
| numisdata6 → numisdata163 | component_portal | Bibliography | explicit; targets `["rsc332"]`; ddo_map + **dataframes numisdata1529/1530** |
| numisdata3 → numisdata77 | component_portal | Coins | explicit; targets `["numisdata4"]`, mosaic views |
| rsc167 → rsc860 | component_autocomplete_hi | Indexation | explicit; `hierarchy_types [1,2,4,5,6,8,11,12]`, show via section_map `get_ddo_map` |
| rsc197 → rsc1435 | component_portal | Family unit | explicit; targets `["rsc424"]`; father/children/other sub-portals |
| cult1/tema1 → hierarchy40 | component_relation_index | Indexations | `source: {mode: "external"}` — inverse/runtime resolution, no request_config |
| any thesaurus → hierarchy93 | component_autocomplete | Library | explicit; targets `["rsc205"]` |
| numisdata3 → numisdata34 | component_autocomplete | Denomination | explicit; targets `["object1"]` (NOT numisdata33, which is DEPRECATED) + dataframe numisdata1449 |
| numisdata3 → numisdata967 | component_radio_button | Status | **no source** — datalist from ontology relations → dd501; data_default section_id 1 |
| numisdata3 → numisdata71 | component_autocomplete | Reverse legend | **no source** — ontology relations → numisdata41/43/195 |
| numisdata3 → numisdata75 | component_portal | Bibliography | explicit; targets `["rsc332"]` + dataframes numisdata1531/1532 |
| numisdata3 → numisdata36 | component_relation_related | Equivalent terms | explicit; SQO with **no section_tipo** (self-targeting) + filter_by_list |
| numisdata3 → numisdata1006 | component_relation_related | Related types | explicit; same self-targeting shape as numisdata36 |
| numisdata3 → numisdata1562 | component_select | Category | **no source** — datalist from ontology relations → numisdata1554 |
| numisdata3 → numisdata159 | component_autocomplete_hi | Collection | explicit; **multi-section targets** `["rsc197","rsc106"]` + dataframe numisdata885 |
| numisdata3 → numisdata249 | component_portal | Authority | explicit; targets `["numisdata1374"]`, deep ddo_map reaching rsc1152/rsc106/rsc197 + dataframe numisdata813 |

Anchored records (all verified present in table `matrix` of `dedalo_mib_v7`):
- **numisdata3 §15657** (matrix id 453888) — has data for **both main components and their dataframes**; the canonical dataframe fixture.
- **numisdata3 §7** (matrix id 438258) — fixture for numisdata75 (portal + dataframe).
- **numisdata3 §14073** (matrix id 452309) — fixture for numisdata249 (deep portal + dataframe).

## 8. Gates (definition of done for the relation family)

1. **Corpus parity.** For every §7 row: resolved `context`, `data`, `subdatum`, datalist (where applicable), and search results diff clean against the live PHP server, in list and edit modes. Reuse/extend the existing `test/parity/` differential harness — the surviving tests (portal subdatum, drag replay, relation_list, iri/has_dataframe, multihop) remain green throughout.
2. **Dataframe round-trip on §15657.** Read → mutate a frame → save via TS → read via PHP (and the reverse): `id_key` pairing intact, `data::text` byte-compatible, counter semantics preserved.
3. **Both config strategies exercised.** explicit rows plus the implicit/no-source rows (numisdata55, numisdata967, numisdata71, numisdata1562) — deprecated is not optional.
4. **Inverse parity.** hierarchy40 indexations and a delete-with-inverse-references case match PHP, including counts and `count_data_group_by`.
5. **Locator law.** `compare_locators`/`in_array_locator`/`build_locator_lookup_key` as pure functions with exhaustive unit tests, including string/int `section_id` and the default-predicate field sets.
6. **Gap ledger closed or logged.** Every §1 defect either implemented (with a gate) or explicitly recorded as uncovered — never silently narrowed.
7. **Security unchanged.** `sanitize_client_ddo_map` whitelist, SQO sanitization, per-target ACL before search, projects-filter inheritance in `add_new_element` — all §7 chokepoints of the master spec hold for every relation path.
