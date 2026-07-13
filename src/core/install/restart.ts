/**
 * Restart-after-persist (DEC-19). The server is one long-lived process that
 * froze `config` at import; after persist_config writes `.env`, only a restart
 * can load the real config. We exit with RESTART_EXIT_CODE and let the
 * supervisor (deploy/dedalo-ts.service `Restart=always`, or the `start:supervised`
 * / `dev` loops in package.json) bring a fresh process up — which boots out of
 * install mode. The wizard's separate manual `verify_active_config` click + the
 * client's request retries bridge the ~seconds gap.
 *
 * Exit-then-restart beats self-respawn: server.ts refuses to start over a LIVE
 * socket (S2-17b), which a self-`Bun.spawn` replacement would race; the dying
 * process leaves a STALE socket file, which the next boot probes, finds
 * unanswered, and unlinks (server.ts startServer) so the fresh one binds clean.
 *
 * The supervisor contract is gated: test/unit/install_restart_supervisor_tripwire.test.ts
 * asserts the package.json loops exist and key on exactly RESTART_EXIT_CODE.
 * It exists because this file once pointed at a `start:supervised` script that
 * was NEVER written — so under `bun run dev` the wizard killed the server and
 * nothing brought it back, hanging the install at "Save configuration".
 */

import { readEnv } from '../../config/env.ts';

/**
 * "I am obsolete — start me again", as distinct from a clean operator shutdown
 * and from a crash. The supervisor loops respawn ONLY on this code: a graceful
 * ^C also exits 0 (server.ts shutdownGracefully), so keying on 0 would make the
 * server unkillable, and keying on "any exit" would hot-loop a crash. systemd
 * restarts on any code (`Restart=always`); its `SuccessExitStatus=75` keeps this
 * planned exit out of the failure counters. Value: BSD sysexits EX_TEMPFAIL.
 */
export const RESTART_EXIT_CODE = 75;

/** Schedule the exit so the supervisor restarts us into the real config. */
export function scheduleServerRestart(reason: string): void {
	// Never kill the test runner or the short-lived CLI (which reloads config by
	// simply exiting on its own): both set DEDALO_INSTALL_NO_RESTART=true.
	if (readEnv('DEDALO_INSTALL_NO_RESTART') === 'true') {
		console.warn(`[install] restart suppressed (DEDALO_INSTALL_NO_RESTART): ${reason}`);
		return;
	}
	console.warn(
		`[install] ${reason} — exiting ${RESTART_EXIT_CODE} for supervised restart into configured mode (2xx flushed first).`,
	);
	// Delay so the HTTP response flushes before the socket closes.
	setTimeout(() => process.exit(RESTART_EXIT_CODE), 250);
}
