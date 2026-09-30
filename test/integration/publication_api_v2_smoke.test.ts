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
 * WHAT IT PROVES that the app's own suite cannot: that suite runs through a test seam
 * instead of the database, so it never exercises the real driver. This one runs the
 * Bun.sql 'mariadb' adapter against a table the ENGINE's own writer published — which
 * is where a driver swap breaks (value shapes for DATE/DATETIME/DECIMAL, `?` binding,
 * INFORMATION_SCHEMA reads).
 *
 * THE DATA IS BUILT, NOT BORROWED (PUB-05, audit 2026-09-26). Before, it read whatever
 * an installation had published in `web_numisdata_mib` through the socket
 * `../private/.env` named, asserted only that no value printed as `[object Date]`
 * (which a Date→TEXT regression in the writer would ALSO have passed), and skipped
 * green wherever that socket was absent. Now `beforeAll`:
 *   1. acquires the zzd situation's first target database on the lane's suite server
 *      (`requireSuiteMariadb` — throws unless the marker names this lane);
 *   2. publishes `dedalo_ts_test_v2_smoke` into it THROUGH THE ENGINE's writer
 *      (open → ensureSchema → writeRows) from a synthetic plan with one column per
 *      value family: VARCHAR, INT, DECIMAL, DATE, DATETIME — one row of known values
 *      and one row of nulls;
 *   3. boots the API on a free port, pointed at that database only.
 * The records assertion is then EXACT: every value literal on the wire, and every
 * temporal value checked against the driver's own cell (`Date.parse(wire) ===
 * cell.getTime()`), read through the engine's pool.
 *
 * TIME ZONES. Measured 2026-09-30 (TZ=UTC, Europe/Madrid, America/Los_Angeles,
 * Asia/Tokyo): the driver maps DATE and DATETIME to a Date at that wall-clock instant
 * IN UTC, so the ISO strings do not move with the process zone. The API is spawned
 * under TZ=Asia/Tokyo on purpose — a zone far from UTC — so a regression that made the
 * wire depend on the server's zone reds the exact literals here.
 *
 * SAFETY: every write is to the suite target, on the scratch table, dropped in
 * afterAll. The API itself only issues SELECTs.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readEnv } from '../../src/config/env.ts';
import type { FieldPlan, PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import type { ProjectedRow } from '../../src/diffusion/project/lang_ladder.ts';
import { closeAllTargetPools, getTargetPool } from '../../src/diffusion/targets/mariadb/db.ts';
import { mariadbSqlWriter } from '../../src/diffusion/writers/mariadb_sql.ts';
import { requireSuiteMariadb } from '../helpers/suite_mariadb.ts';
import { zzdTargetDatabases } from '../helpers/zzd_diffusion_fixture.ts';

/** The zzd situation's first target database, on the lane's suite server. */
const TARGET_DATABASE = zzdTargetDatabases()[0] as string;
const TABLE = 'dedalo_ts_test_v2_smoke';
const API_DIR = join(import.meta.dir, '..', '..', 'publication', 'server_api', 'v2');
/** A zone far from UTC — see the header. */
const API_TZ = 'Asia/Tokyo';

function field(id: string, columnName: string, column: FieldPlan['column']): FieldPlan {
	return { id, columnName, sourceChain: [], transform: [], column, policy: {} };
}

const SECTION: SectionPlan = {
	sectionTipo: 'test3',
	tableName: TABLE,
	tableTipo: 'testdd0',
	fields: [
		field('testdd1', 'title', { fieldModel: 'field_varchar', varcharLength: 60 }),
		field('testdd2', 'counter', { fieldModel: 'field_int' }),
		field('testdd3', 'amount', { fieldModel: 'field_decimal' }),
		field('testdd4', 'day', { fieldModel: 'field_date' }),
		field('testdd5', 'stamp', { fieldModel: 'field_datetime' }),
	],
};

const PLAN: PublicationPlan = {
	planId: 'v2-smoke',
	elementTipo: 'testdd_element',
	format: 'sql',
	serviceName: null,
	target: { kind: 'table', database: TARGET_DATABASE },
	sections: [SECTION],
	recursion: { maxLevels: 1 },
	langPolicy: { langs: ['lg-eng'], mainLang: 'lg-eng' },
	warnings: [],
};

const ROWS: ProjectedRow[] = [
	{
		sectionId: 1,
		lang: 'lg-eng',
		columns: {
			title: 'smoke çedille 🏛️',
			counter: '42',
			amount: '12.5',
			day: '2024-03-05',
			stamp: '2024-03-05 10:20:30',
		},
	},
	{
		sectionId: 2,
		lang: 'lg-eng',
		columns: { title: null, counter: null, amount: null, day: null, stamp: null },
	},
];

/** What the API must serve for ROWS — every literal pinned (measured, see the header). */
const EXPECTED_WIRE = [
	{
		section_id: 1,
		lang: 'lg-eng',
		title: 'smoke çedille 🏛️',
		counter: 42,
		amount: '12.5000',
		day: '2024-03-05T00:00:00.000Z',
		stamp: '2024-03-05T10:20:30.000Z',
	},
	{
		section_id: 2,
		lang: 'lg-eng',
		title: null,
		counter: null,
		amount: null,
		day: null,
		stamp: null,
	},
];

let server: ReturnType<typeof Bun.spawn> | undefined;
let base = '';
let published = false;

/** A port nothing listens on right now (bind 0, read, release). */
function freePort(): number {
	const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
	const port = probe.port;
	probe.stop(true);
	return port;
}

/** Boot the API as its own process and wait for /health to answer. */
async function startApi(): Promise<void> {
	const port = freePort();
	base = `http://127.0.0.1:${port}`;
	server = Bun.spawn(['bun', 'run', 'src/index.ts'], {
		cwd: API_DIR,
		env: {
			...process.env,
			TZ: API_TZ,
			PORT: String(port),
			HOST: '127.0.0.1',
			// Served directly, not behind the Apache/nginx prefix.
			BASE_PATH: '',
			DEPLOYMENT_MODE: 'standalone',
			TRUST_PROXY: 'false',
			// The suite server this process is ARMED at (test/preload/suite_mariadb.ts) —
			// socket only, so the API cannot fall back to a TCP server.
			DB_SOCKET: readEnv('DEDALO_DIFFUSION_DB_SOCKET') ?? '',
			DB_HOST: '',
			DB_USER: readEnv('DEDALO_DIFFUSION_DB_USER') ?? '',
			DB_PASSWORD: readEnv('DEDALO_DIFFUSION_DB_PASSWORD') ?? '',
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
			const response = await fetch(`${base}/health`);
			if (response.status === 200 || response.status === 503) return;
		} catch {
			// not listening yet
		}
		await Bun.sleep(150);
	}
	throw new Error(`Publication API v2 did not become ready on ${base} within 20s`);
}

