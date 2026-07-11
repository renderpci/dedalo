/**
 * WRITE tools — save a component value, create/delete a record.
 *
 * Each handler reuses the exact engines and permission gates the human API
 * dispatch applies (level >= 2, server-authoritative, per the dd774 matrix)
 * PLUS the per-record projects scope gate (foundation audit AI-01) — an LLM
 * can never write where its configured user could not, and never a record the
 * user cannot see (cross-project IDOR). Every change is audited in the Time
 * Machine (deletes snapshot the full record first, so they stay recoverable).
 *
 * The transport-level CSRF of the browser API does not apply here (no cookie
 * session to ride); its role is played by the fixed service principal plus the
 * explicit DEDALO_MCP_ALLOW_WRITE opt-in that gates whether these specs are
 * registered AT ALL (read-only by default, fail-closed — see server.ts).
 */

import { z } from 'zod';
import { assertValidTipo } from '../../../core/search/identifier_gate.ts';
import type { Principal } from '../../../core/security/permissions.ts';
import { type ToolSpec, defineTool } from '../tool_spec.ts';

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

/**
 * Per-record projects (tenant) scope gate — the write twin of the human
 * dispatch save/delete handlers (foundation audit AI-01). MCP write mode refuses
 * global-admin principals by design, so the service principal is exactly the
 * project-scoped population the filter must bound; the level gate alone would let
 * it mutate a record it can never see (cross-project IDOR). Shares the same
 * `principalCanAccessRecord` helper as the human API so the two write doors
 * cannot drift.
 */
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

/**
 * Update/insert/remove one item of a component's value, as the principal —
 * the same saveComponentData path (and TM audit) the human save action uses.
 */
export async function saveComponentValue(
	principal: Principal,
	input: {
		section_tipo: string;
		tipo: string;
		section_id: number;
		lang?: string;
		action: 'update' | 'insert' | 'remove';
		/** The item value ({id, value, lang} literal or a locator); omit for remove. */
		value?: unknown;
		/** Target item id (update/remove). */
		item_id?: number | null;
	},
): Promise<{ ok: boolean; message?: string; data: unknown }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.save.section_tipo');
	const componentTipo = assertValidTipo(input.tipo, 'mcp.save.tipo');
	await assertWritePermission(principal, sectionTipo, componentTipo);
	await assertRecordInScope(principal, sectionTipo, Math.floor(input.section_id));

	const { saveComponentData } = await import('../../../core/section/record/save_component.ts');
	const outcome = await saveComponentData({
		componentTipo,
		sectionTipo,
		sectionId: Math.floor(input.section_id),
		lang: input.lang ?? 'lg-nolan',
		changedData: [{ action: input.action, id: input.item_id ?? null, value: input.value }],
		userId: principal.userId,
	});
	return { ok: outcome.ok, message: outcome.ok ? undefined : outcome.message, data: outcome.data };
}

/** Create a new record in a section (counter-allocated id + audit metadata). */
export async function createRecord(
	principal: Principal,
	input: { section_tipo: string },
): Promise<{ section_id: number }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.create.section_tipo');
	await assertWritePermission(principal, sectionTipo, sectionTipo);
	const { createSectionRecord } = await import('../../../core/section/record/create_record.ts');
	const sectionId = await createSectionRecord(sectionTipo, principal.userId);
	return { section_id: sectionId };
}

/**
 * Delete one record (delete_record mode: Time Machine snapshot first, then row
 * removal — recoverable through the TM history, like the human delete action).
 */
export async function deleteRecord(
	principal: Principal,
	input: { section_tipo: string; section_id: number },
): Promise<{ deleted: string[] }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.delete.section_tipo');
	await assertWritePermission(principal, sectionTipo, sectionTipo);
	await assertRecordInScope(principal, sectionTipo, Math.floor(input.section_id));
	const { deleteSectionRecord } = await import('../../../core/section/record/delete_record.ts');
	const outcome = await deleteSectionRecord(
		sectionTipo,
		Math.floor(input.section_id),
		principal.userId,
	);
	return { deleted: outcome.deleted };
}

// ---------------------------------------------------------------------------
// Specs — registered only under the fail-closed write opt-in (registry/server).
// ---------------------------------------------------------------------------

export const RECORDS_WRITE_SPECS: ToolSpec[] = [
	defineTool({
		name: 'dedalo_save_component',
		title: 'Save a component value',
		description:
			'Update, insert, or remove one item of a component value on a record, ' +
			'as the configured user (write permission enforced server-side; every ' +
			'change is audited in the Time Machine).',
		tier: 'primitive',
		write: true,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
		inputShape: {
			section_tipo: z.string().describe('The record section tipo, e.g. "oh1".'),
			tipo: z.string().describe('The component tipo to modify, e.g. "oh23".'),
			section_id: z.number().describe('The record id.'),
			lang: z
				.string()
				.optional()
				.describe('Language of the value, e.g. "lg-eng" ("lg-nolan" default).'),
			action: z.enum(['update', 'insert', 'remove']).describe('The item operation.'),
			value: z
				.unknown()
				.optional()
				.describe('The item value ({id, value, lang} literal or a locator); omit for remove.'),
			item_id: z.number().optional().describe('Target item id (update/remove).'),
		},
		handler: saveComponentValue,
	}),
	defineTool({
		name: 'dedalo_create_record',
		title: 'Create a record',
		description:
			'Create a new empty record in a section as the configured user ' +
			'(write permission enforced server-side). Returns the new section_id.',
		tier: 'primitive',
		write: true,
		annotations: {
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: false,
			openWorldHint: false,
		},
		inputShape: {
			section_tipo: z.string().describe('The section to create the record in, e.g. "oh1".'),
		},
		handler: createRecord,
	}),
	defineTool({
		name: 'dedalo_delete_record',
		title: 'Delete a record',
		description:
			'Delete one record as the configured user (write permission enforced ' +
			'server-side). A full Time Machine snapshot is stored first, so the ' +
			'record remains recoverable.',
		tier: 'primitive',
		write: true,
		annotations: {
			readOnlyHint: false,
			destructiveHint: true,
			idempotentHint: false,
			openWorldHint: false,
		},
		inputShape: {
			section_tipo: z.string().describe('The record section tipo, e.g. "oh1".'),
			section_id: z.number().describe('The record id to delete.'),
		},
		handler: deleteRecord,
	}),
];
