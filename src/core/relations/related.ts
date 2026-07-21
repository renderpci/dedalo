/**
 * RELATION_RELATED ENGINE (RELATIONS_SPEC.md §6.6) — associative links with
 * directionality and the INDIRECT resolution rule: if a=b and b=c then c=a.
 *
 * Directionality (ontology properties.config_relation.relation_type_rel):
 *   dd620 UNIDIRECTIONAL  — stored links only, no inverse lookup;
 *   dd467 BIDIRECTIONAL   — one inverse hop ("who points at me");
 *   dd621 MULTIDIRECTIONAL — full graph traversal: inverse references AND the
 *         stored links of every visited node expand recursively, deduped by a
 *         visited cache that prevents cycles.
 *
 * PHP references: class.component_relation_related.php —
 * get_references_recursive :274 (the traversal; the ROOT call never re-adds
 * the root's own stored data), get_references :387 (same-section inverse
 * containment on {section_tipo, section_id, from_component_tipo}, string
 * section_ids), get_calculated_references :152 (the {value, label} wrap with
 * the show-ddo label build), get_type_rel :231.
 */

import { readMatrixRecord } from '../db/matrix.ts';
import { getMatrixTableFromTipo, getModelByTipo, getNode } from '../ontology/resolver.ts';
import { resolveComponentValue } from '../resolve/component_data.ts';
import { findInverseReferences } from '../search/search_related.ts';
import { getRelationListValue } from './datalist.ts';

export const RELATED_UNIDIRECTIONAL = 'dd620';
export const RELATED_BIDIRECTIONAL = 'dd467';
export const RELATED_MULTIDIRECTIONAL = 'dd621';

/** One computed back-reference (PHP get_references output — string section_id). */
export interface RelatedReference {
	section_tipo: string;
	section_id: string;
	from_component_tipo: string;
}

/** The component's directionality (PHP __construct + get_type_rel :231). */
export function getRelationTypeRel(properties: unknown): string {
	const typeRel = (properties as { config_relation?: { relation_type_rel?: unknown } } | null)
		?.config_relation?.relation_type_rel;
	return typeof typeRel === 'string' && typeRel !== '' ? typeRel : RELATED_UNIDIRECTIONAL;
}

/**
 * Records of the SAME section whose stored relation contains a locator
 * pointing at (sectionTipo, sectionId) from this component (PHP
 * get_references :387). from_component_tipo on the results is always the
 * querying component — the recursion instantiates the same component type.
 */
export async function getReferences(
	tipo: string,
	sectionTipo: string,
	sectionId: number | string,
): Promise<RelatedReference[]> {
	const hits = await findInverseReferences(
		[{ section_tipo: sectionTipo, section_id: Number(sectionId), from_component_tipo: tipo }],
		{ limit: false, order: 'section_id', sectionTipos: [sectionTipo] },
	);
	return hits.map((hit) => ({
		section_tipo: hit.section_tipo,
		section_id: String(hit.section_id),
		from_component_tipo: tipo,
	}));
}

/** The stored locators of the component at a graph node (its own data). */
async function readStoredLinks(
	tipo: string,
	sectionTipo: string,
	sectionId: number | string,
): Promise<
	{ section_tipo?: string; section_id?: number | string; from_component_tipo?: string }[]
> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return [];
	const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
	return (
		((record?.columns.relation as Record<string, unknown[]> | null)?.[tipo] as {
			section_tipo?: string;
			section_id?: number | string;
			from_component_tipo?: string;
		}[]) ?? []
	);
}

/**
 * The relation-graph traversal (PHP get_references_recursive :274, ported
 * exactly including the quirks):
 * - the visited cache keys are "section_tipo_section_id_lang";
 * - every call first collects the node's INVERSE references;
 * - MULTIDIRECTIONAL also walks the node's STORED links — added to the
 *   result only on RECURSIVE calls (the root's own data is already the
 *   caller's stored data) — and recurses into both sets;
 * - stored-link elements are reduced to {section_tipo, section_id,
 *   from_component_tipo} (PHP builds a fresh 3-field element).
 */
