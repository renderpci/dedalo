/**
 * TS_OBJECT (PHP core/ts_object/class.ts_object.php, read side) — assembles the
 * display payload of ONE thesaurus/ontology tree node for area_thesaurus /
 * area_ontology.
 *
 * A tree node is a section record. Guided by the section's `section_list_thesaurus`
 * ontology config (`properties.show.ddo_map`), buildNodeData iterates the mapped
 * elements (term / icon / link_children) and produces the TsNodeData object the
 * client renders as one tree row. The heavy reads (order, is_indexable,
 * is_descriptor) are batched through node_repository; term strings through
 * term_resolver.
 *
 * COVERAGE LEDGER (format_component_data model branches — PHP :1430):
 *   COVERED: term/string family (string/date/number/iri columns, lang-filtered),
 *   is_descriptor/icon relations, component_relation_index counts,
 *   link_children (children resolution + descriptor/ND classification),
 *   portal/autocomplete_hi (locators → term strings, cached).
 *   DEFERRED (ledgered): component_relation_related inverse-reference merge (tree
 *   term rarely a related component), component_svg URL/file-exists resolution
 *   (needs media machinery), get_indexation_grid (tag-indexation grid — counts
 *   only, per plan scope decision 3), the legacy component_relation_struct skip.
 *
 * PHP anchors: get_ar_elements (:212), parse_child_data (:329), get_data (:488),
 * get_children_data (:594), has_children_of_type (:714), is_indexable (:827),
 * get_permissions_element (:1111), get_count_data_group_by (:1202),
 * process_element_details/format_component_data/resolve_element_value (:1320-1604).
 */

