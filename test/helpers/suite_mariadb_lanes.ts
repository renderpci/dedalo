/**
 * SWEEP MANY SUITE MARIADB LANES at once — the shard runner's teardown (PUB-05 review
 * 2026-09-30, S2).
 *
 * `bun run test:shard` gives each bin `DEDALO_TEST_DATABASE=<template>__shard<N>`, so the
 * first MariaDB gate a shard runs installs and starts a DETACHED `mariadbd` under
 * `../private/test_mariadb/<template>__shard<N>`. `sweepShardClones`
 * (scripts/lib/test_shard_db.ts) hands this module its own shard-name grammar, so the
 * name is never re-typed here, and gets back what it may report: each MARKED lane root
 * the matcher names is stopped and removed (`sweepSuiteMariadb`); an UNMARKED one is
 * refused, kept, and reported — the caller's red, never a silent skip.
 *
 * A module of its own, not a function of test/helpers/suite_mariadb.ts: it LISTS a
 * directory, and every gate that acquires the suite target imports that helper — the
 * census would read each of them as a walker of a root it does not choose.
 *
 * Held by test/unit/suite_mariadb_target_native.test.ts ("lane sweep") and, once wired
 * into the shard runner, by test/unit/shard_mariadb_sweep_native.test.ts.
 */

import { existsSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { sweepSuiteMariadb } from './suite_mariadb.ts';
import { suiteMariadbPaths } from './suite_mariadb_env.ts';
import { testDatabaseName } from './test_database.ts';

/** Sweep every lane root under `../private/test_mariadb/` whose lane name `match`es. */
export async function sweepSuiteMariadbLanes(
	match: (lane: string) => boolean,
): Promise<{ swept: string[]; refused: string[] }> {
	const base = dirname(suiteMariadbPaths(testDatabaseName()).root);
	const report = { swept: [] as string[], refused: [] as string[] };
	if (!existsSync(base)) return report;
	for (const lane of readdirSync(base).sort()) {
		if (!match(lane)) continue;
		try {
			const { removed } = await sweepSuiteMariadb(lane);
			if (removed) report.swept.push(lane);
		} catch {
			report.refused.push(lane);
		}
	}
	return report;
}
