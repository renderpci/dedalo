/**
 * RELATION_INDEX resolver (RELATIONS_SPEC.md §6.4 — indexation, inverse
 * relations, "who calls me?"): component_relation_index stores nothing
 * meaningful forward; it CALCULATES its data by resolving the dd96 inverse
 * locators (every locator anywhere whose target is this record) through the
 * search_related flat-GIN engine.
 *
 * PHP references: class.component_relation_index.php (get_data :160,
 * get_data_paginated :205, get_target_section :839, get_filter_locator :872),
 * class.search_related.php:489 (get_referenced_locators),
 * component_relation_index_json.
 *
 * The computed inverse question is CONFIGURABLE per component (PHP
 * component_relation_common __construct :217 + get_target_section):
 * - relation TYPE = properties.config_relation.relation_type ?? dd96 (tch60/
 *   tchi59 declare dd151 — a plain "who references me", not an indexation);
 * - pointing sections = the request_config sqo targets when a config exists
 *   (tch60 → tch1/tch100/tch178), else 'all' (hierarchy40).
 * Children follow the PHP json controller's two subdatum strategies: an own
 * request_config expands its ddo_map portal-style (get_subdatum); without one
 * the pointing sections' related_list components are dumped per locator.
 */

import type { Ddo } from '../../concepts/ddo.ts';
import { readMatrixRecord } from '../../db/matrix.ts';
import { getMatrixTableFromTipo } from '../../ontology/resolver.ts';
import { type DataItem, EmissionContext, buildDataItem } from '../../resolve/component_data.ts';
import type { EmitDdoFn, RelationEmitContext, RelationModelResolver } from '../registry.ts';
import { PORTAL_LIST_LIMIT } from '../relation_core.ts';
import { portalResolver } from './portal.ts';

/** Pointing sections whose related_list ddos were already emitted in THIS
 * read — per-read memory in the EmissionContext scratch (S2-29; was a module
 * WeakMap keyed by the request's data array). PHP re-parents the SHARED cached
 * section context's ddo_map after the first relation_index row (json
 * controller "update parents" step), so every later row of the same request
 * finds no section children and emits the entries item alone — a pinned
 * per-request state bleed the differential must reproduce. */
const SOLVED_SECTIONS = Symbol('relation_index.solvedSections');

/** The component's effective inverse-question filters (see the header). */
interface RelationIndexConfig {
	/** PHP $this->relation_type: config_relation.relation_type ?? dd96. */
	relationType: string;
	/** PHP get_target_section(): request_config sqo targets, else 'all'. */
	targetSections: string[] | 'all';
	/** PHP isset(properties->source->request_config) — picks the subdatum strategy. */
	hasRequestConfig: boolean;
	/** Edit page size: own sqo/sqo_config limit (LAST config item wins) ?? 10. */
	editLimit: number;
}

/**
 * Shared beyond this resolver: ts_object's tree badge counter (PHP
 * get_count_data_group_by → component count_data_group_by, which applies the
 * SAME get_target_section filter) resolves the component's inverse question
 * through this too.
 */
export async function resolveIndexConfig(
	tipo: string,
	ownerSectionTipo: string,
): Promise<RelationIndexConfig> {
	const { getNode } = await import('../../ontology/resolver.ts');
	const node = await getNode(tipo);
	const properties = (node?.properties ?? null) as {
		config_relation?: { relation_type?: unknown };
		source?: {
			request_config?: {
				sqo?: { limit?: unknown };
				show?: { sqo_config?: { limit?: unknown } };
			}[];
		};
	} | null;
	const rawType = properties?.config_relation?.relation_type;
	const relationType = typeof rawType === 'string' && rawType !== '' ? rawType : 'dd96';
	const requestConfig = properties?.source?.request_config;
	const hasRequestConfig = requestConfig !== undefined && requestConfig !== null;

	// PHP get_target_section: the request_config sqo targets when a config
	// exists; an EMPTY extraction falls back to the ['all'] default.
	let targetSections: string[] | 'all' = 'all';
	if (hasRequestConfig) {
		const { getElementTargetSectionTipos } = await import('../request_config/build.ts');
		const tipos = await getElementTargetSectionTipos(tipo, ownerSectionTipo);
		if (tipos.length > 0) targetSections = tipos;
	}

	// The expandPortal EDIT limit chain (relation_core): sqo.limit ??
	// show.sqo_config.limit, LAST config item wins, default 10.
	let editLimit = 10;
	if (Array.isArray(requestConfig)) {
		for (const item of requestConfig) {
			const candidate = item?.sqo?.limit ?? item?.show?.sqo_config?.limit;
			if (typeof candidate === 'number') editLimit = candidate;
		}
	}
	return { relationType, targetSections, hasRequestConfig, editLimit };
}

