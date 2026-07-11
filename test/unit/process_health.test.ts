/**
 * Poison-latch gate (first-load TDZ hardening — see core/api/process_health.ts
 * and server.ts warmCoreModuleGraph). Proves the three behaviors the
 * production posture rests on:
 *   1. TDZ-shaped ReferenceErrors are recognized (Bun TDZ errors carry no
 *      stack frames, so the MESSAGE is the discriminator);
 *   2. non-TDZ errors never flip the latch (a routine handler exception must
 *      not trigger a watchdog restart);
 *   3. a poisoned process answers /health with 503 process:'poisoned' — the
 *      signal the S2-38 watchdog restarts on;
 *   4. (ops-test audit 2026-07-07) the dispatch.ts catch actually WIRES the
 *      latch: a TDZ throw inside a registered handler degrades the envelope
 *      AND poisons the process — deleting the markProcessPoisoned branch
 *      reproduces the 2026-07-07 incident with a green suite otherwise.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import { utilsApiActions } from '../../src/core/api/handlers/dd_utils_api.ts';
import {
	getProcessPoison,
	isModulePoisonError,
	markProcessPoisoned,
	resetProcessPoisonForTests,
} from '../../src/core/api/process_health.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { createRequestContext, handleRequest } from '../../src/server.ts';

/** An authenticated superuser context with a valid CSRF candidate (the
 * security_fail_closed.test.ts helper — sessions land in the S1-18 scratch store). */
function authedContext(): ApiRequestContext {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	return {
		requestId: 'test',
		clientIp: '127.0.0.1',
		session,
		sessionToken: token,
		csrfCandidate: session?.csrfToken ?? null,
	};
}

describe('process poison latch (TDZ hardening)', () => {
	afterEach(() => {
		// The latch is process-global by design — never leak it into later tests.
		resetProcessPoisonForTests();
	});

	test('classifies TDZ ReferenceErrors and nothing else', () => {
		expect(
			isModulePoisonError(new ReferenceError("Cannot access 'config' before initialization")),
		).toBe(true);
		// The exact message shape observed 2026-07-07 varies by binding name.
		expect(
			isModulePoisonError(new ReferenceError("Cannot access 'termByTipo' before initialization")),
		).toBe(true);
		// Ordinary ReferenceError (typo class) — NOT a poisoned module.
		expect(isModulePoisonError(new ReferenceError('x is not defined'))).toBe(false);
		// Non-ReferenceError with a coincidental message — NOT a poisoned module.
		expect(isModulePoisonError(new Error("Cannot access 'x' before initialization"))).toBe(false);
		expect(isModulePoisonError('string error')).toBe(false);
		expect(isModulePoisonError(undefined)).toBe(false);
	});

	test('latch is idempotent, keeps the FIRST reason, counts occurrences', () => {
		expect(getProcessPoison().poisoned).toBe(false);
		markProcessPoisoned('first: TDZ in dd_core_api::read');
		markProcessPoisoned('second: TDZ in dd_core_api::read');
		const state = getProcessPoison();
		expect(state.poisoned).toBe(true);
		expect(state.reason).toBe('first: TDZ in dd_core_api::read');
		expect(state.occurrences).toBe(2);
	});

	test('/health answers 503 process:poisoned once the latch is set', async () => {
		const healthRequest = () =>
			handleRequest(new Request('http://localhost/health'), createRequestContext());

		// Healthy process first (DB is up in the test environment): 200 ok.
		const before = await healthRequest();
		expect(before.status).toBe(200);

		markProcessPoisoned('TDZ ReferenceError in dd_core_api::read (gate)');
		const after = await healthRequest();
		expect(after.status).toBe(503);
		const body = (await after.json()) as { result: string; process?: string; reason?: string };
		expect(body.result).toBe('error');
		expect(body.process).toBe('poisoned');
		expect(body.reason).toContain('dd_core_api::read');
	});

	test('dispatch wiring: a TDZ throw in a handler degrades the envelope AND flips the latch', async () => {
		// The registry objects are mutable — plant a probe action that throws the
		// exact Bun TDZ shape, dispatch it through the REAL gate chain, and prove
		// the dispatch.ts catch both degrades to the PHP-shaped envelope and
		// marks the process poisoned (the incident-reproducing branch).
		const PROBE = '__test_tdz_probe__';
		utilsApiActions[PROBE] = async () => {
			throw new ReferenceError("Cannot access 'x' before initialization");
		};
		try {
			const res = await dispatchRqo(
				{ action: PROBE, dd_api: 'dd_utils_api' } as Rqo,
				authedContext(),
			);
			// The client envelope degrades exactly like any handler exception…
			expect(res.status).toBe(200);
			expect(res.body.result).toBe(false);
			// …AND the process-global latch is set, naming the poisoned action.
			const poison = getProcessPoison();
			expect(poison.poisoned).toBe(true);
			expect(poison.reason).toContain(`dd_utils_api::${PROBE}`);
		} finally {
			delete utilsApiActions[PROBE];
		}
	});

	test('dispatch wiring CONTROL: a plain handler Error degrades but does NOT poison', async () => {
		const PROBE = '__test_plain_error_probe__';
		utilsApiActions[PROBE] = async () => {
			throw new Error('routine handler failure');
		};
		try {
			const res = await dispatchRqo(
				{ action: PROBE, dd_api: 'dd_utils_api' } as Rqo,
				authedContext(),
			);
			expect(res.status).toBe(200);
			expect(res.body.result).toBe(false);
			// A routine exception must never trigger a watchdog restart.
			expect(getProcessPoison().poisoned).toBe(false);
		} finally {
			delete utilsApiActions[PROBE];
		}
	});
});
