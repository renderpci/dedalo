/**
 * Code update (UPDATE_PROCESS Phase 4, WC-024) — the strict linear guard, the
 * archive hardening (magic sniff, zipinfo pre-validation rejecting zip-slip +
 * symlink entries), the manifest linear-path builder, and the full CLEAN-ONLY
 * download→verify→extract→deps→preflight→swap chain exercised against a
 * SYNTHETIC release in a TEMP tree (never projectRoot — the live swap is an
 * operator drill). Needs the `zip`/`unzip` CLIs; the CANARY test below FAILS
 * when they are absent, so the swap chain can never go vacuously green on a
 * zip-less machine (the per-test `if (!zipAvailable) return;` early-outs are
 * covered by that one loud failure).
 *
 * Since 2026-08-23 `updateCode` takes the acting Principal and runs the FULL
 * precondition gate (superuser + maintenance mode + required backup), so every
 * pipeline test drives a SUPERUSER with maintenance mode ON (scratch state
 * file — the S1-18 guard below) and an explicit backup waiver, with
 * installDeps/smokeBoot seam no-ops. The preconditions themselves are gated in
 * test/unit/update_preconditions.test.ts.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as realConfigModule from '../../src/config/config.ts';
import { readEnv } from '../../src/config/env.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { confirmBootedCodeUpdate } from '../../src/core/update/boot_confirm.ts';
import { UPDATE_CATALOG } from '../../src/core/update/catalog.ts';
import { buildCodeUpdateInfo, linearUpgradeTargets } from '../../src/core/update/code_manifest.ts';
import {
	acquireRunLockOrRefuse,
	assertLinearUpgrade,
	type CodeUpdateSeams,
	codeRunLockPath,
	extractArchive,
	preValidateArchive,
	type UpdatePhaseFrame,
	updateCode,
} from '../../src/core/update/code_update.ts';
import * as realOwnershipModule from '../../src/core/update/ownership.ts';
import { compareVersionArrays, DEDALO_VERSION_TRIPLE } from '../../src/core/update/version.ts';
import { refusalOf, refusalOfSync } from '../helpers/refusal.ts';

// Capture the REAL modules ONCE at top level; mock.restore() does NOT revert
// mock.module, so afterAll re-installs them — a per-test `await import()` would
// leak the mocked ownership into other suites (the closed-mode assertions).
const REAL_OWNERSHIP = { ...realOwnershipModule };
const REAL_CONFIG = { ...realConfigModule };

const STATE_PATH = readEnv('DEDALO_TS_STATE_PATH');
if (STATE_PATH === undefined) {
	// Scratch state file required (S1-18): these tests flip maintenance_mode.
	throw new Error(
		'code_update.test.ts: DEDALO_TS_STATE_PATH is not set — refusing to run against the live server state file (S1-18)',
	);
}

const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

const ROOT = join(
	process.env.TMPDIR ?? '/tmp',
	`dedalo_code_update_${process.pid}_${Math.random().toString(36).slice(2)}`,
);
let zipAvailable = false;

beforeAll(async () => {
	mkdirSync(ROOT, { recursive: true });
	const probe = Bun.spawn(['zip', '--version'], { stdout: 'ignore', stderr: 'ignore' });
	zipAvailable = (await probe.exited) === 0;
	setServerState({ maintenance_mode: true });
});
afterAll(() => {
	setServerState({ maintenance_mode: false });
	mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
	mock.module('../../src/config/config.ts', () => REAL_CONFIG);
	mock.restore();
	rmSync(ROOT, { recursive: true, force: true });
});

/**
 * Build a `dedalo_code/`-rooted release zip carrying the tree markers.
 * `.bun-version` pins the RUNNING Bun.version so the pin gate in the pipeline
 * stays LIVE (a hardcoded pin would make every pipeline test exercise the
 * refusal instead of the path under test).
 */
