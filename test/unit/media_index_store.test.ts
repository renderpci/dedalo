/**
 * Native media_index marker store (S2-31 port — oracle:
 * v7/master_dedalo/diffusion/api/v1/lib/media_index.ts + its
 * test/media_index.test.ts). The .publication/ filesystem allowlist the web
 * server stats to authorize anonymous media access:
 *
 *   pub/{section_tipo}_{section_id}   union across all dbs/tables
 *   dbs/{db}/{table}/{key}            ground truth per publication target
 *   auth/{cookie}                     PHP-owned, NEVER touched here
 *
 * Everything runs against a per-test temp dir via the guarded
 * overrideMediaIndexBaseForTests seam — no real media tree, no MariaDB
 * (rebuild's SELECT is injected through its fetchIds test seam).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	applyTableState,
	getMediaIndexStatus,
	makeMarkerKey,
	overrideMediaIndexBaseForTests,
	rebuildMediaIndexStore,
	reconcileMediaIndex,
	validateRebuildTargets,
} from '../../src/diffusion/targets/mediastore/media_index.ts';

let base: string;

async function fileExists(path: string): Promise<boolean> {
	try {
		await fs.access(path);
		return true;
	} catch {
		return false;
	}
}

beforeEach(async () => {
	base = await fs.mkdtemp(join(tmpdir(), 'dedalo_ts_media_index_'));
	overrideMediaIndexBaseForTests(base);
});

afterEach(async () => {
	overrideMediaIndexBaseForTests(null);
	await fs.rm(base, { recursive: true, force: true });
});

describe('media_index marker store (S2-31 native port)', () => {
	test('makeMarkerKey validates the {tipo}_{id} grammar', () => {
		expect(makeMarkerKey('rsc167', 90001)).toBe('rsc167_90001');
		expect(makeMarkerKey('rsc167', '90001')).toBe('rsc167_90001');
		expect(makeMarkerKey('../evil', 1)).toBeNull();
		expect(makeMarkerKey('rsc167', 'DROP TABLE')).toBeNull();
		expect(makeMarkerKey('', 1)).toBeNull();
	});

	test('publish touches dbs/ ground truth + pub/ union; unpublish removes both', async () => {
		const applied = await applyTableState('web_db', 'rsc167_table', 'rsc167', [90001, 90002], []);
		expect(applied).toEqual({ applied: 2, skipped: [] });
		expect(await fileExists(join(base, 'dbs/web_db/rsc167_table/rsc167_90001'))).toBe(true);
		expect(await fileExists(join(base, 'pub/rsc167_90001'))).toBe(true);
		expect(await fileExists(join(base, 'pub/rsc167_90002'))).toBe(true);

		const removed = await applyTableState('web_db', 'rsc167_table', 'rsc167', [], [90001]);
		expect(removed.applied).toBe(1);
		expect(await fileExists(join(base, 'dbs/web_db/rsc167_table/rsc167_90001'))).toBe(false);
		expect(await fileExists(join(base, 'pub/rsc167_90001'))).toBe(false);
		// the sibling id is untouched
		expect(await fileExists(join(base, 'pub/rsc167_90002'))).toBe(true);
	});

	test('pub/ union survives while ANY other table still publishes the key', async () => {
		await applyTableState('web_db', 'table_a', 'rsc167', [7], []);
		await applyTableState('other_db', 'table_b', 'rsc167', [7], []);

		await applyTableState('web_db', 'table_a', 'rsc167', [], [7]);
		// still published through other_db/table_b
		expect(await fileExists(join(base, 'pub/rsc167_7'))).toBe(true);

		await applyTableState('other_db', 'table_b', 'rsc167', [], [7]);
		expect(await fileExists(join(base, 'pub/rsc167_7'))).toBe(false);
	});

	test('scratch tables (dedalo_ts_*) never touch the allowlist — markers only ever widen access', async () => {
		const result = await applyTableState('web_db', 'dedalo_ts_test_writer', 'rsc167', [1], []);
		expect(result).toEqual({ applied: 0, skipped: [] });
		expect(await fileExists(join(base, 'pub/rsc167_1'))).toBe(false);
		expect(await fileExists(join(base, 'dbs/web_db/dedalo_ts_test_writer'))).toBe(false);
	});

	test('invalid keys are skipped, never thrown; invalid db/table names refuse the call', async () => {
		const result = await applyTableState('web_db', 't', 'rsc167', [1, 'DROP'], []);
		expect(result.applied).toBe(1);
		expect(result.skipped).toEqual(['rsc167_DROP']);

		const bad = await applyTableState('../escape', 't', 'rsc167', [1], []);
		expect(bad).toEqual({ applied: 0, skipped: ['invalid db/table name: ../escape.t'] });
		expect(await fileExists(join(base, 'pub/rsc167_1'))).toBe(true); // from the first call only
	});

	test('disabled store (no media path) is a total no-op', async () => {
		overrideMediaIndexBaseForTests(null);
		// config.media.rootPath may be set in this dev env — only assert the
		// no-op contract when the feature is actually off.
		const status = await getMediaIndexStatus();
		if (!status.enabled) {
			expect(await applyTableState('db', 't', 'rsc167', [1], [])).toEqual({
				applied: 0,
				skipped: [],
			});
			expect(await reconcileMediaIndex()).toBeNull();
		}
	});

	test('reconcile heals pub/ from the dbs/ ground truth in both directions', async () => {
		// ground truth: one real marker; pub/: one stale + missing the real one
		await fs.mkdir(join(base, 'dbs/web_db/t'), { recursive: true });
		await fs.writeFile(join(base, 'dbs/web_db/t/rsc167_1'), '');
		await fs.mkdir(join(base, 'pub'), { recursive: true });
		await fs.writeFile(join(base, 'pub/rsc167_999'), '');

		const healed = await reconcileMediaIndex();
		expect(healed).toEqual({ added: 1, removed: 1 });
		expect(await fileExists(join(base, 'pub/rsc167_1'))).toBe(true);
		expect(await fileExists(join(base, 'pub/rsc167_999'))).toBe(false);
	});

	test('auth/ (PHP-owned login markers) is never touched', async () => {
		await fs.mkdir(join(base, 'auth'), { recursive: true });
		await fs.writeFile(join(base, 'auth/cookie_abc'), '');

		await applyTableState('web_db', 't', 'rsc167', [1], []);
		await reconcileMediaIndex();
		await rebuildMediaIndexStore([], async () => []);

		expect(await fileExists(join(base, 'auth/cookie_abc'))).toBe(true);
	});

	test('getMediaIndexStatus reports counts + databases', async () => {
		await applyTableState('web_db', 't', 'rsc167', [1, 2], []);
		await fs.mkdir(join(base, 'auth'), { recursive: true });
		await fs.writeFile(join(base, 'auth/cookie_abc'), '');

		const status = await getMediaIndexStatus();
		expect(status.enabled).toBe(true);
		expect(status.base).toBe(base);
		expect(status.pub_markers).toBe(2);
		expect(status.auth_markers).toBe(1);
		expect(status.databases).toEqual(['web_db']);
	});

	test('validateRebuildTargets: shape errors named, empty array valid', () => {
		expect(validateRebuildTargets([])).toBeNull();
		expect(validateRebuildTargets('nope')).toBe('Missing targets array');
		expect(validateRebuildTargets([{ table_name: 't', section_tipo: 'x' }])).toBe(
			'Invalid target: missing database_name',
		);
		expect(
			validateRebuildTargets([{ database_name: 'db', table_name: 't', section_tipo: '' }]),
		).toBe('Invalid target: missing section_tipo for table "t"');
		expect(
			validateRebuildTargets([{ database_name: 'db', table_name: 't', section_tipo: 'rsc167' }]),
		).toBeNull();
	});

	test('rebuild diff-syncs each target (create missing, unlink extras — never a wipe)', async () => {
		// pre-state: one stale marker + one survivor
		await applyTableState('web_db', 't', 'rsc167', [1, 999], []);

		const result = await rebuildMediaIndexStore(
			[{ database_name: 'web_db', table_name: 't', section_tipo: 'rsc167' }],
			async () => [1, 2], // DB truth: 1 stays, 2 is new, 999 is gone
		);
		expect(result.result).toBe(true);
		expect(result.markers).toBe(2);
		expect(await fileExists(join(base, 'pub/rsc167_1'))).toBe(true);
		expect(await fileExists(join(base, 'pub/rsc167_2'))).toBe(true);
		expect(await fileExists(join(base, 'pub/rsc167_999'))).toBe(false);
	});

	test('rebuild prunes per-table dirs no longer covered by the ontology targets', async () => {
		await applyTableState('web_db', 'stale_table', 'oh21', [5], []);

		const result = await rebuildMediaIndexStore(
			[{ database_name: 'web_db', table_name: 't', section_tipo: 'rsc167' }],
			async () => [1],
		);
		expect(result.result).toBe(true);
		expect(await fileExists(join(base, 'dbs/web_db/stale_table'))).toBe(false);
		expect(await fileExists(join(base, 'pub/oh21_5'))).toBe(false); // union pruned too
		expect(await fileExists(join(base, 'pub/rsc167_1'))).toBe(true);
	});

	test('rebuild tolerates missing table/db (errno 1146/1049 → empty set) but keeps markers on real errors', async () => {
		await applyTableState('web_db', 'gone', 'rsc167', [1], []);
		const missingTable = Object.assign(new Error('no table'), { errno: 1146 });
		const cleared = await rebuildMediaIndexStore(
			[{ database_name: 'web_db', table_name: 'gone', section_tipo: 'rsc167' }],
			async () => {
				throw missingTable;
			},
		);
		expect(cleared.result).toBe(true);
		expect(await fileExists(join(base, 'pub/rsc167_1'))).toBe(false); // nothing published there

		await applyTableState('web_db', 'flaky', 'rsc167', [2], []);
		const failed = await rebuildMediaIndexStore(
			[{ database_name: 'web_db', table_name: 'flaky', section_tipo: 'rsc167' }],
			async () => {
				throw new Error('connection refused');
			},
		);
		expect(failed.result).toBe(false);
		expect(failed.errors).toEqual(['web_db.flaky: connection refused']);
		// fail-closed for CHANGES, not deletions: existing markers survive
		expect(await fileExists(join(base, 'pub/rsc167_2'))).toBe(true);
	});

	test('empty targets array clears the store (no publication targets in the ontology)', async () => {
		await applyTableState('web_db', 't', 'rsc167', [1], []);
		const result = await rebuildMediaIndexStore([], async () => []);
		expect(result.result).toBe(true);
		expect(result.markers).toBe(0);
		expect(await fileExists(join(base, 'pub/rsc167_1'))).toBe(false);
	});

	test('override seam refuses non-temp paths', () => {
		expect(() => overrideMediaIndexBaseForTests('/Users/someone/media')).toThrow();
	});
});