export const relationIndexResolver: RelationModelResolver = {
	model: 'component_relation_index',

	async emitDdoItems(context: RelationEmitContext): Promise<void> {
		// PHP component_relation_index_json runs the SAME computed flow in every
		// mode; TS routes list/tm cells AND the edit read through it. Remaining
		// modes (search rows carry no real record to invert) keep the generic
		// portal fallback.
		if (context.ddoMode !== 'list' && context.ddoMode !== 'tm' && context.ddoMode !== 'edit') {
			await portalResolver.emitDdoItems(context);
			return;
		}
		const config = await resolveIndexConfig(context.ddo.tipo, context.row.section_tipo);
		if (config.hasRequestConfig) {
			await emitOwnConfigIndexData(context, config);
			return;
		}
		await emitRelationIndexData(context, config);
	},
};

/**
 * Own-request_config strategy (PHP json controller's get_subdatum branch):
 * the computed inverse page becomes the component's relation slot on a
 * synthetic record, and the generic portal machinery expands the component's
 * OWN ddo_map children over each pointing record (per-locator grouping,
 * self→target resolution, re-stamp rules — all shared). The portal only sees
 * one page, so its pagination.total is re-stamped with the FULL inverse count
 * afterwards (PHP pagination->total = count_data()).
 */
async function emitOwnConfigIndexData(
	context: RelationEmitContext,
	config: RelationIndexConfig,
): Promise<void> {
	const { ddo, row, ddoMode, emission, dataTipo } = context;
	const { findInverseReferenceLocators, countInverseReferences } = await import(
		'../../search/search_related.ts'
	);
	const { parseInverseEntry } = await import('../../resolve/relation_index.ts');

	// The page limit mirrors expandPortal's mode chains EXACTLY, then is pinned
	// onto the delegated ddo so the pre-fetched page and the portal slice agree.
	let limit: number;
	if (ddoMode === 'list' || ddoMode === 'tm') {
		const { resolveListCellMap } = await import('../../section/list_definitions/section_list.ts');
		limit = ddo.limit ?? (await resolveListCellMap(ddo.tipo)).cellLimit ?? PORTAL_LIST_LIMIT;
	} else {
		limit = ddo.limit ?? config.editLimit;
	}

	const filter = {
		type: config.relationType,
		section_tipo: row.section_tipo,
		section_id: row.section_id,
	};
	const page = await findInverseReferenceLocators([filter], {
		limit,
		offset: 0,
		order: 'section_id',
		sectionTipos: config.targetSections,
	});
	if (page.length === 0) return;
	const counted = await countInverseReferences([filter], {
		sectionTipos: config.targetSections,
	});

	const relationSlot = {
		...((context.record.columns.relation as Record<string, unknown[]> | null) ?? {}),
		[dataTipo]: page.map(parseInverseEntry),
	};
	const syntheticRecord = {
		...context.record,
		columns: { ...context.record.columns, relation: relationSlot },
	};
	const before = emission.items.length;
	await portalResolver.emitDdoItems({
		...context,
		record: syntheticRecord,
		ddo: { ...ddo, limit } as Ddo,
	});
	for (let i = before; i < emission.items.length; i++) {
		const item = emission.items[i] as DataItem;
		if (item.tipo === ddo.tipo) {
			item.pagination = { total: counted.total, limit, offset: 0 };
			break;
		}
	}
}

/**
 * No-request_config strategy (PHP json controller's per-locator branch):
 * entries = one page of inverse locators (+ full count pagination);
 * children = the pointing sections' related_list components resolved against
 * [representative record, …page records] — first row of the request only.
 * No inverse references → NO data item at all (PHP skips on empty page).
 */
