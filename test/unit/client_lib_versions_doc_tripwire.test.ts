/**
 * CLIENT-LIB VERSIONS DOC TRIPWIRE (DEC-12: a documented invariant has a gate).
 *
 * The npm rows and the source-count table of
 * `docs/development/vendored_library_versions.md` are GENERATED from
 * `package.json` + `src/core/client_libs/registry.ts` by
 * `scripts/lib/client_lib_versions.ts` (`bun run libs:gen`). This gate re-renders
 * them and demands BYTE IDENTITY with the page on disk, so a bumped pin cannot
 * leave a stale row behind.
 *
 * WHY THIS EXISTS. The table was prose. Eight npm rows were stale when re-measured
 * on 2026-08-28 (the page then said so out loud, and gated only its vendored rows);
 * five more — three, geoman, turf, highlightjs, mocha — had drifted again by
 * 2026-10-02. A page that names a version nobody installed tells an institution
 * auditing its exposure the wrong thing. The vendored rows stay hand-written and
 * are held to vendor/vendor_manifest.json by vendor_advisory_tripwire.
 *
 * DB-free and fs-only (reads two files, imports the registry): hermetic tier.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	beginMark,
	DOC_PATH,
	endMark,
	npmRows,
	type PackageJsonPins,
	REGIONS,
	readPackageJson,
	renderNpmRegion,
	renderPage,
	spliceRegion,
} from '../../scripts/lib/client_lib_versions.ts';
import { CLIENT_LIBS, type ClientLib } from '../../src/core/client_libs/registry.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const page = (): string => readFileSync(join(REPO_ROOT, DOC_PATH), 'utf8');
const pkg = (): PackageJsonPins => readPackageJson(REPO_ROOT);

describe('client-lib versions doc: generated from package.json + the registry', () => {
	test('the page on disk equals its re-render, byte for byte', () => {
		const current = page();
		// Diffing a line list names the drifted row instead of dumping two whole pages.
		const rendered = renderPage(current, CLIENT_LIBS, pkg());
		expect(current.split('\n'), `${DOC_PATH} is stale — run: bun run libs:gen`).toEqual(
			rendered.split('\n'),
		);
		expect(current === rendered).toBe(true);
	});

	test('every region marker is present exactly once (a lost region is red, not skipped)', () => {
		const text = page();
		for (const region of REGIONS) {
			expect(text.split(beginMark(region)).length - 1, region).toBe(1);
			expect(text.split(endMark(region)).length - 1, region).toBe(1);
		}
	});

	test('the npm table is TOTAL over the registry and states package.json pins', () => {
		// Anti-vacuity against the rendered page, not the renderer: every npm registry id
		// has a row in the region on disk, and the row's version cell is the pin.
		const text = page();
		const region = text.slice(
			text.indexOf(beginMark('client-libs:npm')),
			text.indexOf(endMark('client-libs:npm')),
		);
		const cells = new Map<string, string>();
		for (const line of region.split('\n')) {
			const m = /^\|\s*([a-z0-9-]+)\s*\|\s*`([^`]+)`\s*\|\s*([^|\s]+)\s*\|/.exec(line);
			if (m !== null) cells.set(m[1] as string, m[3] as string);
		}
		const npmIds = Object.entries(CLIENT_LIBS)
			.filter(([, l]) => l.source === 'npm')
			.map(([id]) => id);
		expect(npmIds.length, 'the registry lost its npm libs — a scan over nothing').toBeGreaterThan(
			10,
		);
		expect([...cells.keys()].sort()).toEqual([...npmIds].sort());

		const pins = pkg();
		for (const id of npmIds) {
			const name = (CLIENT_LIBS[id] as ClientLib).base.slice('node_modules/'.length);
			const pin = pins.dependencies?.[name] ?? pins.devDependencies?.[name];
			expect(cells.get(id), `${id} (${name})`).toBe(pin);
		}
	});
});

describe('client-lib versions doc: the renderer refuses what it cannot state truthfully', () => {
	const lib = (over: Partial<ClientLib> = {}): Record<string, ClientLib> => ({
		x: { base: 'node_modules/zz-pkg', source: 'npm', probe: 'index.js', ...over },
	});

	test('CONSTRUCTED RED — a bumped pin with a stale page is a diff', () => {
		const stale = page();
		const pins = pkg();
		const bumped: PackageJsonPins = {
			...pins,
			dependencies: { ...pins.dependencies, leaflet: '99.0.0' },
		};
		const rendered = renderPage(stale, CLIENT_LIBS, bumped);
		expect(rendered).not.toBe(stale);
		expect(rendered).toContain('| leaflet | `leaflet` | 99.0.0 |');
	});

	test('CONSTRUCTED RED — an npm lib with no pin throws instead of vanishing', () => {
		expect(() => npmRows(lib(), { dependencies: {} })).toThrow('not pinned');
	});

	test('CONSTRUCTED RED — a range pin throws (the table states versions, not ranges)', () => {
		expect(() => npmRows(lib(), { dependencies: { 'zz-pkg': '^1.2.3' } })).toThrow(
			'not an exact version',
		);
	});

	test('CONSTRUCTED RED — a package in both dependency maps throws', () => {
		expect(() =>
			npmRows(lib(), {
				dependencies: { 'zz-pkg': '1.0.0' },
				devDependencies: { 'zz-pkg': '1.0.0' },
			}),
		).toThrow('BOTH');
	});

	test('a devDependency renders as such; a vendor lib is not an npm row', () => {
		const rows = npmRows(
			{ ...lib(), v: { base: 'vendor/v', source: 'vendor', probe: 'a.js', reason: 'r' } },
			{ devDependencies: { 'zz-pkg': '2.0.0-rc.1' } },
		);
		expect(rows).toEqual([
			{ id: 'x', pkg: 'zz-pkg', version: '2.0.0-rc.1', installedAs: 'devDependency', note: '' },
		]);
		expect(
			renderNpmRegion(lib({ note: 'a | b' }), { dependencies: { 'zz-pkg': '1.0.0' } }),
		).toContain('| x | `zz-pkg` | 1.0.0 | dependency | a \\| b |');
	});

	test('CONSTRUCTED RED — a missing or duplicated marker throws', () => {
		const r = renderNpmRegion(lib(), { dependencies: { 'zz-pkg': '1.0.0' } });
		expect(() => spliceRegion('no markers here', 'client-libs:npm', r)).toThrow('exactly one');
		const once = `${beginMark('client-libs:npm')}\n${endMark('client-libs:npm')}`;
		expect(() => spliceRegion(`${once}\n${once}`, 'client-libs:npm', r)).toThrow('exactly one');
		const swapped = `${endMark('client-libs:npm')}\n${beginMark('client-libs:npm')}`;
		expect(() => spliceRegion(swapped, 'client-libs:npm', r)).toThrow('precedes');
	});
});
