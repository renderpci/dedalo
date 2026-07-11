/**
 * FIELD-LEVEL write tools — the agent tier over the primitive write engines:
 *
 *   dedalo_set_field        set one field by tipo OR human label (model-
 *                           dispatched: literal item vs relation locator);
 *   dedalo_portal_link      link an existing record through a link field;
 *   dedalo_portal_unlink    remove one locator (deletePortalLocator);
 *   dedalo_find_or_create   the dedup primitive for entity extraction
 *                           ("Pablo Picasso" must not become a second Person);
 *   dedalo_duplicate_record copy a record with its component values.
 *
 * Every handler passes the SAME gate chain as the primitive write tools:
 * identifier gate → (registry allowlist) → level>=2 permission → per-record
 * projects scope (host AND link target — a user may only link records they
 * can reach). All writes run the human save engine (saveComponentData /
 * createSectionRecord / duplicateSectionRecord), so Time Machine audit and
 * relation index maintenance apply unchanged.
 */

import { z } from 'zod';
import { type Locator, compareLocators } from '../../../core/concepts/locator.ts';
import { readMatrixRecord } from '../../../core/db/matrix.ts';
import {
	getColumnNameByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../../../core/ontology/resolver.ts';
import { deletePortalLocator } from '../../../core/relations/save.ts';
import { assertValidTipo } from '../../../core/search/identifier_gate.ts';
import type { Principal } from '../../../core/security/permissions.ts';
import { ToolError } from '../envelope.ts';
import { type ToolSpec, defineTool } from '../tool_spec.ts';
import { resolveFieldReference } from './discovery.ts';
import { searchRecords } from './search.ts';

/** Simplified types whose values are LOCATOR lists (relation column). */
const LINK_COLUMN = 'relation';

/** Server-authoritative write gate: level >= 2 on (section_tipo, tipo) or throw. */
async function assertWritePermission(
	principal: Principal,
	sectionTipo: string,
	tipo: string,
): Promise<void> {
	const { getPermissions } = await import('../../../core/security/permissions.ts');
	const level = await getPermissions(principal, sectionTipo, tipo);
	if (level < 2) {
		throw new Error(
			`Insufficient permissions to write (${sectionTipo}/${tipo}): level ${level} < 2`,
		);
	}
}

/** Per-record projects scope gate (shared record_scope helper — AI-01). */
async function assertRecordInScope(
	principal: Principal,
	sectionTipo: string,
	sectionId: number,
): Promise<void> {
	const { principalCanAccessRecord } = await import('../../../core/security/record_scope.ts');
	if (!(await principalCanAccessRecord(sectionTipo, sectionId, principal))) {
		throw new Error(`Record is out of the user scope (${sectionTipo}/${sectionId})`);
	}
}

/** The stored items of one component column on one record (empty when none). */
async function currentItems(
	sectionTipo: string,
	sectionId: number,
	componentTipo: string,
	model: string,
): Promise<unknown[]> {
	const table = await getMatrixTableFromTipo(sectionTipo);
	const column = getColumnNameByModel(model);
	if (table === null || column === null) return [];
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	const columnData = record?.columns[column as keyof typeof record.columns];
	const items = (columnData as Record<string, unknown> | null)?.[componentTipo];
	return Array.isArray(items) ? items : [];
}

/** Conform a set_field link value into the canonical relation locator. */
function conformLocatorValue(
	value: unknown,
	fieldTipo: string,
): { section_tipo: string; section_id: number; type: string; from_component_tipo: string } {
	const raw = (value ?? {}) as Record<string, unknown>;
	const sectionTipo = raw.section_tipo;
	const sectionId = Number(raw.section_id);
	if (typeof sectionTipo !== 'string' || !Number.isInteger(sectionId) || sectionId <= 0) {
		throw new ToolError(
			'invalid_request',
			`A link field takes a locator value {section_tipo, section_id}; got ${JSON.stringify(value)}.`,
		);
	}
	return {
		section_tipo: assertValidTipo(sectionTipo, 'mcp.set_field.locator.section_tipo'),
		section_id: sectionId,
		type: 'dd151',
		from_component_tipo: fieldTipo,
	};
}

/**
 * Set one field of a record, by tipo or human label. Model-dispatched:
 * literal components take a scalar value (an {id?, lang?, value} item is
 * built), link components take a locator {section_tipo, section_id}.
 * `mode:'append'` (default) adds; `mode:'replace'` overwrites — for literals
 * only the requested language's item, for link fields the whole locator list.
 */
export async function setField(
	principal: Principal,
	input: {
		section_tipo: string;
		section_id: number;
		field: string;
		value?: unknown;
		lang?: string;
		mode?: 'append' | 'replace';
	},
): Promise<{ section_tipo: string; section_id: number; tipo: string; data: unknown }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.set_field.section_tipo');
	const sectionId = Math.floor(input.section_id);
	const fieldTipo = await resolveFieldReference(sectionTipo, input.field);
	await assertWritePermission(principal, sectionTipo, fieldTipo);
	await assertRecordInScope(principal, sectionTipo, sectionId);

	const model = (await getModelByTipo(fieldTipo)) ?? '';
	const column = getColumnNameByModel(model);
	const translatable = await getTranslatableByTipo(fieldTipo);
	const lang = translatable ? (input.lang ?? 'lg-eng') : 'lg-nolan';
	const mode = input.mode ?? 'append';

	let changedData: { action: string; id?: number | string | null; value: unknown }[];
	if (column === LINK_COLUMN) {
		const locator = conformLocatorValue(input.value, fieldTipo);
		// Linking demands scope on the TARGET too: a user may only wire records
		// they can reach (the search would never have shown them the target).
		await assertRecordInScope(principal, locator.section_tipo, locator.section_id);
		changedData =
			mode === 'replace'
				? [{ action: 'set_data', id: null, value: [locator] }]
				: [{ action: 'insert', id: null, value: locator }];
	} else {
		if (input.value === null || input.value === undefined) {
			throw new ToolError('invalid_request', 'set_field needs a value (use remove to clear).');
		}
		const item: Record<string, unknown> =
			typeof input.value === 'object' ? { ...(input.value as object) } : { value: input.value };
		if (mode === 'replace') {
			// Replace ONLY the requested language's item (translations survive);
			// no existing item in that lang falls through to an insert.
			const items = await currentItems(sectionTipo, sectionId, fieldTipo, model);
			const existing = items.find(
				(entry) =>
					(entry as { lang?: string } | null)?.lang === lang || (!translatable && entry !== null),
			) as { id?: number | string } | undefined;
			if (existing?.id !== undefined) {
				changedData = [
					{ action: 'update', id: existing.id, value: { ...item, id: existing.id, lang } },
				];
			} else {
				changedData = [{ action: 'insert', id: null, value: item }];
			}
		} else {
			changedData = [{ action: 'insert', id: null, value: item }];
		}
	}

	const { saveComponentData } = await import('../../../core/section/record/save_component.ts');
	const outcome = await saveComponentData({
		componentTipo: fieldTipo,
		sectionTipo,
		sectionId,
		lang,
		changedData,
		userId: principal.userId,
	});
	if (!outcome.ok) {
		throw new ToolError('invalid_request', outcome.message ?? 'save failed');
	}
	return { section_tipo: sectionTipo, section_id: sectionId, tipo: fieldTipo, data: outcome.data };
}

