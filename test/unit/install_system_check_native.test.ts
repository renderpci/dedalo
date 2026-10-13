/**
 * THE INSTALLER'S SYSTEM CHECK ON A FRESH HOST (campaign 3, 2026-10-13 — S1).
 * On fresh Ubuntu 24/26 and RHEL 9/10 the System check CRASHED: psql was not
 * installed, `Bun.spawnSync(['psql', …])` threw ENOENT, the probe child turned
 * it into "the system probe failed unexpectedly (Error)", and the screen said
 * "System ready." beside it. Gated here, by OUTCOME:
 *
 *  1. the psql probe over a PATH that holds no psql ANSWERS (`missing`), and a
 *     binary that cannot run answers `unusable` with its errno — never a throw
 *     (src/core/install/pg_bin.ts probePsqlAt); init_test over it does not throw;
 *  2. the System check is ROUTE-AWARE over that PATH (probes.ts systemCheck):
 *     production — psql absent is fine, the row says the installer installs
 *     PostgreSQL 18 (another major present: a warning naming the run's rule);
 *     docker/trial — no PostgreSQL client row at all, and the rows
 *     docs/install/docker.md promises (Docker, Compose, the disk) with
 *     stack_preflight's OWN sentences (host/stack/preflight.ts
 *     STACK_MACHINE_CHECKS) — also through the probe child under the scratch
 *     seam; developer — a FAILED row with the fix sentence;
 *  3. "System ready." never accompanies a failed row nor a probe that errored
 *     (screen_model.ts systemNotices) — and does when nothing failed
 *     (anti-vacuity);
 *  4. a probe that threw is answered with its class AND a short sanitized,
 *     redacted first line, and names the file the full text was written to
 *     (install_probe_failure.ts).
 *
 * DB-FREE. Writes only under this file's mkdtemp root (and, for the default
 * failure log, one file under the system temp dir it removes).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pendingStackFacts, type StackFacts } from '../../src/core/install/host/stack/facts.ts';
import { STACK_MACHINE_CHECKS } from '../../src/core/install/host/stack/preflight.ts';
import { runInitTest } from '../../src/core/install/init_test.ts';
import {
	probeFailureSentence,
	tempFileFailureLog,
} from '../../src/core/install/install_probe_failure.ts';
import { type PsqlProbe, probePsqlAt } from '../../src/core/install/pg_bin.ts';
import { systemCheck } from '../../src/core/install/probes.ts';
import { buildScreens, type ProbeOutcome } from '../../src/core/install/screen_model.ts';
import {
	DOCKER,
	SCRATCH_DIR,
	scratchStackFacts,
	stackHostFiles,
	stackResponses,
} from '../helpers/install_host_scratch.ts';
import { modelInput } from '../helpers/install_plain_script.ts';

const ROOT = resolve(import.meta.dir, '../..');
const scratch = mkdtempSync(join(tmpdir(), 'dedalo_install_system_check_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** A directory holding only `files` (name → [script, mode]) — a PATH of its own. */
function pathDir(name: string, files: Record<string, [string, number]> = {}): string {
	const dir = join(scratch, name);
	mkdirSync(dir, { recursive: true });
	for (const [file, [body, mode]] of Object.entries(files)) {
		writeFileSync(join(dir, file), body);
		chmodSync(join(dir, file), mode);
	}
	return dir;
}

/** The fresh host: a PATH with no psql in it, and no configured / Homebrew candidate. */
const EMPTY_PATH = pathDir('empty_path');
const freshHost = (): PsqlProbe => probePsqlAt([], { PATH: EMPTY_PATH });

/** A fake psql answering `version` (exit 0). */
const fakePsql = (name: string, version: string): (() => PsqlProbe) => {
	const dir = pathDir(name, { psql: [`#!/bin/sh\necho '${version}'\n`, 0o755] });
	return () => probePsqlAt([], { PATH: dir });
};

const rowOf = (outcome: ProbeOutcome, label: string) =>
	(outcome.rows ?? []).find((row) => row.label === label);

// ── 1. the probe answers, never throws ───────────────────────────────────────

