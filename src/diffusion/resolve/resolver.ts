/**
 * The diffusion RESOLVER — plan × records → RecordIR + ProjectedRows
 * (DIFFUSION_SPEC §4.1 stages C-F, DIFFUSION_PLAN D3-P1).
 *
 * resolvePublication() is an ASYNC GENERATOR yielding one ResolvedBatch per
 * keyset batch: primary records first, then the breadth-first relation
 * frontier drained level by level. It is the native successor of the PHP
 * chain walk + old-engine processor pair; oracle anchors:
 *
 * - publication gate: diffusion_utils::is_publishable (:66-126 — section's
 *   component_publication locator must be dd64/yes; NO component ⇒ always
 *   publishable), resolution priority ontology `is_publishable` → inherited
 *   `publishable_overrides` → live check (dd_diffusion_api::process_datum
 *   :1063-1120), fail-closed: any gate error ⇒ 'unpublish';
 * - chain walk: diffusion_chain_processor::resolve_chain/resolve_ddo_value —
 *   component steps read the stored slice of the records in scope, relation
 *   hops read locators, load their targets (ONE IN query per target section)
 *   and expose them to later steps;
 * - breadth-first frontier: dd_diffusion_api::$datum_unresolved (:270-307) —
 *   linked records of sections WITH a SectionPlan are queued at level-1 while
 *   level > 0, drained FIFO after the primaries, deduped per run by
 *   section_tipo:section_id (the PHP is_used bitmask);
 * - unpublishable-locator value skip: chain_processor :282-314 (structural
 *   parent/children/index hops and value-source select/portal chains keep
 *   their locators, everything else drops them from VALUES — queueing for
 *   deletion is unaffected);
 * - transform+projection: transform.ts (stage E) + project/lang_ladder.ts
 *   (stage F) — nothing here reimplements either.
 *
 * REWRITER RECOVERY (transitional, report-worthy): the P1 plan compiler
 * absorbs rewriter parser steps as 'rewriter:<fn>@<field>' warnings WITHOUT
 * their options. For exactly those fields this module re-reads the field
 * node's properties->process->parser through the SAME virtual-tree index the
 * compiler used, so rewriters run with their REAL ontology options and in
 * their original chain position. Once plan/compile.ts promotes rewriter
 * configs into FieldPlan, this recovery pass deletes.
 *
 * All mutable run state lives in the per-call RunContext — no module state
 * (REWRITE_SPEC §4 / DIFFUSION_SPEC §2.7).
 */

import type { Sqo } from '../../core/concepts/sqo.ts';
import type { MatrixRecord } from '../../core/db/matrix.ts';
import { sql } from '../../core/db/postgres.ts';
import {
	findFirstDescendantTipoByModel,
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getNode,
} from '../../core/ontology/resolver.ts';
import { getSectionMapValue } from '../../core/ontology/section_map.ts';
import { getChildren } from '../../core/relations/children.ts';
import { resolveIndexConfig } from '../../core/relations/models/relation_index.ts';
import { getParents, getParentsRecursive } from '../../core/relations/parent.ts';
import { readComponentItems } from '../../core/resolve/component_data.ts';
import { parseInverseEntry } from '../../core/resolve/relation_index.ts';
import {
	findInverseReferenceLocators,
	findInverseReferences,
} from '../../core/search/search_related.ts';
import type { Principal } from '../../core/security/permissions.ts';
import { getTermByLocator, getTermDataByLocator } from '../../core/ts_object/term_resolver.ts';
import type { MetaValueIR, ParserContext, ValueMeta } from '../parsers/types.ts';
import type {
	FieldPlan,
	ParserStepConfig,
	PublicationPlan,
	ResolveStep,
	SectionPlan,
} from '../plan/types.ts';
import type { VirtualDiffusionTree } from '../plan/virtual_tree.ts';
import { buildVirtualDiffusionTree } from '../plan/virtual_tree.ts';
import type {
	ColumnLangValues,
	FieldProjectionPolicy,
	ProjectedRow,
} from '../project/lang_ladder.ts';
import { NOLAN_KEY, projectRecordRows } from '../project/lang_ladder.ts';
import type { IconographyOptions } from './ddo_fns.ts';
import {
	buildGeojsonLayers,
	iconographyOptionsOf,
	joinIconographyScenes,
	parseTagValueToHtml,
} from './ddo_fns.ts';
import { defaultPublicationValue } from './default_value.ts';
import type { FieldIR, RecordIR, ResolvedLink } from './record_ir.ts';
import type { RewriterEnv } from './rewriters.ts';
import { buildRewriterFns } from './rewriters.ts';
import { readMatrixRecords, selectRecordBatches } from './selection.ts';
import type { ExtraStepFn, FieldTransformSpec, MergeColumnRef } from './transform.ts';
import { fieldValuesToColumn } from './transform.ts';

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/** One collected per-field failure (never a silent wrong value). */
export interface FieldResolutionError {
	sectionTipo: string;
	sectionId: number | string;
	fieldId: string;
	columnName: string;
	message: string;
}

/** One yielded unit of work — writers consume rows/records sequentially. */
export interface ResolvedBatch {
	section: SectionPlan;
	/** Frontier level: maxLevels for primaries, decreasing for linked batches. */
	level: number;
	records: RecordIR[];
	rows: ProjectedRow[];
	/** Records whose gate said 'unpublish' — writers remove their artifacts. */
	unpublishIds: (number | string)[];
	/**
	 * Durable checkpoint: the highest PRIMARY section_id fully processed.
	 * Frontier batches repeat the final primary cursor (they are derived work;
	 * resuming from the cursor re-derives the remaining frontier).
	 */
	cursor: number;
	errors: FieldResolutionError[];
}

export interface ResolveOptions {
	/** The primary section to publish (must have a SectionPlan). */
	sectionTipo: string;
	/**
	 * Run-scoped publish timestamp, epoch SECONDS (parser_global::
	 * publication_unix_timestamp). Captured ONCE per run by the caller and
	 * reused on resume — determinism, never Date.now() per record.
	 */
	runStartedAt: number;
	/** Record selection (sanitized SQO). Default: every record of the section. */
	sqo?: Sqo;
	/** Keyset batch size (DEDALO_DIFFUSION_BATCH_RECORDS default 500). */
	batchSize?: number;
	/** Resume cursor: only primaries with section_id > this are selected. */
	afterSectionId?: number;
	/** PHP skip_publication_state_check: bypass the gate (everything publishes). */
	skipPublicationStateCheck?: boolean;
	/** Override plan.recursion.maxLevels (tests, CLI). */
	maxLevels?: number;
	/** Reuse an already-built virtual tree for the rewriter recovery pass. */
	tree?: VirtualDiffusionTree;
	/**
	 * The enqueuing principal (DIFF-01). When a non-admin, the primary selection
	 * applies their per-record projects filter so a section-wide diffuse publishes
	 * only their in-scope records. Omitted / global-admin ⇒ unscoped selection.
	 */
	principal?: Principal;
}

// ---------------------------------------------------------------------------
// Run context — ALL mutable state of one resolvePublication call.
// ---------------------------------------------------------------------------

/** One field, compiled for execution (plan + recovered rewriter chain). */
interface PreparedField {
	field: FieldPlan;
	/** Effective transform chain (recovered full chain when rewriters exist). */
	steps: ParserStepConfig[];
	/**
	 * The ddo tree of the source chain: parent key ('' = root, else a hop
	 * step's tipo) → child steps in ddo_map order. The runtime twin of PHP
	 * resolve_chain's `$item->parent === $parent` filter.
	 */
	childrenByParent: Map<string, ResolveStep[]>;
	/** Leaf source columns (PHP build_datum_context 'columns' :1247-1308). */
	mergeColumns: MergeColumnRef[];
	/** parser_global::publication_unix_timestamp — data-independent constant. */
	isTimestampField: boolean;
	/** parser_global::merge_columns — deferred record-level synthetic value. */
	mergeColumnsOptions: Record<string, unknown> | null;
	/** Hop needs ancestor chains (ddo add_parents or a parents parser step). */
	needsAncestors: boolean;
	/** Terminal hop resolves to SECTION LABELS (map_locator_to_section_label). */
	hopEmitsSectionLabels: boolean;
	/** Hop runs get_diffusion_iconography (portal→scene→terms composite). */
	iconography: IconographyOptions | null;
	/** Unported per-hop component fns (relation-hop-fn warnings) — fail loud. */
	unsupportedHopFns: string[];
}

interface RunContext {
	plan: PublicationPlan;
	options: Required<Pick<ResolveOptions, 'sectionTipo' | 'runStartedAt'>> & ResolveOptions;
	parserCtx: ParserContext;
	maxLevels: number;
	batchSize: number;
	rewriterFns: ReadonlyMap<string, ExtraStepFn>;
	sectionPlans: Map<string, SectionPlan>;
	/** section_tipo → published table name (map_section_tipo_to_name lookup). */
	planTables: Map<string, string>;
	/** section_tipo → ontology is_publishable override (table-node property). */
	sectionPublishableOverride: Map<string, boolean | null>;
	preparedFields: Map<string, PreparedField>;
	/** section_tipo → matrix table name. */
	tableCache: Map<string, string | null>;
	/** section_tipo → component_publication tipo (null = none, always publishable). */
	publicationTipoCache: Map<string, string | null>;
	/** section_tipo → component_relation_parent tipo (ancestor walking). */
	parentTipoCache: Map<string, string | null>;
	/** `${section_tipo}:${section_id}` → loaded record (bounded, see loadRecords). */
	recordCache: Map<string, MatrixRecord | null>;
	/** `${section_tipo}:${section_id}` → per-lang term record (parents chains). */
	termCache: Map<string, Record<string, string | null> | undefined>;
	/** `${section_tipo}:${section_id}` → ancestor chain (memoized, cycle-safe). */
	ancestorCache: Map<string, ResolvedLink[]>;
	/** `${record}|${section_filter}|${component_filter}` → inverse-ref locators
	 * (relation_list::get_data — every mint/type column of one coin repeats
	 * the SAME related-mode query, so this cache is load-bearing). */
	relationListCache: Map<string, StoredLocator[]>;
	/** `${hop_tipo}|${owner_section_tipo}` → resolved inverse-question config
	 * (relation type + target sections). resolveIndexConfig rebuilds the FULL
	 * request_config per call when the component declares one (uncached,
	 * ontology-query heavy) — one resolution per (component, section) per run
	 * is the correct cost; the ontology is immutable for the run's duration. */
	relationIndexConfigCache: Map<string, Awaited<ReturnType<typeof resolveIndexConfig>>>;
	/** `${record}|${hop_tipo}|${relation_type}|${target_sections}` → computed
	 * inverse-index locators (relation_index hops — see relationIndexLocators).
	 * Keyed per hop tipo AND resolved filters: unlike relation_list, the query
	 * depends on the component (a section can carry several index components
	 * with different relation types / target scopes). */
	relationIndexCache: Map<string, StoredLocator[]>;
	/** `${record}|${hop_tipo}` → computed child locators (relation_children
	 * hops — see relationChildrenLocators). Load-bearing, not cosmetic:
	 * getChildren sibling-orders IN PROCESS (one record read per child) when
	 * the section_map declares a thesaurus order. */
	relationChildrenCache: Map<string, StoredLocator[]>;
	/** section_tipo → section_map thesaurus 'model' element tipo (typology). */
	typologyElementCache: Map<string, { tipo: string; model: string } | null>;
	/** section_tipo → dd_ontology term translations (section-label hop fn). */
	sectionLabelCache: Map<string, Record<string, string> | null>;
	/** text_area tipo → PAIRED component_geolocation tipo (get_geojson_data). */
	geoPairCache: Map<string, string | null>;
	/** PHP is_used bitmask twin: records already emitted top-level this run. */
	usedRecords: Set<string>;
	/** PHP dd_diffusion_api::$publishable_overrides — inherited gate results. */
	publishableOverrides: Map<string, boolean>;
	/** PHP $datum_unresolved: `${level}:${section_tipo}` → queued ids (FIFO). */
	frontier: Map<string, Set<number | string>>;
}