/** Link an existing record through a link field (append semantics). */
export async function portalLink(
	principal: Principal,
	input: {
		section_tipo: string;
		section_id: number;
		field: string;
		target: { section_tipo: string; section_id: number };
	},
): Promise<{ linked: boolean; data: unknown }> {
	const result = await setField(principal, {
		section_tipo: input.section_tipo,
		section_id: input.section_id,
		field: input.field,
		value: input.target,
		mode: 'append',
	});
	return { linked: true, data: result.data };
}

/** Remove one locator from a link field (the human delete_locator action). */
export async function portalUnlink(
	principal: Principal,
	input: {
		section_tipo: string;
		section_id: number;
		field: string;
		target: { section_tipo: string; section_id: number };
	},
): Promise<{ unlinked: boolean }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.unlink.section_tipo');
	const sectionId = Math.floor(input.section_id);
	const fieldTipo = await resolveFieldReference(sectionTipo, input.field);
	await assertWritePermission(principal, sectionTipo, fieldTipo);
	await assertRecordInScope(principal, sectionTipo, sectionId);

	// compareLocators is STRICT on any property present on one side only (the
	// stored locator carries its allocated item id) — so resolve the exact
	// stored locator for the target and send THAT, like the human client does
	// with the rendered value.
	const targetSection = assertValidTipo(
		input.target.section_tipo,
		'mcp.unlink.target.section_tipo',
	);
	const targetId = Math.floor(input.target.section_id);
	const model = (await getModelByTipo(fieldTipo)) ?? '';
	// Match on the target locator via the canonical locator law (loose-numeric
	// section_id: a stored '05' matches 5), restricted to the two identity
	// properties — never an inline === (S2-04/DEC-21 ratchet).
	const target = { section_tipo: targetSection, section_id: targetId };
	const stored = (await currentItems(sectionTipo, sectionId, fieldTipo, model)).find((item) =>
		compareLocators(item as Locator, target as Locator, ['section_tipo', 'section_id']),
	);
	if (stored === undefined) {
		throw new ToolError(
			'not_found',
			`No locator to (${targetSection}/${targetId}) on ${fieldTipo}.`,
		);
	}

	const outcome = await deletePortalLocator(
		principal,
		{ tipo: fieldTipo, section_tipo: sectionTipo, section_id: sectionId },
		{ locator: stored as Record<string, unknown> },
	);
	if (outcome.errors.length > 0) {
		throw new ToolError('invalid_request', outcome.errors.join('; '));
	}
	return { unlinked: outcome.result !== false };
}

