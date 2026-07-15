---
name: dedalo-ontology-ts
description: The Dédalo v7 TypeScript/Bun rewrite of the ONTOLOGY definition & provisioning pipeline — the dd_ontology write layer, the parse_section_record_to_ontology_node parser, the incremental/destructive write drivers (setRecords/regenerate), hierarchy provisioning + the HIERARCHY INVARIANT (src/core/ontology/hierarchy_state.ts: inspect/ensure/rebuild — the single writer), and the tool_ontology/tool_ontology_parser/tool_hierarchy handlers. Use when editing src/core/db/dd_ontology.ts, src/core/ontology/{parser,ontology_write,hierarchy_state,hierarchy_provision,ontology_delete}.ts, src/core/install/hierarchy_activate.ts, tools/tool_{ontology,ontology_parser,hierarchy}/server/*.ts, or debugging why a parsed dd_ontology row, a provisioned thesaurus, or a runtime ontology read is wrong — or why a hierarchy cannot be activated (dangling general-term root, bare active locator, missing ontology). Shared foundation with dedalo-tree-ts. PHP oracle: v7_php_frozen/master_dedalo/core/ontology/class.ontology.php, core/hierarchy/class.hierarchy.php, core/db/class.dd_ontology_db_manager.php, tools/tool_{ontology,ontology_parser,hierarchy}.
---

# Dédalo v7 ontology pipeline (TypeScript rewrite)

Dédalo keeps ontology in TWO layers, bridged by a parser. PHP (`v7_php_frozen/master_dedalo`, read-only) is the ORACLE — verify differentially (`dedalo-parity-debugging`). Never silently narrow; throw + ledger in the file header.

1. **STRUCTURE (editable source of truth):** matrix records — `matrix_ontology` (nodes) + `matrix_ontology_main` (`ontology35`/TLD-family rows); thesauri twins `matrix_hierarchy` + `matrix_hierarchy_main` (`hierarchy1` rows).
2. **ACTIVE (runtime, flat):** `dd_ontology` (v6 `jer_dd`, dead in v7). One row per node: `tipo, parent, term(jsonb), model, order_number(int), relations(jsonb), tld, properties(jsonb), model_tipo, is_model, is_translatable, is_main, propiedades(TEXT, v5 legacy)`. This is what `src/core/ontology/resolver.ts` READS at runtime.

**Identity:** tipo = TLD + section_id. Ontology main sections are ALWAYS `<tld>0` (dd0, rsc0, ontology0…). A hierarchy record with TLD `es` provisions sections `es1` (descriptors) / `es2` (models). See `src/core/ontology/tld.ts`. `ontology35` is a VIRTUAL section of `hierarchy1` — the same component model backs both, which is why the parser/tools read `hierarchy5/6/9/53` components off `ontology35`/`matrix_ontology_main` rows.

## Shared foundation (also used by dedalo-tree-ts)
`src/core/db/postgres.ts` `withTransaction`/`acquireNodeLock`; `ontology/tld.ts`; `ontology/ontology_tipos.ts` (ONTOLOGY_TLD='ontology7', ONTOLOGY_PARENT='ontology15', ONTOLOGY_IS_MODEL='ontology30', ONTOLOGY_MODEL='ontology6', ONTOLOGY_ORDER='ontology41', ONTOLOGY_TRANSLATABLE='ontology8', ONTOLOGY_CONNECTED_TO='ontology10', ONTOLOGY_PROPERTIES/CSS/SOURCE/PROPIEDADES_V5='ontology18/16/17/19', ONTOLOGY_TERM='ontology5', HIERARCHY_*, SECTION_MODEL_TIPO='dd6', STRUCTURE_LANG='lg-spa'); `ontology/cache_invalidation.ts` `clearOntologyDerivedCaches()` — called after EVERY dd_ontology write.

## Layers
```
src/core/db/dd_ontology.ts        # PHP dd_ontology_db_manager: upsert/read/update/delete/search + getActiveTlds + deleteTldNodes + createBackupTable/restore/drop. Every write ends with clearOntologyDerivedCaches().
src/core/ontology/parser.ts       # parseSectionRecordToOntologyNode + getOverwriteLocator + getTermIdFromLocator + phpPrettyJsonEncode
src/core/ontology/ontology_write.ts  # insertDdOntologyRecord, setRecordsInDdOntology, regenerateRecordsInDdOntology, createDdOntologyRootNode, createParentGrouper, addMainSection, getMainTld/Typology/NameData, syncOrderToDdOntology
src/core/ontology/hierarchy_provision.ts  # generateVirtualSection (ONE tx; refuses an already-provisioned tld)
src/core/ontology/hierarchy_state.ts     # ⭐ THE hierarchy invariant + THE only writer: inspectHierarchy / ensureHierarchy / rebuildHierarchy / inspectAllHierarchies
src/core/ontology/ontology_delete.ts     # deleteOntologyByTld (ontology only — TERMS survive) + deleteOntologyMain (that + the caller's registry record: the dd_core_api delete cascade)
src/core/install/hierarchy_activate.ts   # install-time activation: find-or-create the registry record from hierarchies.json, then ensureHierarchy
tools/tool_{ontology,ontology_parser,hierarchy}/server/*.ts  # tool handlers (self-contained tool packages; import the core drivers above)
```

### The hierarchy law (2026-07-14) — read before touching ANY hierarchy write
A usable hierarchy satisfies TEN conditions at once (registry record, tld, typology, source
section, active flag, active-in-thesaurus, ontology nodes + `<tld>0` node records, target
sections, and the two general-term ROOTS). `hierarchy_state.ts` owns that invariant and is
the **single writer** — `hierarchy_single_writer_tripwire` fails if anything else calls
`generateVirtualSection` or writes a `hierarchy45`/`hierarchy59` locator (one named exemption:
`ontology_write.ts`, which seeds the `dd` ontology registry — not a thesaurus hierarchy).

Three rules, each of which was a shipped bug:
- **Ask whether the TARGET EXISTS, never whether the locator is SET.** The seed presets a
  dangling `hierarchy45 → <tld>1/1` on most registry records; the old check said "already
  seeded", the root was never created, and the hierarchy could not be activated at all.
- **Never hard-code a record id.** The model root was pinned to `<tld>2`/2 — an id that
  exists in almost no install. Resolve the root (lowest id) or create it.
- **Default, never overwrite, operator data.** `hierarchy109` (Real section tipo) is the
  operator's choice; ensure defaults it to `hierarchy20` when EMPTY and REFUSES when it names
  a non-section, rather than silently rewriting what the hierarchy IS.

A created root is NAMED after the hierarchy (`hierarchy5`, all langs); the term component comes
from the target section's `section_map` (`getSectionMapValue(tipo,'thesaurus','term')` →
`hierarchy25` for hierarchy20-based sections), never hard-coded. Naming is fill-only.

`resolver.ts` fixes shipped with this: `clearOntologyCaches()` clears ALL 3 caches (was node-only); `getMatrixTableFromTipo` returns `matrix_ontology` for ANY `<x>0` tipo BEFORE the node lookup (PHP common:861-870 — so a not-yet-installed local `<tld>0` still routes).

## Parser (parseSectionRecordToOntologyNode — PHP class.ontology.php:1811)
Reads components off a `matrix_ontology` row (via readMatrixRecord + component-data helpers), with OVERWRITE-locator fallback (a `localontology0` node may override the main; `getOverwriteLocator` null for localontology0 itself, null when canonical node is_model=true). Field map & subtleties (EACH an explicit test):
- tld←ontology7 (empty → skip/null); tipo = tld+section_id; is_main = tipo===tld+'0'.
- parent←ontology15 first locator; NULL iff locator→ontology35 (roots), else getTermIdFromLocator.
- **is_model←ontology30 CANONICAL-ONLY** (never via overwrite — structural integrity); `(int)section_id===1`.
- model_tipo/model←ontology6 (OVERWRITE-AWARE, code beats the docblock); model = dd_ontology(model_tipo).term['lg-spa'] STRICT, NO fallback.
- order_number←ontology41 `(int)`; is_translatable←ontology8, **default TRUE when missing**.
- relations←ontology10 locators→`{tipo:termId}` (skip unresolvable, empty→null).
- properties←ontology18 + `.css`(16) + `.source`(17); empty → SQL NULL never `{}`; request_config validated NON-blocking (warn only).
- propiedades←ontology19 as `phpPrettyJsonEncode` TEXT (byte-exact PHP JSON_PRETTY_PRINT: 4-space indent, `\/`, `\uXXXX`); term←ontology5 all-langs `{lang:value}`.
Upsert is WHOLE-ROW replace (a cleared component → nulled column on re-parse).

## Write drivers (ontology_write.ts)
- `setRecordsInDdOntology` — edit (one record) vs list (all records of a section — divergence: PHP filters by session SQO, TS has none; ledgered). ontology35 record → getMainTld; TLD not in `getActiveTlds()` (= "already has dd_ontology rows", NOT hierarchy4) → deleteTldNodes; active → createDdOntologyRootNode. Else insertDdOntologyRecord. PARTIAL-SUCCESS (result=true when processed>0).
- `regenerateRecordsInDdOntology` — backup table → parse ALL of `<tld>0` → deleteTldNodes → upsert all → rebuild root. Backup table IS the rollback (NOT a transaction, matches PHP). **LEAVES dd_ontology_bk on success** (pinned).
- `createDdOntologyRootNode` — `<tld>0`: model 'section', model_tipo dd6, is_main, relations `[{tipo:'ontology1'},{tipo:'dd1201'}]`, properties `{main_tld,color:'#2d8894'}`, parent = typology grouper. `createParentGrouper('ontology40'/'ontologytype' | 'hierarchy56'/'hierarchytype' | 'hierarchy57'/'hierarchymtype', tld, typologyId)`.
- `syncOrderToDdOntology(changed, parentTipo, parentId)` — consumed by the tree's save_order (dedalo-tree-ts).

## Hierarchy provisioning (generateVirtualSection — PHP class.hierarchy.php:228)
Validate (hierarchy4 active=dd64/1 loose `==`; hierarchy6 tld lowercased; hierarchy109 source model==='section'; hierarchy9 typology int≥1; hierarchy5 name) → ONE `withTransaction`: addMainSection → createDdOntologyRootNode → `<tld>0/1` descriptor (createSectionRecord sectionId 1; components ontology3 yes, ontology4 yes, ontology6 dd0/6, ontology8 no, ontology10→real source, **ontology7 lang lg-spa** [differs from addMainSection's lg-nolan — pin bytes], ontology5 name; grouper hierarchy56; **bare `{section_tipo,section_id}` parent locator** — no type field) → insertDdOntologyRecord(<tld>0,1) → `<tld>0/2` model twin (copy row-1 columns, ontology30→dd64/1, grouper hierarchy57) → write hierarchy53=`<tld>1`/hierarchy58=`<tld>2` back. set_section_permissions grant is PORTED (`security/section_permissions.ts` — grants the creating user's PROFILE level 2 over `<tld>1`/`<tld>2` + their elements) and stays NON-FATAL (failure → error string in response.errors, no rollback).

## Tools (self-contained packages, developer-gated)
Each tool is a package under `tools/tool_<name>/server/` whose handler imports the core drivers above (e.g. `tools/tool_ontology/server/tool_ontology.ts` calls `setRecordsInDdOntology`). Registered actions: tool_ontology.set_records_in_dd_ontology, tool_ontology_parser.{get_ontologies,regenerate_ontologies} — `permission:'developer'` (skips section-target assertion, requires `principal.isDeveloper`); tool_hierarchy.{inspect_hierarchy (section≥1, READ — the status checklist), generate_virtual_section (section≥2, WRITE — ensureHierarchy; force_to_create → rebuildHierarchy)}. `export_ontologies` deliberately UNREGISTERED. The tools machinery (registration, security/developer gate, serving) lives in `src/core/tools/` and routes via `dd_tools_api.tool_request`. NOTE: this thin wrapper layer was relocated by the `feat(tools)!: self-contained packages` refactor — the ontology CORE (parser/write drivers) is unchanged; the `dedalo-parity-debugging` skill + `src/core/tools/` own the tools plumbing.

## Testing
Unit: `test/unit/{php_pretty_json,dd_ontology_write,ontology_parser}.test.ts`; hierarchy: `test/unit/{hierarchy_state_native,hierarchy_generate_native,install_hierarchy_activate_native,hierarchy_single_writer_tripwire}.test.ts` (scratch tld `zz`, zero residue). Differentials vs live PHP (snapshot→PHP→restore→TS→diff): `test/parity/{ontology_parser,get_ontologies,tool_ontology,regenerate,generate_virtual_section,ontology_delete}_differential.test.ts` — byte-exact all 13 dd_ontology columns. Write tests use SCRATCH twin TLDs (`zzta`/`zztb`) and MUST leave zero residue — verify with `SELECT tld FROM dd_ontology WHERE tld LIKE 'zz%'` (empty) and `to_regclass('public.dd_ontology_bk')` (null except after a deliberate regenerate). NEVER mutate real records.

## Ledgered deferrals (in file headers)
export_ontologies/import/remote-sync/export_llm_map; tool_ontology list-mode = full-section scan (no session SQO); dd_ontology_api fuzzy/exact term search; session `active_elements` invalidation (no TS twin). (set_section_permissions is NO LONGER deferred — ported in `security/section_permissions.ts`.)
