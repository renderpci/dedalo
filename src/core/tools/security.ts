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
import { getPermissions, type Principal } from '../security/permissions.ts';
import { isRecordInScope } from '../security/record_scope.ts';
import type {
	GatedToolActionSpec,
	ToolActionSpec,
	ToolServerModule,
	WriteTarget,
} from './module.ts';

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
 * null permission is the NAMED EXEMPTION (module.ts ExemptToolActionSpec: the
 * spec must say in `gatedInHandler` what the handler does instead) and always
 * passes here — see the `case null` comment for why that is documentary. Note that PHP composed its asserts freely per method, so a TS kind may
 * stand for a COMBINATION ('record_tipo' = the tipo pair + the record scope).
 */
export async function assertActionPermission(
	spec: ToolActionSpec,
	options: Record<string, unknown>,
	principal: Principal,
): Promise<PermissionCheck> {
	// `minLevel` is readable on the WHOLE union because the exempt member declares
	// it `never` (module.ts): an action with no declarative gate cannot carry a
	// level that reads like protection but is never consulted. So the one read
	// stays here, before the switch, instead of being repeated in six branches.
	const minLevel = spec.minLevel ?? DEFAULT_MIN_LEVEL;

	switch (spec.permission) {
		case null:
			// THE EXEMPTION, AND THE HONEST LIMIT OF IT. This gate passes, always.
			// P2-8(a) (2026-08-24) makes the exemption NAMED — the spec must carry a
			// `gatedInHandler` string, and test/unit/tool_permission_census_tripwire.test.ts
			// pins the set of exempt actions shrink-only and checks the named symbol
			// is really called on the handler's entry path. That is a DOCUMENTARY
			// construction, not an enforcement one: nothing here can verify the
			// handler's check is the RIGHT check, that it runs before the action's
			// first side effect, or that no branch reaches the effect around it.
			// Whoever needs authorization enforced by the framework must choose a
			// declarative kind above — this branch cannot be made to enforce anything.
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

		case 'section_list':
			return assertSectionList(spec, options, principal, minLevel);

		case 'targets':
			return assertWriteTargets(spec, options, principal, minLevel);

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
 * 'section_list': a batch action whose targets ride INSIDE the payload, one per
 * item (PHP tool_import_dedalo_csv::import_files — SEC-024 §9.2: assert write on
 * every file's section_tipo before importing any of them). Gating here rather
 * than in the handler keeps the PHP invariant that the check runs before the
 * background fork, where its denial is still observable.
 */
async function assertSectionList(
	spec: GatedToolActionSpec,
	options: Record<string, unknown>,
	principal: Principal,
	minLevel: number,
): Promise<PermissionCheck> {
	const targets = extractorTargets(spec.sectionTipos, options);
	if (targets === null || targets.length === 0) {
		return fail('invalid section target', ['invalid_request']);
	}
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

/**
 * 'targets': the gate bound to the EFFECT TARGET (audit CARRY-08 / TOOLS-04).
 * The spec's `targets(options)` extractor names every (section, component?,
 * record?) the handler will write, read off the same keys the handler reads;
 * each is gated here, before the handler and before any background fork:
 *
 *  - the level is asserted on the PAIR when a `tipo` is named (a section grant
 *    is not authority over a component the profile denies), on the section
 *    when not;
 *  - a `section_id`, when named, must be a POSITIVE integer and inside the
 *    caller's scope (isRecordInScope — the projects filter and every assembler
 *    rule, the dd655 owner predicate included); global admins are unscoped,
 *    exactly as the 'record' kinds;
 *  - an empty target list, a malformed entry, or an extractor that throws is a
 *    DENIAL — a payload that cannot name what it will touch is not authorized
 *    to touch anything.
 */
async function assertWriteTargets(
	spec: GatedToolActionSpec,
	options: Record<string, unknown>,
	principal: Principal,
	minLevel: number,
): Promise<PermissionCheck> {
	const targets = extractorTargets(spec.targets, options);
	if (targets === null || targets.length === 0) {
		return fail('invalid permission target', ['invalid_request']);
	}
	for (const target of targets) {
		const check = await assertOneWriteTarget(target, principal, minLevel);
		if (!check.ok) return check;
	}
	return { ok: true };
}

/** One entry of a 'targets' list: the pair (or section) level, then the record scope. */
async function assertOneWriteTarget(
	target: WriteTarget,
	principal: Principal,
	minLevel: number,
): Promise<PermissionCheck> {
	const pair = writeTargetPair(target);
	if (pair === null) return fail('invalid permission target', ['invalid_request']);
	const level = await getPermissions(principal, pair.sectionTipo, pair.tipo);
	if (level < minLevel) return fail('insufficient permissions on target', ['unauthorized']);
	if (target.section_id === undefined) return { ok: true };
	const sectionId = Number(target.section_id);
	if (!Number.isInteger(sectionId) || sectionId < 1) {
		return fail('invalid record target', ['invalid_request']);
	}
	return assertRecordScope(pair.sectionTipo, sectionId, principal);
}

/**
 * The (section, tipo) pair a write target is gated as — the section itself when
 * no component is named — or null when either half is not a valid tipo.
 */
function writeTargetPair(target: WriteTarget): { sectionTipo: string; tipo: string } | null {
	if (target === null || typeof target !== 'object') return null;
	const sectionTipo = validTipo(target.section_tipo);
	if (sectionTipo === null) return null;
	const tipo = target.tipo === undefined ? sectionTipo : validTipo(target.tipo);
	return tipo === null ? null : { sectionTipo, tipo };
}

/**
 * Run a spec's target extractor over the options. A missing extractor, a
 * non-array result, or a THROW (the extractor reads a client payload of any
 * shape) all yield null — which every caller treats as a denial. A throw must
 * not escape: it would surface as an internal error instead of the refusal it
 * is, and on a background request it would do so after the gate's ORDER
 * invariant had already been judged.
 */
function extractorTargets<T>(
	extractor: ((options: Record<string, unknown>) => T[]) | undefined,
	options: Record<string, unknown>,
): T[] | null {
	if (extractor === undefined) return null;
	try {
		const targets = extractor(options);
		return Array.isArray(targets) ? targets : null;
	} catch {
		return null;
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
	return assertRecordScope(sectionTipo, sectionId, principal);
}

/**
 * The record-scope half every record-addressed kind shares: the record must be
 * visible under the caller's projects filter (PHP assert_record_in_user_scope,
 * isRecordInScope — the assembler's rules, the dd655 owner predicate included);
 * global admins are unscoped.
 */
async function assertRecordScope(
	sectionTipo: string,
	sectionId: number,
	principal: Principal,
): Promise<PermissionCheck> {
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
