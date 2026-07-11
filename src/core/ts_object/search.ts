/**
 * TREE SEARCH (PHP area_thesaurus::search_thesaurus :551 + get_hierarchy_terms_sqo
 * :764) — resolve keyword/pinned search hits into a partial tree the client can
 * render: every hit plus the full ancestor chain of each hit (top-down), with the
 * complete sibling list at each ancestor level.
 *
 * searchThesaurus runs the (sanitized) client SQO, then per hit walks
 * getParentsRecursive, dedups nodes by `${tipo}:${id}` in insertion order, and
 * builds a TsNodeData for each. Root-level nodes get their display order from the
 * hierarchy main record (getMainOrder); children get a POSITIONAL order (index+1,
 * NOT the stored order value — PHP quirk preserved).
 *
 * getHierarchyTermsSqo builds the pinned-nodes SQO (an $or of $and groups). It
 * reproduces the PHP SHARED-$path MUTATION QUIRK: the `path` object is reused
 * across loop iterations by reference, so in the serialized SQO every group's
 * path.section_tipo ends up equal to the LAST node's section_tipo. Parity over
 * "fixing" (ledgered) — the live PHP JSON is the contract.
 */

import { sanitizeClientSqo } from '../concepts/sqo.ts';
import { sql } from '../db/postgres.ts';
import { getTldFromTipo, safeTld } from '../ontology/tld.ts';
import { getChildren } from '../relations/children.ts';
import {
	type ParentLocator,
	type RecursionError,
	getParentsRecursive,
} from '../relations/parent.ts';
import { buildSearchSql } from '../search/sql_assembler.ts';
import type { Principal } from '../security/permissions.ts';
import { type NodeLocator, fetchNodeInfo } from './node_repository.ts';
import { type TsNodeData, buildNodeData } from './ts_object.ts';

/**
 * The main display order of a TLD (PHP hierarchy::get_main_order → ontology::
 * get_main_order, since `hierarchy extends ontology`). It reads the ONTOLOGY MAIN
 * record (matrix_ontology_main / ontology35) for the TLD — NOT matrix_hierarchy_main
 * — then its hierarchy48 order. A thesaurus TLD with no ontology-main record (the
 * common case, e.g. 'tchi') resolves to NULL → the tree root order is null. Only
 * when an ontology main exists is the numeric hierarchy48 (default 0) returned.
 */
async function getMainOrder(tld: string | null): Promise<number | null> {
	const safe = tld === null ? null : safeTld(tld.trim().toLowerCase());
	if (safe === null) return null;
	const rows = (await sql.unsafe(
		`SELECT "number"->'hierarchy48'->0->>'value' AS ord
		 FROM matrix_ontology_main
		 WHERE section_tipo = 'ontology35'
		   AND string @> $1
		 LIMIT 1`,
		[JSON.stringify({ hierarchy6: [{ value: safe }] })],
	)) as { ord: string | null }[];
	if (rows.length === 0) return null; // no ontology main → null (order null)
	const value = rows[0]?.ord;
	return value !== null && value !== undefined ? Math.trunc(Number(value)) : 0;
}

export interface SearchThesaurusResult {
	result: TsNodeData[];
	msg: string;
	errors: RecursionError[];
	total: number;
	found: { section_tipo: string; section_id: number | string }[];
}

/**
 * Run a thesaurus search and assemble the ancestor-expanded partial tree (PHP
 * search_thesaurus). `sqo` is the untrusted client SQO (sanitized here). The
 * principal gates the search (projects filter) and the per-node permissions.
 */