async function buildReleaseZip(dir: string, extra?: (codeDir: string) => void): Promise<string> {
	const stage = join(dir, 'stage');
	const codeDir = join(stage, 'dedalo_code');
	mkdirSync(join(codeDir, 'src'), { recursive: true });
	writeFileSync(join(codeDir, 'package.json'), '{"name":"dedalo"}');
	writeFileSync(join(codeDir, 'src', 'server.ts'), '// server');
	writeFileSync(join(codeDir, '.bun-version'), Bun.version);
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

/** A minimal LIVE tree whose root entries are all shipped by buildReleaseZip. */
function buildLiveTree(targetRoot: string): void {
	mkdirSync(join(targetRoot, 'src'), { recursive: true });
	writeFileSync(join(targetRoot, 'package.json'), '{"name":"old"}');
	writeFileSync(join(targetRoot, 'src', 'stale.ts'), '// removed in the new release');
	writeFileSync(join(targetRoot, '.bun-version'), Bun.version);
}

/** Recursive content digest of a tree — the "byte-identical" assertion. */
function treeDigest(dir: string): string {
	const hash = createHash('sha256');
	const walk = (d: string): void => {
		for (const name of readdirSync(d).sort()) {
			const full = join(d, name);
			const stat = lstatSync(full);
			hash.update(name);
			if (stat.isDirectory()) walk(full);
			else hash.update(readFileSync(full));
		}
	};
	walk(dir);
	return hash.digest('hex');
}

/** Default no-op pipeline seams + backup waiver options for a swap test. */
function pipelineSeams(overrides: Partial<CodeUpdateSeams> = {}): CodeUpdateSeams {
	return {
		restart: () => {},
		supervised: true,
		installDeps: async () => {},
		smokeBoot: async () => {},
		channel: 'tree_swap',
		...overrides,
	};
}

function mockUpdateEnv(origin: string): void {
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
}

function unmockUpdateEnv(): void {
	mock.module('../../src/core/update/ownership.ts', () => REAL_OWNERSHIP);
	mock.module('../../src/config/config.ts', () => REAL_CONFIG);
	mock.restore();
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

	// The PATCH AXIS. `versionSkipReason` did not destructure `cPatch` at all,
	// so an arbitrary patch jump passed the swap path's only version gate — and
	// the client-supplied sha matches the skipped-to release's real published
	// sidecar, so nothing downstream caught it either.
	test('a patch skip is refused (the axis the guard never read)', () => {
		expect(assertLinearUpgrade([7, 0, 0], [7, 0, 2])).toContain('patch version skip');
		expect(assertLinearUpgrade([7, 0, 0], [7, 0, 3])).toContain('patch version skip');
		expect(assertLinearUpgrade([7, 0, 0], [7, 0, 99999])).toContain('patch version skip');
		expect(assertLinearUpgrade([7, 0, 1], [7, 0, 3])).toContain('patch version skip');
		// …and the legal rung from each of those is still legal.
		expect(assertLinearUpgrade([7, 0, 1], [7, 0, 2])).toBeNull();
		expect(assertLinearUpgrade([7, 0, 2], [7, 0, 3])).toBeNull();
	});

	// The two notions of "next rung" — the manifest's (what a master OFFERS)
	// and the swap guard's (what a consumer ACCEPTS) — are written separately
	// and must never disagree: anything advertised has to be installable.
	test('every rung the manifest advertises passes the swap guard', () => {
		for (const current of [
			[7, 0, 0],
			[7, 0, 1],
			[7, 0, 2],
			[7, 0, 3],
			[7, 1, 4],
			[8, 2, 0],
		]) {
			for (const target of linearUpgradeTargets(current)) {
				expect(assertLinearUpgrade(current, target)).toBeNull();
			}
		}
	});
});

