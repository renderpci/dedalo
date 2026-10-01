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
 *
 * THE RECORD-ADDRESSED KINDS DELEGATE (closure Step 3; WC-2026-09-30-write-door):
 * `record`, `record_tipo`, `tipo`, `section` and every `targets` entry are the
 * write door (security/write_door.ts) — grammar, the section floor, the
 * dd128-aware pair, the scope with the non-positive-id refusal ahead of the
 * admin bypass. This module only maps the door's typed refusals onto the tool
 * envelope's legacy (msg, token) pair (`toCheck`), so the wire is unchanged.
 */

import { DedaloError, isDedaloError } from '../errors/dedalo_error.ts';
import { assertValidTipo } from '../search/identifier_gate.ts';
import { getPermissions, type Principal } from '../security/permissions.ts';
import {
	authorizeRecordAccess,
	authorizeSectionRecord,
	authorizeSectionTarget,
	parseRecordId,
	type RecordAccessOptions,
} from '../security/write_door.ts';
import type {
	GatedToolActionSpec,
	ToolActionSpec,
	ToolServerModule,
	WriteTarget,
} from './module.ts';
import { getUserTools } from './registry.ts';

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

		case 'section':
			// THE WRITE DOOR (closure Step 3): the section level, consultation-capped
			// (a section the engine renders read-only is not writable through a tool
			// either — WC-2026-09-30-write-door); a NAMED id must be an integer in
			// the caller's scope — 0 and negatives refused for every caller, admins
			// included. An ABSENT id is a create: the level is its authorization.
			return toCheck('section', () =>
				authorizeSectionTarget(
					principal,
					{ section_tipo: options.section_tipo, section_id: options.section_id },
					{ level: minLevel, door: 'tool_request.section' },
				),
			);

		case 'section_list':
			return assertSectionList(spec, options, principal, minLevel);

		case 'targets':
			return assertWriteTargets(spec, options, principal, minLevel);

		case 'tipo': {
			// The (section, tipo) pair — dd128-aware when a record is named — then
			// the scope of a NAMED record. An absent tipo is not a target.
			if (options.tipo === undefined || options.tipo === null || options.tipo === '') {
				return fail(REFUSAL_INVALID.tipo, ['invalid_request']);
			}
			return toCheck('tipo', () =>
				authorizeSectionTarget(
					principal,
					{
						section_tipo: options.section_tipo,
						tipo: options.tipo,
						section_id: options.section_id,
					},
					{ level: minLevel, door: 'tool_request.tipo' },
				),
			);
		}

		case 'record':
			// A record target: the section level (consultation-capped) and the record
			// scope. The id is REQUIRED — by the door itself (authorizeSectionRecord
			// refuses an absent id as request.invalid): a record kind with no record
			// is not a target, and cannot degrade into a create.
			return toCheck('record', () =>
				authorizeSectionRecord(
					principal,
					{ section_tipo: options.section_tipo, section_id: options.section_id },
					{ level: minLevel, door: 'tool_request.record' },
				),
			);

		case 'record_tipo': {
			// BOTH halves of PHP's SEC-024 door on a COMPONENT OF A RECORD, now the
			// write door's full order: grammar → section floor 1 → the pair
			// (dd128-aware) → the record scope (non-positive id refused BEFORE the
			// admin bypass). The component key is `tipo` with `component_tipo` as
			// its alias — exactly what resolveMediaToolContext and the tc/pdf
			// handlers read.
			//
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
			const componentTipo = tipoKey ?? componentTipoKey;
			if (componentTipo === undefined || componentTipo === null || componentTipo === '') {
				return fail(REFUSAL_INVALID.record_tipo, ['invalid_request']);
			}
			if (minLevel > 2) return fail('unsupported permission level', ['invalid_request']);
			return toCheck('record_tipo', () =>
				authorizeRecordAccess(
					principal,
					{
						section_tipo: options.section_tipo,
						component_tipo: componentTipo,
						section_id: options.section_id,
					},
					recordAccessOptions(minLevel, 'tool_request.record_tipo'),
				),
			);
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
 *    when not — consultation-capped, like every section-level write target
 *    (an importer must not create or overwrite Activity / Time Machine rows);
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

/**
 * One entry of a 'targets' list, through the write door: a named component OF
 * a named record is the full record door (section floor 1, the dd128-aware
 * pair, the scope); anything else is a section target (the pair or section
 * level, then the scope of a named record).
 */
async function assertOneWriteTarget(
	target: WriteTarget,
	principal: Principal,
	minLevel: number,
): Promise<PermissionCheck> {
	const pair = writeTargetPair(target);
	if (pair === null) return fail(REFUSAL_INVALID.targets, ['invalid_request']);
	const shape = writeTargetShape(target, pair, minLevel);
	if (shape === 'invalid') return fail(REFUSAL_INVALID.record, ['invalid_request']);
	const raw = { section_tipo: pair.sectionTipo, section_id: target.section_id };
	return toCheck('targets', () =>
		shape === 'record'
			? authorizeRecordAccess(
					principal,
					{ ...raw, component_tipo: pair.tipo },
					recordAccessOptions(minLevel, 'tool_request.targets'),
				)
			: authorizeSectionTarget(
					principal,
					{ ...raw, tipo: pair.tipo },
					{ level: minLevel, door: 'tool_request.targets' },
				),
	);
}

/**
 * Which door a 'targets' entry goes through. `undefined` is the only "no record"
 * spelling an extractor may emit; any other value must BE a record id (null,
 * 1.5, 'abc' are malformed entries). A named component OF a named record is the
 * full record door; anything else a section target.
 */
function writeTargetShape(
	target: WriteTarget,
	pair: { sectionTipo: string; tipo: string },
	minLevel: number,
): 'invalid' | 'record' | 'section' {
	if (target.section_id === undefined) return 'section';
	if (parseRecordId(target.section_id).kind !== 'id') return 'invalid';
	return pair.tipo !== pair.sectionTipo && minLevel <= 2 ? 'record' : 'section';
}

/** The write door's options for a record-addressed tool kind at `minLevel` (1 read, 2 write). */
function recordAccessOptions(minLevel: number, door: string): RecordAccessOptions {
	return {
		mode: minLevel >= 2 ? 'write' : 'read',
		level: minLevel >= 2 ? 2 : 1,
		door,
		sectionFloor: 1,
	};
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
 * The grammar sentence per kind — unchanged on the wire since before the write
 * door (FAILURE_LITERAL_BASELINE pins these literals).
 */
const REFUSAL_INVALID = {
	section: 'invalid section target',
	tipo: 'invalid permission target',
	record: 'invalid record target',
	record_tipo: 'invalid permission target',
	targets: 'invalid permission target',
} as const;

/**
 * THE ADAPTER from the write door's typed refusals to the tool envelope's
 * (msg, errors) pair. The write door THROWS a DedaloError; the tool gate
 * answers a PermissionCheck the dispatch relays — the wire is unchanged:
 *
 *   perm.denied        → 'insufficient permissions on target' / unauthorized
 *   perm.out_of_scope  → 'record is out of the user scope'    / unauthorized
 *   request.invalid    → the kind's own grammar sentence       / invalid_request
 *
 * Any other error is NOT a refusal of this gate and propagates (a DB failure
 * must surface as the failure it is, never as a quiet denial or a pass).
 */
async function toCheck(
	kind: keyof typeof REFUSAL_INVALID,
	authorize: () => Promise<unknown>,
): Promise<PermissionCheck> {
	try {
		await authorize();
		return { ok: true };
	} catch (error) {
		if (!isDedaloError(error)) throw error;
		switch (error.code) {
			case 'perm.denied':
				return fail('insufficient permissions on target', ['unauthorized']);
			case 'perm.out_of_scope':
				return fail('record is out of the user scope', ['unauthorized']);
			case 'request.invalid':
				return fail(REFUSAL_INVALID[kind], ['invalid_request']);
			default:
				throw error;
		}
	}
}

/**
 * THE TOOL GRANT DECISION — the ONE home of "does this user's profile authorize
 * `toolName`" (closure Step 3 req 8): the tool must be ACTIVE in the registry
 * (dd1324) and in the user's authorized list (PHP tool_common::get_user_tools:
 * the profile's dd1067 grants plus the always_active tools; the superuser -1
 * gets every active tool). Global admins are NOT exempt — the tool ACL has no
 * admin flag anywhere (registry.getUserTools). Every door that asks a grant —
 * the tool dispatcher's gates 3+4, the agent door, the vision spend, the
 * generative RAG answer, tool_export's download route — asks it HERE.
 */
export async function isToolGranted(userId: number, toolName: string): Promise<boolean> {
	const tools = await getUserTools(userId);
	return tools.some((tool) => tool.name === toolName);
}

/** {@link isToolGranted}, THROWING `tool.not_authorized` when it is not. */
export async function assertToolGranted(principal: Principal, toolName: string): Promise<void> {
	if (await isToolGranted(principal.userId, toolName)) return;
	throw new DedaloError('tool.not_authorized', {
		message: `the profile of user ${principal.userId} does not authorize ${toolName}`,
		coordinates: { tool: toolName, user_id: principal.userId },
	});
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
