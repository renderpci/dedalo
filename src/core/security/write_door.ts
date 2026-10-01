/**
 * THE WRITE DOOR — one shape for the authorization of every door that acts on a
 * (section, component, record) triple, or on a section target (closure Step 3,
 * SEC-05 one layer down; WC-2026-09-30-write-door).
 *
 * WHAT IT REPLACES. Every write door wrote its own subset of one rule: the
 * tool gate (`core/tools/security.ts`) read the RAW `getPermissions` (so the
 * dd128 own-record DOWNGRADE never applied at a tool door), inlined the admin
 * bypass ABOVE the non-positive-id refusal (so a global admin reached root's
 * dd128/-1 password through `record_tipo`), accepted `1.5` as a record id and
 * read a garbage id as "no record named"; the media door asked only the
 * SECTION; the MCP write tools had a private copy of the pair + scope. Five
 * doors, five re-implementations. This module is the rule, and it is the ONLY
 * place the order of its halves is written down.
 *
 * ── THE TWO QUESTIONS ────────────────────────────────────────────────────────
 *
 * {@link authorizeRecordAccess} — ONE component of ONE existing record, in a
 * fixed order that no caller can re-arrange:
 *
 *   1. GRAMMAR  both tipos pass the identifier gate; the id is an INTEGER
 *               ({@link parseRecordId}) — `1.5`, `'abc'`, `true` are refused
 *               as `request.invalid`, never read as "absent".
 *   2. SECTION  `getSectionPermissions >= sectionFloor`. The floor is REQUIRED
 *               (no default): every caller names it; 0 only for a door in
 *               SECTION_FLOOR_ZERO_DOORS (else internal.invariant). The other skip is an
 *               account's own self-service write (dd128 grants 0 to most
 *               profiles; `isSelfServiceAccountWrite` is the whole carve-out).
 *   3. PAIR     write: `getRecordComponentPermission >= level` (the dd128
 *               own-record downgrade AND upgrade applied); read: the read
 *               door's `authorizeComponentRead` (the read law has ONE home).
 *   4. SCOPE    write: `assertRecordWriteTarget`; read:
 *               `principalCanAccessRecord`. In BOTH the non-positive-id
 *               refusal runs BEFORE the global-admin bypass.
 *   5. GRANT    a frozen, branded {@link RecordGrant} — the effect is built
 *               from the grant, never from the request it was authorized from;
 *               it NAMES THE ACTOR it authorized (`userId`), so an effect typed
 *               on the grant audits as that actor and holds no principal.
 *
 * {@link authorizeSectionTarget} — a SECTION target that MAY name a record
 * (the tool kinds `tipo` / `section` / `targets`, and a create): the level on
 * the pair (dd128-aware) or on the section (always consultation-capped); an
 * ABSENT id is a create and the level is its whole authorization; a PRESENT id
 * must be an integer and in scope — 0 and negatives included, which is what
 * closes "`section_id: -1` skips the scope check".
 *
 * {@link authorizeSectionRecord} — the same door for a target that MUST name a
 * record (a whole-record effect: delete, duplicate, the tool `record` kind). An
 * absent id is refused as `request.invalid` BY THE DOOR — never read as a
 * create — so no record-lifecycle caller can turn a missing id into a
 * section-level authorization with a null target, whatever its schema layer
 * does or skips. Its grant's `sectionId` is a number by type.
 *
 * ── REFUSAL CODES (the adapter in core/tools/security.ts maps them onto the
 *    legacy tool-envelope sentences; every other door relays them) ──────────
 *
 *   request.invalid     a target that is not a target (grammar)
 *   perm.denied         the section floor or the pair level is short
 *   perm.out_of_scope   the record is outside the caller's scope, or its id is
 *                       not a record address (non-positive), admins included
 *
 * No module-level state. Gate: test/unit/write_door_native.test.ts (every
 * half through the real resolver, no mocks) + authz_door_matrix_native.
 */

import { DedaloError } from '../errors/dedalo_error.ts';
import { assertValidTipo } from '../search/identifier_gate.ts';
import {
	getRecordComponentPermission,
	getSectionPermissions,
	isSelfServiceAccountWrite,
	type Principal,
} from './permissions.ts';
import { authorizeComponentRead } from './read_door.ts';
import { assertRecordWriteTarget, principalCanAccessRecord } from './record_scope.ts';

declare const grantBrand: unique symbol;

/**
 * Proof that ONE component of ONE record was authorized. Only this module
 * mints it (the brand is not constructible elsewhere), so a function that
 * takes a RecordGrant cannot be handed the raw request instead.
 */
