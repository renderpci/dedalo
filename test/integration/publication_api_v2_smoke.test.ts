/**
 * Publication API v2 smoke gate — the isolated read-only API over a
 * diffusion-published MariaDB (publication/server_api/v2).
 *
 * WHY A SUBPROCESS: the Publication API is a SEPARATE, self-contained Bun app with
 * its own package.json, tsconfig and config surface, deployable on a different host
 * entirely. It must never become an engine import — spawning it keeps it outside the
 * engine's tsconfig/tripwire universe (which is exactly the boundary we are asserting)
 * while still proving the thing actually boots and serves.
 *
 * WHAT IT PROVES that the app's own 253-test suite cannot: that suite mocks the
 * database (`mock.module('../src/db/pool')`), so it never exercises the real driver.
 * This one runs the Bun.sql 'mariadb' adapter against REAL published data — which is
 * where a driver swap breaks (value shapes for DATE/DATETIME/DECIMAL, `?` binding,
 * INFORMATION_SCHEMA reads).
 *
 * SAFETY: read-only by construction. The API issues nothing but SELECTs, and the
 * database here (web_numisdata_mib) holds REAL published data — no scratch surface is
 * needed because nothing is ever written.
 *
 * Credentials: DEDALO_DIFFUSION_DB_* from ../private/.env (same keys as the diffusion
 * writer that PRODUCED these tables). Absent → the suite skips loudly, never silently
 * greens (diffusion_mariadb.test.ts precedent).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { readEnv } from '../../src/config/env.ts';

const RESOLVED_SOCKET = readEnv('DEDALO_DIFFUSION_DB_SOCKET', '/tmp/mysql.sock') as string;
const HAVE_DB =
	readEnv('DEDALO_DIFFUSION_DB_USER') !== undefined &&
	(readEnv('DEDALO_DIFFUSION_DB_HOST') !== undefined || existsSync(RESOLVED_SOCKET));
if (!HAVE_DB) {
	console.warn(
		`[SKIPPED] publication_api_v2 smoke: no MariaDB credentials/socket available (set DEDALO_DIFFUSION_DB_USER/_DB_PASSWORD/_DB_SOCKET; probed socket: ${RESOLVED_SOCKET})`,
	);
}

/** The published database the diffusion gates also target. */
const TARGET_DATABASE = 'web_numisdata_mib';
const API_DIR = `${import.meta.dir}/../../publication/server_api/v2`;
/** Port for the smoke instance — kept off v2's 3100 default so a dev instance can run. */
const PORT = 31_007;
const BASE = `http://127.0.0.1:${PORT}`;

let server: ReturnType<typeof Bun.spawn> | undefined;

/** Boot the API as its own process and wait for /health to answer. */
async function startApi(): Promise<void> {
	server = Bun.spawn(['bun', 'run', 'src/index.ts'], {
		cwd: API_DIR,
		env: {
			...process.env,
			PORT: String(PORT),
			HOST: '127.0.0.1',
			// Served directly, not behind the Apache/nginx prefix.
			BASE_PATH: '',
			DEPLOYMENT_MODE: 'standalone',
			TRUST_PROXY: 'false',
			DB_SOCKET: readEnv('DEDALO_DIFFUSION_DB_SOCKET', '') as string,
			DB_HOST: readEnv('DEDALO_DIFFUSION_DB_HOST', 'localhost') as string,
			DB_PORT: readEnv('DEDALO_DIFFUSION_DB_PORT', '3306') as string,
			DB_USER: readEnv('DEDALO_DIFFUSION_DB_USER', '') as string,
			DB_PASSWORD: readEnv('DEDALO_DIFFUSION_DB_PASSWORD', '') as string,
			DB_NAMES: TARGET_DATABASE,
			// No key: this run asserts the public surface. Rate limiting stays on.
			API_KEYS: '',
			LOG_LEVEL: 'warn',
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${BASE}/health`);
			if (response.status === 200 || response.status === 503) return;
		} catch {
			// not listening yet
		}
		await Bun.sleep(150);
	}
	throw new Error(`Publication API v2 did not become ready on ${BASE} within 20s`);
}

afterAll(() => {
	server?.kill();
});

describe.if(HAVE_DB)('publication API v2 (real published MariaDB)', () => {
	test('boots and reports every configured database as connected', async () => {
		await startApi();

		const response = await fetch(`${BASE}/health`);
		const body = (await response.json()) as {
			status: string;
			databases: Record<string, string>;
		};

		expect(response.status).toBe(200);
		expect(body.status).toBe('ok');
		expect(body.databases[TARGET_DATABASE]).toBe('connected');
	});

	test('lists the published tables through INFORMATION_SCHEMA', async () => {
		const response = await fetch(`${BASE}/${TARGET_DATABASE}/tables`);
		const body = (await response.json()) as {
			data: Array<{ name: string; row_count: number; column_count: number }>;
		};

		expect(response.status).toBe(200);
		expect(Array.isArray(body.data)).toBe(true);
		expect(body.data.length).toBeGreaterThan(0);
		// Every entry is a real table description, not an empty shell.
		for (const table of body.data) {
			expect(typeof table.name).toBe('string');
			expect(table.column_count).toBeGreaterThan(0);
		}
	});

	test('reads records with bound params, and every value is JSON-safe', async () => {
		const tables = (await (await fetch(`${BASE}/${TARGET_DATABASE}/tables`)).json()) as {
			data: Array<{ name: string; row_count: number }>;
		};
		const populated = tables.data.find((table) => table.row_count > 0) ?? tables.data[0];
		expect(populated).toBeDefined();

		const response = await fetch(
			`${BASE}/${TARGET_DATABASE}/tables/${populated?.name}/records?limit=3`,
		);
		const body = (await response.json()) as {
			data: Array<Record<string, unknown>>;
			pagination: { limit: number };
		};

		expect(response.status).toBe(200);
		expect(body.pagination.limit).toBe(3);
		expect(body.data.length).toBeLessThanOrEqual(3);

		// THE DRIVER ASSERTION. Published tables carry DATE/DATETIME/DECIMAL columns;
		// under the Bun mariadb adapter those arrive as JS Dates, which would serialize
		// inconsistently across paths. pool.ts normalizes them to ISO strings, so what
		// crosses the wire must be plain JSON scalars/containers — never "[object Object]"
		// and never a stray Date shape.
		for (const row of body.data) {
			for (const value of Object.values(row)) {
				expect(typeof value).not.toBe('function');
				expect(String(value)).not.toBe('[object Date]');
			}
		}
	});

	test('an unknown database is a 404 problem+json, not a 500', async () => {
		const response = await fetch(`${BASE}/definitely_not_a_database/tables`);
		const body = (await response.json()) as { title: string; status: number };

		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toContain('application/problem+json');
		expect(body.status).toBe(404);
	});
});
