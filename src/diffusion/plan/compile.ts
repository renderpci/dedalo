/**
 * PublicationPlan compiler (DIFFUSION_SPEC §4.1 stage B, DIFFUSION_PLAN D3-P1).
 *
 * Turns one dd1190 diffusion element into an immutable, JSON-serializable
 * PublicationPlan: ALL ontology interpretation happens here, once per
 * (element, ontology revision) — the resolver and writers never touch
 * dd_ontology again. Oracle anchors:
 *
 * - element format/serviceName: properties->diffusion->{type, service_name}
 *   (dd_diffusion_api::diffuse :233-246, ::validate :482-510);
 * - target database: diffusion_utils::get_database_name_for_element (:1205);
 * - per-section table node: get_section_node_for_element (:1163) — real
 *   'table' preferred over 'table_alias';
 * - field chains: diffusion_utils::get_ddo_map (:1252) — explicit
 *   properties->process->ddo_map (with 'self' resolution) or auto-generated
 *   from the field node's relations, optional properties->process->fn;
 * - field context: dd_diffusion_api::build_datum_context (:1263) — term →
 *   column name, parser split, exclude_column, output_format (two-stage:
 *   explicit process value, else the component-class $diffusion_output_format
 *   fallback — 'json' for the relation family, see compileFieldPlan),
 *   varchar/length/index, empty_to_string, default_value;
 * - v6 side-channels promoted to plan concepts (spec §5): preserve_order
 *   (process_datum :1170-1182) → FieldPolicy; add_parents (chain_processor
 *   :305) → relation-hop flag; global_table_maps (dd_diffusion_api
 *   :1042-1060) → plan warning until the writer phase lands them.
 *
 * SECURITY: every database/table/column name that will reach a SQL target
 * goes through requireSqlIdentifier (spec §8.3) AT COMPILE TIME — a violation
 * is a loud PlanCompileError surfaced by `validate`, never a runtime
 * surprise. File-format (rdf/xml/markdown) labels are kept VERBATIM: names
 * like 'nmo:TypeSeriesItem' or 'skos:prefLabel' are XML/RDF identities, not
 * SQL identifiers, and never reach a SQL string.
 *
 * Parser split (spec §5): each properties->process->parser step is classified
 * via the parser registry — 'runtime' steps survive IN ORDER as
 * ParserStepConfig, 'rewriter' steps are ABSORBED (recorded as
 * 'rewriter:<fn>@<field>' warnings until the resolver phase lands their plan
 * rewrites), 'unknown' fns THROW naming the field (never a silent skip).
 */

import { config } from '../../config/config.ts';
import { readEnv } from '../../config/env.ts';
import { getComponentModel } from '../../core/components/registry.ts';
import { getModelByTipo } from '../../core/ontology/resolver.ts';
import { currentOntologyRevision } from './cache.ts';
import { requireSqlIdentifier } from './identifier.ts';
import type {
	ColumnDef,
	FieldPlan,
	FieldPolicy,
	ParserStepConfig,
	PublicationPlan,
	ResolveStep,
	SectionPlan,
	TargetAddress,
} from './types.ts';
import {
	buildVirtualDiffusionTree,
	getDatabaseNameForElement,
	getSectionNodeForElement,
	getSectionsForElement,
	termLabelOf,
} from './virtual_tree.ts';
import type { VirtualDiffusionTree, VirtualTreeNode } from './virtual_tree.ts';

/** The diffusion output formats PHP validate accepts (dd_diffusion_api :442). */
const KNOWN_FORMATS: ReadonlySet<string> = new Set(['sql', 'rdf', 'xml', 'socrata', 'markdown']);

/** Formats whose target is a MariaDB database (identifier chokepoint applies). */
const TABLE_FORMATS: ReadonlySet<string> = new Set(['sql', 'socrata']);

/** How a parser fn participates in the new engine (parsers/registry.ts). */
export type ParserClassifier = (fn: string) => 'runtime' | 'rewriter' | 'unknown';

/**
 * Compile failed — carries EVERY violation found (not just the first), each
 * naming its element/section/field, plus the warnings gathered before the
 * failure so `validate` can report both.
 */
export class PlanCompileError extends Error {
	readonly elementTipo: string;
	readonly compileErrors: string[];
	readonly compileWarnings: string[];

	constructor(elementTipo: string, errors: string[], warnings: string[]) {
		super(`diffusion plan compile failed for element '${elementTipo}':\n- ${errors.join('\n- ')}`);
		this.name = 'PlanCompileError';
		this.elementTipo = elementTipo;
		this.compileErrors = errors;
		this.compileWarnings = warnings;
	}
}

