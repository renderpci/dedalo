/**
 * restore_points_native — the restore-point LIFECYCLE contract
 * (src/core/update/restore_points.ts).
 *
 * This module was written after a measured failure, and the gate is shaped by
 * it. On the docker museum, 2026-08-28: eleven restore points, one multi-GB
 * tree each, nothing in the engine that had ever removed one; and when they
 * were removed by hand, three husks that `rm` reported success on and did not
 * delete. So three properties are pinned here, and each is load-bearing:
 *
 *   1. the newest BOOTABLE point is never deletable — it is the rollback for
 *      the code running now, and a confirm dialog is not a sufficient guard for
 *      deleting disaster recovery;
 *   2. a client-supplied NAME can never reach outside the backup root;
 *   3. a removal is VERIFIED, and a survivor is a failure that names itself —
 *      "delete reported success and the row is still there" is the bug.
 *
 * Filesystem-only (a scratch tree under the OS temp dir), no DB, no network →
 * hermetic tier. Nothing here touches the installation's backup root: every
 * path is built inside `mkdtemp`, and the module under test never resolves one
 * on its own.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DedaloError } from '../../src/core/errors/index.ts';
import {
	type DeletableFacts,
	deletabilityOf,
	liveRollbackName,
	pruneRestorePoints,
	removeRestorePointDir,
	RESTORE_POINT_PREFIX,
	resolveRestorePointOrRefuse,
} from '../../src/core/update/restore_points.ts';

let root = '';

/** A restore point on disk: a directory, optionally carrying the bootability marks. */
function plant(name: string, options: { bootable?: boolean } = {}): string {
	const dir = join(root, name);
	mkdirSync(dir, { recursive: true });
	if (options.bootable === true) {
		writeFileSync(join(dir, 'package.json'), '{}');
		mkdirSync(join(dir, 'node_modules'), { recursive: true });
	}
	return dir;
}