describe('psql probe — a typed answer, never a throw', () => {
	test('ENOENT: a PATH without psql answers missing (Bun.spawnSync itself throws there)', () => {
		// Anti-vacuity: the raw spawn DOES throw on this PATH — the trap is real.
		expect(() => Bun.spawnSync(['psql', '--version'], { env: { PATH: EMPTY_PATH } })).toThrow();
		expect(freshHost()).toEqual({ state: 'missing', path: 'psql' });
	});

	test('EACCES: a candidate that is not executable answers unusable with its errno', () => {
		const dir = pathDir('noexec', { psql: ['#!/bin/sh\necho x\n', 0o644] });
		const answer = probePsqlAt([join(dir, 'psql')], { PATH: EMPTY_PATH });
		expect(answer).toEqual({ state: 'unusable', path: join(dir, 'psql'), reason: 'EACCES' });
	});

	test('a psql that answers non-zero is unusable; one that answers is found with its version', () => {
		const failing = pathDir('failing', { psql: ['#!/bin/sh\nexit 3\n', 0o755] });
		expect(probePsqlAt([], { PATH: failing })).toEqual({
			state: 'unusable',
			path: 'psql',
			reason: 'exit 3',
		});
		expect(fakePsql('pg18', 'psql (PostgreSQL) 18.1')()).toEqual({
			state: 'found',
			path: 'psql',
			version: 'psql (PostgreSQL) 18.1',
		});
	});

	test('init_test over the fresh host does not throw: the psql line fails, the answer is carried', () => {
		const report = runInitTest(freshHost());
		expect(report.psql.state).toBe('missing');
		expect(report.errors.some((line) => /psql\) not found/.test(line))).toBe(true);
	});
});

// ── 2. route-aware rows over the fresh host ──────────────────────────────────

describe('System check — route-aware over a PATH without psql', () => {
	test('production: psql absent is fine — the row says the installer installs PostgreSQL 18', async () => {
		const outcome = await systemCheck('production', { psql: freshHost });
		const row = rowOf(outcome, 'PostgreSQL client');
		expect(row?.state).toBe('ok');
		expect(row?.detail).toContain('the installer installs PostgreSQL 18');
	}, 60000);

	test('production: another major present is a warning naming the run’s rule, never a fail', async () => {
		const outcome = await systemCheck('production', {
			psql: fakePsql('pg16', 'psql (PostgreSQL) 16.4'),
		});
		const row = rowOf(outcome, 'PostgreSQL client');
		expect(row?.state).toBe('warn');
		expect(row?.detail).toContain('--db-mode existing');
	}, 60000);

	test('developer: a FAILED row with the fix sentence, and the check is not ok', async () => {
		const outcome = await systemCheck('developer', { psql: freshHost });
		const row = rowOf(outcome, 'PostgreSQL client');
		expect(row?.state).toBe('fail');
		expect(row?.detail).toContain('psql not found');
		expect(row?.detail).toContain('installs into an existing PostgreSQL');
		expect(row?.detail).toContain('DEDALO_PG_BIN_PATH');
		expect(outcome.ok).toBe(false);
	}, 60000);

	for (const route of ['docker', 'trial'] as const) {
		test(`${route}: no PostgreSQL client row; Docker, Compose and the disk rows instead`, async () => {
			const outcome = await systemCheck(route, {
				psql: freshHost,
				stack: async () => scratchStackFacts(),
			});
			const labels = (outcome.rows ?? []).map((row) => row.label);
			expect(labels).not.toContain('PostgreSQL client');
			for (const label of ['Docker', 'Compose', 'Disk']) {
				expect(rowOf(outcome, label)?.state, label).toBe('ok');
			}
			expect(outcome.ok).toBe(true);
		}, 60000);
	}

	test('docker: the stack rows fail with stack_preflight’s OWN sentences (one rule, one wording)', async () => {
		const noDocker: StackFacts = { ...pendingStackFacts(), user: 'operator', uid: 1000 };
		const small: StackFacts = { ...scratchStackFacts(), freeGib: 3 };
		const absent = await systemCheck('docker', { psql: freshHost, stack: async () => noDocker });
		expect(rowOf(absent, 'Docker')).toEqual({
			state: 'fail',
			label: 'Docker',
			detail: STACK_MACHINE_CHECKS.docker(noDocker) as string,
		});
		expect(absent.ok).toBe(false);
		const full = await systemCheck('docker', { psql: freshHost, stack: async () => small });
		expect(rowOf(full, 'Disk')?.detail).toBe(STACK_MACHINE_CHECKS.disk(small) as string);
		expect(rowOf(full, 'Disk')?.state).toBe('fail');
	}, 60000);
});

// ── the same, through the probe child (the scratch seam measures the stack) ──

