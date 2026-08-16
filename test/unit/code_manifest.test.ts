/**
 * Code-update DISCOVERY manifest (UPDATE_PROCESS Phase 4) — the linear
 * upgrade-path walk and the release-manifest builder, driven through the
 * INJECTABLE `catalog` parameter.
 *
 * WHY THIS FILE EXISTS: the live `UPDATE_CATALOG` is `Object.freeze({})`, so
 * every assertion made against it is vacuous — the `for` body never runs and
 * `toEqual([])` cannot go red for any implementation. `code_update.test.ts`
 * keeps ONE empty-catalog case as the 7.0.0-is-current fact; the branch
 * coverage of both functions lives here, on synthetic catalogs.
 *
 * Catalog keys are the concatenated target triple ('701' = 7.0.1 — the
 * `catalogKeyOf` convention); `buildCodeUpdateInfo` re-derives that key from
 * the triple, so a mis-keyed catalog loses its descriptor (asserted below).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { UpdateDescriptor } from '../../src/core/update/catalog.ts';
import {
	buildCodeUpdateInfo,
	codeReleasePath,
	linearUpgradeTargets,
} from '../../src/core/update/code_manifest.ts';

/** A minimal descriptor: only the target triple drives the linear walk. */
function target(
	major: number,
	medium: number,
	minor: number,
	extra: Partial<UpdateDescriptor> = {},
): UpdateDescriptor {
	return {
		versionMajor: major,
		versionMedium: medium,
		versionMinor: minor,
		// updateFrom* are the DATA-catalog matcher; the code manifest ignores
		// them entirely — pinned to the previous rung only for realism.
		updateFromMajor: major,
		updateFromMedium: medium,
		updateFromMinor: Math.max(0, minor - 1),
		...extra,
	};
}

/** '701' — the same key shape `catalogKeyOf`/`buildCodeUpdateInfo` compute. */
function catalogOf(...descriptors: UpdateDescriptor[]): Record<string, UpdateDescriptor> {
	const catalog: Record<string, UpdateDescriptor> = {};
	for (const d of descriptors) {
		catalog[`${d.versionMajor}${d.versionMedium}${d.versionMinor}`] = d;
	}
	return catalog;
}

