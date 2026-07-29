/**
 * register_tools PANEL (get_value) — the registry ⋈ tools-tree join, WC-057.
 *
 * The panel's Active checkbox is a WRITE control: what it shows is what the
 * import writes. So the invariant worth gating is not any particular row's
 * content (that is install data) but the JOIN itself — every tool the importer
 * would scan is offered, every offered row says whether the importer can reach
 * it, and no row appears twice.
 *
 * Lives in its OWN file on purpose: register_tools_widget.test.ts mock.modules
 * core/tools/register.ts, and mock.module is process-wide — this suite must see
 * the real scanner.
 *
 * GHOST ROW. The suite DB's registry happens to contain a row for every tool
 * directory, so `on_disk === false` — the half of the join that exists BECAUSE a
 * registry outlives a deleted tool tree — was only ever asserted inside an `if`
 * that never ran. A real install does hit it (the live dedalo7_mdcat registry
 * carries `tool_leaflet_special_tools`, a PHP-era tool with no directory in this
 * engine's `tools/`), so this suite seeds its own ghost: a reserved zz-prefixed
 * registry row with no directory, deleted in afterAll. Without it the flag, the
 * warning string the client keys its disabled checkbox off, and the "no
 * checkbox over a tool the import cannot reach" rule are all untested.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { widget } from '../../src/core/area_maintenance/widgets/register_tools.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { TIPO, TOOLS_REGISTER_SECTION_TIPO } from '../../src/core/tools/ontology_map.ts';
import { listToolDirectories } from '../../src/core/tools/register.ts';

const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

/** Reserved scratch name — `^tool_[a-z0-9_]+$` yet never a real directory. */
const GHOST = 'tool_zz_ghost_registry';
const GHOST_SECTION_ID = 999_702;
const GHOST_VERSION = '9.9.9';
const GHOST_DEVELOPER = 'ghost row (test scratch)';

async function cleanGhost(): Promise<void> {
	await sql`
		DELETE FROM matrix_tools
		WHERE section_tipo = ${TOOLS_REGISTER_SECTION_TIPO}
		  AND section_id = ${GHOST_SECTION_ID}
	`;
}

beforeAll(async () => {
	await cleanGhost();
	// $3 needs the ::text::jsonb cast — a bare bind lands as a jsonb STRING
	// scalar, not an object (matrix_write.ts uses the same cast for this reason).
	await sql.unsafe(
		`INSERT INTO matrix_tools (section_tipo, section_id, string)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[
			TOOLS_REGISTER_SECTION_TIPO,
			GHOST_SECTION_ID,
			encodeForJsonb({
				[TIPO.NAME]: [{ id: 1, value: GHOST }],
				[TIPO.VERSION]: [{ id: 1, value: GHOST_VERSION }],
				[TIPO.DEVELOPER]: [{ id: 1, value: GHOST_DEVELOPER }],
			}),
		],
	);
});

afterAll(cleanGhost);

interface ToolListItem {
	name: string;
	warning: string | null;
	version: string | null;
	developer: string | null;
	installed_version: string | null;
	active: boolean;
	on_disk: boolean;
}

async function panel(): Promise<{ datalist: ToolListItem[]; errors: string[] | null }> {
	const response = await (widget.getValue as NonNullable<typeof widget.getValue>)({}, ADMIN);
	return response.result as { datalist: ToolListItem[]; errors: string[] | null };
}

describe('register_tools get_value', () => {
	test('every on-disk tool is offered a row', async () => {
		const { datalist } = await panel();
		const listed = new Set(datalist.map((item) => item.name));
		const missing = listToolDirectories()
			.map((entry) => entry.name)
			.filter((name) => !listed.has(name));
		expect(missing).toEqual([]);
	});

	test('rows are unique and name-sorted', async () => {
		const { datalist } = await panel();
		const names = datalist.map((item) => item.name);
		expect(new Set(names).size).toBe(names.length);
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
	});

	test('every row carries the two checkbox fields as booleans', async () => {
		const { datalist } = await panel();
		expect(datalist.length).toBeGreaterThan(0);
		for (const item of datalist) {
			expect(typeof item.active).toBe('boolean');
			expect(typeof item.on_disk).toBe('boolean');
		}
	});

	test('on_disk agrees with the scanner, and a false one is warned about', async () => {
		const { datalist } = await panel();
		const onDisk = new Set(listToolDirectories().map((entry) => entry.name));
		for (const item of datalist) {
			expect(item.on_disk).toBe(onDisk.has(item.name));
			if (!item.on_disk) {
				// The client keys the disabled checkbox off this warning.
				expect(item.warning).toBe('Not found on disk');
			}
		}
	});

	test('a registered tool with no directory is served on_disk:false + the warning', async () => {
		const { datalist } = await panel();
		expect(listToolDirectories().map((entry) => entry.name)).not.toContain(GHOST);

		const row = datalist.find((item) => item.name === GHOST);
		expect(row).toEqual({
			name: GHOST,
			warning: 'Not found on disk',
			version: GHOST_VERSION,
			developer: GHOST_DEVELOPER,
			installed_version: GHOST_VERSION,
			// dd1354 absent → radioYes says not active; the field is still served
			// so the panel's checkbox has a value it can disable.
			active: false,
			on_disk: false,
		});
	});

	test('an unregistered on-disk tool is warned about and defaults to active', async () => {
		const { datalist } = await panel();
		for (const item of datalist.filter((row) => row.installed_version === null && row.on_disk)) {
			expect(item.warning).toBe('Not registered tool');
			expect(item.active).toBe(true);
		}
	});
});
