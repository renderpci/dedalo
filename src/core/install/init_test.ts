/**
 * Install pre-flight diagnostics (PHP installer init_test). The terminal
 * installer's PROGRESSION GATE (probes.ts, executor.ts): the install proceeds
 * only when `result === true`, so every check here must be a real blocker for
 * a TS-native install — no cosmetic noise.
 *
 * Shape: `{ result:boolean, errors:string[], msg:string[] }`. `errors` non-empty
 * also fails the panel; `msg` carries the human-readable pass/fail lines.
 */

import { accessSync, constants, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { privateDir } from '../../config/env.ts';
import { SEED_DUMP_PATH } from './paths.ts';
import { type PsqlProbe, probePsql } from './pg_bin.ts';

export interface InitTestResult {
	result: boolean;
	errors: string[];
	msg: string[];
	/**
	 * The psql probe's typed answer (pg_bin.ts PsqlProbe — never a throw). The
	 * System check builds its route-aware PostgreSQL client row from THIS, not
	 * from the line (probes.ts psqlRow): production installs PostgreSQL itself,
	 * docker/trial never need a host psql, developer does.
	 */
	psql: PsqlProbe;
}

/** The minimum Bun the server is verified against (matches .bun-version pin). */
const MIN_BUN = [1, 4, 0];

function bunAtLeast(min: number[]): boolean {
	const parts = Bun.version.split('.').map((n) => Number.parseInt(n, 10) || 0);
	for (let i = 0; i < min.length; i++) {
		const required = min[i] ?? 0;
		const have = parts[i] ?? 0;
		if (have > required) return true;
		if (have < required) return false;
	}
	return true;
}

/** Can `dir` (or its nearest existing ancestor) be created/written? */
function pathCreatable(dir: string): boolean {
	let probe = dir;
	while (!existsSync(probe)) {
		const parent = dirname(probe);
		if (parent === probe) return false;
		probe = parent;
	}
	try {
		accessSync(probe, constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

/** The pre-flight's psql line: a pass, or the failure naming why (missing / unusable). */
function psqlLine(psql: PsqlProbe): { ok: boolean; line: string } {
	if (psql.state === 'found') {
		return { ok: true, line: 'PostgreSQL client (psql) available — OK' };
	}
	const why =
		psql.state === 'missing' ? 'not found' : `not usable at ${psql.path} (${psql.reason})`;
	return {
		ok: false,
		line: `PostgreSQL client (psql) ${why} — install the postgresql client tools`,
	};
}

/**
 * Run the pre-flight checks and summarize as the client-contract shape.
 * `psql` is the probe's answer (default: THIS machine's — pg_bin.ts
 * probePsql); a gate passes the answer over a PATH without psql.
 */
export function runInitTest(psql: PsqlProbe = probePsql()): InitTestResult {
	const errors: string[] = [];
	const msg: string[] = [];

	if (bunAtLeast(MIN_BUN)) {
		msg.push(`Bun runtime ${Bun.version} — OK`);
	} else {
		errors.push(`Bun ${Bun.version} is older than the required ${MIN_BUN.join('.')}`);
	}

	if (existsSync(SEED_DUMP_PATH)) {
		msg.push('Install database seed present — OK');
	} else {
		errors.push(`Install seed dump missing at ${SEED_DUMP_PATH}`);
	}

	if (pathCreatable(privateDir)) {
		msg.push('Private config directory is writable — OK');
	} else {
		errors.push(`Private config directory is not creatable/writable: ${privateDir}`);
	}

	const psqlCheck = psqlLine(psql);
	(psqlCheck.ok ? msg : errors).push(psqlCheck.line);

	return { result: errors.length === 0, errors, msg, psql };
}
