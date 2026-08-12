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
import { coerceSectionId } from '../concepts/section_id.ts';
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
import { getSectionIdFromTipo, requiredOntologyTld } from '../ontology/tld.ts';
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
	invalidateNode,
	type ParseLocator,
	parseChildData,
	type TsOptions,
	getChildrenData as tsGetChildrenData,
} from './ts_object.ts';

/** Standard {result, msg, errors} envelope. */
export interface TsApiResponse {
	result: unknown;
	msg: string;
	errors: string[];
	[extra: string]: unknown;
}

/**
 * THE dd_ts_api DOOR (WC-2026-08-10-section-id-int-canonical). Every section_id
 * in this API's RQO body addresses a TREE NODE, i.e. a matrix record — so it is
 * coerced here, once, counted under its own deprecable source key, instead of
 * riding a string leg into the engine's Number() casts. Non-address junk (a
 * synthetic token, a padded external id) refuses loudly through the caller's
 * error envelope rather than reading a wrong record.
 */
function doorSectionId(raw: unknown, door: string): number {
	return coerceSectionId(raw, `rqo.dd_ts_api.${door}`);
}

/**
 * The same door for an OPTIONAL section_id: absent (or the legacy empty-string
 * spelling of absent) stays absent, present is coerced and counted. Throws like
 * `doorSectionId` so the caller answers with `badSectionIdResponse`.
 */
function optionalDoorSectionId(raw: unknown, door: string): number | undefined {
	if (raw === undefined || raw === null || raw === '') return undefined;
	return doorSectionId(raw, door);
}