import { config } from '../../config/config.ts';
import { type MatrixRecord, readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { createDataCache } from '../ontology/cache_factory.ts';
import { ONTOLOGY_STRUCTURE_LANG, labelByTipo } from '../ontology/labels.ts';
import {
	HIERARCHY_BUTTON_NEW,
	HIERARCHY_MAIN_SECTION,
	RELATION_TYPE_INDEX,
	THESAURUS_BUTTON_DELETE,
	THESAURUS_BUTTON_NEW,
	THESAURUS_SECTION,
} from '../ontology/ontology_tipos.ts';
import {
	findFirstDescendantTipoByModel,
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getNode,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import { getSectionMap } from '../ontology/section_map.ts';
import {
	type ChildLocator,
	countChildrenOrNull,
	getChildren,
	getChildrenRecursive,
	getComponentOrderTipo,
} from '../relations/children.ts';
import { currentDataLang } from '../resolve/request_lang.ts';
import { countInverseReferences } from '../search/search_related.ts';
import type { Principal } from '../security/permissions.ts';
import { getPermissions } from '../security/permissions.ts';
import { type NodeLocator, batchDescriptorFlags, fetchNodeInfo } from './node_repository.ts';
import { getTermByLocator, invalidateNode as invalidateTermNode } from './term_resolver.ts';

// DEDALO_DATA_LANG is read PER REQUEST via currentDataLang() at each use site
// (S2-11): PHP passes the per-request data lang (class.ts_object.php:1441-1445);
// a module-level capture froze the install default for every session.
/** DEDALO_DATA_LANG_DEFAULT — the main-lang fallback for untranslated term data. */
const DATA_LANG_DEFAULT = config.lang.dataLangDefault;
/** DEDALO_ONTOLOGY_SECTION_TIPO — the ontology main section root. */
const ONTOLOGY_SECTION_TIPO = 'ontology35';

/** One ddo_map entry (from section_list_thesaurus properties.show.ddo_map). */
interface DdoMapEntry {
	type?: string;
	tipo?: string | string[];
	icon?: string;
	show_data?: string;
	[extra: string]: unknown;
}

/** The caller options bag threaded into a node build (PHP $options stdClass). */
export interface TsOptions {
	order?: number | string | null;
	is_indexable?: boolean;
	model?: boolean | null;
	have_children?: boolean;
	area_model?: string;
}

/** One rendered element in a node's ar_elements. */
export interface TsElement {
	type: string;
	tipo: string | string[];
	value?: unknown;
	model?: string;
	model_value?: unknown;
	show_data?: string;
	count_result?: unknown;
}

/**
 * The node payload (PHP get_data() property insertion order preserved for wire
 * familiarity). children_tipo / has_descriptor_children / model_value are added
 * conditionally, exactly where PHP adds them.
 */
export interface TsNodeData {
	section_tipo: string;
	section_id: number | string;
	ts_id: string;
	ts_parent: string | null;
	order: number | string | null;
	mode: 'list';
	lang: string;
	is_descriptor: boolean;
	is_indexable: boolean;
	ar_elements: TsElement[];
	permissions_button_new: number;
	permissions_button_delete: number;
	children_tipo?: string | null;
	has_descriptor_children?: boolean;
}

// ---------------------------------------------------------------------------
// Resolved-child cache for indexation counting (content-keyed; bounded 1000).
// Data-derived (child sets come from relation data of arbitrary thesaurus
// records) with NO cheap reverse mapping from a written section to the cached
// subtrees containing it — so ANY record write/delete drops the whole cache
// (S2-10). PHP's twin was request-scoped; the full clear on write is the
// process-lifetime equivalent (the cache exists for within-request batch
// counting, so post-write cold starts are the designed cost, not a regression).
// ---------------------------------------------------------------------------
const resolvedChildCache = createDataCache<string, ChildLocator[]>((cache) => {
	cache.clear();
});

/** Targeted eviction after a tree write (PHP invalidate_node :1021). */
export function invalidateNode(sectionTipo: string, sectionId: number | string): void {
	invalidateTermNode(sectionTipo, sectionId);
	resolvedChildCache.clear();
}

// ---------------------------------------------------------------------------
// GET_AR_ELEMENTS (PHP :212).
// ---------------------------------------------------------------------------

/** The section_list_thesaurus ddo_map of a section (direct child, virtual-aware). */
async function readDdoMap(sectionTipo: string): Promise<DdoMapEntry[] | null> {
	const read = async (parent: string) =>
		(await sql.unsafe(
			`SELECT properties FROM dd_ontology WHERE parent = $1 AND model = 'section_list_thesaurus' LIMIT 1`,
			[parent],
		)) as { properties: { show?: { ddo_map?: DdoMapEntry[] } } | null }[];
	let rows = await read(sectionTipo);
	let props = rows[0]?.properties ?? null;
	if (props?.show?.ddo_map === undefined) {
		// virtual section → real section fallback (relations[0].tipo).
		const nodeRows = (await sql.unsafe('SELECT relations FROM dd_ontology WHERE tipo = $1', [
			sectionTipo,
		])) as { relations: { tipo?: unknown }[] | null }[];
		const real = nodeRows[0]?.relations?.[0]?.tipo;
		if (typeof real === 'string' && real !== sectionTipo) {
			rows = await read(real);
			props = rows[0]?.properties ?? null;
		}
	}
	const ddoMap = props?.show?.ddo_map;
	return Array.isArray(ddoMap) ? ddoMap : null;
}

/**
 * The ddo_map elements to render (PHP get_ar_elements :212). model transform:
 * model===false drops 'link_children_model'; model===true drops 'link_children'
 * for the hierarchy/ontology roots and promotes 'link_children_model'→'link_children'.
 */
export async function getArElements(
	sectionTipo: string,
	model: boolean | null = false,
): Promise<DdoMapEntry[]> {
	const ddoMap = await readDdoMap(sectionTipo);
	if (ddoMap === null) return [];
	const elements: DdoMapEntry[] = [];
	for (const current of ddoMap) {
		const type = current.type ?? null;
		if (model === false && type === 'link_children_model') {
			continue;
		}
		if (model === true) {
			if (
				type === 'link_children' &&
				(sectionTipo === HIERARCHY_MAIN_SECTION || sectionTipo === ONTOLOGY_SECTION_TIPO)
			) {
				continue;
			}
			if (type === 'link_children_model') {
				// promote a shallow copy so the shared ddo_map is not mutated.
				elements.push({ ...current, type: 'link_children' });
				continue;
			}
		}
		elements.push(current);
	}
	return elements;
}

// ---------------------------------------------------------------------------
// IS_INDEXABLE (PHP :827).
// ---------------------------------------------------------------------------
export async function isIndexable(
	sectionTipo: string,
	sectionId: number | string,
): Promise<boolean> {
	if (sectionTipo.startsWith('hierarchy') || sectionTipo.startsWith('ontology')) {
		return false; // roots are always structural
	}
	const model = await getModelByTipo(sectionTipo);
	if (model === null) return false;
	const sectionMap = await getSectionMap(sectionTipo);
	const isIndexableTipo = (sectionMap?.thesaurus as { is_indexable?: unknown } | undefined)
		?.is_indexable;
	if (isIndexableTipo === null || isIndexableTipo === undefined) return false;
	if (isIndexableTipo === false) return false;
	if (typeof isIndexableTipo !== 'string') return false;
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return false;
	const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
	const items =
		((record?.columns.relation as Record<string, { section_id?: unknown }[]> | null)?.[
			isIndexableTipo
		] as { section_id?: unknown }[] | undefined) ?? [];
	const first = items[0];
	return first?.section_id !== undefined && Math.trunc(Number(first.section_id)) === 1;
}

// ---------------------------------------------------------------------------
// GET_PERMISSIONS_ELEMENT (PHP :1111).
// ---------------------------------------------------------------------------

/**
 * First child component of `model` under a section subtree (virtual-aware).
 * Delegates to the canonical (cached, hub-cleared) T3 accessor — audit S2-19.
 */
async function sectionChildTipoByModel(sectionTipo: string, model: string): Promise<string | null> {
	return findFirstDescendantTipoByModel(sectionTipo, model);
}

/** The permission bitmask for a node UI control (PHP get_permissions_element). */
export async function getPermissionsElement(
	sectionTipo: string,
	elementName: 'button_new' | 'button_delete',
	principal: Principal,
): Promise<number> {
	const childPermissions = async (model: string): Promise<number> => {
		const buttonTipo = await sectionChildTipoByModel(sectionTipo, model);
		if (buttonTipo === null) return 0;
		return getPermissions(principal, sectionTipo, buttonTipo);
	};

	if (elementName === 'button_new') {
		if (sectionTipo === HIERARCHY_MAIN_SECTION) {
			return getPermissions(principal, sectionTipo, HIERARCHY_BUTTON_NEW);
		}
		if (sectionTipo === THESAURUS_SECTION) {
			return getPermissions(principal, sectionTipo, THESAURUS_BUTTON_NEW);
		}
		return childPermissions('button_new');
	}
	// button_delete
	if (sectionTipo === HIERARCHY_MAIN_SECTION) {
		return 0; // hierarchy roots are never deletable
	}
	if (sectionTipo === THESAURUS_SECTION) {
		return getPermissions(principal, sectionTipo, THESAURUS_BUTTON_DELETE);
	}
	return childPermissions('button_delete');
}

// ---------------------------------------------------------------------------
// GET_COUNT_DATA_GROUP_BY (PHP :1202) — indexation-icon counts.
// ---------------------------------------------------------------------------

/** The relation type used by an index component (default RELATION_TYPE_INDEX dd96). */
async function indexRelationType(componentTipo: string): Promise<string> {
	const props = ((await getNode(componentTipo))?.properties ?? null) as {
		config_relation?: { relation_type?: string };
	} | null;
	const configured = props?.config_relation?.relation_type;
	return typeof configured === 'string' && configured !== '' ? configured : RELATION_TYPE_INDEX;
}

interface CountGroupResult {
	total: number;
	// PHP count_data_group_by items carry `value` (not `count`); ts_object's
	// array_map enriches each with the ontology `label` and flattens `key`.
	totals_group: { key: string; label: string | null; value: number }[];
}

/**
 * Grouped indexation cross-reference count for an index-icon (PHP :1202). When
 * the ddo entry carries `show_data`, the count spans the node AND its recursive
 * descendants; otherwise just the node. The recursive child set is cached by
 * node identity (bounded 1000). Result shape mirrors count_data_group_by with the
 * label-enriched totals_group.
 */
export async function getCountDataGroupBy(
	sectionTipo: string,
	sectionId: number | string,
	componentTipo: string,
	ddoEntry: DdoMapEntry,
): Promise<CountGroupResult> {
	const relationType = await indexRelationType(componentTipo);
	const targets: { section_tipo: string; section_id: number | string }[] = [
		{ section_tipo: sectionTipo, section_id: sectionId },
	];
	if (ddoEntry.show_data !== undefined) {
		const cacheKey = `${sectionTipo}_${sectionId}`;
		let records = resolvedChildCache.get(cacheKey);
		if (records === undefined) {
			records = await getChildrenRecursive(sectionId, sectionTipo);
			if (resolvedChildCache.size >= 1000) resolvedChildCache.clear();
			resolvedChildCache.set(cacheKey, records);
		}
		for (const record of records) {
			targets.push({ section_tipo: record.section_tipo, section_id: record.section_id });
		}
	}

	const filterLocators = targets.map((target) => ({
		type: relationType,
		section_tipo: target.section_tipo,
		section_id: Number(target.section_id),
	}));
	const counted = await countInverseReferences(filterLocators, { groupBy: ['section_tipo'] });

	const totalsGroup: { key: string; label: string | null; value: number }[] = [];
	for (const group of counted.totals_group ?? []) {
		const key = group.key[0] ?? '';
		// Structure-lang term or first non-empty, null when the node has no term
		// (the old private copy's exact chain) — S2-27: resolved through the
		// cached canonical label module instead of a raw per-call query.
		totalsGroup.push({
			key,
			label: await labelByTipo(key, ONTOLOGY_STRUCTURE_LANG),
			value: group.value,
		});
	}
	return { total: counted.total, totals_group: totalsGroup };
}

// ---------------------------------------------------------------------------
// component data reads for the element loop.
// ---------------------------------------------------------------------------

/** Raw stored items for a component tipo on a preloaded record. */
function readItemsFromRecord(
	record: MatrixRecord | null,
	tipo: string,
	model: string,
): Record<string, unknown>[] {
	if (record === null) return [];
	const column = getColumnNameByModel(model);
	if (column === null) return [];
	const bag = record.columns[column as keyof typeof record.columns] as Record<
		string,
		Record<string, unknown>[]
	> | null;
	return bag?.[tipo] ?? [];
}

/**
 * The component_data for one element tipo (PHP get_data_lang + format_component_data).
 * relation_children → child locators; relation_index → [] (counted separately);
 * portal/autocomplete_hi → locators resolved to term strings; translatable string
 * families → lang-filtered items; everything else → raw items.
 */
async function getComponentDataLang(
	record: MatrixRecord | null,
	sectionTipo: string,
	sectionId: number | string,
	tipo: string,
	model: string,
	lang: string,
): Promise<unknown[]> {
	if (model === 'component_relation_index') return [];
	if (model === 'component_relation_children') {
		return getChildren(sectionId, sectionTipo, tipo);
	}

	let items = readItemsFromRecord(record, tipo, model);
	// Lang filter for literal families (string/date/iri/geo), in the component's
	// ELEMENT LANG (PHP common::get_element_lang :3684): a translatable component
	// resolves in DEDALO_DATA_LANG, a NON-translatable one in lg-nolan. This is
	// load-bearing for the empty-skip icon check — e.g. a non-translatable
	// text_area holding a lg-spa value is EMPTY for its element lang (lg-nolan),
	// so PHP skips the icon; reading it cross-lang would leak the icon.
	const column = getColumnNameByModel(model);
	const literalColumns = new Set(['string', 'date', 'iri', 'geo']);
	if (column !== null && literalColumns.has(column)) {
		const elementLang = (await getTranslatableByTipo(tipo)) ? lang : 'lg-nolan';
		items = items.filter((item) => (item.lang ?? 'lg-nolan') === elementLang);
	}

	// format_component_data: portal/autocomplete_hi → resolve locators to strings.
	if (model === 'component_portal' || model === 'component_autocomplete_hi') {
		const values: unknown[] = [];
		for (const locator of items) {
			values.push(await getTermByLocator(locator as NodeLocator, currentDataLang(), true));
		}
		return values;
	}
	return items;
}

/** get_component_data_fallback: main-lang → nolan → any non-empty (PHP :310). */
function componentDataFallbackValue(items: Record<string, unknown>[]): string {
	const pick = (lang: string): string => {
		const item = items.find((entry) => (entry.lang ?? 'lg-nolan') === lang);
		return typeof item?.value === 'string' ? item.value : '';
	};
	let value = pick(DATA_LANG_DEFAULT);
	if (value === '') value = pick('lg-nolan');
	if (value === '') {
		const any = items.find((entry) => typeof entry.value === 'string' && entry.value !== '');
		value = (any?.value as string | undefined) ?? '';
	}
	return value;
}

/** to_string parity for a scalar element value. */
function toStr(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// HAS_CHILDREN_OF_TYPE (PHP :714).
// ---------------------------------------------------------------------------
async function hasChildrenOfType(
	arChildren: { section_tipo?: string; section_id?: number | string }[],
	type: 'descriptor' | 'nd',
	options: TsOptions,
): Promise<boolean> {
	if (arChildren.length === 0) {
		if (type === 'descriptor') return options.have_children ?? false;
		return false;
	}
	const descriptorValue = type === 'descriptor' ? 1 : 2;
	const flags = await batchDescriptorFlags(arChildren as NodeLocator[]);
	for (const locator of arChildren) {
		const key = `${locator.section_tipo}_${Math.trunc(Number(locator.section_id))}`;
		if (flags.get(key) === descriptorValue) return true;
	}
	return false;
}

// ---------------------------------------------------------------------------
// BUILD_NODE_DATA (PHP get_data :488 + element resolution :1320-1604).
// ---------------------------------------------------------------------------
export async function buildNodeData(
	sectionTipo: string,
	sectionId: number | string,
	options: TsOptions,
	tsParent: string | null,
	principal: Principal,
): Promise<TsNodeData> {
	const isIndexableValue =
		options.is_indexable !== undefined
			? Boolean(options.is_indexable)
			: await isIndexable(sectionTipo, sectionId);

	const permissionsButtonNew = await getPermissionsElement(sectionTipo, 'button_new', principal);
	const permissionsButtonDelete = await getPermissionsElement(
		sectionTipo,
		'button_delete',
		principal,
	);

	// Property insertion order mirrors PHP get_data() exactly.
	const data: TsNodeData = {
		section_tipo: sectionTipo,
		// PHP builds the node through a locator, whose set_section_id casts to
		// string — so the payload section_id is ALWAYS a string on the wire.
		section_id: String(sectionId),
		ts_id: `${sectionTipo}_${sectionId}`,
		ts_parent: tsParent,
		order: options.order ?? null,
		mode: 'list',
		lang: currentDataLang(),
		is_descriptor: true,
		is_indexable: isIndexableValue,
		ar_elements: [],
		permissions_button_new: permissionsButtonNew,
		permissions_button_delete: permissionsButtonDelete,
	};

	const arElements = await getArElements(sectionTipo, options.model ?? null);
	if (arElements.length === 0) return data;

	// Preload the record once (all typed columns) for literal/relation reads.
	const table = await getMatrixTableFromTipo(sectionTipo);
	const record =
		table === null ? null : await readMatrixRecord(table, sectionTipo, Number(sectionId));

	for (const current of arElements) {
		const currentTipo = current.tipo ?? null;
		if (
			currentTipo === null ||
			currentTipo === '' ||
			(Array.isArray(currentTipo) && currentTipo.length === 0)
		) {
			continue;
		}
		// non-descriptor rule: no children config for ND nodes.
		if (data.is_descriptor === false && current.type === 'link_children') {
			data.children_tipo = null;
			continue;
		}
		const arElementTipo = Array.isArray(currentTipo) ? currentTipo : [currentTipo];
		const elementObj: TsElement = { type: current.type ?? '', tipo: currentTipo };

		const valid = await processElementDetails(
			current,
			arElementTipo,
			elementObj,
			data,
			record,
			sectionTipo,
			sectionId,
			options,
		);
		if (valid) data.ar_elements.push(elementObj);
	}

	return data;
}

/** PHP process_element_details (:1320): resolve each tipo, populate elementObj. */
async function processElementDetails(
	current: DdoMapEntry,
	arElementTipo: string[],
	elementObj: TsElement,
	data: TsNodeData,
	record: MatrixRecord | null,
	sectionTipo: string,
	sectionId: number | string,
	options: TsOptions,
): Promise<boolean> {
	for (const elementTipo of arElementTipo) {
		const model = await getModelByTipo(elementTipo);
		if (model === null || model === 'box elements') return false;
		// (legacy component_relation_struct skip is ledgered as deferred)

		const componentData = await getComponentDataLang(
			record,
			sectionTipo,
			sectionId,
			elementTipo,
			model,
			currentDataLang(),
		);

		const ok = await resolveElementValue(
			current,
			elementObj,
			elementTipo,
			model,
			componentData,
			data,
			record,
			sectionTipo,
			sectionId,
			options,
		);
		if (ok === false) return false;

		// model_value capture ('M' model-icon) is ledgered (needs component get_value);
		// the 'M' icon still renders its value below via resolveElementValue.
		if (elementObj.model === undefined) elementObj.model = model;
		if (current.show_data !== undefined) elementObj.show_data = current.show_data;
	}
	return true;
}

/** PHP resolve_element_value (:1504): dispatch by element type; false = skip. */
async function resolveElementValue(
	current: DdoMapEntry,
	elementObj: TsElement,
	elementTipo: string,
	model: string,
	componentData: unknown[],
	data: TsNodeData,
	record: MatrixRecord | null,
	sectionTipo: string,
	sectionId: number | string,
	options: TsOptions,
): Promise<boolean> {
	switch (elementObj.type) {
		case 'term': {
			let elementValue: unknown;
			if (componentData.length === 0) {
				// lang fallback: main-lang → nolan → any, decorated as untranslated.
				const rawItems = readItemsFromRecord(record, elementTipo, model);
				const fallback = componentDataFallbackValue(rawItems);
				elementValue = fallback === '' ? '' : `<mark>${toStr(fallback)}</mark>`;
			} else {
				const first = componentData[0] as { value?: unknown } | string | undefined;
				elementValue =
					first !== null && typeof first === 'object'
						? ((first as { value?: unknown }).value ?? '')
						: (first ?? '');
			}
			elementObj.value =
				elementObj.value !== undefined
					? `${toStr(elementObj.value)} ${toStr(elementValue)}`
					: toStr(elementValue);
			return true;
		}
		case 'icon': {
			if (current.icon === 'CH') return false;
			if (current.icon === 'ND') {
				const first = componentData[0] as { section_id?: unknown } | undefined;
				if (first?.section_id !== undefined && Math.trunc(Number(first.section_id)) === 2) {
					data.is_descriptor = false; // set_term_as_nd leaves the term value unchanged
				}
				return false;
			}
			elementObj.value = current.icon;
			if (model === 'component_relation_index') {
				const count = await getCountDataGroupBy(sectionTipo, sectionId, elementTipo, current);
				if (count.total === 0) return false;
				elementObj.value = `${current.icon}:${count.total}`;
				elementObj.count_result = count;
			} else if (componentData.length === 0) {
				return false;
			}
			return true;
		}
		case 'link_children': {
			data.children_tipo = elementTipo;
			const children = componentData as { section_tipo?: string; section_id?: number | string }[];
			data.has_descriptor_children =
				children.length === 0 ? false : await hasChildrenOfType(children, 'descriptor', options);
			elementObj.value =
				data.has_descriptor_children === true
					? 'button show children'
					: 'button show children unactive';
			const hasNd =
				children.length === 0 ? false : await hasChildrenOfType(children, 'nd', options);
			if (hasNd === true) {
				data.ar_elements.push({ type: 'link_children_nd', tipo: elementTipo, value: 'ND' });
			}
			return true;
		}
		default:
			elementObj.value = componentData;
			return true;
	}
}

// ---------------------------------------------------------------------------
// PARSE_CHILD_DATA (PHP :329).
// ---------------------------------------------------------------------------

/** A locator as it arrives from a child list / request source. */
export interface ParseLocator {
	section_tipo?: string;
	section_id?: number | string;
	from_component_tipo?: string;
	[extra: string]: unknown;
}

/**
 * Convert child locators into TsNodeData objects (PHP parse_child_data). Assumes
 * homogeneous children (order tipo resolved from the FIRST locator). Prefetches
 * order + is_indexable in one batch, parent-aware when `parentLocator` is given.
 * Invalid locators are skipped.
 */
export async function parseChildData(
	locators: ParseLocator[],
	areaModel: string,
	tsObjectOptions: TsOptions | null,
	parentLocator: NodeLocator | null,
	principal: Principal,
): Promise<TsNodeData[]> {
	void areaModel;
	const childrenData: TsNodeData[] = [];
	const firstLocator = locators[0];
	if (firstLocator === undefined || typeof firstLocator.section_tipo !== 'string') {
		return childrenData;
	}

	const componentOrderTipo = await getComponentOrderTipo(firstLocator.section_tipo);
	const prefetched = await fetchNodeInfo(locators as NodeLocator[], parentLocator);

	for (const locator of locators) {
		if (
			typeof locator.section_tipo !== 'string' ||
			locator.section_id === undefined ||
			locator.section_id === null
		) {
			continue;
		}
		const sectionTipo = locator.section_tipo;
		const sectionId = locator.section_id;
		const tsOptions: TsOptions = { ...(tsObjectOptions ?? {}) };

		const nodeInfo = prefetched.get(`${sectionTipo}_${Math.trunc(Number(sectionId))}`) ?? null;
		if (nodeInfo !== null) {
			tsOptions.order = componentOrderTipo !== null ? nodeInfo.order : null;
			tsOptions.is_indexable = nodeInfo.is_indexable;
		} else {
			tsOptions.order = null;
		}

		const childObject = await buildNodeData(sectionTipo, sectionId, tsOptions, null, principal);
		childrenData.push(childObject);
	}

	return childrenData;
}

// ---------------------------------------------------------------------------
// GET_CHILDREN_DATA (PHP :594).
// ---------------------------------------------------------------------------

export interface ChildrenDataResult {
	result: false | { ar_children_data: TsNodeData[]; pagination: Record<string, unknown> };
	msg: string;
	errors: string[];
}

/**
 * Load, paginate and format the direct children of a node (PHP get_children_data).
 * countChildrenOrNull → load-and-count fallback when null. Paginate only when
 * limit>0 && total>limit. default limit 300.
 */
export async function getChildrenData(
	sectionTipo: string,
	sectionId: number | string,
	childrenTipo: string,
	defaultLimit: number,
	areaModel: string,
	tsObjectOptions: TsOptions | null,
	pagination: Record<string, unknown> | null,
	principal: Principal,
): Promise<ChildrenDataResult> {
	const response: ChildrenDataResult = { result: false, msg: 'Error. Request failed', errors: [] };

	const model = await getModelByTipo(childrenTipo);
	if (model !== 'component_relation_children') {
		response.errors.push('Wrong model');
		response.msg += ` Expected model (component_relation_children) but calculated: ${model}`;
		return response;
	}

	const currentPagination: Record<string, unknown> =
		pagination !== null && pagination !== undefined
			? { ...pagination }
			: { limit: defaultLimit, offset: 0 };

	if (currentPagination.total === undefined) {
		let total = await countChildrenOrNull(sectionId, sectionTipo, childrenTipo);
		if (total === null) {
			const loaded = await getChildren(sectionId, sectionTipo, childrenTipo);
			total = loaded.length;
		}
		currentPagination.total = total;
	}

	const limit = Number(currentPagination.limit ?? defaultLimit);
	const offset = Number(currentPagination.offset ?? 0);
	const total = Number(currentPagination.total ?? 0);
	const usePagination = limit > 0 && total > limit;
	const children = usePagination
		? await getChildren(sectionId, sectionTipo, childrenTipo, limit, offset)
		: await getChildren(sectionId, sectionTipo, childrenTipo);

	const arChildrenData = await parseChildData(
		children as unknown as ParseLocator[],
		areaModel,
		tsObjectOptions,
		{ section_tipo: sectionTipo, section_id: sectionId },
		principal,
	);

	response.result = { ar_children_data: arChildrenData, pagination: currentPagination };
	response.msg =
		response.errors.length === 0
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';
	return response;
}