export type RecordGrant = Readonly<{
	[grantBrand]: true;
	sectionTipo: string;
	componentTipo: string;
	sectionId: number;
	mode: 'read' | 'write';
	level: 1 | 2;
	door: string;
	/** The principal the grant was minted for — the effect's audit actor. */
	userId: number;
}>;

/**
 * Proof that a SECTION target was authorized. `sectionId` is null for a
 * create (no record named); `componentTipo` equals `sectionTipo` when the
 * target named no component.
 */
export type SectionGrant = Readonly<{
	[grantBrand]: true;
	sectionTipo: string;
	componentTipo: string;
	sectionId: number | null;
	level: number;
	door: string;
}>;

/** What the caller's payload said about a record id. */
export type ParsedRecordId = { kind: 'absent' } | { kind: 'id'; id: number } | { kind: 'invalid' };

/** The spellings of "no record named". */
const ABSENT_IDS: ReadonlySet<unknown> = new Set([undefined, null, '']);

/**
 * The record-id GRAMMAR, stated once.
 *
 *   undefined / null / ''             → absent (no record named)
 *   an integer, or an integer string  → id (0 and negatives INCLUDED: whether
 *                                       they address a record is the scope
 *                                       step's question, not the parser's)
 *   anything else                     → invalid (1.5, NaN, 'abc', booleans,
 *                                       objects) — never coerced to absent
 */
export function parseRecordId(value: unknown): ParsedRecordId {
	if (ABSENT_IDS.has(value)) return { kind: 'absent' };
	const id = toIntegerId(value);
	return id === null ? { kind: 'invalid' } : { kind: 'id', id };
}

/** An integer number, or a string of decimal digits (optionally signed), as a number. */
function toIntegerId(value: unknown): number | null {
	if (typeof value === 'number') return Number.isInteger(value) ? value : null;
	if (typeof value !== 'string' || !/^-?[0-9]+$/.test(value)) return null;
	return Number(value);
}

/** The identifier gate, relayed as the write door's own grammar refusal. */
function gateTipo(value: unknown, door: string, key: string): string {
	try {
		return assertValidTipo(value, `${door}.${key}`);
	} catch {
		throw new DedaloError('request.invalid', {
			message: `${door}: ${key} is not a valid tipo (${JSON.stringify(value ?? null)})`,
			coordinates: { door, key },
		});
	}
}

/** An absent component key means "the section itself". */
function gateComponent(value: unknown, sectionTipo: string, door: string, key: string): string {
	return ABSENT_IDS.has(value) ? sectionTipo : gateTipo(value, door, key);
}

function invalidRecordId(door: string, value: unknown): DedaloError {
	return new DedaloError('request.invalid', {
		message: `${door}: section_id ${JSON.stringify(value ?? null)} is not a record id`,
		coordinates: { door, key: 'section_id' },
	});
}

/** A validated (section, component, record?) target — the grammar step's output. */
interface Target {
	readonly sectionTipo: string;
	readonly componentTipo: string;
	readonly sectionId: number | null;
}

/** The refusal of a short level on one half. */
function levelShortfall(
	door: string,
	target: Target,
	required: number,
	half: 'section' | 'component',
): DedaloError {
	return new DedaloError('perm.denied', {
		message: `${door}: the ${half} grant on (${target.sectionTipo}, ${target.componentTipo}) is below ${required}`,
		coordinates: {
			door,
			section_tipo: target.sectionTipo,
			tipo: target.componentTipo,
			...(target.sectionId === null ? {} : { section_id: target.sectionId }),
			required,
		},
	});
}

/** Options every record-addressed caller must state — nothing defaults. */
export interface RecordAccessOptions {
	readonly mode: 'read' | 'write';
	readonly level: 1 | 2;
	/** The concrete door, for the log line and the grant. */
	readonly door: string;
	/**
	 * The SECTION half's floor. 0 is a NAMED exception, accepted ONLY for a door
	 * listed in {@link SECTION_FLOOR_ZERO_DOORS} — any other door asking floor 0
	 * is refused as `internal.invariant` before anything is read.
	 */
	readonly sectionFloor: 0 | 1 | 2;
}

/**
 * The ONLY doors that may skip the SECTION half (`sectionFloor: 0`) — the human
 * save door and its twin, the text_area tag delete (the same inline-edit write
 * on the same component: PHP component_common::save asks the component only,
 * and inline editing of a subdatum portal TARGET depends on it). Converging
 * them to 1 is an owner-review item of WC-2026-09-30-write-door; they change
 * together or not at all. SHRINK-ONLY: write_door_native pins this list, and
 * {@link authorizeRecordAccess} refuses floor 0 for every door not on it, so a
 * new caller cannot skip the section half silently.
 */
