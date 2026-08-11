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

/**
 * What a restart request actually did — the caller must be able to tell, because
 * "suppressed" is indistinguishable from "restarting" at the call site otherwise.
 * A lifecycle BUTTON reporting success while `DEDALO_INSTALL_NO_RESTART=true`
 * silently swallowed the request is the failure this type exists to prevent.
 */
export type RestartOutcome = 'suppressed' | 'draining' | 'immediate';

/**
 * The graceful-shutdown entry point, injected by server.ts at boot.
 *
 * Inverted (server.ts registers into core, core never imports server.ts) for the
 * same reason as registerOpsGauge: a static edge would close an import cycle
 * through the process root. Null in the CLI, the test runner, and any context
 * with no listening server — hence the immediate-exit fallback below.
 */
type GracefulShutdown = (exitCode: number, reason: string) => void;
let gracefulShutdown: GracefulShutdown | null = null;

/** Called once from startServer, after the signal handlers are installed. */
export function registerGracefulShutdown(handler: GracefulShutdown): void {
	gracefulShutdown = handler;
}

/**
 * Schedule the exit so the supervisor restarts us into the real config.
 *
 * Routes through the GRACEFUL path when a server is listening. A bare
 * `process.exit` here skipped everything shutdownGracefully does — draining
 * in-flight requests, marking undrained media jobs `interrupted` in their
 * pfiles, journaling dying background jobs, closing the DB pool, unlinking the
 * socket — because that logic is bound to SIGTERM/SIGINT only. A restart is a
 * planned shutdown; it deserves the same drain a supervisor's SIGTERM gets.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a ONE-SHOT install procedure that
 * MUTATES THE MACHINE — config files, a database restore, root credentials, a
 * 126 MB hierarchy import, or a process restart. Blocked by DANGER, not by
 * fixture: the hermetic logic in the same subsystem (deriveLangConfig,
 * installIpAllowed, resolvePgBinary, the hierarchy_meta readers) IS gated
 * (test/unit/tier1_install_native.test.ts).
 */
export function scheduleServerRestart(reason: string): RestartOutcome {
	// Never kill the test runner or the short-lived CLI (which reloads config by
	// simply exiting on its own): both set DEDALO_INSTALL_NO_RESTART=true.
	if (readEnv('DEDALO_INSTALL_NO_RESTART') === 'true') {
		console.warn(`[install] restart suppressed (DEDALO_INSTALL_NO_RESTART): ${reason}`);
		return 'suppressed';
	}
	const handler = gracefulShutdown;
	if (handler === null) {
		console.warn(
			`[install] ${reason} — exiting ${RESTART_EXIT_CODE} for supervised restart into configured mode (no listening server to drain).`,
		);
		// Delay so the HTTP response flushes before the socket closes.
		setTimeout(() => process.exit(RESTART_EXIT_CODE), 250);
		return 'immediate';
	}
	console.warn(
		`[install] ${reason} — draining, then exiting ${RESTART_EXIT_CODE} for supervised restart into configured mode.`,
	);
	// Deferred so THIS request's handler returns before the drain begins —
	// otherwise the drain waits on the very response that asked for the restart.
	setTimeout(() => handler(RESTART_EXIT_CODE, `restart: ${reason}`), 250);
	return 'draining';
}
