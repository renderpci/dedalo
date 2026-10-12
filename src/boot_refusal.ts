/**
 * FAIL-CLOSED BOOT — the server's FIRST import (WC-2026-10-12-install-surface-removed).
 *
 * A box that is not installed — no configuration, a sealed install whose .env is gone,
 * or an unfinished terminal install (src/config/install_state.ts) — REFUSES TO START:
 * one stderr line (one journal line) naming the operator's next act, then
 * NOT_INSTALLED_EXIT_CODE (78, EX_CONFIG), which the systemd units carry in
 * RestartPreventExitStatus. There is no install surface to serve: installing is the
 * terminal installer's job (./install.sh / bun run dedalo:install).
 *
 * WHY A SIDE-EFFECT MODULE, IMPORTED FIRST. ES modules evaluate in import order, so
 * this module (and its only dependencies, install_state.ts → env.ts, which read and
 * never write) runs BEFORE any sibling import of server.ts is evaluated — before the
 * session store opens its SQLite file, before the config build records a media-root
 * decision in ts_state.json, before any listener. A refused boot therefore leaves the
 * private directory exactly as it found it. A check inside `startServer()` would run
 * after all of those module-level writers.
 *
 * ONLY WHEN server.ts IS THE PROCESS ENTRY (`Bun.main`). Gates import server.ts for
 * `handleRequest` against scratch state; refusing there would kill the test runner.
 * `startServer()` repeats the check for a programmatic caller.
 * Gate: test/unit/no_install_surface_tripwire.test.ts (spawns the real server).
 */

import { join } from 'node:path';
import { NOT_INSTALLED_EXIT_CODE, notInstalledRefusal } from './config/install_state.ts';

/** Print the refusal and exit 78 when the box is not installed; return otherwise. */
export function refuseBootWhenNotInstalled(): void {
	const refusal = notInstalledRefusal();
	if (refusal === null) return;
	console.error(
		`[boot] REFUSED — ${refusal} (exit ${NOT_INSTALLED_EXIT_CODE}; supervisors must not restart)`,
	);
	process.exit(NOT_INSTALLED_EXIT_CODE);
}

if (Bun.main === join(import.meta.dir, 'server.ts')) refuseBootWhenNotInstalled();
