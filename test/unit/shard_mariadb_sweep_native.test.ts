/**
 * SHARD MARIADB SWEEP — a multi-bin shard run leaves no suite MariaDB server behind
 * (PUB-05 review 2026-09-30, S2).
 *
 * THE DEFECT. `bun run test:shard` gives each bin `DEDALO_TEST_DATABASE=<template>__shard<N>`,
 * so the preload arms each child at a socket of its own, and the first MariaDB gate a
 * shard runs cold-installs and starts a DETACHED `mariadbd` under
 * `../private/test_mariadb/<template>__shard<N>`. `sweepShardClones` — the entry sweep,
 * the exit sweep and `--sweep` — dropped the clone database, its vector twin and its
 * media twin, and had no MariaDB handling at all: every multi-bin run left up to N-1
 * servers running (~140 MB RSS each, measured on l3) and their datadirs (~157 MB each)
 * on the volume the shard header names as the binding limit.
 *
 * WHAT IS HELD (outcomes, on planted lanes of THIS lane's template):
 *   - a MARKED `<template>__shard<N>` lane root with a live "server" (a process whose
 *     command line names mariadbd and the lane's datadir — exactly what the helper
 *     checks before it signals) is stopped and removed, and reported in
 *     `mariadbSwept`;
 *   - an UNMARKED one is refused, kept byte-for-byte, and reported in `mariadbRefused`
 *     (the shard runner turns a refusal into a non-zero exit, as for media);
 *   - a lane root that is not at a shard name is untouched.
 *
 * DB TIER: `sweepShardClones` enumerates clones through psql on the suite cluster. It
 * drops nothing here that it did not already own — only marked `<lane>__shard<N>`
 * clones, of which a lane has none outside a shard run.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sweepShardClones } from '../../scripts/lib/test_shard_db.ts';
import { SUITE_MARIADB_MARKER_FILE, suiteMariadbPaths } from '../helpers/suite_mariadb_env.ts';
import { testDatabaseName } from '../helpers/test_database.ts';

const TEMPLATE = testDatabaseName();
const MARKED = suiteMariadbPaths(`${TEMPLATE}__shard97`);
const UNMARKED = suiteMariadbPaths(`${TEMPLATE}__shard98`);
const NOT_A_SHARD = suiteMariadbPaths(`${TEMPLATE}__notashard97`);
const servers: ReturnType<typeof Bun.spawn>[] = [];

afterAll(() => {
	for (const server of servers) server.kill('SIGKILL');
	for (const paths of [MARKED, UNMARKED, NOT_A_SHARD])
		rmSync(paths.root, { recursive: true, force: true });
});

describe('the shard sweep owns the suite MariaDB surface', () => {
	test('a marked shard lane is stopped and removed, an unmarked one refused and kept, a non-shard lane untouched', async () => {
		for (const paths of [MARKED, UNMARKED, NOT_A_SHARD]) {
			// A planted lane must never collide with a real one.
			expect(existsSync(paths.root), `${paths.root} already exists`).toBe(false);
			mkdirSync(paths.datadir, { recursive: true });
		}
		for (const paths of [MARKED, NOT_A_SHARD])
			writeFileSync(join(paths.root, SUITE_MARIADB_MARKER_FILE), '{}\n');
		writeFileSync(join(UNMARKED.datadir, 'keep'), 'not the suite’s\n');
		const server = Bun.spawn(
			['bun', '-e', 'await Bun.sleep(120000)', 'mariadbd', `--datadir=${MARKED.datadir}`],
			{ stdout: 'ignore', stderr: 'ignore' },
		);
		servers.push(server);
		writeFileSync(MARKED.pidFile, `${server.pid}\n`);
		await Bun.sleep(200);

		const report = (await sweepShardClones(TEMPLATE)) as Awaited<
			ReturnType<typeof sweepShardClones>
		> & { mariadbSwept?: string[]; mariadbRefused?: string[] };

		expect(report.mariadbSwept, 'the sweep reports the MariaDB lanes it removed').toEqual([
			`${TEMPLATE}__shard97`,
		]);
		expect(report.mariadbRefused, 'the sweep reports the lane roots it refused').toEqual([
			`${TEMPLATE}__shard98`,
		]);
		expect(existsSync(MARKED.root), 'the marked shard lane root is gone').toBe(false);
		expect(await server.exited, 'the shard lane server was stopped, not orphaned').not.toBe(0);
		expect(readFileSync(join(UNMARKED.datadir, 'keep'), 'utf8')).toBe('not the suite’s\n');
		expect(existsSync(NOT_A_SHARD.markerFile), 'a lane not at a shard name is untouched').toBe(
			true,
		);
	}, 60_000);
});
