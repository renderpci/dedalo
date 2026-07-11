/**
 * SECTION_SPEC §9 gate (oracle-free): a VIRTUAL section's buttons are resolved
 * virtual-aware — PHP section::get_section_buttons_tipo (class.section.php:1121)
 * merges the REAL section's button_* children (minus the virtual section's
 * exclude_elements) with the virtual section's own buttons.
 *
 * This is the regression guard for the dd1244 bug: the prior TS enumeration ran
 * a flat `WHERE parent = tipo` query and returned [] for dd1244 (whose only
 * children are section_list/exclude_elements), so its toolbar rendered with no
 * button_new/button_delete. Runs on the shared matrix DB with NO live PHP
 * oracle, so it fails loud on a cred-less machine (the parity gate would skip).
 *
 * dd1244 (virtual) → relations[0].tipo dd623 (real; its own relation dd22 is a
 * matrix_table, NOT a section, so dd623 stays real). dd623 buttons: dd631
 * (button_new), dd632 (button_delete). dd1244 exclude_elements (dd1479) excludes
 * dd648/dd641/dd1247 — none are buttons — so dd1244 inherits both.
 */

import { describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { sectionButtonRows } from '../../src/core/section/buttons.ts';

/** A section's OWN first-level button_* child tipos (the pre-virtual, flat set). */
async function ownButtonTipos(sectionTipo: string): Promise<string[]> {
	const rows = (await sql`
		SELECT tipo FROM dd_ontology
		WHERE parent = ${sectionTipo} AND model LIKE 'button_%'
		ORDER BY order_number NULLS LAST, tipo
	`) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

describe('virtual-section button enumeration (SECTION_SPEC §9)', () => {
	test('dd1244 (virtual → dd623) inherits the real section buttons', async () => {
		const rows = await sectionButtonRows('dd1244');
		// dd1244 has NO own button children — everything here is inherited.
		expect(await ownButtonTipos('dd1244')).toEqual([]);
		expect(rows.map((row) => row.tipo)).toEqual(['dd631', 'dd632']);
		expect(rows.map((row) => row.model)).toEqual(['button_new', 'button_delete']);
	});

	test('the inherited set is exactly dd623 own buttons minus dd1244 exclude_elements', async () => {
		// Encodes the merge law without re-deriving it: dd1244's resolved buttons
		// equal dd623's own button children (nothing excluded here).
		const virtual = (await sectionButtonRows('dd1244')).map((row) => row.tipo);
		expect(virtual).toEqual(await ownButtonTipos('dd623'));
	});

	test('dd623 stays REAL (its relation dd22 is a matrix_table, not a section)', async () => {
		// The one-level model check must NOT treat dd623 as virtual, or it would
		// try to inherit from dd22 and drop its own buttons.
		const rows = await sectionButtonRows('dd623');
		expect(rows.map((row) => row.tipo)).toEqual(await ownButtonTipos('dd623'));
		expect(rows.length).toBeGreaterThan(0);
	});

	test('a real section is unchanged (own buttons only)', async () => {
		const rows = await sectionButtonRows('numisdata3');
		expect(rows.map((row) => row.tipo)).toEqual(await ownButtonTipos('numisdata3'));
	});
});
