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
import { DedaloError } from '../../../core/errors/dedalo_error.ts';
import { currentDataLang } from '../../../core/resolve/request_lang.ts';
import { assertValidTipo } from '../../../core/search/identifier_gate.ts';
import type { Principal } from '../../../core/security/permissions.ts';
import { defineTool, type ToolSpec } from '../tool_spec.ts';

/**
 * Server-authoritative write gate: level >= 2 on (section_tipo, tipo) or throw.
 *
 * `sectionId` is REQUIRED (P1-2, SEC-03) so the dd128 own-record LEVEL rule is part of
 * the answer rather than a helper this door never called. `null` where the gate
 * addresses no record (a section-level create).
 */
async function assertWritePermission(
	principal: Principal,
	sectionTipo: string,
	tipo: string,
	sectionId: number | null,
): Promise<void> {
	const { getRecordComponentPermission } = await import('../../../core/security/permissions.ts');
	const level = await getRecordComponentPermission(principal, sectionTipo, tipo, sectionId);
	if (level < 2) {
		throw new DedaloError('perm.denied', {
			message: `Insufficient permissions to write (${sectionTipo}/${tipo}): level ${level} < 2`,
			coordinates: { section_tipo: sectionTipo, tipo, level },
		});
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
		throw new DedaloError('perm.out_of_scope', {
			message: `Record is out of the user scope (${sectionTipo}/${sectionId})`,
			coordinates: { section_tipo: sectionTipo, section_id: sectionId },
		});
	}
}

/**
 * Update/insert/remove/clear one item of a component's value, as the principal —
 * the same saveComponentData path (and TM audit) the human save action uses.
 */
/**
 * REMOVE NAMES ITS ITEM, ON THIS DOOR TOO (DATA-06, 2026-08-30).
 *
 * The schema cannot express "required only when action is remove" — zod validates one
 * field at a time — so `item_id` stays optional there and the conditional requirement
 * lives here, in the handler, where an agent's omission is refused before anything is
 * written. This is the door the defect was CONFIRMED at: `item_id` was optional,
 * omission mapped straight onto `id: null`, and an agent asked to "remove the English
 * title" deleted every other language and was told ok.
 */
function assertRemoveNamesItem(
	action: string,
	itemId: number | string | null | undefined,
	sectionTipo: string,
	componentTipo: string,
): void {
	if (action !== 'remove') return;
	if (itemId !== undefined && itemId !== null) return;
	throw new DedaloError('record.remove_without_id', {
		publicMessage:
			"remove needs item_id: the id of the ONE item to remove (read the component first to get it). To empty the component in every language, send action 'clear' instead.",
		coordinates: { section_tipo: sectionTipo, tipo: componentTipo },
	});
}