describe('linearUpgradeTargets + buildCodeUpdateInfo (the LIVE catalog)', () => {
	// BRANCH COVERAGE FOR BOTH FUNCTIONS LIVES IN test/unit/code_manifest.test.ts,
	// driven through the injectable `catalog` parameter. What is pinned here is
	// the stock-master FACT for the CURRENT catalog: the ONE real rung, 7.0.0 →
	// 7.0.1. The probe-only '702'/'703' that used to sit beside it are gone —
	// see the "may not run ahead of the engine" tripwire below for why.
	// A client is offered exactly its next patch rung; the manifest advertises
	// no file while no archive exists on disk for that rung.
	test('the stock catalog offers exactly the real 7.0.0 → 7.0.1 rung', () => {
		expect(Object.keys(UPDATE_CATALOG).sort()).toEqual(['701']);
		expect(linearUpgradeTargets([7, 0, 0])).toEqual([[7, 0, 1]]);
		// …and nothing beyond it: a museum already on 7.0.1 is offered nothing,
		// which is the HONEST answer until a 7.0.2 is really cut.
		expect(linearUpgradeTargets([7, 0, 1])).toEqual([]);
		expect(linearUpgradeTargets([7, 0, 2])).toEqual([]);
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

describe('zip CLI canary (no vacuous green)', () => {
	// Every swap-chain test early-outs when the `zip` CLI is missing; this
	// canary turns that silent skip into ONE loud red, so a zip-less machine
	// can never report the whole chain green without exercising it.
	test('the zip CLI is available — the swap-chain gates above/below are LIVE', () => {
		expect(zipAvailable).toBe(true);
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
			// LOUD skip — the symlink-entry gate is NOT exercised in this sandbox.
			console.warn(
				'[code_update.test] SKIP: symlink creation unsupported in this sandbox — the symlink-entry rejection gate was not exercised',
			);
			return;
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
		// A registered refusal (`update.refused`); the marker sentence is both the
		// log message and the operator-facing publicMessage.
		const refusal = await refusalOf(extractArchive(zipPath, join(ROOT, 'nomark', 'q')));
		expect(refusal.code).toBe('update.refused');
		expect(refusal.message).toMatch(/not a Dédalo tree/);
	});
});

// ('updateCode refusals — engine does not own the install' retired at the
// 2026-07-11 cutover: engineOwnsInstall() is collapsed to true, so the
// ownership refusal is unreachable at runtime. The version/marker/hash
// refusals below are the surviving guards.)

describe('full swap chain against a synthetic release (mocked gate, temp tree)', () => {
	test('clean swap installs the new tree, backs the old one up (node_modules INCLUDED), and writes the pending sentinel', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'swap');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');

		// serve the release over a local origin the config "code server" matches
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;

		// the live tree we will swap (a temp dir, NOT projectRoot)
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		// the old tree's node_modules: NOT carried into the new tree; it must
		// land IN THE BACKUP — that is what makes the supervisor-side rollback
		// bootable offline (deploy/dedalo-code-rollback.sh's load-bearing note).
		mkdirSync(join(targetRoot, 'node_modules', 'dep'), { recursive: true });
		writeFileSync(join(targetRoot, 'node_modules', 'dep', 'index.js'), '// old dep');
		// .git IS preserved into the new tree
		mkdirSync(join(targetRoot, '.git'), { recursive: true });
		writeFileSync(join(targetRoot, '.git', 'HEAD'), 'ref: refs/heads/v7');
		const backupRoot = join(base, 'backups');

		try {
			mockUpdateEnv(origin);
			let restarted = '';
			const frames: UpdatePhaseFrame[] = [];
			const out = await updateCode(
				{
					file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
					waive_backup: true,
				},
				SUPERUSER,
				pipelineSeams({
					targetRoot,
					backupRoot,
					restart: (r) => {
						restarted = r;
					},
					onPhase: (frame) => frames.push(frame),
				}),
			);

			// Envelope v2: `data` names the installed release; `msg` is an extension
			// key. `update_mode` LEFT the wire (WC-2026-08-23-update-mode-clean-only).
			expect(out.ok).toBe(true);
			expect(out.data).toEqual({ version: '7.0.1' });
			expect(out.msg).toContain('Installed Dédalo 7.0.1');
			expect(restarted).toContain('7.0.1');
			// the new tree landed (marker + new file), the stale file is gone
			expect(existsSync(join(targetRoot, 'src', 'new_file.ts'))).toBe(true);
			expect(existsSync(join(targetRoot, 'src', 'stale.ts'))).toBe(false);
			// .git preserved into the new tree; node_modules NOT carried forward
			expect(existsSync(join(targetRoot, '.git', 'HEAD'))).toBe(true);
			expect(existsSync(join(targetRoot, 'node_modules', 'dep', 'index.js'))).toBe(false);
			// the old tree was backed up WITH its node_modules (rollback bootability)
			const backups = readdirSync(backupRoot).filter((n) => n.startsWith('dedalo_'));
			expect(backups.length).toBe(1);
			const backupDir = join(backupRoot, backups[0] as string);
			expect(readFileSync(join(backupDir, 'package.json'), 'utf8')).toBe('{"name":"old"}');
			expect(existsSync(join(backupDir, 'node_modules', 'dep', 'index.js'))).toBe(true);
			// THE SENTINEL (deploy/dedalo-code-rollback.sh contract): pending,
			// flat, exact keys, backupDir names an existing dir.
			const sentinel = JSON.parse(
				readFileSync(join(backupRoot, 'last_code_update.json'), 'utf8'),
			) as Record<string, unknown>;
			// `installDigest` JOINED the sentinel on 2026-08-24 (dev channel): it is
			// what boot_confirm.ts compares, because a same-version install leaves
			// `version` unable to tell the new tree from the rolled-back old one.
			expect(sentinel).toEqual({
				version: '7.0.1',
				previousVersion: '7.0.0',
				updateMode: 'clean',
				stamp: sentinel.stamp,
				backupDir,
				installDigest: sha,
				status: 'pending',
				rollback_attempted: false,
			});
			// A release install stamps the tree too, on the master channel — so a
			// published tree keeps its release posture and its plain version string.
			const installStamp = JSON.parse(
				readFileSync(join(targetRoot, 'src', 'core', 'update', 'install_stamp.json'), 'utf8'),
			) as Record<string, unknown>;
			expect(installStamp).toMatchObject({ digest: sha, channel: 'master' });
			expect(existsSync(sentinel.backupDir as string)).toBe(true);
			// phase frames: the last one before the restart carries expected_version
			const last = frames.at(-1) as UpdatePhaseFrame;
			expect(last.phase).toBe('restart');
			expect(last.expected_version).toBe('7.0.1');
			expect(frames.map((f) => f.phase)).toEqual([
				'download',
				'verify',
				'extract',
				'deps',
				'preflight',
				'swap',
				'restart',
			]);
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a checksum mismatch refuses before any tree touch', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'badsha');
		const zipPath = await buildReleaseZip(base);
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		try {
			mockUpdateEnv(origin);
			// P1 sweep: a gate REFUSES BY THROWING, and the refusal keeps its own
			// code — the catch-all must not launder it into a generic update.failed.
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: 'a'.repeat(64) },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({ targetRoot, backupRoot: join(base, 'b') }),
				),
			);
			expect(refusal.code).toBe('update.refused');
			expect(refusal.message).toContain('checksum mismatch');
			// the live tree is untouched
			expect(readFileSync(join(targetRoot, 'package.json'), 'utf8')).toBe('{"name":"old"}');
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a release with NO declared checksum is refused before anything is fetched (preconditions precede the download too)', async () => {
		// VERIFY-OR-REFUSE (2026-08-15). The check used to be `declaredSha !== '' &&
		// …`, so a request carrying no hash skipped verification entirely — and the
		// manifest never carried one, which made the whole integrity guarantee inert.
		// An unsigned release must now be un-installable, and the refusal must land
		// BEFORE the download: no request is made, no staging dir is written.
		let fetched = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () => {
				fetched += 1;
				return new Response('should never be requested');
			},
		});
		const origin = `http://localhost:${server.port}`;
		const base = join(ROOT, 'nosha');
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		try {
			mockUpdateEnv(origin);
			for (const sha of [undefined, '', 'not-hex', 'a'.repeat(63), `${'A'.repeat(64)}`]) {
				const refusal = await refusalOf(
					updateCode(
						{
							file: {
								version: '7.0.1',
								url: `${origin}/7.0.1.zip`,
								...(sha === undefined ? {} : { sha256: sha }),
							},
							waive_backup: true,
						},
						SUPERUSER,
						pipelineSeams({ targetRoot, backupRoot: join(base, 'b') }),
					),
				);
				// typed refusal (P1 sweep): a missing/malformed digest is a caller fault
				expect(refusal.code).toBe('request.invalid_options');
				expect(refusal.message).toContain('checksum');
				expect(refusal.message).toContain('sha256 must be 64 hex chars');
			}
			// nothing was downloaded and the live tree never moved
			expect(fetched).toBe(0);
			expect(readFileSync(join(targetRoot, 'package.json'), 'utf8')).toBe('{"name":"old"}');
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	});

	test('the runtime-path CENSUS refuses before the download when runtime data lives inside the tree', async () => {
		// runtime_paths.ts geoip_dir is env-driven and readEnv sees runtime env
		// mutations — plant it INSIDE the temp targetRoot and the census must
		// name it (env key on the wire) before a single byte is fetched.
		let fetched = 0;
		const server = Bun.serve({
			port: 0,
			fetch: () => {
				fetched += 1;
				return new Response('never');
			},
		});
		const origin = `http://localhost:${server.port}`;
		const base = join(ROOT, 'census');
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		const previousGeoip = process.env.DEDALO_GEOIP_DIR;
		try {
			mockUpdateEnv(origin);
			process.env.DEDALO_GEOIP_DIR = join(targetRoot, 'geoip');
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: 'a'.repeat(64) },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({ targetRoot, backupRoot: join(base, 'b') }),
				),
			);
			expect(refusal.code).toBe('update.refused');
			expect(refusal.publicMessage).toContain('Runtime data lives inside the code tree');
			expect(refusal.publicMessage).toContain('DEDALO_GEOIP_DIR');
			expect(fetched).toBe(0);
		} finally {
			if (previousGeoip === undefined) delete process.env.DEDALO_GEOIP_DIR;
			else process.env.DEDALO_GEOIP_DIR = previousGeoip;
			server.stop(true);
			unmockUpdateEnv();
		}
	});

	test('a backupRoot INSIDE the target tree is refused (its own swap would move it)', async () => {
		const base = join(ROOT, 'backup_inside');
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		const server = Bun.serve({ port: 0, fetch: () => new Response('never') });
		const origin = `http://localhost:${server.port}`;
		try {
			mockUpdateEnv(origin);
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: 'a'.repeat(64) },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({ targetRoot, backupRoot: join(targetRoot, 'backups') }),
				),
			);
			expect(refusal.code).toBe('update.refused');
			expect(refusal.message).toContain('INSIDE the code tree');
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	});

	test('the image deployment channel refuses the swap and names the remedy', async () => {
		const base = join(ROOT, 'image_channel');
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		const server = Bun.serve({ port: 0, fetch: () => new Response('never') });
		const origin = `http://localhost:${server.port}`;
		const frames: { phase: string; phases: { id: string; status: string }[]; message?: string }[] =
			[];
		try {
			mockUpdateEnv(origin);
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: 'a'.repeat(64) },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({
						targetRoot,
						backupRoot: join(base, 'b'),
						channel: 'image',
						onPhase: (frame) => frames.push(frame),
					}),
				),
			);
			expect(refusal.code).toBe('update.refused');
			expect(refusal.publicMessage).toContain('container');
			expect(refusal.publicMessage).toContain('dedalo-image-update.sh');
			// A refusal BEFORE any phase started must still REACH the phase track:
			// it emitted nothing at all until 2026-08-23, so the likeliest first-run
			// outcome left the operator staring at an all-pending track.
			expect(frames.length).toBeGreaterThan(0);
			const last = frames[frames.length - 1] as (typeof frames)[number];
			expect(last.phases.some((p) => p.status === 'failed')).toBe(true);
			expect(String(last.message)).toContain('container');
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	});

	test('an UNKNOWN root entry (deploy certs, stray logs…) refuses the swap and names it', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'unknown_root');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		writeFileSync(join(targetRoot, 'server_key.pem'), 'SECRET'); // not shipped, not preserved
		try {
			mockUpdateEnv(origin);
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({ targetRoot, backupRoot: join(base, 'b') }),
				),
			);
			expect(refusal.code).toBe('update.refused');
			expect(refusal.message).toContain('server_key.pem');
			// nothing swapped
			expect(readFileSync(join(targetRoot, 'package.json'), 'utf8')).toBe('{"name":"old"}');
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a failing installDeps / smokeBoot leaves the target tree byte-identical', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'quarantine_fail');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		const before = treeDigest(targetRoot);
		try {
			mockUpdateEnv(origin);
			for (const failing of [
				{
					installDeps: async () => {
						throw new Error('registry unreachable');
					},
				},
				{
					smokeBoot: async () => {
						throw new Error('quarantine died');
					},
				},
			] as Partial<CodeUpdateSeams>[]) {
				const refusal = await refusalOf(
					updateCode(
						{
							file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
							waive_backup: true,
						},
						SUPERUSER,
						pipelineSeams({ targetRoot, backupRoot: join(base, 'b'), ...failing }),
					),
				);
				expect(refusal.code).toBe('update.failed');
				expect(treeDigest(targetRoot)).toBe(before);
			}
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a release pinning a DIFFERENT Bun is refused before any deps install', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'pin_mismatch');
		const zipPath = await buildReleaseZip(base, (codeDir) => {
			writeFileSync(join(codeDir, '.bun-version'), '0.0.1-not-this-bun');
		});
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		try {
			mockUpdateEnv(origin);
			let depsRan = false;
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({
						targetRoot,
						backupRoot: join(base, 'b'),
						installDeps: async () => {
							depsRan = true;
						},
					}),
				),
			);
			expect(refusal.code).toBe('update.refused');
			expect(refusal.publicMessage).toContain('pins Bun 0.0.1-not-this-bun');
			expect(depsRan).toBe(false);
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a failed SECOND swap rename restores the backup in place (the pair is not atomic)', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'swap_restore');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		mkdirSync(join(targetRoot, '.git'), { recursive: true });
		writeFileSync(join(targetRoot, '.git', 'HEAD'), 'ref: refs/heads/v7');
		const before = treeDigest(targetRoot);
		const backupRoot = join(base, 'b');
		try {
			mockUpdateEnv(origin);
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({
						targetRoot,
						backupRoot,
						renameIntoPlace: () => {
							throw new Error('injected rename failure');
						},
					}),
				),
			);
			expect(refusal.code).toBe('update.failed');
			expect(refusal.message).toContain('previous tree was restored');
			// the old tree is back IN PLACE, byte-identical, .git included
			expect(treeDigest(targetRoot)).toBe(before);
			// the pre-swap pending sentinel was RETRACTED (fully restored, no
			// backup dir left — nothing for the rollback script to do)
			expect(existsSync(join(backupRoot, 'last_code_update.json'))).toBe(false);
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a failed FIRST swap rename (EBUSY mount point) leaves the live tree — .git included — untouched', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'first_rename_fail');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		mkdirSync(join(targetRoot, '.git'), { recursive: true });
		writeFileSync(join(targetRoot, '.git', 'HEAD'), 'ref: refs/heads/v7');
		const before = treeDigest(targetRoot);
		const backupRoot = join(base, 'b');
		try {
			mockUpdateEnv(origin);
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({
						targetRoot,
						backupRoot,
						renameToBackup: () => {
							throw new Error('EBUSY: resource busy or locked (bind-mounted checkout)');
						},
					}),
				),
			);
			expect(refusal.code).toBe('update.failed');
			expect(refusal.message).toContain('first rename');
			// NOTHING moved: .git and every other entry still in the live tree
			expect(existsSync(join(targetRoot, '.git', 'HEAD'))).toBe(true);
			expect(treeDigest(targetRoot)).toBe(before);
			// staging swept (no stranded quarantine), pending sentinel retracted
			expect(existsSync(join(backupRoot, '.code_staging'))).toBe(false);
			expect(existsSync(join(backupRoot, 'last_code_update.json'))).toBe(false);
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('the pending sentinel is ON DISK, naming the intended backupDir, BEFORE the first swap rename', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'sentinel_order');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		const backupRoot = join(base, 'b');
		// The FIRST-rename seam observes the disk AT THE MOMENT the tree is
		// about to move — an end-state assertion could not prove the ordering.
		let observed: { status: unknown; backupDir: unknown; targetIntact: boolean } | null = null;
		try {
			mockUpdateEnv(origin);
			const out = await updateCode(
				{
					file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
					waive_backup: true,
				},
				SUPERUSER,
				pipelineSeams({
					targetRoot,
					backupRoot,
					renameToBackup: (from, to) => {
						const sentinel = JSON.parse(
							readFileSync(join(backupRoot, 'last_code_update.json'), 'utf8'),
						) as Record<string, unknown>;
						observed = {
							status: sentinel.status,
							backupDir: sentinel.backupDir,
							targetIntact: existsSync(join(from, 'package.json')),
						};
						renameSync(from, to);
					},
				}),
			);
			expect(out.ok).toBe(true);
			expect(observed).not.toBeNull();
			const seen = observed as unknown as {
				status: unknown;
				backupDir: unknown;
				targetIntact: boolean;
			};
			expect(seen.status).toBe('pending');
			expect(seen.targetIntact).toBe(true); // the live tree had not moved yet
			// the sentinel named the backupDir the swap then actually created
			const backups = readdirSync(backupRoot).filter((n) => n.startsWith('dedalo_'));
			expect(backups.length).toBe(1);
			expect(seen.backupDir).toBe(join(backupRoot, backups[0] as string));
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a failed sentinel WRITE refuses BEFORE the tree is touched (byte-identical, no backup dir)', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'sentinel_fail');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		const before = treeDigest(targetRoot);
		const backupRoot = join(base, 'b');
		// Make the sentinel path unwritable: a DIRECTORY where the file goes.
		mkdirSync(join(backupRoot, 'last_code_update.json'), { recursive: true });
		try {
			mockUpdateEnv(origin);
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({ targetRoot, backupRoot }),
				),
			);
			expect(refusal.code).toBe('update.failed');
			expect(refusal.message).toContain('sentinel');
			// the live tree never moved, byte-identical; no backup dir was created
			expect(treeDigest(targetRoot)).toBe(before);
			expect(readdirSync(backupRoot).filter((n) => n.startsWith('dedalo_'))).toEqual([]);
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a DOUBLE swap failure parks the new tree in staging, cleanup refuses to delete it, next run refuses', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'double_fail');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		mkdirSync(join(targetRoot, '.git'), { recursive: true });
		writeFileSync(join(targetRoot, '.git', 'HEAD'), 'ref: refs/heads/v7');
		const backupRoot = join(base, 'b');
		const stagingDir = join(backupRoot, '.code_staging');
		try {
			mockUpdateEnv(origin);
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({
						targetRoot,
						backupRoot,
						renameIntoPlace: () => {
							throw new Error('injected second-rename failure');
						},
						renameRestore: () => {
							throw new Error('injected restore failure');
						},
					}),
				),
			);
			expect(refusal.code).toBe('update.failed');
			expect(refusal.publicMessage).toContain('parked in staging (NOT deleted)');
			// THE INVARIANT: the new tree survives in staging and the cleanup did
			// NOT delete it (the only copy of a tree never lives where rm-rf runs)
			const parkedCodeRoot = join(stagingDir, 'extract', 'dedalo_code');
			expect(existsSync(join(parkedCodeRoot, 'package.json'))).toBe(true);
			expect(existsSync(join(parkedCodeRoot, 'src', 'new_file.ts'))).toBe(true);
			// the OLD tree survives in the backup dir, .git moved back into it
			const backups = readdirSync(backupRoot).filter((n) => n.startsWith('dedalo_'));
			expect(backups.length).toBe(1);
			const backupDir = join(backupRoot, backups[0] as string);
			expect(readFileSync(join(backupDir, 'package.json'), 'utf8')).toBe('{"name":"old"}');
			expect(existsSync(join(backupDir, '.git', 'HEAD'))).toBe(true);
			// the pending sentinel STAYS (the supervisor rollback restores the backup)
			const sentinel = JSON.parse(
				readFileSync(join(backupRoot, 'last_code_update.json'), 'utf8'),
			) as Record<string, unknown>;
			expect(sentinel.status).toBe('pending');
			expect(sentinel.backupDir).toBe(backupDir);
			// a NEXT run refuses to sweep the marked staging dir (the refusal fires
			// before anything else touches the disk)
			const targetRoot2 = join(base, 'live2');
			buildLiveTree(targetRoot2);
			const next = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({ targetRoot: targetRoot2, backupRoot }),
				),
			);
			expect(next.code).toBe('update.refused');
			expect(next.message).toContain('parked tree');
			expect(existsSync(join(parkedCodeRoot, 'package.json'))).toBe(true);
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('a nested untracked secret under a SHIPPED dir (deploy/certs/key.pem) refuses the swap', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'nested_secret');
		const zipPath = await buildReleaseZip(base, (codeDir) => {
			// the release SHIPS deploy/ — the top-level whitelist passes it
			mkdirSync(join(codeDir, 'deploy'), { recursive: true });
			writeFileSync(join(codeDir, 'deploy', 'README.md'), '# deploy');
		});
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;
		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		mkdirSync(join(targetRoot, 'deploy', 'certs'), { recursive: true });
		writeFileSync(join(targetRoot, 'deploy', 'certs', 'key.pem'), 'TLS PRIVATE KEY');
		try {
			mockUpdateEnv(origin);
			const refusal = await refusalOf(
				updateCode(
					{
						file: { version: '7.0.1', url: `${origin}/7.0.1.zip`, sha256: sha },
						waive_backup: true,
					},
					SUPERUSER,
					pipelineSeams({ targetRoot, backupRoot: join(base, 'b') }),
				),
			);
			expect(refusal.code).toBe('update.refused');
			expect(refusal.message).toContain('deploy/certs');
			// nothing swapped, the key never moved
			expect(readFileSync(join(targetRoot, 'deploy', 'certs', 'key.pem'), 'utf8')).toBe(
				'TLS PRIVATE KEY',
			);
			expect(readFileSync(join(targetRoot, 'package.json'), 'utf8')).toBe('{"name":"old"}');
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);
});

