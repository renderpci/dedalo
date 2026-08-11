/**
 * The PURE half of the install connection probes (db_probe.ts): option→descriptor
 * coercion and the target/maintenance outcome classification.
 *
 * Split out so the decision table is testable without spawning psql or loading
 * the MariaDB facade — db_probe.ts keeps ONLY the effectful shell (psqlSelect1 and
 * the dynamic facade import). Type-only imports on purpose: this module must stay
 * free of config/pool side effects.
 */

import type { DbConnDescriptor, PsqlRunResult } from './pg_exec.ts';

/** Coerce the posted db_* options into a connection descriptor. */
export function pgConnFromOptions(o: Record<string, unknown>): DbConnDescriptor {
	return {
		database: String(o.db_database ?? ''),
		host: String(o.db_hostname ?? 'localhost'),
		port: String(o.db_port ?? '5432'),
		user: String(o.db_username ?? ''),
		password: String(o.db_password ?? ''),
		socket: o.db_socket ? String(o.db_socket) : undefined,
	};
}

export interface DbProbeResult {
	result: boolean;
	can_connect: boolean;
	db_exists: boolean;
	can_create: boolean;
	msg: string;
}

/** The only part of a psql run the classification reads. */
export type PsqlOutcome = Pick<PsqlRunResult, 'exitCode' | 'stderr'>;

/**
 * Turn the target-DB run (and the `postgres` maintenance-DB fallback, when it
 * was needed) into the wizard's four booleans + message.
 *
 * `maintenance` is null when the target succeeded and no fallback was spawned.
 */
export function classifyDbProbe(
	database: string,
	target: PsqlOutcome,
	maintenance: PsqlOutcome | null,
): DbProbeResult {
	if (target.exitCode === 0) {
		return {
			result: true,
			can_connect: true,
			db_exists: true,
			can_create: false,
			msg: `Connected to '${database}' — OK`,
		};
	}

	// Distinguish "DB missing" from "auth/host wrong" via the maintenance DB.
	if (maintenance !== null && maintenance.exitCode === 0) {
		return {
			result: false,
			can_connect: true,
			db_exists: false,
			can_create: true,
			msg: `Server reachable but database '${database}' does not exist — create it (empty) and retry`,
		};
	}

	return {
		result: false,
		can_connect: false,
		db_exists: false,
		can_create: false,
		msg: `Cannot connect: ${target.stderr || maintenance?.stderr || 'unknown error'}`,
	};
}

/** The MariaDB connection the diffusion facade probe takes. */
export interface DiffusionConnDescriptor {
	host: string;
	port: number;
	socket: string | undefined;
	database: string;
	username: string;
	password: string;
}

/**
 * Coerce the posted mysql_* options into the diffusion probe's connection.
 * `Number(x) || 3306` (not `?? 3306`) on purpose: a non-numeric posted port must
 * fall back to the default, and `Number('abc') ?? 3306` would yield NaN.
 */
export function diffusionConnFromOptions(o: Record<string, unknown>): DiffusionConnDescriptor {
	return {
		host: String(o.mysql_hostname ?? 'localhost'),
		port: Number(o.mysql_port ?? 3306) || 3306,
		socket: o.mysql_socket ? String(o.mysql_socket) : undefined,
		database: String(o.mysql_database ?? ''),
		username: String(o.mysql_username ?? ''),
		password: String(o.mysql_password ?? ''),
	};
}
