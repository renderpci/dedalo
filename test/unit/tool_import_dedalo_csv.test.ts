/**
 * R2 gate: tool_import_dedalo_csv. Module loads with its 5 actions (import_files
 * backgroundRunnable). get_section_components_list is DB-verified (reuses the
 * verified get_section_elements_context). The conform/plan core is tested in
 * import_data / import_csv; the live CSV→DB execute drive is ledgered.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { mustGet } from '../helpers/assert.ts';

const SECTION = 'numisdata4';

describe('tool_import_dedalo_csv module', () => {
	test('loads with the 5 actions + import_files backgroundRunnable', async () => {
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		expect(loaded).not.toBeNull();
		const actions = loaded!.module.apiActions;
		expect(Object.keys(actions).sort()).toEqual([
			'delete_csv_file',
			'get_csv_files',
			'get_section_components_list',
			'import_files',
			'process_uploaded_file',
		]);
		expect(loaded!.module.backgroundRunnable).toEqual(['import_files']);
		expect(mustGet(actions.import_files, 'import_files').permission).toBe('section');
	});

	test('get_section_components_list returns {label,value,model}[] + top-level section label (client contract)', async () => {
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const principal = await resolvePrincipal(-1);
		const res = await mustGet(
			loaded!.module.apiActions.get_section_components_list,
			'get_section_components_list',
		).handler({
			principal,
			userId: -1,
			background: false,
			options: { section_tipo: SECTION },
		});
		expect(res.result).not.toBe(false);
		// The client reads response.result (→ list), response.label, response.msg.
		expect(typeof res.label).toBe('string');
		const list = res.result as Record<string, unknown>[];
		expect(Array.isArray(list)).toBe(true);
		expect(list.length).toBeGreaterThan(0);
		for (const el of list) {
			expect(typeof el.value).toBe('string'); // the tipo
			expect(typeof el.model).toBe('string');
			expect('label' in el).toBe(true);
		}
	});
});

describe('path traversal is REFUSED (fail-closed, canary-verified)', () => {
	// importDir() has no root-override seam, so these use a disposable user id
	// under the real media root (filesystem-only scratch; removed in afterAll).
	const SCRATCH_USER = 987654;
	const root = config.media.rootPath ?? '';
	const userDir = resolve(root, 'import/files', String(SCRATCH_USER));
	// Canary ONE level above the per-user dir: exactly the file a '../' escape
	// from delete_csv_file would move. It must survive every attempt below.
	const canary = resolve(root, 'import/files', `canary_${process.pid}.csv`);

	async function callAction(name: string, options: Record<string, unknown>) {
		const loaded = await getLoadedTool('tool_import_dedalo_csv');
		const handler = mustGet(loaded!.module.apiActions[name], name).handler;
		return handler({
			principal: await resolvePrincipal(-1),
			userId: SCRATCH_USER,
			background: false,
			options,
		});
	}

	beforeAll(() => {
		mkdirSync(userDir, { recursive: true });
		writeFileSync(canary, 'canary — must never be deleted/moved by a traversal');
	});
	afterAll(() => {
		rmSync(userDir, { recursive: true, force: true });
		rmSync(canary, { force: true });
		rmSync(resolve(root, config.media.upload.tmpSubdir, String(SCRATCH_USER)), {
			recursive: true,
			force: true,
		});
	});

	test('delete_csv_file refuses ../, absolute and %2f-encoded file_name (canary untouched)', async () => {
		for (const file_name of [
			`../canary_${process.pid}.csv`, // relative escape to the canary
			'../../../etc/passwd', // deep relative escape
			canary, // absolute path
			'/etc/passwd', // absolute system path
			`..%2fcanary_${process.pid}.csv`, // encoded '../' — must NOT be decoded into a traversal
			'..%2f..%2fetc%2fpasswd',
		]) {
			const res = await callAction('delete_csv_file', { file_name });
			expect(res.result).toBe(false); // refused via the error envelope, no throw
			expect(String(res.msg)).toStartWith('Error.');
		}
		expect(existsSync(canary)).toBe(true); // nothing outside the user dir was touched
		expect(existsSync('/etc/passwd')).toBe(true);
	});

	// get_csv_files takes NO client path (it lists the confined per-user dir), so
	// it has no traversal surface to deny-test.

	test('process_uploaded_file refuses a staged source path escaping the upload root', async () => {
		for (const file_data of [
			{ key_dir: '', tmp_name: '../../../../../etc/passwd' },
			{ key_dir: '', tmp_name: '/etc/passwd' },
			{ key_dir: '../../../../../etc', tmp_name: 'passwd' },
		]) {
			const res = await callAction('process_uploaded_file', { file_data });
			expect(res.result).toBe(false);
			expect(String(res.msg)).toStartWith('Error.');
		}
		expect(existsSync('/etc/passwd')).toBe(true); // never moved into the import dir
		expect(existsSync(resolve(userDir, 'passwd'))).toBe(false);
	});

	test('process_uploaded_file refuses key_dir="../<other_uid>" claiming another user\'s staged upload (SEC parity w/ sanitize_key_dir)', async () => {
		// A victim stages an upload under their own tmp dir.
		const VICTIM = 987655;
		const victimStaging = resolve(root, config.media.upload.tmpSubdir, String(VICTIM));
		mkdirSync(victimStaging, { recursive: true });
		const victimFile = resolve(victimStaging, 'victim.csv');
		writeFileSync(victimFile, 'a;b\n1;2\n');
		try {
			// SCRATCH_USER tries to reach it via key_dir='../<VICTIM>'. That path stays
			// INSIDE the shared staging root (so the old root-only check passed), but
			// sanitizeSegment rejects the '..' segment fail-closed.
			const res = await callAction('process_uploaded_file', {
				file_data: { key_dir: `../${VICTIM}`, tmp_name: 'victim.csv' },
			});
			expect(res.result).toBe(false);
			expect(String(res.msg)).toStartWith('Error.');
			expect(existsSync(victimFile)).toBe(true); // the victim's file was NOT moved/claimed
			expect(existsSync(resolve(userDir, 'victim.csv'))).toBe(false);
		} finally {
			rmSync(victimStaging, { recursive: true, force: true });
		}
	});

	test('process_uploaded_file refuses a destination file_name escaping the import dir (staged file stays)', async () => {
		const stagingDir = resolve(root, config.media.upload.tmpSubdir, String(SCRATCH_USER), 'kd');
		mkdirSync(stagingDir, { recursive: true });
		const staged = resolve(stagingDir, 'real.csv');
		writeFileSync(staged, 'a;b\n1;2\n');
		const escaped = resolve(root, 'import', `escape_${process.pid}.csv`);
		const res = await callAction('process_uploaded_file', {
			file_data: {
				key_dir: 'kd',
				tmp_name: 'real.csv',
				file_name: `../../escape_${process.pid}.csv`,
			},
		});
		expect(res.result).toBe(false);
		expect(existsSync(staged)).toBe(true); // the source was NOT moved
		expect(existsSync(escaped)).toBe(false); // nothing landed outside the import dir
	});
});