describe('boot_confirm (the sentinel second half)', () => {
	test('a pending sentinel for the RUNNING version flips to confirmed; a mismatch is left untouched', async () => {
		const dir = join(ROOT, 'confirm');
		mkdirSync(dir, { recursive: true });
		const sentinelPath = join(dir, 'last_code_update.json');
		const base = {
			version: '7.0.1',
			previousVersion: '7.0.0',
			updateMode: 'clean',
			stamp: '2026-08-23T10-00-00',
			backupDir: dir,
			status: 'pending',
			rollback_attempted: false,
		};
		writeFileSync(sentinelPath, JSON.stringify(base));
		await confirmBootedCodeUpdate(sentinelPath, '7.0.1');
		const confirmed = JSON.parse(readFileSync(sentinelPath, 'utf8')) as Record<string, unknown>;
		expect(confirmed.status).toBe('confirmed');
		expect(confirmed.backupDir).toBe(dir);

		// a DIFFERENT running version (rollback happened / half-applied swap):
		// logged loudly, sentinel untouched — the rollback script owns it.
		writeFileSync(sentinelPath, JSON.stringify(base));
		await confirmBootedCodeUpdate(sentinelPath, '7.0.0');
		const untouched = JSON.parse(readFileSync(sentinelPath, 'utf8')) as Record<string, unknown>;
		expect(untouched.status).toBe('pending');

		// an already-confirmed sentinel is a no-op
		await confirmBootedCodeUpdate(sentinelPath, '7.0.1');
	});
});

