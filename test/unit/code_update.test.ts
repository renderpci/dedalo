/**
 * Code update (UPDATE_PROCESS Phase 4, WC-024) — the strict linear guard, the
 * archive hardening (magic sniff, zipinfo pre-validation rejecting zip-slip +
 * symlink entries), the manifest linear-path builder, and the full
 * download→verify→extract→swap chain exercised against a SYNTHETIC release in
 * a TEMP tree (never projectRoot — the live swap is an operator drill). Needs
 * the `zip`/`unzip` CLIs; skips loudly if absent.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as realConfigModule from '../../src/config/config.ts';
import { buildCodeUpdateInfo, linearUpgradeTargets } from '../../src/core/update/code_manifest.ts';
import {
	assertLinearUpgrade,
	extractArchive,
	preValidateArchive,
	updateCode,
} from '../../src/core/update/code_update.ts';
import * as realOwnershipModule from '../../src/core/update/ownership.ts';

// Capture the REAL modules ONCE at top level; mock.restore() does NOT revert
// mock.module, so afterAll re-installs them — a per-test `await import()` would
// leak the mocked ownership into other suites (the closed-mode assertions).
const REAL_OWNERSHIP = { ...realOwnershipModule };
const REAL_CONFIG = { ...realConfigModule };

const ROOT = join(
	process.env.TMPDIR ?? '/tmp',
	`dedalo_code_update_${process.pid}_${Math.random().toString(36).slice(2)}`,
);
let zipAvailable = false;

beforeAll(async () => {
	mkdirSync(ROOT, { recursive: true });
	const probe = Bun.spawn(['zip', '--version'], { stdout: 'ignore', stderr: 'ignore' });
	zipAvailable = (await probe.exited) === 0;
});
afterAll(() => {
	mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
	mock.module('../../src/config/config.ts', () => REAL_CONFIG);
	mock.restore();
	rmSync(ROOT, { recursive: true, force: true });
});

/** Build a `dedalo_code/`-rooted release zip carrying the tree markers. */
async function buildReleaseZip(dir: string, extra?: (codeDir: string) => void): Promise<string> {
	const stage = join(dir, 'stage');
	const codeDir = join(stage, 'dedalo_code');
	mkdirSync(join(codeDir, 'src'), { recursive: true });
	writeFileSync(join(codeDir, 'package.json'), '{"name":"dedalo"}');
	writeFileSync(join(codeDir, 'src', 'server.ts'), '// server');
	writeFileSync(join(codeDir, '.bun-version'), '1.3.9');
	writeFileSync(join(codeDir, 'src', 'new_file.ts'), '// new in this release');
	extra?.(codeDir);
	const zipPath = join(dir, 'release.zip');
	const child = Bun.spawn(['zip', '-r', '-q', zipPath, 'dedalo_code'], {
		cwd: stage,
		stdout: 'ignore',
		stderr: 'pipe',
	});
	if ((await child.exited) !== 0) throw new Error('zip build failed');
	return zipPath;
}

describe('assertLinearUpgrade (strict path backstop)', () => {
	test('downgrade / same-version refused, legal rungs allowed, skips refused', () => {
		expect(assertLinearUpgrade([7, 0, 0], [6, 9, 9])).toContain('downgrade');
		expect(assertLinearUpgrade([7, 0, 0], [7, 0, 0])).toContain('downgrade');
		expect(assertLinearUpgrade([7, 0, 0], [7, 0, 1])).toBeNull(); // next patch
		expect(assertLinearUpgrade([7, 0, 5], [7, 1, 0])).toBeNull(); // next minor .0
		expect(assertLinearUpgrade([7, 3, 0], [8, 0, 0])).toBeNull(); // next major .0.0
		expect(assertLinearUpgrade([7, 0, 0], [9, 0, 0])).toContain('major version skip');
		expect(assertLinearUpgrade([7, 0, 0], [7, 2, 0])).toContain('minor version skip');
		expect(assertLinearUpgrade([7, 0, 0], [7, 1, 3])).toContain('must land on .0');
	});
});

describe('linearUpgradeTargets + buildCodeUpdateInfo (empty catalog)', () => {
	test('the live catalog advertises no releases (7.0.0 is current)', () => {
		expect(linearUpgradeTargets([7, 0, 0])).toEqual([]);
		const info = buildCodeUpdateInfo({
			clientVersion: [7, 0, 0],
			serverVersion: [7, 0, 0],
			codeFilesDir: undefined,
			publicBaseUrl: 'http://m/x',
			info: { date: 'now', entity_id: 1, entity: 'e', host: '' },
		});
		expect(info.files).toEqual([]);
		expect(info.info.version).toBe('7.0.0');
	});
});

