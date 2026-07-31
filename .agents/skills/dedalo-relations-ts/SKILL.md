---
name: dedalo-relations-ts
description: The Dédalo v7 TypeScript/Bun rewrite of the RELATION component family — the strangler-fig subsystem in src/core/relations/ (registry dispatch, relation_core shared engine, per-model resolvers, implicit/explicit request_config builders, inverse/children/related/index engines, save hooks) INCLUDING the full component_dataframe contract (id_key pairing, normalizeDataframeEntry/dataframeEntriesEqual, the paired get_data graft, and the client-side gates that make a server-correct frame still render nothing). Use when editing src/core/relations/**, src/core/section/read.ts relation emission (the shared emitDdoData — read_rows.ts is DELETED), src/core/search/conform.ts relation dispatch, or debugging why a portal/autocomplete/dataframe/children/index/related component resolves wrong. Also for ANY dataframe symptom: frames saved but not shown, duplicate frames, a frame paired to the wrong main item, "shows the previous data", a dataframe widget missing from a literal or portal main, the rating chip colour missing, or a frame stored without type dd490. Authoritative spec: engineering/RELATIONS_SPEC.md (§1 addendum: phases A-E LANDED); ledger: rewrite/STATUS.md "Relations rebuild".
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

`concepts/subdatum.ts` is the pure contract home: `dataframeEntryMatches(type, from_component_tipo, main_component_tipo, id_key)`, plus **`normalizeDataframeEntry`** (the persisted-frame normalizer) and **`dataframeEntriesEqual`** (identity over `DATAFRAME_TEST_EQUAL_PROPERTIES`). `dataframe.ts` consolidates emit + literal pairing onto them. `build_dataframe_subdatum` counter contract + blank-slot dummy locator at counter+1. **Round-trip is gated via SCRATCH TWINS** (`dataframe_roundtrip_differential.test.ts`) — never mutate the real §15657 record. `absorbComponentItemIds` raises the `meta` counter to max ids (counters live in the `meta` column).

### The persisted-frame contract (a frame the reader can't see IS corruption)

Every frame write funnels through `normalizeDataframeEntry`, from BOTH doors — `validateRelationInsert` (`relations/save.ts`, via its `pairing` option) and `mergeCallerEntries` (`relations/dataframe.ts`). It FORCES `type: 'dd490'`, takes `from_component_tipo`/`main_component_tipo`/`id_key` from the **server's** caller context (never the payload), stringifies `section_id`, and strips `paginated_key` + the legacy `section_id_key`/`section_tipo_key`.

Dedup compares `DATAFRAME_TEST_EQUAL_PROPERTIES` — **excludes `id`** (minted per insert, so including it makes every duplicate unique) and **includes `id_key`** (framing the same target from two different main items is legitimate). The generic relation key `[section_id, section_tipo, type, tag_id]` must NOT be used: it would collapse those two.

**Why this exists (2026-07-31, record oh1/368).** `component_dataframe` was the ONE relation column excluded from the normalizer — `!isDataframeSave` guarded all three value-carrying branches of `save_component.ts`. The client's raw picker locator was stored verbatim: no `type`, numeric `section_id`, echoed `paginated_key`, no dedup. Since `isDataframeEntry` demands dd490, every such frame was invisible to the reader — stored, unreadable, undeletable through the UI, and each retry appended another. 9698 legacy frames were correct; exactly 3 were not.

**One validity rule for every door**: `dataframePairingOf` (`concepts/rqo.ts`) — a pairing needs a non-empty `main_component_tipo` AND an integer `id_key >= 1`, returned as a NUMBER. Three doors each having their own predicate (read: any finite; save: `>=1`; merge: non-null) was itself a hole — a payload passing one and failing another wrote through the UNPAIRED path. The save door **refuses loudly** on an unusable pairing rather than persisting garbage.

### Reading one item's frames

`get_data` on a `component_dataframe` is a **paired** read: it honours `source.caller_dataframe` (DECLARED on `rqoSourceSchema`, read only through `callerDataframePairing`), and does it by **grafting** the caller's filtered subset into a cloned record then letting the STANDARD portal expansion run — the same substitution trick `component_relation_children` uses. Do NOT hand-roll a bespoke emitter here: the first attempt did, and silently lost sqo limit/offset paging, the `source.properties` override, the ddinfo breadcrumb, and the pinned `'edit'` mode (it re-derived mode from `source.mode`, which routes the client into a different view). Search mode is excluded outright — the client sends `caller_dataframe` on *every* dataframe request.

The item MUST carry `id_key` + `main_component_tipo`. That stamp is load-bearing, not cosmetic: the client assigns the response onto `self.data` and sources the NEXT write's `id_key` from it (`common.js create_source`), so an unstamped echo destroys the following write's pairing. An empty pairing still emits an item (`entries: []`) — `expandPortal` emits nothing for an empty relation, and the client's `self.data = data || {}` would leave the widget with no entries array.

### The CLIENT half (server-correct ≠ rendered)

The server can emit context + data perfectly and nothing appears. Two independent client gates:

- **`context.request_config[0].show.ddo_map` must contain a ddo with `model === 'component_dataframe'`** — that is the ONLY way `get_dataframe` (`component_common/js/dataframe.js`) finds the slot; it returns `null` silently otherwise. The builder stamps `model` from the tipo, so the ontology ddo need not spell it. A literal main gets `request_config` on its context only when it carries its own `source.request_config` (`structure_context.ts`) — the DATA path activates on `has_dataframe` + ontology parentage and needs no config, so the two halves can disagree.
- **`mode` resolution is now ONE rule on every kind of main** (unified 2026-07-31 at the user's call — "why do we need to think in 2 ways?"): the **declared ddo's** `mode` wins, then the slot NODE's `properties.mode`, then `'list'`. The literal path used to pass a SYNTHETIC ddo `{tipo, section_tipo}` and read only `resolveFrameConfig(...).nodeMode ?? 'list'`, so a ddo declaring `"mode":"edit"` was silently dropped on a literal while a relation main honoured it — and `context.view` came from the ddo (`ddoViewOf`) while `context.mode` came from the node. It now looks the slot up in the main's own config (`resolveOwnConfigMap`) exactly as the relation path uses `childDdo.mode ?? portalMode`. Pinned by `has_dataframe_literal_native.test.ts` ("a LITERAL main honours its declared ddo mode"), whose golden pins the fallback. **Symptom of the old split: copying a relation-main slot config (e.g. `numisdata1447`, which carries no node mode) onto a literal yielded `mode:'list'` and rendered nothing.**
- Omitted mode + non-section owner ⇒ `mode: 'list'` (`request_config/explicit.ts` step 7) + `fixed_mode: true`. And the two modes resolve views DIFFERENTLY: **edit** uses the portal views verbatim (`line`, `tree`, `default`, `mosaic`, `indexation`, `content`, `text`); **list** prefixes to `dataframe_<view>` and only `dataframe_default`/`dataframe_text`/`dataframe_mini` exist — anything else falls through to `view_default_list_portal`, which shows nothing for a frameless slot. `{"view":"line"}` with no `mode` is the classic trap: a good edit view demoted to a dead list one. `get_dataframe` ignores its own `view` param; the DDO's `view`/`mode` win on the instance.

The rating chip colour comes from the datalist: each option carries `hide: [{literal, tipo, section_id, section_tipo}]` (resolved per option in `relations/datalist.ts`), and `view_default_list_dataframe.js` paints `hide[0].literal`. That resolution was missing (`hide: []` hardcoded) until 2026-07-31 and threw, killing the whole record render.

Gates: `dataframe_write_contract_native.test.ts` (submits RAW client payloads ONLY — if a test there spells `type:'dd490'` in an input it has stopped testing the contract), `dataframe_contract_tripwire.test.ts`, `datalist_hide_ddos.test.ts` (seeds its own vocabulary: the corpus records are absent from the test DB, and an install-data assertion there passed with ZERO expect() calls).

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