export interface CompileOptions {
	/**
	 * Parser fn classifier. Defaults to the parser registry's classifyParserFn
	 * (lazy import so this module never hard-fails while the registry module
	 * is being built/tested independently); tests inject their own.
	 */
	classifyParserFn?: ParserClassifier;
	/** Reuse an already-built virtual tree (validate-all, test suites). */
	tree?: VirtualDiffusionTree;
}

/** Lazy default classifier — resolved once, then cached. */
let registryClassifier: ParserClassifier | null = null;
async function defaultClassifier(): Promise<ParserClassifier> {
	if (registryClassifier === null) {
		const registry = await import('../parsers/registry.ts');
		registryClassifier = registry.classifyParserFn;
	}
	return registryClassifier;
}

/** One raw ddo_map entry as stored in v7 properties (post 'self' resolution). */
interface DdoEntry {
	tipo: string;
	/** Undefined = DYNAMIC: the hop target section is only known at runtime. */
	sectionTipo: string | undefined;
	/** Chain parent: the SECTION tipo for root entries, else a ddo tipo. */
	parent: string;
	/** Leaf handle referenced by parser patterns (e.g. text_format '${a}'). */
	id?: string;
	/** Custom fn (ddo.fn or the node-level properties->process->fn). */
	fn?: string;
	/** ddo lang pin (component_common::get_diffusion_data $pin_lang). */
	lang?: string;
	/** relation_list section_filter (linked-section whitelist). */
	sectionFilter?: string[];
	/** relation_list component_filter (relation-origin whitelist). */
	componentFilter?: string[];
}

/** Normalize an ontology string-array property ('a' | ['a','b'] | junk). */
function stringArrayOf(raw: unknown): string[] | undefined {
	const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw !== '' ? [raw] : [];
	const strings = list.filter(
		(entry): entry is string => typeof entry === 'string' && entry !== '',
	);
	return strings.length > 0 ? strings : undefined;
}

/**
 * PHP diffusion_utils::get_ddo_map (:1252): the flat resolution chain of one
 * diffusion field node. Explicit properties->process->ddo_map wins ('self'
 * section_tipo/parent resolved to the section); otherwise auto-generated from
 * the field node's related components (ALL relation tipos —
 * ontology_node::get_relation_nodes simple mode), carrying the optional
 * node-level process->fn.
 */
function buildDdoMap(
	fieldProperties: Record<string, unknown> | null,
	relationTipos: string[],
	sectionTipo: string,
): DdoEntry[] {
	const process = fieldProperties?.process as Record<string, unknown> | undefined;
	const explicitMap = process?.ddo_map;

	if (Array.isArray(explicitMap)) {
		const entries: DdoEntry[] = [];
		for (const raw of explicitMap) {
			const ddo = raw as Record<string, unknown>;
			const tipo = typeof ddo.tipo === 'string' ? ddo.tipo : '';
			const declaredSection = typeof ddo.section_tipo === 'string' ? ddo.section_tipo : undefined;
			const declaredParent = typeof ddo.parent === 'string' ? ddo.parent : '';
			entries.push({
				tipo,
				sectionTipo: declaredSection === 'self' ? sectionTipo : declaredSection,
				parent: declaredParent === '' || declaredParent === 'self' ? sectionTipo : declaredParent,
				id: typeof ddo.id === 'string' ? ddo.id : undefined,
				fn: typeof ddo.fn === 'string' ? ddo.fn : undefined,
				lang: typeof ddo.lang === 'string' && ddo.lang !== '' ? ddo.lang : undefined,
				sectionFilter: stringArrayOf(ddo.section_filter),
				componentFilter: stringArrayOf(ddo.component_filter),
			});
		}
		return entries;
	}

	// Auto ddo_map from the node's related components, with the optional
	// node-level general fn (PHP :1286-1305).
	const nodeFn = typeof process?.fn === 'string' ? (process.fn as string) : undefined;
	return relationTipos.map((tipo) => ({
		tipo,
		sectionTipo,
		parent: sectionTipo,
		fn: nodeFn,
	}));
}

/** Accumulates errors/warnings during one element compile. */
interface CompileDiagnostics {
	errors: string[];
	warnings: string[];
}

