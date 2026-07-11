/**
 * RELATION_INDEX resolver (RELATIONS_SPEC.md §6.4 — indexation, inverse
 * relations, "who calls me?"): component_relation_index stores nothing
 * meaningful forward; it CALCULATES its data by resolving the dd96 inverse
 * locators (every locator anywhere whose target is this record) through the
 * search_related flat-GIN engine.
 *
 * PHP references: class.component_relation_index.php (get_data :160,
 * get_data_paginated :205), class.search_related.php:489
 * (get_referenced_locators), component_relation_index_json.
 *
 * Phase A: verbatim strangler extraction of read_rows' relation-index
 * emission (list/tm cell + the get_data computed page). Phase D lands the
 * full §6.4 semantics (hierarchy40 external mode, tag indexation).
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

export const relationIndexResolver: RelationModelResolver = {
	model: 'component_relation_index',

	async emitDdoItems(context: RelationEmitContext): Promise<void> {
		// The computed inverse page only shapes list/tm cells; other modes take
		// the generic portal path (exactly the pre-registry monolith routing).
		if (context.ddoMode !== 'list' && context.ddoMode !== 'tm') {
			await portalResolver.emitDdoItems(context);
			return;
		}
		await emitRelationIndexData(
			context.ddo,
			context.row,
			context.ddoMode,
			context.defaultLang,
			context.callerTipo,
			context.emission,
			context.depth,
			context.emitDdo,
		);
	},
};

/**
 * component_relation_index list cell (PHP component_relation_index_json):
 * entries = one page of dd96 inverse locators (+ full count pagination);
 * children = the pointing sections' related_list components resolved against
 * [representative record, …page records] — first row of the request only.
 * No inverse references → NO data item at all (PHP skips on empty page).
 */
async function emitRelationIndexData(
	ddo: Ddo,
	row: { section_tipo: string; section_id: number },
	ddoMode: string,
	defaultLang: string,
	callerTipo: string,
	emission: EmissionContext,
	depth: number,
	emitDdo: EmitDdoFn,
): Promise<void> {
	const { findInverseReferenceLocators, countInverseReferences } = await import(
		'../../search/search_related.ts'
	);
	const { parseInverseEntry, getRelatedListChildTipos, getRepresentativeSectionId } = await import(
		'../../resolve/relation_index.ts'
	);
	const filter = {
		type: 'dd96', // DEDALO_RELATION_TYPE_INDEX_TIPO
		section_tipo: row.section_tipo,
		section_id: row.section_id,
	};
	const page = await findInverseReferenceLocators([filter], {
		limit: PORTAL_LIST_LIMIT,
		offset: 0,
		order: 'section_id',
	});
	if (page.length === 0) return;

	const counted = await countInverseReferences([filter], { groupBy: ['section_tipo'] });

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
	item.pagination = { total: counted.total, limit: PORTAL_LIST_LIMIT, offset: 0 };
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
	const filter = { type: 'dd96', section_tipo: sectionTipo, section_id: sectionId };
	const page = await findInverseReferenceLocators([filter], {
		limit,
		offset,
		order: 'section_id',
	});
	if (page.length === 0) return [];
	const counted = await countInverseReferences([filter], { groupBy: ['section_tipo'] });

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