export async function getReferencesRecursive(
	tipo: string,
	locator: { section_tipo: string; section_id: number | string; from_component_tipo: string },
	typeRel: string = RELATED_MULTIDIRECTIONAL,
	recursion = false,
	lang = 'lg-spa',
	visited: string[] = [],
): Promise<RelatedReference[]> {
	const cache = recursion ? visited : [];
	cache.push(`${locator.section_tipo}_${locator.section_id}_${lang}`);
	const references: RelatedReference[] = [];

	// References to me (inverse hop).
	const inverse = await getReferences(
		locator.from_component_tipo,
		locator.section_tipo,
		locator.section_id,
	);
	for (const result of inverse) {
		const key = `${result.section_tipo}_${result.section_id}_${lang}`;
		if (cache.includes(key)) continue;
		references.push(result);
		cache.push(key);
	}

	if (typeRel === RELATED_MULTIDIRECTIONAL) {
		// The node's stored links (a=b: what I point TO joins the graph).
		const stored = await readStoredLinks(
			locator.from_component_tipo,
			locator.section_tipo,
			locator.section_id,
		);
		for (const dataLocator of stored) {
			if (typeof dataLocator?.section_tipo !== 'string' || dataLocator.section_id === undefined) {
				continue;
			}
			const key = `${dataLocator.section_tipo}_${dataLocator.section_id}_${lang}`;
			if (cache.includes(key)) continue;
			const element: RelatedReference = {
				section_tipo: dataLocator.section_tipo,
				section_id: String(dataLocator.section_id),
				from_component_tipo: dataLocator.from_component_tipo ?? locator.from_component_tipo,
			};
			// Only recursive calls add stored links (the root's own data is the
			// caller's stored data — never duplicated, PHP :333-336).
			if (recursion) references.push(element);
			cache.push(key);
			// recurse into the stored link
			references.push(
				...(await getReferencesRecursive(
					tipo,
					{ ...element, from_component_tipo: element.from_component_tipo },
					typeRel,
					true,
					lang,
					cache,
				)),
			);
		}
		// References to references (c=a closure).
		for (const current of [...references]) {
			references.push(...(await getReferencesRecursive(tipo, current, typeRel, true, lang, cache)));
		}
	}

	return references;
}

/**
 * A reference's display label (PHP get_locator_value :1412 over the show-ddo
 * component tipos): each component's flat list VALUE (PHP get_value — the
 * same resolution the Referencias grid uses), EMPTY parts skipped (:1440),
 * survivors joined with the config fields_separator.
 */
async function labelOfReference(
	reference: RelatedReference,
	showDdoTipos: string[],
	fieldsSeparator: string,
	lang: string,
): Promise<string | null> {
	const { resolveCellValue } = await import('../resolve/relation_list.ts');
	const { getModelByTipo } = await import('../ontology/resolver.ts');
	const unresolved: string[] = [];
	const parts: string[] = [];
	for (const ddoTipo of showDdoTipos) {
		// component_section_id's get_value IS the record id (PHP renders it as
		// a plain string — the '6' in "6 | Colección Privada").
		if ((await getModelByTipo(ddoTipo)) === 'component_section_id') {
			parts.push(String(reference.section_id));
			continue;
		}
		const value = await resolveCellValue(
			reference.section_tipo,
			Number(reference.section_id),
			ddoTipo,
			lang,
			unresolved,
		);
		if (value !== null && value.trim() !== '') parts.push(value);
	}
	return parts.length > 0 ? parts.join(fieldsSeparator) : null;
}

/**
 * The computed back-references of one component instance, label-wrapped for
 * the client (PHP get_calculated_references :152): [] for UNIDIRECTIONAL;
 * the graph walk for BI/MULTI; each locator wrapped as {value, label} unless
 * onlyData (the get_data_with_references merge path).
 */
export async function getCalculatedReferences(
	tipo: string,
	sectionTipo: string,
	sectionId: number | string,
	lang: string,
	options: {
		onlyData?: boolean;
		showDdoTipos?: string[];
		fieldsSeparator?: string;
	} = {},
): Promise<unknown[]> {
	const node = await getNode(tipo);
	const typeRel = getRelationTypeRel(node?.properties ?? null);
	if (typeRel !== RELATED_BIDIRECTIONAL && typeRel !== RELATED_MULTIDIRECTIONAL) {
		return [];
	}
	const references = await getReferencesRecursive(
		tipo,
		{ section_tipo: sectionTipo, section_id: sectionId, from_component_tipo: tipo },
		typeRel,
		false,
		lang,
	);
	if (options.onlyData === true) return references;

	const separator = options.fieldsSeparator ?? ' | ';
	const wrapped: unknown[] = [];
	for (const reference of references) {
		wrapped.push({
			value: reference,
			label: await labelOfReference(reference, options.showDdoTipos ?? [], separator, lang),
		});
	}
	return wrapped;
}
