/**
 * TRIPWIRE — the restart-after-persist supervisor contract (DEC-19).
 *
 * `persist_config` writes ../private/.env and then KILLS the server on purpose:
 * `config` is frozen at import, so only a fresh process can serve the new
 * configuration. That is only half a mechanism — something must bring the
 * process back, or the install wizard hangs forever at "Save configuration"
 * with nothing listening for its "Verify active configuration" click.
 *
 * That is not hypothetical: src/core/install/restart.ts used to justify its
 * exit by naming a `start:supervised` loop that WAS NEVER WRITTEN. Production
 * (systemd `Restart=always`) was fine; every dev running the documented
 * `bun run dev` got a dead server and a stuck installer.
 *
 * So the contract is mechanical, not prose:
 *   1. the supervised run scripts EXIST in package.json, and
 *   2. they respawn on exactly RESTART_EXIT_CODE — the one the server actually
 *      exits with — and on nothing else (a graceful ^C exits 0 and must QUIT,
 *      a crash exits non-zero and must NOT hot-loop), and
 *   3. the systemd unit does not count that planned exit as a failure.
 */

import { describe, expect, test } from 'bun:test';
import { RESTART_EXIT_CODE } from '../../src/core/install/restart.ts';

const pkg = (await Bun.file(new URL('../../package.json', import.meta.url)).json()) as {
	scripts: Record<string, string>;
};

/** The run scripts that must survive a restart-after-persist unattended. */
const SUPERVISED_SCRIPTS = ['start:supervised', 'dev'];

describe('install restart supervisor contract', () => {
	test('RESTART_EXIT_CODE is a real, non-zero, non-signal exit code', () => {
		// 0 would collide with a graceful shutdown; >125 collides with the shell's
		// signal/not-found encodings.
		expect(RESTART_EXIT_CODE).toBeGreaterThan(0);
		expect(RESTART_EXIT_CODE).toBeLessThan(126);
	});

	test('the server exits with RESTART_EXIT_CODE (not a bare 0) to ask for a restart', async () => {
		const src = await Bun.file(
			new URL('../../src/core/install/restart.ts', import.meta.url),
		).text();
		expect(src).toContain('process.exit(RESTART_EXIT_CODE)');
		// A literal exit(0) here would silently re-break the supervisor loops:
		// they cannot distinguish it from an operator ^C.
		expect(src).not.toContain('process.exit(0)');
	});

	for (const name of SUPERVISED_SCRIPTS) {
		test(`package.json '${name}' exists and respawns on exactly ${RESTART_EXIT_CODE}`, () => {
			const script = pkg.scripts[name];
			// The failure this whole file exists to prevent: the code names a
			// supervisor script that nobody ever wrote.
			expect(script).toBeString();

			// It must key on the SAME code the server exits with — not a stale copy.
			expect(script).toContain(String(RESTART_EXIT_CODE));

			// ...and it must propagate any OTHER code instead of looping on it, so
			// ^C (exit 0) quits and a crash stops rather than spinning.
			expect(script).toContain('exit $code');
		});
	}

	test('systemd does not book the planned restart exit as a failure', async () => {
		const unit = await Bun.file(new URL('../../deploy/dedalo-ts.service', import.meta.url)).text();
		expect(unit).toContain(`SuccessExitStatus=${RESTART_EXIT_CODE}`);
		// Restart=always is what actually brings it back in production.
		expect(unit).toContain('Restart=always');
	});
});