/** The refusal envelope for a door coercion that threw. */
function badSectionIdResponse(response: TsApiResponse, error: unknown): TsApiResponse {
	const message = error instanceof Error ? error.message : String(error);
	response.result = false;
	response.errors.push('invalid section_id');
	response.msg = `Error. Invalid section_id: ${message}`;
	return response;
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
	let sectionId: number | undefined;
	try {
		sectionId = optionalDoorSectionId(source.section_id, 'get_node_data.section_id');
	} catch (error) {
		return badSectionIdResponse(response, error);
	}
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
		section_id: sectionId,
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

/** The get_children_data RQO, read into its typed fields (defaults applied). */
interface ChildrenDataRequest {
	sectionTipo: string | null;
	sectionId: number | undefined;
	childrenTipo: string | null;
	areaModel: string;
	children: ParseLocator[] | null;
	pagination: Record<string, unknown> | null;
	thesaurusViewMode: string;
}

/**
 * Read the get_children_data RQO into `ChildrenDataRequest`, applying the PHP
 * defaults. Throws only from the section_id door, so the caller answers a bad
 * address with `badSectionIdResponse`.
 */
function parseChildrenDataRequest(rqo: Rqo): ChildrenDataRequest {
	const source = rqo.source as Record<string, unknown>;
	const options = (rqo.options ?? {}) as Record<string, unknown>;
	return {
		sectionTipo: (source.section_tipo as string | undefined) ?? null,
		sectionId: optionalDoorSectionId(source.section_id, 'get_children_data.section_id'),
		childrenTipo: (source.children_tipo as string | undefined) ?? null,
		areaModel: (source.model as string | undefined) ?? 'area_thesaurus',
		children: (source.children as ParseLocator[] | undefined) ?? null,
		pagination: (options.pagination as Record<string, unknown> | undefined) ?? null,
		thesaurusViewMode: (options.thesaurus_view_mode as string | undefined) ?? 'default',
	};
}

export async function getChildrenData(rqo: Rqo, principal: Principal): Promise<TsApiResponse> {
	const response: TsApiResponse = { result: false, msg: 'Error. Request failed', errors: [] };
	if (rqo.source === undefined) {
		response.errors.push('Missing source property in the request object.');
		response.msg = 'Invalid request. Source data is missing.';
		return response;
	}
	let request: ChildrenDataRequest;
	try {
		request = parseChildrenDataRequest(rqo);
	} catch (error) {
		return badSectionIdResponse(response, error);
	}
	const { sectionTipo, sectionId, childrenTipo, areaModel, children, pagination } = request;

	if (sectionTipo !== null && sectionTipo !== '') {
		const level = await getPermissions(principal, sectionTipo, sectionTipo);
		if (level < 1) {
			response.errors.push('insufficient permissions');
			response.msg = `Error. Insufficient permissions to read section (${sectionTipo})`;
			return response;
		}
	}

	const tsOptions: TsOptions = {
		model: request.thesaurusViewMode === 'model',
		area_model: areaModel,
	};
	const defaultLimit = 300;

	// mode A: standard children resolution (delegates to ts_object.getChildrenData).
	if ((children === null || children.length === 0) && sectionId && childrenTipo) {
		const result = await tsGetChildrenData(
			sectionTipo as string,
			sectionId,
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
		sectionTipo && sectionId ? { section_tipo: sectionTipo, section_id: sectionId } : null;
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

	// SEC-10: write ≥2.
	const permissions = await getPermissions(principal, sectionTipo, sectionTipo);
	if (permissions < 2) {
		response.errors.push('insufficient permissions');
		response.msg = `Error. Insufficient permissions to create in section (${sectionTipo})`;
		return response;
	}

	let sectionId: number;
	try {
		sectionId = doorSectionId(source.section_id, 'add_child.section_id');
	} catch (error) {
		return badSectionIdResponse(response, error);
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

			// ontology7 (ONT-TLD): for a GOVERNED `<tld>0` section nothing happens
			// here — createSectionRecord's birth defaults derive the value from the
			// section itself (record_defaults.ts seed 3). This code used to COPY it
			// off the parent record instead, which inherited EMPTINESS whenever the
			// parent was itself tld-less: the mechanism that produced the tree's
			// invisible shell nodes. Deriving beats inheriting.
			//
			// EXCEPT for localontology0, which ONT-TLD exempts precisely because its
			// records declare a FOREIGN tld on purpose (they override a canonical node,
			// so they carry the OVERRIDDEN node's tld). Nothing derives that, so the
			// parent copy is still the only thing that can supply it — dropping it
			// wholesale left tree-created override records with no tld at all, which
			// is the very bug this change exists to remove.
			if (requiredOntologyTld(sectionTipo) === null && getSectionIdFromTipo(sectionTipo) === '0') {
				const parentRecord = await readMatrixRecord(table, sectionTipo, sectionId);
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
	const oldParentSectionTipo = source.old_parent_section_tipo as string;
	const newParentSectionTipo = source.new_parent_section_tipo as string;

	// SEC-11: write ≥2.
	const permissions = await getPermissions(principal, sectionTipo, sectionTipo);
	if (permissions < 2) {
		response.errors.push('insufficient permissions');
		response.msg = `Error. Insufficient permissions to update in section (${sectionTipo})`;
		return response;
	}

	let sectionId: number;
	let oldParentSectionId: number;
	let newParentSectionId: number;
	try {
		sectionId = doorSectionId(source.section_id, 'update_parent_data.section_id');
		oldParentSectionId = doorSectionId(
			source.old_parent_section_id,
			'update_parent_data.old_parent_section_id',
		);
		newParentSectionId = doorSectionId(
			source.new_parent_section_id,
			'update_parent_data.new_parent_section_id',
		);
	} catch (error) {
		return badSectionIdResponse(response, error);
	}

	const parentTipo = await getParentTipo(sectionTipo);
	if (parentTipo === null) {
		response.errors.push('invalid component_relation_parent');
		response.msg = `Error. Unable to resolve component_relation_parent from section (${sectionTipo})`;
		return response;
	}

	// PRE-mutation cycle guard.
	const isSelfTarget = newParentSectionTipo === sectionTipo && newParentSectionId === sectionId;
	if (
		isSelfTarget ||
		(await isAncestor(sectionTipo, sectionId, newParentSectionTipo, newParentSectionId))
	) {
		response.errors.push('cycle');
		response.msg = 'Error. The node cannot be moved under itself or under its own descendant';
		return response;
	}

	try {
		await withTransaction(async () => {
			// lock both parents in deterministic (strcmp) order.
			const lockKeys: [string, number][] = [
				[oldParentSectionTipo, oldParentSectionId],
				[newParentSectionTipo, newParentSectionId],
			];
			lockKeys.sort((a, b) => `${a[0]}_${a[1]}`.localeCompare(`${b[0]}_${b[1]}`, 'en'));
			for (const [tipo, id] of lockKeys) {
				await acquireNodeLock(tipo, id);
			}

			const removed = await removeParent(sectionTipo, sectionId, parentTipo, {
				section_tipo: oldParentSectionTipo,
				section_id: oldParentSectionId,
				from_component_tipo: parentTipo,
				type: RELATION_TYPE_PARENT,
			});
			if (!removed)
				throw new Error(
					`Remove old parent locator failed: ${oldParentSectionTipo}_${oldParentSectionId}`,
				);

			const added = await addParent(sectionTipo, sectionId, parentTipo, {
				section_tipo: newParentSectionTipo,
				section_id: newParentSectionId,
				from_component_tipo: parentTipo,
				type: RELATION_TYPE_PARENT,
			});
			if (!added.ok)
				throw new Error(
					`Add new parent locator failed: ${newParentSectionTipo}_${newParentSectionId}`,
				);

			await recalculateSiblingOrders(sectionTipo, oldParentSectionTipo, oldParentSectionId);
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
	const rawLocators =
		(source.ar_locators as { section_tipo: string; section_id: unknown }[] | undefined) ?? [];
	const parentSectionTipo = (source.parent_section_tipo as string | undefined) ?? null;
	const rawParentSectionId = source.parent_section_id;

	// SEC-12: write ≥2.
	const permissions = await getPermissions(principal, sectionTipo, sectionTipo);
	if (permissions < 2) {
		response.errors.push('insufficient permissions');
		response.msg = `Error. Insufficient permissions to update order in section (${sectionTipo})`;
		return response;
	}

	// Door coercion for the whole ordered list + the parent: each entry names a
	// sibling RECORD whose order row is about to be rewritten.
	let arLocators: { section_tipo: string; section_id: number }[];
	let coercedParentSectionId: number | undefined;
	try {
		arLocators = rawLocators.map((locator) => ({
			...locator,
			section_id: doorSectionId(locator.section_id, 'save_order.ar_locators.section_id'),
		}));
		coercedParentSectionId =
			rawParentSectionId === undefined || rawParentSectionId === null || rawParentSectionId === ''
				? undefined
				: doorSectionId(rawParentSectionId, 'save_order.parent_section_id');
	} catch (error) {
		return badSectionIdResponse(response, error);
	}

	if (
		parentSectionTipo === null ||
		parentSectionTipo === '' ||
		coercedParentSectionId === undefined
	) {
		response.msg = 'Error. parent_section_tipo and parent_section_id are required';
		response.errors.push('missing parent context');
		return response;
	}
	const parentSectionId = coercedParentSectionId;

	let result: Awaited<ReturnType<typeof sortChildren>>;
	try {
		result = await withTransaction(async () => {
			await acquireNodeLock(parentSectionTipo, parentSectionId);
			return sortChildren(sectionTipo, arLocators, parentSectionTipo, parentSectionId);
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
			parentSectionId,
		);
	}

	response.msg =
		result === false
			? 'Error. The order cannot be established. Invalid section map. Please, define a valid section list map such as {"order":"hierarchy49"}'
			: `OK. Order saved successfully. Changed values: ${result.length}`;
	response.result = result;
	return response;
}
