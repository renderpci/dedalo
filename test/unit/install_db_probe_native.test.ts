/**
 * INSTALL DB PROBE — the pure decision table behind test_db_connection /
 * test_diffusion_connection (src/core/install/db_probe_plan.ts).
 *
 * db_probe.ts was NEVER LOADED by any gate: the wizard's "can I reach this
 * Postgres?" answer — the one that tells an operator to CREATE the database —
 * had zero coverage. The classification is now a pure function over two psql
 * outcomes, so every arm is asserted without spawning psql or touching MariaDB.
 *
 * Scratch namespace: zzi (no DB writes here — this tier is pure).
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { testDbConnection } from '../../src/core/install/db_probe.ts';
import {
	classifyDbProbe,
	diffusionConnFromOptions,
	pgConnFromOptions,
} from '../../src/core/install/db_probe_plan.ts';

const DB_PROBE_SOURCE = readFileSync(
	join(import.meta.dir, '..', '..', 'src/core/install/db_probe.ts'),
	'utf-8',
);

describe('pgConnFromOptions', () => {
	test('empty options give the documented defaults', () => {
		expect(pgConnFromOptions({})).toEqual({
			database: '',
			host: 'localhost',
			port: '5432',
			user: '',
			password: '',
			socket: undefined,
		});
	});

	test('an empty db_socket is TRUTHINESS-gated to undefined; port is String-coerced', () => {
		// quirk: pinned, not fixed — `o.db_socket ? …` (not `!== undefined`), so
		// '' means "no socket", which is what the wizard's empty input posts.
		const conn = pgConnFromOptions({ db_socket: '', db_port: 5433, db_database: 'zzi_db' });
		expect(conn.socket).toBeUndefined();
		expect(conn.port).toBe('5433');
		expect(typeof conn.port).toBe('string');
		expect(conn.database).toBe('zzi_db');
	});

	test('a non-empty db_socket is carried through', () => {
		expect(pgConnFromOptions({ db_socket: '/tmp/zzi_sock' }).socket).toBe('/tmp/zzi_sock');
	});
});

describe('classifyDbProbe', () => {
	test('target reachable -> ok/can_connect/db_exists true, can_create false', () => {
		const r = classifyDbProbe('mydb', { exitCode: 0, stderr: '' }, null);
		expect([r.ok, r.can_connect, r.db_exists, r.can_create]).toEqual([true, true, true, false]);
		expect(r.msg).toBe("Connected to 'mydb' — OK");
	});

	test('target missing but maintenance reachable -> "create it (empty)"', () => {
		const r = classifyDbProbe(
			'mydb',
			{ exitCode: 2, stderr: 'FATAL: database "mydb" does not exist' },
			{ exitCode: 0, stderr: '' },
		);
		expect([r.ok, r.can_connect, r.db_exists, r.can_create]).toEqual([false, true, false, true]);
		expect(r.msg).toContain("database 'mydb' does not exist");
	});

	test('both fail -> all four false and the message carries the REAL stderr', () => {
		const r = classifyDbProbe(
			'mydb',
			{ exitCode: 2, stderr: 'psql: error: connection to server failed: no password supplied' },
			{ exitCode: 2, stderr: 'psql: error: maintenance also refused' },
		);
		expect([r.ok, r.can_connect, r.db_exists, r.can_create]).toEqual([false, false, false, false]);
		expect(r.msg).toBe(
			'Cannot connect: psql: error: connection to server failed: no password supplied',
		);
		expect(r.msg).not.toContain('unknown error');
	});

	test("both fail with an EMPTY target stderr -> the maintenance stderr is reported, not 'unknown error'", () => {
		const r = classifyDbProbe(
			'mydb',
			{ exitCode: 2, stderr: '' },
			{ exitCode: 2, stderr: 'psql: error: could not translate host name "nope"' },
		);
		expect(r.msg).toBe('Cannot connect: psql: error: could not translate host name "nope"');
		expect(r.msg).not.toContain('unknown error');
	});
});

describe('diffusionConnFromOptions', () => {
	test('empty options give the MariaDB defaults', () => {
		expect(diffusionConnFromOptions({})).toEqual({
			host: 'localhost',
			port: 3306,
			socket: undefined,
			database: '',
			username: '',
			password: '',
		});
	});

	test('a non-numeric posted port falls back to 3306', () => {
		// quirk: pinned, not fixed — the guard is `Number(x) || 3306`. The obvious
		// `Number(o.mysql_port ?? 3306)` "simplification" would yield NaN here and
		// hand a NaN port to the driver.
		expect(diffusionConnFromOptions({ mysql_port: 'abc' }).port).toBe(3306);
		expect(diffusionConnFromOptions({ mysql_port: '0' }).port).toBe(3306);
		expect(diffusionConnFromOptions({ mysql_port: '3307' }).port).toBe(3307);
	});
});

describe('testDbConnection required-field guard', () => {
	test('a database with no user answers four falses WITHOUT spawning psql', async () => {
		const spawnSpy = spyOn(Bun, 'spawn');
		try {
			const r = await testDbConnection({ db_database: 'x' });
			expect([r.ok, r.can_connect, r.db_exists, r.can_create]).toEqual([
				false,
				false,
				false,
				false,
			]);
			expect(r.msg).toBe('Database name and user are required');
			expect(spawnSpy).not.toHaveBeenCalled();
		} finally {
			spawnSpy.mockRestore();
		}
	});
});

describe('the extraction is rewired, not duplicated', () => {
	test('db_probe.ts no longer holds the inline classification or the option coercion', () => {
		// (b)+(d): the inline arms are GONE from the shell module.
		expect(DB_PROBE_SOURCE).not.toContain('Server reachable but database');
		expect(DB_PROBE_SOURCE).not.toContain('unknown error');
		expect(DB_PROBE_SOURCE).not.toContain('db_hostname');
		expect(DB_PROBE_SOURCE).not.toContain('mysql_hostname');
		// (c): the shell calls the extractions.
		expect(DB_PROBE_SOURCE).toContain('classifyDbProbe(conn.database, target, maintenance)');
		expect(DB_PROBE_SOURCE).toContain('diffusionConnFromOptions(o)');
	});

	test('the pure module does NOT drag the diffusion facade along', () => {
		const planSource = readFileSync(
			join(import.meta.dir, '..', '..', 'src/core/install/db_probe_plan.ts'),
			'utf-8',
		);
		expect(planSource).not.toContain('diffusion/api/info.ts');
		expect(planSource).not.toContain('probeDiffusionConnection');
	});
});