export async function searchThesaurus(
	sqo: Record<string, unknown>,
	principal: Principal,
): Promise<SearchThesaurusResult> {
	const sanitized = sanitizeClientSqo(structuredClone(sqo));
	const built = await buildSearchSql(sanitized, { principal });
	const hits = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number | string;
	}[];

	const totalRecords = hits.length;
	const tsObjectsMap = new Map<string, TsNodeData>();
	const found: { section_tipo: string; section_id: number | string }[] = [];
	const ancestorsCache = new Map<string, ParentLocator[]>();
	const errors: RecursionError[] = [];

	for (const row of hits) {
		const sectionTipo = row.section_tipo;
		const sectionId = row.section_id;
		// PHP pushes the DB row section_id (a string) into `found`.
		found.push({ section_tipo: sectionTipo, section_id: String(sectionId) });

		const ancestorsKey = `${sectionTipo}_${sectionId}`;
		let ancestors = ancestorsCache.get(ancestorsKey);
		if (ancestors === undefined) {
			const walked = await getParentsRecursive(sectionId, sectionTipo);
			ancestors = walked.ancestors;
			errors.push(...walked.errors);
			ancestorsCache.set(ancestorsKey, ancestors);
		}

		if (ancestors.length === 0) {
			// a hit with no parents is itself a root term.
			const key = `${sectionTipo}:${sectionId}`;
			if (!tsObjectsMap.has(key)) {
				tsObjectsMap.set(key, await buildNodeData(sectionTipo, sectionId, {}, 'root', principal));
			}
			continue;
		}

		// walk top-down: [root, …, immediate parent].
		const path = [...ancestors].reverse();
		for (let parentKey = 0; parentKey < path.length; parentKey++) {
			const currentParent = path[parentKey] as ParentLocator;
			const childrenSectionId = currentParent.section_id;
			const childrenSectionTipo = currentParent.section_tipo;

			// full sibling list of this ancestor.
			const childrenData = await getChildren(childrenSectionId, childrenSectionTipo);
			const prefetched = await fetchNodeInfo(childrenData as unknown as NodeLocator[], null);

			for (const [childrenIndex, childLocator] of childrenData.entries()) {
				const key = `${childLocator.section_tipo}:${childLocator.section_id}`;
				if (tsObjectsMap.has(key)) continue;
				const tsParent = `${childrenSectionTipo}_${childrenSectionId}`;
				const nodeInfo = prefetched.get(
					`${childLocator.section_tipo}_${Math.trunc(Number(childLocator.section_id))}`,
				);
				tsObjectsMap.set(
					key,
					await buildNodeData(
						childLocator.section_tipo,
						childLocator.section_id,
						// order here is the POSITIONAL index (PHP quirk), not the stored value.
						{ order: childrenIndex + 1, is_indexable: nodeInfo?.is_indexable },
						tsParent,
						principal,
					),
				);
			}

			// the ancestor node itself.
			const parentNodeKey = `${currentParent.section_tipo}:${currentParent.section_id}`;
			if (!tsObjectsMap.has(parentNodeKey)) {
				const tsParent =
					parentKey === 0
						? 'root'
						: `${(path[parentKey - 1] as ParentLocator).section_tipo}_${(path[parentKey - 1] as ParentLocator).section_id}`;
				const options: { order?: number } = {};
				if (tsParent === 'root') {
					const rootTld = getTldFromTipo(currentParent.section_tipo);
					const rootOrder = await getMainOrder(rootTld);
					if (rootOrder) options.order = rootOrder;
				}
				tsObjectsMap.set(
					parentNodeKey,
					await buildNodeData(
						currentParent.section_tipo,
						currentParent.section_id,
						options,
						tsParent,
						principal,
					),
				);
			}
		}
	}

	return {
		result: [...tsObjectsMap.values()],
		msg: `Records found: ${totalRecords}`,
		errors,
		total: totalRecords,
		found,
	};
}

/** One pinned hierarchy_terms group (as stored in an area button's properties). */
export interface HierarchyTerm {
	value?: { section_tipo: string; section_id: number | string }[];
}

/**
 * Build the pinned-nodes SQO from a hierarchy_terms selection (PHP
 * get_hierarchy_terms_sqo :764). Emits an `$or` of `$and` groups (numeric
 * section_id via hierarchy22 + section_tipo via the virtual `section` column).
 *
 * SHARED-$path QUIRK (ledgered, parity-preserved): the `path` object is a SINGLE
 * shared reference mutated in the loop, exactly like PHP — so the serialized SQO
 * has every group's path[0].section_tipo equal to the LAST node's section_tipo.
 * Do not "fix" this; the live PHP JSON is the differential contract.
 */
export function getHierarchyTermsSqo(hierarchyTerms: HierarchyTerm[]): Record<string, unknown> {
	const arSectionTipos: string[] = [];

	// path for matching by numeric section_id (component_section_id 'hierarchy22').
	// ONE shared object reference, mutated per iteration (the PHP quirk source).
	const path: Record<string, unknown> = {
		component_tipo: 'hierarchy22',
		model: 'component_section_id',
		name: 'Id',
	};
	// path for matching by section_tipo (virtual 'section' model column).
	const pathSection: Record<string, unknown> = {
		model: 'section',
		name: 'Section tipo column',
	};

	const orGroups: Record<string, unknown>[] = [];
	for (const currentTerm of hierarchyTerms) {
		for (const item of currentTerm.value ?? []) {
			const currentSectionTipo = item.section_tipo;
			const currentSectionId = item.section_id;

			// mutate the SHARED path object (PHP `$path->section_tipo = …`).
			path.section_tipo = currentSectionTipo;
			arSectionTipos.push(currentSectionTipo);

			const filterItem = { q: currentSectionId, path: [path] };
			const filterItemSection = { q: currentSectionTipo, path: [pathSection] };
			orGroups.push({ $and: [filterItem, filterItemSection] });
		}
	}

	return {
		id: 'thesaurus',
		section_tipo: arSectionTipos,
		limit: 100,
		filter: { $or: orGroups },
		select: [],
	};
}