/**
 * Compile one ddo chain into ResolveStep[]. Each entry becomes a 'component'
 * step (plain value read) or a 'relation-hop' step (the chain continues
 * through the component's locators) depending on whether the component model
 * stores relation locators (descriptor column === 'relation' — the TS twin of
 * the PHP relation family — plus the pseudo-model relation_list, which PHP
 * special-cases into the relation branch: chain_processor :161-162).
 * Chain topology: root entries have parent === sectionTipo (compiled with NO
 * `parent`); deeper entries hang under their parent ddo's tipo (compiled with
 * `parent` = that tipo), kept in ddo_map order — the resolver's recursive
 * walk (PHP resolve_chain) executes children against each linked record of
 * their parent hop.
 */
async function compileSourceChain(
	ddoMap: DdoEntry[],
	sectionTipo: string,
	fieldTipo: string,
	fieldLabel: string,
	diagnostics: CompileDiagnostics,
): Promise<ResolveStep[]> {
	const chain: ResolveStep[] = [];
	for (const ddo of ddoMap) {
		if (ddo.tipo === '') {
			diagnostics.errors.push(`field '${fieldTipo}' (${fieldLabel}): ddo_map entry without tipo`);
			continue;
		}
		const model = await getModelByTipo(ddo.tipo);
		if (model === null) {
			diagnostics.errors.push(
				`field '${fieldTipo}' (${fieldLabel}): ddo tipo '${ddo.tipo}' not found in the ontology`,
			);
			continue;
		}
		// Root entries carry parent === sectionTipo (buildDdoMap normalization);
		// only a ddo-tipo parent survives into the step (the resolver's tree key).
		const parent = ddo.parent !== '' && ddo.parent !== sectionTipo ? ddo.parent : undefined;
		const isRelationFamily =
			getComponentModel(model)?.column === 'relation' || model === 'relation_list';
		if (isRelationFamily) {
			const hop: Extract<ResolveStep, { kind: 'relation-hop' }> = {
				kind: 'relation-hop',
				tipo: ddo.tipo,
				model,
				// '' = dynamic: resolved at runtime from the parent hop's targets
				// (the chain processor derives it from the traversed locators).
				sectionTipo: ddo.sectionTipo ?? '',
			};
			if (parent !== undefined) hop.parent = parent;
			if (ddo.id !== undefined) hop.ddoId = ddo.id;
			if (ddo.sectionFilter !== undefined) hop.sectionFilter = ddo.sectionFilter;
			if (ddo.componentFilter !== undefined) hop.componentFilter = ddo.componentFilter;
			// add_parents (chain_processor :305): the hop emits each locator's own
			// ancestor chain — a compile-time flag, not a runtime fn.
			if (ddo.fn === 'add_parents') {
				hop.addParents = true;
			} else if (ddo.fn !== undefined) {
				// A custom fn on a relation hop is resolver-phase behavior we have
				// no slot for yet — surface it, never drop it silently.
				diagnostics.warnings.push(`relation-hop-fn:${ddo.fn}@${fieldTipo}`);
			}
			chain.push(hop);
		} else {
			const step: Extract<ResolveStep, { kind: 'component' }> = {
				kind: 'component',
				tipo: ddo.tipo,
				model,
				sectionTipo: ddo.sectionTipo ?? '',
			};
			if (parent !== undefined) step.parent = parent;
			if (ddo.fn !== undefined) step.fn = ddo.fn;
			if (ddo.id !== undefined) step.ddoId = ddo.id;
			if (ddo.lang !== undefined) step.pinLang = ddo.lang;
			chain.push(step);
		}
	}
	return chain;
}

/**
 * Split the field's parser array (spec §5): runtime steps survive in order,
 * rewriters are absorbed (warning until the resolver lands their rewrites),
 * unknown fns are compile ERRORS naming the field.
 */
