/**
 * Tool action security gates (PHP tools/tool_common/class.tool_security.php).
 *
 * Two responsibilities:
 *  - resolveAction: look up a method in a tool module's apiActions map (the
 *    TS equivalent of reading the class `API_ACTIONS` const). Not found → the
 *    method does not exist on the API surface.
 *  - assertActionPermission: run the action's DECLARATIVE permission gate BEFORE
 *    the handler (and before any background fork). Fail-closed: a missing or
 *    ill-typed permission target in the request options is a denial, never a
 *    pass. Mirrors PHP assert_action_permission + the section/tipo/record/
 *    developer assert_* helpers.
 */

import { assertValidTipo } from '../search/identifier_gate.ts';
import { type Principal, getPermissions } from '../security/permissions.ts';
import { isRecordInScope } from '../security/record_scope.ts';
import type { ToolActionSpec, ToolServerModule } from './module.ts';

/** Look up an action spec by method name (PHP resolve_action). Null when absent. */
export function resolveAction(module: ToolServerModule, method: string): ToolActionSpec | null {
	if (!Object.hasOwn(module.apiActions, method)) return null;
	return module.apiActions[method] ?? null;
}

/** A permission-check result: pass, or a fail with the client envelope fields. */
export type PermissionCheck = { ok: true } | { ok: false; msg: string; errors: string[] };

const DEFAULT_MIN_LEVEL = 2; // PHP default: write

/**
 * Enforce one action's declarative permission spec against the request options
 * and the caller. Returns {ok:true} to proceed or a fail result to return to the
 * client. The permission kinds mirror PHP tool_security's assert_* helpers; a
 * null permission is "listed but gated inside the handler" and always passes
 * here. Note that PHP composed its asserts freely per method, so a TS kind may
 * stand for a COMBINATION ('record_tipo' = the tipo pair + the record scope).
 */
