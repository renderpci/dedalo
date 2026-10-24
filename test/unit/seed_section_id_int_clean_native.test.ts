/**
 * THE INSTALL SEED IS BORN INT-CLEAN (cross-ops:r2 S2 —
 * WC-2026-10-21-seed-and-thesaurus-int-clean). The seed compiler wrote root's
 * dd1725/dd131/dd244 and every record's dd197/dd200 locators, the langs, the core
 * registry and the core ontology packages in the REPEALED string form
 * (`"section_id": "2"`) into every fresh install, with no
 * `section_id_int_normalize` marker — against WC-2026-08-10-section-id-int-canonical
 * ("writers mint int"), and invisible to section_id_int_tripwire (quoted literals,
 * not `String(...)`). At the contraction release an int-only probe misses them and
 * the boot floor finds no marker.
 *
 * THE LAW (measured):
 *  (a) SEED_RECORDS — the canonical records — carry no convertible string address
 *      (the sweep's own kernel finds nothing to convert);
 *  (b) the data script writes the `section_id_int_normalize` marker (origin
 *      seed_build, the conversions counted) in the SAME statement as the version row;
 *  (c) the compiler's own census (seed_build.ts stringAddressResidue) names a string
 *      address planted in a scratch database and finds nothing on a clean one — the
 *      compile refuses to ship a residue its canonicalization missed.
 *  (d) BOTH censuses (the compiler's and the content contract's own,
 *      test/helpers/seed_contract.ts sectionIdStringResidue) send their SQL on psql's
 *      STDIN, never in argv: one UNION ALL over every jsonb column is past Linux's
 *      MAX_ARG_STRLEN (128 KiB per argv string) — posix_spawn E2BIG in the CI image
 *      (W4 seed-import), invisible on macOS, which caps no single string. Measured on a
 *      scratch database WIDE enough that the census statement is past that cap: every
 *      psql argv string stays under ARGV_SQL_BOUND, the census bytes went down stdin,
 *      and a planted address is still found.
 * The committed seed itself is held to the census + marker by the content contract
 * (test/helpers/seed_contract.ts → install_seed_contract_native, seed_build_native).
 *
 * Scratch surface: `dedalo_seedintclean_<pid>` (swept on entry, FORCE-dropped after).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { seedDataSql, stringAddressResidue } from '../../src/core/install/seed_build.ts';
import { SEED_RECORDS } from '../../src/core/install/seed_sources.ts';
import { intifySectionIdsInValue } from '../../src/core/update/transform/section_id_intify.ts';
import { sweepOrphanScratchDatabases } from '../helpers/scratch_database.ts';
import { column, sectionIdStringResidue } from '../helpers/seed_contract.ts';

const PREFIX = 'dedalo_seedintclean_';
const SCRATCH = `${PREFIX}${process.pid}`;
const admin: DbConnDescriptor = {
	database: 'postgres',
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
	socket: config.db.socket,
};
const scratch: DbConnDescriptor = { ...admin, database: SCRATCH };

beforeAll(async () => {
	await sweepOrphanScratchDatabases(admin, PREFIX);
	await column(admin, `DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`);
	await column(admin, `CREATE DATABASE "${SCRATCH}" TEMPLATE template0 ENCODING 'UTF8'`);
	await column(
		scratch,
		'CREATE TABLE matrix_users (id serial PRIMARY KEY, section_id integer, section_tipo text, relation jsonb, misc jsonb)',
	);
	await column(
		scratch,
		'CREATE TABLE dd_ontology (id serial PRIMARY KEY, tipo text, relations jsonb, properties jsonb)',
	);
}, 60_000);

/** The largest argv string a census psql spawn may carry (no SQL statement of size rides argv). */
const ARGV_SQL_BOUND = 4096;
/** Linux's cap on ONE argv string (MAX_ARG_STRLEN = 32 pages): the census must exceed it. */
const LINUX_MAX_ARG_STRLEN = 128 * 1024;
/** jsonb tables of the wide scratch schema (3 census legs each, ~330 bytes a leg). */
const WIDE_TABLES = 200;

/**
 * Every psql spawn's argv, and the bytes written to its stdin, while `work` runs.
 * Bun.spawn is wrapped for the call only; a psql child is handed back behind a proxy
 * whose `stdin` counts what runPsql writes (the FileSink's own methods are read-only).
 */
async function observePsqlSpawns<T>(
	work: () => Promise<T>,
): Promise<{ value: T; argvs: string[][]; stdinBytes: number }> {
	const realSpawn = Bun.spawn;
	const argvs: string[][] = [];
	let stdinBytes = 0;
	const spy = (cmd: string[], options?: Parameters<typeof Bun.spawn>[1]) => {
		const child = realSpawn(cmd, options);
		if (!String(cmd[0]).endsWith('psql')) return child;
		argvs.push([...cmd]);
		const sink = child.stdin as import('bun').FileSink | null | number | undefined;
		if (sink === null || sink === undefined || typeof sink === 'number') return child;
		const counted = {
			write: (data: Parameters<import('bun').FileSink['write']>[0]) => {
				stdinBytes += typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
				return sink.write(data);
			},
			end: () => sink.end(),
			flush: () => sink.flush(),
		};
		return new Proxy(child, {
			get(target, key) {
				if (key === 'stdin') return counted;
				const value = Reflect.get(target, key);
				return typeof value === 'function' ? value.bind(target) : value;
			},
		});
	};
	(Bun as { spawn: unknown }).spawn = spy;
	try {
		const value = await work();
		return { value, argvs, stdinBytes };
	} finally {
		(Bun as { spawn: unknown }).spawn = realSpawn;
	}
}