function compileTransform(
	fieldProperties: Record<string, unknown> | null,
	classify: ParserClassifier,
	fieldTipo: string,
	fieldLabel: string,
	diagnostics: CompileDiagnostics,
): ParserStepConfig[] {
	const process = fieldProperties?.process as Record<string, unknown> | undefined;
	const rawParser = process?.parser;
	if (rawParser === undefined || rawParser === null) return [];
	// PHP validate normalizes a single parser object to a one-item array (:531).
	const parserSteps = Array.isArray(rawParser) ? rawParser : [rawParser];

	const transform: ParserStepConfig[] = [];
	for (const raw of parserSteps) {
		const step = raw as Record<string, unknown>;
		const fn = typeof step?.fn === 'string' ? (step.fn as string) : '';
		if (fn === '') {
			diagnostics.errors.push(
				`field '${fieldTipo}' (${fieldLabel}): parser step without a 'class::method' fn`,
			);
			continue;
		}
		switch (classify(fn)) {
			case 'runtime':
				transform.push({
					fn,
					id: typeof step.id === 'string' ? (step.id as string) : undefined,
					options: (step.options as Record<string, unknown> | undefined) ?? {},
				});
				break;
			case 'rewriter':
				// Absorbed into plan structure by the resolver phase; until then the
				// absorption itself must stay visible (spec §5 — nothing silent).
				diagnostics.warnings.push(`rewriter:${fn}@${fieldTipo}`);
				break;
			default:
				diagnostics.errors.push(
					`field '${fieldTipo}' (${fieldLabel}): unknown parser fn '${fn}' — not in the parser registry (fix the ontology or register the parser)`,
				);
		}
	}
	return transform;
}

/**
 * Compile one field node of a table (build_datum_context :1263 re-expressed
 * as a plan concept). Returns null only on hard failures already recorded in
 * diagnostics.
 */
async function compileFieldPlan(
	tree: VirtualDiffusionTree,
	fieldTipo: string,
	sectionTipo: string,
	sqlTarget: boolean,
	classify: ParserClassifier,
	diagnostics: CompileDiagnostics,
): Promise<FieldPlan | null> {
	const node = await tree.index.nodeOf(fieldTipo);
	if (node === null) {
		diagnostics.errors.push(`field '${fieldTipo}': node not found in the ontology`);
		return null;
	}
	const label = termLabelOf(node) ?? '';
	const properties = node.properties;
	const process = properties?.process as Record<string, unknown> | undefined;

	// exclude_column (:1275): participates in resolution/publication logic but
	// emits NO output column — so its name is exempt from the SQL chokepoint.
	const excludeColumn = Boolean(properties?.exclude_column);

	// Column name = the field node's structure-lang term (:1288). SQL targets
	// go through the identifier chokepoint; file targets keep the verbatim
	// label (XML/RDF names like 'skos:prefLabel' are not SQL identifiers).
	let columnName = label;
	if (sqlTarget && !excludeColumn) {
		try {
			columnName = requireSqlIdentifier(label, 'column');
		} catch (error) {
			diagnostics.errors.push(`field '${fieldTipo}': ${(error as Error).message}`);
			return null;
		}
	}

	const ddoMap = buildDdoMap(properties, await tree.index.relationTipos(fieldTipo), sectionTipo);
	const sourceChain = await compileSourceChain(ddoMap, sectionTipo, fieldTipo, label, diagnostics);
	const transform = compileTransform(properties, classify, fieldTipo, label, diagnostics);

	// Emit policies (build_datum_context :1354-1364 + process_datum :1170).
	const policy: FieldPolicy = {};
	if (process?.empty_to_string !== undefined)
		policy.emptyToString = Boolean(process.empty_to_string);
	if (process?.default_value !== undefined) policy.defaultValue = String(process.default_value);
	if (process?.empty_value !== undefined) policy.emptyValue = String(process.empty_value);
	if (process?.preserve_order === true) policy.preserveOrder = true;

	// SQL schema hints (:1342-1352). 'varchar' and 'length' both size the
	// column in the old sql_generator; varchar wins when both are present.
	const column: ColumnDef = { fieldModel: node.model };
	const varcharLength = properties?.varchar ?? properties?.length;
	if (typeof varcharLength === 'number') column.varcharLength = varcharLength;
	if (properties?.index !== undefined) column.index = properties.index;

	// output_format two-stage resolution (build_datum_context :1311-1338).
	// Stage 1: explicit properties->process->output_format. Stage 2: the
	// component class's $diffusion_output_format static map keyed by the FIRST
	// ddo's model — component_relation_common subclasses declare 'json'
	// (component_relation_common.php :146, descriptor column === 'relation');
	// everything else inherits component_common's 'string' (:255), which is
	// the resolver's default stringification, so only 'json' is materialized.
	// (relation_list extends `common`, which carries no map — no fallback.)
	let outputFormat: string | undefined;
	if (typeof process?.output_format === 'string') {
		outputFormat = process.output_format;
	} else {
		const firstStep = sourceChain[0];
		const firstModel =
			firstStep === undefined || firstStep.kind === 'system' ? null : firstStep.model;
		if (firstModel !== null && getComponentModel(firstModel)?.column === 'relation') {
			outputFormat = 'json';
		}
	}

	const fieldPlan: FieldPlan = {
		id: fieldTipo,
		columnName,
		sourceChain,
		transform,
		column,
		policy,
	};
	if (outputFormat !== undefined) fieldPlan.outputFormat = outputFormat;
	if (excludeColumn) fieldPlan.excludeColumn = true;
	return fieldPlan;
}