beforeAll(async () => {
	await requireSuiteMariadb(import.meta.path, [TARGET_DATABASE]);
	if (!existsSync(join(API_DIR, 'node_modules')))
		throw new Error(
			`publication/server_api/v2 has no node_modules — install it: bun install --frozen-lockfile --cwd publication/server_api/v2`,
		);
	await getTargetPool(TARGET_DATABASE).unsafe(`DROP TABLE IF EXISTS \`${TABLE}\``, []);
	const session = await mariadbSqlWriter.open(PLAN);
	await session.ensureSchema();
	expect(await session.writeRows(SECTION, ROWS)).toEqual({ written: 2, deleted: 0 });
	await session.close();
	published = true;
	await startApi();
}, 120_000);

afterAll(async () => {
	server?.kill();
	if (published)
		await getTargetPool(TARGET_DATABASE)
			.unsafe(`DROP TABLE IF EXISTS \`${TABLE}\``, [])
			.catch(() => {});
	await closeAllTargetPools();
});

describe('publication API v2 over a table the engine published on the suite server', () => {
	test('boots and reports the configured database as connected', async () => {
		const response = await fetch(`${base}/health`);
		const body = (await response.json()) as {
			status: string;
			databases: Record<string, string>;
		};

		expect(response.status).toBe(200);
		expect(body.status).toBe('ok');
		expect(body.databases).toEqual({ [TARGET_DATABASE]: 'connected' });
	});

	test('lists the published table through INFORMATION_SCHEMA, by name', async () => {
		const response = await fetch(`${base}/${TARGET_DATABASE}/tables`);
		const body = (await response.json()) as {
			data: Array<{ name: string; row_count: number; column_count: number }>;
		};

		expect(response.status).toBe(200);
		const smoke = body.data.find((table) => table.name === TABLE);
		expect(smoke, `${TABLE} is not in ${JSON.stringify(body.data)}`).toBeDefined();
		// section_id + lang + the five typed columns.
		expect(smoke?.column_count).toBe(7);
	});

	test('reads the records with bound params: every wire value is the exact literal, every temporal one the driver’s instant', async () => {
		const response = await fetch(
			`${base}/${TARGET_DATABASE}/tables/${TABLE}/records?limit=3&sort=section_id`,
		);
		const body = (await response.json()) as {
			data: Array<Record<string, unknown>>;
			pagination: { limit: number };
		};

		expect(response.status).toBe(200);
		expect(body.pagination.limit).toBe(3);
		// THE WIRE ASSERTION, exact. What these literals PIN: the writer's column typing
		// (DATE/DATETIME/DECIMAL/INT, not TEXT — a TEXT column would echo the written
		// string, e.g. '2024-03-05' instead of the instant), the DECIMAL scale ('12.5000',
		// not '12.5'), and that no layer coerces with String(value) (counter stays 42,
		// null stays null). What they do NOT pin: v2 pool.ts's Date→ISO step
		// (normalizeValues). It is REDUNDANT on this path — the route serializes with
		// JSON, and JSON.stringify(Date) already emits the same toISOString() text —
		// so removing it leaves this literal unchanged (measured: an equivalent mutant).
		// That step is held by publication/server_api/v2/tests/pool.test.ts, not here.
		expect(body.data).toEqual(EXPECTED_WIRE);

		// …and the instant on the wire IS the instant in the table, read through the
		// engine's pool in THIS process (whatever its zone).
		const cells = (await getTargetPool(TARGET_DATABASE).unsafe(
			`SELECT day, stamp FROM \`${TABLE}\` WHERE section_id = 1`,
			[],
		)) as { day: Date; stamp: Date }[];
		const cell = cells[0];
		expect(cell?.day).toBeInstanceOf(Date);
		expect(cell?.stamp).toBeInstanceOf(Date);
		const wire = body.data[0] as { day: string; stamp: string };
		expect(Date.parse(wire.day)).toBe((cell?.day as Date).getTime());
		expect(Date.parse(wire.stamp)).toBe((cell?.stamp as Date).getTime());
	});

	test('an unknown database is a 404 problem+json, not a 500', async () => {
		const response = await fetch(`${base}/definitely_not_a_database/tables`);
		const body = (await response.json()) as { title: string; status: number };

		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toContain('application/problem+json');
		expect(body.status).toBe(404);
	});
});
