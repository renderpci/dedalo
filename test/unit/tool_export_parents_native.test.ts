/**
 * WC-049 gate — the export parents chain (per-ddo value_with_parents).
 *
 * Contract under test (tools/tool_export + src/diffusion/export/atoms.ts):
 *  - a grid_value export ddo with value_with_parents:true emits each relation
 *    locator TARGET's ancestor chain (getParentsRecursive nearest-first ×
 *    thesaurus term resolver, ' > ' joined, self excluded) as ONE sibling
 *    column whose key ends '#parents' and whose label leaf is 'parents';
 *  - both relation paths emit: the WC-008 compact portal cell AND the
 *    request-config fan-out (autocomplete family);
 *  - the flag is PER-DDO ONLY (the legacy request-global option is ignored)
 *    and grid_value ONLY (value / dedalo_raw never grow parents columns);
 *  - targets without hierarchy emit NOTHING (no empty column);
 *  - tool_export.components_with_parent answers the client checkbox gate
 *    (relation component with a hierarchical target → true).
 *
 * Fixture: the canonical test3 playground (matrix_test — the ONE scratch
 * surface). test3 owns a component_relation_parent (test71, group test45), a
 * portal targeting test3 itself (test80) and an autocomplete_hi (test9), and
 * its section_map declares the thesaurus scope (term = test52). The suite
 * builds the ancestor chain 27→2→1 on the scratch rows, stamps known lg-spa
 * test52 term values on the ancestors, and restores the canonical fixture
 * afterwards — PORTABLE across installs, unlike real-thesaurus content.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { restoreCanonicalTest3 } from '../../src/core/test_data/seed.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import {
	toolExportComponentsWithParent,
	toolExportGetExportGrid,
} from '../../tools/tool_export/server/tool_export.ts';
import { refusalOf } from '../helpers/refusal.ts';

const SECTION = 'test3';
const PORTAL = 'test80'; // component_portal → test3 (compact WC-008 cell)
const AUTOCOMPLETE = 'test9'; // component_autocomplete_hi (fan-out path)
const PARENT_LINK = 'test71'; // test3's component_relation_parent
const LITERAL = 'test52'; // component_input_text (never eligible)

let principal!: Principal;

const contextOf = (options: Record<string, unknown>): ToolActionContext =>
	({ principal, userId: -1, options, background: false }) as ToolActionContext;

/** One scratch parent link ON a test3 row (the canonical shape test71 stores). */
const parentLocator = (parentId: number): Record<string, unknown> => ({
	id: 1,
	type: 'dd47',
	section_id: String(parentId),
	section_tipo: SECTION,
	from_component_tipo: PARENT_LINK,
});

const setColumnSlot = async (
	column: 'relation' | 'string',
	sectionId: number,
	componentTipo: string,
	items: Record<string, unknown>[],
): Promise<void> => {
	// $2::text::jsonb — bind as TEXT so postgres parses it (a bare ::jsonb bind
	// stores a jsonb STRING scalar — the ledgered Bun.sql trap, json_codec.ts).
	await sql.unsafe(
		`UPDATE matrix_test
		SET ${column} = jsonb_set(COALESCE(${column}, '{}'::jsonb), $1::text[], $2::text::jsonb)
		WHERE section_tipo = $3 AND section_id = $4`,
		[`{${componentTipo}}`, JSON.stringify(items), SECTION, sectionId],
	);
};

const setRelationSlot = (
	sectionId: number,
	componentTipo: string,
	items: Record<string, unknown>[],
): Promise<void> => setColumnSlot('relation', sectionId, componentTipo, items);

beforeAll(async () => {
	principal = await resolvePrincipal(-1);
	await restoreCanonicalTest3();
	// Ancestor chain on the scratch rows: 27 → 2 → 1 (record 1's test71 stays
	// the canonical [] — the walk stops there).
	await setRelationSlot(27, PARENT_LINK, [parentLocator(2)]);
	await setRelationSlot(2, PARENT_LINK, [parentLocator(1)]);
	// Known lg-spa THESAURUS TERM values on the ancestors (test3's section_map
	// thesaurus term = test52) — what the chain resolves and joins.
	await setColumnSlot('string', 2, LITERAL, [{ id: 1, lang: 'lg-spa', value: 'Parent A' }]);
	await setColumnSlot('string', 1, LITERAL, [{ id: 1, lang: 'lg-spa', value: 'Root B' }]);
	// The export source row: record 1 already points test80 → test3/27
	// (canonical); give the autocomplete the same target for the fan-out path.
	await setRelationSlot(1, AUTOCOMPLETE, [
		{
			id: 1,
			type: 'dd151',
			section_id: '27',
			section_tipo: SECTION,
			from_component_tipo: AUTOCOMPLETE,
		},
	]);
});

afterAll(async () => {
	await restoreCanonicalTest3(); // healing — leave the playground canonical
});

/** getParentsRecursive(27) nearest-first × the test52 term values stamped above. */
const EXPECTED_CHAIN = 'Parent A > Root B';

const ddo = (
	componentTipo: string,
	extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
	path: [{ section_tipo: SECTION, component_tipo: componentTipo, name: componentTipo }],
	...extra,
});