export async function assertActionPermission(
	spec: ToolActionSpec,
	options: Record<string, unknown>,
	principal: Principal,
): Promise<PermissionCheck> {
	const minLevel = spec.minLevel ?? DEFAULT_MIN_LEVEL;

	switch (spec.permission) {
		case null:
			return { ok: true };

		case 'developer':
			// PHP assert_developer: no section target; just the developer flag. The
			// handler also asserts internally (defense in depth).
			return principal.isDeveloper
				? { ok: true }
				: fail('developer privileges required', ['unauthorized']);

		case 'section': {
			const sectionTipo = validTipo(options.section_tipo);
			if (sectionTipo === null) return fail('invalid section target', ['invalid_request']);
			const level = await getPermissions(principal, sectionTipo, sectionTipo);
			if (level < minLevel) return fail('insufficient permissions on target', ['unauthorized']);
			return scopeIfRecordTargeted(sectionTipo, options, principal);
		}

		case 'section_list': {
			// Batch action whose targets ride INSIDE the payload, one per item (PHP
			// tool_import_dedalo_csv::import_files — SEC-024 §9.2: assert write on
			// every file's section_tipo before importing any of them). Gating here
			// rather than in the handler keeps the PHP invariant that the check runs
			// before the background fork, where its denial is still observable.
			const targets = spec.sectionTipos?.(options) ?? [];
			if (targets.length === 0) return fail('invalid section target', ['invalid_request']);
			for (const target of targets) {
				const sectionTipo = validTipo(target);
				if (sectionTipo === null) return fail('invalid section target', ['invalid_request']);
				const level = await getPermissions(principal, sectionTipo, sectionTipo);
				if (level < minLevel) {
					return fail('insufficient permissions on target', ['unauthorized']);
				}
			}
			return { ok: true };
		}

		case 'tipo': {
			const sectionTipo = validTipo(options.section_tipo);
			const tipo = validTipo(options.tipo);
			if (sectionTipo === null || tipo === null) {
				return fail('invalid permission target', ['invalid_request']);
			}
			const level = await getPermissions(principal, sectionTipo, tipo);
			if (level < minLevel) return fail('insufficient permissions on target', ['unauthorized']);
			return scopeIfRecordTargeted(sectionTipo, options, principal);
		}

		case 'record': {
			const sectionTipo = validTipo(options.section_tipo);
			const sectionId = Number(options.section_id);
			if (sectionTipo === null || !Number.isFinite(sectionId)) {
				return fail('invalid record target', ['invalid_request']);
			}
			const level = await getPermissions(principal, sectionTipo, sectionTipo);
			if (level < minLevel) return fail('insufficient permissions on target', ['unauthorized']);
			// Per-record scope: the record must be visible under the caller's
			// projects filter (PHP assert_record_in_user_scope). Global admins skip.
			if (!principal.isGlobalAdmin && !(await isRecordInScope(sectionTipo, sectionId, principal))) {
				return fail('record is out of the user scope', ['unauthorized']);
			}
			return { ok: true };
		}

		case 'record_tipo': {
			// BOTH halves of PHP's SEC-024 door on a COMPONENT OF A RECORD:
			//   assert_tipo_permission($section_tipo, $component_tipo, $level)
			//   assert_record_in_user_scope($section_tipo, (int)$section_id)
			// 'tipo' expresses only the first, 'record' only the second (and its
			// level check is section-vs-section, so it never consults the component
			// at all). Every media-family action needs both: without the pair half a
			// user explicitly denied write on ONE media component can still delete
			// its files, rotate, remux or bulk-rewrite it through the section grant.
			// The component key is `tipo` with `component_tipo` as its alias —
			// exactly what resolveMediaToolContext and the tc/pdf handlers read.
			const sectionTipo = validTipo(options.section_tipo);
			// AMBIGUITY IS A DENIAL. The two keys are aliases, but handlers do not all
			// read them in the same order (tool_tc read `component_tipo ?? tipo` while
			// this gate reads `tipo ?? component_tipo`). A payload carrying BOTH keys
			// with DIFFERENT values would then be authorized against one component and
			// acted on in another — the precise hole this kind exists to close. Refusing
			// the ambiguous request makes the gate order-independent, so no handler's
			// key preference can diverge from what was actually authorized.
			const tipoKey = options.tipo;
			const componentTipoKey = options.component_tipo;
			if (
				tipoKey !== undefined &&
				componentTipoKey !== undefined &&
				String(tipoKey) !== String(componentTipoKey)
			) {
				return fail('conflicting component target', ['invalid_request']);
			}
			const componentTipo = validTipo(tipoKey ?? componentTipoKey);
			const sectionId = Number(options.section_id);
			if (sectionTipo === null || componentTipo === null || !Number.isFinite(sectionId)) {
				return fail('invalid permission target', ['invalid_request']);
			}
			const level = await getPermissions(principal, sectionTipo, componentTipo);
			if (level < minLevel) return fail('insufficient permissions on target', ['unauthorized']);
			if (!principal.isGlobalAdmin && !(await isRecordInScope(sectionTipo, sectionId, principal))) {
				return fail('record is out of the user scope', ['unauthorized']);
			}
			return { ok: true };
		}

		default:
			return fail('unknown permission kind', ['invalid_request']);
	}
}

/**
 * TOOLS-05 (2026-07-28 audit): a section/tipo-level grant is NOT authority to
 * touch a specific record outside the caller's projects filter. When a
 * section/tipo-gated action ALSO names a concrete existing record (a positive
 * section_id in the payload — tm restore, import_files overwrite, marc21/zotero),
 * the record must be in scope, exactly as the `record` kind requires. A create
 * (no section_id, or a non-positive one) has no prior record to scope-check and
 * passes — the section-level write grant is its whole authorization.
 */
async function scopeIfRecordTargeted(
	sectionTipo: string,
	options: Record<string, unknown>,
	principal: Principal,
): Promise<PermissionCheck> {
	const sectionId = Number(options.section_id);
	if (!Number.isInteger(sectionId) || sectionId < 1) return { ok: true };
	if (!principal.isGlobalAdmin && !(await isRecordInScope(sectionTipo, sectionId, principal))) {
		return fail('record is out of the user scope', ['unauthorized']);
	}
	return { ok: true };
}

/** Validate a value as a tipo, returning null (not throwing) on failure. */
function validTipo(value: unknown): string | null {
	try {
		return assertValidTipo(String(value ?? ''), 'tool_request.permission_target');
	} catch {
		return null;
	}
}

function fail(msg: string, errors: string[]): { ok: false; msg: string; errors: string[] } {
	return { ok: false, msg, errors };
}