export const SECTION_FLOOR_ZERO_DOORS: readonly string[] = Object.freeze([
	'save',
	'dd_component_text_area_api.delete_tag',
]);

/** Floor 0 for an unlisted door is a programming error, refused loudly. */
function assertFloorAllowed(options: RecordAccessOptions): void {
	if (options.sectionFloor !== 0 || SECTION_FLOOR_ZERO_DOORS.includes(options.door)) return;
	throw new DedaloError('internal.invariant', {
		message: `${options.door}: sectionFloor 0 is reserved for the named doors (${SECTION_FLOOR_ZERO_DOORS.join(', ')})`,
		coordinates: { door: options.door },
	});
}

/** Step 1 of a record access: both tipos gated, the id an INTEGER (absent is refused). */
function parseRecordTarget(
	raw: { section_tipo: unknown; component_tipo?: unknown; section_id: unknown },
	door: string,
): Target & { sectionId: number } {
	const sectionTipo = gateTipo(raw.section_tipo, door, 'section_tipo');
	const componentTipo = gateComponent(raw.component_tipo, sectionTipo, door, 'component_tipo');
	const parsed = parseRecordId(raw.section_id);
	if (parsed.kind !== 'id') throw invalidRecordId(door, raw.section_id);
	return { sectionTipo, componentTipo, sectionId: parsed.id };
}

/** The ONE carve-out: an account editing its own self-editable components on its own record. */
function selfServiceOf(principal: Principal, target: Target): boolean {
	return (
		target.sectionId !== null &&
		isSelfServiceAccountWrite(principal, target.sectionTipo, target.componentTipo, target.sectionId)
	);
}

/** Step 2: the section grant at or above the floor (skipped for a self-service write). */
async function assertSectionFloor(
	principal: Principal,
	target: Target,
	floor: number,
	skip: boolean,
	door: string,
): Promise<void> {
	if (skip || floor <= 0) return;
	if ((await getSectionPermissions(principal, target.sectionTipo)) < floor) {
		throw levelShortfall(door, target, floor, 'section');
	}
}

/** Step 3: the pair — dd128-aware level on a write, the read door's law on a read. */
async function assertPair(
	principal: Principal,
	target: Target & { sectionId: number },
	options: RecordAccessOptions,
): Promise<void> {
	if (options.mode === 'read') {
		await authorizeComponentRead({ principal, door: options.door }, target);
		return;
	}
	const level = await getRecordComponentPermission(
		principal,
		target.sectionTipo,
		target.componentTipo,
		target.sectionId,
	);
	if (level < options.level) throw levelShortfall(options.door, target, options.level, 'component');
}

/** Step 4: the record scope — the non-positive-id refusal precedes the admin bypass in both modes. */
async function assertScope(
	principal: Principal,
	target: Target & { sectionId: number },
	mode: 'read' | 'write',
	selfService: boolean,
	door: string,
): Promise<void> {
	const { sectionTipo, sectionId } = target;
	if (mode === 'write') {
		await assertRecordWriteTarget(sectionTipo, sectionId, principal, door, {
			selfServiceAccountWrite: selfService,
		});
		return;
	}
	if (await principalCanAccessRecord(sectionTipo, sectionId, principal)) return;
	throw new DedaloError('perm.out_of_scope', {
		message: `${door}: ${sectionTipo}/${String(sectionId)} is not readable by the caller (out of scope, or not a record address)`,
		coordinates: { door, section_tipo: sectionTipo, section_id: sectionId },
	});
}

/**
 * Authorize ONE component of ONE existing record, in the fixed order of the
 * module header, and return the grant. THROWS on any refusal.
 */
export async function authorizeRecordAccess(
	principal: Principal,
	raw: { section_tipo: unknown; component_tipo?: unknown; section_id: unknown },
	options: RecordAccessOptions,
): Promise<RecordGrant> {
	const { door, mode, level } = options;
	assertFloorAllowed(options); // 0. the floor-0 exception is a closed list
	const target = parseRecordTarget(raw, door); // 1. grammar
	const selfService = mode === 'write' && selfServiceOf(principal, target);
	await assertSectionFloor(principal, target, options.sectionFloor, selfService, door); // 2.
	await assertPair(principal, target, options); // 3.
	await assertScope(principal, target, mode, selfService, door); // 4.
	// 5. Every grant field is TYPE-CHECKED before the brand is cast on: the cast
	// alone would accept a grant missing a field (e.g. its actor).
	const fields: Omit<RecordGrant, typeof grantBrand> = {
		...target,
		mode,
		level,
		door,
		userId: principal.userId,
	};
	return Object.freeze(fields) as RecordGrant;
}

