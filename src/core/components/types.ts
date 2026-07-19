/**
 * ComponentModel — the per-model DESCRIPTOR (the "named home" for a component
 * model, spec §3.1 "the ontology is the atom of the system").
 *
 * WHY THIS EXISTS. Component behavior in this rewrite lives in horizontal
 * engines (resolve/, search/, relations/, section/) that dispatch on the
 * `model` string. Historically that dispatch was spread across several private
 * lookup tables (MODEL_COLUMN_MAP, MODEL_REPLACEMENT_MAP,
 * CLASS_SUPPORTS_TRANSLATION, the relations RESOLVERS map, the SEARCH_UNCOVERED
 * ledger). A model therefore had no single place a developer could open. Each
 * model now has a FOLDER `component_<model>/` — its home — holding `descriptor.ts`
 * (this data) and, for most, a `samples/` reference set (data.json /
 * context.json / api_data.json: the model's real §3.7 Data, Context, and
 * emitted API item, mirroring the copied client's per-component tree). The
 * descriptor DECLARES the model's deltas and LINKS OUT to the modules that
 * carry its heavier behavior. The engines keep their existing accessor functions
 * (getColumnNameByModel, getRelationResolver, …) — those now just read a
 * descriptor instead of a private table.
 *
 * DISCIPLINE (do not let this rot into a god-registry): a descriptor is
 * DECLARATIVE. It holds small data (which column, is it translatable) and
 * REFERENCES to behavior (resolveData → a relations resolver). It must NEVER
 * grow inline behavior. Where a model's real logic lives elsewhere (e.g.
 * component_relation_parent's hierarchy/order machinery in relations/parent.ts
 * and relations/dataframe.ts), the descriptor file points to it in a comment —
 * a signpost, not a copy.
 *
 * SCOPE. Descriptors cover COMPONENT models only. The non-component `section`
 * pseudo-model and the structural legacy aliases (section_group_div, tab, the
 * "box elements" containers) stay residual in ontology/resolver.ts — they are
 * not component data behavior.
 */

/**
 * The relation-resolver IDs a descriptor may name in `resolveData` (S2-20:
 * relation-model bindings are DATA, resolved by relations/registry.ts —
 * components/ keeps zero value-import edges into relations/). Adding a
 * resolver = add the ID here + its implementation entry in
 * relations/registry.ts RESOLVER_IMPLEMENTATIONS.
 */
export type RelationResolverId =
	| 'portal'
	| 'filter'
	| 'select_family'
	| 'relation_children'
	| 'relation_index'
	| 'relation_related';

/**
 * The emit-hook IDs a descriptor may name in `emitHook` (audit S2-24).
 * Adding a hook = add the ID here + its implementation entry in
 * components/emit_hooks.ts EMIT_HOOKS.
 */
export type EmitHookId =
	| 'section_id'
	| 'media'
	| 'info'
	| 'text_area'
	| 'filter_records'
	| 'security_access';

/**
 * The import-parser IDs a descriptor may name in `importConform`. Adding one =
 * add the ID here + its implementation entry in tools/import_conform.ts
 * IMPORT_CONFORM. (Declared here rather than imported from tools/ so that
 * components/ never depends on tools/ — the dependency runs the other way.)
 */
export type ImportConformId =
	| 'date'
	| 'email'
	| 'geolocation'
	| 'input_text'
	| 'iri'
	| 'json'
	| 'number'
	| 'relation'
	| 'select_lang'
	| 'text_area';

/**
 * The search face of a relation model (mirrors the old SEARCH_UNCOVERED
 * ledger). Only relation-column models carry this; a model whose PHP search is
 * a dedicated, not-yet-ported pipeline is marked 'unported' with its reason and
 * makes the search dispatcher throw loudly instead of silently mis-searching.
 */
export interface ComponentSearch {
	status: 'ported' | 'unported';
	/** Required when status === 'unported': the ledgered reason it throws. */
	reason?: string;
}

/**
 * NON-relation SQO fragment-builder family (search/conform.ts dispatch,
 * S2-26). Names one of the ported builders in search/builders/ — the
 * descriptor stays declarative (a family NAME, never a function ref, so
 * components/ keeps zero import edges into search/). A model that declares
 * no family is unsearchable through conform and throws loudly there (the
 * no-silent-narrowing posture). Relation-column models never declare this:
 * their search face is `search` + the relations registry, derived from
 * column === 'relation'.
 */
export type SearchBuilderFamily = 'string' | 'number' | 'date' | 'iri' | 'section_id' | 'json';

/**
 * Flat display-value family (S2-26): how a component renders as a plain
 * string cell (relation_list grid values, export atoms).
 * - 'string': lang-sliced literal values joined ' | ';
 * - 'datalist': locators resolved to labels through the component datalist;
 * - 'section_id': the record's own numeric id (component_section_id);
 * - 'date': the dd_date flat form (year / d-m-Y, ranges 'start <> end');
 * - 'iri': the iri value + its dd560 label-dataframe field joined ', ';
 * - 'media': the default-quality file's absolute media URL
 *   (mediaTypeOf(model).defaultQuality — install-tunable via DEDALO_* keys).
 * Models with no family declared are LEDGERED unresolved by the consumers
 * (value null + a note, never a guessed string).
 */
export type FlatValueFamily = 'string' | 'datalist' | 'section_id' | 'date' | 'iri' | 'media';

