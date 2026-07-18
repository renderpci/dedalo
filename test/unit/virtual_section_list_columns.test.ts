/**
 * VIRTUAL SECTION list-column inheritance (PHP resolve_ar_related_list_section
 * step 2, trait.request_config_v5.php): a virtual section with NO section_list
 * child of its OWN inherits its REAL section's list columns — resolve the real
 * tipo (section::get_section_real_tipo_static) and read ITS section_list child.
 *
 * Regression guard: hierarchy/thesaurus-instance sections (es1 → hierarchy20)
 * have zero ontology children, so the non-virtual section_list lookup finds
 * nothing. Before the fix `deriveSectionDdoMap` returned an EMPTY ddo_map and
 * the list view rendered only the built-in Id column. The columns are DERIVED
 * from the real section (not hard-coded) so the gate survives an admin
 * re-tuning the hierarchy section_list, but must never regress to empty.
 */

import { describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { getSectionRealTipo } from '../../src/core/resolve/security_access_datalist.ts';
import { deriveSectionDdoMap } from '../../src/core/section/read.ts';

// DB reachability probe: only a genuinely unreachable DB downgrades to SKIP.
let hasDb = false;
try {
	await sql`SELECT 1`;
	hasDb = true;
} catch {
	console.warn('[virtual_section_list_columns] DB unavailable — corpus drives SKIPPED');
}

const listColumns = (tipo: string): Promise<string[]> =>
	runWithRequestLangs({ applicationLang: 'lg-eng', dataLang: 'lg-eng' }, async () =>
		(await deriveSectionDdoMap(tipo, tipo, 'list')).map((ddo) => ddo.tipo),
	);

describe.if(hasDb)('virtual section list columns (PHP resolve_ar_related_list_section)', () => {
	test('es1 (thesaurus instance) inherits its real section hierarchy20 columns', async () => {
		// es1 is a virtual section: its structure section is hierarchy20.
		const real = await getSectionRealTipo('es1');
		expect(real).toBe('hierarchy20');

		const virtualColumns = await listColumns('es1');
		const realColumns = await listColumns('hierarchy20');

		// The regression: an empty map is exactly the "no columns" bug.
		expect(virtualColumns.length).toBeGreaterThan(0);
		// Inheritance is byte-identical to the real section's own list columns.
		expect(virtualColumns).toEqual(realColumns);
	});

	test('inherited columns are the real section_list child relation_nodes', async () => {
		// hierarchy20's section_list child (hierarchy37) defines the columns; the
		// derived map must match its relation_nodes in order (implicit list build).
		const rows = (await sql`
			SELECT relations FROM dd_ontology
			WHERE parent = 'hierarchy20' AND model = 'section_list'
			ORDER BY order_number ASC LIMIT 1
		`) as { relations: { tipo?: unknown }[] | null }[];
		const expected = (rows[0]?.relations ?? [])
			.map((node) => node.tipo)
			.filter((tipo): tipo is string => typeof tipo === 'string');

		expect(expected.length).toBeGreaterThan(0);
		expect(await listColumns('es1')).toEqual(expected);
	});

	test('a real section with its OWN section_list is unaffected by the fallback', async () => {
		// hierarchy20 is a real section (get_section_real_tipo_static returns
		// itself); its columns resolve directly, never through the virtual hop.
		expect(await getSectionRealTipo('hierarchy20')).toBe('hierarchy20');
		expect((await listColumns('hierarchy20')).length).toBeGreaterThan(0);
	});
});