/** Options for a section target. */
export interface SectionTargetOptions {
	/** The minimum level on the target (the pair when `tipo` is named, else the section). */
	readonly level: number;
	readonly door: string;
}

/** The grammar of a section target: the id may be ABSENT (a create), never invalid. */
function parseSectionTarget(
	raw: { section_tipo: unknown; tipo?: unknown; section_id?: unknown },
	door: string,
): Target {
	const sectionTipo = gateTipo(raw.section_tipo, door, 'section_tipo');
	const componentTipo = gateComponent(raw.tipo, sectionTipo, door, 'tipo');
	const parsed = parseRecordId(raw.section_id);
	if (parsed.kind === 'invalid') throw invalidRecordId(door, raw.section_id);
	return { sectionTipo, componentTipo, sectionId: parsed.kind === 'id' ? parsed.id : null };
}

/**
 * The level a section target holds: a COMPONENT target needs the section at
 * least readable (the human read's Gate A/B) and is then judged on the pair —
 * dd128-aware when a record is named; a SECTION target on the section, ALWAYS
 * consultation-capped (`getSectionPermissions`): a create / duplicate / delete
 * / overwrite must not happen on a section the engine renders read-only
 * (Activity, Time Machine …), whichever door — tool kind, human or MCP — asks.
 * There is no uncapped variant: it was an option once, and the only callers
 * that declined it (the tool `tipo` / `targets` kinds) were the hole.
 */
async function sectionTargetLevel(
	principal: Principal,
	target: Target,
	options: SectionTargetOptions,
	selfService: boolean,
): Promise<number> {
	const { sectionTipo, componentTipo, sectionId } = target;
	if (componentTipo === sectionTipo) return getSectionPermissions(principal, sectionTipo);
	await assertSectionFloor(principal, target, 1, selfService, options.door);
	return getRecordComponentPermission(principal, sectionTipo, componentTipo, sectionId);
}

/**
 * Authorize a SECTION target that may name a component (`tipo`) and may name a
 * record (`section_id`). An ABSENT id is a create: the level is its whole
 * authorization. A PRESENT id must be an integer and in scope — 0 and
 * negatives are refused by the scope step for every caller, admins included.
 * THROWS on any refusal.
 */
export async function authorizeSectionTarget(
	principal: Principal,
	raw: { section_tipo: unknown; tipo?: unknown; section_id?: unknown },
	options: SectionTargetOptions,
): Promise<SectionGrant> {
	return authorizeParsedSectionTarget(principal, parseSectionTarget(raw, options.door), options);
}

/** Proof that a section target naming ONE EXISTING record was authorized. */
export type SectionRecordGrant = SectionGrant & { readonly sectionId: number };

/**
 * Authorize a SECTION target that MUST name a record — a whole-record effect
 * (delete, duplicate, the tool `record` kind). The same level and scope as
 * {@link authorizeSectionTarget}, but an ABSENT id (undefined / null / '') is
 * refused as `request.invalid` here, by the door: a record-lifecycle door
 * cannot degrade into a section-level authorization with a null target when a
 * caller (or a skipped schema) drops the id. THROWS on any refusal.
 */
export async function authorizeSectionRecord(
	principal: Principal,
	raw: { section_tipo: unknown; tipo?: unknown; section_id: unknown },
	options: SectionTargetOptions,
): Promise<SectionRecordGrant> {
	const target = parseSectionTarget(raw, options.door);
	if (target.sectionId === null) throw invalidRecordId(options.door, raw.section_id);
	return (await authorizeParsedSectionTarget(principal, target, options)) as SectionRecordGrant;
}

/** The level, then the scope of a NAMED record — the shared body of both section-target doors. */
async function authorizeParsedSectionTarget(
	principal: Principal,
	target: Target,
	options: SectionTargetOptions,
): Promise<SectionGrant> {
	const { door, level: required } = options;
	const selfService = selfServiceOf(principal, target);
	const level = await sectionTargetLevel(principal, target, options, selfService);
	if (level < required) {
		const half = target.componentTipo === target.sectionTipo ? 'section' : 'component';
		throw levelShortfall(door, target, required, half);
	}
	if (target.sectionId !== null) {
		await assertScope(
			principal,
			{ ...target, sectionId: target.sectionId },
			'write',
			selfService,
			door,
		);
	}
	return Object.freeze({ ...target, level, door }) as SectionGrant;
}
