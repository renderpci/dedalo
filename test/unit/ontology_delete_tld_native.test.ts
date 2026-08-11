/**
 * Tier-1 backlog gate — `tldFromRegistryRecord` (coverage plan §4.1.9,
 * ontology_delete.ts). It is the ONE place the ontology-uninstall cascade
 * decides WHICH namespace it is about to erase: `deleteOntologyMain` refuses
 * outright when it returns null, and purges every `dd_ontology` node with that
 * tld when it does not.
 *
 * Data-visible failure the branch families prevent:
 *  - a stored tld with stray case/whitespace ('  ZZBK ') must normalise, or the
 *    purge silently matches nothing and the uninstall reports success while the
 *    ontology stays behind;
 *  - an UNSAFE tld ('zz1', 'a', 'zz-x') must be null — safeTld is the guard that
 *    keeps an operator-typed namespace out of the delete;
 *  - a missing record / unresolvable section tipo must be null, never a throw on
 *    a `"null"` table name and never a guessed namespace.
 *
 * Scratch law: rows are minted by this gate in matrix_hierarchy_main under
 * section_tipo 'hierarchy1', section_id band 941000-941999 ONLY, swept in
 * afterAll from matrix_hierarchy_main AND matrix_time_machine with a loud
 * failure on a 0-row delete. No table-global counts; no assertion on a row this
 * gate did not mint.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { tldFromRegistryRecord } from '../../src/core/ontology/ontology_delete.ts';

const SECTION_TIPO = 'hierarchy1';
const BAND_FROM = 941000;
const BAND_TO = 941999;
const OK_ID = 941010; // stored '  ZZBK ' → 'zzbk'
const UNSAFE_ID = 941011; // stored 'zz1' → refused
const EMPTY_ID = 941012; // hierarchy6 present but empty
const ABSENT_ID = 941013; // never minted

async function mint(sectionId: number, tld: string): Promise<void> {
	const value = JSON.stringify({ hierarchy6: [{ value: tld }] });
	await sql.unsafe(
		`INSERT INTO matrix_hierarchy_main (section_id, section_tipo, string)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[sectionId, SECTION_TIPO, value],
	);
}

beforeAll(async () => {
	// Defensive: clear the band before minting (a previous crashed run).
	await sql.unsafe(
		`DELETE FROM matrix_hierarchy_main
		  WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
		[SECTION_TIPO, BAND_FROM, BAND_TO],
	);
	await mint(OK_ID, '  ZZBK ');
	await mint(UNSAFE_ID, 'zz1');
	await mint(EMPTY_ID, '');
});

afterAll(async () => {
	const deleted = (await sql.unsafe(
		`DELETE FROM matrix_hierarchy_main
		  WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3
		  RETURNING section_id`,
		[SECTION_TIPO, BAND_FROM, BAND_TO],
	)) as { section_id: number }[];
	if (deleted.length === 0) {
		throw new Error(
			'scratch sweep deleted 0 rows from matrix_hierarchy_main — the band 941000-941999 was not mine to clean, investigate before re-running',
		);
	}
	// This gate writes no time-machine rows; sweep anyway so a future edit that
	// does cannot leak (loud only if it deletes something unexpected is not
	// possible here — absence is the expected state).
	await sql.unsafe(
		`DELETE FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
		[SECTION_TIPO, BAND_FROM, BAND_TO],
	);
});

describe('tldFromRegistryRecord (§4.1.9)', () => {
	test('a stored tld is trimmed and lower-cased before it is used', async () => {
		expect(await tldFromRegistryRecord(SECTION_TIPO, OK_ID)).toBe('zzbk');
	});

	test('an UNSAFE tld is refused (safeTld: letters only, 2+)', async () => {
		expect(await tldFromRegistryRecord(SECTION_TIPO, UNSAFE_ID)).toBeNull();
	});

	test('an EMPTY hierarchy6 value is refused, never guessed', async () => {
		expect(await tldFromRegistryRecord(SECTION_TIPO, EMPTY_ID)).toBeNull();
	});

	test('a record that does not exist yields null (no row, no throw)', async () => {
		expect(await tldFromRegistryRecord(SECTION_TIPO, ABSENT_ID)).toBeNull();
	});

	test('an unresolvable section tipo yields null BEFORE any query is built', async () => {
		// getMatrixTableFromTipo → null: the guard is what keeps a `"null"` table
		// name (or an operator-supplied tipo) out of the interpolated SQL.
		expect(await tldFromRegistryRecord('zzbk_not_a_tipo', OK_ID)).toBeNull();
	});
});
