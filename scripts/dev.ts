/**
 * DEV — one command for the whole loop: `bun run dev`.
 *
 * Runs two things side by side:
 *
 *   1. the CSS watcher (scripts/build_css.ts --watch) — recompiles LESS on save;
 *   2. the server under `bun --watch`, wrapped in the SUPERVISOR loop.
 *
 * WHY THE SUPERVISOR EXISTS (do not remove it): the browser install wizard writes
 * ../private/.env and then exits the process with code 75, because config is read once at
 * import and the only way into the new config is a fresh process. In production systemd's
 * `Restart=always` does this; in dev, this loop is that supervisor. Any OTHER exit code is
 * a real failure and propagates — we do not restart on a crash, which would hide it.
 *
 * WHY CSS NEEDS ITS OWN WATCHER: `bun --watch` follows the TypeScript module graph, and no
 * TS module imports a `.less` file — so it neither rebuilds CSS nor restarts on a CSS change.
 * That is the right behavior: `static_asset.ts` serves CSS with `Bun.file()`, straight from
 * disk on every request, so a recompiled stylesheet is live on the next browser reload with
 * no server restart at all. The two watchers are genuinely independent.
 *
 * Ctrl-C stops both. The CSS watcher is killed on every exit path, so it cannot outlive the
 * server and leave an orphan holding the LESS tree.
 */

// IMPORTED, never re-typed. The supervisor must key on the SAME exit code the server
// actually uses to ask for a restart; a hand-copied `75` here is precisely the stale-copy
// drift that `install_restart_supervisor_tripwire.test.ts` exists to catch.
import { RESTART_EXIT_CODE } from '../src/core/install/restart.ts';

const cssWatcher = Bun.spawn(['bun', 'run', 'scripts/build_css.ts', '--watch'], {
	stdio: ['ignore', 'inherit', 'inherit'],
});

let shuttingDown = false;
let server: Bun.Subprocess | null = null;

/**
 * Kill BOTH children. The server matters most: it holds SERVER_UNIX_SOCKET, and an orphan
 * that outlives this process makes the next `bun run dev` die on the double-start guard
 * ("another server instance is already listening — refusing to steal its socket"). A
 * terminal Ctrl-C signals the whole foreground group so the server would get it anyway, but
 * a `kill <pid>` from a script or an editor's stop button signals only US — so we forward it
 * explicitly rather than relying on the process group.
 */
function stopChildren(): void {
	if (!cssWatcher.killed) cssWatcher.kill();
	if (server !== null && !server.killed) server.kill();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		shuttingDown = true;
		stopChildren();
		process.exit(0);
	});
}

try {
	while (!shuttingDown) {
		server = Bun.spawn(['bun', 'run', '--watch', 'src/server.ts'], {
			stdio: ['inherit', 'inherit', 'inherit'],
		});
		const code = await server.exited;
		server = null;

		// RESPAWN on exactly RESTART_EXIT_CODE, and on nothing else: a graceful ^C exits 0 and
		// must QUIT, a crash exits non-zero and must NOT hot-loop (it would hide the crash).
		if (code !== RESTART_EXIT_CODE) {
			stopChildren();
			process.exit(code);
		}
		console.log(
			`[supervisor] restart requested (exit ${RESTART_EXIT_CODE}) — rebooting into the persisted config`,
		);
	}
} finally {
	stopChildren();
}