function facts(name: string, stamp: number, bootable: boolean): DeletableFacts {
	return { name, stamp, bootable };
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'dd_restore_points_'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('the live rollback is protected', () => {
	test('it is the newest BOOTABLE point, not simply the newest', () => {
		// An unbootable husk cut after it is not a rollback: treating recency as
		// the criterion would pin the protection on a directory that cannot save
		// anybody, and leave the real fallback deletable.
		const points = [
			facts(`${RESTORE_POINT_PREFIX}husk`, 300, false),
			facts(`${RESTORE_POINT_PREFIX}newest_bootable`, 200, true),
			facts(`${RESTORE_POINT_PREFIX}older`, 100, true),
		];
		expect(liveRollbackName(points)).toBe(`${RESTORE_POINT_PREFIX}newest_bootable`);
		expect(deletabilityOf(points[1] as DeletableFacts, points)).toEqual({
			deletable: false,
			reason: 'live_rollback',
		});
		// the husk is exactly what an operator needs to clear…
		expect(deletabilityOf(points[0] as DeletableFacts, points).deletable).toBe(true);
		// …and the rollback chain beyond one step back is convenience, not recovery
		expect(deletabilityOf(points[2] as DeletableFacts, points).deletable).toBe(true);
	});

	test('nothing is protected when nothing could be booted back into', () => {
		const points = [
			facts(`${RESTORE_POINT_PREFIX}a`, 200, false),
			facts(`${RESTORE_POINT_PREFIX}b`, 100, false),
		];
		expect(liveRollbackName(points)).toBeNull();
		for (const point of points) {
			expect(deletabilityOf(point, points).deletable).toBe(true);
		}
	});

	test('the reason is a machine id, never a sentence', () => {
		const points = [facts(`${RESTORE_POINT_PREFIX}only`, 1, true)];
		const verdict = deletabilityOf(points[0] as DeletableFacts, points);
		expect(verdict.reason).toBe('live_rollback');
		expect(/\s/.test(String(verdict.reason))).toBe(false);
	});
});

describe('a client-supplied name cannot leave the backup root', () => {
	const refusals: [string, unknown][] = [
		['traversal', `../../${RESTORE_POINT_PREFIX}elsewhere`],
		['absolute path', `/etc/${RESTORE_POINT_PREFIX}passwd`],
		['nested path', `${RESTORE_POINT_PREFIX}a/../../escape`],
		['no prefix', 'etc'],
		['empty', ''],
		['not a string', 42],
		['null byte', `${RESTORE_POINT_PREFIX}a\0b`],
	];
	for (const [label, name] of refusals) {
		test(`refuses ${label}`, () => {
			expect(() => resolveRestorePointOrRefuse(root, name)).toThrow(DedaloError);
		});
	}

	test('refuses a sibling whose name merely BEGINS with the root', () => {
		// startsWith on the root alone would accept `/tmp/x_evil` for root
		// `/tmp/x`; containment needs the separator.
		const sibling = `${root}_evil`;
		mkdirSync(join(sibling, `${RESTORE_POINT_PREFIX}p`), { recursive: true });
		try {
			expect(() => resolveRestorePointOrRefuse(root, `../${RESTORE_POINT_PREFIX}p`)).toThrow(
				DedaloError,
			);
		} finally {
			rmSync(sibling, { recursive: true, force: true });
		}
	});

	test('refuses a symlink rather than following it', () => {
		// removing THROUGH one would delete whatever it points at — the single
		// mistake this function exists to make impossible.
		const victim = join(root, 'victim');
		mkdirSync(victim, { recursive: true });
		const link = join(root, `${RESTORE_POINT_PREFIX}link`);
		require('node:fs').symlinkSync(victim, link);
		expect(() => resolveRestorePointOrRefuse(root, `${RESTORE_POINT_PREFIX}link`)).toThrow(
			DedaloError,
		);
		expect(existsSync(victim)).toBe(true);
	});

	test('accepts a real point and returns its path', () => {
		const dir = plant(`${RESTORE_POINT_PREFIX}good`);
		expect(resolveRestorePointOrRefuse(root, `${RESTORE_POINT_PREFIX}good`)).toBe(dir);
	});

	test('refuses a name that does not exist', () => {
		expect(() => resolveRestorePointOrRefuse(root, `${RESTORE_POINT_PREFIX}absent`)).toThrow(
			DedaloError,
		);
	});
});

describe('a removal is verified, never assumed', () => {
	test('a real removal answers with the name', () => {
		const dir = plant(`${RESTORE_POINT_PREFIX}gone`, { bootable: true });
		expect(removeRestorePointDir(dir, `${RESTORE_POINT_PREFIX}gone`)).toBe(
			`${RESTORE_POINT_PREFIX}gone`,
		);
		expect(existsSync(dir)).toBe(false);
	});

	test('a directory that survives is a FAILURE that names what is left', () => {
		// THE MUSEUM'S HUSKS, reproduced honestly: a directory the process may
		// not remove. There it was a Docker Desktop mount the host still held;
		// here it is a read-only PARENT, which is the same thing from rmSync's
		// point of view — the entry cannot be unlinked. What is asserted is the
		// contract, not the errno: success REQUIRES the directory to be gone,
		// and a survivor becomes an operator sentence naming what is left.
		if (typeof process.getuid === 'function' && process.getuid() === 0) {
			// root ignores the permission bits and would delete it anyway
			return;
		}
		const cage = join(root, 'cage');
		mkdirSync(cage, { recursive: true });
		const dir = join(cage, `${RESTORE_POINT_PREFIX}husk`);
		mkdirSync(join(dir, 'client'), { recursive: true });
		chmodSync(cage, 0o500); // r-x: the entry inside cannot be unlinked
		try {
			let thrown: unknown = null;
			try {
				removeRestorePointDir(dir, `${RESTORE_POINT_PREFIX}husk`);
			} catch (error) {
				thrown = error;
			}
			expect(thrown, 'an unremovable directory must not answer success').toBeInstanceOf(
				DedaloError,
			);
			const failure = thrown as DedaloError;
			expect(failure.code).toBe('update.failed');
			// the sentence NAMES the point, and points at the cause that actually
			// produces this in the field. `client` is NOT asserted here: rm did
			// empty the directory, it just could not unlink it from a read-only
			// parent — so there is nothing left to list, and the sentence says
			// what is true rather than inventing a survivor.
			const sentence = String(failure.publicMessage ?? '');
			expect(sentence).toContain(`${RESTORE_POINT_PREFIX}husk`);
			expect(sentence).toContain('NOT fully deleted');
			expect(sentence).toContain('mount');
			// and it is still there — the panel must keep listing it
			expect(existsSync(dir)).toBe(true);
		} finally {
			chmodSync(cage, 0o700);
		}
	});

	test('what survived INSIDE is named, so the operator knows where to look', () => {
		if (typeof process.getuid === 'function' && process.getuid() === 0) return;
		// this time the point itself is removable but one child is not: rm walks
		// in, fails on the locked entry, and the directory remains WITH content.
		const dir = plant(`${RESTORE_POINT_PREFIX}locked`);
		const locked = join(dir, 'client');
		mkdirSync(locked, { recursive: true });
		writeFileSync(join(locked, 'held'), 'x');
		chmodSync(locked, 0o500);
		try {
			let thrown: unknown = null;
			try {
				removeRestorePointDir(dir, `${RESTORE_POINT_PREFIX}locked`);
			} catch (error) {
				thrown = error;
			}
			expect(thrown).toBeInstanceOf(DedaloError);
			const sentence = String((thrown as DedaloError).publicMessage ?? '');
			expect(sentence).toContain('client');
			expect(existsSync(dir)).toBe(true);
		} finally {
			chmodSync(locked, 0o700);
		}
	});
});

describe('retention keeps the newest and never the rollback', () => {
	test('keeps `keep` newest, deletes the rest', () => {
		const points: DeletableFacts[] = [];
		for (let i = 1; i <= 5; i++) {
			const name = `${RESTORE_POINT_PREFIX}p${i}`;
			plant(name, { bootable: true });
			points.push(facts(name, i * 100, true));
		}
		const report = pruneRestorePoints({ points, backupRoot: root, keep: 2 });
		expect(report.deleted.sort()).toEqual([
			`${RESTORE_POINT_PREFIX}p1`,
			`${RESTORE_POINT_PREFIX}p2`,
			`${RESTORE_POINT_PREFIX}p3`,
		]);
		expect(existsSync(join(root, `${RESTORE_POINT_PREFIX}p5`))).toBe(true);
		expect(existsSync(join(root, `${RESTORE_POINT_PREFIX}p4`))).toBe(true);
		expect(existsSync(join(root, `${RESTORE_POINT_PREFIX}p1`))).toBe(false);
	});

	test('keep < 1 is treated as 1 — a policy that deletes the last rollback is not one', () => {
		const names = ['a', 'b'].map((n) => `${RESTORE_POINT_PREFIX}${n}`);
		names.forEach((n) => plant(n, { bootable: true }));
		const points = [facts(names[0] as string, 200, true), facts(names[1] as string, 100, true)];
		const report = pruneRestorePoints({ points, backupRoot: root, keep: 0 });
		// the newest survives BOTH as the kept one and as the live rollback
		expect(existsSync(join(root, names[0] as string))).toBe(true);
		expect(report.deleted).toEqual([names[1] as string]);
	});

	test('never the live rollback, even when it falls outside `keep`', () => {
		// the husks are newer, so the only bootable point sorts last — retention
		// must still not take it.
		const husk1 = `${RESTORE_POINT_PREFIX}h1`;
		const husk2 = `${RESTORE_POINT_PREFIX}h2`;
		const boot = `${RESTORE_POINT_PREFIX}boot`;
		[husk1, husk2].forEach((n) => plant(n));
		plant(boot, { bootable: true });
		const points = [facts(husk1, 300, false), facts(husk2, 200, false), facts(boot, 100, true)];
		const report = pruneRestorePoints({ points, backupRoot: root, keep: 1 });
		expect(report.deleted).toEqual([husk2]);
		expect(existsSync(join(root, boot))).toBe(true);
	});

	test('never the sentinel’s own backupDir', () => {
		// it is the tree the update that just confirmed replaced — the evidence
		// of the swap, and the one step back from what is now running.
		const names = ['n1', 'n2', 'n3'].map((n) => `${RESTORE_POINT_PREFIX}${n}`);
		names.forEach((n) => plant(n));
		const points = names.map((n, i) => facts(n, (3 - i) * 100, false));
		const report = pruneRestorePoints({
			points,
			backupRoot: root,
			keep: 1,
			protect: names[2] as string,
		});
		expect(report.deleted).toEqual([names[1] as string]);
		expect(existsSync(join(root, names[2] as string))).toBe(true);
	});

	test('a point it cannot remove is REPORTED, never silently skipped', () => {
		const points = [
			facts(`${RESTORE_POINT_PREFIX}keep`, 200, true),
			facts(`${RESTORE_POINT_PREFIX}absent`, 100, false),
		];
		plant(`${RESTORE_POINT_PREFIX}keep`, { bootable: true });
		// `absent` is listed but not on disk: rmSync force-succeeds and the
		// existence check agrees, so it counts as deleted rather than failed —
		// the honest answer for "make it not be there".
		const report = pruneRestorePoints({ points, backupRoot: root, keep: 1 });
		expect(report.deleted).toEqual([`${RESTORE_POINT_PREFIX}absent`]);
		expect(report.failed).toEqual([]);
	});
});