/**
 * One component model's declarative descriptor. Only the fields the engines
 * actually READ live here; heavier per-model behavior is linked out via file
 * comments (see the DISCIPLINE note above).
 */
export interface ComponentModel {
	/** Canonical model name — this descriptor's identity and its file name. */
	readonly model: string;
	/**
	 * Matrix jsonb column storing this model's data (PHP
	 * section_record_data::$column_map). Consumed by getColumnNameByModel.
	 * Omitted for alias-only stubs that never store data under their own name.
	 */
	readonly column?: string;
	/**
	 * Legacy stored model name → canonical runtime model (PHP
	 * ontology_node::get_model replacement map). Present on descriptors whose
	 * `model` is an obsolete v5/v6 name; getModelByTipo follows it.
	 */
	readonly alias?: string;
	/**
	 * CLASS-level translation support (PHP component_common supports_translation,
	 * :1301-1308) — deliberately independent of the ontology `translatable`
	 * flag. Only these lang-filter their data items. Consumed by component_data.
	 */
	readonly classSupportsTranslation?: boolean;
	/**
	 * The relation resolver implementing this model's row-emission particularity
	 * (only relation-column models), named as DATA (S2-20): the ID is resolved
	 * to its implementation by relations/registry.ts RESOLVER_IMPLEMENTATIONS,
	 * so descriptors never import relation model modules (that static edge was
	 * one of the two that fused the 33-file import SCC). Consumed by
	 * getRelationResolver. Its presence is also how the registry knows a model
	 * is a resolvable relation.
	 */
	readonly resolveData?: RelationResolverId;
	/**
	 * CLASS-level relation type fallback (PHP component_relation_common
	 * $default_relation_type, overridden per concrete subclass) — used only
	 * when the component's OWN tipo properties carry no
	 * config_relation.relation_type. Consumed by getRelationTypeByTipo
	 * (relations/save.ts). Only relation-column models declare it.
	 */
	readonly defaultRelationType?: string;
	/** Relation search coverage (only relation-column models). */
	readonly search?: ComponentSearch;
	/**
	 * NON-relation SQO builder family (search/conform.ts dispatch). Omitted =
	 * unsearchable through conform (throws loudly there). Never set on
	 * relation-column models — their dispatch derives from column==='relation'.
	 */
	readonly searchBuilder?: SearchBuilderFamily;
	/**
	 * Flat display-value family (relation_list grid cells / export atoms).
	 * Omitted = the consumers ledger the model as unresolved (null value).
	 */
	readonly flatValue?: FlatValueFamily;
	/**
	 * PHP component_common::$components_using_value_property: on CSV import a
	 * bare scalar cell wraps into {value: …} for this model (tools/
	 * import_data.ts conformImportData). Omitted = the raw JSON/data shape is
	 * kept as-is.
	 */
	readonly importValueProperty?: true;
	/**
	 * The model's IMPORT parser, named as DATA (the `emitHook` / `resolveData`
	 * shape): the ID resolves to its implementation in tools/import_conform.ts
	 * IMPORT_CONFORM, so a descriptor imports no engine module. It owns the
	 * HUMAN-authored cell — '12-03-1998', '1.234,56', '41.38, 2.17', '273,418' —
	 * and the model's JSON particularities (PHP's conform_import_data override).
	 *
	 * OMITTED = the model has no flat-value form: a JSON cell still round-trips
	 * (that path is model-agnostic), but a flat cell is REFUSED rather than
	 * written as a silent clear. That is the correct default for the media models.
	 * Pinned by descriptor_completeness_tripwire.
	 */
	readonly importConform?: ImportConformId;
	/**
	 * Emit-time particularity (audit S2-24): names this model's emit hook as
	 * DATA — the ID is resolved to its implementation by
	 * components/emit_hooks.ts (same shape as `resolveData`, so descriptors
	 * stay declarative and import no engine modules). The hook either fully
	 * owns the ddo's emission (media, section_id) or adjusts the generic
	 * literal path (value transform / item decoration). Omitted = the plain
	 * generic literal path.
	 */
	readonly emitHook?: EmitHookId;
	/**
	 * Dataframe FRAME tipos this model ALWAYS pairs with, regardless of
	 * properties.has_dataframe (PHP component_iri_json's hardcoded
	 * DEDALO_COMPONENT_IRI_LABEL_DATAFRAME dd560). Omitted = frames come from
	 * the generic has_dataframe ontology walk.
	 */
	readonly fixedDataframeTipos?: readonly string[];
	/**
	 * Whether a list column of this model is SORTABLE (PHP get_sortable —
	 * component_common base returns true; media/relation_common/geolocation/
	 * info/security_access override to false). Consumed by the structure-context
	 * core (buildCore) to emit `sortable` + an order `path` per column; the
	 * client's list header shows a sort icon only when this is true (common.js
	 * get_columns_map + ui.js allow_column_order). OMITTED = true (the base).
	 * Set explicitly `false` only on the CANONICAL non-sortable models; alias
	 * stubs inherit their canonical target's value via getModelByTipo. The
	 * per-TIPO exception (DEDALO_NOTES_TEXT_TIPO rsc329 → false) lives inline in
	 * buildCore. Pinned by list_column_sortable_tripwire.
	 */
	readonly sortable?: boolean;
}
