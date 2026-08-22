/**
 * THE CLIENT SUITE'S OWN SERVER — and the probe that proves which database it
 * is on (`bun run test:client`, scripts/client_test_runner.ts).
 *
 * THE HOLE THIS CLOSES. Every other tier writes test data through the suite's
 * OWN connection, so the marker guard (src/core/test_data/test_database_marker.ts)
 * sees each write and refuses on a database that does not say it is disposable.
 * The client suite is different in kind: a browser drives a LIVE SERVER, and
 * that server's database was whatever the developer's `bun run dev` happened to
 * be pointed at — the APPLICATION's, by default. The runner reseeded test3 into
 * it, provisioned a demo ontology into it, and then let ~125 browser suites
 * save, delete and duplicate records through it. On an install holding real
 * heritage records that is not a test tier, it is an accident waiting for a
 * distracted afternoon.
 *
 * THE MECHANISM, AND WHY THIS ONE. Three shapes were on the table:
 *   (a) the runner STARTS ITS OWN SERVER on the suite database and tears it down;
 *   (b) a `--db test` flag on `scripts/dev.ts`;
 *   (c) a second, documented env file the operator starts a server with.
 * (b) and (c) both leave the guarantee where it was — in a human remembering to
 * pass the flag, or to start the right server before typing the test command.
 * That is precisely the class of guarantee the marker replaced everywhere else,
 * and it fails the same way: silently, on the day someone is in a hurry. (a)
 * makes the safe thing the ONLY thing the command can do — the runner cannot be
 * run against the wrong server because it does not use anyone else's server.
 * It is also the honest shape for a gate: the run owns its server, so it owns
 * its cache state, its log, and its shutdown, and two runs cannot interfere.
 *
 * AND `--url` STILL EXISTS — verified, not trusted. Debugging a client suite
 * against a server you are watching is a real need, so the flag stays; what it
 * no longer does is skip the check. Any target, spawned or given, must answer
 * `/health` with the FINGERPRINT of the very marker row this process reads
 * (`test_database`, dev-mode-only, an opaque sha256 — never the database name).
 * A server on the application's database has no marker, answers no fingerprint,
 * and the run REFUSES before Chrome is launched.
 *
 * The module is import-safe: nothing here touches `src/core/**` at import time
 * (that would freeze the connection at the application database before the
 * repoint below), so `test/unit/test_db_marker_tripwire.test.ts` can import the
 * probe and exercise it against a stub server.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readEnv } from '../src/config/env.ts';
import { testDatabaseName } from '../test/helpers/test_database.ts';
import { ensureTestMediaRoot } from '../test/helpers/test_media_root.ts';

const REPO_ROOT = join(import.meta.dir, '..');

// ---------------------------------------------------------------------------
// The suite database, and pointing THIS process at it.
// ---------------------------------------------------------------------------

/**
 * The database the client run must use — the same derivation the rest of the
 * suite uses (test/helpers/test_database.ts), never a second copy of the rule.
 * Refuses when it resolves to the application's: that is the one mistake this
 * whole file exists to make impossible.
 */
export function resolveSuiteDatabase(): { suiteDb: string; appDb: string } {
	const appDb = readEnv('DB_NAME') ?? readEnv('DEDALO_DATABASE_CONN') ?? '';
	const suiteDb = testDatabaseName();
	if (suiteDb === '' || suiteDb === appDb) {
		throw new Error(
			`REFUSING to run the client suite: the suite database name (${suiteDb || '<empty>'}) is not distinct from the application database (${appDb || '<unset>'}). Set DEDALO_TEST_DATABASE, then build it with 'bun run test:db:setup'.`,
		);
	}
	return { suiteDb, appDb };
}

