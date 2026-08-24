/**
 * TRIPWIRE — the restart-after-persist supervisor contract (DEC-19).
 *
 * `persist_config` writes ../private/.env and then KILLS the server on purpose:
 * `config` is frozen at import, so only a fresh process can serve the new
 * configuration. That is only half a mechanism — something must bring the
 * process back, or the install wizard hangs forever at "Save configuration"
 * with nothing listening for its "Verify active configuration" click.
 *
 * That is not hypothetical: src/core/install/restart.ts used to justify its
 * exit by naming a `start:supervised` loop that WAS NEVER WRITTEN. Production
 * (systemd `Restart=always`) was fine; every dev running the documented
 * `bun run dev` got a dead server and a stuck installer.
 *
 * So the contract is mechanical, not prose:
 *   1. the supervised run scripts EXIST in package.json, and
 *   2. they respawn on exactly RESTART_EXIT_CODE — the one the server actually
 *      exits with — and on nothing else (a graceful ^C exits 0 and must QUIT,
 *      a crash exits non-zero and must NOT hot-loop), and
 *   3. the systemd unit does not count that planned exit as a failure, and
 *   4. the systemd unit CREATES the socket directory (RuntimeDirectory), and every
 *      shipped consumer of the socket agrees on one canonical /run/dedalo path — a
 *      fresh-install 502 traced to a missing /run/dedalo and a /tmp-vs-/run drift.
 */

import { describe, expect, test } from 'bun:test';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RESTART_EXIT_CODE } from '../../src/core/install/restart.ts';

const pkg = (await Bun.file(new URL('../../package.json', import.meta.url)).json()) as {
	scripts: Record<string, string>;
};

/** The run scripts that must survive a restart-after-persist unattended. */
const SUPERVISED_SCRIPTS = ['start:supervised', 'dev'];