/** Compile one publishable section (a table / owl:Class virtual node). */
async function compileSectionPlan(
	tree: VirtualDiffusionTree,
	tableNode: VirtualTreeNode,
	sectionTipo: string,
	sqlTarget: boolean,
	classify: ParserClassifier,
	diagnostics: CompileDiagnostics,
): Promise<SectionPlan | null> {
	const label = tableNode.label ?? '';
	let tableName = label;
	if (sqlTarget) {
		try {
			tableName = requireSqlIdentifier(label, 'table');
		} catch (error) {
			diagnostics.errors.push(
				`section '${sectionTipo}' (table node '${tableNode.tipo}'): ${(error as Error).message}`,
			);
			return null;
		}
	} else if (label === '') {
		diagnostics.errors.push(
			`section '${sectionTipo}' (table node '${tableNode.tipo}'): empty table label`,
		);
		return null;
	}

	// global_table_maps (dd_diffusion_api :1042-1060): v6 secondary
	// aggregate-table write. Becomes a plan lookup table in the writer phase;
	// until then its presence must stay visible.
	if (tableNode.properties?.global_table_maps !== undefined) {
		diagnostics.warnings.push(`global_table_maps:${tableNode.tipo}`);
	}

	const fields: FieldPlan[] = [];
	for (const fieldTipo of tableNode.childrenTipos) {
		const fieldPlan = await compileFieldPlan(
			tree,
			fieldTipo,
			sectionTipo,
			sqlTarget,
			classify,
			diagnostics,
		);
		if (fieldPlan !== null) fields.push(fieldPlan);
	}

	return {
		sectionTipo,
		tableName,
		tableTipo: tableNode.tipo,
		fields,
	};
}

/**
 * Language policy: an explicit DEDALO_DIFFUSION_LANGS (comma-separated, same
 * parsing as area_maintenance/widgets/publication_api.ts) wins. When unset we mirror the PHP
 * config CATALOG, where DEDALO_DIFFUSION_LANGS is a DERIVED key defaulting to
 * DEDALO_PROJECTS_DEFAULT_LANGS (core/base/config/catalog/domains/lang.php:94)
 * — so the constant is effectively ALWAYS defined and build_langs never hits
 * its own [DEDALO_DATA_LANG] fallback. Collapsing to the single data language
 * here (the previous behavior) published only one lang; deriving from the
 * project langs publishes the full set the oracle does. The single-lang path
 * remains only as a last resort if no project langs are configured. mainLang =
 * first entry (this install's DEDALO_DATA_LANG_DEFAULT === the first lang).
 */
function buildLangPolicy(): { langs: string[]; mainLang: string | null } {
	const raw = readEnv('DEDALO_DIFFUSION_LANGS');
	let langs =
		raw !== undefined && raw !== ''
			? raw
					.split(',')
					.map((lang) => lang.trim())
					.filter(Boolean)
			: [...config.menu.projectsDefaultLangs];
	if (langs.length === 0) langs = [config.menu.dataLang];
	return { langs, mainLang: langs[0] ?? null };
}

/**
 * Compile the PublicationPlan of one diffusion element. Throws
 * PlanCompileError carrying EVERY violation (unknown format, unresolvable
 * database, invalid identifiers, unknown parser fns, broken ddo tipos...) —
 * spec §5: loud, never silent. Use validateElementPlan for the non-throwing
 * report shape.
 */
