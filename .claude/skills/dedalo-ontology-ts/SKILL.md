---
name: dedalo-ontology-ts
description: The Dédalo v7 TypeScript/Bun rewrite of the ONTOLOGY definition & provisioning pipeline — the dd_ontology write layer, the parse_section_record_to_ontology_node parser, the incremental/destructive write drivers (setRecords/regenerate), hierarchy provisioning (generate_virtual_section), and the tool_ontology/tool_ontology_parser/tool_hierarchy handlers. Use when editing src/core/db/dd_ontology.ts, src/core/ontology/{parser,ontology_write}.ts, src/core/resolve/hierarchy_provision.ts, tools/tool_{ontology,ontology_parser,hierarchy}/server/*.ts, or debugging why a parsed dd_ontology row, a provisioned thesaurus, or a runtime ontology read diverges from the PHP oracle. Shared foundation with dedalo-tree-ts. PHP oracle: v7/master_dedalo/core/ontology/class.ontology.php, core/hierarchy/class.hierarchy.php, core/db/class.dd_ontology_db_manager.php, tools/tool_{ontology,ontology_parser,hierarchy}.
---

# Dédalo v7 ontology pipeline (TypeScript rewrite)

Dédalo keeps ontology in TWO layers, bridged by a parser. PHP (`v7/master_dedalo`, read-only) is the ORACLE — verify differentially (`dedalo-parity-debugging`). Never silently narrow; throw + ledger in the file header.

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
src/core/resolve/hierarchy_provision.ts  # generateVirtualSection + createThesaurusGeneralTerm
tools/tool_{ontology,ontology_parser,hierarchy}/server/*.ts  # tool handlers (self-contained tool packages; import the core drivers above)
```
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
Validate (hierarchy4 active=dd64/1 loose `==`; hierarchy6 tld lowercased; hierarchy109 source model==='section'; hierarchy9 typology int≥1; hierarchy5 name) → ONE `withTransaction`: addMainSection → createDdOntologyRootNode → `<tld>0/1` descriptor (createSectionRecord sectionId 1; components ontology3 yes, ontology4 yes, ontology6 dd0/6, ontology8 no, ontology10→real source, **ontology7 lang lg-spa** [differs from addMainSection's lg-nolan — pin bytes], ontology5 name; grouper hierarchy56; **bare `{section_tipo,section_id}` parent locator** — no type field) → insertDdOntologyRecord(<tld>0,1) → `<tld>0/2` model twin (copy row-1 columns, ontology30→dd64/1, grouper hierarchy57) → write hierarchy53=`<tld>1`/hierarchy58=`<tld>2` back. set_section_permissions grant is NON-FATAL (no TS perms-write path → error string, continue).

## Tools (self-contained packages, developer-gated)
Each tool is a package under `tools/tool_<name>/server/` whose handler imports the core drivers above (e.g. `tools/tool_ontology/server/tool_ontology.ts` calls `setRecordsInDdOntology`). Registered actions: tool_ontology.set_records_in_dd_ontology, tool_ontology_parser.{get_ontologies,regenerate_ontologies} — `permission:'developer'` (skips section-target assertion, requires `principal.isDeveloper`); tool_hierarchy.generate_virtual_section — section≥2. `export_ontologies` deliberately UNREGISTERED. The tools machinery (registration, security/developer gate, serving) lives in `src/core/tools/` and routes via `dd_tools_api.tool_request`. NOTE: this thin wrapper layer was relocated by the `feat(tools)!: self-contained packages` refactor — the ontology CORE (parser/write drivers) is unchanged; the `dedalo-parity-debugging` skill + `src/core/tools/` own the tools plumbing.

## Testing
Unit: `test/unit/{php_pretty_json,dd_ontology_write,ontology_parser}.test.ts`. Differentials vs live PHP (snapshot→PHP→restore→TS→diff): `test/parity/{ontology_parser,get_ontologies,tool_ontology,regenerate,generate_virtual_section,ontology_delete}_differential.test.ts` — byte-exact all 13 dd_ontology columns. Write tests use SCRATCH twin TLDs (`zzta`/`zztb`) and MUST leave zero residue — verify with `SELECT tld FROM dd_ontology WHERE tld LIKE 'zz%'` (empty) and `to_regclass('public.dd_ontology_bk')` (null except after a deliberate regenerate). NEVER mutate real records.

## Ledgered deferrals (in file headers)
export_ontologies/import/remote-sync/export_llm_map; tool_ontology list-mode = full-section scan (no session SQO); set_section_permissions grant non-fatal; dd_ontology_api fuzzy/exact term search; session `active_elements` invalidation (no TS twin).