describe('install restart supervisor contract', () => {
	test('RESTART_EXIT_CODE is a real, non-zero, non-signal exit code', () => {
		// 0 would collide with a graceful shutdown; >125 collides with the shell's
		// signal/not-found encodings.
		expect(RESTART_EXIT_CODE).toBeGreaterThan(0);
		expect(RESTART_EXIT_CODE).toBeLessThan(126);
	});

	test('the server exits with RESTART_EXIT_CODE (not a bare 0) to ask for a restart', async () => {
		const src = await Bun.file(
			new URL('../../src/core/install/restart.ts', import.meta.url),
		).text();
		expect(src).toContain('process.exit(RESTART_EXIT_CODE)');
		// A literal exit(0) here would silently re-break the supervisor loops:
		// they cannot distinguish it from an operator ^C.
		expect(src).not.toContain('process.exit(0)');
	});

	for (const name of SUPERVISED_SCRIPTS) {
		test(`package.json '${name}' exists and respawns on exactly ${RESTART_EXIT_CODE}`, async () => {
			const script = pkg.scripts[name];
			// The failure this whole file exists to prevent: the code names a
			// supervisor script that nobody ever wrote.
			expect(script).toBeString();

			// A supervisor may be written two ways, and BOTH must satisfy the same contract:
			//
			//   (a) INLINE in package.json — a shell `while` loop (start:supervised);
			//   (b) DELEGATED to a TS file — `bun run scripts/<x>.ts` (dev, which also runs the
			//       CSS watcher, so it outgrew a one-line shell script).
			//
			// Resolve (b) to the file that actually holds the loop, then apply the SAME two
			// assertions to whichever source really implements it. Checking only the
			// package.json string would let a delegated supervisor drop the contract silently.
			const delegated = /bun run (scripts\/[\w./-]+\.ts)/.exec(script ?? '');
			const source =
				delegated?.[1] === undefined
					? (script as string)
					: await Bun.file(new URL(`../../${delegated[1]}`, import.meta.url)).text();

			// It must key on the SAME code the server exits with — not a stale copy. A TS
			// supervisor proves that by IMPORTING the constant; a shell one has no imports, so
			// it may only spell the number.
			if (delegated?.[1] === undefined) {
				expect(source).toContain(String(RESTART_EXIT_CODE));
				// ...and it must propagate any OTHER code instead of looping on it, so
				// ^C (exit 0) quits and a crash stops rather than spinning.
				expect(source).toContain('exit $code');
			} else {
				expect(source).toContain('RESTART_EXIT_CODE');
				expect(source).toContain('install/restart.ts');
				// Same rule, TS spelling: anything that is NOT the restart code is propagated.
				expect(source).toContain('code !== RESTART_EXIT_CODE');
				expect(source).toContain('process.exit(code)');
			}
		});
	}

	test('systemd does not book the planned restart exit as a failure', async () => {
		const unit = await Bun.file(new URL('../../deploy/dedalo-ts.service', import.meta.url)).text();
		expect(unit).toContain(`SuccessExitStatus=${RESTART_EXIT_CODE}`);
		// Restart=always is what actually brings it back in production.
		expect(unit).toContain('Restart=always');
	});

	// Restart=always is NOT self-sufficient: systemd's default start-limit (5 starts
	// per 10 s) sits right on top of RestartSec=3, so a burst of PLANNED restarts or
	// a slow Postgres can leave the unit `failed` with nothing to bring it back —
	// the exact outage Restart=always is there to prevent.
	test('dedalo-ts.service widens the crash-loop budget past its own restart cadence', async () => {
		const unit = await Bun.file(new URL('../../deploy/dedalo-ts.service', import.meta.url)).text();
		const interval = unit.match(/^StartLimitIntervalSec=(\d+)$/m);
		const burst = unit.match(/^StartLimitBurst=(\d+)$/m);
		const restartSec = unit.match(/^RestartSec=(\d+)$/m);
		expect(interval).not.toBeNull();
		expect(burst).not.toBeNull();
		expect(restartSec).not.toBeNull();
		// The budget must allow at least `burst` restarts at the configured cadence,
		// i.e. the window has to be wider than burst × RestartSec.
		const windowSeconds = Number(interval?.[1]);
		const allowedStarts = Number(burst?.[1]);
		const cadenceSeconds = Number(restartSec?.[1]);
		expect(windowSeconds).toBeGreaterThan(allowedStarts * cadenceSeconds);
	});

	// engineering/PRODUCTION.md promises diffusion runners survive a restart. That
	// promise lives ENTIRELY in this line: systemd's default KillMode=control-group
	// SIGTERMs (then SIGKILLs) every runner alongside the server, truncating long
	// publications mid-flight while the doc still claims they survive.
	test('dedalo-ts.service signals only the server, so diffusion runners survive', async () => {
		const unit = await Bun.file(new URL('../../deploy/dedalo-ts.service', import.meta.url)).text();
		expect(unit).toMatch(/^KillMode=process$/m);
	});

	// The socket-directory contract (added after a fresh-install 502). The engine
	// binds SERVER_UNIX_SOCKET but does NOT create its parent dir, and /run is a
	// tmpfs wiped every reboot — so the shipped unit MUST create /run/dedalo via
	// RuntimeDirectory, and every shipped consumer of the socket MUST name the one
	// canonical path. A /tmp-vs-/run drift makes the watchdog probe the wrong socket
	// and fire OnFailure=dedalo-ts-restart every 30 s in a loop.
	const CANONICAL_SOCKET = '/run/dedalo/dedalo_ts.sock';
	const STALE_SOCKET = '/tmp/dedalo_ts.sock';

	test('dedalo-ts.service creates the socket dir with RuntimeDirectory=dedalo', async () => {
		const unit = await Bun.file(new URL('../../deploy/dedalo-ts.service', import.meta.url)).text();
		expect(unit).toContain('RuntimeDirectory=dedalo');
	});

	test('the watchdog and the reverse proxy agree on /run/dedalo (no /tmp drift)', async () => {
		const watchdog = await Bun.file(
			new URL('../../deploy/dedalo-ts-watchdog.service', import.meta.url),
		).text();
		const nginx = await Bun.file(new URL('../../deploy/nginx.conf', import.meta.url)).text();

		expect(watchdog).toContain(CANONICAL_SOCKET);
		expect(watchdog).not.toContain(STALE_SOCKET);
		// nginx's upstream must reach the same socket the engine binds.
		expect(nginx).toContain(CANONICAL_SOCKET);
		expect(nginx).not.toContain(STALE_SOCKET);

		// Same for the Apache twin: a drifted socket there is the same 502.
		const apache = await Bun.file(new URL('../../deploy/apache.conf', import.meta.url)).text();
		expect(apache).toContain(CANONICAL_SOCKET);
		expect(apache).not.toContain(STALE_SOCKET);
	});

	// THE /health ROUTE (2026-08-24): the engine serves its liveness check at the
	// ORIGIN ROOT (src/server.ts) and the BROWSER client probes it over HTTP
	// (data_manager.js getHealthUrl, the system_info + update_code widgets, sw.js).
	// A proxy config that does not route it does not fail loudly: the engine stays
	// healthy while the widget reports it down and the post-update restart poll
	// can never confirm the new version — observed as Apache AH01630 denying
	// /var/www/html/health. Both shipped proxy configs must carry the route.
	test('both shipped proxy configs route /health to the engine', async () => {
		const nginx = await Bun.file(new URL('../../deploy/nginx.conf', import.meta.url)).text();
		const apache = await Bun.file(new URL('../../deploy/apache.conf', import.meta.url)).text();

		expect(nginx).toMatch(/location\s*=\s*\/health\s*\{/);
		expect(apache).toMatch(/^\s*ProxyPass\s+\/health\s+unix:/m);
	});

	// -----------------------------------------------------------------------
	// THE CODE-UPDATE ROLLBACK CONTRACT (2026-08-23): the update pipeline
	// (src/core/update/code_update.ts) writes a pending sentinel and restarts;
	// systemd must (a) fire the rollback when the new tree never boots
	// (OnFailure= on the main unit) and (b) let the watchdog SCRIPT choose
	// rollback-vs-restart itself (so its unit must NOT carry an OnFailure=
	// that would race the rollback it just started).
	// -----------------------------------------------------------------------

	test('dedalo-ts.service fires the rollback unit on failure', async () => {
		const unit = await Bun.file(new URL('../../deploy/dedalo-ts.service', import.meta.url)).text();
		expect(unit).toMatch(/^OnFailure=dedalo-ts-rollback\.service$/m);
	});

	test('the rollback unit exists and runs the rollback script on the canonical socket', async () => {
		const unit = await Bun.file(
			new URL('../../deploy/dedalo-ts-rollback.service', import.meta.url),
		).text();
		expect(unit).toContain('dedalo-code-rollback.sh');
		expect(unit).toContain(CANONICAL_SOCKET);
		expect(unit).not.toContain(STALE_SOCKET);
	});

	test('the watchdog unit runs the probe SCRIPT and carries no OnFailure of its own', async () => {
		const unit = await Bun.file(
			new URL('../../deploy/dedalo-ts-watchdog.service', import.meta.url),
		).text();
		// The remedy choice lives in the script; an OnFailure= restart here would
		// race the rollback the script just started.
		expect(unit).toMatch(/^ExecStart=.*dedalo-ts-watchdog\.sh/m);
		expect(unit).not.toMatch(/^OnFailure=/m);
	});

	test('the rollback + watchdog SCRIPTS agree with the pipeline on the sentinel and the socket', async () => {
		const rollback = await Bun.file(
			new URL('../../deploy/dedalo-code-rollback.sh', import.meta.url),
		).text();
		const watchdogSh = await Bun.file(
			new URL('../../deploy/dedalo-ts-watchdog.sh', import.meta.url),
		).text();
		const pipeline = await Bun.file(
			new URL('../../src/core/update/code_update.ts', import.meta.url),
		).text();
		// One sentinel name across writer and both readers.
		for (const text of [rollback, watchdogSh, pipeline]) {
			expect(text).toContain('last_code_update.json');
		}
		// The scripts key on the exact machine-written pending state.
		expect(rollback).toContain('"pending"');
		expect(watchdogSh).toContain('rollback_attempted');
		// Socket literal still agrees (script defaults).
		expect(rollback).toContain(CANONICAL_SOCKET);
		expect(watchdogSh).toContain(CANONICAL_SOCKET);
		// LOAD-BEARING: the backup keeps node_modules (rollback bootability) —
		// the pipeline must not preserve it forward across the swap.
		expect(pipeline).toMatch(/PRESERVE_ROOT_ENTRIES[^\n]*=\s*new Set\(\['\.git'\]\)/);
	});

	// -----------------------------------------------------------------------
	// SUPERVISOR REACHABILITY + BACKUP-ROOT RESOLUTION (2026-08-23 review):
	// (A) the rollback/watchdog scripts' INSTALLED location must be OUTSIDE
	//     the swapped tree — in crash window W1 (old tree renamed away, new
	//     tree not yet in) an in-tree ExecStart has no script to run and the
	//     install is bricked exactly when automatic rollback was the point;
	// (B) the scripts must resolve DEDALO_BACKUP_PATH the way the engine does
	//     (process env, then <private>/.env, then the default) — the units do
	//     not source .env, so a default-only script is silently inert on any
	//     install that relocated backups;
	// (C) a sentinel written pre-swap may name a backupDir that never got
	//     created — four explicit states, driven below against a real fixture.
	// -----------------------------------------------------------------------

	const deployDir = new URL('../../deploy/', import.meta.url).pathname;

	test('every shell script in deploy/ parses (bash -n)', () => {
		const scripts = readdirSync(deployDir).filter((f) => f.endsWith('.sh'));
		expect(scripts.length).toBeGreaterThanOrEqual(4);
		for (const script of scripts) {
			const proc = Bun.spawnSync(['bash', '-n', `${deployDir}${script}`], {
				stderr: 'pipe',
			});
			expect(`${script}: ${proc.stderr.toString()}`).toBe(`${script}: `);
			expect(proc.exitCode).toBe(0);
		}
	});

	test('rollback + watchdog units execute scripts OUTSIDE the app tree (finding A)', async () => {
		const APP_DIR = '/opt/dedalo/master_dedalo';
		for (const unitName of ['dedalo-ts-rollback.service', 'dedalo-ts-watchdog.service']) {
			const unit = await Bun.file(new URL(`../../deploy/${unitName}`, import.meta.url)).text();
			const exec = unit.match(/^ExecStart=(\S+)/m);
			expect(exec).not.toBeNull();
			// The load-bearing property: the executable survives the tree swap.
			expect(exec?.[1]?.startsWith(`${APP_DIR}/`)).toBe(false);
			// And the concrete out-of-tree home, so docs/units cannot drift apart.
			expect(exec?.[1]?.startsWith('/opt/dedalo/bin/')).toBe(true);
		}
	});

	test('both scripts resolve DEDALO_BACKUP_PATH like the engine, not default-only (finding B)', async () => {
		for (const name of ['dedalo-code-rollback.sh', 'dedalo-ts-watchdog.sh']) {
			const script = await Bun.file(new URL(`../../deploy/${name}`, import.meta.url)).text();
			// process-env override…
			expect(script).toContain('DEDALO_BACKUP_PATH');
			// …then the engine's .env location, honoring DEDALO_PRIVATE_DIR…
			expect(script).toContain('DEDALO_PRIVATE_DIR');
			expect(script).toContain('/.env');
			// …and a LOUD degradation when the file is unreadable.
			expect(script).toContain('falling back to the default backup root');
		}
	});

	// --- fixture drills: the four sentinel states, on a real filesystem -----

	const ROLLBACK_SH = new URL('../../deploy/dedalo-code-rollback.sh', import.meta.url).pathname;

	interface Fixture {
		root: string;
		appDir: string;
		backupRoot: string;
		backupDir: string;
		sentinel: string;
		binDir: string;
		systemctlLog: string;
	}

	function makeFixture(): Fixture {
		const root = mkdtempSync(join(tmpdir(), 'dedalo_rollback_drill_'));
		const appDir = join(root, 'master_dedalo');
		const backupRoot = join(root, 'backups', 'code');
		const backupDir = join(backupRoot, 'backup_stamp1');
		const binDir = join(root, 'bin');
		const systemctlLog = join(root, 'systemctl.log');
		mkdirSync(backupRoot, { recursive: true });
		mkdirSync(binDir, { recursive: true });
		// Stub systemctl (records calls) and curl (health always green).
		writeFileSync(
			join(binDir, 'systemctl'),
			`#!/usr/bin/env bash\necho "systemctl $*" >> "${systemctlLog}"\nexit 0\n`,
		);
		writeFileSync(join(binDir, 'curl'), '#!/usr/bin/env bash\nexit 0\n');
		chmodSync(join(binDir, 'systemctl'), 0o755);
		chmodSync(join(binDir, 'curl'), 0o755);
		return {
			root,
			appDir,
			backupRoot,
			backupDir,
			sentinel: join(backupRoot, 'last_code_update.json'),
			binDir,
			systemctlLog,
		};
	}

	function plantTree(dir: string, marker: string): void {
		mkdirSync(join(dir, 'src'), { recursive: true });
		writeFileSync(join(dir, 'src', 'server.ts'), `// ${marker}\n`);
	}

	function writePendingSentinel(f: Fixture, overrides: Record<string, unknown> = {}): void {
		writeFileSync(
			f.sentinel,
			`${JSON.stringify(
				{
					version: '7.1.0',
					previousVersion: '7.0.0',
					updateMode: 'tree_swap',
					stamp: 'stamp1',
					backupDir: f.backupDir,
					status: 'pending',
					rollback_attempted: false,
					...overrides,
				},
				null,
				'\t',
			)}\n`,
		);
	}

	function runRollback(
		f: Fixture,
		extraEnv: Record<string, string> = {},
		extraArgs: string[] = [],
	): { exitCode: number | null; out: string } {
		const proc = Bun.spawnSync(
			[
				'bash',
				ROLLBACK_SH,
				'--app-dir',
				f.appDir,
				...(extraArgs.length > 0 ? extraArgs : ['--backup-root', f.backupRoot]),
			],
			{
				env: {
					PATH: `${f.binDir}:${Bun.env.PATH ?? ''}`,
					...extraEnv,
				},
				stdout: 'pipe',
				stderr: 'pipe',
			},
		);
		return { exitCode: proc.exitCode, out: proc.stdout.toString() + proc.stderr.toString() };
	}

	function sentinelJson(f: Fixture): { status: string; rollback_attempted: boolean } {
		return JSON.parse(readFileSync(f.sentinel, 'utf8')) as {
			status: string;
			rollback_attempted: boolean;
		};
	}

	test('drill state 1 (W1): pending + backupDir exists + APP_DIR gone → restore', () => {
		const f = makeFixture();
		try {
			plantTree(f.backupDir, 'old-tree'); // APP_DIR intentionally absent
			writePendingSentinel(f);
			const r = runRollback(f);
			expect(r.out).toContain('state 1');
			expect(r.exitCode).toBe(0);
			// The backup became the live tree.
			expect(existsSync(join(f.appDir, 'src', 'server.ts'))).toBe(true);
			expect(existsSync(f.backupDir)).toBe(false);
			const s = sentinelJson(f);
			expect(s.status).toBe('rolled_back');
			expect(s.rollback_attempted).toBe(true);
			// The service was actually restarted.
			const calls = readFileSync(f.systemctlLog, 'utf8');
			expect(calls).toContain('systemctl start dedalo-ts');
		} finally {
			rmSync(f.root, { recursive: true, force: true });
		}
	});

	test('drill state 2: pending + backupDir missing + APP_DIR present → mark, exit 0, touch nothing', () => {
		const f = makeFixture();
		try {
			plantTree(f.appDir, 'live-tree'); // backupDir intentionally never created
			writePendingSentinel(f);
			const r = runRollback(f);
			expect(r.out).toContain('state 2');
			expect(r.exitCode).toBe(0);
			// The live tree is untouched.
			expect(readFileSync(join(f.appDir, 'src', 'server.ts'), 'utf8')).toContain('live-tree');
			// Marked so nothing fires on it again…
			const s = sentinelJson(f);
			expect(s.rollback_attempted).toBe(true);
			// …and NO service restart was issued.
			expect(existsSync(f.systemctlLog)).toBe(false);
		} finally {
			rmSync(f.root, { recursive: true, force: true });
		}
	});

	test('drill state 3: pending + both present → park failed tree, restore backup', () => {
		const f = makeFixture();
		try {
			plantTree(f.appDir, 'failed-new-tree');
			plantTree(f.backupDir, 'old-tree');
			writePendingSentinel(f);
			const r = runRollback(f);
			expect(r.out).toContain('state 3');
			expect(r.exitCode).toBe(0);
			const read = (p: string): string => readFileSync(p, 'utf8');
			expect(read(join(f.appDir, 'src', 'server.ts'))).toContain('old-tree');
			expect(read(join(f.backupRoot, 'failed_stamp1', 'src', 'server.ts'))).toContain(
				'failed-new-tree',
			);
			const s = sentinelJson(f);
			expect(s.status).toBe('rolled_back');
			expect(s.rollback_attempted).toBe(true);
		} finally {
			rmSync(f.root, { recursive: true, force: true });
		}
	});

	test('drill state 4: confirmed / already-attempted / absent sentinel → exit 0, no action', () => {
		const f = makeFixture();
		try {
			plantTree(f.appDir, 'live-tree');
			plantTree(f.backupDir, 'old-tree');
			for (const overrides of [{ status: 'confirmed' }, { rollback_attempted: true }] as Record<
				string,
				unknown
			>[]) {
				writePendingSentinel(f, overrides);
				const r = runRollback(f);
				expect(r.out).toContain('state 4');
				expect(r.exitCode).toBe(0);
			}
			// Absent sentinel.
			rmSync(f.sentinel);
			const r = runRollback(f);
			expect(r.out).toContain('state 4');
			expect(r.exitCode).toBe(0);
			// Never restarted, never moved anything.
			expect(existsSync(f.systemctlLog)).toBe(false);
			expect(readFileSync(join(f.appDir, 'src', 'server.ts'), 'utf8')).toContain('live-tree');
		} finally {
			rmSync(f.root, { recursive: true, force: true });
		}
	});

	test('drill finding B: backup root comes from <private>/.env when env/flag are absent', () => {
		const f = makeFixture();
		try {
			// A relocated backup root, declared ONLY in the private .env.
			const relocatedRoot = join(f.root, 'relocated_backups');
			mkdirSync(relocatedRoot, { recursive: true });
			const privateDir = join(f.root, 'private');
			mkdirSync(privateDir, { recursive: true });
			writeFileSync(
				join(privateDir, '.env'),
				`# comment line\nDEDALO_BACKUP_PATH="${relocatedRoot}"\n`,
			);
			// Sentinel + backup live at the RELOCATED root only.
			const backupDir = join(relocatedRoot, 'backup_stamp1');
			plantTree(f.appDir, 'failed-new-tree');
			plantTree(backupDir, 'old-tree');
			writeFileSync(
				join(relocatedRoot, 'last_code_update.json'),
				`${JSON.stringify({
					version: '7.1.0',
					previousVersion: '7.0.0',
					updateMode: 'tree_swap',
					stamp: 'stamp1',
					backupDir,
					status: 'pending',
					rollback_attempted: false,
				})}\n`,
			);
			// No --backup-root, no DEDALO_BACKUP_PATH in the process env.
			const r = runRollback(f, { DEDALO_PRIVATE_DIR: privateDir }, ['--service', 'dedalo-ts']);
			expect(r.out).toContain('state 3');
			expect(r.exitCode).toBe(0);
			expect(readFileSync(join(f.appDir, 'src', 'server.ts'), 'utf8')).toContain('old-tree');
			expect(existsSync(join(relocatedRoot, 'failed_stamp1'))).toBe(true);
		} finally {
			rmSync(f.root, { recursive: true, force: true });
		}
	});
});
