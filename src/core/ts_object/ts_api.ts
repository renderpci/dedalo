/**
 * DD_TS_API (PHP core/api/v1/common/class.dd_ts_api.php) — the thesaurus-tree
 * read/write API surface. Five actions, byte-parity envelopes and VERBATIM msg
 * strings (asserted by the PHP tests): get_node_data, get_children_data,
 * add_child, update_parent_data, save_order.
 *
 * Reads gate at permission ≥1, writes at ≥2 (PHP common::get_permissions on the
 * section). Every mutation runs inside ONE withTransaction that first acquires the
 * PHP-identical advisory node lock(s), does all validation BEFORE any write (no
 * orphan window), and invalidates caches only AFTER commit. Cache invalidation and
 * the dd_ontology order sync run post-commit, never inside the tx.
 *
 * The thin wrappers in api/dispatch.ts resolve the principal and forward here;
 * HTTP is always 200 (result:false on failure) — PHP parity.
 */

import type { Rqo } from '../concepts/rqo.ts';
import { readMatrixRecord } from '../db/matrix.ts';
import { updateMatrixKeyData } from '../db/matrix_write.ts';
import { acquireNodeLock, withTransaction } from '../db/postgres.ts';
import {
	RELATION_TYPE_LINK,
	RELATION_TYPE_PARENT,
	SI_NO_SECTION,
} from '../ontology/ontology_tipos.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import { getSectionMap } from '../ontology/section_map.ts';
import { getSectionIdFromTipo } from '../ontology/tld.ts';
import { getParentTipo } from '../relations/children.ts';
import {
	addParent,
	isAncestor,
	recalculateSiblingOrders,
	removeParent,
	sortChildren,
} from '../relations/parent.ts';
import { createSectionRecord } from '../section/record/create_record.ts';
import type { Principal } from '../security/permissions.ts';
import { getPermissions } from '../security/permissions.ts';
import {
	type ParseLocator,
	type TsOptions,
	invalidateNode,
	parseChildData,
	getChildrenData as tsGetChildrenData,
} from './ts_object.ts';

/** Standard {result, msg, errors} envelope. */
export interface TsApiResponse {
	result: unknown;
	msg: string;
	errors: string[];
	[extra: string]: unknown;
}

// ===========================================================================
// GET_NODE_DATA (PHP :95).
// ===========================================================================
export async function getNodeData(rqo: Rqo, principal: Principal): Promise<TsApiResponse> {
	const response: TsApiResponse = { result: false, msg: 'Error. Request failed', errors: [] };
	if (rqo.source === undefined) {
		response.errors.push('Missing source property in the request object.');
		response.msg = 'Invalid request. Source data is missing.';
		return response;
	}
	const source = rqo.source as Record<string, unknown>;
	const sectionTipo = (source.section_tipo as string | undefined) ?? null;
	const sectionId = source.section_id;
	const childrenTipo = (source.children_tipo as string | undefined) ?? null;
	const areaModel = (source.area_model as string | undefined) ?? 'area_thesaurus';
	const options = (rqo.options ?? {}) as Record<string, unknown>;
	const thesaurusViewMode = (options.thesaurus_view_mode as string | undefined) ?? 'default';

	// SEC: read ≥1 on the section.
	if (sectionTipo !== null && sectionTipo !== '') {
		const level = await getPermissions(principal, sectionTipo, sectionTipo);
		if (level < 1) {
			response.errors.push('insufficient permissions');
			response.msg = `Error. Insufficient permissions to read section (${sectionTipo})`;
			return response;
		}
	}

	const tsOptions: TsOptions = { model: thesaurusViewMode === 'model', area_model: areaModel };
	const locator: ParseLocator = {
		section_tipo: sectionTipo ?? undefined,
		section_id: sectionId as number | string | undefined,
	};
	if (childrenTipo !== null && childrenTipo !== '') locator.from_component_tipo = childrenTipo;

	const arChildrenData = await parseChildData([locator], areaModel, tsOptions, null, principal);
	const data = arChildrenData[0] ?? null;

	response.result = data;
	response.msg =
		response.errors.length === 0
			? 'OK. get_node_data request done successfully'
			: 'Warning! get_node_data request done with errors';
	return response;
}