describe('linearUpgradeTargets (the linear walk, injected catalog)', () => {
	test('next patch within the current minor is advertised, and only once consumed', () => {
		const catalog = catalogOf(target(7, 0, 1));
		expect(linearUpgradeTargets([7, 0, 0], catalog)).toEqual([[7, 0, 1]]);
		// already ON 7.0.1: the patch rung no longer matches (minor+1 = 2) and
		// there is no minor/major boundary — nothing to advertise.
		expect(linearUpgradeTargets([7, 0, 1], catalog)).toEqual([]);
	});

	test('the next minor MASKS the next major boundary (exhaust 7.x before 8.0.0)', () => {
		// The whole point of the walk: a 7.0.0 client must be offered 7.1.0,
		// never 8.0.0, while a 7.x rung still exists.
		const both = catalogOf(target(7, 1, 0), target(8, 0, 0));
		expect(linearUpgradeTargets([7, 0, 0], both)).toEqual([[7, 1, 0]]);
		// drop the 7.x rung and the major boundary becomes visible
		const majorOnly = catalogOf(target(8, 0, 0));
		expect(linearUpgradeTargets([7, 0, 0], majorOnly)).toEqual([[8, 0, 0]]);
	});

	test('patch + minor are both advertised, sorted ascending', () => {
		// Insertion order is deliberately reversed to prove the final sort runs
		// (the client walks the list in order and would install 7.1.0 first).
		const catalog: Record<string, UpdateDescriptor> = {
			'710': target(7, 1, 0),
			'701': target(7, 0, 1),
		};
		expect(linearUpgradeTargets([7, 0, 0], catalog)).toEqual([
			[7, 0, 1],
			[7, 1, 0],
		]);
	});

	test('a short client version defaults the missing medium/minor to 0', () => {
		// `clientVersion[1] ?? 0` / `[2] ?? 0`: a bare [7] must behave as 7.0.0.
		const catalog = catalogOf(target(7, 1, 0));
		expect(linearUpgradeTargets([7], catalog)).toEqual([[7, 1, 0]]);
		const patch = catalogOf(target(7, 0, 1));
		expect(linearUpgradeTargets([7], patch)).toEqual([[7, 0, 1]]);
	});

	test('an empty client version is treated as 0.0.0 (clientMajor ?? 0)', () => {
		// `clientVersion[0] ?? 0`: only a 1.0.0 major boundary is reachable.
		expect(linearUpgradeTargets([], catalogOf(target(1, 0, 0)))).toEqual([[1, 0, 0]]);
		expect(linearUpgradeTargets([], catalogOf(target(7, 0, 0)))).toEqual([]);
	});

	test('off-path releases (behind, or a skipped major) are never advertised', () => {
		// 6.9.9 is behind; 9.0.0 is a major SKIP from 7.x — both must be invisible.
		const catalog = catalogOf(target(6, 9, 9), target(9, 0, 0));
		expect(linearUpgradeTargets([7, 0, 0], catalog)).toEqual([]);
	});

	test('a non-.0 minor and a non-.0.0 major are not boundaries', () => {
		// 7.1.3 / 8.0.1 fail the `=== 0` boundary tests; assertLinearUpgrade
		// would refuse them anyway ("must land on .0").
		const catalog = catalogOf(target(7, 1, 3), target(8, 0, 1));
		expect(linearUpgradeTargets([7, 0, 0], catalog)).toEqual([]);
	});

	test('the same triple under two catalog keys is deduped (D17 fixed 2026-08-09)', () => {
		// A patch rung reachable twice (e.g. a hand-edited/mis-keyed catalog)
		// used to be pushed once per descriptor: the old dedupe guard only
		// covered the nextMinor/nextMajor boundary — and that guard was dead,
		// because a boundary triple can never equal a patch triple. The dedupe
		// now runs over the whole target list, so a rung is advertised once.
		const duplicated: Record<string, UpdateDescriptor> = {
			'701': target(7, 0, 1),
			'701_alias': target(7, 0, 1),
		};
		const result = linearUpgradeTargets([7, 0, 0], duplicated);
		expect(result).toEqual([[7, 0, 1]]);
	});
});

const ROOT = join(
	process.env.TMPDIR ?? '/tmp',
	`dedalo_code_manifest_${process.pid}_${Math.random().toString(36).slice(2)}`,
);
/** <ROOT>/files/<major>/<major.minor>/<version>.zip — the release layout. */
const FILES_DIR = join(ROOT, 'files');

beforeAll(() => {
	mkdirSync(join(FILES_DIR, '7', '7.0'), { recursive: true });
	writeFileSync(join(FILES_DIR, '7', '7.0', '7.0.1.zip'), 'PK-not-a-real-zip');
	// 7.1.0.zip is deliberately NOT built: an advertised-but-missing release.
	mkdirSync(join(FILES_DIR, '7', '7.1'), { recursive: true });
});
afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

const BASE_INFO = { date: 'now', entity_id: 1, entity: 'e', host: 'h' } as const;

