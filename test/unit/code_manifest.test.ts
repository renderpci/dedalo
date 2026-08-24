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

	test('a -dev build on disk is NEVER advertised to a consumer that did not ask for one', () => {
		// The property behind the two channels, NARROWED on 2026-08-24: a
		// developer build is servable by URL (code_serving.test.ts) but is never
		// OFFERED unless the consumer asked for the dev channel AND this master
		// opted in. Here it does neither, so the manifest stays silent about it.
		const devZip = join(FILES_DIR, '7', '7.1', '7.1.0-dev.zip');
		writeFileSync(devZip, 'PK-dev');
		try {
			const info = buildCodeUpdateInfo({
				clientVersion: [7, 0, 0],
				serverVersion: [7, 1, 0],
				codeFilesDir: FILES_DIR,
				publicBaseUrl: 'http://m',
				info: { ...BASE_INFO },
				catalog: catalogOf(target(7, 0, 1), target(7, 1, 0)),
			});
			// only the published 7.0.1.zip is advertised; no url ever names -dev
			expect(info.files.map((f) => f.version)).toEqual(['7.0.1']);
			for (const f of info.files) expect(f.url.includes('-dev')).toBe(false);
		} finally {
			rmSync(devZip, { force: true });
		}
	});

	// -----------------------------------------------------------------------
	// THE DEV CHANNEL (2026-08-24). Two independent switches must both be on:
	// the consumer ASKS (channel:'dev' — its panel switch) and this master has
	// OPTED IN (DEDALO_CODE_SERVER_DEV_CHANNEL). A public code server that never
	// set the key answers identically no matter what it is asked.
	// -----------------------------------------------------------------------
	describe('the dev channel', () => {
		const devZip = join(FILES_DIR, '7', '7.0', '7.0.0-dev.zip');

		beforeAll(() => {
			writeFileSync(devZip, 'PK-dev');
			writeFileSync(`${devZip}.sha256`, `${'f'.repeat(64)}  7.0.0-dev.zip\n`);
		});
		afterAll(() => {
			rmSync(devZip, { force: true });
			rmSync(`${devZip}.sha256`, { force: true });
		});

		function manifest(options: { channel?: 'master' | 'dev'; devChannelEnabled?: boolean }) {
			return buildCodeUpdateInfo({
				clientVersion: [7, 0, 0],
				serverVersion: [7, 0, 0],
				codeFilesDir: FILES_DIR,
				publicBaseUrl: 'http://m',
				info: { ...BASE_INFO },
				catalog: catalogOf(target(7, 0, 1)),
				...options,
			});
		}

		test('advertises the SAME-VERSION dev build — the whole point of the channel', () => {
			const info = manifest({ channel: 'dev', devChannelEnabled: true });
			const dev = info.files.find((f) => f.url.includes('-dev'));
			expect(dev).toBeDefined();
			// the consumer runs 7.0.0 and is offered 7.0.0 — no version bump, which
			// is exactly what an unreleased branch build has to offer.
			expect(dev?.version).toBe('7.0.0');
			expect(dev?.url).toBe('http://m/7.0.0/7.0.0-dev.zip');
			expect(dev?.channel).toBe('dev');
			// the digest stays mandatory: an archive with no sidecar is not installable
			expect(dev?.sha256).toBe('f'.repeat(64));
		});

		test('the dev build is listed FIRST — a consumer that asked for it means it', () => {
			const info = manifest({ channel: 'dev', devChannelEnabled: true });
			expect(info.files[0]?.url.includes('-dev')).toBe(true);
			// …and the published rung is still offered alongside it
			expect(info.files.map((f) => f.version)).toContain('7.0.1');
		});

		test('a master that did NOT opt in ignores the ask entirely', () => {
			const info = manifest({ channel: 'dev', devChannelEnabled: false });
			expect(info.files.map((f) => f.url).some((u) => u.includes('-dev'))).toBe(false);
		});

		test('an opted-in master still answers a RELEASE-channel ask with releases only', () => {
			const info = manifest({ channel: 'master', devChannelEnabled: true });
			expect(info.files.map((f) => f.url).some((u) => u.includes('-dev'))).toBe(false);
		});

		test('the release manifest is UNCHANGED by the feature: no channel key on a published item', () => {
			const info = manifest({});
			expect(info.files.map((f) => f.version)).toEqual(['7.0.1']);
			expect(Object.hasOwn(info.files[0] as object, 'channel')).toBe(false);
		});
	});

	test('force_update_mode never appears on the wire (WC-2026-08-23-update-mode-clean-only)', () => {
		// The clean-only pipeline retired the key: clean is the ONLY install
		// mode, so the manifest has nothing for the client to branch on. Pin the
		// ABSENCE — a resurrected key would be a silent wire divergence.
		const info = buildCodeUpdateInfo({
			clientVersion: [7, 0, 0],
			serverVersion: [7, 0, 0],
			codeFilesDir: FILES_DIR,
			publicBaseUrl: 'http://m',
			info: { ...BASE_INFO },
			catalog: catalogOf(target(7, 0, 1)),
		});
		expect(info.files.length).toBe(1);
		expect(Object.hasOwn(info.files[0] as object, 'force_update_mode')).toBe(false);
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

	test('a MIS-KEYED catalog still advertises the file (the walk keys on the triple, not the key)', () => {
		// linearUpgradeTargets iterates Object.values, so an odd key still
		// advertises its rung — the key shape is a convention, not a gate.
		const misKeyed: Record<string, UpdateDescriptor> = {
			'7.0.1': target(7, 0, 1),
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

	test('the -dev channel resolves through the SAME confinement (servable, never advertised)', () => {
		// `code_build_plan.ts` names non-master builds `<v>-dev.zip`; the grammar
		// admits exactly that fixed token so code_serving.ts can serve a developer
		// build for manual testing. The suffix is a fixed sanitized token — no
		// ref bytes reach the path, so confinement is unchanged.
		expect(codeReleasePath(FILES_DIR, [7, 0, 1], '7.0.1-dev.zip')).toBe(
			join(FILES_DIR, '7', '7.0', '7.0.1-dev.zip'),
		);
		for (const bad of ['7.0.1-devx.zip', '7.0.1-dev.tar', '../7.0.1-dev.zip', '7.0.1-DEV.zip']) {
			expect(codeReleasePath(FILES_DIR, [7, 0, 1], bad)).toBeNull();
		}
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
