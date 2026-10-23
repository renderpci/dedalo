/**
 * update_lock_components_state / get_lock_status — options.section_tipo is a
 * TIPO before any branch reads it.
 *
 * THE DEFECT: both lock handlers checked `!options.section_tipo` — truthiness —
 * and then bound the value as-is. For every action but the own-lock cleanup that
 * value first reached getPermissions; for `delete_user_section_locks`, which
 * runs no read gate (WC-2026-10-23-own-lock-cleanup-ungated), it went STRAIGHT
 * into `DELETE … WHERE section_tipo = $1` — an array, an object, a number, a
 * free string: whatever the client posted. An ungated door that binds an
 * unvalidated value has nothing between the wire and the statement.
 *
 * THE RULE: section_tipo is required (absent / null / '' → request.invalid_options,
 * the existing contract), and when present it must be a STRING in the tipo
 * grammar (isValidTipo: `^[a-z]+[0-9]+$`, bounded length) or the request is
 * refused with request.invalid_tipo — for EVERY action, gated or not, and before
 * any lock row is read, acquired or deleted.
 *
 * Every leg goes through the HANDLER (utilsApiActions) and measures the OUTCOME
 * on the lock table: a refused cleanup must leave the caller's own lock in place.
 *
 * SCRATCH SURFACE: the TS lock table only, synthetic user id 424291 (no
 * matrix_users row), scratch section_ids 990201..990202 on the generic `test3`
 * section; swept fail-loud in afterAll.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { utilsApiActions } from '../../src/core/api/handlers/dd_utils_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { updateLockComponentsState } from '../../src/core/section/locks.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const LOCK_TABLE = 'dedalo_ts_component_locks';
const SECTION_TIPO = 'test3';
const COMPONENT_TIPO = 'test78';
const CALLER_ID = 424291;
const CALLER: Principal = { userId: CALLER_ID, isGlobalAdmin: false, isDeveloper: false };
/** A global admin: passes every read gate, so a refusal can only be the grammar. */
const ADMIN: Principal = { userId: CALLER_ID, isGlobalAdmin: true, isDeveloper: false };

/** Values a client can post that are present but NOT a tipo. */
const MALFORMED: readonly [string, unknown][] = [
	['an array holding a real tipo', [SECTION_TIPO]],
	['an object', { section_tipo: SECTION_TIPO }],
	['a number', 3],
	['a boolean', true],
	['a string with SQL in it', `${SECTION_TIPO}' OR '1'='1`],
	['an upper-case string', 'TEST3'],
	['a string with a space', 'test 3'],
	['digits only', '123'],
	['an absurdly long well-shaped string', `test${'9'.repeat(200)}`],
];

function contextFor(principal: Principal): ApiRequestContext {
	return {
		requestId: `lock-tipo-${crypto.randomUUID()}`,
		clientIp: '127.0.0.1',
		session: null,
		csrfCandidate: null,
		principal,
	} as unknown as ApiRequestContext;
}

async function callHandler(
	action: 'update_lock_components_state' | 'get_lock_status',
	principal: Principal,
	options: Record<string, unknown>,
) {
	const handler = utilsApiActions[action];
	if (handler === undefined) throw new Error(`${action} is not registered`);
	return handler(
		{ dd_api: 'dd_utils_api', action, options } as unknown as Rqo,
		contextFor(principal),
	);
}

/** The DedaloError the handler refused with (any other throw fails the leg). */
async function refusal(
	action: 'update_lock_components_state' | 'get_lock_status',
	principal: Principal,
	options: Record<string, unknown>,
): Promise<DedaloError> {
	let thrown: unknown;
	try {
		await callHandler(action, principal, options);
	} catch (error) {
		thrown = error;
	}
	if (thrown === undefined) throw new Error(`expected ${action} to refuse, it answered`);
	expect(thrown).toBeInstanceOf(DedaloError);
	return thrown as DedaloError;
}

async function seedOwnLock(sectionId: number): Promise<void> {
	const res = await updateLockComponentsState({
		section_tipo: SECTION_TIPO,
		section_id: sectionId,
		component_tipo: COMPONENT_TIPO,
		action: 'focus',
		user_id: CALLER_ID,
		full_username: `scratch user ${CALLER_ID}`,
	});
	// A seed that did not acquire would make the "lock survives" legs vacuous.
	expect(res.applied).toBe(true);
}

async function ownLockCount(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${LOCK_TABLE}" WHERE user_id = $1`,
		[CALLER_ID],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

async function sweep(): Promise<void> {
	await sql.unsafe(`DELETE FROM "${LOCK_TABLE}" WHERE user_id = $1`, [CALLER_ID]);
}

beforeAll(async () => {
	// ensureTable() runs on first use; then start clean.
	await seedOwnLock(990201);
	await sweep();
});

afterAll(async () => {
	await sweep();
	expect(await ownLockCount()).toBe(0);
});

describe('lock handlers: options.section_tipo must be a tipo', () => {
	beforeEach(async () => {
		await sweep();
	});

	test('positive control: a well-formed section_tipo cleans the caller own locks', async () => {
		await seedOwnLock(990201);
		await seedOwnLock(990202);
		expect(await ownLockCount()).toBe(2);
		const result = await callHandler('update_lock_components_state', CALLER, {
			section_tipo: SECTION_TIPO,
			action: 'delete_user_section_locks',
		});
		expect(result.status).toBe(200);
		expect(await ownLockCount()).toBe(0);
	});

	for (const [label, value] of MALFORMED) {
		test(`delete_user_section_locks (ungated) refuses ${label}, deleting nothing`, async () => {
			await seedOwnLock(990201);
			expect(await ownLockCount()).toBe(1);
			const error = await refusal('update_lock_components_state', CALLER, {
				section_tipo: value,
				action: 'delete_user_section_locks',
			});
			expect(error.code).toBe('request.invalid_tipo');
			expect(await ownLockCount()).toBe(1);
		});

		test(`focus (gated) refuses ${label} as a tipo fault, not past the gate`, async () => {
			// ADMIN passes any read gate: the refusal can only come from the grammar.
			const error = await refusal('update_lock_components_state', ADMIN, {
				section_tipo: value,
				section_id: 990202,
				component_tipo: COMPONENT_TIPO,
				action: 'focus',
			});
			expect(error.code).toBe('request.invalid_tipo');
			expect(await ownLockCount()).toBe(0);
		});

		test(`get_lock_status refuses ${label}`, async () => {
			const error = await refusal('get_lock_status', ADMIN, {
				section_tipo: value,
				section_id: 990202,
				component_tipo: COMPONENT_TIPO,
			});
			expect(error.code).toBe('request.invalid_tipo');
		});
	}

	test('absent / null / empty section_tipo keeps the required-field contract', async () => {
		for (const options of [{}, { section_tipo: null }, { section_tipo: '' }]) {
			const cleanup = await refusal('update_lock_components_state', CALLER, {
				...options,
				action: 'delete_user_section_locks',
			});
			expect(cleanup.code).toBe('request.invalid_options');
			const status = await refusal('get_lock_status', ADMIN, options);
			expect(status.code).toBe('request.invalid_options');
		}
	});
});
