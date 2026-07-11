/**
 * core/update/ownership.ts — the standalone-ownership gate, COLLAPSED at the
 * 2026-07-11 PHP-freeze cutover (rewrite/CUTOVER_RUNBOOK.md §4;
 * rewrite/COEXISTENCE.md history, UPDATE_PROCESS Phase 0 row): the PHP engine
 * is retired, the TS engine is the single writer, and engineOwnsInstall() is
 * unconditionally true — regardless of the install-seal state, which the
 * coexistence-era gate consulted.
 *
 * The per-action classification (gated()/engineDenied() marks) and the
 * denied-handler byte contract are gated elsewhere:
 * update_ownership_tripwire.test.ts / engine_denied_boundary.test.ts.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readEnv } from '../../src/config/env.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import { engineOwnsInstall } from '../../src/core/update/ownership.ts';

const STATE_PATH = readEnv('DEDALO_TS_STATE_PATH');
if (STATE_PATH === undefined) {
	// The preload (test/preload/session_db.ts) must have pointed the process at
	// a scratch state file — SEALING the LIVE ../private/ts_state.json would
	// flip a running server's install lifecycle (S1-18 pattern).
	throw new Error(
		'update_ownership.test.ts: DEDALO_TS_STATE_PATH is not set — refusing to run against the live server state file (S1-18)',
	);
}

afterAll(() => {
	// never leave a scratch seal behind (JSON.stringify drops undefined keys)
	setServerState({ install_status: undefined });
});

describe('engineOwnsInstall — collapsed to true at the 2026-07-11 cutover', () => {
	test('owns the install in EVERY install-lifecycle state (single-writer)', () => {
		for (const status of [
			undefined,
			'unconfigured',
			'configured',
			'installing',
			'sealed',
		] as const) {
			setServerState({ install_status: status });
			expect(engineOwnsInstall(), `install_status=${String(status)}`).toBe(true);
		}
	});
});