/** Bound above which the record cache is dropped whole (O(1) eviction). */
const RECORD_CACHE_LIMIT = 8000;

const RECORD_KEY = (sectionTipo: string, sectionId: number | string): string =>
	`${sectionTipo}:${sectionId}`;

// ---------------------------------------------------------------------------
// Ontology lookups (cached per run; per-run maps, not module state)
// ---------------------------------------------------------------------------

/**
 * First descendant component of `model` inside a section subtree — PHP
 * section::get_ar_children_tipo_by_model_name_in_section. The bounded subtree
 * walk is the canonical accessor (S2-19/T3: findFirstDescendantTipoByModel,
 * strict own-subtree mode); the virtual-section fallback stays LOCAL because
 * this module's semantics are stricter than the accessor default: chained
 * virtual sections resolve up to 3 hops and every hop validates that both the
 * virtual node and its relations[0].tipo target are model 'section'.
 */
async function findSectionComponentByModel(
	sectionTipo: string,
	model: string,
	depth = 0,
): Promise<string | null> {
	const found = await findFirstDescendantTipoByModel(sectionTipo, model, {
		virtualFallback: false,
	});
	if (found !== null) return found;
	if (depth >= 3) return null;

	// Virtual-section fallback (mirrors core node_find.ts / matrix-table walk).
	const node = await getNode(sectionTipo);
	const relations = node?.relations;
	const realTipo = Array.isArray(relations)
		? (relations[0] as { tipo?: unknown } | undefined)?.tipo
		: undefined;
	if (node?.model !== 'section' || typeof realTipo !== 'string' || realTipo === sectionTipo) {
		return null;
	}
	if ((await getNode(realTipo))?.model !== 'section') return null;
	return findSectionComponentByModel(realTipo, model, depth + 1);
}

async function publicationTipoOf(ctx: RunContext, sectionTipo: string): Promise<string | null> {
	const cached = ctx.publicationTipoCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	const tipo = await findSectionComponentByModel(sectionTipo, 'component_publication');
	ctx.publicationTipoCache.set(sectionTipo, tipo);
	return tipo;
}

async function _parentTipoOf(ctx: RunContext, sectionTipo: string): Promise<string | null> {
	const cached = ctx.parentTipoCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	const tipo = await findSectionComponentByModel(sectionTipo, 'component_relation_parent');
	ctx.parentTipoCache.set(sectionTipo, tipo);
	return tipo;
}

/**
 * The record-loading slice of RunContext — the structural subset the P6
 * export atom run (resolveRecordAtoms below) shares with the publication run:
 * same caches, same batched reader, ONE loading machinery for both entry
 * points.
 */
interface RecordLoadContext {
	tableCache: Map<string, string | null>;
	recordCache: Map<string, MatrixRecord | null>;
}

async function matrixTableOf(ctx: RecordLoadContext, sectionTipo: string): Promise<string | null> {
	const cached = ctx.tableCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	const table = await getMatrixTableFromTipo(sectionTipo);
	ctx.tableCache.set(sectionTipo, table);
	return table;
}

// ---------------------------------------------------------------------------
// Record loading (batched + memoized)
// ---------------------------------------------------------------------------