// ===========================================================================
// GET_CHILDREN_DATA (PHP :211).
// ===========================================================================
export async function getChildrenData(rqo: Rqo, principal: Principal): Promise<TsApiResponse> {
	const response: TsApiResponse = { result: false, msg: 'Error. Request failed', errors: [] };
	if (rqo.source === undefined) {
		response.errors.push('Missing source property in the request object.');
		response.msg = 'Invalid request. Source data is missing.';
		return response;
	}
	const source = rqo.source as Record<string, unknown>;
	const sectionTipo = (source.section_tipo as string | undefined) ?? null;
	const sectionId = source.section_id;
	const childrenTipo = (source.children_tipo as string | undefined) ?? null;
	const areaModel = (source.model as string | undefined) ?? 'area_thesaurus';
	const children = (source.children as ParseLocator[] | undefined) ?? null;
	const options = (rqo.options ?? {}) as Record<string, unknown>;
	const pagination = (options.pagination as Record<string, unknown> | undefined) ?? null;
	const thesaurusViewMode = (options.thesaurus_view_mode as string | undefined) ?? 'default';

	if (sectionTipo !== null && sectionTipo !== '') {
		const level = await getPermissions(principal, sectionTipo, sectionTipo);
		if (level < 1) {
			response.errors.push('insufficient permissions');
			response.msg = `Error. Insufficient permissions to read section (${sectionTipo})`;
			return response;
		}
	}

	const tsOptions: TsOptions = { model: thesaurusViewMode === 'model', area_model: areaModel };
	const defaultLimit = 300;

	// mode A: standard children resolution (delegates to ts_object.getChildrenData).
	if ((children === null || children.length === 0) && sectionId && childrenTipo) {
		const result = await tsGetChildrenData(
			sectionTipo as string,
			sectionId as number | string,
			childrenTipo,
			defaultLimit,
			areaModel,
			tsOptions,
			pagination,
			principal,
		);
		return { result: result.result, msg: result.msg, errors: result.errors };
	}

	// mode B: pre-built children list.
	const parentLocator =
		sectionTipo && sectionId
			? { section_tipo: sectionTipo, section_id: sectionId as number | string }
			: null;
	const arChildrenData = await parseChildData(
		children ?? [],
		areaModel,
		tsOptions,
		parentLocator,
		principal,
	);
	response.result = { ar_children_data: arChildrenData, pagination };
	response.msg =
		response.errors.length === 0
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';
	return response;
}

/** The default si/no "yes" locator (dd64/1) an is_descriptor/is_indexable defaults to. */
function siNoYesLocator(componentTipo: string): Record<string, unknown> {
	return {
		id: 1,
		type: RELATION_TYPE_LINK,
		section_id: '1',
		section_tipo: SI_NO_SECTION,
		from_component_tipo: componentTipo,
	};
}