describe('System check — through the probe child', () => {
	test('docker under the scratch seam: Docker/Compose/Disk rows measured, no psql row', () => {
		const host = join(scratch, 'stack_host');
		for (const [path, content] of stackHostFiles()) {
			mkdirSync(dirname(join(host, path)), { recursive: true });
			writeFileSync(join(host, path), content);
		}
		mkdirSync(join(host, SCRATCH_DIR), { recursive: true });
		writeFileSync(
			join(host, SCRATCH_DIR, 'responses.json'),
			JSON.stringify(stackResponses('docker', '0.0.0', 'example.org/dedalo')),
		);
		const proc = Bun.spawnSync([process.execPath, 'run', 'src/core/install/install_probe.ts'], {
			cwd: ROOT,
			env: {
				...Bun.env,
				PATH: `${dirname(process.execPath)}:${EMPTY_PATH}`,
				DEDALO_INSTALL_PRIVATE_DIR: pathDir('child_private'),
				DEDALO_INSTALL_HOST_ROOT: host,
			},
			stdin: Buffer.from(
				JSON.stringify({ probe: 'system', answers: { route: 'docker' }, secrets: {} }),
			),
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(proc.exitCode, proc.stderr.toString()).toBe(0);
		const answer = JSON.parse(proc.stdout.toString().trim()) as ProbeOutcome;
		const labels = (answer.rows ?? []).map((row) => row.label);
		expect(labels).not.toContain('PostgreSQL client');
		expect(rowOf(answer, 'Docker')?.detail).toContain(DOCKER);
		expect(rowOf(answer, 'Compose')?.detail).toContain('2.39.1');
		expect(rowOf(answer, 'Disk')?.detail).toContain('GiB free under /var/lib/docker');
	}, 60000);
});

// ── 3. "System ready." never beside a failure ────────────────────────────────

describe('System check screen — "System ready." only when nothing failed', () => {
	const notices = (route: string, system: ProbeOutcome): string[] =>
		(
			buildScreens(modelInput({ route }, { probes: { system } })).find(
				(screen) => screen.id === 'system',
			)?.notices ?? []
		).map((notice) => notice.text);

	test('a probe that ERRORED (no rows): its sentence, never "System ready."', () => {
		const texts = notices('developer', {
			ok: false,
			detail: 'the system probe failed unexpectedly (Error: boom) — full text logged to /tmp/x.log',
		});
		expect(texts.some((text) => text.startsWith('System ready'))).toBe(false);
		expect(texts.some((text) => text.includes('did not complete') && text.includes('boom'))).toBe(
			true,
		);
	});

	test('a failed row: the failure summary, never "System ready."', async () => {
		const outcome = await systemCheck('developer', { psql: freshHost });
		const texts = notices('developer', outcome);
		expect(texts.some((text) => text.startsWith('System ready'))).toBe(false);
		expect(texts.some((text) => /check(s)? failed/.test(text))).toBe(true);
	}, 60000);

	test('ok:false with no failed row is not "ready" either', () => {
		const texts = notices('developer', {
			ok: false,
			detail: 'odd',
			rows: [{ state: 'ok', label: 'Bun', detail: 'x' }],
		});
		expect(texts.some((text) => text.startsWith('System ready'))).toBe(false);
	});

	test('anti-vacuity: nothing failed → "System ready."', () => {
		const texts = notices('developer', {
			ok: true,
			detail: 'system ready',
			rows: [{ state: 'ok', label: 'Bun', detail: 'x' }],
		});
		expect(texts).toContain('System ready.');
	});
});

// ── 4. an unexpected throw: class + short sanitized line + where it was logged ─

describe('probe failure sentence — class, summary, the log file', () => {
	const SECRET = 'Zz-ProbeSecret-9931';

	test('class + sanitized, credential-masked, secret-redacted first line + the log path', () => {
		const logged: string[] = [];
		const error = new Error(
			`Executable not found in $PATH: "psql" \x1b[31mpostgres://dedalo:${SECRET}@db/x\nSECOND LINE stack-ish`,
		);
		const sentence = probeFailureSentence('system', error, [SECRET], (_what, text) => {
			logged.push(text);
			return '/tmp/zz-probe.log';
		});
		expect(sentence).toContain('the system probe failed unexpectedly (Error: Executable not found');
		expect(sentence).toContain('postgres://***@db/x');
		expect(sentence).toContain('full text logged to /tmp/zz-probe.log');
		expect(sentence).not.toContain(SECRET);
		expect(sentence).not.toContain('SECOND LINE');
		expect(sentence).not.toContain('\x1b');
		// The log holds the WHOLE text (second line included), redacted too.
		expect(logged.join('')).toContain('SECOND LINE');
		expect(logged.join('')).not.toContain(SECRET);
	});

	test('a summary is bounded; a log that cannot be written is said so', () => {
		const sentence = probeFailureSentence('system', new TypeError('x'.repeat(500)), [], () => null);
		expect(sentence).toContain('(TypeError: ');
		expect(sentence).toContain('could not be written to a log file');
		expect(sentence.length).toBeLessThan(300);
	});

	test('the default log: a fresh 0600 file under the temp dir holding the text', () => {
		const path = tempFileFailureLog('system', 'full text here');
		expect(path).not.toBeNull();
		try {
			expect(readFileSync(path as string, 'utf8')).toBe('full text here');
			expect(statSync(path as string).mode & 0o777).toBe(0o600);
		} finally {
			if (path !== null && existsSync(path)) rmSync(path);
		}
	});
});
