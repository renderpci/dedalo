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
 * client. The four permission kinds mirror PHP tool_security exactly; a null
 * permission is "listed but gated inside the handler" and always passes here.
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
			return level >= minLevel
				? { ok: true }
				: fail('insufficient permissions on target', ['unauthorized']);
		}

		case 'tipo': {
			const sectionTipo = validTipo(options.section_tipo);
			const tipo = validTipo(options.tipo);
			if (sectionTipo === null || tipo === null) {
				return fail('invalid permission target', ['invalid_request']);
			}
			const level = await getPermissions(principal, sectionTipo, tipo);
			return level >= minLevel
				? { ok: true }
				: fail('insufficient permissions on target', ['unauthorized']);
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

		default:
			return fail('unknown permission kind', ['invalid_request']);
	}
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
