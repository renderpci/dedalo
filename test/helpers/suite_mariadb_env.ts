/**
 * The SUITE MARIADB TARGET — its names, paths and the environment that arms a process
 * at it. The LIGHT half of `test/helpers/suite_mariadb.ts` (PUB-05, audit 2026-09-26).
 *
 * WHY A SEPARATE MODULE. `test/preload/suite_mariadb.ts` composes the environment of
 * EVERY `bun test` process from this file, before any test module is imported. The
 * heavy half (the provisioner, the classifier's live probe, the fixture situations it
 * derives the target list from) reaches `src/core/db/postgres.ts` and the MariaDB pool
 * module; a preload that imported it would build pools at import time. This file
 * imports nothing but `node:` modules, the env reader and the lane-name derivation
 * (`test_database.ts`, itself env-only), performs no I/O beyond what `src/config/env.ts`
 * does at its own import, and can therefore not fail a preload.
 *
 * WHAT A SUITE TARGET IS. A MariaDB server the SUITE started, per lane (the suite
 * database name keys it, exactly as it keys the media root and the vector database):
 *
 *   ../private/test_mariadb/<suite db>/            marked `.dedalo_test_mariadb`
 *     data/                                        the server's datadir
 *     mariadbd.pid, error.log, install.log
 *     acquisitions.ndjson                          one row per (test file, database)
 *                                                  whose marker named this lane
 *   /tmp/dedalo_tmdb_<sha256(root)[:12]>/s         the server's unix socket (dir 0700)
 *
 * The socket does not live under the root because macOS caps a unix-socket path at
 * 104 bytes and `../private/…` on a developer checkout is already longer than that.
 * `--skip-networking` plus the 0700 socket directory make the FILESYSTEM the access
 * control: only the uid that started the server can reach it — which is also why the
 * suite user's password below is a constant and not a secret.
 */

import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { privateDir, readEnv } from '../../src/config/env.ts';
import type { Situation } from '../../src/core/test_data/situations/situation.ts';
import { testDatabaseName } from './test_database.ts';

/** The file that says a root was created BY the suite. A root without it is refused. */
export const SUITE_MARIADB_MARKER_FILE = '.dedalo_test_mariadb';
/** The schema holding the marker rows — its own, so no target database can hold a forged one. */
export const MARKER_SCHEMA = 'dedalo_test_mariadb_marker';
/** `database_name` PK, `suite_db`, `purpose` (CHECKed), `created_at`. SELECT-only to the suite user. */
export const MARKER_TABLE = `${MARKER_SCHEMA}.targets`;
/** The one value the `purpose` column may hold (a CHECK constraint enforces it). */
export const MARKER_PURPOSE = 'dedalo-suite-target';
/** The diffusion user the suite hands to the engine: per-database grants, no global privilege. */
export const SUITE_MARIADB_USER = 'dedalo_test_diffusion';
/**
 * NOT A SECRET, deliberately: the server listens on no TCP port and its socket sits in
 * a 0700 directory, so only the uid that started it can connect at all. A generated
 * password would have to be stored beside the socket, protecting nothing more.
 */
export const SUITE_MARIADB_PASSWORD = 'dedalo_test_diffusion';
/** Reachable, granted, and WITHOUT a marker row — the classifier must refuse it. */
export const UNMARKED_CONTROL_DB = 'zzd_unmarked_control';
/** Reachable, granted, with a marker row naming ANOTHER suite — the classifier must refuse it. */
export const FOREIGN_CONTROL_DB = 'zzd_foreign_marker_control';
/** The `suite_db` the foreign control's row names. */
export const FOREIGN_SUITE_DB = 'dedalo_foreign_suite_control';
/**
 * GRANTED to the suite user and NEVER CREATED — the one name on which the server answers
 * errno 1049 ("unknown database"). Every other absent name answers 1044 first (the suite
 * user's grants are per database, the production posture), so without this control the
 * engine's 1049 branch (`isMissingDatabaseError`) has no live gate. The grant carries no
 * CREATE, so the suite user cannot bring it into existence; the provisioner drops it if
 * anything else did.
 */
export const GRANTED_ABSENT_CONTROL_DB = 'zzd_granted_absent';

/** Unix-socket path ceiling we hold ourselves to (macOS: 104 bytes incl. NUL). */
export const SOCKET_PATH_LIMIT = 100;

/** Identifier grammar for a lane name and a target database — refuse, never escape. */
const NAME = /^[A-Za-z0-9_.-]+$/;

export interface SuiteMariadbPaths {
	/** The lane this server belongs to (the suite Postgres database name). */
	suiteDb: string;
	root: string;
	markerFile: string;
	datadir: string;
	/** Present once `mariadb-install-db` completed — a datadir without it is partial. */
	installedStamp: string;
	pidFile: string;
	errorLog: string;
	installLog: string;
	lockFile: string;
	acquisitions: string;
	socketDir: string;
	socket: string;
}

