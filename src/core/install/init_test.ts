/**
 * Install pre-flight diagnostics (PHP installer init_test). This is the CLIENT
 * PROGRESSION GATE: the wizard advances past the diagnostics panel only when
 * `result === true` (render_installer.js), so every check here must be a real
 * blocker for a TS-native install — no cosmetic noise.
 *
 * Shape: `{ result:boolean, errors:string[], msg:string[] }`. `errors` non-empty
 * also fails the panel; `msg` carries the human-readable pass/fail lines.
 */

import { constants, accessSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { privateDir } from '../../config/env.ts';
import { SEED_DUMP_PATH } from './paths.ts';
import { psqlResolvable } from './pg_bin.ts';

export interface InitTestResult {
	result: boolean;
	errors: string[];
	msg: string[];
}

/** The minimum Bun the server is verified against (matches .bun-version pin). */
const MIN_BUN = [1, 3, 0];

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

/** Run the pre-flight checks and summarize as the client-contract shape. */
export function runInitTest(): InitTestResult {
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

	if (psqlResolvable()) {
		msg.push('PostgreSQL client (psql) available — OK');
	} else {
		errors.push('PostgreSQL client (psql) not found — install the postgresql client tools');
	}

	return { result: errors.length === 0, errors, msg };
}
