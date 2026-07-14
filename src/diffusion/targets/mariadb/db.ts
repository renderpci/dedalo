/**
 * MariaDB target access for diffusion (DIFFUSION_SPEC §4.3 / §2.5).
 *
 * THE ONLY MODULE TREE ALLOWED TO CONSTRUCT A MARIADB CLIENT. "Bun owns
 * MariaDB" is a module boundary here: src/core/** never touches MariaDB, and
 * everything under src/diffusion/ reaches the publication targets exclusively
 * through this file's pools (enforced mechanically by
 * test/unit/diffusion_boundaries.test.ts).
 *
 * Driver: Bun-native `Bun.sql` with the 'mariadb' adapter — spike-verified
 * 2026-07-05 against MariaDB 12.2.2 (DIFFUSION_PLAN D1/P2 result): unix-socket
 * auth, utf8mb4 + 4-byte chars, `?` placeholders via `.unsafe(sql, params)`,
 * multi-row upserts, `begin()` transactions, INFORMATION_SCHEMA reads, and
 * MySQLError with a distinct `.errno` (1146 missing table; 1049/1044 for an
 * unknown/ungranted database).
 *
 * Deployment posture (spike facts, non-negotiable):
 * - ALWAYS pass an explicit `database` — a database-less MariaDB session
 *   misbehaves under this adapter.
 * - `CREATE DATABASE` is NOT granted to the diffusion user. A missing target
 *   database is a LOUD configuration error (MissingTargetDatabaseError),
 *   never an auto-create (old-engine check_database posture).
 *
 * Config keys (../private/.env, readEnv precedence — process env wins):
 *   DEDALO_DIFFUSION_DB_SOCKET    unix socket path (default /tmp/mysql.sock)
 *   DEDALO_DIFFUSION_DB_HOST/_DB_PORT  TCP fallback used only when the socket
 *                                 key is explicitly unset-but-host-set
 *   DEDALO_DIFFUSION_DB_USER      MariaDB user (minimal grants, spec §8.6)
 *   DEDALO_DIFFUSION_DB_PASSWORD  password
 */

import { SQL } from 'bun';
import { readEnv } from '../../../config/env.ts';
import { readString } from '../../../config/readers.ts';

/** Rows/mutation results from `.unsafe()` carry MySQL metadata on the array. */
export interface MariadbExecResult {
	affectedRows?: number;
}

/** The distinct MySQL error shape surfaced by the Bun adapter. */
export interface MariadbErrorLike {
	errno?: number;
	message?: string;
}

/** errno 1146 — target table does not exist (tolerated on deletes). */
export const ERRNO_MISSING_TABLE = 1146;
/** errno 1049 — unknown database. */
export const ERRNO_UNKNOWN_DATABASE = 1049;
/** errno 1044 — database exists check denied by grants (same posture as 1049). */
export const ERRNO_DATABASE_ACCESS_DENIED = 1044;

/** True when `error` is the MariaDB "database missing/ungranted" class. */
export function isMissingDatabaseError(error: unknown): boolean {
	const errno = (error as MariadbErrorLike)?.errno;
	return errno === ERRNO_UNKNOWN_DATABASE || errno === ERRNO_DATABASE_ACCESS_DENIED;
}

/** True when `error` is the MariaDB "table missing" class (delete tolerance). */
export function isMissingTableError(error: unknown): boolean {
	return (error as MariadbErrorLike)?.errno === ERRNO_MISSING_TABLE;
}

/**
 * Typed loud error for an unreachable/ungranted target database — a
 * CONFIGURATION failure (databases are pre-created by the deployment), never
 * something the engine works around. Surfaced by the writer's open() probe.
 */
export class MissingTargetDatabaseError extends Error {
	readonly database: string;
	readonly errno: number | undefined;

	constructor(database: string, cause: unknown) {
		const errno = (cause as MariadbErrorLike)?.errno;
		const detail = (cause as MariadbErrorLike)?.message ?? String(cause);
		const posture =
			'Target databases must be pre-created and granted to the diffusion user ' +
			'(DEDALO_DIFFUSION_DB_USER) — the engine never auto-creates them.';
		super(
			`Diffusion target database '${database}' is not reachable (errno ${errno ?? 'unknown'}): ${detail}. ${posture}`,
		);
		this.name = 'MissingTargetDatabaseError';
		this.database = database;
		this.errno = errno;
	}
}

