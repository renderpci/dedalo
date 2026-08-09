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
			/**
			 * Verbatim ddo `options` bag (PHP `$ddo->options`). The media primitive
			 * reads `quality`/`extension` from it (component_media_common::
			 * get_diffusion_data :530-536); ANY other key is refused loudly at
			 * resolution time rather than ignored — an option the engine does not
			 * implement must never narrow a publication silently.
			 */
			options?: Record<string, unknown>;
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
	  }
	| {
			/**
			 * A ddo the compiler could not turn into a readable step (today: a
			 * tipo absent from the ontology). It stays in the chain and resolves
			 * to ZERO atoms.
			 *
			 * It is NOT dropped, because the oracle derives a datum's `columns`
			 * from the FULL ddo_map — dd_diffusion_api::build_datum_context :1294
			 * keeps every ddo that is not referenced as another ddo's `parent`,
			 * WITHOUT looking the tipo up; danglingness is only discovered later,
			 * at resolve time (diffusion_chain_processor::resolve_ddo_value :133-
			 * 152 returns [] for it). Dropping the entry would silently re-shape
			 * the field's leaf/column topology: mht2's rsc1194 would publish
			 * 'Historia' where the oracle publishes 'Historia, ' (the empty slot
			 * of the dangling zenon4 column, `empty_columns` defaulting to true).
			 * DEGRADE THE VALUE, NEVER THE SHAPE.
			 */
			kind: 'degraded';
			/** The ddo tipo VERBATIM as the ontology declares it. */
			tipo: string;
			/** ddo_map chain parent TIPO (undefined = root step). */
			parent?: string;
			/** ddo_map entry id — the handle parser patterns reference ('${a}'). */
			ddoId?: string;
			/** Machine-readable cause; mirrors PlanDegradation.reason. */
			reason: 'dangling_ddo_tipo';
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
	 * Per-ddo value_with_parents flag (the column's parents checkbox, WC-049:
	 * per-ddo ONLY — no request-global form). The projection emits each
	 * relation locator's ancestor chain as a sibling '#parents' column
	 * (grid_value format; atoms.ts resolveParentsChain).
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

/**
 * A FIELD-LOCAL degradation found at compile time: the element still
 * publishes, but this field resolves less than the ontology asks for. It is a
 * STRUCTURED channel of its own (never mixed into `warnings`, whose strings
 * are parsed by the resolver's rewriter/hop-fn recovery) because the operator
 * has to be told exactly which column lost what.
 *
 * Oracle: diffusion_chain_processor::resolve_ddo_value :133-152 —
 * component_common::get_instance returns null for a tipo that is not in the
 * ontology, PHP logs "Component instance not found" and returns [] for THAT
 * ddo. The rest of the field, and every other field of the element, still
 * publishes. Before this, the TS compiler raised a fatal element error, so one
 * dangling tipo (mht2's zenon4/5/6/9 bibliography ddos) blocked every run.
 *
 * The degradation is about the VALUE only: the ddo keeps its place in the
 * compiled chain as a `degraded` ResolveStep, so the field's column topology
 * is the oracle's (see that step's doc comment).
 */
export interface PlanDegradation {
	/** The diffusion field node whose resolution was narrowed. */
	fieldId: string;
	/** The column that will publish empty / partial. */
	columnName: string;
	/** Machine-readable cause (one per known degradation kind). */
	reason: 'dangling_ddo_tipo';
	/** The offending ddo tipo. */
	ddoTipo: string;
	/**
	 * ddos hanging UNDER the degraded one (transitively). They keep their place
	 * in the chain and their column slots, but nothing ever executes them: the
	 * oracle reaches a child ddo only through its parent's resolved locators,
	 * and this parent resolves to none. Named so the operator sees the whole
	 * disabled subtree, not just its root. Empty for a leaf ddo.
	 */
	disabledDdoTipos: string[];
	/** Operator-facing sentence (what was skipped and what the effect is). */
	message: string;
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
	/**
	 * Field-local degradations (see PlanDegradation). OPTIONAL on the type so a
	 * hand-built plan literal (writer/integration fixtures) stays valid;
	 * `compileElementPlan` ALWAYS sets it, and every consumer reads it through
	 * `plan.degradations ?? []`.
	 */
	degradations?: PlanDegradation[];
}