/**
 * THE DIFFUSION DOMAIN THE CLIENT RUN PUBLISHES THROUGH — pinned, never inherited.
 *
 * `DEDALO_DIFFUSION_DOMAIN` is matched BY TERM against dd1190's children
 * (src/core/diffusion_bridge/diffusion_graph.ts resolveDomainTipo), so its value
 * only means something relative to one database's ontology. Inheriting the
 * installation's value (`mht` here) was harmless while the run drove the
 * developer's server on the APPLICATION database, where that term is a real
 * 75-node domain reaching section rsc170. On the SUITE database the same term
 * resolves to a truncated clone (`test5941`, three nodes, no table children):
 * the domain is FOUND, the section map comes back EMPTY, `haveSectionDiffusion`
 * is false for every section, `tool_diffusion` is unavailable, and the inspector
 * never draws the opener — which surfaced as six mystery DOM assertions in
 * `test_diffusion`. The suite's diffusion answer must not be a property of the
 * developer's machine.
 *
 * `test` is the generic `test`-TLD domain (`test43`) that ships in
 * src/core/test_data/test_tld_ontology.json — repo-owned, materialized by
 * `bun run test:db:setup`, and reaching rsc170 through test5/test63/test16.
 */
export const SUITE_DIFFUSION_DOMAIN = 'test';

/**
 * Repoint THIS process (the runner) at the suite database, before anything
 * imports src/config/config.ts — which freezes the connection at import. Same
 * seam as test/preload/test_database.ts and scripts/test_db_setup.ts; `scripts/`
 * is outside the `process.env` ban (config_env_tripwire covers src/ and tools/),
 * and it has to be: this IS the place the process environment is composed.
 *
 * The session store moves too. The runner mints a session in its own process
 * and the spawned server must read that very row, while the developer's own
 * `bun run dev` sessions — issued against the APPLICATION database, where the
 * same section_id means a different user — must not be reachable from a server
 * on the suite database. A per-run store gives both.
 *
 * @returns the environment map the spawned server inherits.
 */
export function repointProcessToSuiteDatabase(suiteDb: string, sessionDbPath?: string): void {
	process.env.DB_NAME = suiteDb;
	process.env.DEDALO_DATABASE_CONN = suiteDb;
	// THE DIFFUSION DOMAIN MOVES WITH THE DATABASE TOO — see SUITE_DIFFUSION_DOMAIN.
	// It is set HERE and not only in the spawned server's map because this process
	// asserts the domain resolves before Chrome launches (client_test_runner.ts
	// assertSuiteDiffusionSurface), and it must read the same value the server will.
	process.env.DEDALO_DIFFUSION_DOMAIN = SUITE_DIFFUSION_DOMAIN;
	// THE MEDIA ROOT MOVES WITH THE DATABASE. The client suite uploads files,
	// deletes records that carry media and regenerates derivatives — through a
	// LIVE SERVER, so none of it passes this process's guards. Setting
	// DEDALO_TEST_MEDIA_ROOT here (and in the spawned server's environment below)
	// both repoints the root and ARMS the `.dedalo_test_media` refusal, so the run
	// writes into its own tree or into none at all.
	// The suite database NAME is passed explicitly: the tree is keyed by it, and the
	// default derivation (`<DB_NAME>_test`) has just been invalidated two lines up.
	process.env.DEDALO_TEST_MEDIA_ROOT = ensureTestMediaRoot(suiteDb);
	// Only when the run owns its server. Against an EXTERNAL --url server the
	// runner must mint into the store that server reads — its default one.
	if (sessionDbPath !== undefined) process.env.DEDALO_SESSION_DB_PATH = sessionDbPath;
}

/**
 * EVERY STATEFUL SURFACE, SCOPED TO THE RUN. The database is the one that
 * matters most, but it is not the only shared thing a second server would grab:
 * these are the same seams `scripts/ci/client_gate.sh` was written to scope by
 * hand (engineering/CI.md, "CI seam environment"), folded in here so the
 * scoping travels with the runner instead of with one wrapper script that a
 * developer running the command directly never used.
 */