describe('buildCodeUpdateInfo (manifest assembly)', () => {
	test('advertises only the target whose archive EXISTS on disk', () => {
		const catalog = catalogOf(target(7, 0, 1), target(7, 1, 0));
		const info = buildCodeUpdateInfo({
			clientVersion: [7, 0, 0],
			serverVersion: [7, 1, 0],
			codeFilesDir: FILES_DIR,
			publicBaseUrl: 'http://master/code',
			info: { ...BASE_INFO },
			catalog,
		});
		// both 7.0.1 and 7.1.0 are on the linear path, but only 7.0.1.zip exists
		expect(info.files.length).toBe(1);
		const mtime = statSync(join(FILES_DIR, '7', '7.0', '7.0.1.zip')).mtimeMs;
		expect(info.files[0]).toEqual({
			version: '7.0.1',
			url: 'http://master/code/7.0.1/7.0.1.zip',
			date: new Date(mtime).toISOString(),
		});
		// info.version is the SERVER version, not the client's
		expect(info.info).toEqual({ version: '7.1.0', ...BASE_INFO });
	});

	test("the catalog's forceUpdateMode is carried as the WIRE key force_update_mode; null/undefined omit the KEY entirely", () => {
		// The client branches on key PRESENCE (a `force_update_mode: undefined`
		// would serialize away but still fail Object.hasOwn assertions here).
		const clean = buildCodeUpdateInfo({
			clientVersion: [7, 0, 0],
			serverVersion: [7, 0, 0],
			codeFilesDir: FILES_DIR,
			publicBaseUrl: 'http://m',
			info: { ...BASE_INFO },
			catalog: catalogOf(target(7, 0, 1, { forceUpdateMode: 'clean' })),
		});
		expect(clean.files[0]?.force_update_mode).toBe('clean');

		for (const mode of [null, undefined] as const) {
			const info = buildCodeUpdateInfo({
				clientVersion: [7, 0, 0],
				serverVersion: [7, 0, 0],
				codeFilesDir: FILES_DIR,
				publicBaseUrl: 'http://m',
				info: { ...BASE_INFO },
				catalog: catalogOf(target(7, 0, 1, { forceUpdateMode: mode })),
			});
			expect(info.files.length).toBe(1);
			expect(Object.hasOwn(info.files[0] as object, 'force_update_mode')).toBe(false);
		}
	});

	test('the sha256 SIDECAR is advertised; a missing or malformed one omits the key', () => {
		// The consumer refuses a release without a declared digest (code_update.ts),
		// so the manifest is the ONLY place that hash can come from: build writes
		// `<file>.zip.sha256`, this reads it back. Malformed sidecar → no key, which
		// surfaces as a loud refusal downstream rather than a skipped check.
		const catalog = catalogOf(target(7, 0, 1));
		const args = {
			clientVersion: [7, 0, 0],
			serverVersion: [7, 0, 1],
			codeFilesDir: FILES_DIR,
			publicBaseUrl: 'http://m',
			info: { ...BASE_INFO },
			catalog,
		} as const;
		const sidecar = join(FILES_DIR, '7', '7.0', '7.0.1.zip.sha256');
		const digest = 'b'.repeat(64);
		try {
			writeFileSync(sidecar, `${digest}  7.0.1.zip\n`);
			expect(buildCodeUpdateInfo({ ...args }).files[0]?.sha256).toBe(digest);

			for (const bad of ['', 'not-a-digest  7.0.1.zip\n', `${'B'.repeat(64)}  x\n`]) {
				writeFileSync(sidecar, bad);
				const item = buildCodeUpdateInfo({ ...args }).files[0] as object;
				expect(Object.hasOwn(item, 'sha256')).toBe(false);
			}
		} finally {
			rmSync(sidecar, { force: true });
		}
		expect(Object.hasOwn(buildCodeUpdateInfo({ ...args }).files[0] as object, 'sha256')).toBe(
			false,
		);
	});

	test('a MIS-KEYED catalog still advertises the file but loses force_update_mode', () => {
		// The descriptor lookup re-derives '701' from the triple; a catalog keyed
		// any other way resolves `undefined` and the `?.` branch drops the flag.
		const misKeyed: Record<string, UpdateDescriptor> = {
			'7.0.1': target(7, 0, 1, { forceUpdateMode: 'clean' }),
		};
		const info = buildCodeUpdateInfo({
			clientVersion: [7, 0, 0],
			serverVersion: [7, 0, 0],
			codeFilesDir: FILES_DIR,
			publicBaseUrl: 'http://m',
			info: { ...BASE_INFO },
			catalog: misKeyed,
		});
		expect(info.files.length).toBe(1);
		expect(Object.hasOwn(info.files[0] as object, 'force_update_mode')).toBe(false);
	});

	test('no codeFilesDir (or a missing one) advertises nothing, even with targets', () => {
		// A master that builds no releases must answer an EMPTY files list, not
		// throw — the client treats a throw as "update check failed".
		const catalog = catalogOf(target(7, 0, 1));
		for (const dir of [undefined, join(ROOT, 'does_not_exist')]) {
			const info = buildCodeUpdateInfo({
				clientVersion: [7, 0, 0],
				serverVersion: [7, 0, 0],
				codeFilesDir: dir,
				publicBaseUrl: 'http://m',
				info: { ...BASE_INFO },
				catalog,
			});
			expect(info.files).toEqual([]);
			expect(info.info.version).toBe('7.0.0');
		}
		// and the linear path being empty is equally quiet
		expect(
			buildCodeUpdateInfo({
				clientVersion: [7, 0, 1],
				serverVersion: [7, 0, 1],
				codeFilesDir: FILES_DIR,
				publicBaseUrl: 'http://m',
				info: { ...BASE_INFO },
				catalog,
			}).files,
		).toEqual([]);
	});
});