/** Every path of one lane's suite server. Pure. */
export function suiteMariadbPaths(suiteDb?: string): SuiteMariadbPaths {
	const lane = suiteDb ?? testDatabaseName();
	if (!NAME.test(lane))
		throw new Error(
			`suite_mariadb: lane name '${lane}' contains characters outside [A-Za-z0-9_.-]; refusing to derive paths from it`,
		);
	const root = join(privateDir, 'test_mariadb', lane);
	const socketDir = `/tmp/dedalo_tmdb_${createHash('sha256').update(root).digest('hex').slice(0, 12)}`;
	const socket = `${socketDir}/s`;
	if (socket.length > SOCKET_PATH_LIMIT)
		throw new Error(
			`suite_mariadb: socket path '${socket}' is ${socket.length} bytes, over the ${SOCKET_PATH_LIMIT}-byte unix-socket limit`,
		);
	return {
		suiteDb: lane,
		root,
		markerFile: join(root, SUITE_MARIADB_MARKER_FILE),
		datadir: join(root, 'data'),
		installedStamp: join(root, '.installed'),
		pidFile: join(root, 'mariadbd.pid'),
		errorLog: join(root, 'error.log'),
		installLog: join(root, 'install.log'),
		lockFile: join(root, '.lock'),
		acquisitions: join(root, 'acquisitions.ndjson'),
		socketDir,
		socket,
	};
}

/**
 * The environment that ARMS a process at the lane's suite server. Pure. The socket wins
 * over the TCP host in the engine (db.ts), and the host and port are BLANKED so no
 * lookup can fall back to a TCP server named in `../private/.env`.
 *
 * WHAT ARMING DOES NOT DO. It cannot stop the DRIVER's own fallback: Bun's `mariadb`
 * adapter, handed a socket `path` that does not exist, connects to `localhost:3306`
 * instead (measured 2026-09-30, Bun 1.4.2) — on a developer machine, the installation's
 * server. Only the engine can close that (PUB-05b: `buildTargetOptions` refusing a
 * configured socket that is not a unix socket). Until then a caller that reaches a pool
 * must first make the socket exist — `requireSuiteMariadb()` (which starts the server
 * or throws) — or ask `suiteContactRefusal()` and contact nothing while it refuses.
 */
export function suiteMariadbEnvironment(suiteDb?: string): Record<string, string> {
	return {
		DEDALO_DIFFUSION_DB_SOCKET: suiteMariadbPaths(suiteDb).socket,
		DEDALO_DIFFUSION_DB_USER: SUITE_MARIADB_USER,
		DEDALO_DIFFUSION_DB_PASSWORD: SUITE_MARIADB_PASSWORD,
		DEDALO_DIFFUSION_DB_HOST: '',
		DEDALO_DIFFUSION_DB_PORT: '',
	};
}

/**
 * True when this process's engine config points at THIS lane's suite socket — i.e. the
 * preload armed it. Light (env only, no I/O): a gate that must contact NOTHING unless
 * armed checks this before any pool, without importing the heavy helper (which would
 * make it an acquirer of the set).
 */
export function isArmed(paths: SuiteMariadbPaths = suiteMariadbPaths()): boolean {
	return readEnv('DEDALO_DIFFUSION_DB_SOCKET') === paths.socket;
}

/**
 * True when this lane's suite server socket exists AND is a unix socket — the one
 * condition under which a pool built from the armed environment cannot fall back to
 * TCP (see `suiteMariadbEnvironment`). Reads the filesystem when CALLED, never at import.
 */
export function suiteSocketPresent(suiteDb?: string): boolean {
	return isUnixSocket(suiteMariadbPaths(suiteDb).socket);
}

function isUnixSocket(path: string): boolean {
	try {
		return statSync(path).isSocket();
	} catch {
		return false;
	}
}

/** The refusal of an UNARMED process (see `suiteContactRefusal`). */
export const SUITE_UNARMED_REFUSAL =
	'this process is not armed at the suite MariaDB socket (no preload) — nothing contacted';
/** The refusal of a process armed at a socket that does not exist (see `suiteContactRefusal`). */
export const SUITE_SOCKET_ABSENT_REFUSAL =
	'the suite MariaDB socket is absent — nothing contacted (no TCP fallback)';

/**
 * THE GUARD of a caller that opens a pool WITHOUT acquiring the suite server through
 * `requireSuiteMariadb()` (diffusion_publish_e2e, INSTALL_BOUND_EXEMPT): why it must
 * contact nothing right now, or null when it may. Both conditions, in this order:
 * ARMED — unarmed (no preload), the pool would use the installation's
 * `DEDALO_DIFFUSION_DB_SOCKET` from `../private/.env`, whether or not a suite server is
 * up; PRESENT — armed at an absent socket, the driver falls back to TCP
 * `localhost:3306`, the installation's server on a developer machine. Env plus one
 * `stat`, no connection. Held by suite_mariadb_target_native (M7: the pure verdicts,
 * and the e2e run UNARMED against a planted counting socket — contacts 0, this refusal
 * logged).
 */
export function suiteContactRefusal(paths: SuiteMariadbPaths = suiteMariadbPaths()): string | null {
	if (!isArmed(paths)) return SUITE_UNARMED_REFUSAL;
	if (!isUnixSocket(paths.socket)) return SUITE_SOCKET_ABSENT_REFUSAL;
	return null;
}

/**
 * The target databases a situation declares: the terms of its `model === 'database'`
 * nodes. Pure. The ONLY way a suite target name comes into existence — a gate never
 * types one.
 */
export function databasesOf(situation: Pick<Situation, 'nodes'>): string[] {
	const names: string[] = [];
	for (const node of situation.nodes) {
		if (node.model !== 'database') continue;
		const term = Object.values(node.term ?? {})[0];
		if (typeof term !== 'string' || !NAME.test(term) || term.includes('.'))
			throw new Error(
				`suite_mariadb: database node ${node.tipo} has no usable term (${JSON.stringify(node.term)})`,
			);
		names.push(term);
	}
	return names;
}