// ---------------------------------------------------------------------------
// The EXCLUSIVE RUN LOCK — the pipeline's single-flight invariant.
// Before it, two concurrent updates shared one `<backupRoot>/.code_staging`
// and the second swept the first's already-smoke-booted quarantine.
// ---------------------------------------------------------------------------
describe('code-update run lock (single-flight)', () => {
	function scratchRoot(name: string): string {
		const dir = join(mkdtempSync(join(tmpdir(), 'dedalo_run_lock_')), name);
		mkdirSync(dir, { recursive: true });
		return dir;
	}

	test('a second run REFUSES while the first holds the lock', () => {
		const backupRoot = scratchRoot('held');
		const release = acquireRunLockOrRefuse(backupRoot, '7.0.1');
		expect(existsSync(codeRunLockPath(backupRoot))).toBe(true);

		// The live owner is THIS process, so the dead-owner rule cannot apply.
		const refusal = refusalOfSync(() => acquireRunLockOrRefuse(backupRoot, '7.0.1'));
		expect(refusal.code).toBe('update.refused');
		expect(refusal.publicMessage).toContain('already running');
		expect(refusal.publicMessage).toContain('7.0.1');

		release();
		expect(existsSync(codeRunLockPath(backupRoot))).toBe(false);
		// Released — the next run may proceed.
		acquireRunLockOrRefuse(backupRoot, '7.0.2')();
	});

	test('a STALE lock from a dead owner is reclaimed, not a permanent wedge', () => {
		const backupRoot = scratchRoot('stale');
		// The success path ALWAYS leaves one of these: the process dies in the
		// planned restart moments after releasing. A pid that cannot exist must
		// never block the next update.
		writeFileSync(
			codeRunLockPath(backupRoot),
			JSON.stringify({ pid: 2147483646, version: '7.0.1', startedAt: '2026-01-01T00:00:00Z' }),
		);
		const release = acquireRunLockOrRefuse(backupRoot, '7.0.2');
		expect(JSON.parse(readFileSync(codeRunLockPath(backupRoot), 'utf8')).pid).toBe(process.pid);
		release();
	});

	test('a lock whose owner is unreadable is treated as dead (never a wedge)', () => {
		const backupRoot = scratchRoot('garbage');
		writeFileSync(codeRunLockPath(backupRoot), 'not json at all');
		acquireRunLockOrRefuse(backupRoot, '7.0.1')();
	});
});

