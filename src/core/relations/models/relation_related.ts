/**
 * RELATION_RELATED resolver (RELATIONS_SPEC.md §6.6 — associative links with
 * directionality and the transitive closure "if a=b and b=c then c=a").
 *
 * Every non-search mode attaches the COMPUTED back-references to the item
 * as `references` [{value, label}] — [] stays OFF the item (PHP
 * component_relation_related_json :160-173). The graph walk lives in
 * relations/related.ts; UNIDIRECTIONAL components skip it entirely.
 *
 * EDIT items emit even when the stored data is EMPTY (PHP: "must be
 * available even when empty to allow adding references from client") —
 * unlike the generic portal path, which skips empty relations.
 *
 * PHP references: class.component_relation_related.php
 * (get_references_recursive :274, get_type_rel :231),
 * component_relation_related_json.php (:90-173).
 */

import type { DataItem } from '../../resolve/component_data.ts';
import { buildDataItem } from '../../resolve/component_data.ts';
import type { RelationEmitContext, RelationModelResolver } from '../registry.ts';
import { PORTAL_LIST_LIMIT } from '../relation_core.ts';
import { portalResolver } from './portal.ts';

/** Attach computed references to the component's own item (non-search modes). */
async function attachReferences(
	context: RelationEmitContext,
	item: DataItem | undefined,
): Promise<void> {
	if (item === undefined || context.ddoMode === 'search') return;
	const { getCalculatedReferences } = await import('../related.ts');
	const { getNode } = await import('../../ontology/resolver.ts');
	const { buildRequestConfigForElement } = await import('../request_config/build.ts');
	const node = await getNode(context.ddo.tipo);
	const config = await buildRequestConfigForElement(node?.properties ?? null, {
		ownerTipo: context.ddo.tipo,
		ownerSectionTipo: context.row.section_tipo,
		mode: 'edit',
		ownerIsSection: false,
		lang: context.defaultLang,
	});
	const show = config[0]?.show as
		| { ddo_map: { tipo: string }[]; fields_separator?: string }
		| null
		| undefined;
	const references = await getCalculatedReferences(
		context.ddo.tipo,
		context.row.section_tipo,
		context.row.section_id,
		context.defaultLang,
		{
			showDdoTipos: (show?.ddo_map ?? []).map((ddo) => ddo.tipo),
			fieldsSeparator: show?.fields_separator ?? ' | ',
		},
	);
	if (references.length > 0) {
		item.references = references;
	}
}

export const relationRelatedResolver: RelationModelResolver = {
	model: 'component_relation_related',

	async emitDdoItems(context: RelationEmitContext): Promise<void> {
		const { ddo, record, row, ddoMode, callerTipo, emission } = context;

		// Only the LIST grid diverges; other modes take the generic portal path
		// — with the relation_related particularities: the item emits even when
		// EMPTY, and computed references attach to it.
		if (ddoMode !== 'list') {
			const before = emission.items.length;
			await portalResolver.emitDdoItems(context);
			let ownItem = emission.items
				.slice(before)
				.find((entry) => (entry as DataItem).tipo === ddo.tipo) as DataItem | undefined;
			if (ownItem === undefined && ddoMode !== 'search') {
				// Empty stored data: the portal path emits nothing — PHP still
				// emits the (empty) item so the client can add references.
				ownItem = buildDataItem(
					ddo.tipo,
					row.section_tipo,
					row.section_id,
					ddoMode,
					'lg-nolan',
					[],
				);
				ownItem.pagination = { total: 0, limit: ddo.limit ?? 10, offset: 0 };
				ownItem.parent_tipo = callerTipo;
				ownItem.parent_section_id = row.section_id;
				ownItem.row_section_id = row.section_id;
				emission.items.push(ownItem);
			}
			await attachReferences(context, ownItem);
			return;
		}

		// relation_related emits a list item even when empty (entries []) —
		// PRECEDED by each related target's section_id component item (PHP
		// list subdatum: the grid shows the related record ids as cells).
		const stored =
			((record.columns.relation as Record<string, unknown[]> | null)?.[context.dataTipo] as
				| { section_tipo?: string; section_id?: string | number }[]
				| undefined) ?? [];
		const { getSectionIdComponentTipo } = await import('../../ontology/section_id_component.ts');
		for (const locator of stored) {
			const targetSection = locator?.section_tipo;
			const targetId = locator?.section_id;
			if (typeof targetSection !== 'string' || targetId === undefined) continue;
			const idComponent = await getSectionIdComponentTipo(targetSection);
			if (idComponent === null) continue;
			const idItem = buildDataItem(idComponent, targetSection, targetId, ddoMode, 'lg-nolan', [
				Number(targetId),
			]);
			idItem.from_component_tipo = ddo.tipo;
			idItem.row_section_id = row.section_id;
			idItem.parent_tipo = callerTipo;
			emission.items.push(idItem);
		}
		// The relation item itself pages like a portal list cell.
		const page = stored
			.slice(0, PORTAL_LIST_LIMIT)
			.map((locator, index) => ({ ...locator, paginated_key: index }));
		const item = buildDataItem(
			ddo.tipo,
			row.section_tipo,
			row.section_id,
			ddoMode,
			'lg-nolan',
			page,
		);
		item.pagination = { total: stored.length, limit: PORTAL_LIST_LIMIT, offset: 0 };
		item.row_section_id = row.section_id;
		item.parent_tipo = callerTipo;
		emission.items.push(item);
		await attachReferences(context, item);
	},
};