/**
 * Find-or-create — the entity-dedup primitive: exact-match search on the
 * `match` fields; exactly one hit returns it (nothing written, `set` is NOT
 * applied to found records); no hit creates the record and fills match+set;
 * several hits fail with `ambiguous_match` + candidates (the model refines or
 * picks one explicitly).
 */
export async function findOrCreate(
	principal: Principal,
	input: {
		section_tipo: string;
		match: { field: string; value: string; lang?: string }[];
		set?: { field: string; value?: unknown; lang?: string }[];
	},
): Promise<{ section_tipo: string; section_id: number; created: boolean }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.find_or_create.section_tipo');
	if (input.match.length === 0) {
		throw new ToolError('invalid_request', 'find_or_create needs at least one match field.');
	}

	const found = await searchRecords(principal, {
		section_tipo: sectionTipo,
		filter: {
			and: input.match.map((rule) => ({
				field: rule.field,
				op: 'eq' as const,
				value: rule.value,
				lang: rule.lang,
			})),
		},
		limit: 5,
	});
	const hits = found.data.hits;
	if (hits.length === 1) {
		const hit = hits[0] as { section_tipo: string; section_id: number };
		return { section_tipo: hit.section_tipo, section_id: hit.section_id, created: false };
	}
	if (hits.length > 1) {
		throw new ToolError('ambiguous_match', `${hits.length} records match in '${sectionTipo}'.`, {
			candidates: hits,
		});
	}

	// No hit: create + fill (match fields first — they define the identity).
	await assertWritePermission(principal, sectionTipo, sectionTipo);
	const { createSectionRecord } = await import('../../../core/section/record/create_record.ts');
	const sectionId = await createSectionRecord(sectionTipo, principal.userId);
	for (const rule of [...input.match, ...(input.set ?? [])]) {
		await setField(principal, {
			section_tipo: sectionTipo,
			section_id: sectionId,
			field: rule.field,
			value: rule.value,
			lang: rule.lang,
			mode: 'append',
		});
	}
	return { section_tipo: sectionTipo, section_id: sectionId, created: true };
}

/** Duplicate a record including its component values (same engines gates). */
export async function duplicateRecord(
	principal: Principal,
	input: { section_tipo: string; section_id: number },
): Promise<{ section_tipo: string; section_id: number }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.duplicate.section_tipo');
	const sourceId = Math.floor(input.section_id);
	await assertWritePermission(principal, sectionTipo, sectionTipo);
	await assertRecordInScope(principal, sectionTipo, sourceId);
	const { duplicateSectionRecord } = await import(
		'../../../core/section/record/duplicate_record.ts'
	);
	const newId = await duplicateSectionRecord(sectionTipo, sourceId, principal.userId);
	return { section_tipo: sectionTipo, section_id: newId };
}

