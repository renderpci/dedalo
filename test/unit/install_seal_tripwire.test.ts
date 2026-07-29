/**
 * TRIPWIRE: the pre-auth install surface fails CLOSED on a configured /
 * PHP-migrated instance (OPS-01, 2026-07-28 security audit).
 *
 * The install actions (`get_install_context`, the `install` step router incl.
 * `persist_config` → .env rewrite + restart, and `test_db_connection` → psql)
 * are reachable WITHOUT a session. They must therefore open ONLY on a genuinely
 * fresh box (`INSTALL_MODE` — every required config key unset) or one whose TS
 * wizard is mid-flight (`installInProgress`), and NEVER once sealed OR on a
 * configured/migrated instance. The regression this guards: keying the gate on
 * `!isSealed()` ALONE exposed the unauthenticated installer on every coexistence
 * deploy, because such an instance has no `install_status` (⇒ not "sealed") yet
 * is fully configured.
 *
 * Two layers: (1) an env-independent behavioural assertion (sealed ⇒ closed;
 * and, when this test process is itself a configured box, undefined-status ⇒
 * closed — the exact OPS-01 case); (2) source invariants so the three
 * conditions cannot be silently deleted from either the predicate or its one
 * dispatch call site.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTALL_MODE } from '../../src/config/install_mode.ts';
import { installSurfaceReachable } from '../../src/core/install/gate.ts';
import { getServerState, setServerState } from '../../src/core/resolve/server_state.ts';

const ROOT = join(import.meta.dir, '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

describe('OPS-01 — install surface fails closed on a configured/migrated instance', () => {
	const original = getServerState().install_status;
	afterAll(() => {
		setServerState({ install_status: original });
	});

	test('sealed ⇒ never reachable (env-independent)', () => {
		setServerState({ install_status: 'sealed' });
		expect(installSurfaceReachable()).toBe(false);
	});

	test('configured box + no install_status ⇒ NOT reachable (the OPS-01 case)', () => {
		// This test process is a configured box iff INSTALL_MODE is false (its DB
		// keys are set). That is exactly the PHP-migrated shape: no install_status,
		// yet configured. It MUST be closed. On a hypothetical fresh test env
		// (INSTALL_MODE true) the fresh-install window is correctly open, so the
		// assertion only fires for the shape we are protecting.
		setServerState({ install_status: undefined });
		if (!INSTALL_MODE) {
			expect(installSurfaceReachable()).toBe(false);
		} else {
			expect(installSurfaceReachable()).toBe(true);
		}
	});

	test('sealed wins even if INSTALL_MODE would open it', () => {
		setServerState({ install_status: 'sealed' });
		expect(installSurfaceReachable()).toBe(false);
	});

	test('SOURCE: installSurfaceReachable weighs all three conditions', () => {
		// isSealed (close), INSTALL_MODE (fresh), installInProgress (mid-wizard) —
		// deleting any one re-opens OPS-01 or locks out a real install.
		const gate = read('src/core/install/gate.ts');
		const body = gate.slice(gate.indexOf('export function installSurfaceReachable'));
		expect(body.includes('isSealed')).toBe(true);
		expect(body.includes('INSTALL_MODE')).toBe(true);
		expect(body.includes('installInProgress')).toBe(true);
	});

	test('SOURCE: dispatch gates the install surface on installSurfaceReachable, not bare !isSealed', () => {
		const dispatch = read('src/core/api/dispatch.ts');
		expect(dispatch.includes('installSurfaceReachable()')).toBe(true);
		// The reachability DECISION must not be a bare `!isSealed()` anywhere in
		// the dispatcher (it may appear only inside an explanatory comment).
		const code = dispatch
			.split('\n')
			.filter((line) => !line.trim().startsWith('//'))
			.join('\n');
		expect(code.includes('!isSealed()')).toBe(false);
	});
});
