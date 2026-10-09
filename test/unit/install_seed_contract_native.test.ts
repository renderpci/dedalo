/**
 * The COMMITTED install seed (install/db/dedalo_install.pgsql.gz) restored into
 * a scratch database and held to the content contract — the same
 * test/helpers/seed_contract.ts the compiler's fresh output is held to
 * (seed_build_native.test.ts). The manifest tripwire proves the file is the one
 * the compiler wrote from these sources; this proves what it CONTAINS is what
 * every install must be born with.
 *
 * Scratch surface: `dedalo_seedcommitted_<pid>` (swept on entry, FORCE-dropped after).
 */

import { afterAll, beforeAll, describe, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { SEED_DUMP_PATH } from '../../src/core/install/paths.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { sweepOrphanScratchDatabases } from '../helpers/scratch_database.ts';
import { assertSeedContract, column, restoreSeedRaw } from '../helpers/seed_contract.ts';

const PREFIX = 'dedalo_seedcommitted_';
const SCRATCH = `${PREFIX}${process.pid}`;
const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
};
const scratch: DbConnDescriptor = { ...admin, database: SCRATCH };

beforeAll(async () => {
	await sweepOrphanScratchDatabases(admin, PREFIX);
	await column(admin, `DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`);
	await column(admin, `CREATE DATABASE "${SCRATCH}" TEMPLATE template0 ENCODING 'UTF8'`);
	await restoreSeedRaw(scratch, SEED_DUMP_PATH);
}, 120_000);

afterAll(async () => {
	await column(admin, `DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`);
});

describe('the committed install seed', () => {
	test('satisfies the content contract', async () => {
		await assertSeedContract(scratch);
	}, 120_000);
});
