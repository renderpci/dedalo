/**
 * PublicationPlan — the compiled, executable form of a publication schema
 * (DIFFUSION_SPEC §4.1 stage B).
 *
 * A plan is compiled ONCE per (schema source, ontology revision) from either
 * a dd1190 diffusion element (P1) or a tool_export column set (later phase),
 * then cached process-globally. It is a PLAIN JSON-SERIALIZABLE value:
 * principal-independent, dumpable for debugging, diffable in tests, and
 * shippable to a runner process. All ontology interpretation happens at
 * compile time — the resolver and writers never touch dd_ontology.
 */

/** Where a run publishes to. */
export type TargetAddress =
	| { kind: 'table'; database: string }
	| { kind: 'files'; serviceName: string };

/** One step of a field's resolution path (compiled from the ontology ddo_map). */
export type ResolveStep =
	| {
			kind: 'component';
			/** Component tipo to read in the CURRENT record's section. */
			tipo: string;
			model: string;
			sectionTipo: string;
			/**
			 * ddo_map chain parent TIPO. Undefined = root step (executes against
			 * the section's own record); set = executes against the linked records
			 * of that relation-hop step (PHP resolve_chain parent linkage).
			 */
			parent?: string;
			/** Custom component fn (ddo.fn → get_diffusion_data variant), rare. */
			fn?: string;
			/** ddo_map entry id — the handle parser patterns reference ('${a}'). */
			ddoId?: string;
			/**
			 * ddo lang pin (ddo.lang): resolve this terminal in the fixed lang only
			 * and emit it lang-neutral (component_common::get_diffusion_data pin).
			 */
			pinLang?: string;
	  }
	| {
			kind: 'relation-hop';
			tipo: string;
			model: string;
			sectionTipo: string;
			/** ddo_map chain parent TIPO (undefined = root step). */
			parent?: string;
			/** Chain options compiled from rewriter parser fns / ddo flags. */
			addParents?: boolean;
			preserveOrder?: boolean;
			filterSection?: string;
			/** relation_list ddo section_filter: linked-section whitelist. */
			sectionFilter?: string[];
			/** relation_list ddo component_filter: relation-origin whitelist. */
			componentFilter?: string[];
			/** ddo_map entry id — the handle parser patterns reference ('${a}'). */
			ddoId?: string;
	  }
	| {
			kind: 'system';
			source: 'publish_timestamp' | 'section_id' | 'section_tipo';
	  };

/** Per-field emit policies (compiled from the old context side-channels). */
export interface FieldPolicy {
	emptyToString?: boolean;
	defaultValue?: string;
	emptyValue?: string;
	preserveOrder?: boolean;
}

/** Tabular column typing (sql writer input; ignored by document writers). */
export interface ColumnDef {
	/** Diffusion field model — drives the SQL type (field_text, field_int...). */
	fieldModel: string;
	varcharLength?: number;
	/** Ontology `index` override; absent = model-default indexing. */
	index?: unknown;
}

/** A parser step that survived compile as a RUNTIME transform. */
export interface ParserStepConfig {
	fn: string;
	id?: string;
	options: Record<string, unknown>;
}

/**
 * P6 export front-end metadata (compile_columns.ts): what the export
 * PROJECTION (atoms → NDJSON grid) needs beyond the shared sourceChain.
 * Carried on FieldPlan additively; every other plan consumer ignores it.
 */
export interface ExportColumnMeta {
	/** ar_ddo_to_export ordinal — column identity = the user's DOM order. */
	ordinal: number;
	/** The export ddo `path` VERBATIM (the protocol col line's `path` field). */
	path: Record<string, unknown>[];
	/**
	 * Effective value_with_parents (request global || per-ddo flag). Carried
	 * for the projection; the TS legacy path never implemented it, so it is
	 * INERT until the parents sub-column lands (ledgered, PHP-only feature).
	 */
	valueWithParents?: boolean;
}

/** One output field of one section (a field node of a table). */
export interface FieldPlan {
	/** Stable plan identity = the diffusion field-node tipo. */
	id: string;
	/** Sanitized + validated column name (identifier chokepoint applied). */
	columnName: string;
	/** Resolution path: first step reads the record; hops recurse. */
	sourceChain: ResolveStep[];
	/** Runtime transforms (rewriter fns already absorbed into the plan). */
	transform: ParserStepConfig[];
	column: ColumnDef;
	policy: FieldPolicy;
	/** 'string' | 'int' | 'json' — final stringification hint. */
	outputFormat?: string;
	/** Resolution-only field: participates in logic, emits NO column. */
	excludeColumn?: boolean;
	/** Export front-end only (P6): projection metadata, see ExportColumnMeta. */
	exportColumn?: ExportColumnMeta;
}

/** All fields of one publishable section (a 'table' node). */
export interface SectionPlan {
	sectionTipo: string;
	/** Table name from the (alias-aware) table-node label, validated. */
	tableName: string;
	/** The table/diffusion-section node tipo this plan came from. */
	tableTipo: string;
	fields: FieldPlan[];
}

export interface RecursionPolicy {
	/** Breadth-first levels budget (DEDALO_DIFFUSION_RESOLVE_LEVELS, default 2). */
	maxLevels: number;
}

export interface PlanLangPolicy {
	langs: string[];
	mainLang: string | null;
}

/** The compiled plan for one diffusion element. */
export interface PublicationPlan {
	/** Cache key: elementTipo + ontology revision at compile time. */
	planId: string;
	elementTipo: string;
	/** Output format type from properties->diffusion->{type} ('sql', 'rdf'...). */
	format: string;
	serviceName: string | null;
	target: TargetAddress;
	sections: SectionPlan[];
	recursion: RecursionPolicy;
	langPolicy: PlanLangPolicy;
	/** Compile diagnostics surfaced by the `validate` action (never silent). */
	warnings: string[];
}
