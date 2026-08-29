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
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
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
		// `no_such_dir_yet/deeper` is absent by construction, so `availableBytesAt`
		// must walk UP to an existing ancestor — projectRoot — and answer for that
		// filesystem instead of reporting "unmeasurable". That walk is the whole
		// point of the function: the code backup root does not exist until the
		// first update creates it, and the readiness panel asks about it before
		// that.
		const missing = join(projectRoot, 'no_such_dir_yet', 'deeper');
		expect(existsSync(missing)).toBe(false);

		// WHY THIS IS NOT `expect(availableBytesAt(missing)).toBe(availableBytesAt(projectRoot))`.
		// Until 2026-08-29 it was exactly that: two statfs() calls at two different
		// instants compared for EXACT byte equality. Free space is not constant
		// between two instants. Measured across three full
		// `bun test test/unit test/integration` runs on 2026-08-29, this gate
		// failed in one run and passed in the other two — sibling tests were
		// creating and deleting temp trees on the same filesystem in between, and
		// alone nothing else writes, so it always passed in isolation. Exact
		// equality was only ever a PROXY for "the same filesystem answered", and it
		// is a proxy the kernel never promised. A gate that flaps red/green on its
		// own destroys the frozen red baseline it feeds
		// (engineering/unit_baseline.json is shrink-only: an entry that is
		// sometimes-green is stale, an omission that is sometimes-red is a
		// regression, so a non-deterministic test makes the tier mean two different
		// things on two runs and it can no longer block). Do not restore it.
		const before = availableBytesAt(projectRoot);
		const answer = availableBytesAt(missing);
		const after = availableBytesAt(projectRoot);

		// HALF ONE — it walked up rather than giving up. This is the line that goes
		// red if `availableBytesAt` ever stops walking and returns null for a
		// missing path (verified by mutation on 2026-08-29: replacing the
		// ancestor-walk loop with `if (!existsSync(path)) return null` turns this
		// assertion red, and nothing else in the file notices).
		expect(before).not.toBeNull();
		expect(answer).not.toBeNull();

		// HALF TWO — a COARSE SANITY BOUND, and deliberately labelled as one rather
		// than dressed up as a filesystem-identity proof.
		//
		// BE CLEAR ABOUT WHAT THIS CANNOT DO (adversarial review, 2026-08-29 — an
		// earlier version of this comment claimed an answer from a different
		// filesystem would be "off by a meaningful fraction of a whole volume", and
		// that is false on the platform the gate runs on). Every ancestor
		// `availableBytesAt` can reach on this machine lives in ONE APFS container:
		// measured, `/`, `/System/Volumes/Data` and `/private/tmp` all report an
		// identical 57.27 GB available. Sibling volumes in a shared container report
		// the SAME free bytes by design, so no wrong-filesystem regression is
		// detectable here at any tolerance. Half ONE (non-null) is the assertion with
		// teeth, and it is the one the mutation proof exercises.
		//
		// What this half still buys: it catches an answer off by ORDERS of magnitude —
		// a stubbed zero, a byte/block unit confusion, a figure for some unrelated
		// mount — which is worth one cheap comparison. The reference is BRACKETED (a
		// reading either side of the answer) so ordinary suite churn is inside the
		// window by construction, and the tolerance is scaled to that bracketed FREE
		// reading, not to total capacity: 1% of a 926 GB capacity would be 9.26 GB,
		// i.e. 16% of the 57 GB figure it brackets — a bound so loose it would admit
		// almost anything, which is how a sanity check becomes decoration.
		const reference = [before as number, after as number];
		const tolerance = Math.max(...reference) * 0.01;
		expect(answer as number).toBeGreaterThanOrEqual(Math.min(...reference) - tolerance);
		expect(answer as number).toBeLessThanOrEqual(Math.max(...reference) + tolerance);
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