export function suiteServerEnvironment(options: {
	suiteDb: string;
	port: number;
	socketPath: string;
	sessionDbPath: string;
	stateFilePath: string;
}): Record<string, string> {
	repointProcessToSuiteDatabase(options.suiteDb, options.sessionDbPath);
	return {
		...(process.env as Record<string, string>),
		DB_NAME: options.suiteDb,
		DEDALO_DATABASE_CONN: options.suiteDb,
		DEDALO_SESSION_DB_PATH: options.sessionDbPath,
		// The run's OWN media tree — never the installation's (see
		// repointProcessToSuiteDatabase; `repoint…` above has already created and
		// marked it, so the spawned server inherits a root that exists).
		DEDALO_TEST_MEDIA_ROOT: process.env.DEDALO_TEST_MEDIA_ROOT as string,
		SERVER_TCP_PORT: String(options.port),
		// Never the developer's socket: the running `bun run dev` owns that one and
		// the server refuses to steal it (and rightly so).
		SERVER_UNIX_SOCKET: options.socketPath,
		// Never flip the real maintenance state (media protection mode lives here).
		DEDALO_TS_STATE_PATH: options.stateFilePath,
		// Never let this server's scheduler claim live diffusion jobs. The prefix
		// `dedalo_ts_test_` is schema-enforced.
		DIFFUSION_JOBS_TABLE: readEnv('DIFFUSION_JOBS_TABLE') ?? 'dedalo_ts_test_client_diffusion_jobs',
		DIFFUSION_ACTIVITY_TABLE:
			readEnv('DIFFUSION_ACTIVITY_TABLE') ?? 'dedalo_ts_test_client_activity_diffusion',
		// Never the installation's domain — it names a node that does not exist on
		// this database (see SUITE_DIFFUSION_DOMAIN). Explicit, though the repoint
		// above already put it in the inherited environment.
		DEDALO_DIFFUSION_DOMAIN: SUITE_DIFFUSION_DOMAIN,
		// The client suite exercises the developer surfaces, and the fingerprint
		// on /health is dev-mode-only by design.
		DEDALO_DEV_MODE: 'true',
	};
}

/** Per-run, per-pid paths for the things a second server must not share. */
export function suiteServerPaths(pid: number = process.pid): {
	socketPath: string;
	sessionDbPath: string;
	stateFilePath: string;
} {
	const dir = join(tmpdir(), 'dedalo_client_test');
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	return {
		socketPath: join(dir, `server_${pid}.sock`),
		sessionDbPath: join(dir, `sessions_${pid}.sqlite`),
		stateFilePath: join(dir, `ts_state_${pid}.json`),
	};
}

// ---------------------------------------------------------------------------
// THE PROBE — which database is that server on?
// ---------------------------------------------------------------------------

/** What `/health` told us. `fingerprint === null` ⇒ NOT a marked test database. */
export interface ServedDatabaseIdentity {
	status: number;
	fingerprint: string | null;
	entity: string | null;
}

/** The origin of a runner page URL (`http://host:port`). */
export function originOf(url: string): string {
	return new URL(url).origin;
}

/**
 * Ask a running server which database it is on. Pure fetch + parse: no engine
 * import, so a unit test can point it at a stub.
 */
export async function probeServedDatabase(
	origin: string,
	timeoutMs = 5000,
): Promise<ServedDatabaseIdentity> {
	const response = await fetch(`${origin}/health`, {
		signal: AbortSignal.timeout(timeoutMs),
	});
	let body: unknown;
	try {
		body = await response.json();
	} catch {
		body = {};
	}
	const payload = (body ?? {}) as { test_database?: unknown; entity?: unknown };
	return {
		status: response.status,
		fingerprint: typeof payload.test_database === 'string' ? payload.test_database : null,
		entity: typeof payload.entity === 'string' ? payload.entity : null,
	};
}

/**
 * THE REFUSAL. `served` must carry the fingerprint of the marker row this
 * process reads. Anything else — no fingerprint at all (a server on a database
 * with no marker, i.e. an application database), or a DIFFERENT one (a server
 * on someone else's test database, or on one rebuilt since) — throws.
 *
 * Split out of the runner and exported so it is unit-testable in both
 * directions; a probe nobody can prove refuses is not a guard.
 */
export function assertServedDatabase(options: {
	origin: string;
	expected: string;
	served: ServedDatabaseIdentity;
}): void {
	const { origin, expected, served } = options;
	if (served.fingerprint === null) {
		throw new Error(
			`REFUSING to run the client suite against ${origin}: that server does not identify itself as running on this checkout's TEST database. Either it is on the APPLICATION database (no test-database marker row — the client suite must never write there) or it was started without DEDALO_DEV_MODE=true. Run 'bun run test:client' with no --url and the runner starts its own server on the suite database.`,
		);
	}
	if (served.fingerprint !== expected) {
		throw new Error(
			`REFUSING to run the client suite against ${origin}: that server is on a DIFFERENT test database than this process (server ${served.fingerprint.slice(0, 12)}…, expected ${expected.slice(0, 12)}…). A second checkout, a colleague's suite database, or one rebuilt by 'bun run test:db:setup' since that server booted — restart the server, or drop --url and let the runner start its own.`,
		);
	}
}