const exportOptions = (
	dataFormat: string,
	ddos: Record<string, unknown>[],
	extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
	section_tipo: SECTION,
	model: 'section',
	data_format: dataFormat,
	breakdown: 'default',
	ar_ddo_to_export: ddos,
	sqo: {
		section_tipo: [SECTION],
		limit: 0,
		offset: 0,
		filter_by_locators: [{ section_tipo: SECTION, section_id: '1' }],
	},
	...extra,
});

type ProtocolLine = { t: string; i?: number; key?: string; ar_labels?: string[] } & Record<
	string,
	unknown
>;

const runExport = async (
	options: Record<string, unknown>,
): Promise<{ columns: ProtocolLine[]; rows: ProtocolLine[] }> => {
	const response: ToolResponse = await toolExportGetExportGrid(contextOf(options));
	const result = response.data as { columns: ProtocolLine[]; rows: ProtocolLine[] };
	expect(Array.isArray(result?.columns)).toBe(true);
	return result;
};

const parentsColumns = (columns: ProtocolLine[]): ProtocolLine[] =>
	columns.filter((column) => String(column.key ?? '').includes('#parents'));

const cellOf = (rows: ProtocolLine[], ordinal: number): string | undefined => {
	for (const row of rows) {
		const cells = row.c as Record<string, string> | undefined;
		const value = cells?.[String(ordinal)];
		if (value !== undefined) return value;
	}
	return undefined;
};

describe('WC-049 parents chain — grid_value emission', () => {
	test(
		'compact portal cell (WC-008) grows a sibling #parents column with the ' +
			"nearest-first ' > ' chain",
		async () => {
			const { columns, rows } = await runExport(
				exportOptions('grid_value', [ddo(PORTAL, { value_with_parents: true })]),
			);
			const parents = parentsColumns(columns);
			expect(parents).toHaveLength(1);
			const column = parents[0] as ProtocolLine;
			expect(column.key).toBe(`${SECTION}_${PORTAL}.${SECTION}_${PORTAL}#parents`);
			// the sub_id labels the column leaf verbatim
			expect((column.ar_labels ?? []).at(-1)).toBe('parents');
			expect(cellOf(rows, column.i as number)).toBe(EXPECTED_CHAIN);
		},
	);

	test('request-config fan-out (autocomplete family) emits the SAME chain shape', async () => {
		const { columns, rows } = await runExport(
			exportOptions('grid_value', [ddo(AUTOCOMPLETE, { value_with_parents: true })]),
		);
		const parents = parentsColumns(columns);
		expect(parents).toHaveLength(1);
		const column = parents[0] as ProtocolLine;
		expect(column.key).toBe(`${SECTION}_${AUTOCOMPLETE}.${SECTION}_${AUTOCOMPLETE}#parents`);
		expect(cellOf(rows, column.i as number)).toBe(EXPECTED_CHAIN);
	});

	test('per-ddo flag off → no #parents column', async () => {
		const { columns } = await runExport(exportOptions('grid_value', [ddo(PORTAL)]));
		expect(parentsColumns(columns)).toHaveLength(0);
	});

	test('the legacy request-global option is IGNORED (WC-049 per-ddo only)', async () => {
		const { columns } = await runExport(
			exportOptions('grid_value', [ddo(PORTAL)], { value_with_parents: true }),
		);
		expect(parentsColumns(columns)).toHaveLength(0);
	});

	test('a parent-less target emits NOTHING (no empty column)', async () => {
		// record 2's portal → nothing; point the export at record 2 whose test80
		// is canonically absent — and at record 27 via a fresh source: use a ddo
		// on record 1 AFTER stripping the chain below record 27's parent.
		await setRelationSlot(27, PARENT_LINK, []);
		try {
			const { columns } = await runExport(
				exportOptions('grid_value', [ddo(PORTAL, { value_with_parents: true })]),
			);
			expect(parentsColumns(columns)).toHaveLength(0);
		} finally {
			await setRelationSlot(27, PARENT_LINK, [parentLocator(2)]);
		}
	});
});

describe('WC-049 parents chain — format confinement', () => {
	test("'value' format never grows parents columns", async () => {
		const { columns, rows } = await runExport(
			exportOptions('value', [ddo(PORTAL, { value_with_parents: true })]),
		);
		expect(parentsColumns(columns)).toHaveLength(0);
		// and no chain leaks into the flat cell
		for (const row of rows) {
			for (const value of Object.values((row.c as Record<string, string>) ?? {})) {
				expect(String(value)).not.toContain(EXPECTED_CHAIN);
			}
		}
	});

	test("'dedalo_raw' format never grows parents columns", async () => {
		const { columns } = await runExport(
			exportOptions('dedalo_raw', [ddo(PORTAL, { value_with_parents: true })]),
		);
		expect(parentsColumns(columns)).toHaveLength(0);
	});
});

describe('tool_export.components_with_parent (client checkbox gate)', () => {
	test('relation component with a hierarchical target → true; literal → false', async () => {
		const response = await toolExportComponentsWithParent(
			contextOf({
				section_tipo: SECTION,
				components: [
					{ tipo: PORTAL, section_tipo: SECTION },
					{ tipo: LITERAL, section_tipo: SECTION },
				],
			}),
		);
		expect(response.data).toEqual({ [PORTAL]: true, [LITERAL]: false });
	});

	test('empty/invalid input is REFUSED with a registered code', async () => {
		const refusal = await refusalOf(
			toolExportComponentsWithParent(contextOf({ section_tipo: SECTION, components: [] })),
		);
		expect(refusal.code).toBe('request.invalid_options');
	});
});