// ---------------------------------------------------------------------------
// THE CATALOG MAY NOT RUN AHEAD OF THE ENGINE.
//
// UPDATE_CATALOG once shipped '702' and '703' — rungs for releases nobody had
// cut, added so the museum-cycle probe could walk several hops. They were not
// inert: `scripts/update_drill.ts` picks the NEWEST descriptor, so
// `bun run test:update` rehearsed 7.0.2 → 7.0.3, a hop that will never be cut,
// instead of the rung a release manager actually ships. Meanwhile the shipped
// manifest advertised upgrade paths to archives that do not exist.
//
// The rule: every catalog target is at most ONE rung past the running engine.
// A probe that needs to repeat resets the museum to the rung's FROM end.
// ---------------------------------------------------------------------------
describe('UPDATE_CATALOG may not run ahead of the engine', () => {
	test('every target is at most one rung past DEDALO_VERSION_TRIPLE', () => {
		const engine = [...DEDALO_VERSION_TRIPLE];
		const ahead = Object.entries(UPDATE_CATALOG).filter(([, descriptor]) => {
			const target = [descriptor.versionMajor, descriptor.versionMedium, descriptor.versionMinor];
			// Legal: the engine's own version, or exactly one legal rung past it.
			if (assertLinearUpgrade(engine, target) === null) return false;
			return compareVersionArrays(target, engine) === 1;
		});
		expect(
			ahead.map(([key]) => key),
			'a catalog rung beyond the next one advertises a release nobody can cut, and makes update_drill.ts rehearse a fiction — reset the probe museum instead',
		).toEqual([]);
	});

	test('every catalog rung chains from a version the engine can reach', () => {
		// No orphan islands: each descriptor's `updateFrom` is either the
		// engine's version or another descriptor's target.
		const targets = new Set(
			Object.values(UPDATE_CATALOG).map(
				(d) => `${d.versionMajor}.${d.versionMedium}.${d.versionMinor}`,
			),
		);
		targets.add(DEDALO_VERSION_TRIPLE.join('.'));
		for (const [key, d] of Object.entries(UPDATE_CATALOG)) {
			const from = `${d.updateFromMajor}.${d.updateFromMedium}.${d.updateFromMinor}`;
			expect(
				targets.has(from),
				`catalog rung '${key}' upgrades from ${from}, which nothing reaches`,
			).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// THE SAME-VERSION IDENTITY GATE (dev channel, 2026-08-24).
// A dev install swaps a tree whose VERSION IS UNCHANGED, so the version can no
// longer answer "did the new tree boot?": after a rollback the OLD tree matches
// the pending sentinel exactly, boot confirmation flips it to `confirmed`, and
// the supervisor-side rollback (deploy/dedalo-code-rollback.sh) is silently
// disarmed for the class of build most likely to fail. The installed ARCHIVE
// DIGEST is the identity token instead.
// ---------------------------------------------------------------------------
describe('boot_confirm under a same-version (dev channel) install', () => {
	const DIGEST_NEW = 'a'.repeat(64);
	const DIGEST_OLD = 'b'.repeat(64);

	function pendingSentinel(dir: string): Record<string, unknown> {
		return {
			version: '7.0.1',
			previousVersion: '7.0.1', // SAME version — the dev-channel case
			updateMode: 'clean',
			stamp: '2026-08-24T10-00-00',
			backupDir: dir,
			installDigest: DIGEST_NEW,
			status: 'pending',
			rollback_attempted: false,
		};
	}

	test('the rolled-back OLD tree does NOT confirm: same version, different installed digest', async () => {
		const dir = join(ROOT, 'confirm_same_version_rollback');
		mkdirSync(dir, { recursive: true });
		const sentinelPath = join(dir, 'last_code_update.json');
		writeFileSync(sentinelPath, JSON.stringify(pendingSentinel(dir)));

		// The tree that actually booted carries the PREVIOUS archive's digest.
		await confirmBootedCodeUpdate(sentinelPath, '7.0.1', DIGEST_OLD);

		const after = JSON.parse(readFileSync(sentinelPath, 'utf8')) as Record<string, unknown>;
		expect(after.status).toBe('pending');
	});

	test('the NEW tree confirms: same version, matching installed digest', async () => {
		const dir = join(ROOT, 'confirm_same_version_ok');
		mkdirSync(dir, { recursive: true });
		const sentinelPath = join(dir, 'last_code_update.json');
		writeFileSync(sentinelPath, JSON.stringify(pendingSentinel(dir)));

		await confirmBootedCodeUpdate(sentinelPath, '7.0.1', DIGEST_NEW);

		const after = JSON.parse(readFileSync(sentinelPath, 'utf8')) as Record<string, unknown>;
		expect(after.status).toBe('confirmed');
	});

	test('a legacy sentinel with no installDigest still confirms on the version alone', async () => {
		const dir = join(ROOT, 'confirm_legacy');
		mkdirSync(dir, { recursive: true });
		const sentinelPath = join(dir, 'last_code_update.json');
		const legacy = pendingSentinel(dir);
		delete legacy.installDigest;
		writeFileSync(sentinelPath, JSON.stringify(legacy));

		await confirmBootedCodeUpdate(sentinelPath, '7.0.1', null);

		const after = JSON.parse(readFileSync(sentinelPath, 'utf8')) as Record<string, unknown>;
		expect(after.status).toBe('confirmed');
	});
});

// ---------------------------------------------------------------------------
// The DEV CHANNEL relaxes an ORDERING guard, never an authenticity one: the
// same version becomes installable (that IS the feature — a `v7` branch build
// carries no version bump), while downgrades and rung skips stay refused.
// ---------------------------------------------------------------------------
describe('assertLinearUpgrade on the dev channel', () => {
	test('the SAME version is allowed on dev and still refused on the release channel', () => {
		expect(assertLinearUpgrade([7, 0, 1], [7, 0, 1], 'dev')).toBeNull();
		expect(assertLinearUpgrade([7, 0, 1], [7, 0, 1], 'master')).toBe(
			'refusing a downgrade or same-version install',
		);
		// the default is the release channel — an omitted channel never relaxes
		expect(assertLinearUpgrade([7, 0, 1], [7, 0, 1])).toBe(
			'refusing a downgrade or same-version install',
		);
	});

	test('dev still refuses a downgrade', () => {
		expect(assertLinearUpgrade([7, 0, 1], [7, 0, 0], 'dev')).toBe(
			'refusing a downgrade or same-version install',
		);
	});

	test('dev still refuses a rung skip', () => {
		expect(assertLinearUpgrade([7, 0, 0], [7, 0, 3], 'dev')).toBe('patch version skip is not allowed');
		expect(assertLinearUpgrade([7, 0, 0], [9, 0, 0], 'dev')).toBe('major version skip is not allowed');
	});

	test('dev allows the next rung, exactly like the release channel', () => {
		expect(assertLinearUpgrade([7, 0, 0], [7, 0, 1], 'dev')).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// THE DEV-CHANNEL SWAP end to end: same version, and the tree that lands must
// be IDENTIFIABLE afterwards — the version no longer distinguishes it from the
// tree it replaced, so the install stamp and the sentinel's digest are the only
// things standing between a landed swap and a rollback that looks identical.
// ---------------------------------------------------------------------------
describe('full swap chain on the DEV CHANNEL (same version)', () => {
	test('a same-version dev release installs, stamps the tree, and records its digest in the sentinel', async () => {
		if (!zipAvailable) return;
		const base = join(ROOT, 'dev_swap');
		const zipPath = await buildReleaseZip(base);
		const sha = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
		const previousDigest = 'd'.repeat(64);

		const server = Bun.serve({ port: 0, fetch: () => new Response(readFileSync(zipPath)) });
		const origin = `http://localhost:${server.port}`;

		const targetRoot = join(base, 'live');
		buildLiveTree(targetRoot);
		// the live tree was itself installed by an earlier dev iteration
		mkdirSync(join(targetRoot, 'src', 'core', 'update'), { recursive: true });
		writeFileSync(
			join(targetRoot, 'src', 'core', 'update', 'install_stamp.json'),
			JSON.stringify({ digest: previousDigest, channel: 'dev' }),
		);
		const backupRoot = join(base, 'backups');
		const version = DEDALO_VERSION_TRIPLE.join('.'); // the SAME version we run

		try {
			mockUpdateEnv(origin);
			const out = await updateCode(
				{
					file: {
						version,
						url: `${origin}/${version}-dev.zip`,
						sha256: sha,
						channel: 'dev',
					},
					waive_backup: true,
				},
				SUPERUSER,
				pipelineSeams({ targetRoot, backupRoot, restart: () => {} }),
			);
			expect(out.ok).toBe(true);
			expect(out.data).toEqual({ version });

			// THE INSTALL STAMP: the new tree names the archive it came from and
			// the channel that built it (which is what restores its `.dev` tag).
			const stamp = JSON.parse(
				readFileSync(join(targetRoot, 'src', 'core', 'update', 'install_stamp.json'), 'utf8'),
			) as Record<string, unknown>;
			expect(stamp.digest).toBe(sha);
			expect(stamp.channel).toBe('dev');
			expect(stamp.source_url).toBe(`${origin}/${version}-dev.zip`);

			// THE SENTINEL carries the same digest: boot_confirm compares THAT,
			// not the (unchanged) version, so a rollback stays loud.
			const sentinel = JSON.parse(
				readFileSync(join(backupRoot, 'last_code_update.json'), 'utf8'),
			) as Record<string, unknown>;
			expect(sentinel.installDigest).toBe(sha);
			expect(sentinel.version).toBe(version);
			expect(sentinel.previousVersion).toBe(version);

			// THE RESTORE POINT is identifiable: same version every iteration, so
			// the name carries the digest of the tree it holds.
			const backups = readdirSync(backupRoot).filter((n) => n.startsWith('dedalo_'));
			expect(backups.length).toBe(1);
			expect(backups[0]).toContain(`_${previousDigest.slice(0, 7)}_`);
		} finally {
			server.stop(true);
			unmockUpdateEnv();
		}
	}, 60000);

	test('the same-version release is REFUSED without the dev channel', async () => {
		const version = DEDALO_VERSION_TRIPLE.join('.');
		const refusal = await refusalOf(
			updateCode(
				{
					file: { version, url: `http://localhost:1/${version}.zip`, sha256: 'e'.repeat(64) },
					waive_backup: true,
				},
				SUPERUSER,
				pipelineSeams({ targetRoot: join(ROOT, 'never_touched') }),
			),
		);
		expect(refusal.message).toContain('same-version install');
	});
});