export async function saveComponentValue(
	principal: Principal,
	input: {
		section_tipo: string;
		tipo: string;
		section_id: number;
		lang?: string;
		action: 'update' | 'insert' | 'remove' | 'clear';
		/** The item value ({id, value, lang} literal or a locator); omit for remove/clear. */
		value?: unknown;
		/** Target item id — REQUIRED for remove (see the refusal below). */
		item_id?: number | null;
	},
): Promise<{ ok: boolean; message?: string; data: unknown }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.save.section_tipo');
	const componentTipo = assertValidTipo(input.tipo, 'mcp.save.tipo');
	// THE REMOVE SENTINEL AT THE AGENT DOOR (DATA-06, 2026-08-30). `item_id` is
	// OPTIONAL in the schema — zod validates one field at a time, so the
	// requirement is conditional and lives here — and an omitted one used to map
	// onto id:null, which the write engine read as "empty the component in every
	// language" and reported as a success. An agent told to "remove the English
	// title" therefore deleted every other language and answered ok:true. The
	// engine now refuses that shape; this refusal is the same law stated where the
	// agent can act on it, BEFORE any permission probe or write is attempted.
	assertRemoveNamesItem(input.action, input.item_id, sectionTipo, componentTipo);
	await assertWritePermission(principal, sectionTipo, componentTipo, Math.floor(input.section_id));
	await assertRecordInScope(principal, sectionTipo, Math.floor(input.section_id));

	// THE WRITE LANGUAGE (audit DATA-24). This door defaulted every omitted lang
	// to 'lg-nolan', which saveComponentData stamps verbatim: a TRANSLATABLE
	// component then held an item no language ever serves as its value — it
	// renders as a marked fallback in every language, forever, and a later
	// genuine save leaves the nolan orphan in place. A translatable component
	// takes the session's data language; a non-translatable one is lg-nolan by
	// definition, whatever the caller asked for.
	const { getTranslatableByTipo } = await import('../../../core/ontology/resolver.ts');
	const translatable = await getTranslatableByTipo(componentTipo);
	const lang = translatable ? (input.lang ?? currentDataLang()) : 'lg-nolan';

	const { saveComponentData } = await import('../../../core/section/record/save_component.ts');
	const outcome = await saveComponentData({
		componentTipo,
		sectionTipo,
		sectionId: Math.floor(input.section_id),
		lang,
		changedData: [{ action: input.action, id: input.item_id ?? null, value: input.value }],
		userId: principal.userId,
		principal,
	});
	return { ok: outcome.ok, message: outcome.ok ? undefined : outcome.message, data: outcome.data };
}

/** Create a new record in a section (counter-allocated id + audit metadata). */
export async function createRecord(
	principal: Principal,
	input: { section_tipo: string },
): Promise<{ section_id: number }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.create.section_tipo');
	// null: a create addresses no record yet, so the own-record rule cannot apply.
	await assertWritePermission(principal, sectionTipo, sectionTipo, null);
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
): Promise<{ deleted: number[] }> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'mcp.delete.section_tipo');
	const sectionId = Math.floor(input.section_id);
	await assertWritePermission(principal, sectionTipo, sectionTipo, sectionId);
	await assertRecordInScope(principal, sectionTipo, sectionId);
	const { deleteSectionRecord } = await import('../../../core/section/record/delete_record.ts');
	const outcome = await deleteSectionRecord(sectionTipo, sectionId, principal.userId);
	// THE REVOCATION SEAM (P1-4, SEC-08): deleting a user record ends that account's
	// sessions, media markers and pending recovery codes. A no-op for any other section.
	if (outcome.deleted.length > 0) {
		const { revokeDeletedAccountAccess } = await import('../../../core/security/revocation.ts');
		for (const deletedId of outcome.deleted) {
			revokeDeletedAccountAccess(sectionTipo, deletedId, 'mcp delete_record');
		}
	}
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
			'Update, insert, or remove one item of a component value on a record (or clear it), ' +
			'as the configured user (write permission enforced server-side; every ' +
			'change is audited in the Time Machine).',
		tier: 'primitive',
		write: true,
		annotations: {
			readOnlyHint: false,
			// DESTRUCTIVE, and said so 2026-08-30 (DATA-06): 'remove' deletes an
			// item and 'clear' empties the component in every language. The hint is
			// what a host consults before asking a human to confirm, so a save door
			// that can delete curated values must not advertise itself as additive.
			destructiveHint: true,
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
				.describe(
					'Language of the value, e.g. "lg-eng". Default: the session\'s data language for a ' +
						'translatable component, "lg-nolan" for every other.',
				),
			action: z
				.enum(['update', 'insert', 'remove', 'clear'])
				.describe(
					"The item operation. 'remove' deletes the ONE item named by item_id; " +
						"'clear' empties the component in EVERY language — it is the only way to do that, " +
						'and it is never implied by an omitted item_id.',
				),
			value: z
				.unknown()
				.optional()
				.describe(
					'The item value ({id, value, lang} literal or a locator); omit for remove and clear.',
				),
			item_id: z
				.number()
				.optional()
				.describe('Target item id. REQUIRED for remove; ignored by clear.'),
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