async function emitRelationIndexData(
	context: RelationEmitContext,
	config: RelationIndexConfig,
): Promise<void> {
	const { ddo, row, ddoMode, defaultLang, callerTipo, emission, depth, emitDdo } = context;
	const { findInverseReferenceLocators, countInverseReferences } = await import(
		'../../search/search_related.ts'
	);
	const { parseInverseEntry, getRelatedListChildTipos, getRepresentativeSectionId } = await import(
		'../../resolve/relation_index.ts'
	);
	const filter = {
		type: config.relationType,
		section_tipo: row.section_tipo,
		section_id: row.section_id,
	};
	// list/tm keep the pinned 1-locator cell page; the edit read pages at the
	// component's edit limit (PHP get_data_paginated pagination->limit).
	const limit =
		ddoMode === 'list' || ddoMode === 'tm' ? PORTAL_LIST_LIMIT : (ddo.limit ?? config.editLimit);
	const page = await findInverseReferenceLocators([filter], {
		limit,
		offset: 0,
		order: 'section_id',
		sectionTipos: config.targetSections,
	});
	if (page.length === 0) return;

	const counted = await countInverseReferences([filter], {
		sectionTipos: config.targetSections,
		groupBy: ['section_tipo'],
	});

	const item = buildDataItem(
		ddo.tipo,
		row.section_tipo,
		row.section_id,
		ddoMode,
		'lg-nolan',
		page.map(parseInverseEntry),
	);
	item.from_component_tipo = ddo.tipo;
	item.row_section_id = row.section_id;
	item.parent_tipo = callerTipo;
	item.pagination = { total: counted.total, limit, offset: 0 };
	emission.items.push(item);

	// Children — once per pointing section per read (see the scratch note).
	let solved = emission.scratch.get(SOLVED_SECTIONS) as Set<string> | undefined;
	if (solved === undefined) {
		solved = new Set();
		emission.scratch.set(SOLVED_SECTIONS, solved);
	}
	for (const group of counted.totals_group ?? []) {
		const pointingSection = group.key[0];
		if (pointingSection === undefined || solved.has(pointingSection)) continue;
		solved.add(pointingSection);
		const table = await getMatrixTableFromTipo(pointingSection);
		if (table === null) continue;
		// Record pool: the representative first (limit-1 default-order search),
		// then this page's locators of the same section (pool accumulation).
		const recordIds: number[] = [];
		const representative = await getRepresentativeSectionId(table, pointingSection);
		if (representative !== null) recordIds.push(representative);
		for (const hit of page) {
			if (hit.section_tipo === pointingSection && !recordIds.includes(hit.section_id)) {
				recordIds.push(hit.section_id);
			}
		}
		const childTipos = await getRelatedListChildTipos(pointingSection);
		if (childTipos.length === 0) continue;
		for (const recordId of recordIds) {
			const targetRecord = await readMatrixRecord(table, pointingSection, recordId);
			if (targetRecord === null) continue;
			for (const childTipo of childTipos) {
				const before = emission.items.length;
				await emitDdo(
					{ tipo: childTipo, section_tipo: pointingSection, parent: ddo.tipo, mode: 'list' } as Ddo,
					[],
					targetRecord,
					{ section_tipo: pointingSection, section_id: recordId },
					'list',
					'lg-nolan',
					callerTipo,
					emission,
					false, // related_list children stay one level (PHP relation_list nodes)
					depth + 1,
				);
				for (let i = before; i < emission.items.length; i++) {
					const child = emission.items[i] as DataItem;
					child.mode = 'related_list';
					child.from_component_tipo = child.tipo;
					child.row_section_id = row.section_id;
					child.parent_tipo = callerTipo;
					(child as DataItem & { parent?: string }).parent = ddo.tipo;
					emission.markStamped(child); // outer portals must not re-stamp
				}
			}
		}
	}
}

/**
 * relation_index get_data (PHP component_relation_index_json through the
 * component read): offset-aware inverse page + pool-accumulated children.
 * PHP's per-locator loop calls get_json on the SAME cached related_list
 * section instance, whose record pool only grows — so locator pass i emits
 * the related_list components of EVERY pool record so far (duplicates and
 * all: limit 3 → 3+6+9 child items). offset 0 seeds the pool with each
 * pointing section's representative record (get_related_section_context);
 * later pages skip it. Children: mode 'related_list', row/parent stamped
 * with the TARGET record (row_section_id = target id, parent_tipo = the
 * pointing section tipo).
 */
