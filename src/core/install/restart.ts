/**
 * Restart-after-persist (DEC-19). The server is one long-lived process that
 * froze `config` at import; after persist_config writes `.env`, only a restart
 * can load the real config. We exit cleanly and let the supervisor
 * (deploy/dedalo-ts.service `Restart=always`, or the documented dev
 * `start:supervised` loop) bring a fresh process up — which boots out of install
 * mode. The wizard's separate manual `verify_active_config` click + the client's
 * request retries bridge the ~seconds gap.
 *
 * Exit-then-restart beats self-respawn: server.ts refuses to start over a LIVE
 * socket (S2-17b), which a self-`Bun.spawn` replacement would race; the dying
 * process unlinks the socket in graceful shutdown so the fresh one binds clean.
 */

import { readEnv } from '../../config/env.ts';

/** Schedule a clean process exit so the supervisor restarts into real config. */
export function scheduleServerRestart(reason: string): void {
	// Never kill the test runner or the short-lived CLI (which reloads config by
	// simply exiting on its own): both set DEDALO_INSTALL_NO_RESTART=true.
	if (readEnv('DEDALO_INSTALL_NO_RESTART') === 'true') {
		console.warn(`[install] restart suppressed (DEDALO_INSTALL_NO_RESTART): ${reason}`);
		return;
	}
	console.warn(
		`[install] ${reason} — exiting for supervised restart into configured mode (2xx flushed first).`,
	);
	// Delay so the HTTP response flushes before the socket closes.
	setTimeout(() => process.exit(0), 250);
}
