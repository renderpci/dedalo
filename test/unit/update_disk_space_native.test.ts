/**
 * update_disk_space_native — the code-update DISK-SPACE gate
 * (src/core/update/disk_space.ts).
 *
 * WHY IT EXISTS. On 2026-08-25 a remote install failed at the `deps` phase
 * with a screenful of bun `NoSpaceLeft` / `FileNotFound` extraction errors:
 * the filesystem filled up mid-`bun install`, after download, verify and
 * extract had already spent minutes and disk, and the operator was told only
 * "bun install failed". Two invariants come out of that:
 *
 *   1. an update measures the room it needs BEFORE it spends any (the pipeline
 *      calls checkUpdateSpace before the download);
 *   2. an UNMEASURABLE side never refuses — a diagnostic that cannot run must
 *      not block an install that would have worked.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRoot } from '../../src/config/env.ts';
import {
	availableBytesAt,
	checkUpdateSpace,
	formatGb,
	looksLikeNoSpace,
	SPACE_MARGIN,
	treeBytes,
} from '../../src/core/update/disk_space.ts';

describe('update disk space', () => {
	test('the remote failure of 2026-08-25 is recognized as a full disk', () => {
		// verbatim shape of what the panel showed (truncated)
		const stderr =
			'error: InstallFailed extracting tarball from onnxruntime-node FileNotFound: failed copying files from cache to destination for package @huggingface/tokenizers NoSpaceLeft: failed opening node_modules/package dir for package @turf/clusters';
		expect(looksLikeNoSpace(stderr)).toBe(true);
		expect(looksLikeNoSpace('ENOSPC: no space left')).toBe(true);
		expect(looksLikeNoSpace('No space left on device')).toBe(true);
		// a registry/network failure is NOT a full disk — the sentences differ
		expect(looksLikeNoSpace('error: failed to resolve registry.npmjs.org')).toBe(false);
	});

	test('available bytes are the UNPRIVILEGED figure, and readable here', () => {
		const available = availableBytesAt(projectRoot);
		expect(available === null || available > 0).toBe(true);
	});

	test('a not-yet-created path answers for its filesystem (the backup root is made by the first update)', () => {
		const missing = join(projectRoot, 'no_such_dir_yet', 'deeper');
		expect(availableBytesAt(missing)).toBe(availableBytesAt(projectRoot));
	});

	test('an unreadable path never throws — it answers null', async () => {
		expect(await treeBytes('/no/such/path/for/dedalo')).toBeNull();
	});

	test('a tree is measured in bytes', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'dd_space_'));
		writeFileSync(join(dir, 'payload'), Buffer.alloc(64 * 1024, 1));
		const bytes = await treeBytes(dir);
		expect(bytes).not.toBeNull();
		expect(bytes as number).toBeGreaterThanOrEqual(64 * 1024);
	});

	test('the requirement is the STAGED tree — the preserved entries are subtracted', async () => {
		// `.git` is MOVED by the swap (carryPreservedEntries), never staged.
		// Counting it is how a gate refuses an update that fits comfortably:
		// on a developer checkout .git is 2.05 GB of a 3.58 GB tree.
		const sizes: Record<string, number> = {
			'/live': 4_000_000_000,
			'/live/.git': 3_000_000_000,
		};
		const verdict = await checkUpdateSpace('/live', '/staging', new Set(['.git']), {
			available: () => 2_000_000_000,
			measure: async (dir) => sizes[dir] ?? 0,
			exists: () => true,
		});
		// 1 GB staged × 1.15 — NOT 4 GB
		expect(verdict.required).toBe(Math.round(1_000_000_000 * SPACE_MARGIN));
		expect(verdict.sufficient).toBe(true);
	});

	test('a measured shortfall refuses, and names both numbers', async () => {
		const verdict = await checkUpdateSpace('/live', '/staging', new Set(), {
			available: () => 1_000_000_000,
			measure: async () => 2_000_000_000,
		});
		expect(verdict.sufficient).toBe(false);
		expect(verdict.available).toBe(1_000_000_000);
		expect(verdict.required).toBe(Math.round(2_000_000_000 * SPACE_MARGIN));
	});

	test('the boundary is inclusive: exactly enough is enough', async () => {
		const live = 1_000_000_000;
		const required = Math.round(live * SPACE_MARGIN);
		expect(
			(
				await checkUpdateSpace('/live', '/staging', new Set(), {
					available: () => required,
					measure: async () => live,
				})
			).sufficient,
		).toBe(true);
		expect(
			(
				await checkUpdateSpace('/live', '/staging', new Set(), {
					available: () => required - 1,
					measure: async () => live,
				})
			).sufficient,
		).toBe(false);
	});

	test('an UNMEASURABLE preserved entry disarms rather than over-counting', async () => {
		// Falling back to the whole tree here would resurrect the .git over-count
		// under a different name — a gate that refuses a good update.
		const verdict = await checkUpdateSpace('/live', '/staging', new Set(['.git']), {
			available: () => 1,
			measure: async (dir) => (dir === '/live' ? 2_000_000_000 : null),
			exists: () => true,
		});
		expect(verdict.required).toBeNull();
		expect(verdict.sufficient).toBe(true);
	});

	test('an ABSENT preserved entry costs nothing (a release install has no .git)', async () => {
		// Treating "no .git" as unmeasurable would switch the gate off on every
		// production installation — the ones it exists for.
		const verdict = await checkUpdateSpace('/live', '/staging', new Set(['.git']), {
			available: () => 1,
			measure: async () => 2_000_000_000,
			exists: () => false,
		});
		expect(verdict.required).toBe(Math.round(2_000_000_000 * SPACE_MARGIN));
		expect(verdict.sufficient).toBe(false);
	});

	test('a real tree measures, and the live tree is the input', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'dd_space_'));
		writeFileSync(join(dir, 'payload'), Buffer.alloc(1024, 1));
		const verdict = await checkUpdateSpace(dir, dir, new Set());
		expect(verdict.sufficient).toBe(true);
		expect(verdict.required).not.toBeNull();
	});

	test('an unmeasurable side NEVER blocks the update', async () => {
		const verdict = await checkUpdateSpace('/no/such/path/for/dedalo', '/dev/null/nope', new Set());
		expect(verdict.required).toBeNull();
		expect(verdict.sufficient).toBe(true);
	});

	test('sizes render for an operator, not for a machine', () => {
		expect(formatGb(2 * 1024 ** 3)).toBe('2.0 GB');
	});
});