export async function compileElementPlan(
	elementTipo: string,
	options: CompileOptions = {},
): Promise<PublicationPlan> {
	const classify = options.classifyParserFn ?? (await defaultClassifier());
	const tree = options.tree ?? (await buildVirtualDiffusionTree());
	if (tree === null) {
		throw new PlanCompileError(
			elementTipo,
			[
				'no diffusion domain available — DEDALO_DIFFUSION_DOMAIN is unset or matches no dd1190 domain node',
			],
			[],
		);
	}

	const diagnostics: CompileDiagnostics = { errors: [], warnings: [] };

	// The element as it appears VIRTUALLY (alias tipo kept, alias contract on
	// properties applied by the tree walk).
	const elementNode = tree.nodes.find((node) => node.tipo === elementTipo) ?? null;
	if (elementNode === null || !elementNode.model.startsWith('diffusion_element')) {
		throw new PlanCompileError(
			elementTipo,
			[
				`'${elementTipo}' is not a diffusion element of domain '${tree.domainName}' ` +
					`(model: ${elementNode?.model ?? 'not in the virtual tree'})`,
			],
			[],
		);
	}

	// Format + service name from properties->diffusion (validate :482-510).
	const diffusionProperties = elementNode.properties?.diffusion as
		| { type?: string; service_name?: string }
		| undefined;
	const format = diffusionProperties?.type ?? '';
	if (!KNOWN_FORMATS.has(format)) {
		diagnostics.errors.push(
			`missing or unknown properties->diffusion->type '${format}' ` +
				`(expected one of: ${[...KNOWN_FORMATS].join(', ')})`,
		);
	}
	const serviceName = diffusionProperties?.service_name ?? null;
	const sqlTarget = TABLE_FORMATS.has(format);

	// Target address: MariaDB database for sql/socrata (identifier chokepoint),
	// service-named file area for rdf/xml/markdown.
	let target: TargetAddress | null = null;
	if (sqlTarget) {
		const databaseLabel = getDatabaseNameForElement(tree, elementTipo);
		if (databaseLabel === null || databaseLabel === '') {
			diagnostics.errors.push(
				'unable to resolve database name (define a database or database_alias child)',
			);
		} else {
			try {
				target = { kind: 'table', database: requireSqlIdentifier(databaseLabel, 'database') };
			} catch (error) {
				diagnostics.errors.push((error as Error).message);
			}
		}
	} else if (KNOWN_FORMATS.has(format)) {
		if (serviceName === null || serviceName === '') {
			diagnostics.errors.push(
				`missing properties->diffusion->service_name (required for ${format} file paths)`,
			);
		} else {
			target = { kind: 'files', serviceName };
		}
	}

	// Every section reachable under the element → SectionPlan.
	const sectionTipos = getSectionsForElement(tree, elementTipo);
	if (sectionTipos.length === 0) {
		diagnostics.errors.push(
			'no sections targeted by this element (check table/owl:Class section relations)',
		);
	}
	const sections: SectionPlan[] = [];
	for (const sectionTipo of sectionTipos) {
		const tableNode = getSectionNodeForElement(tree, elementTipo, sectionTipo);
		if (tableNode === null) {
			diagnostics.errors.push(`section '${sectionTipo}': no table node under the element`);
			continue;
		}
		const sectionPlan = await compileSectionPlan(
			tree,
			tableNode,
			sectionTipo,
			sqlTarget,
			classify,
			diagnostics,
		);
		if (sectionPlan !== null) sections.push(sectionPlan);
	}

	if (diagnostics.errors.length > 0 || target === null) {
		if (target === null && diagnostics.errors.length === 0) {
			diagnostics.errors.push('unable to resolve a publication target');
		}
		throw new PlanCompileError(elementTipo, diagnostics.errors, diagnostics.warnings);
	}

	const resolveLevelsRaw = readEnv('DEDALO_DIFFUSION_RESOLVE_LEVELS');
	const maxLevels =
		resolveLevelsRaw !== undefined &&
		resolveLevelsRaw !== '' &&
		!Number.isNaN(Number(resolveLevelsRaw))
			? Number(resolveLevelsRaw)
			: 2; // PHP diffusion_utils::get_resolve_levels default (:563)

	return {
		planId: `${elementTipo}:r${currentOntologyRevision()}`,
		elementTipo,
		format,
		serviceName,
		target,
		sections,
		recursion: { maxLevels },
		langPolicy: buildLangPolicy(),
		warnings: diagnostics.warnings,
	};
}

/** Non-throwing validate-shape result (dispatch `validate` action input). */
export interface PlanValidationResult {
	result: PublicationPlan | null;
	errors: string[];
	warnings: string[];
}

/**
 * Compile wrapped for the `validate` action: violations come back as data
 * instead of an exception, warnings are reported in both outcomes.
 */
export async function validateElementPlan(
	elementTipo: string,
	options: CompileOptions = {},
): Promise<PlanValidationResult> {
	try {
		const plan = await compileElementPlan(elementTipo, options);
		return { result: plan, errors: [], warnings: plan.warnings };
	} catch (error) {
		if (error instanceof PlanCompileError) {
			return { result: null, errors: error.compileErrors, warnings: error.compileWarnings };
		}
		return { result: null, errors: [String(error)], warnings: [] };
	}
}
