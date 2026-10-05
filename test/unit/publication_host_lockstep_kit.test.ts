/**
 * THE LOCKSTEP DRILL'S OWN PIECES — held without the live agent.
 *
 * scripts/publication_host_engine_drill.ts's [lockstep] rows run the ENGINE's phase-4
 * reconciler inside a SCRATCH INSTALLED tree. What they build must be right before it
 * proves anything:
 *   - the scratch tree is the WORKING tree (tracked + untracked-unignored, uncommitted
 *     edits included), never ignored files, never a symlink (a release archive carries
 *     none), the checkout's node_modules linked, the drill marker planted;
 *   - the driver's guard refuses any tree without that marker;
 *   - the stamp parses exactly as the updater's (install_stamp.ts);
 *   - the pending sentinel has the swap's shape and names the stamped digest;
 *   - the driver protocol reads the LAST result line and turns an error line or a non-zero
 *     exit into a throw that names it;
 *   - the audit-size probe the "nothing reached the agent" rows lean on.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	assertDrillTree,
	auditBytes,
	DRILL_TREE_MARKER,
	drillDigest,
	materializeScratchTree,
	parseDriverResult,
	plantPendingSentinel,
	SENTINEL_FILE,
	sentinelStatus,
	writeScratchStamp,
} from '../../scripts/lib/publication_host_lockstep.ts';
import { INSTALL_STAMP_PATH, parseInstallStamp } from '../../src/core/update/install_stamp.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dd_pubhost_lockstep_kit_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function git(cwd: string, ...args: string[]): void {
	const r = Bun.spawnSync(
		['git', '-c', 'user.email=drill@example.invalid', '-c', 'user.name=drill', ...args],
		{ cwd, stdout: 'pipe', stderr: 'pipe' },
	);
	if (r.exitCode !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`);
}

describe('lockstep kit — the scratch installed tree', () => {
	test('working-tree files only: tracked + untracked-unignored; no ignored, deleted or symlinked entry; marker; node_modules linked', () => {
		const repo = join(scratch, 'repo');
		mkdirSync(join(repo, 'node_modules', 'dep'), { recursive: true });
		mkdirSync(join(repo, 'src'), { recursive: true });
		writeFileSync(join(repo, '.gitignore'), 'node_modules/\nignored.txt\n');
		writeFileSync(join(repo, 'src', 'tracked.ts'), 'export const a = 1;\n');
		writeFileSync(join(repo, 'run.sh'), '#!/bin/sh\n', { mode: 0o755 });
		writeFileSync(join(repo, 'gone.txt'), 'x');
		symlinkSync('src', join(repo, 'alias'));
		git(repo, 'init', '-q');
		git(repo, 'add', '.');
		git(repo, 'commit', '-q', '-m', 'seed');
		rmSync(join(repo, 'gone.txt'));
		writeFileSync(join(repo, 'src', 'tracked.ts'), 'export const a = 2;\n'); // uncommitted edit
		writeFileSync(join(repo, 'untracked.ts'), 'u');
		writeFileSync(join(repo, 'ignored.txt'), 'i');

		const tree = join(scratch, 'tree');
		expect(materializeScratchTree(repo, tree)).toBe(4); // .gitignore, run.sh, src/tracked.ts, untracked.ts
		expect(readFileSync(join(tree, 'src', 'tracked.ts'), 'utf8')).toBe('export const a = 2;\n');
		expect(existsSync(join(tree, 'untracked.ts'))).toBe(true);
		expect(existsSync(join(tree, 'ignored.txt'))).toBe(false);
		expect(existsSync(join(tree, 'gone.txt'))).toBe(false);
		expect(existsSync(join(tree, 'alias'))).toBe(false);
		expect(lstatSync(join(tree, 'run.sh')).mode & 0o777).toBe(0o755);
		expect(readlinkSync(join(tree, 'node_modules'))).toBe(join(repo, 'node_modules'));
		expect(() => assertDrillTree(tree)).not.toThrow();
		expect(() => assertDrillTree(repo)).toThrow(
			`not a lockstep drill tree (no ${DRILL_TREE_MARKER})`,
		);
	});

	test('the stamp parses as the updater writes it: 64-hex digest, a built channel', () => {
		const tree = join(scratch, 'stamped');
		const digest = drillDigest('A');
		writeScratchStamp(tree, digest);
		const stamp = parseInstallStamp(readFileSync(join(tree, INSTALL_STAMP_PATH), 'utf8'));
		expect(stamp?.digest).toBe(digest);
		expect(stamp?.channel).toBe('master');
		expect(digest).toMatch(/^[a-f0-9]{64}$/);
		expect(drillDigest('A')).toBe(digest);
		expect(drillDigest('B')).not.toBe(digest);
	});

	test("the pending sentinel is the swap's shape and names the stamped digest", () => {
		const root = join(scratch, 'backups');
		plantPendingSentinel(root, '7.0.1', drillDigest('A'));
		const sentinel = JSON.parse(readFileSync(join(root, SENTINEL_FILE), 'utf8')) as Record<
			string,
			unknown
		>;
		expect(sentinel).toMatchObject({
			version: '7.0.1',
			previousVersion: '7.0.1',
			updateMode: 'clean',
			installDigest: drillDigest('A'),
			status: 'pending',
			rollback_attempted: false,
		});
		expect(sentinelStatus(root)).toBe('pending');
		expect(sentinelStatus(join(scratch, 'nowhere'))).toBeNull();
	});
});

describe('lockstep kit — the driver protocol and the audit probe', () => {
	test('the LAST result line wins; an error line or a non-zero exit throws naming it', () => {
		expect(
			parseDriverResult<{ n: number }>(
				'noise\nDRIVER_RESULT {"n":1}\nDRIVER_RESULT {"n":2}\n',
				'',
				0,
			),
		).toEqual({ n: 2 });
		expect(() => parseDriverResult('DRIVER_ERROR no install stamp\n', 'trace', 1)).toThrow(
			'lockstep driver: no install stamp',
		);
		expect(() => parseDriverResult('DRIVER_RESULT {"n":1}\n', '', 1)).toThrow(
			'lockstep driver: exit 1',
		);
		expect(() => parseDriverResult('', 'boom', 0)).toThrow(
			'lockstep driver: exit 0, no result line',
		);
	});

	test('auditBytes sums every file under the dir; a missing dir is 0', () => {
		const dir = join(scratch, 'audit');
		mkdirSync(join(dir, 'sub'), { recursive: true });
		writeFileSync(join(dir, 'a.ndjson'), '12345');
		writeFileSync(join(dir, 'sub', 'b.ndjson'), '123');
		expect(auditBytes(dir)).toBe(8);
		expect(auditBytes(join(scratch, 'no_audit'))).toBe(0);
	});
});
