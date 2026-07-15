/**
 * install_hierarchies ACTIVATES what it imports — TS-NATIVE install contract.
 *
 * The wizard's hierarchy step used to COPY the `<tld>1.copy.gz` term rows into
 * matrix_hierarchy and stop there (its own header called full activation "a
 * documented follow-up"). The result was an install whose thesaurus looked empty
 * and whose hierarchy portals resolved nothing: `<tld>1` is not a section the
 * engine knows until its ONTOLOGY exists, and the hierarchy1 registry record was
 * never flagged ACTIVE — so the `field_value` active filter behind every portal's
 * target_sections matched zero hierarchies. Live symptom (2026-07-14): 69,889 `es1`
 * terms in the database, zero `es` dd_ontology nodes, and Spain's General term
 * portal unable to resolve its target.
 *
 * PHP calls activate_hierarchy() for every selected tld right after its import
 * (installer_hierarchy_manager :1073-79). This pins the TS equivalent:
 *   - the registry record exists and is flagged ACTIVE (hierarchy4 → dd64/1) with a
 *     FULL locator (from_component_tipo present — a bare one is invisible to the @>
 *     containment the portals run);
 *   - hierarchy109 (source section) is set, or generateVirtualSection refuses;
 *   - the ONTOLOGY is provisioned: `<tld>0`/1 + `<tld>0`/2 node records and the
 *     `<tld>0`/`<tld>1`/`<tld>2` dd_ontology nodes;
 *   - hierarchy53/58 name the virtual sections, and the General Term roots point at
 *     the IMPORTED roots (`<tld>1`/1) rather than minting duplicates;
 *   - re-activation is idempotent (the wizard may be re-run).
 *
 * Scratch: tld 'zz' — not a real Dédalo tld, so the sweep can be tld-scoped. The
 * .copy.gz IMPORT half is not exercised here (it is unchanged, and vendoring a fake
 * archive would test psql, not this contract); activation is called directly with the
 * descriptor the import step reads from hierarchies.json.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { activateHierarchy } from '../../src/core/install/hierarchy_activate.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { deleteOntologyByTld } from '../../src/core/ontology/ontology_delete.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';

const TLD = 'zz';
const HIERARCHY_SECTION = 'hierarchy1';
const HIERARCHY_TABLE = 'matrix_hierarchy_main';
const USER_ID = -1;

const META = {
	tld: TLD,
	label: 'ZZ Scratch Land',
	typology: 2, // toponymy — the typology PHP gates the General Term roots on
	active_in_thesaurus: true,
};

let sectionId: number | null = null;

async function registryRow(): Promise<{ relation: Record<string, unknown[]>; string: Record<string, unknown[]> } | null> {
	if (sectionId === null) return null;
	const rows = (await sql.unsafe(
		`SELECT relation, string FROM "${HIERARCHY_TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[HIERARCHY_SECTION, sectionId],
	)) as { relation: Record<string, unknown[]>; string: Record<string, unknown[]> }[];
	return rows[0] ?? null;
}

async function nodeRecordIds(): Promise<number[]> {
	const rows = (await sql.unsafe(
		'SELECT section_id FROM matrix_ontology WHERE section_tipo = $1 ORDER BY section_id',
		[`${TLD}0`],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

async function ddOntologyTipos(): Promise<string[]> {
	const rows = (await sql.unsafe('SELECT tipo FROM dd_ontology WHERE tld = $1 ORDER BY tipo', [
		TLD,
	])) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

async function sweep(): Promise<void> {
	await deleteOntologyByTld(TLD, (st, sid) => deleteSectionRecord(st, sid, USER_ID));
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [TLD]);
	await sql.unsafe(
		`DELETE FROM "${HIERARCHY_TABLE}" WHERE section_tipo = $1
		   AND lower(string->'hierarchy6'->0->>'value') = $2`,
		[HIERARCHY_SECTION, TLD],
	);
	// The provisioned thesaurus sections + every audit row the activation wrote.
	await sql.unsafe('DELETE FROM matrix_hierarchy WHERE section_tipo IN ($1, $2)', [
		`${TLD}1`,
		`${TLD}2`,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo IN ($1, $2, $3)
		   OR (section_tipo = $4 AND section_id = $5)`,
		[`${TLD}0`, `${TLD}1`, `${TLD}2`, HIERARCHY_SECTION, sectionId ?? -999999],
	);
	await clearOntologyDerivedCaches();
}

beforeAll(async () => {
	await sweep();
});

afterAll(async () => {
	await sweep();
});

describe('install: activate an imported hierarchy', () => {
	test('registers, flags ACTIVE and provisions the ontology', async () => {
		const outcome = await activateHierarchy(META, USER_ID);
		sectionId = outcome.sectionId;

		expect(outcome.result).toBe(true);
		expect(outcome.sectionId).not.toBeNull();

		const row = await registryRow();
		expect(row).not.toBeNull();

		// ACTIVE, with a FULL locator — a bare one is invisible to the portals' @> filter.
		expect(row?.relation.hierarchy4?.[0]).toMatchObject({
			type: 'dd151',
			section_tipo: 'dd64',
			section_id: '1', // YES
			from_component_tipo: 'hierarchy4',
		});
		expect(row?.relation.hierarchy125?.[0]).toMatchObject({
			section_id: '1',
			from_component_tipo: 'hierarchy125',
		});
		// The template generateVirtualSection clones — without it, provisioning refuses.
		expect(row?.string.hierarchy109?.[0]).toMatchObject({ value: 'hierarchy20' });

		// THE missing step: the ontology now exists.
		expect(await nodeRecordIds()).toEqual([1, 2]);
		expect(await ddOntologyTipos()).toEqual(['zz0', 'zz1', 'zz2']);

		// The virtual sections are named on the registry record...
		expect(row?.string.hierarchy53?.[0]).toMatchObject({ value: 'zz1' });
		expect(row?.string.hierarchy58?.[0]).toMatchObject({ value: 'zz2' });
		// ...and the General Term root points at a record that EXISTS.
		// NOT at a hard-coded `zz1/1`: this assertion USED to pin section_id '1', which was
		// the bug — PHP hard-codes `<tld>1`/1 and `<tld>2`/2, and those ids exist in almost
		// no install (`es2` has no records at all). The id is now whatever the counter
		// allocated; what MATTERS is that the target is real.
		const rootLocator = row?.relation.hierarchy45?.[0] as Record<string, unknown>;
		expect(rootLocator).toMatchObject({
			type: 'dd48',
			section_tipo: 'zz1',
			from_component_tipo: 'hierarchy45',
		});
		const rootId = Number(rootLocator.section_id);
		const rootRows = (await sql.unsafe(
			'SELECT section_id FROM matrix_hierarchy WHERE section_tipo = $1 AND section_id = $2',
			['zz1', rootId],
		)) as unknown[];
		expect(rootRows).toHaveLength(1); // the root the locator names is really there
	});

	test('the activated hierarchy is visible to the portals’ active filter', async () => {
		// The exact containment relations/request_config/explicit.ts runs to resolve a
		// portal's target_sections from the ACTIVE hierarchies.
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM "${HIERARCHY_TABLE}" t
			 WHERE t.section_tipo = $1 AND t.section_id = $2
			   AND t.relation @> '{"hierarchy4":[{"section_tipo":"dd64","section_id":"1","from_component_tipo":"hierarchy4"}]}'::jsonb`,
			[HIERARCHY_SECTION, sectionId],
		)) as { n: number }[];
		expect(Number(rows[0]?.n)).toBe(1);
	});

	test('re-activating is idempotent (the wizard may be re-run)', async () => {
		const outcome = await activateHierarchy(META, USER_ID);

		expect(outcome.result).toBe(true);
		expect(outcome.sectionId).toBe(sectionId); // the SAME record, not a second one
		expect(await nodeRecordIds()).toEqual([1, 2]); // no duplicate node records
	});
});