// ===========================================================================
// ADD_CHILD (PHP :352).
// ===========================================================================
export async function addChild(rqo: Rqo, principal: Principal): Promise<TsApiResponse> {
	const response: TsApiResponse = {
		result: false,
		msg: 'Error. Request failed [add_child]',
		errors: [],
	};
	const source = (rqo.source ?? {}) as Record<string, unknown>;
	const sectionTipo = source.section_tipo as string;
	const sectionId = source.section_id as number | string;

	// SEC-10: write ≥2.
	const permissions = await getPermissions(principal, sectionTipo, sectionTipo);
	if (permissions < 2) {
		response.errors.push('insufficient permissions');
		response.msg = `Error. Insufficient permissions to create in section (${sectionTipo})`;
		return response;
	}

	// Validations BEFORE any write (no orphan window).
	const sectionMap = await getSectionMap(sectionTipo);
	const thesaurus = (sectionMap?.thesaurus ?? {}) as {
		is_descriptor?: unknown;
		is_indexable?: unknown;
	};
	if (thesaurus.is_descriptor === undefined) {
		response.errors.push("Invalid section_map 'is_descriptor' property from section");
	}
	if (thesaurus.is_indexable === undefined) {
		response.errors.push("Invalid section_map 'is_indexable' property from section");
	}
	const parentRelationTipo = await getParentTipo(sectionTipo);
	if (parentRelationTipo === null) {
		response.msg = 'Error on get component_relation_parent from section. Model does not exists';
		response.errors.push(`Invalid component_relation_parent from section: ${sectionTipo}`);
		return response;
	}

	let newSectionId: number;
	try {
		newSectionId = await withTransaction(async () => {
			await acquireNodeLock(sectionTipo, sectionId);

			const createdId = await createSectionRecord(sectionTipo, principal.userId);

			const table = await getMatrixTableFromTipo(sectionTipo);
			if (table === null) throw new Error('Failed to resolve matrix table for new section');

			// is_descriptor default (dd64/1) when the section_map defines it.
			if (typeof thesaurus.is_descriptor === 'string' && thesaurus.is_descriptor !== '') {
				await updateMatrixKeyData(
					table,
					sectionTipo,
					createdId,
					'relation',
					thesaurus.is_descriptor,
					[siNoYesLocator(thesaurus.is_descriptor)],
				);
			}
			// is_indexable default (dd64/1) when defined.
			if (typeof thesaurus.is_indexable === 'string' && thesaurus.is_indexable !== '') {
				await updateMatrixKeyData(
					table,
					sectionTipo,
					createdId,
					'relation',
					thesaurus.is_indexable,
					[siNoYesLocator(thesaurus.is_indexable)],
				);
			}

			// ontology TLD inheritance: `<tld>0` sections copy ontology7 parent→child.
			if (getSectionIdFromTipo(sectionTipo) === '0') {
				const parentRecord = await readMatrixRecord(table, sectionTipo, Number(sectionId));
				const tldItems =
					((parentRecord?.columns.string as Record<string, unknown[]> | null)?.ontology7 as
						| unknown[]
						| undefined) ?? [];
				await updateMatrixKeyData(
					table,
					sectionTipo,
					createdId,
					'string',
					'ontology7',
					tldItems.length === 0 ? null : tldItems,
				);
			}

			// link to the parent node.
			const added = await addParent(sectionTipo, createdId, parentRelationTipo, {
				section_tipo: sectionTipo,
				section_id: sectionId,
				from_component_tipo: parentRelationTipo,
				type: RELATION_TYPE_PARENT,
			});
			if (!added.ok) throw new Error('Failed add parent locator to new section');

			return createdId;
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		response.msg = `Error on add_child. Process rolled back: ${message}`;
		response.errors.push(`add_child failed: ${message}`);
		return response;
	}

	// post-commit invalidation.
	invalidateNode(sectionTipo, sectionId);

	response.result = Math.trunc(Number(newSectionId));
	response.msg =
		response.errors.length === 0
			? 'OK. Added child successfully'
			: 'Warning! Added child with errors';
	return response;
}

// ===========================================================================
// UPDATE_PARENT_DATA (PHP :627).
// ===========================================================================
export async function updateParentData(rqo: Rqo, principal: Principal): Promise<TsApiResponse> {
	const response: TsApiResponse = { result: false, msg: 'Error. Request failed', errors: [] };
	const source = (rqo.source ?? {}) as Record<string, unknown>;
	const sectionTipo = source.section_tipo as string;
	const sectionId = source.section_id as number | string;
	const oldParentSectionId = source.old_parent_section_id as number | string;
	const oldParentSectionTipo = source.old_parent_section_tipo as string;
	const newParentSectionId = source.new_parent_section_id as number | string;
	const newParentSectionTipo = source.new_parent_section_tipo as string;

	// SEC-11: write ≥2.
	const permissions = await getPermissions(principal, sectionTipo, sectionTipo);
	if (permissions < 2) {
		response.errors.push('insufficient permissions');
		response.msg = `Error. Insufficient permissions to update in section (${sectionTipo})`;
		return response;
	}

	const parentTipo = await getParentTipo(sectionTipo);
	if (parentTipo === null) {
		response.errors.push('invalid component_relation_parent');
		response.msg = `Error. Unable to resolve component_relation_parent from section (${sectionTipo})`;
		return response;
	}

	// PRE-mutation cycle guard.
	const isSelfTarget =
		newParentSectionTipo === sectionTipo &&
		Math.trunc(Number(newParentSectionId)) === Math.trunc(Number(sectionId));
	if (
		isSelfTarget ||
		(await isAncestor(
			sectionTipo,
			sectionId,
			newParentSectionTipo,
			Math.trunc(Number(newParentSectionId)),
		))
	) {
		response.errors.push('cycle');
		response.msg = 'Error. The node cannot be moved under itself or under its own descendant';
		return response;
	}

	try {
		await withTransaction(async () => {
			// lock both parents in deterministic (strcmp) order.
			const lockKeys: [string, number][] = [
				[oldParentSectionTipo, Math.trunc(Number(oldParentSectionId))],
				[newParentSectionTipo, Math.trunc(Number(newParentSectionId))],
			];
			lockKeys.sort((a, b) => `${a[0]}_${a[1]}`.localeCompare(`${b[0]}_${b[1]}`, 'en'));
			for (const [tipo, id] of lockKeys) {
				await acquireNodeLock(tipo, id);
			}

			const removed = await removeParent(sectionTipo, Number(sectionId), parentTipo, {
				section_tipo: oldParentSectionTipo,
				section_id: oldParentSectionId,
				from_component_tipo: parentTipo,
				type: RELATION_TYPE_PARENT,
			});
			if (!removed)
				throw new Error(
					`Remove old parent locator failed: ${oldParentSectionTipo}_${oldParentSectionId}`,
				);

			const added = await addParent(sectionTipo, Number(sectionId), parentTipo, {
				section_tipo: newParentSectionTipo,
				section_id: newParentSectionId,
				from_component_tipo: parentTipo,
				type: RELATION_TYPE_PARENT,
			});
			if (!added.ok)
				throw new Error(
					`Add new parent locator failed: ${newParentSectionTipo}_${newParentSectionId}`,
				);

			await recalculateSiblingOrders(
				sectionTipo,
				oldParentSectionTipo,
				Math.trunc(Number(oldParentSectionId)),
			);
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		response.msg = `Error. Update parent data failed and was rolled back: ${message}`;
		response.errors.push(`update_parent_data failed: ${message}`);
		return response;
	}

	invalidateNode(sectionTipo, sectionId);
	invalidateNode(oldParentSectionTipo, oldParentSectionId);
	invalidateNode(newParentSectionTipo, newParentSectionId);

	response.result = true;
	response.msg =
		response.errors.length === 0
			? 'OK. Parent data updated successfully'
			: 'Warning! Parent data updated with errors';
	return response;
}

// ===========================================================================
// SAVE_ORDER (PHP :841).
// ===========================================================================
export async function saveOrder(rqo: Rqo, principal: Principal): Promise<TsApiResponse> {
	const response: TsApiResponse = { result: false, msg: 'Error. Request failed', errors: [] };
	const source = (rqo.source ?? {}) as Record<string, unknown>;
	const sectionTipo = source.section_tipo as string;
	const arLocators =
		(source.ar_locators as { section_tipo: string; section_id: number | string }[]) ?? [];
	const parentSectionTipo = (source.parent_section_tipo as string | undefined) ?? null;
	const parentSectionId = source.parent_section_id as number | string | undefined;

	// SEC-12: write ≥2.
	const permissions = await getPermissions(principal, sectionTipo, sectionTipo);
	if (permissions < 2) {
		response.errors.push('insufficient permissions');
		response.msg = `Error. Insufficient permissions to update order in section (${sectionTipo})`;
		return response;
	}

	if (
		parentSectionTipo === null ||
		parentSectionTipo === '' ||
		parentSectionId === undefined ||
		parentSectionId === null ||
		parentSectionId === ''
	) {
		response.msg = 'Error. parent_section_tipo and parent_section_id are required';
		response.errors.push('missing parent context');
		return response;
	}

	let result: Awaited<ReturnType<typeof sortChildren>>;
	try {
		result = await withTransaction(async () => {
			await acquireNodeLock(parentSectionTipo, Math.trunc(Number(parentSectionId)));
			return sortChildren(
				sectionTipo,
				arLocators,
				parentSectionTipo,
				Math.trunc(Number(parentSectionId)),
			);
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		response.msg = `Error. Save order failed and was rolled back: ${message}`;
		response.errors.push(`save_order failed: ${message}`);
		return response;
	}

	if (result !== false) {
		invalidateNode(parentSectionTipo, parentSectionId);
		// mirror the new order into dd_ontology.order_number (Track B ontology_write).
		const { syncOrderToDdOntology } = await import('../ontology/ontology_write.ts');
		await syncOrderToDdOntology(
			result.map((change) => ({
				value: change.value,
				locator: {
					section_tipo: change.locator.section_tipo,
					section_id: Math.trunc(Number(change.locator.section_id)),
				},
			})),
			parentSectionTipo,
			Math.trunc(Number(parentSectionId)),
		);
	}

	response.msg =
		result === false
			? 'Error. The order cannot be established. Invalid section map. Please, define a valid section list map such as {"order":"hierarchy49"}'
			: `OK. Order saved successfully. Changed values: ${result.length}`;
	response.result = result;
	return response;
}