/**
 * One cached pool per target database name. `const` Map of request-INDEPENDENT
 * process state (a pool holds no request identity — same rationale as the
 * core postgres pool, spec §4); keys are database names, values live for the
 * process (or until closeAllTargetPools, used by tests/shutdown).
 */
const poolCache = new Map<string, SQL>();

/** Connection options resolved from env at pool-creation time (lazy, testable). */
function buildTargetOptions(database: string): ConstructorParameters<typeof SQL>[0] {
	const socket = readEnv('DEDALO_DIFFUSION_DB_SOCKET');
	const host = readEnv('DEDALO_DIFFUSION_DB_HOST');
	const commonOptions = {
		adapter: 'mariadb' as const,
		username: readString('DEDALO_DIFFUSION_DB_USER'),
		password: readString('DEDALO_DIFFUSION_DB_PASSWORD'),
		// ALWAYS an explicit database (spike: database-less sessions fail weirdly).
		database,
		// Modest per-target pool: the writer runs batches sequentially; deletes
		// and admin ops share it. The old engine used 10 — runners are separate
		// processes here, so keep the per-process footprint small.
		max: 4,
	};
	// Transport precedence: explicit socket > TCP host > default socket.
	if (socket !== undefined && socket !== '') {
		return { ...commonOptions, path: socket };
	}
	if (host !== undefined && host !== '') {
		const port = Number(readString('DEDALO_DIFFUSION_DB_PORT')) || 3306;
		return { ...commonOptions, hostname: host, port };
	}
	return { ...commonOptions, path: '/tmp/mysql.sock' };
}

/**
 * The pool for one target database — created on first use, cached for the
 * process. Creation itself never touches the network (Bun connects lazily);
 * use probeTargetDatabase() to fail loudly at session open.
 */
export function getTargetPool(database: string): SQL {
	const cached = poolCache.get(database);
	if (cached !== undefined) return cached;
	const pool = new SQL(buildTargetOptions(database));
	poolCache.set(database, pool);
	return pool;
}

/**
 * Loud reachability probe for a target database. Converts the driver's
 * errno-1049/1044 class into the typed MissingTargetDatabaseError so callers
 * (the writer's open()) report a CONFIG failure before any schema/DML work.
 * A pool whose probe failed is evicted so a fixed deployment can retry.
 */
export async function probeTargetDatabase(database: string): Promise<SQL> {
	const pool = getTargetPool(database);
	try {
		await pool.unsafe('SELECT 1', []);
		return pool;
	} catch (error) {
		poolCache.delete(database);
		await pool.close().catch(() => {});
		if (isMissingDatabaseError(error)) {
			throw new MissingTargetDatabaseError(database, error);
		}
		throw error;
	}
}

/**
 * One-shot reachability probe for the INSTALL wizard (DEC-19
 * test_diffusion_connection): open a throwaway connection from POSTED MariaDB
 * credentials, `SELECT 1`, and close immediately — never cached in poolCache
 * (these creds are unverified and per-request). Lives here because this tree is
 * the only place allowed to construct a MariaDB client (diffusion_boundaries).
 */
export async function probeAdhocMariadbConnection(creds: {
	host: string;
	port: number;
	socket?: string;
	database: string;
	username: string;
	password: string;
}): Promise<{ result: boolean; msg: string }> {
	if (creds.database === '' || creds.username === '') {
		return { result: false, msg: 'MariaDB database and user are required' };
	}
	const common = {
		adapter: 'mariadb' as const,
		username: creds.username,
		password: creds.password,
		database: creds.database,
		max: 1,
	};
	const options =
		creds.socket && creds.socket !== ''
			? { ...common, path: creds.socket }
			: { ...common, hostname: creds.host, port: creds.port };
	const probe = new SQL(options);
	try {
		await probe.unsafe('SELECT 1', []);
		return { result: true, msg: `Connected to MariaDB '${creds.database}' — OK` };
	} catch (error) {
		const detail = (error as MariadbErrorLike)?.message ?? String(error);
		return { result: false, msg: `MariaDB connection failed: ${detail}` };
	} finally {
		await probe.close().catch(() => {});
	}
}

/** Close and drop every cached pool (tests / process shutdown). */
export async function closeAllTargetPools(): Promise<void> {
	const pools = [...poolCache.values()];
	poolCache.clear();
	for (const pool of pools) {
		await pool.close().catch(() => {});
	}
}
