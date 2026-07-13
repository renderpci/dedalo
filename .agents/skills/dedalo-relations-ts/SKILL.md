---
name: dedalo-relations-ts
description: The Dédalo v7 TypeScript/Bun rewrite of the RELATION component family — the strangler-fig subsystem in src/core/relations/ (registry dispatch, relation_core shared engine, per-model resolvers, implicit/explicit request_config builders, dataframe id_key pairing, inverse/children/related/index engines, save hooks). Use when editing src/core/relations/**, src/core/section/read.ts relation emission (the shared emitDdoData — read_rows.ts is DELETED), src/core/search/conform.ts relation dispatch, or debugging why a portal/autocomplete/dataframe/children/index/related component resolves wrong vs the PHP oracle. Authoritative spec: engineering/RELATIONS_SPEC.md (§1 addendum: phases A-E LANDED); ledger: rewrite/STATUS.md "Relations rebuild".
---

# Dédalo v7 relations (TypeScript rewrite)

The relation family is being rewritten from the PHP monolith (`v7_php_frozen/master_dedalo`, read-only oracle) into `src/core/relations/`. PHP is the oracle: every behavior is verified differentially against the live PHP server (`dedalo-parity-debugging` skill). Never silently narrow scope — throw loudly + ledger the gap in `rewrite/STATUS.md`.

**One law:** sections (`section_tipo` + `section_id`) connect ONLY via locators. Every relation component declares target section(s) + a `request_config`, resolves data from the target(s), and represents part of it inside the host section. All models share ONE engine; each adds a small particularity.

## Architecture — strangler-fig into `src/core/relations/`

The old `src/core/resolve/read_rows.ts` monolith is **DELETED** (strangler-fig complete): its exports live in `src/core/section/read.ts` (`readSection`, `readComponentData`, `resolveSearchData`, `readSectionRows` — the shared `emitDdoData` lives here) and the save path in `src/core/section/record/save_component.ts` + `src/core/relations/save.ts`. Layering (no cycles): `relations/` imports `concepts/`, `ontology/`, `db/`, `search/search_related.ts`, `search/builders/*`; `section/read.ts` / `section/record/save_component.ts` / `search/conform.ts` import `relations/registry.ts`. Child recursion goes through the `emitDdo` CALLBACK handed into resolvers — so `relations/` never imports `section/read.ts`.

```
src/core/relations/
  registry.ts            # RelationModelResolver Map (EXPLICIT, no reflection) + search face
  relation_core.ts       # shared engine: expandPortal, emitDataframeItem, nested recursion, re-stamp
  children.ts parent.ts related.ts   # inverse-question engines (who declares me?)
  dataframe.ts datalist.ts save.ts
  models/{portal,select_family,relation_children,relation_index,relation_related}.ts
  request_config/{build,implicit,explicit,external,filters}.ts
```

### Registry dispatch (`registry.ts`)
- `getRelationResolver(model)` maps each CANONICAL model (post `ontology/resolver.ts` `MODEL_REPLACEMENT_MAP`: `component_autocomplete(_hi)` → `component_portal`) to a resolver. Unregistered model THROWS (`uncovered scope`) — never silently portal-shaped.
- Registrations: portal/relation_parent/external/dataframe → `portalResolver`; filter/filter_master → `filterResolver` (portal WITHOUT own-config child expansion); relation_children → `relationChildrenResolver`; select/select_lang/radio_button/check_box/publication/relation_model → `selectFamilyResolver`; relation_index → `relationIndexResolver`; relation_related → `relationRelatedResolver`.
- SEARCH face `getRelationSearchFragmentBuilder(model)`: shared containment builder for the family; `relation_children` (inverse-parent SQL pipeline), `relation_index` (computed-inverse trait), `external` (unsearchable) THROW their ledger reason. The autocomplete_hi ancestor `$or` wrap is deliberately NOT wired (PHP live defect).

### Shared engine (`relation_core.ts`)
`expandPortal(record, portalDdo, model, childDdos, mode, lang, row, callerTipo, data, emitDdo, options)`:
- EMPTY relation → emits NO item (PHP portal_json guards the push on non-empty `data_value`). **Exception:** `relation_children` emits its empty own item — see below.
- Paginate locators (`total = FULL locator count`), stamp `paginated_key = index + offset`.
- EDIT limit chain: `ddo.limit ?? ownEditLimit() ?? 10` where `ownEditLimit` = LAST config item's `sqo.limit ?? show.sqo_config.limit`. LIST/TM: `ddo.limit ?? cellLimit ?? (autocomplete_hi ? locators.length : 1)`.
- Expand each paged locator's target record through child ddos via `emitDdo`, then OUTER re-stamp (PHP `class.common.php:2792-2799`): rewrite `from_component_tipo`/`parent_tipo`/`row_section_id` outward, but `nestedStampedItems` (WeakSet) protects a nested expansion's own identity.
- `emitDataframeItem`: id_key→id pairing (type dd490) via the pure predicate `dataframeEntryMatches(entry, mainComponentTipo, pairId)` in `concepts/subdatum.ts`; frame item ALWAYS emits (even `entries: []`); stamps `id_key` (INT), `main_component_tipo`, `from_component_tipo`.

## PHP semantics resolvers MUST honor (each backed by a real client bug)

1. **`section_tipo: 'self'` resolves to the SQO TARGET sections, not the caller** (`resolve_ddo_self_references :250-255`). Caller scalar only for dataframes; `undefined` stays untouched. Getting this wrong made every self-declaring child skip the per-locator grouping → autocomplete cells emitted no subdatum. (`request_config/explicit.ts processSingleDdo`.)
2. **`get_subdatum` flattens SHOW + HIDE ddo_map** into one deduped set. Hide-block ddos are server-resolved data the client widgets consume without rendering as columns (e.g. `numisdata585`'s `hierarchy31` geolocation feeds the map observer). Own-config expansion must concat `show.ddo_map` + `hide.ddo_map`. (`models/portal.ts` edit path.)
3. **Multi-target ddos carry the FULL section_tipo ARRAY.** A `hierarchy_types` portal's `self` child resolves to EVERY target (`numisdata20`'s `hierarchy25` spans 26 hierarchy sections). Flattening to `[0]` makes the per-locator grouping skip all but the first target. Keep the declared array intact; per-locator grouping picks the compatible target.
4. **`sqo.section_tipo` entries are ENRICHED ddo objects**, not plain tipos: `{typo:'ddo',tipo,model,permissions,label,buttons,color,matrix_table}` (`build_sqo_section_tipo_ddo`; color default `#b9b9b9`). This is the CLIENT contract — portal link/new buttons read `target_section[0].tipo`. Both implicit and explicit builders emit them; engine consumers project via `extractSqoSectionTipos`.
5. **`component_relation_children` emits its OWN item even when EMPTY** in every non-search mode: `entries: [], pagination: {total:0, limit:10, offset:0}, lang:'lg-nolan'`, plus parent/row stamps. The generic portal path skips empty relations, so the resolver special-cases `computed.length === 0`. (`models/relation_children.ts`; mirrors the dz1 §503 get_data empty pin.)
6. **`get_data` serves ANY component, not just relations.** The autocomplete_hi edit-in-place widget refreshes the chosen term's `component_input_text` value via `get_data`. `readComponentData` routes non-relation models through the generic `emitDdoData` path instead of throwing. (`section/read.ts`.)
7. **Section reads must include subdatum CHILD contexts** — one context entry per unique emitted child item (`parent = from_component_tipo`, view from the generating config). Without them the client's portal rows have no component structure to render. (`readSection` `appendDerivedItemContexts`.)
8. **`component_filter` needs `context.target_sections`** = `[{tipo:'dd153', label}]` (`component_filter_json :117-123`); missing it TypeErrors and kills the whole render. Filter cells also do NOT run subdatum over the project targets (`filterResolver` sets `allowOwnConfigChildren: false`).

## request_config builders

- `build.ts` = the explicit/implicit data-driven branch (single entry `buildRequestConfigForElement`; PHP oracle: explicit ≡ v6, implicit ≡ v5). Explicit = `properties.source.request_config`; implicit = ontology graph walk (no-source components: `numisdata967/71/1562`; legacy source objects: `numisdata55`).
- `explicit.ts`: `processSingleDdo` (the self→targets rule #1), `resolveGetDdoMap`, `parseBlock`, dynamic `hierarchy_types` + multi-section targets, self-targeting SQOs (`numisdata36/1006` — no section_tipo, filter_by_list only → resolve to caller), `filter_by_list`/`fixed_filter` expansion (disables cache), external `api_config` attach.
- `implicit.ts`: graph-walk targets; parent/children throw (EXPLICIT_CONFIG_REQUIRED_MODELS); `getMainRelatedSectionTipo`.
- `filters.ts`: `filter_by_list` datalist expansion (per filter: `context.target_sections`, strnatcmp-sorted options).
- `external.ts`: zenon-style `api_config` resolution; the HTTP remote-fetch proxy refuses writes (unused by the corpus install).

## Inverse-question engines (data-driven components own NO stored rows)

- `children.ts`: `getChildren/countChildren/getChildrenRecursive` — inverse dd47 ("who declares me as parent?"), STRING section_ids, sibling-ordered via `resolveParentLinkIdKey` + `getInlineValueByIdKey`.
- `related.ts`: transitive closure (dd620/dd467/dd621) with cycle cache.
- `relation_index.ts` (`models/`): computed inverse dd96 ("who calls me", tag_id anchors); `mode:external` inverse (hierarchy40). Preserves pinned PHP quirks.
- `datalist.ts`: select-family option lists — a FAITHFUL C `natsort` port (whitespace-skipping strnatcmp; "Petit-Aledón" before "Petit 1981"), multi-ddo `' | '` labels.

## Dataframe (id_key pairing, type dd490)

`concepts/subdatum.ts` holds the pure predicate `dataframeEntryMatches(type, from_component_tipo, main_component_tipo, id_key)`. `dataframe.ts` consolidates emit + literal pairing onto it. Saves: stamp caller `id_key` (add sets `id = id_key`), dedup on `test_equal_properties`, legacy keys read-only, `build_dataframe_subdatum` counter contract + blank-slot dummy locator at counter+1. **Round-trip is gated via SCRATCH TWINS** (`dataframe_roundtrip_differential.test.ts`) — never mutate the real §15657 record. `absorbComponentItemIds` raises the `meta` counter to max ids (PHP counters live in the `meta` column).

## Client RQO contract (schemas are the sanitization gate)

- `concepts/ddo.ts ddoSchema` is BOTH the client whitelist (`.strip()` drops unknown keys = PHP `sanitize_client_ddo_map`) AND the wire schema. `section_tipo` is `string | string[]` (the client echoes back the multi-target arrays our contexts ship — a plain-string schema 400s the portal search RQO). Do NOT add server-only fields.
- `concepts/rqo.ts` block schemas (`show`/`search`/`choose`) mirror `ddoSchema`.

## Gotchas

- **`section_id` type is FLOW-specific and load-bearing.** Locators keep the RAW string form (`get_subdatum` passes it as-is; the dd560 frame `section_id "17976"` is the pinned case). Children use STRING section_ids. Datalist `section_id` is a STRING (pg driver raw). Do not coerce blindly.
- **`parent_section_id` on children differs by flow**: `resolve_data` chips stamp entry-carrying children; `get_data` stamps portal items only. Both are pinned by different gates — don't unify.
- **Locator lookup key**: 5-field default predicate joined with `_` (PHP `class.locator.php`), NOT a 2-field or control-char join. Unit-gated in `locator_law.test.ts`.
- **Empty portal still emits pagination `{total:0}`** for children; a real (non-children) empty relation emits nothing.
- **`ownConfig` flag** in `expandPortal` gates BOTH nested-own-config recursion (list/tm) AND ddinfo breadcrumb emission (autocomplete_hi) — must be `true` in edit when children came from own config, else the breadcrumb vanishes.

## Pinned PHP LIVE DEFECTS (do not replicate; TS diverges, gate asymmetrically)

- `add_relation_search` wrap is defective (autocomplete_hi ancestor `$or` NOT wired).
- TM service read IGNORES `sqo.filter` — TS refuses loudly; asymmetric pin test.
- Counters in the `meta` column absorb max ids (TS mirrors via `absorbComponentItemIds`).
- `component_calculation` READ on an unstored value crashes the whole request (`array_sum`) — TS serves `entries: []`.

## Testing

Full suite: `bun test` (baseline 371 pass at time of writing). Differential gates need live PHP + shared Postgres — see the `dedalo-parity-debugging` skill for env/harness. Key relation gates: `relation_corpus_config.test.ts` (18-row §7 corpus, FULL enriched sqo compare), `dataframe_roundtrip_differential.test.ts` (scratch twins), `relation_inverse_differential.test.ts`, `tm_relation_filter_differential.test.ts`, `portal_edit_subdatum_differential.test.ts`, `portal_drag_capture_replay.test.ts`; units: `locator_law`, `request_config_v5`, `relation_search_builders`. Every phase gate must stay green with ZERO fixture/normalization changes — a needed change means the migration altered behavior, fix it don't normalize it away. Commit per phase (Conventional Commits, backticked Dédalo identifiers, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).