/** Load records of ONE section by ids — one IN query for the cache misses. */
async function loadRecords(
	ctx: RunContext,
	sectionTipo: string,
	sectionIds: (number | string)[],
): Promise<Map<string, MatrixRecord | null>> {
	const out = new Map<string, MatrixRecord | null>();
	const missing: number[] = [];
	for (const id of sectionIds) {
		const key = RECORD_KEY(sectionTipo, id);
		if (ctx.recordCache.has(key)) {
			out.set(key, ctx.recordCache.get(key) ?? null);
		} else {
			const numeric = Number(id);
			if (Number.isInteger(numeric)) missing.push(numeric);
			else out.set(key, null);
		}
	}
	if (missing.length > 0) {
		const table = await matrixTableOf(ctx, sectionTipo);
		if (ctx.recordCache.size > RECORD_CACHE_LIMIT) ctx.recordCache.clear();
		if (table === null) {
			for (const id of missing) {
				const key = RECORD_KEY(sectionTipo, id);
				ctx.recordCache.set(key, null);
				out.set(key, null);
			}
		} else {
			const loaded = await readMatrixRecords(table, sectionTipo, missing);
			const byId = new Map(loaded.map((record) => [Number(record.section_id), record]));
			for (const id of missing) {
				const key = RECORD_KEY(sectionTipo, id);
				const record = byId.get(id) ?? null;
				ctx.recordCache.set(key, record);
				out.set(key, record);
			}
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// Publication gate (fail-closed)
// ---------------------------------------------------------------------------

/** PHP DEDALO_SECTION_SI_NO_TIPO / NUMERICAL_MATRIX_VALUE_YES (dd_tipos.php:83). */
const SI_NO_SECTION_TIPO = 'dd64';
const MATRIX_VALUE_YES = 1;

/**
 * Live gate on a LOADED record (diffusion_utils::get_component_publication_
 * bool_value :105-126): publishable ⇔ first publication locator is dd64/yes.
 * Sections without a component_publication are always publishable (:80-84).
 */
async function isRecordPublishable(ctx: RunContext, record: MatrixRecord): Promise<boolean> {
	const publicationTipo = await publicationTipoOf(ctx, record.section_tipo);
	if (publicationTipo === null) return true;
	// RAW stored locators: section_id stays union-typed (unswept string form /
	// external remote id) — WC-2026-08-10-section-id-int-canonical.
	const items =
		(readComponentItems(record, publicationTipo, 'component_publication') as
			| { section_tipo?: string; section_id?: number | string }[]
			| null) ?? [];
	const first = items[0];
	return (
		first !== undefined &&
		first.section_tipo === SI_NO_SECTION_TIPO &&
		Number(first.section_id) === MATRIX_VALUE_YES
	);
}

/** The full gate priority chain (process_datum :1063-1120), fail-closed. */
async function resolveGate(
	ctx: RunContext,
	record: MatrixRecord,
): Promise<'publish' | 'unpublish'> {
	if (ctx.options.skipPublicationStateCheck === true) return 'publish';
	try {
		const override = ctx.sectionPublishableOverride.get(record.section_tipo);
		if (override === true) return 'publish';
		if (override === false) return 'unpublish';
		const inherited = ctx.publishableOverrides.get(
			RECORD_KEY(record.section_tipo, record.section_id),
		);
		if (inherited !== undefined) return inherited ? 'publish' : 'unpublish';
		return (await isRecordPublishable(ctx, record)) ? 'publish' : 'unpublish';
	} catch {
		// Fail-closed (spec §8.5): a gate resolution error NEVER publishes.
		return 'unpublish';
	}
}

// ---------------------------------------------------------------------------
// Terms + ancestors (parents rewriter inputs)
// ---------------------------------------------------------------------------

/** Per-lang term record of a thesaurus node, memoized per run. */
async function termRecordOf(
	ctx: RunContext,
	sectionTipo: string,
	sectionId: number | string,
): Promise<Record<string, string | null> | undefined> {
	const key = RECORD_KEY(sectionTipo, sectionId);
	if (ctx.termCache.has(key)) return ctx.termCache.get(key);
	let term: Record<string, string | null> | undefined;
	const items = await getTermDataByLocator(
		{ section_tipo: sectionTipo, section_id: sectionId },
		'thesaurus',
	);
	if (items !== null && items.length > 0) {
		// Group per lang, join multi-values with ', ' (oracle parents :522-527).
		const byLang = new Map<string, string[]>();
		for (const item of items) {
			if (typeof item.value !== 'string' || item.value === '') continue;
			const lang = item.lang ?? 'lg-nolan';
			const bucket = byLang.get(lang);
			if (bucket === undefined) byLang.set(lang, [item.value]);
			else bucket.push(item.value);
		}
		if (byLang.size > 0) {
			term = {};
			for (const [lang, values] of byLang) term[lang] = values.join(', ');
		}
	}
	ctx.termCache.set(key, term);
	return term;
}

/**
 * The node's typology term id — PHP resolve_map_node_data (:2245-2270): the
 * section_map thesaurus 'model' element (a component_select on the term
 * record) is read and its FIRST stored locator identifies the typology node;
 * "{section_tipo}_{section_id}" of that locator is what the parents
 * rewriter's parent_end_by_typology_term_id truncation compares against.
 */
async function typologyTermIdOf(
	ctx: RunContext,
	sectionTipo: string,
	sectionId: number | string,
): Promise<string | null> {
	let element = ctx.typologyElementCache.get(sectionTipo);
	if (element === undefined) {
		element = null;
		const raw = await getSectionMapValue(sectionTipo, 'thesaurus', 'model');
		const tipo = Array.isArray(raw) ? raw[0] : raw;
		if (typeof tipo === 'string' && tipo !== '') {
			const model = await getModelByTipo(tipo);
			if (model !== null) element = { tipo, model };
		}
		ctx.typologyElementCache.set(sectionTipo, element);
	}
	if (element === null) return null;
	const loaded = await loadRecords(ctx, sectionTipo, [sectionId]);
	const record = loaded.get(RECORD_KEY(sectionTipo, sectionId)) ?? null;
	if (record === null) return null;
	const items = (readComponentItems(record, element.tipo, element.model) ?? []) as StoredLocator[];
	const first = items.find(
		(locator) =>
			locator !== null &&
			typeof locator === 'object' &&
			typeof locator.section_tipo === 'string' &&
			locator.section_id !== undefined &&
			locator.section_id !== null,
	);
	return first === undefined ? null : `${first.section_tipo}_${first.section_id}`;
}

/**
 * [self, parent, grandparent, …, root] with prefetched terms — the TS twin of
 * component_relation_common::add_parents (component_relation_common.php
 * :2124-2202): self node first, then component_relation_parent::
 * get_parents_recursive's unique-ancestor DFS (src/core/relations/parent.ts —
 * the SAME engine the tree uses; diamond-safe, cycle-recording). Memoized per
 * run: thesaurus targets repeat thousands of times per publication.
 */
async function ancestorChainOf(ctx: RunContext, link: ResolvedLink): Promise<ResolvedLink[]> {
	const selfKey = RECORD_KEY(link.sectionTipo, link.sectionId);
	const cached = ctx.ancestorCache.get(selfKey);
	if (cached !== undefined) return cached;

	const nodeOf = async (sectionTipo: string, sectionId: number | string): Promise<ResolvedLink> => {
		const node: ResolvedLink = { sectionTipo, sectionId };
		const term = await termRecordOf(ctx, sectionTipo, sectionId);
		if (term !== undefined) node.term = term;
		node.typologyTermId = await typologyTermIdOf(ctx, sectionTipo, sectionId);
		return node;
	};

	const chain: ResolvedLink[] = [await nodeOf(link.sectionTipo, link.sectionId)];
	const { ancestors } = await getParentsRecursive(link.sectionId, link.sectionTipo);
	for (const ancestor of ancestors) {
		if (typeof ancestor.section_tipo !== 'string' || ancestor.section_id === undefined) continue;
		chain.push(await nodeOf(ancestor.section_tipo, ancestor.section_id));
	}
	ctx.ancestorCache.set(selfKey, chain);
	return chain;
}

// ---------------------------------------------------------------------------
// Custom ddo fns (PHP fn dispatch, component_common :3274-3326)
// ---------------------------------------------------------------------------

/**
 * get_diffusion_data_info (PHP common::get_diffusion_data_info :777-788):
 * the element's identity object wrapped under handle 'a'. Downstream parsers
 * (get_section_tipo / get_term_id) read the locator half, so a one-link chain
 * atom on the CURRENT record is the exact equivalent.
 */
function infoAtomOf(record: MatrixRecord, componentTipo: string): MetaValueIR {
	return {
		kind: 'chain',
		links: [{ sectionTipo: record.section_tipo, sectionId: record.section_id }],
		lang: null,
		meta: { sourceId: 'a', tipo: componentTipo },
	};
}

/**
 * map_parent_to_norder (PHP diffusion_fn :197-258): the record's 0-based
 * position among its parent's ORDERED children (v6 norder column). Uses the
 * shared relations engine (getParents/getChildren) — the same sibling-order
 * pipeline the thesaurus tree renders with. No parent / not found → 0.
 */
async function mapParentToNorder(record: MatrixRecord): Promise<number> {
	const parents = await getParents(record.section_id, record.section_tipo);
	const parent = parents.find(
		(locator) =>
			typeof locator?.section_tipo === 'string' &&
			locator.section_id !== undefined &&
			locator.section_id !== null,
	);
	if (parent === undefined) return 0;
	const children = await getChildren(parent.section_id, parent.section_tipo);
	const index = children.findIndex(
		(child) =>
			child.section_tipo === record.section_tipo &&
			Number(child.section_id) === Number(record.section_id),
	);
	return index === -1 ? 0 : index;
}

/**
 * The RUN-STATE a component ddo fn may consult. Narrow on purpose: everything
 * else a fn needs comes from the record and the step, which is what lets this
 * dispatch be exercised without a run (and therefore without a database).
 */
export interface ComponentFnEnv {
	/** plan.langPolicy.langs — the diffusion langs a per-lang fn emits for. */
	langs: readonly string[];
	/** text_area tipo → its PAIRED component_geolocation tipo (run-cached). */
	pairedGeolocationTipo: (textAreaTipo: string) => Promise<string | null>;
}

/**
 * map_section_id_to_subtitles_url (PHP diffusion_fn :311-339 +
 * shared/class.subtitles.php::get_subtitles_url :682-720): the publication
 * server's subtitles ENDPOINT, one URL per diffusion language. This is NOT the
 * media-tree .vtt file URL (core/media/path.ts subtitlesUrl): the published
 * value points at `publication/server_api/v1/subtitles/`, which renders the
 * transcript on demand for the requested language and time code — which is why
 * the field is language-tagged and carries no file extension.
 *
 * The base is the application web root, the same `/dedalo` prefix every other
 * URL this engine builds is rooted at (server.ts APP_ENTRY_PATH,
 * config media webBase `/dedalo/<mediaDir>`), and it reproduces the value the
 * ontology node itself documents in `properties->process->output_sample`
 * (rsc546: '/dedalo/publication/server_api/v1/subtitles/?section_id=1&lang=lg-eng').
 */
const SUBTITLES_ENDPOINT_BASE = '/dedalo/publication/server_api/v1/subtitles/';

export function subtitlesUrlAtoms(
	sectionId: number | string,
	langs: readonly string[],
	meta: ValueMeta,
): MetaValueIR[] {
	return langs.map((lang) => ({
		kind: 'scalar' as const,
		value: `${SUBTITLES_ENDPOINT_BASE}?section_id=${sectionId}&lang=${lang}`,
		lang,
		meta,
	}));
}

/**
 * Resolve ONE component ddo that declares a custom `fn` (PHP
 * component_common::get_diffusion_data :3270-3326 fn branch).
 *
 * THE RULE (audit 2026-08 §5.3): a fn this engine has not ported is a LOUD
 * per-field error, never an empty emission. PHP logs an ERROR and returns a
 * null-valued dd object; the published artifact is the same empty column
 * either way, but under TS the log had nowhere to go — `validate` reported the
 * element clean and the run reported success. That combination published the
 * AV subtitles column (rsc546, map_section_id_to_subtitles_url) as silently
 * empty on every oral-history run. Throwing here surfaces the field in
 * ResolvedBatch.errors → the job's error list, which is the operator's only
 * view of a partial publication.
 *
 * The throw is the DEFAULT: every ported fn returns before it. Adding a fn
 * means adding a branch — there is no path that quietly yields nothing.
 *
 * Ledger: engineering/wire_contract/WC-2026-08-09-diffusion-degradation-and-loud-ddo-fns.md
 * Gate: test/unit/diffusion_compile_degrade_native.test.ts
 */
export async function resolveComponentFnAtoms(
	env: ComponentFnEnv,
	record: MatrixRecord,
	step: Extract<ResolveStep, { kind: 'component' }>,
): Promise<MetaValueIR[]> {
	const meta: ValueMeta = { tipo: step.tipo };
	if (step.ddoId !== undefined) meta.sourceId = step.ddoId;

	switch (step.fn) {
		case 'get_diffusion_data_info':
			return [infoAtomOf(record, step.tipo)];

		case 'map_parent_to_norder':
			return [{ kind: 'scalar', value: await mapParentToNorder(record), lang: null, meta }];

		case 'parse_tag_to_html': {
			// diffusion_fn::parse_tag_to_html (:367-404): per stored item with a
			// non-empty value, tags → HTML (+ the text_area override's entity
			// decode). Empty slice = the PHP value-null dd object (no atoms).
			const stored = (readComponentItems(record, step.tipo, step.model) ?? []) as {
				value?: unknown;
				lang?: string | null;
			}[];
			const out: MetaValueIR[] = [];
			for (const item of stored) {
				const raw = item?.value;
				// PHP !empty($current_data->value): '' AND '0' are both skipped.
				if (typeof raw !== 'string' || raw === '' || raw === '0') continue;
				out.push({
					kind: 'scalar',
					value: parseTagValueToHtml(raw),
					lang: !item.lang || item.lang === 'lg-nolan' ? null : item.lang,
					meta,
				});
			}
			return out;
		}

		case 'get_geojson_data': {
			// component_text_area::get_geojson_data (:1612-1665): the PAIRED
			// component_geolocation's lib_data layers (point fallback included),
			// published lang-neutral as one json atom. No pair / no layers = the
			// PHP empty outcome (no atoms).
			const geoTipo = await env.pairedGeolocationTipo(step.tipo);
			if (geoTipo === null) return [];
			const layers = buildGeojsonLayers(
				readComponentItems(record, geoTipo, 'component_geolocation'),
			);
			return layers.length > 0 ? [{ kind: 'json', value: layers, lang: null, meta }] : [];
		}

		case 'map_section_id_to_subtitles_url':
			return subtitlesUrlAtoms(record.section_id, env.langs, meta);

		default:
			throw new Error(
				`unported ddo fn '${step.fn}' on component '${step.tipo}' — refusing to publish an ` +
					'empty value that would read as success (port the fn or fix the ontology)',
			);
	}
}

/**
 * map_locator_to_section_label (PHP diffusion_fn :457-513): each linked
 * locator's SECTION ontology term, one atom per available translation.
 * Term translations come from dd_ontology (cached per run).
 */
async function sectionLabelAtoms(
	ctx: RunContext,
	links: ResolvedLink[],
	componentTipo: string,
	ddoId: string | undefined,
): Promise<MetaValueIR[]> {
	const atoms: MetaValueIR[] = [];
	for (const link of links) {
		let term = ctx.sectionLabelCache.get(link.sectionTipo);
		if (term === undefined) {
			const rows = (await sql`
				SELECT term FROM dd_ontology WHERE tipo = ${link.sectionTipo} LIMIT 1
			`) as { term: Record<string, string> | null }[];
			term = rows[0]?.term ?? null;
			ctx.sectionLabelCache.set(link.sectionTipo, term);
		}
		if (term === null) continue;
		for (const [lang, label] of Object.entries(term)) {
			if (typeof label !== 'string' || label === '') continue;
			atoms.push({
				kind: 'scalar',
				value: label,
				lang,
				meta: { sourceId: ddoId, tipo: componentTipo },
			});
		}
	}
	return atoms;
}

/**
 * The component_geolocation PAIRED to a text_area — PHP common::
 * get_ar_related_by_model('component_geolocation', $tipo, true) (:1413-1465):
 * the first entry of the text_area node's ontology `relations` whose model is
 * component_geolocation. Memoized per run.
 */
async function pairedGeolocationTipoOf(
	ctx: RunContext,
	textAreaTipo: string,
): Promise<string | null> {
	const cached = ctx.geoPairCache.get(textAreaTipo);
	if (cached !== undefined) return cached;
	let pair: string | null = null;
	const rows = (await sql`
		SELECT relations FROM dd_ontology WHERE tipo = ${textAreaTipo} LIMIT 1
	`) as { relations: { tipo?: string }[] | null }[];
	for (const relation of rows[0]?.relations ?? []) {
		const relatedTipo = relation?.tipo;
		if (typeof relatedTipo !== 'string' || relatedTipo === '') continue;
		if ((await getModelByTipo(relatedTipo)) === 'component_geolocation') {
			pair = relatedTipo;
			break;
		}
	}
	ctx.geoPairCache.set(textAreaTipo, pair);
	return pair;
}

/**
 * get_diffusion_iconography (component_portal :477-529): this portal's stored
 * locators are SCENES; each scene record's inner autocomplete_hi holds TERM
 * locators; per diffusion lang, each term resolves through ts_object::
 * get_term_by_locator (from-cache, main-lang fallback) and the three
 * separators join term → scene → value. One scalar atom per lang that
 * produced a value; the atoms' tipo = the portal tipo so the auto merge
 * matches the column slot per lang (the PHP method's own contract note).
 */
async function iconographyAtoms(
	ctx: RunContext,
	record: MatrixRecord,
	hop: Extract<ResolveStep, { kind: 'relation-hop' }>,
	options: IconographyOptions,
): Promise<MetaValueIR[]> {
	const rawScenes = (readComponentItems(record, hop.tipo, hop.model) ?? []) as StoredLocator[];
	// PHP: !is_object($scene) || empty($scene->section_tipo) → skipped.
	const scenes = rawScenes.filter(
		(locator): locator is StoredLocator =>
			locator !== null &&
			typeof locator === 'object' &&
			typeof locator.section_tipo === 'string' &&
			locator.section_tipo !== '' &&
			locator.section_id !== undefined &&
			locator.section_id !== null,
	);
	if (scenes.length === 0) return [];

	// Batch-load the scene records (one IN query per scene section).
	const idsBySection = new Map<string, (number | string)[]>();
	for (const scene of scenes) {
		const sectionTipo = scene.section_tipo as string;
		const bucket = idsBySection.get(sectionTipo);
		if (bucket === undefined) idsBySection.set(sectionTipo, [scene.section_id as number | string]);
		else bucket.push(scene.section_id as number | string);
	}
	const loaded = new Map<string, MatrixRecord | null>();
	for (const [sectionTipo, ids] of idsBySection) {
		for (const [key, value] of await loadRecords(ctx, sectionTipo, ids)) loaded.set(key, value);
	}

	// Term locators per scene (lang-independent; a missing scene record or an
	// empty inner component keeps its slot — the join skips term-less scenes).
	const sceneTerms: StoredLocator[][] = scenes.map((scene) => {
		const sceneRecord =
			loaded.get(RECORD_KEY(scene.section_tipo as string, scene.section_id as number | string)) ??
			null;
		if (sceneRecord === null) return [];
		const terms = (readComponentItems(
			sceneRecord,
			options.innerTipo,
			'component_autocomplete_hi',
		) ?? []) as StoredLocator[];
		// PHP: !is_object($term) → skipped.
		return terms.filter((term) => term !== null && typeof term === 'object');
	});

	const atoms: MetaValueIR[] = [];
	for (const lang of ctx.parserCtx.langs) {
		const sceneTermValues: (string | null)[][] = [];
		for (const terms of sceneTerms) {
			const termValues: (string | null)[] = [];
			for (const term of terms) {
				termValues.push(
					await getTermByLocator(
						{ section_tipo: term.section_tipo, section_id: term.section_id },
						lang,
						true,
					),
				);
			}
			sceneTermValues.push(termValues);
		}
		const value = joinIconographyScenes(sceneTermValues, options);
		if (value !== null) {
			atoms.push({
				kind: 'scalar',
				value,
				lang,
				meta: { sourceId: hop.ddoId, tipo: hop.tipo },
			});
		}
	}
	return atoms;
}

// ---------------------------------------------------------------------------
// Field preparation (plan + rewriter recovery)
// ---------------------------------------------------------------------------

/** Normalize a raw ontology parser property to ParserStepConfig[]. */
function normalizeParserSteps(raw: unknown): ParserStepConfig[] {
	if (raw === null || raw === undefined) return [];
	const list = Array.isArray(raw) ? raw : [raw];
	const steps: ParserStepConfig[] = [];
	for (const entry of list) {
		const step = entry as Record<string, unknown>;
		if (typeof step?.fn !== 'string' || step.fn === '') continue;
		steps.push({
			fn: step.fn,
			id: typeof step.id === 'string' ? step.id : undefined,
			options: (step.options as Record<string, unknown> | undefined) ?? {},
		});
	}
	return steps;
}

/**
 * The MODEL a step contributes to its merge column. A `degraded` ddo has none:
 * the oracle's column entry is a clone of the raw ddo_map entry, which never
 * carried a model either (get_ddo_map :1252-1308 stores only tipo/section_tipo/
 * parent/fn/id), so the column slot exists with no model-specific handling.
 */
function stepColumnModel(step: Exclude<ResolveStep, { kind: 'system' }>): string {
	return step.kind === 'degraded' ? '' : step.model;
}

/**
 * Leaf steps of a source chain — PHP 'columns' (dd_diffusion_api :1247-1308).
 *
 * EXPORTED for its gate (diffusion_compile_degrade_native.test.ts): this
 * function IS the field's published column topology, and the audit's B3 fix
 * silently re-shaped it once already. A rule that decides what a table's
 * columns are deserves a direct test, not one mediated by a full run.
 */
export function leafMergeColumns(chain: ResolveStep[]): MergeColumnRef[] {
	// PHP leaf rule (:1294): every ddo NOT referenced as another ddo's parent
	// is a target column — PHP computes it over the FULL ddo_map with no
	// ontology lookup, so the oracle counts a dangling ddo as a column too.
	// This engine no longer sees one: the compiler drops a ddo of an uninstalled
	// package (its column with it) and fails on a missing node in an installed
	// one, so the chain reaching here holds only resolvable steps — see
	// WC-2026-08-11-diffusion-uninstalled-package-skip. Steps carry the parent
	// linkage; a legacy chain without it falls back to the positional heuristic.
	const hasParentInfo = chain.some((step) => step.kind !== 'system' && step.parent !== undefined);
	if (hasParentInfo) {
		const parents = new Set<string>();
		for (const step of chain) {
			if (step.kind !== 'system' && step.parent !== undefined) parents.add(step.parent);
		}
		const leaves: MergeColumnRef[] = [];
		for (const step of chain) {
			if (step.kind === 'system') continue;
			if (!parents.has(step.tipo)) leaves.push({ tipo: step.tipo, model: stepColumnModel(step) });
		}
		return leaves;
	}
	const leaves: MergeColumnRef[] = [];
	chain.forEach((step, index) => {
		if (step.kind === 'system') return;
		// A terminal ddo (component read or dangling) is always a leaf column.
		if (step.kind === 'component' || step.kind === 'degraded') {
			leaves.push({ tipo: step.tipo, model: stepColumnModel(step) });
			return;
		}
		// A hop is a leaf only when nothing follows it (its targets feed no
		// later step — the chain ends in locators).
		if (index === chain.length - 1) leaves.push({ tipo: step.tipo, model: step.model });
	});
	return leaves;
}

/** The ddo tree index of one source chain (see PreparedField.childrenByParent). */
function chainTreeOf(chain: ResolveStep[]): Map<string, ResolveStep[]> {
	const childrenByParent = new Map<string, ResolveStep[]>();
	for (const step of chain) {
		const key = step.kind === 'system' ? '' : (step.parent ?? '');
		const bucket = childrenByParent.get(key);
		if (bucket === undefined) childrenByParent.set(key, [step]);
		else bucket.push(step);
	}
	return childrenByParent;
}

/** Prepare every field of the plan once per run (recovery pass included). */
async function prepareFields(
	plan: PublicationPlan,
	tree: VirtualDiffusionTree | null,
): Promise<Map<string, PreparedField>> {
	const rewriterWarnings = new Map<string, string[]>();
	const hopFnWarnings = new Map<string, string[]>();
	for (const warning of plan.warnings) {
		const rewriterMatch = /^rewriter:(.+)@([a-z0-9_]+)$/.exec(warning);
		if (rewriterMatch !== null) {
			const [, fn, fieldId] = rewriterMatch as unknown as [string, string, string];
			const bucket = rewriterWarnings.get(fieldId);
			if (bucket === undefined) rewriterWarnings.set(fieldId, [fn]);
			else bucket.push(fn);
			continue;
		}
		const hopMatch = /^relation-hop-fn:(.+)@([a-z0-9_]+)$/.exec(warning);
		if (hopMatch !== null) {
			const [, fn, fieldId] = hopMatch as unknown as [string, string, string];
			const bucket = hopFnWarnings.get(fieldId);
			if (bucket === undefined) hopFnWarnings.set(fieldId, [fn]);
			else bucket.push(fn);
		}
	}

	const prepared = new Map<string, PreparedField>();
	for (const section of plan.sections) {
		for (const field of section.fields) {
			let steps: ParserStepConfig[] = field.transform;
			const rewriters = rewriterWarnings.get(field.id) ?? [];
			if (rewriters.length > 0) {
				// Recovery: the FULL ontology chain, rewriter options included.
				const node = tree === null ? null : await tree.index.nodeOf(field.id);
				const process = node?.properties?.process as Record<string, unknown> | undefined;
				const recovered = normalizeParserSteps(process?.parser);
				if (recovered.length > 0) {
					steps = recovered;
				} else {
					// No recoverable options — run the rewriters with defaults, in
					// warning order, after the surviving runtime steps.
					steps = [...field.transform, ...rewriters.map((fn) => ({ fn, options: {} }))];
				}
			}

			const timestampIndex = steps.findIndex(
				(step) => step.fn === 'parser_global::publication_unix_timestamp',
			);
			const mergeColumnsStep = steps.find((step) => step.fn === 'parser_global::merge_columns');
			const needsAncestors =
				steps.some((step) => step.fn === 'parser_locator::parents') ||
				field.sourceChain.some((step) => step.kind === 'relation-hop' && step.addParents === true);

			const hopFns = hopFnWarnings.get(field.id) ?? [];
			const hopEmitsSectionLabels = hopFns.includes('map_locator_to_section_label');
			// get_diffusion_iconography (component_portal :477-529): the compiler
			// keeps the fn as a warning; recover the fn ddo's OPTIONS
			// (inner_relation + separators) from the ontology node's ddo_map —
			// absent options fall back to the PHP defaults.
			let iconography: IconographyOptions | null = null;
			if (hopFns.includes('get_diffusion_iconography')) {
				const node = tree === null ? null : await tree.index.nodeOf(field.id);
				const process = node?.properties?.process as Record<string, unknown> | undefined;
				const ddoMap = Array.isArray(process?.ddo_map)
					? (process.ddo_map as Record<string, unknown>[])
					: [];
				const fnDdo = ddoMap.find((entry) => entry?.fn === 'get_diffusion_iconography');
				iconography = iconographyOptionsOf(fnDdo);
			}
			const PORTED_HOP_FNS = new Set(['map_locator_to_section_label', 'get_diffusion_iconography']);
			prepared.set(field.id, {
				field,
				steps: mergeColumnsStep !== undefined ? [] : steps,
				childrenByParent: chainTreeOf(field.sourceChain),
				mergeColumns: leafMergeColumns(field.sourceChain),
				isTimestampField: timestampIndex !== -1,
				mergeColumnsOptions: mergeColumnsStep !== undefined ? mergeColumnsStep.options : null,
				needsAncestors,
				hopEmitsSectionLabels,
				iconography,
				unsupportedHopFns: hopFns.filter((fn) => !PORTED_HOP_FNS.has(fn)),
			});
		}
	}
	return prepared;
}

// ---------------------------------------------------------------------------
// Chain walking (stage D per field)
// ---------------------------------------------------------------------------

/** A stored relation locator as read from the matrix slice. The union is raw-
 * jsonb passthrough: an install not yet swept holds the PHP string form, and an
 * external-service hop carries a remote id verbatim ('001338683') — the chain
 * walker compares loosely and re-emits these bytes into the published (string-
 * shaped) target. WC-2026-08-10-section-id-int-canonical. */
interface StoredLocator {
	section_tipo?: string;
	section_id?: number | string;
	from_component_tipo?: string;
	type?: string;
	[extra: string]: unknown;
}

/** Models whose unpublishable locators stay in VALUES (chain_processor :308-313). */
const STRUCTURAL_HOP_MODELS: ReadonlySet<string> = new Set([
	'component_relation_parent',
	'component_relation_children',
	'component_relation_index',
]);
/** Value-source models (chain_processor :306-307). */
const VALUE_SOURCE_MODELS: ReadonlySet<string> = new Set([
	'component_select',
	'component_portal',
	'component_autocomplete',
	'component_autocomplete_hi',
]);

/**
 * relation_list locators — the TS twin of PHP relation_list::get_data
 * (class.relation_list.php :1275-1333): the INVERSE references of the host
 * record (records whose relation column points at it), narrowed by the ddo's
 * section_filter (owning sections) and component_filter (relation origin),
 * ordered section_id ASC (PHP related-search default order). section_id is
 * kept as a STRING — the PHP wire carried matrix locator strings, and the
 * json output formats are byte-sensitive to it ('["4649"]' vs '[4649]').
 */
async function relationListLocators(
	ctx: RunContext,
	record: MatrixRecord,
	hop: Extract<ResolveStep, { kind: 'relation-hop' }>,
): Promise<StoredLocator[]> {
	const cacheKey = `${RECORD_KEY(record.section_tipo, record.section_id)}|${(hop.sectionFilter ?? []).join(',')}|${(hop.componentFilter ?? []).join(',')}`;
	const cached = ctx.relationListCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const host = { section_tipo: record.section_tipo, section_id: Number(record.section_id) };
	const filters =
		hop.componentFilter !== undefined && hop.componentFilter.length > 0
			? hop.componentFilter.map((tipo) => ({ ...host, from_component_tipo: tipo }))
			: [host];
	const hits = await findInverseReferences(filters, {
		sectionTipos:
			hop.sectionFilter !== undefined && hop.sectionFilter.length > 0 ? hop.sectionFilter : 'all',
		limit: false,
		order: 'section_id',
	});
	const locators: StoredLocator[] = hits.map((hit) => ({
		section_tipo: hit.section_tipo,
		section_id: String(hit.section_id),
	}));
	ctx.relationListCache.set(cacheKey, locators);
	return locators;
}

/**
 * relation_index locators — component_relation_index STORES NOTHING: it is an
 * inverse index computed per read from matrix_relation_index ("who points at
 * me?"), so the stored-slice read yields [] and the field would publish NULL
 * silently. This is the SAME computed flow the read path runs
 * (readRelationIndexData, core/relations/models/relation_index.ts :310-333 —
 * PHP class.component_relation_index.php get_data :160 /
 * search_related::get_referenced_locators :489), reusing its two engines:
 * resolveIndexConfig for the component's inverse question (relation type =
 * properties.config_relation.relation_type ?? dd96; pointing sections = the
 * request_config sqo targets, else 'all') and findInverseReferenceLocators for
 * the hits — but WITHOUT pagination: a publication takes the FULL inverse set,
 * never an edit page (limit: false; the component's editLimit is an edit-view
 * concern). Hits map through parseInverseEntry (the PHP parse_data field
 * mapping), whose output already satisfies the walker's locator contract:
 * section_tipo (string) + section_id (canonical INT —
 * WC-2026-08-10-section-id-int-canonical; relation_list's String() is a
 * pinned frozen-consumer edge, NOT copied here). parse_data renames
 * from_component_tipo → from_component_top_tipo, so the fallback link stamps
 * hop.tipo — the same stamp relation_list locators take, kept deliberately.
 * On an unmaintained instance requireRelationIndex THROWS (inside the find):
 * that propagates into the per-field error list on purpose — swallowing it
 * into an empty locator list would be silent scope narrowing.
 */
async function relationIndexLocators(
	ctx: RunContext,
	record: MatrixRecord,
	hop: Extract<ResolveStep, { kind: 'relation-hop' }>,
): Promise<StoredLocator[]> {
	// The inverse-question config is ontology-derived and query-heavy when the
	// component declares a request_config — resolve once per (hop, section).
	const configKey = `${hop.tipo}|${record.section_tipo}`;
	let config = ctx.relationIndexConfigCache.get(configKey);
	if (config === undefined) {
		config = await resolveIndexConfig(hop.tipo, record.section_tipo);
		ctx.relationIndexConfigCache.set(configKey, config);
	}

	// The key carries EVERY resolved filter the query depends on: hop tipo
	// (per-component question), relation type and target sections.
	const targetsKey = config.targetSections === 'all' ? 'all' : config.targetSections.join(',');
	const cacheKey = `${RECORD_KEY(record.section_tipo, record.section_id)}|${hop.tipo}|${config.relationType}|${targetsKey}`;
	const cached = ctx.relationIndexCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const hits = await findInverseReferenceLocators(
		[
			{
				type: config.relationType,
				section_tipo: record.section_tipo,
				section_id: record.section_id,
			},
		],
		{ sectionTipos: config.targetSections, limit: false, order: 'section_id' },
	);
	const locators = hits.map((hit) => parseInverseEntry(hit) as StoredLocator);
	ctx.relationIndexCache.set(cacheKey, locators);
	return locators;
}

/**
 * relation_children locators — component_relation_children is the OTHER
 * computed relation model: nothing is stored under its tipo; the children are
 * derived from the inverse dd48 parent locators (records whose
 * component_relation_parent points at this record). Reuses getChildren — the
 * SAME engine relationChildrenResolver rides (core/relations/children.ts; PHP
 * class.component_relation_children.php get_dato → get_children) — with
 * limit 0 = ALL (a publication takes the whole set, not an edit page) and the
 * hop's own tipo passed explicitly (else getChildren re-derives it through an
 * ontology walk). ChildLocator already matches the walker's locator contract
 * field-for-field: section_tipo, section_id (canonical INT, WC-2026-08-10),
 * from_component_tipo (= the children tipo) and type ('dd48'); the map below
 * restates the four fields so a future ChildLocator field change cannot leak
 * unvetted extras into published values.
 */
async function relationChildrenLocators(
	ctx: RunContext,
	record: MatrixRecord,
	hop: Extract<ResolveStep, { kind: 'relation-hop' }>,
): Promise<StoredLocator[]> {
	// Per-record cache is load-bearing: with a section_map thesaurus order
	// getChildren sibling-orders in process — one target-record read PER CHILD.
	const cacheKey = `${RECORD_KEY(record.section_tipo, record.section_id)}|${hop.tipo}`;
	const cached = ctx.relationChildrenCache.get(cacheKey);
	if (cached !== undefined) return cached;

	const children = await getChildren(record.section_id, record.section_tipo, hop.tipo, 0, 0);
	const locators: StoredLocator[] = children.map((child) => ({
		section_tipo: child.section_tipo,
		section_id: child.section_id,
		from_component_tipo: child.from_component_tipo,
		type: child.type,
	}));
	ctx.relationChildrenCache.set(cacheKey, locators);
	return locators;
}

/**
 * Resolve one field's atoms for one record — the recursive twin of PHP
 * diffusion_chain_processor::resolve_chain: root ddos execute against the
 * record itself; each relation hop reads its locators, queues linked
 * plan-section records, and executes its CHILD ddos against every linked
 * record (per-locator recursion), falling back to the locator itself as the
 * value when no child resolves.
 */
async function resolveFieldAtoms(
	ctx: RunContext,
	prepared: PreparedField,
	primary: MatrixRecord,
	level: number,
	recordPublishable: boolean,
): Promise<MetaValueIR[]> {
	if (prepared.unsupportedHopFns.length > 0) {
		throw new Error(
			`unported relation-hop fn(s) ${prepared.unsupportedHopFns.join(', ')} — field skipped (ledgered)`,
		);
	}
	return walkChainLevel(ctx, prepared, primary, level, recordPublishable, '', []);
}

/**
 * One resolve_chain level: the child ddos of `parentKey` executed against
 * ONE record. `visited` is the path-aware ancestor guard (chain_processor
 * :86-96) — sibling references to the same section still resolve, only a
 * true cycle is blocked.
 */
async function walkChainLevel(
	ctx: RunContext,
	prepared: PreparedField,
	record: MatrixRecord,
	level: number,
	isPublishable: boolean,
	parentKey: string,
	visited: string[],
): Promise<MetaValueIR[]> {
	const selfKey = RECORD_KEY(record.section_tipo, record.section_id);
	const path = visited.includes(selfKey) ? visited : [...visited, selfKey];
	const steps = prepared.childrenByParent.get(parentKey) ?? [];
	const atoms: MetaValueIR[] = [];

	for (const step of steps) {
		if (step.kind === 'system') {
			const value =
				step.source === 'publish_timestamp'
					? ctx.options.runStartedAt
					: step.source === 'section_id'
						? record.section_id
						: record.section_tipo;
			atoms.push({ kind: 'scalar', value, lang: null });
			continue;
		}

		// A DEGRADED ddo (tipo absent from the ontology) resolves to zero atoms,
		// which is exactly what the oracle does at this point:
		// resolve_ddo_value :133-152 → component_common::get_instance returns
		// null, PHP logs it and the ddo contributes []. Its COLUMN still exists
		// (leafMergeColumns keeps it) and publishes an empty slot; the compile
		// degradation already named it in the run report.
		if (step.kind === 'degraded') continue;

		// PHP resolve_chain child filter (:97-99): a section-scoped ddo only
		// executes against records of its declared section.
		if (step.sectionTipo !== '' && step.sectionTipo !== record.section_tipo) continue;

		if (step.kind === 'component') {
			// Custom ddo fn dispatch (component_common :3274-3326). ONE door, and
			// it either resolves or throws — see resolveComponentFnAtoms.
			if (step.fn !== undefined) {
				atoms.push(
					...(await resolveComponentFnAtoms(
						{
							langs: ctx.plan.langPolicy.langs,
							pairedGeolocationTipo: (textAreaTipo) => pairedGeolocationTipoOf(ctx, textAreaTipo),
						},
						record,
						step,
					)),
				);
				continue;
			}
			// Terminal atoms carry NO section identity — the first-ddo relation
			// stamps its locator identity on them (chain_processor :322-341),
			// exactly like the PHP dd objects.
			let stepAtoms = defaultPublicationValue(
				record,
				step.tipo,
				step.model,
				{
					sourceId: step.ddoId,
					tipo: step.tipo,
				},
				step.options,
			);
			if (step.pinLang !== undefined) {
				// ddo lang pin (component_common :3341-3349): keep the pinned lang's
				// entries (nolan passes) and emit them lang-neutral.
				stepAtoms = stepAtoms
					.filter((atom) => atom.lang === null || atom.lang === step.pinLang)
					.map((atom) => ({ ...atom, lang: null }));
			}
			atoms.push(...stepAtoms);
			continue;
		}

		atoms.push(...(await resolveHop(ctx, prepared, step, record, level, isPublishable, path)));
	}

	return atoms;
}

/** One relation hop on one record (PHP process_relation_component). */
async function resolveHop(
	ctx: RunContext,
	prepared: PreparedField,
	hop: Extract<ResolveStep, { kind: 'relation-hop' }>,
	record: MatrixRecord,
	level: number,
	isPublishable: boolean,
	visited: string[],
): Promise<MetaValueIR[]> {
	// Custom hop fn: get_diffusion_iconography REPLACES the hop's resolution
	// entirely (PHP get_diffusion_data fn dispatch :3274-3326 — the fn result
	// is the value; no child recursion, no frontier queueing: an fn_terminal
	// ddo yields a composed value, not locators the old engine could follow).
	if (prepared.iconography !== null && prepared.field.sourceChain[0] === hop) {
		return iconographyAtoms(ctx, record, hop, prepared.iconography);
	}

	// Locator source dispatch: the diffusion node defines the chain, but WHERE
	// a hop's locators come from is the model's storage contract — three models
	// are COMPUTED (they store nothing under their tipo, so a stored-slice read
	// yields [] and the field publishes NULL silently): relation_list = inverse
	// references (ddo-filtered), component_relation_index = the inverse index,
	// component_relation_children = derived dd48 children. Every other relation
	// model reads its stored slice of the record. ONLY the source differs —
	// queueing, gates and child recursion below treat all hops identically.
	let rawLocators: StoredLocator[];
	if (hop.model === 'relation_list') {
		rawLocators = await relationListLocators(ctx, record, hop);
	} else if (hop.model === 'component_relation_index') {
		rawLocators = await relationIndexLocators(ctx, record, hop);
	} else if (hop.model === 'component_relation_children') {
		rawLocators = await relationChildrenLocators(ctx, record, hop);
	} else {
		const items = readComponentItems(record, hop.tipo, hop.model) as StoredLocator[] | null;
		rawLocators = (items ?? []).filter(
			(locator): locator is StoredLocator =>
				locator !== null &&
				typeof locator === 'object' &&
				typeof locator.section_tipo === 'string' &&
				locator.section_id !== undefined &&
				locator.section_id !== null,
		);
	}

	const children = prepared.childrenByParent.get(hop.tipo) ?? [];
	// Child section whitelist (chain_processor :237-243).
	const whitelist = new Set<string>();
	for (const child of children) {
		// A degraded child declares no section (it never executes), so it
		// narrows nothing — the oracle's whitelist comes from resolvable ddos.
		if (child.kind === 'system' || child.kind === 'degraded') continue;
		if (child.sectionTipo !== '') whitelist.add(child.sectionTipo);
	}
	const isFirstDdo = prepared.field.sourceChain[0] === hop;

	const atoms: MetaValueIR[] = [];
	const labelLinks: ResolvedLink[] = [];

	for (const locator of rawLocators) {
		const sectionTipo = locator.section_tipo as string;
		const sectionId = locator.section_id as number | string;
		const key = RECORD_KEY(sectionTipo, sectionId);

		// Load the target now: the gate and any child ddo both need the record.
		const loaded = await loadRecords(ctx, sectionTipo, [sectionId]);
		const target = loaded.get(key) ?? null;

		// Linked-record publishability: section override wins, else live gate.
		let currentPublishable = true;
		const sectionOverride = ctx.sectionPublishableOverride.get(sectionTipo);
		if (sectionOverride !== null && sectionOverride !== undefined) {
			currentPublishable = sectionOverride;
		} else if (target !== null) {
			currentPublishable = await isRecordPublishable(ctx, target);
		}

		// A. QUEUE for top-level publication (chain_processor :271-280): level
		// budget, section must have a SectionPlan, unpublishable records queue
		// too (writers must delete them). relation_list hops NEVER queue (:274).
		if (level > 0 && hop.model !== 'relation_list' && ctx.sectionPlans.has(sectionTipo)) {
			if (currentPublishable) ctx.publishableOverrides.set(key, true);
			const frontierKey = `${level - 1}:${sectionTipo}`;
			const bucket = ctx.frontier.get(frontierKey);
			if (bucket === undefined) ctx.frontier.set(frontierKey, new Set([sectionId]));
			else bucket.add(sectionId);
		}

		// An unpublishable parent leaves TRUE locators untouched (:266-270).
		if (isPublishable === false && currentPublishable === true) continue;

		// Value skip for unpublishable locators (chain_processor :282-314):
		// structural hops keep theirs; a value-source select/portal read
		// THROUGH to deeper ddos (or add_parents) keeps them too.
		const isValueSource =
			(children.length > 0 || hop.addParents === true) && VALUE_SOURCE_MODELS.has(hop.model);
		if (
			(isPublishable === false || currentPublishable === false) &&
			!STRUCTURAL_HOP_MODELS.has(hop.model) &&
			!isValueSource
		) {
			continue;
		}

		// B. RECURSION into the linked record when the ddo_map defines children
		// for it (:316-341). Explicit chains are NOT level-gated — depth is
		// bounded by the ddo tree + the visited ancestor guard (PHP note :318).
		//
		// The recursed/fallback split mirrors PHP EXACTLY: resolve_chain returns
		// one wrapper per child ddo MATCHING the locator's section — when a
		// child executed (even to an empty value) the locator contributes its
		// child values ONLY (no fallback, `$relation_values` gains nothing for
		// an empty child); the raw-locator fallback fires only when NO child
		// ddo applied (none defined / section mismatch / cycle-blocked).
		let childAtoms: MetaValueIR[] = [];
		let recursed = false;
		const validated = whitelist.size === 0 ? true : whitelist.has(sectionTipo);
		if (validated && !visited.includes(key)) {
			const applicable = children.some(
				(child) =>
					child.kind !== 'system' &&
					child.kind !== 'degraded' &&
					(child.sectionTipo === '' || child.sectionTipo === sectionTipo),
			);
			if (applicable) {
				recursed = true;
				childAtoms =
					target === null
						? [] // record gone: PHP reads empty components (no fallback)
						: await walkChainLevel(
								ctx,
								prepared,
								target,
								level - 1,
								currentPublishable,
								hop.tipo,
								visited,
							);
			}
		}

		if (recursed) {
			if (isFirstDdo && childAtoms.length > 0) {
				// Stamp the parent locator's identity onto identity-less terminal
				// atoms (:322-341) — merge/pipe grouping runs per FIRST-hop record.
				childAtoms = childAtoms.map((atom) =>
					atom.meta?.sectionTipo === undefined || atom.meta?.sectionTipo === null
						? { ...atom, meta: { ...atom.meta, sectionId, sectionTipo } }
						: atom,
				);
			}
			atoms.push(...childAtoms);
			continue;
		}

		// No child resolved: a whitelist-scoped hop drops foreign locators
		// (:364-383 — relation_list / end-ddo section filters).
		if (whitelist.size > 0 && !whitelist.has(sectionTipo)) continue;

		// Fallback: the locator itself is the value (:385-423).
		const link: ResolvedLink = {
			sectionTipo,
			sectionId,
			fromComponentTipo: (locator.from_component_tipo as string | undefined) ?? hop.tipo,
			model: hop.model,
		};
		if (typeof locator.type === 'string') link.type = locator.type;
		// Carry the inverse-index edge extras parseInverseEntry reconstructed.
		// Without these the index_meta projection can only emit the address half
		// of the edge, and a nine-key v6 indexation cell publishes as five.
		if (locator.tag_id !== undefined) link.tagId = locator.tag_id as string | number;
		if (typeof locator.component_tipo === 'string') link.componentTipo = locator.component_tipo;
		if (locator.section_top_id !== undefined) {
			link.sectionTopId = locator.section_top_id as string | number;
		}
		if (typeof locator.section_top_tipo === 'string') {
			link.sectionTopTipo = locator.section_top_tipo;
		}
		if (typeof locator.from_component_top_tipo === 'string') {
			link.fromComponentTopTipo = locator.from_component_top_tipo;
		}
		if (prepared.hopEmitsSectionLabels) {
			// map_locator_to_section_label: section-node terms, one atom per lang.
			labelLinks.push(link);
			continue;
		}
		const links = prepared.needsAncestors === true ? await ancestorChainOf(ctx, link) : [link];
		atoms.push({
			kind: 'chain',
			links: links.length > 0 ? links : [link],
			lang: null,
			meta: {
				sourceId: hop.ddoId,
				tipo: hop.tipo,
				sectionId,
				sectionTipo,
			},
		});
	}

	if (labelLinks.length > 0) {
		atoms.push(...(await sectionLabelAtoms(ctx, labelLinks, hop.tipo, hop.ddoId)));
	}
	return atoms;
}

// ---------------------------------------------------------------------------
// merge_columns — deferred record-level synthetic value (oracle :626-655)
// ---------------------------------------------------------------------------

function mergeColumnsValue(
	fieldLangValues: Map<string, ColumnLangValues>,
	options: Record<string, unknown>,
	mainLang: string | null,
): string | null {
	const rawColumns = options.columns;
	const columns: string[] = Array.isArray(rawColumns)
		? rawColumns.map((column) => String(column))
		: rawColumns
			? [String(rawColumns)]
			: [];
	if (columns.length === 0) return null;
	const separator = options.fields_separator !== undefined ? String(options.fields_separator) : ' ';

	const merged: string[] = [];
	for (const [fieldId, langValues] of fieldLangValues) {
		if (!columns.includes(fieldId)) continue;
		const first = (): string | null | undefined => {
			for (const [, value] of langValues) return value;
			return undefined;
		};
		const value =
			langValues.get(NOLAN_KEY) ??
			(mainLang !== null ? langValues.get(mainLang) : undefined) ??
			first() ??
			null;
		if (value === null || value === undefined || value === '') continue;
		merged.push(String(value));
	}
	return merged.length > 0 ? merged.join(separator) : null;
}

// ---------------------------------------------------------------------------
// Record processing (gate → fields → transform → projection)
// ---------------------------------------------------------------------------

interface ProcessedRecord {
	record: RecordIR;
	rows: ProjectedRow[];
	errors: FieldResolutionError[];
}

async function processRecord(
	ctx: RunContext,
	sectionPlan: SectionPlan,
	record: MatrixRecord,
	level: number,
): Promise<ProcessedRecord> {
	const errors: FieldResolutionError[] = [];
	const status = await resolveGate(ctx, record);
	const recordIr: RecordIR = {
		sectionTipo: record.section_tipo,
		sectionId: record.section_id,
		status,
		fields: new Map<string, FieldIR>(),
	};
	if (status === 'unpublish') return { record: recordIr, rows: [], errors };

	const columnValues = new Map<string, ColumnLangValues>();
	const fieldLangValues = new Map<string, ColumnLangValues>();
	const fieldPolicies = new Map<string, FieldProjectionPolicy>();
	const deferredMergeColumns: PreparedField[] = [];

	for (const field of sectionPlan.fields) {
		const prepared = ctx.preparedFields.get(field.id);
		if (prepared === undefined) continue;

		if (field.policy.emptyToString !== undefined || field.policy.defaultValue !== undefined) {
			const policy: FieldProjectionPolicy = {};
			if (field.policy.emptyToString !== undefined)
				policy.emptyToString = field.policy.emptyToString;
			if (field.policy.defaultValue !== undefined) policy.defaultValue = field.policy.defaultValue;
			fieldPolicies.set(field.columnName, policy);
		}

		if (prepared.mergeColumnsOptions !== null) {
			deferredMergeColumns.push(prepared);
			continue;
		}

		if (prepared.isTimestampField) {
			// Data-independent (oracle :387-398): the run-scoped timestamp.
			const langValues: ColumnLangValues = new Map([[NOLAN_KEY, String(ctx.options.runStartedAt)]]);
			recordIr.fields.set(field.id, {
				planFieldId: field.id,
				values: [{ kind: 'scalar', value: ctx.options.runStartedAt, lang: null }],
			});
			fieldLangValues.set(field.id, langValues);
			if (field.excludeColumn !== true) columnValues.set(field.columnName, langValues);
			continue;
		}

		let langValues: ColumnLangValues = new Map();
		try {
			const gateStatus = status === 'publish';
			let atoms = await resolveFieldAtoms(ctx, prepared, record, level, gateStatus);
			if (atoms.length === 0 && field.policy.emptyValue !== undefined) {
				// empty_value placeholder (chain_processor :369-384 intent).
				atoms = [{ kind: 'scalar', value: field.policy.emptyValue, lang: null }];
			}
			recordIr.fields.set(field.id, { planFieldId: field.id, values: atoms });

			const spec: FieldTransformSpec = {
				transform: prepared.steps,
				outputFormat: field.outputFormat,
				extraFns: ctx.rewriterFns,
			};
			if (prepared.mergeColumns.length > 0) spec.mergeColumns = prepared.mergeColumns;
			langValues = fieldValuesToColumn(atoms, spec, ctx.parserCtx);
		} catch (error) {
			errors.push({
				sectionTipo: record.section_tipo,
				sectionId: record.section_id,
				fieldId: field.id,
				columnName: field.columnName,
				message: error instanceof Error ? error.message : String(error),
			});
			recordIr.fields.set(field.id, { planFieldId: field.id, values: [] });
		}

		fieldLangValues.set(field.id, langValues);
		if (field.excludeColumn !== true) columnValues.set(field.columnName, langValues);
	}

	// PHASE 1b — deferred merge_columns over the already-resolved columns.
	for (const prepared of deferredMergeColumns) {
		const field = prepared.field;
		const langValues: ColumnLangValues = new Map();
		const merged = mergeColumnsValue(
			fieldLangValues,
			prepared.mergeColumnsOptions ?? {},
			ctx.parserCtx.mainLang,
		);
		if (merged !== null && merged !== '') langValues.set(NOLAN_KEY, merged);
		recordIr.fields.set(field.id, {
			planFieldId: field.id,
			values: merged === null ? [] : [{ kind: 'scalar', value: merged, lang: null }],
		});
		fieldLangValues.set(field.id, langValues);
		if (field.excludeColumn !== true) columnValues.set(field.columnName, langValues);
	}

	const rows = projectRecordRows(
		record.section_id,
		columnValues,
		ctx.plan.langPolicy,
		fieldPolicies,
	);
	return { record: recordIr, rows, errors };
}

// ---------------------------------------------------------------------------
// The run generator
// ---------------------------------------------------------------------------

/** Process a loaded id batch of one section into a ResolvedBatch. */
async function processBatch(
	ctx: RunContext,
	sectionPlan: SectionPlan,
	sectionIds: (number | string)[],
	level: number,
	cursor: number,
): Promise<ResolvedBatch> {
	const table = await matrixTableOf(ctx, sectionPlan.sectionTipo);
	if (table === null) {
		throw new Error(`diffusion resolver: no matrix table for section '${sectionPlan.sectionTipo}'`);
	}
	const records = await readMatrixRecords(table, sectionPlan.sectionTipo, sectionIds);
	const byId = new Map(records.map((record) => [String(record.section_id), record]));

	const outRecords: RecordIR[] = [];
	const outRows: ProjectedRow[] = [];
	const unpublishIds: (number | string)[] = [];
	const errors: FieldResolutionError[] = [];

	for (const sectionId of sectionIds) {
		const record = byId.get(String(sectionId));
		ctx.usedRecords.add(RECORD_KEY(sectionPlan.sectionTipo, sectionId));
		if (record === undefined) {
			// Selected/queued but no longer present → unpublish (fail-closed).
			unpublishIds.push(sectionId);
			outRecords.push({
				sectionTipo: sectionPlan.sectionTipo,
				sectionId,
				status: 'unpublish',
				fields: new Map(),
			});
			continue;
		}
		const processed = await processRecord(ctx, sectionPlan, record, level);
		outRecords.push(processed.record);
		if (processed.record.status === 'unpublish') unpublishIds.push(record.section_id);
		outRows.push(...processed.rows);
		errors.push(...processed.errors);
	}

	return {
		section: sectionPlan,
		level,
		records: outRecords,
		rows: outRows,
		unpublishIds,
		cursor,
		errors,
	};
}

/**
 * Resolve one publication run: primary keyset batches of options.sectionTipo,
 * then the breadth-first frontier (linked plan-section records) level by
 * level. See the module doc for the full contract; every yield is a durable
 * unit (cursor = primary checkpoint).
 */
export async function* resolvePublication(
	plan: PublicationPlan,
	options: ResolveOptions,
): AsyncGenerator<ResolvedBatch> {
	const primaryPlan = plan.sections.find((section) => section.sectionTipo === options.sectionTipo);
	if (primaryPlan === undefined) {
		throw new Error(
			`diffusion resolver: section '${options.sectionTipo}' has no SectionPlan in element '${plan.elementTipo}'`,
		);
	}
	if (!Number.isFinite(options.runStartedAt)) {
		throw new Error('diffusion resolver: options.runStartedAt (epoch seconds) is required');
	}

	// Rewriter recovery + section publishable overrides need the ontology tree
	// (transitional — see module doc). Reuse the caller's when provided.
	// get_diffusion_iconography fields also read the tree: the compiler keeps
	// hop fns as warnings, so the fn ddo's OPTIONS live only in the ontology.
	const needsRecovery = plan.warnings.some(
		(warning) =>
			warning.startsWith('rewriter:') ||
			warning.startsWith('relation-hop-fn:get_diffusion_iconography@'),
	);
	const tree = options.tree ?? (needsRecovery ? await buildVirtualDiffusionTree() : null);

	const sectionPlans = new Map(plan.sections.map((section) => [section.sectionTipo, section]));
	const planTables = new Map(
		plan.sections.map((section) => [section.sectionTipo, section.tableName]),
	);
	const sectionPublishableOverride = new Map<string, boolean | null>();
	for (const section of plan.sections) {
		const tableNode = tree?.nodes.find((node) => node.tipo === section.tableTipo);
		const override = tableNode?.properties?.is_publishable;
		sectionPublishableOverride.set(
			section.sectionTipo,
			typeof override === 'boolean' ? override : null,
		);
	}

	const rewriterEnv: RewriterEnv = { planTables, runStartedAt: options.runStartedAt };
	const ctx: RunContext = {
		plan,
		options: { ...options },
		parserCtx: { langs: plan.langPolicy.langs, mainLang: plan.langPolicy.mainLang },
		maxLevels: options.maxLevels ?? plan.recursion.maxLevels,
		batchSize: options.batchSize ?? 500,
		rewriterFns: buildRewriterFns(rewriterEnv),
		sectionPlans,
		planTables,
		sectionPublishableOverride,
		preparedFields: await prepareFields(plan, tree),
		tableCache: new Map(),
		publicationTipoCache: new Map(),
		parentTipoCache: new Map(),
		recordCache: new Map(),
		termCache: new Map(),
		ancestorCache: new Map(),
		relationListCache: new Map(),
		relationIndexConfigCache: new Map(),
		relationIndexCache: new Map(),
		relationChildrenCache: new Map(),
		typologyElementCache: new Map(),
		sectionLabelCache: new Map(),
		geoPairCache: new Map(),
		usedRecords: new Set(),
		publishableOverrides: new Map(),
		frontier: new Map(),
	};

	// Stage C: primary selection, keyset-batched.
	const sqo: Sqo = options.sqo ?? { section_tipo: options.sectionTipo };
	let primaryCursor = options.afterSectionId ?? 0;
	for await (const batch of selectRecordBatches(
		sqo,
		options.sectionTipo,
		ctx.batchSize,
		primaryCursor,
		options.principal,
	)) {
		primaryCursor = batch.cursor;
		yield await processBatch(ctx, primaryPlan, batch.sectionIds, ctx.maxLevels, batch.cursor);
	}

	// Frontier drain — FIFO over `${level}:${section_tipo}` keys (PHP
	// dd_diffusion_api :270-307), per-run dedup via usedRecords.
	while (ctx.frontier.size > 0) {
		const [frontierKey, queued] = ctx.frontier.entries().next().value as [
			string,
			Set<number | string>,
		];
		ctx.frontier.delete(frontierKey);
		const separatorIndex = frontierKey.indexOf(':');
		const level = Number(frontierKey.slice(0, separatorIndex));
		const sectionTipo = frontierKey.slice(separatorIndex + 1);
		const sectionPlan = ctx.sectionPlans.get(sectionTipo);
		if (sectionPlan === undefined) continue;

		const pendingIds = [...queued].filter(
			(sectionId) => !ctx.usedRecords.has(RECORD_KEY(sectionTipo, sectionId)),
		);
		for (let offset = 0; offset < pendingIds.length; offset += ctx.batchSize) {
			const slice = pendingIds.slice(offset, offset + ctx.batchSize);
			yield await processBatch(ctx, sectionPlan, slice, level, primaryCursor);
		}
	}
}

// ---------------------------------------------------------------------------
// P6 export atom entry point — the shared walk at ITEM granularity
// ---------------------------------------------------------------------------
//
// tool_export needs pre-projection atoms (owner record + leaf step + locator
// index provenance), NOT the lang-laddered publication values. This is the
// sanctioned atom-level entry point of the SAME engine (DIFFUSION_PLAN D8/P6):
// it rides matrixTableOf/readMatrixRecords and the RunContext-shaped caches
// above, so no third resolution walker exists. It deliberately DIFFERS from
// walkChainLevel in the ways the export contract requires (all PHP
// get_export_value semantics, byte-gated by the A/B suite):
// - export chains are LINEAR (compile_columns.ts), so the walk is positional;
// - NO publication gate, NO section whitelist, NO frontier queueing — export
//   serializes whatever the stored locators reference;
// - relation hops read the RAW stored 'relation' slice (array positions ARE
//   the index vector; holes/invalid entries consume a position — the legacy
//   walker indexed the raw array, and grid_value '|n' suffixes depend on it);
// - a missing matrix-table mapping falls back to the 'matrix' table (the
//   legacy `?? 'matrix'` read), instead of resolving to "no record".

/**
 * A chain step that reads data. Export chains are compiled by
 * export/compile_columns.ts from the user's own column path, so they never
 * contain a 'system' step nor a 'degraded' one (the export front-end resolves
 * its own tipos); both kinds are excluded here and filtered at the entry point.
 */
export type ExportChainStep = Exclude<ResolveStep, { kind: 'system' } | { kind: 'degraded' }>;

/** The per-request state of one export resolution run (caches only). */
export interface ExportAtomRun {
	tableCache: Map<string, string | null>;
	recordCache: Map<string, MatrixRecord | null>;
}

/** Fresh per-request run state (never module-scoped — request isolation). */
export function createExportAtomRun(): ExportAtomRun {
	return { tableCache: new Map(), recordCache: new Map() };
}

/**
 * Load ONE record through the export run's caches — the legacy reader twin:
 * unknown section tipos fall back to the 'matrix' table (PHP/legacy
 * `getMatrixTableFromTipo(...) ?? 'matrix'`), non-integer ids resolve to null.
 */
export async function loadExportRecord(
	run: ExportAtomRun,
	sectionTipo: string,
	sectionId: number | string,
): Promise<MatrixRecord | null> {
	const numeric = Number(sectionId);
	if (!Number.isInteger(numeric)) {
		run.recordCache.set(RECORD_KEY(sectionTipo, sectionId), null);
		return null;
	}
	const table = (await matrixTableOf(run, sectionTipo)) ?? 'matrix';
	return loadExportRecordFromTable(run, table, sectionTipo, numeric);
}

/**
 * The cache/eviction core of loadExportRecord with the table already resolved.
 * Also the export run's CellValueResolveOptions.loadRecord seam (the flat-value
 * resolvers resolve their own table and must never hit the `?? 'matrix'`
 * fallback — they early-return on a null table before consulting this). Both
 * callers key by (sectionTipo, sectionId) and derive the identical table for
 * every tipo the resolvers accept, so the shared map can never cross-poison.
 */
export async function loadExportRecordFromTable(
	run: ExportAtomRun,
	tableName: string,
	sectionTipo: string,
	sectionId: number,
): Promise<MatrixRecord | null> {
	const key = RECORD_KEY(sectionTipo, sectionId);
	const cached = run.recordCache.get(key);
	if (cached !== undefined) return cached;
	if (run.recordCache.size > RECORD_CACHE_LIMIT) run.recordCache.clear();
	const loaded = await readMatrixRecords(tableName, sectionTipo, [sectionId]);
	const record = loaded[0] ?? null;
	run.recordCache.set(key, record);
	return record;
}

/**
 * Bulk-hydrate the run's record cache for one section's id batch — ONE
 * `= ANY(int[])` query instead of one lazy single-row read per exported
 * record. Ids absent from the table seed null (a definitive miss, so the
 * lazy loader does not re-query them one by one).
 */
export async function prefetchExportRecords(
	run: ExportAtomRun,
	sectionTipo: string,
	sectionIds: (number | string)[],
): Promise<void> {
	const wanted = sectionIds
		.map((id) => Number(id))
		.filter((id) => Number.isInteger(id) && !run.recordCache.has(RECORD_KEY(sectionTipo, id)));
	if (wanted.length === 0) return;
	const table = (await matrixTableOf(run, sectionTipo)) ?? 'matrix';
	// Evict BEFORE seeding so a whole freshly-read chunk is never dropped.
	if (run.recordCache.size > RECORD_CACHE_LIMIT) run.recordCache.clear();
	const loaded = await readMatrixRecords(table, sectionTipo, wanted);
	const bySectionId = new Map(loaded.map((record) => [Number(record.section_id), record]));
	for (const id of wanted) {
		run.recordCache.set(RECORD_KEY(sectionTipo, id), bySectionId.get(id) ?? null);
	}
}

/** The raw stored 'relation' slice of one component (legacy hop contract). */
function rawRelationSlice(record: MatrixRecord | null, componentTipo: string): StoredLocator[] {
	const bag = (record?.columns.relation as Record<string, unknown[]> | null)?.[componentTipo];
	return Array.isArray(bag) ? (bag as StoredLocator[]) : [];
}

/** One pre-projection export atom: a leaf resolution site with provenance. */
export interface ExportLeafAtom {
	/** The compiled leaf step (tipo/model/declared section). */
	step: ExportChainStep;
	/** The runtime record the leaf reads from. */
	ownerSectionTipo: string;
	ownerSectionId: number | string;
	/** Stored-locator array position per traversed hop (raw positions). */
	indexVector: number[];
	/** Runtime owner record identity at EVERY chain position (leaf included) —
	 * the projection's key-fallback source (`step.section_tipo ?? owner`). */
	hopOwners: { sectionTipo: string; sectionId: number | string }[];
	/** For leaves stored in the relation column: the valid stored locators
	 * with their RAW array positions (grid_value per-target expansion) plus
	 * the stored `id`/`main_component_tipo` (the dataframe pairing key). */
	locators?: {
		sectionTipo: string;
		sectionId: number | string;
		index: number;
		id?: number | string;
		mainComponentTipo?: string;
	}[];
}

/**
 * Resolve one export field's atom events for one record — DFS over the linear
 * compiled chain, in stored-locator order (the legacy walker's event order,
 * which the grid placement and the value-format joins are byte-sensitive to).
 */
export async function resolveRecordAtoms(
	run: ExportAtomRun,
	field: FieldPlan,
	sectionTipo: string,
	sectionId: number | string,
): Promise<ExportLeafAtom[]> {
	const chain = field.sourceChain.filter(
		(step): step is ExportChainStep => step.kind !== 'system' && step.kind !== 'degraded',
	);
	const out: ExportLeafAtom[] = [];
	if (chain.length === 0) return out;

	const walk = async (
		position: number,
		ownerTipo: string,
		ownerId: number | string,
		indexVector: number[],
		previousOwners: { sectionTipo: string; sectionId: number | string }[],
	): Promise<void> => {
		const step = chain[position] as ExportChainStep;
		// Legacy guard: an empty component_tipo ends the subtree (no atoms).
		if (step.tipo === '') return;
		const hopOwners = [...previousOwners, { sectionTipo: ownerTipo, sectionId: ownerId }];

		if (position < chain.length - 1) {
			// Relation HOP: raw stored slice, recurse per valid locator, RAW index.
			const owner = await loadExportRecord(run, ownerTipo, ownerId);
			const bag = rawRelationSlice(owner, step.tipo);
			for (let index = 0; index < bag.length; index++) {
				const locator = bag[index];
				if (typeof locator?.section_tipo !== 'string' || locator.section_id === undefined) {
					continue;
				}
				await walk(
					position + 1,
					locator.section_tipo,
					Number(locator.section_id),
					[...indexVector, index],
					hopOwners,
				);
			}
			return;
		}

		// LEAF: emit the event; relation-column leaves carry their stored
		// locators (raw positions) for the grid_value per-target expansion.
		const atom: ExportLeafAtom = {
			step,
			ownerSectionTipo: ownerTipo,
			ownerSectionId: ownerId,
			indexVector,
			hopOwners,
		};
		if (getColumnNameByModel(step.model) === 'relation') {
			const owner = await loadExportRecord(run, ownerTipo, ownerId);
			const bag = rawRelationSlice(owner, step.tipo);
			const locators: NonNullable<ExportLeafAtom['locators']> = [];
			for (let index = 0; index < bag.length; index++) {
				const locator = bag[index];
				if (typeof locator?.section_tipo !== 'string' || locator.section_id === undefined) {
					continue;
				}
				locators.push({
					sectionTipo: locator.section_tipo,
					sectionId: locator.section_id as number | string,
					index,
					// The dataframe pairing key travels with the locator (PHP :871-79:
					// id_key = $locator->id, main = $locator->main_component_tipo ?? tipo).
					id: (locator as { id?: number | string }).id,
					mainComponentTipo: (locator as { main_component_tipo?: string }).main_component_tipo,
				});
			}
			atom.locators = locators;
		}
		out.push(atom);
	};

	await walk(0, sectionTipo, sectionId, [], []);
	return out;
}