describe('archive hardening', () => {
	test('preValidateArchive rejects a zip-slip entry name', async () => {
		if (!zipAvailable) return;
		const dir = join(ROOT, 'slip');
		mkdirSync(join(dir, 'stage'), { recursive: true });
		// craft an archive whose entry escapes dedalo_code/
		writeFileSync(join(dir, 'stage', 'evil'), 'x');
		const zipPath = join(dir, 'slip.zip');
		// zip stores the literal name 'evil' (no dedalo_code/ prefix)
		const child = Bun.spawn(['zip', '-q', zipPath, 'evil'], {
			cwd: join(dir, 'stage'),
			stdout: 'ignore',
			stderr: 'ignore',
		});
		await child.exited;
		expect(await preValidateArchive(zipPath)).toContain('unsafe archive entry');
	});

	test('preValidateArchive rejects a symlink entry', async () => {
		if (!zipAvailable) return;
		const dir = join(ROOT, 'symlink');
		const codeDir = join(dir, 'stage', 'dedalo_code');
		mkdirSync(codeDir, { recursive: true });
		writeFileSync(join(codeDir, 'real.txt'), 'real');
		try {
			symlinkSync('/etc/passwd', join(codeDir, 'link'));
		} catch {
			return; // symlink unsupported in this sandbox — skip
		}
		const zipPath = join(dir, 'symlink.zip');
		// -y preserves the symlink as a symlink entry
		const child = Bun.spawn(['zip', '-r', '-y', '-q', zipPath, 'dedalo_code'], {
			cwd: join(dir, 'stage'),
			stdout: 'ignore',
			stderr: 'ignore',
		});
		await child.exited;
		expect(await preValidateArchive(zipPath)).toContain('symlink');
	});

	test('preValidateArchive accepts a clean dedalo_code archive', async () => {
		if (!zipAvailable) return;
		const zipPath = await buildReleaseZip(join(ROOT, 'clean'));
		expect(await preValidateArchive(zipPath)).toBeNull();
	});

	test('extractArchive yields the dedalo_code root with the markers', async () => {
		if (!zipAvailable) return;
		const zipPath = await buildReleaseZip(join(ROOT, 'extract'));
		const codeRoot = await extractArchive(zipPath, join(ROOT, 'extract', 'q'));
		expect(existsSync(join(codeRoot, 'package.json'))).toBe(true);
		expect(existsSync(join(codeRoot, 'src', 'server.ts'))).toBe(true);
	});

	test('extractArchive rejects a tree without the markers', async () => {
		if (!zipAvailable) return;
		const dir = join(ROOT, 'nomark', 'stage', 'dedalo_code');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'random.txt'), 'x');
		const zipPath = join(ROOT, 'nomark', 'r.zip');
		const child = Bun.spawn(['zip', '-r', '-q', zipPath, 'dedalo_code'], {
			cwd: join(ROOT, 'nomark', 'stage'),
			stdout: 'ignore',
			stderr: 'ignore',
		});
		await child.exited;
		expect(extractArchive(zipPath, join(ROOT, 'nomark', 'q'))).rejects.toThrow('not a Dédalo tree');
	});
});

// ('updateCode refusals — engine does not own the install' retired at the
// 2026-07-11 cutover: engineOwnsInstall() is collapsed to true, so the
// ownership refusal is unreachable at runtime. The version/marker/hash
// refusals below are the surviving guards.)

describe('full swap chain against a synthetic release (mocked gate, temp tree)', () => {
	test('clean swap installs the new tree and backs the old one up', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'swap');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');

		// serve the release over a local origin the config "code server" matches
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;

		// the live tree we will swap (a temp dir, NOT projectRoot)
		const targetRoot = join(base, 'live');
		mkdirSync(join(targetRoot, 'src'), { recursive: true });
		writeFileSync(join(targetRoot, 'package.json'), '{"name":"old"}');
		writeFileSync(join(targetRoot, 'stale.ts'), '// removed in the new release');
		const backupRoot = join(base, 'backups');

		try {
			mock.module('../../src/core/update/ownership.ts', () => ({
				...REAL_OWNERSHIP,
				engineOwnsInstall: () => true,
			}));
			mock.module('../../src/config/config.ts', () => ({
				...REAL_CONFIG,
				config: {
					...REAL_CONFIG.config,
					update: {
						...REAL_CONFIG.config.update,
						codeServers: [{ name: 'm', url: `${origin}/`, code: 'c' }],
					},
				},
			}));

			let restarted = '';
			const out = await updateCode(
				{
					file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
					update_mode: 'clean',
				},
				{
					targetRoot,
					backupRoot,
					restart: (r) => {
						restarted = r;
					},
					supervised: true,
				},
			);

			expect(out.result).toBe(true);
			expect(out.msg).toContain('Installed Dédalo 7.0.1');
			expect(restarted).toContain('7.0.1');
			// the new tree landed (marker + new file), the stale file is gone
			expect(existsSync(join(targetRoot, 'src', 'new_file.ts'))).toBe(true);
			expect(existsSync(join(targetRoot, 'stale.ts'))).toBe(false);
			// the old tree was backed up
			const backups = existsSync(backupRoot)
				? (await import('node:fs')).readdirSync(backupRoot).filter((n) => n.startsWith('dedalo_'))
				: [];
			expect(backups.length).toBeGreaterThan(0);
		} finally {
			server.stop(true);
			mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
			mock.restore();
		}
	}, 60000);

	test('a checksum mismatch refuses before any tree touch', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'badsha');
		const zipPath = await buildReleaseZip(base);
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		mkdirSync(targetRoot, { recursive: true });
		writeFileSync(join(targetRoot, 'package.json'), '{"name":"old"}');
		try {
			mock.module('../../src/core/update/ownership.ts', () => ({
				...REAL_OWNERSHIP,
				engineOwnsInstall: () => true,
			}));
			mock.module('../../src/config/config.ts', () => ({
				...REAL_CONFIG,
				config: {
					...REAL_CONFIG.config,
					update: {
						...REAL_CONFIG.config.update,
						codeServers: [{ name: 'm', url: `${origin}/`, code: 'c' }],
					},
				},
			}));
			const out = await updateCode(
				{
					file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: 'a'.repeat(64) },
					update_mode: 'clean',
				},
				{ targetRoot, backupRoot: join(base, 'b'), restart: () => {}, supervised: true },
			);
			expect(out.result).toBe(false);
			expect(out.msg).toContain('checksum mismatch');
			// the live tree is untouched
			expect(readFileSync(join(targetRoot, 'package.json'), 'utf8')).toBe('{"name":"old"}');
		} finally {
			server.stop(true);
			mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
			mock.module('../../src/config/config.ts', () => REAL_CONFIG);
			mock.restore();
		}
	}, 60000);
});