// ---------------------------------------------------------------------------
// Specs
// ---------------------------------------------------------------------------

const targetShape = z.object({
	section_tipo: z.string().describe('Target record section tipo.'),
	section_id: z.number().describe('Target record id.'),
});

export const FIELDS_WRITE_SPECS: ToolSpec[] = [
	defineTool({
		name: 'dedalo_set_field',
		title: 'Set a field',
		description:
			'Set one field of a record by tipo or human label. Literal fields take ' +
			'a scalar value; link fields take a locator {section_tipo, section_id}. ' +
			'mode "append" (default) adds; "replace" overwrites (literals: only the ' +
			'given language; link fields: the whole locator list).',
		tier: 'agent',
		write: true,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
		inputShape: {
			section_tipo: z.string().describe('The record section tipo.'),
			section_id: z.number().describe('The record id.'),
			field: z.string().describe('Field tipo (e.g. "rsc85") or human label (e.g. "Name").'),
			value: z
				.unknown()
				.describe('Scalar for literal fields; {section_tipo, section_id} for link fields.'),
			lang: z.string().optional().describe('Language for translatable literals (default lg-eng).'),
			mode: z.enum(['append', 'replace']).optional().describe('Default "append".'),
		},
		handler: setField,
	}),
	defineTool({
		name: 'dedalo_portal_link',
		title: 'Link a record',
		description:
			'Link an existing record through a link field (portal/relation) of a ' +
			'host record — append semantics; the configured user must be able to ' +
			'reach BOTH records.',
		tier: 'agent',
		write: true,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
		inputShape: {
			section_tipo: z.string().describe('Host record section tipo.'),
			section_id: z.number().describe('Host record id.'),
			field: z.string().describe('The link field (tipo or label), e.g. "Informant".'),
			target: targetShape,
		},
		handler: portalLink,
	}),
	defineTool({
		name: 'dedalo_portal_unlink',
		title: 'Unlink a record',
		description:
			'Remove one locator from a link field of a record (the linked record ' +
			'itself is untouched).',
		tier: 'agent',
		write: true,
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: true,
			openWorldHint: false,
		},
		inputShape: {
			section_tipo: z.string().describe('Host record section tipo.'),
			section_id: z.number().describe('Host record id.'),
			field: z.string().describe('The link field (tipo or label).'),
			target: targetShape,
		},
		handler: portalUnlink,
	}),
	defineTool({
		name: 'dedalo_find_or_create',
		title: 'Find or create a record',
		description:
			'Dedup primitive: exact-match the `match` fields; one hit returns it ' +
			'(set is NOT applied), none creates the record and fills match+set, ' +
			'several fail with ambiguous_match + candidates. Use this for extracted ' +
			'entities (people, places) so they are never duplicated.',
		tier: 'agent',
		write: true,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: false,
		},
		inputShape: {
			section_tipo: z.string().describe('The section to find/create in, e.g. People.'),
			match: z
				.array(
					z.object({
						field: z.string().describe('Field tipo or label.'),
						value: z.string().describe('Exact value to match.'),
						lang: z.string().optional(),
					}),
				)
				.min(1)
				.describe('Identity fields (e.g. Name + Surname).'),
			set: z
				.array(
					z.object({
						field: z.string(),
						value: z.unknown(),
						lang: z.string().optional(),
					}),
				)
				.optional()
				.describe('Extra fields filled ONLY when the record is created.'),
		},
		handler: findOrCreate,
	}),
	defineTool({
		name: 'dedalo_duplicate_record',
		title: 'Duplicate a record',
		description: 'Copy a record including its component values; returns the new section_id.',
		tier: 'primitive',
		write: true,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
		inputShape: {
			section_tipo: z.string().describe('The record section tipo.'),
			section_id: z.number().describe('The record id to copy.'),
		},
		handler: duplicateRecord,
	}),
];