export async function readRelationIndexData(
	tipo: string,
	sectionTipo: string,
	sectionId: string,
	limit: number,
	offset: number,
	requestLang: string,
	emitDdo: EmitDdoFn,
	mode = 'list',
): Promise<DataItem[]> {
	const { findInverseReferenceLocators, countInverseReferences } = await import(
		'../../search/search_related.ts'
	);
	const { parseInverseEntry, getRelatedListChildTipos, getRepresentativeSectionId } = await import(
		'../../resolve/relation_index.ts'
	);
	const config = await resolveIndexConfig(tipo, sectionTipo);
	const filter = { type: config.relationType, section_tipo: sectionTipo, section_id: sectionId };
	const page = await findInverseReferenceLocators([filter], {
		limit,
		offset,
		order: 'section_id',
		sectionTipos: config.targetSections,
	});
	if (page.length === 0) return [];
	const counted = await countInverseReferences([filter], {
		sectionTipos: config.targetSections,
		groupBy: ['section_tipo'],
	});

	// Own-request_config strategy: delegate to the portal machinery over a
	// synthetic record holding the computed page (see emitOwnConfigIndexData);
	// no representative seeding, no pool quirk (PHP get_subdatum branch).
	if (config.hasRequestConfig) {
		const emission = new EmissionContext();
		const syntheticRecord = {
			id: 0,
			section_id: Number(sectionId),
			section_tipo: sectionTipo,
			columns: { relation: { [tipo]: page.map(parseInverseEntry) } },
			rawText: {},
		};
		await portalResolver.emitDdoItems({
			ddo: { tipo, section_tipo: sectionTipo, mode, limit } as Ddo,
			ddoMap: [],
			record: syntheticRecord,
			row: { section_tipo: sectionTipo, section_id: Number(sectionId) },
			model: 'component_relation_index',
			dataTipo: tipo,
			ddoMode: mode,
			ddoLang: 'lg-nolan',
			defaultMode: mode,
			defaultLang: requestLang,
			callerTipo: tipo,
			emission,
			allowOwnConfigChildren: true,
			depth: 0,
			emitDdo,
		});
		for (const emitted of emission.items) {
			const item = emitted as DataItem;
			if (item.tipo !== tipo) continue;
			// get_data echoes the source's RAW (string) id + the FULL count.
			item.section_id = sectionId;
			item.pagination = { total: counted.total, limit, offset };
			break;
		}
		return emission.items as DataItem[];
	}

	const emission = new EmissionContext();
	const item = buildDataItem(
		tipo,
		sectionTipo,
		sectionId, // the source's raw (string) id — PHP echoes it as given
		mode,
		'lg-nolan',
		page.map(parseInverseEntry),
	);
	item.pagination = { total: counted.total, limit, offset };
	item.parent_tipo = tipo;
	emission.items.push(item);

	// The record pool (unique targets, insertion order).
	const pool: { sectionTipo: string; sectionId: number }[] = [];
	const seen = new Set<string>();
	const poolAdd = (targetSection: string, targetId: number): void => {
		const key = `${targetSection}_${targetId}`;
		if (seen.has(key)) return;
		seen.add(key);
		pool.push({ sectionTipo: targetSection, sectionId: targetId });
	};
	if (offset === 0) {
		for (const group of counted.totals_group ?? []) {
			const pointingSection = group.key[0];
			if (pointingSection === undefined) continue;
			const table = await getMatrixTableFromTipo(pointingSection);
			if (table === null) continue;
			const representative = await getRepresentativeSectionId(table, pointingSection);
			if (representative !== null) poolAdd(pointingSection, representative);
		}
	}
	for (const hit of page) {
		poolAdd(hit.section_tipo, hit.section_id);
		// One FULL pool dump per locator pass (the PHP instance-cache quirk).
		for (const entry of pool) {
			const table = await getMatrixTableFromTipo(entry.sectionTipo);
			if (table === null) continue;
			const targetRecord = await readMatrixRecord(table, entry.sectionTipo, entry.sectionId);
			if (targetRecord === null) continue;
			for (const childTipo of await getRelatedListChildTipos(entry.sectionTipo)) {
				const before = emission.items.length;
				await emitDdo(
					{ tipo: childTipo, section_tipo: entry.sectionTipo, parent: tipo, mode: 'list' } as Ddo,
					[],
					targetRecord,
					{ section_tipo: entry.sectionTipo, section_id: entry.sectionId },
					'list',
					requestLang,
					entry.sectionTipo, // parent_tipo = the pointing SECTION here
					emission,
					false,
					1,
				);
				for (let i = before; i < emission.items.length; i++) {
					const childItem = emission.items[i] as DataItem;
					childItem.mode = 'related_list';
					childItem.from_component_tipo = childItem.tipo;
					emission.markStamped(childItem);
				}
			}
		}
	}
	return emission.items as DataItem[];
}
