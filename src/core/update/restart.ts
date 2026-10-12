/**
 * Planned restart. The server is one long-lived process that froze `config` and
 * its module graph at import; after a code update (or a code restore) swaps the
 * tree, only a restart runs the new code. We exit with RESTART_EXIT_CODE and let
 * the supervisor (deploy/dedalo-ts.service `Restart=always`, or the
 * `start:supervised` / `dev` loops in package.json, scripts/dev.ts) bring a fresh
 * process up. The requesters are core/update/code_update.ts and code_restore.ts.
 *
 * Exit-then-restart beats self-respawn: server.ts refuses to start over a LIVE
 * socket (S2-17b), which a self-`Bun.spawn` replacement would race; the dying
 * process leaves a STALE socket file, which the next boot probes, finds
 * unanswered, and unlinks (server.ts startServer) so the fresh one binds clean.
 *
 * The supervisor contract is gated: test/unit/install_restart_supervisor_tripwire.test.ts
 * asserts the package.json loops exist and key on exactly RESTART_EXIT_CODE —
 * and that NOT_INSTALLED_EXIT_CODE (src/config/install_state.ts, 78) is the one
 * exit no supervisor restarts.
 */

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
 * What a restart request actually did — `draining` when a listening server runs
 * its graceful shutdown first, `immediate` when there is none (a bare exit).
 */
export type RestartOutcome = 'draining' | 'immediate';

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
 * Schedule the exit so the supervisor restarts us into the new code.
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
 * engineering/crap_coverage_exempt.json): ends the PROCESS. Blocked by DANGER,
 * not by fixture — the update gates inject `seams.restart` in its place.
 */
export function scheduleServerRestart(reason: string): RestartOutcome {
	const handler = gracefulShutdown;
	if (handler === null) {
		console.warn(
			`[restart] ${reason} — exiting ${RESTART_EXIT_CODE} for a supervised restart (no listening server to drain).`,
		);
		// Delay so the HTTP response flushes before the socket closes.
		setTimeout(() => process.exit(RESTART_EXIT_CODE), 250);
		return 'immediate';
	}
	console.warn(
		`[restart] ${reason} — draining, then exiting ${RESTART_EXIT_CODE} for a supervised restart.`,
	);
	// Deferred so THIS request's handler returns before the drain begins —
	// otherwise the drain waits on the very response that asked for the restart.
	setTimeout(() => handler(RESTART_EXIT_CODE, `restart: ${reason}`), 250);
	return 'draining';
}
