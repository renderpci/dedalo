/**
 * THE INSTALLER'S PROBE CHILD (src/core/install/install_probe.ts; terminal
 * installer phase 2, 2026-10-12), SPAWNED the way the interactive front end
 * spawns it (install_probe_client.ts): one JSON request on stdin, one JSON line
 * on stdout.
 *
 *  - `system`: the rows, the engine version, the seed path; on docker/trial
 *    only the HOST's rows (no psql / PostgreSQL / ImageMagick / FFmpeg — B4: a
 *    Docker host has none, and a must-pass gate must not block on them);
 *  - `db` against a socket directory that does not exist: ok:false, no throw;
 *  - `mailer` with no host: ok:false;
 *  - `media`: a writable scratch path can be created; a relative one refused;
 *  - `catalog` over a LOCAL fixture source: the offered entries, the extracted
 *    copy cleaned up;
 *  - an unknown probe / a malformed request exit 2;
 *  - stdout never echoes a secret of the request (sentinels in every secret
 *    field, a probe failure that would quote one included).
 * Plus the pure part of the System check (systemCheckRows): an init failure no
 * row names still FAILS (never dropped past the gate). And the ENVIRONMENT a
 * probe child gets: a process LAUNCHED with DEDALO_INSTALL_ROOT_PASSWORD that
 * removed it (unsetProcessEnv, as scripts/install.ts does) spawns its probe
 * children through the real client spawn WITHOUT it — with the control that
 * Bun's default spawn env would still carry it (the trap is real).
 *
 * DB-FREE: the only database probe aims at a socket directory that does not
 * exist. The children get a scratch private dir; nothing is written outside the
 * mkdtemp dirs this file removes.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SEED_DUMP_PATH } from '../../src/core/install/paths.ts';
import { systemCheckRows } from '../../src/core/install/probes.ts';
import { DEDALO_VERSION } from '../../src/core/update/version.ts';
import { writeLocalOntologySource } from '../helpers/install_answer_cases.ts';

const ROOT = resolve(import.meta.dir, '../..');
const CHILD = join(ROOT, 'src/core/install/install_probe.ts');
const scratchRoot = mkdtempSync(join(tmpdir(), 'dedalo_install_probe_child_'));
afterAll(() => rmSync(scratchRoot, { recursive: true, force: true }));
const PRIVATE = mkdtempSync(join(scratchRoot, 'private_'));

const SENTINELS = {
	db_password: 'Zz-DbSentinel-4417',
	mysql_password: 'Zz-MySentinel-5528',
	smtp_pass: 'Zz-SmtpSentinel-6639',
};

/** Spawn the child with one stdin text; answers its exit code and the parsed line. */
function child(stdin: string): {
	exitCode: number;
	stdout: string;
	answer: Record<string, unknown>;
} {
	const proc = Bun.spawnSync([process.execPath, 'run', CHILD], {
		cwd: ROOT,
		env: { ...Bun.env, DEDALO_INSTALL_PRIVATE_DIR: PRIVATE },
		stdin: Buffer.from(stdin),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const stdout = proc.stdout.toString();
	const lines = stdout.trim().split('\n');
	expect(lines.length, `exactly one stdout line: ${stdout}`).toBe(1);
	return { exitCode: proc.exitCode, stdout, answer: JSON.parse(lines[0] as string) };
}

const request = (
	probe: string,
	answers: Record<string, unknown> = {},
	extra: Record<string, unknown> = {},
) => JSON.stringify({ probe, answers, secrets: SENTINELS, ...extra });

function expectNoSentinel(text: string): void {
	for (const value of Object.values(SENTINELS)) expect(text.includes(value), value).toBe(false);
}

describe('probe child — system', () => {
	test('developer: rows, the engine version, the seed path', () => {
		const { exitCode, stdout, answer } = child(request('system', { route: 'developer' }));
		expect(exitCode).toBe(0);
		expect(typeof answer.ok).toBe('boolean');
		expect(answer.version).toBe(DEDALO_VERSION);
		expect(answer.seedPath).toBe(SEED_DUMP_PATH);
		const labels = (answer.rows as { label: string; state: string }[]).map((row) => row.label);
		for (const label of ['Bun', 'Private directory', 'Platform', 'ImageMagick', 'FFmpeg']) {
			expect(labels, label).toContain(label);
		}
		expectNoSentinel(stdout);
	}, 60000);

	test('docker / trial: only the host rows (no psql, PostgreSQL, ImageMagick, FFmpeg)', () => {
		for (const route of ['docker', 'trial']) {
			const { answer } = child(request('system', { route }));
			const labels = (answer.rows as { label: string }[]).map((row) => row.label);
			expect(labels, route).toContain('Bun');
			for (const absent of [
				'PostgreSQL client',
				'PostgreSQL version',
				'ImageMagick',
				'FFmpeg',
				'Install seed',
			]) {
				expect(labels, `${route}: ${absent}`).not.toContain(absent);
			}
		}
	}, 60000);
});

describe('probe child — connections answer, never throw', () => {
	test('db: a socket directory that does not exist → ok:false; no secret echoed', () => {
		const { exitCode, stdout, answer } = child(
			request('db', {
				db_socket: join(scratchRoot, 'no_such_socket_dir'),
				db_database: 'zz_probe_absent',
				db_username: 'zz_probe_role',
				entity: 'probe',
			}),
		);
		expect(exitCode).toBe(0);
		expect(answer.ok).toBe(false);
		expect(String(answer.msg).length).toBeGreaterThan(0);
		expectNoSentinel(stdout);
	}, 60000);

	test('mailer: no host → ok:false; no secret echoed', () => {
		const { exitCode, stdout, answer } = child(request('mailer', { mailer: true, smtp_host: '' }));
		expect(exitCode).toBe(0);
		expect(answer.ok).toBe(false);
		expectNoSentinel(stdout);
	}, 60000);

	test('media: a creatable scratch path passes; a relative one is refused', () => {
		const creatable = child(
			request('media', { route: 'developer', media_path: join(scratchRoot, 'm', 'n') }),
		);
		expect(creatable.answer.ok).toBe(true);
		const relative = child(request('media', { route: 'developer', media_path: 'media/here' }));
		expect(relative.answer.ok).toBe(false);
	}, 60000);

	test('catalog: a LOCAL fixture source is offered (the parent never resolves it itself)', () => {
		const source = writeLocalOntologySource(join(scratchRoot, 'source'));
		const { exitCode, answer } = child(
			request('catalog', { update_servers: 'none', ontology_source: source }, { prior_env: {} }),
		);
		expect(exitCode).toBe(0);
		expect(answer.ok).toBe(true);
		const entries = (answer.catalog as { entries: { tld: string }[] }).entries.map(
			(entry) => entry.tld,
		);
		expect(entries).toContain('zzsma');
		expect(entries).toContain('zzsmb');
	}, 60000);
});

describe('probe child — refusals', () => {
	test('an unknown probe and a malformed request exit 2 (the request is never echoed)', () => {
		const unknown = child(request('format_disk'));
		expect(unknown.exitCode).toBe(2);
		expect(unknown.answer.ok).toBe(false);
		expectNoSentinel(unknown.stdout);
		const malformed = child(`not json ${SENTINELS.db_password}`);
		expect(malformed.exitCode).toBe(2);
		expectNoSentinel(malformed.stdout);
	}, 60000);
});

describe('the System check rows (pure)', () => {
	const init = (msg: string[], errors: string[]) => ({ result: errors.length === 0, msg, errors });

	test('an init failure is a FAIL row — one no row names included (never dropped past the gate)', () => {
		const rows = systemCheckRows(
			init(
				['Bun runtime 1.4 — OK'],
				['PostgreSQL client (psql) not found', 'Zz a future check failed'],
			),
			null,
			'developer',
		);
		expect(rows.filter((row) => row.state === 'fail').map((row) => row.detail)).toEqual([
			'PostgreSQL client (psql) not found',
			'Zz a future check failed',
		]);
	});

	test('docker: a missing psql is not this host’s failure', () => {
		const rows = systemCheckRows(
			init(['Bun runtime 1.4 — OK'], ['PostgreSQL client (psql) not found']),
			null,
			'docker',
		);
		expect(rows.filter((row) => row.state === 'fail')).toEqual([]);
	});
});

describe('probe child — the environment it inherits', () => {
	test('a removed DEDALO_INSTALL_* secret reaches no probe child (Bun default env would leak it)', () => {
		const sentinel = 'Zz-RootSentinel-7740';
		const dir = mkdtempSync(join(scratchRoot, 'env_'));
		// The client spawns [execPath, 'run', <child>] in `cwd`: with execPath /bin/sh and a
		// script named `run` in cwd, the "child" is a reporter of its own environment.
		writeFileSync(
			join(dir, 'run'),
			'printf \'{"ok":true,"msg":"%s"}\\n\' "${DEDALO_INSTALL_ROOT_PASSWORD-absent}"\n',
		);
		const driver = join(dir, 'driver.ts');
		writeFileSync(
			driver,
			[
				`import { unsetProcessEnv } from ${JSON.stringify(join(ROOT, 'src/config/env.ts'))};`,
				`import { childProbes } from ${JSON.stringify(join(ROOT, 'src/core/install/install_probe_client.ts'))};`,
				"unsetProcessEnv(['DEDALO_INSTALL_ROOT_PASSWORD']);",
				`const probes = childProbes({ execPath: '/bin/sh', cwd: ${JSON.stringify(dir)} });`,
				'const client = (await probes.media({})).msg;',
				`const control = Bun.spawnSync(['/bin/sh', 'run'], { cwd: ${JSON.stringify(dir)} }).stdout.toString();`,
				'console.log(JSON.stringify({ client, control }));',
			].join('\n'),
		);
		const proc = Bun.spawnSync([process.execPath, 'run', driver], {
			cwd: ROOT,
			env: { ...Bun.env, DEDALO_INSTALL_ROOT_PASSWORD: sentinel },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(proc.exitCode, proc.stderr.toString()).toBe(0);
		const out = JSON.parse(proc.stdout.toString().trim().split('\n').at(-1) as string);
		// Anti-vacuity: the launch environ DID carry it, and Bun's default spawn still passes it.
		expect(out.control).toContain(sentinel);
		expect(out.client).toBe('absent');
	}, 60000);
});
