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
import { column } from '../helpers/seed_contract.ts';

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
});