afterAll(async () => {
	await column(admin, `DROP DATABASE IF EXISTS "${SCRATCH}" WITH (FORCE)`);
});

describe('the seed is born int-clean', () => {
	test('(a) the canonical records carry no convertible string record address', () => {
		expect(SEED_RECORDS.length).toBeGreaterThan(0);
		for (const record of SEED_RECORDS) {
			const clone = structuredClone(record);
			const result = intifySectionIdsInValue(clone, { externalTipos: new Set() });
			expect(result.converted, `${record.section_tipo}/${record.section_id}`).toBe(0);
		}
	});

	test('(b) the data script writes the section_id_int_normalize marker beside the version row', () => {
		const sql = seedDataSql({
			tables: [],
			registryPath: '/tmp/registry.copy',
			releaseDate: '2026-10-21T00:00:00Z',
			addressesConverted: 4321,
		});
		const inserts = sql.match(/^INSERT INTO matrix_updates .*$/gm) ?? [];
		expect(inserts).toHaveLength(1);
		const [insert = ''] = inserts;
		expect(insert).toContain("'dedalo_version'");
		expect(insert).toContain(
			"jsonb_build_object('section_id_int_normalize', jsonb_build_object('date', '2026-10-21 00:00:00', 'origin', 'seed_build', 'converted', 4321))",
		);
	});

	test('(c) the compiler census names a planted string address, and nothing on a clean database', async () => {
		await column(scratch, 'TRUNCATE matrix_users, dd_ontology');
		await column(
			scratch,
			`INSERT INTO matrix_users (section_id, section_tipo, relation, misc) VALUES
			 (-1, 'dd128', '{"dd1725": [{"section_id": 2, "section_tipo": "dd234"}]}', '{"x": [{"section_id": "5"}]}')`,
		);
		// The config DSL's sample locators (dd_ontology.properties) are the WC's named exemption.
		await column(
			scratch,
			`INSERT INTO dd_ontology (tipo, relations, properties) VALUES
			 ('dd1', '[{"tipo": "dd2"}]', '{"output_sample": [{"section_id": "1", "section_tipo": "55"}]}')`,
		);
		expect(await stringAddressResidue(admin, SCRATCH)).toEqual([]);
		await column(
			scratch,
			`INSERT INTO matrix_users (section_id, section_tipo, relation) VALUES
			 (1, 'dd128', '{"dd197": [{"section_id": "-1", "section_tipo": "dd128"}, {"section_id": "3", "section_tipo": "dd128"}]}')`,
		);
		await column(
			scratch,
			`INSERT INTO dd_ontology (tipo, relations) VALUES ('dd3', '[{"section_id": "7", "section_tipo": "dd0"}]')`,
		);
		expect(await stringAddressResidue(admin, SCRATCH)).toEqual([
			'dd_ontology.relations section_id: 1',
			'matrix_users.relation section_id: 2',
		]);
	}, 60_000);

	test('(d) both censuses send their SQL on stdin — never an argv string past the bound', async () => {
		const tables = Array.from(
			{ length: WIDE_TABLES },
			(_, at) => `CREATE TABLE zz_wide_${String(at).padStart(3, '0')} (relation jsonb);`,
		);
		await column(scratch, tables.join('\n'));
		await column(
			scratch,
			`INSERT INTO zz_wide_137 (relation) VALUES ('{"x": [{"section_id": "4", "section_tipo": "dd128"}]}')`,
		);
		const compiler = await observePsqlSpawns(() => stringAddressResidue(admin, SCRATCH));
		const contract = await observePsqlSpawns(() => sectionIdStringResidue(scratch));
		// Outcome: the wide census really ran — the planted address is named.
		expect(compiler.value).toContain('zz_wide_137.relation section_id: 1');
		expect(contract.value).toContain('zz_wide_137.relation:section_id=1');
		for (const [door, run] of [
			['seed_build.ts stringAddressResidue', compiler],
			['seed_contract.ts sectionIdStringResidue', contract],
		] as const) {
			// Non-vacuity: psql was spawned, and the census statement (bytes on stdin) is
			// one Linux could not have carried as a single argv string.
			expect(run.argvs.length, door).toBeGreaterThanOrEqual(2);
			const longest = Math.max(...run.argvs.flat().map((arg) => Buffer.byteLength(arg)));
			expect(longest, `${door}: longest psql argv string`).toBeLessThanOrEqual(ARGV_SQL_BOUND);
			expect(run.stdinBytes, `${door}: census bytes on stdin`).toBeGreaterThan(
				LINUX_MAX_ARG_STRLEN,
			);
		}
	}, 120_000);
});