/**
 * The fingerprint of the marker row THIS process can read. Asserts the marker
 * first, so the runner's own writes (the test3 reseed, the map-of-grapes
 * fixture) are refused by the same door every other test-data writer uses.
 */
export async function localSuiteFingerprint(): Promise<string> {
	const { assertTestDatabase, testDatabaseFingerprint } = await import(
		'../src/core/test_data/test_database_marker.ts'
	);
	await assertTestDatabase('client_test_runner');
	const fingerprint = await testDatabaseFingerprint();
	if (fingerprint === null) {
		// Unreachable via assertTestDatabase, kept because "unreachable" is a claim.
		throw new Error('the suite database carries a marker but produced no fingerprint');
	}
	return fingerprint;
}

// ---------------------------------------------------------------------------
// Lifecycle — start the run's own server, wait for it, stop it.
// ---------------------------------------------------------------------------

/** A port nothing is listening on, starting at `preferred`. */
export async function findFreePort(preferred: number, attempts = 50): Promise<number> {
	for (let port = preferred; port < preferred + attempts; port++) {
		try {
			const probe = Bun.listen({ hostname: '127.0.0.1', port, socket: { data() {} } });
			probe.stop(true);
			return port;
		} catch {
			// in use — try the next
		}
	}
	throw new Error(`no free TCP port in [${preferred}, ${preferred + attempts})`);
}

export interface ClientTestServer {
	origin: string;
	/** Stop the server and wait for it to exit. */
	stop: () => Promise<void>;
}

/**
 * Start a server on the suite database and wait until `/health` answers with
 * the expected fingerprint. Its stdout/stderr are inherited, so a boot failure
 * is read where it happened instead of vanishing into a pipe.
 */
export async function startClientTestServer(options: {
	suiteDb: string;
	expectedFingerprint: string;
	port: number;
	bootTimeoutMs?: number;
	log?: (message: string) => void;
}): Promise<ClientTestServer> {
	const log = options.log ?? (() => {});
	const { socketPath, sessionDbPath, stateFilePath } = suiteServerPaths();
	const env = suiteServerEnvironment({
		suiteDb: options.suiteDb,
		port: options.port,
		socketPath,
		sessionDbPath,
		stateFilePath,
	});
	log(
		`Starting the run's OWN server on '${options.suiteDb}' (port ${options.port}, socket ${socketPath}) — the application database is never served.`,
	);
	const child = Bun.spawn(['bun', 'run', 'src/server.ts'], {
		cwd: REPO_ROOT,
		env,
		stdio: ['ignore', 'inherit', 'inherit'],
	});

	const origin = `http://localhost:${options.port}`;
	const stop = async (): Promise<void> => {
		if (!child.killed) child.kill();
		await child.exited;
		// Per-run scratch: the server unlinks its own socket on shutdown, the
		// session store is ours to remove (it holds this run's session rows).
		for (const path of [
			sessionDbPath,
			`${sessionDbPath}-wal`,
			`${sessionDbPath}-shm`,
			stateFilePath,
		]) {
			rmSync(path, { force: true });
		}
	};

	const deadline = performance.now() + (options.bootTimeoutMs ?? 60_000);
	let lastError = 'no response yet';
	while (performance.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(
				`the client-test server exited during boot (code ${child.exitCode}) — see its output above.`,
			);
		}
		try {
			const served = await probeServedDatabase(origin, 2000);
			// A booting server may answer 503 (db not ready yet) — keep waiting;
			// only a 200 with an identity is an answer.
			if (served.status === 200) {
				assertServedDatabase({ origin, expected: options.expectedFingerprint, served });
				log(`Server ready on ${origin} — database verified by marker fingerprint.`);
				return { origin, stop };
			}
			lastError = `/health answered ${served.status}`;
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('REFUSING')) {
				await stop();
				throw error;
			}
			lastError = error instanceof Error ? error.message : String(error);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	await stop();
	throw new Error(`the client-test server did not become healthy in time (${lastError}).`);
}
