/**
 * export_hierarchy — a dump (or hierarchy.json) temp sibling a DEAD export left
 * in the vendored hierarchy directory is swept by the next export.
 *
 * Every export writes to a temp sibling (`<file>.tmp-<id>`) and renames it only
 * when proven whole; a process killed mid-dump never reaches its `finally`, so
 * the temp stays in `install/import/hierarchy` — a tracked directory — forever.
 * OUTCOMES, on a scratch export directory:
 *  T1 the data export (`exportHierarchy`, even one that dumps nothing) removes a
 *     STALE `<tipo>.copy.gz.tmp-*` and a stale `hierarchy.json.tmp-*`;
 *  T2 the manifest export (`exportHierarchyJson`) does the same;
 *  and both KEEP a FRESH temp (another export may be writing it right now) and
 *  a stale temp of a name the export never writes (not its file to judge).
 *
 * SITUATION: a mkdtemp directory; no database writes (the manifest export reads
 * the suite DB's active registry, the data export refuses the scratch tipo
 * before any dump).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	exportHierarchy,
	exportHierarchyJson,
} from '../../src/core/area_maintenance/widgets/export_hierarchy.ts';

const dirs: string[] = [];
const TWO_DAYS_AGO = (Date.now() - 2 * 24 * 3600 * 1000) / 1000;

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

interface Planted {
	dir: string;
	staleDump: string;
	staleManifest: string;
	freshDump: string;
	foreignStale: string;
}

function plant(): Planted {
	const dir = mkdtempSync(join(tmpdir(), 'dedalo_export_sweep_'));
	dirs.push(dir);
	const file = (name: string, stale: boolean): string => {
		const path = join(dir, name);
		writeFileSync(path, 'partial');
		if (stale) utimesSync(path, TWO_DAYS_AGO, TWO_DAYS_AGO);
		return path;
	};
	return {
		dir,
		staleDump: file('zzes1.copy.gz.tmp-dead01', true),
		staleManifest: file('hierarchy.json.tmp-dead02', true),
		freshDump: file('zzes2.copy.gz.tmp-live03', false),
		foreignStale: file('notes.txt.tmp-dead04', true),
	};
}

function expectSwept(planted: Planted): void {
	expect(existsSync(planted.staleDump)).toBe(false);
	expect(existsSync(planted.staleManifest)).toBe(false);
	expect(existsSync(planted.freshDump)).toBe(true);
	expect(existsSync(planted.foreignStale)).toBe(true);
}

describe('a dead export’s temp siblings are swept by the next export', () => {
	test('T1 the data export sweeps stale dump/manifest temps, keeps fresh and foreign ones', async () => {
		const planted = plant();
		const response = await exportHierarchy({ section_tipo: 'zzes1' }, { outDir: planted.dir });
		expect(response.data).toBe(false); // the scratch tipo is refused: nothing dumped
		expectSwept(planted);
	});

	test('T2 the manifest export sweeps them too', async () => {
		const planted = plant();
		await exportHierarchyJson({ outDir: planted.dir, now: new Date() });
		expectSwept(planted);
	});
});
