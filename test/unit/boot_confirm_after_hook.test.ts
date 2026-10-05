/**
 * BOOT CONFIRM → AFTER-CONFIRMED HOOK (publication host phase 4, L5).
 *
 * The Publication API push must fire ONLY once a pending sentinel is flipped to
 * `confirmed` by the tree it names — never on a mismatch (a rollback booted the old
 * tree), never on an absent or non-pending sentinel — and a throwing hook must not
 * undo the confirmation or escape the boot path. server.ts must pass the trigger
 * with the boot facts, inside its smoke/install guard.
 */

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirmBootedCodeUpdate } from '../../src/core/update/boot_confirm.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const DIGEST_NEW = 'b'.repeat(64);
const DIGEST_OLD = 'c'.repeat(64);
const dirs: string[] = [];

function scratchSentinel(status: 'pending' | 'confirmed' = 'pending'): string {
	const dir = mkdtempSync(join(tmpdir(), 'dedalo_boot_confirm_hook-'));
	dirs.push(dir);
	const path = join(dir, 'last_code_update.json');
	writeFileSync(
		path,
		JSON.stringify({
			version: '7.0.3',
			previousVersion: '7.0.2',
			updateMode: 'clean',
			stamp: '2026-10-03T10-00-00',
			backupDir: dir,
			installDigest: DIGEST_NEW,
			status,
			rollback_attempted: false,
		}),
	);
	return path;
}

function statusOf(path: string): unknown {
	return (JSON.parse(readFileSync(path, 'utf8')) as { status: unknown }).status;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('confirmBootedCodeUpdate afterConfirmed hook', () => {
	test('runs ONCE, after the sentinel already reads confirmed', async () => {
		const path = scratchSentinel();
		const seen: unknown[] = [];
		await confirmBootedCodeUpdate(path, '7.0.3', DIGEST_NEW, () => {
			seen.push(statusOf(path));
		});
		expect(seen).toEqual(['confirmed']);
	});

	test('a mismatched tree (rollback booted the old one) does not run it', async () => {
		const path = scratchSentinel();
		const errors = spyOn(console, 'error').mockImplementation(() => {});
		let calls = 0;
		await confirmBootedCodeUpdate(path, '7.0.3', DIGEST_OLD, () => {
			calls++;
		});
		errors.mockRestore();
		expect(calls).toBe(0);
		expect(statusOf(path)).toBe('pending');
	});

	test('an already-confirmed or absent sentinel does not run it', async () => {
		let calls = 0;
		const hook = () => {
			calls++;
		};
		await confirmBootedCodeUpdate(scratchSentinel('confirmed'), '7.0.3', DIGEST_NEW, hook);
		await confirmBootedCodeUpdate(
			join(tmpdir(), 'no_such_dedalo_sentinel.json'),
			'7.0.3',
			DIGEST_NEW,
			hook,
		);
		await confirmBootedCodeUpdate(null, '7.0.3', DIGEST_NEW, hook);
		expect(calls).toBe(0);
	});

	test('a throwing hook neither escapes nor undoes the confirmation', async () => {
		const path = scratchSentinel();
		const errors = spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			confirmBootedCodeUpdate(path, '7.0.3', DIGEST_NEW, () => {
				throw new Error('hook boom');
			}),
		).resolves.toBeUndefined();
		expect(statusOf(path)).toBe('confirmed');
		expect(errors).toHaveBeenCalled();
		errors.mockRestore();
	});
});

describe('server.ts wiring', () => {
	test('the confirm block passes the trigger with the boot facts, inside the smoke/install guard', () => {
		const source = stripComments(
			readFileSync(join(import.meta.dir, '..', '..', 'src', 'server.ts'), 'utf8'),
		);
		const call = source.indexOf(
			'triggerPublicationApiPush({ smokeBoot, installMode: config.installMode })',
		);
		expect(call).toBeGreaterThan(-1);
		// whitespace-insensitive: the formatter wraps this long dynamic import
		expect(source).toMatch(/import\(\s*'\.\/core\/publication_host\/api_reconcile\.ts'\s*\)/);
		const guard = source.lastIndexOf('if (!config.installMode && !smokeBoot) {', call);
		const confirmImport = source.indexOf("import('./core/update/boot_confirm.ts')", guard);
		expect(guard).toBeGreaterThan(-1);
		expect(confirmImport).toBeGreaterThan(guard);
		expect(confirmImport).toBeLessThan(call);
	});
});
