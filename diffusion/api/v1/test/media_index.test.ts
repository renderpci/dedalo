/**
 * MEDIA_INDEX TESTS
 * Marker-store semantics: per-table ground truth, pub/ union recompute,
 * key sanitization (fail-closed), reconcile and rebuild diff-sync.
 * All filesystem-only (no MariaDB): rebuild() SQL paths are covered by
 * the integration suite.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import { existsSync, mkdtempSync } from 'fs';
import path from 'path';
import os from 'os';

import {
	get_base,
	make_key,
	apply_table_state,
	reconcile,
	validate_rebuild_targets,
} from '../lib/media_index';

let tmp_media_path: string;
let saved_env: string | undefined;

beforeEach(() => {
	saved_env = process.env.DEDALO_MEDIA_PATH;
	tmp_media_path = mkdtempSync(path.join(os.tmpdir(), 'dd_media_index_'));
	process.env.DEDALO_MEDIA_PATH = tmp_media_path;
});

afterEach(async () => {
	if (saved_env === undefined) {
		delete process.env.DEDALO_MEDIA_PATH;
	} else {
		process.env.DEDALO_MEDIA_PATH = saved_env;
	}
	await fs.rm(tmp_media_path, { recursive: true, force: true });
});

const pub  = (key: string) => path.join(tmp_media_path, '.publication', 'pub', key);
const tbl  = (db: string, table: string, key: string) => path.join(tmp_media_path, '.publication', 'dbs', db, table, key);



describe('media_index basics', () => {

	test('get_base returns null when env unset or relative', () => {
		delete process.env.DEDALO_MEDIA_PATH;
		expect(get_base()).toBeNull();
		process.env.DEDALO_MEDIA_PATH = 'relative/path';
		expect(get_base()).toBeNull();
		process.env.DEDALO_MEDIA_PATH = tmp_media_path;
		expect(get_base()).toBe(path.join(tmp_media_path, '.publication'));
	});

	test('make_key validates the section key grammar', () => {
		expect(make_key('rsc167', 2)).toBe('rsc167_2');
		expect(make_key('test3', '15')).toBe('test3_15');
		// traversal / injection attempts are rejected, never sanitized
		expect(make_key('../etc', 1)).toBeNull();
		expect(make_key('rsc167/x', 1)).toBeNull();
		expect(make_key('rsc167', 'a' as any)).toBeNull();
		expect(make_key('', 1)).toBeNull();
	});

	test('all operations are no-ops when DEDALO_MEDIA_PATH is unset', async () => {
		delete process.env.DEDALO_MEDIA_PATH;
		const result = await apply_table_state('web_a', 'interview', 'rsc167', [1], []);
		expect(result).toEqual({ applied: 0, skipped: [] });
		expect(await reconcile()).toBeNull();
		expect(existsSync(path.join(tmp_media_path, '.publication'))).toBe(false);
	});
});



describe('apply_table_state', () => {

	test('publish creates table marker and pub union marker', async () => {
		const result = await apply_table_state('web_a', 'interview', 'rsc167', [2], []);
		expect(result.applied).toBe(1);
		expect(existsSync(tbl('web_a', 'interview', 'rsc167_2'))).toBe(true);
		expect(existsSync(pub('rsc167_2'))).toBe(true);
	});

	test('unpublish removes pub marker only when no other db/table holds the key', async () => {
		await apply_table_state('web_a', 'interview', 'rsc167', [2], []);
		await apply_table_state('web_b', 'audiovisual', 'rsc167', [2], []);

		// unpublish from one db: union survives
		await apply_table_state('web_a', 'interview', 'rsc167', [], [2]);
		expect(existsSync(tbl('web_a', 'interview', 'rsc167_2'))).toBe(false);
		expect(existsSync(pub('rsc167_2'))).toBe(true);

		// unpublish from the last db: union goes
		await apply_table_state('web_b', 'audiovisual', 'rsc167', [], [2]);
		expect(existsSync(pub('rsc167_2'))).toBe(false);
	});

	test('publish and unpublish in one call (diffuse with deletions)', async () => {
		const result = await apply_table_state('web_a', 'interview', 'rsc167', [1, 2], [3]);
		expect(result.applied).toBe(3);
		expect(existsSync(pub('rsc167_1'))).toBe(true);
		expect(existsSync(pub('rsc167_2'))).toBe(true);
		expect(existsSync(pub('rsc167_3'))).toBe(false);
	});

	test('invalid keys are skipped, valid ones still applied', async () => {
		const result = await apply_table_state('web_a', 'interview', '../traversal', [1], []);
		expect(result.applied).toBe(0);
		expect(result.skipped).toEqual(['../traversal_1']);
		expect(existsSync(pub('rsc167_1'))).toBe(false);

		const mixed = await apply_table_state('web_a', 'interview', 'rsc167', [1, 'bad/id' as any], []);
		expect(mixed.applied).toBe(1);
		expect(mixed.skipped.length).toBe(1);
		expect(existsSync(pub('rsc167_1'))).toBe(true);
	});

	test('invalid db/table names are rejected entirely', async () => {
		const result = await apply_table_state('web/a', 'interview', 'rsc167', [1], []);
		expect(result.applied).toBe(0);
		expect(result.skipped.length).toBe(1);
		expect(existsSync(path.join(tmp_media_path, '.publication', 'dbs'))).toBe(false);
	});

	test('idempotent: re-publishing and re-unpublishing converge', async () => {
		await apply_table_state('web_a', 'interview', 'rsc167', [2], []);
		await apply_table_state('web_a', 'interview', 'rsc167', [2], []);
		expect(existsSync(pub('rsc167_2'))).toBe(true);
		await apply_table_state('web_a', 'interview', 'rsc167', [], [2]);
		await apply_table_state('web_a', 'interview', 'rsc167', [], [2]);
		expect(existsSync(pub('rsc167_2'))).toBe(false);
	});

	test('concurrency storm: final union matches per-table ground truth', async () => {
		// interleave publish/unpublish over the same keys from two "databases"
		const ops: Promise<unknown>[] = [];
		for (let i = 0; i < 25; i++) {
			ops.push(apply_table_state('web_a', 'interview', 'rsc167', [1], []));
			ops.push(apply_table_state('web_a', 'interview', 'rsc167', [], [1]));
			ops.push(apply_table_state('web_b', 'audiovisual', 'rsc167', [1], []));
		}
		// deterministic last word: published in web_b, unpublished in web_a
		await Promise.all(ops);
		await apply_table_state('web_a', 'interview', 'rsc167', [], [1]);
		await apply_table_state('web_b', 'audiovisual', 'rsc167', [1], []);

		const truth = existsSync(tbl('web_a', 'interview', 'rsc167_1'))
			|| existsSync(tbl('web_b', 'audiovisual', 'rsc167_1'));
		expect(existsSync(pub('rsc167_1'))).toBe(truth);
		expect(truth).toBe(true);
	});
});



describe('reconcile', () => {

	test('derives pub/ from dbs/ ground truth (adds missing, removes stale)', async () => {
		// ground truth: two keys published
		await apply_table_state('web_a', 'interview', 'rsc167', [1, 2], []);

		// simulate drift: stale pub marker + missing pub marker
		await fs.writeFile(pub('rsc167_99'), '');           // stale (no ground truth)
		await fs.unlink(pub('rsc167_2'));                   // missing (has ground truth)

		const result = await reconcile();
		expect(result).toEqual({ added: 1, removed: 1 });
		expect(existsSync(pub('rsc167_1'))).toBe(true);
		expect(existsSync(pub('rsc167_2'))).toBe(true);
		expect(existsSync(pub('rsc167_99'))).toBe(false);
	});

	test('empty store reconciles to nothing', async () => {
		const result = await reconcile();
		expect(result).toEqual({ added: 0, removed: 0 });
	});
});



describe('validate_rebuild_targets', () => {

	test('accepts a valid target list (and the empty list)', () => {
		expect(validate_rebuild_targets([
			{ database_name: 'web_a', table_name: 'interview', section_tipo: 'rsc167' },
		])).toBeNull();
		expect(validate_rebuild_targets([])).toBeNull();
	});

	test('rejects malformed targets', () => {
		expect(validate_rebuild_targets(undefined)).not.toBeNull();
		expect(validate_rebuild_targets([{ table_name: 'interview', section_tipo: 'x' }])).not.toBeNull();
		expect(validate_rebuild_targets([{ database_name: 'web_a', section_tipo: 'x' }])).not.toBeNull();
		expect(validate_rebuild_targets([{ database_name: 'web_a', table_name: 'interview' }])).not.toBeNull();
		// names that would escape the dirs are rejected
		expect(validate_rebuild_targets([{ database_name: '../x', table_name: 'interview', section_tipo: 'a1' }])).not.toBeNull();
	});
});