describe('codeReleasePath (filename-grammar gate + layout)', () => {
	test('a well-formed release name resolves to <dir>/<major>/<major.minor>/<file>', () => {
		expect(codeReleasePath(FILES_DIR, [7, 0, 1], '7.0.1.zip')).toBe(
			join(FILES_DIR, '7', '7.0', '7.0.1.zip'),
		);
	});

	test('anything that is not <n.n.n>.zip is refused (traversal, extension, non-numeric)', () => {
		// The regex is the ONLY gate that fires in practice — the directory
		// segments are built from numbers, so the resolve/startsWith confinement
		// check below it is unreachable via this entry point.
		for (const name of ['../../etc/passwd', '7.0.1.tar', 'a.b.c.zip', '7.0.1.zip.sh', '']) {
			expect(codeReleasePath(FILES_DIR, [7, 0, 1], name)).toBeNull();
		}
		// a traversal DISGUISED as a release name is still rejected by the regex
		expect(codeReleasePath(FILES_DIR, [7, 0, 1], '../7.0.1.zip')).toBeNull();
	});

	// The three cases below drive the SECOND gate — the resolve/startsWith
	// confinement — which the filename regex above can never reach. The triple
	// is typed `readonly number[]`, so only a caller that passes non-numeric
	// segments (a mis-parsed client version, a future caller that forwards
	// user input as the triple) gets there; the cast makes that reachable.
	// Without these, the whole `startsWith` line has zero assertion coverage
	// and any weakening of it stays green.
	function pathWithTriple(dir: string, triple: readonly unknown[], name: string): string | null {
		return codeReleasePath(dir, triple as readonly number[], name);
	}

	test('a triple segment that ESCAPES the release dir is refused', () => {
		// dir = join('/base', '..', '...') -> '/tmp/...' : fully outside the
		// configured release dir. Catches deletion of the confinement check.
		expect(pathWithTriple('/tmp/dedalo_base', ['..', ''], '7.0.1.zip')).toBeNull();
		expect(pathWithTriple('/tmp/dedalo_base', ['../../etc', 'x'], '7.0.1.zip')).toBeNull();
	});

	test('a SIBLING dir sharing the release dir as a string PREFIX is refused', () => {
		// The classic prefix hole: '/tmp/dedalo_base_evil/...' startsWith
		// '/tmp/dedalo_base' as a plain string, but is NOT inside it. Only the
		// trailing-separator form of the check rejects it — this case goes red
		// the moment `${resolve(dir)}${sep}` degrades to `resolve(dir)`.
		expect(pathWithTriple('/tmp/dedalo_base', ['../dedalo_base_evil', 0], '7.0.1.zip')).toBeNull();
		// same hole reached without '..' in the second segment
		expect(pathWithTriple('/tmp/dedalo_base', ['../dedalo_base_x', 9], '7.0.1.zip')).toBeNull();
	});

	test('a RELATIVE codeFilesDir is resolved on BOTH sides before comparing', () => {
		// The candidate is always absolute (resolve of the joined path); if the
		// prefix were compared unresolved ('rel_base') the check would reject
		// every legitimate release under a relative config value.
		const got = pathWithTriple('rel_base', [7, 0, 1], '7.0.1.zip');
		expect(got).toBe(join(process.cwd(), 'rel_base', '7', '7.0', '7.0.1.zip'));
	});
});
