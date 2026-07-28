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
 */

import { describe, expect, test } from 'bun:test';
import { widget } from '../../src/core/area_maintenance/widgets/register_tools.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { listToolDirectories } from '../../src/core/tools/register.ts';

const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

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

	test('an unregistered on-disk tool is warned about and defaults to active', async () => {
		const { datalist } = await panel();
		for (const item of datalist.filter((row) => row.installed_version === null && row.on_disk)) {
			expect(item.warning).toBe('Not registered tool');
			expect(item.active).toBe(true);
		}
	});
});
