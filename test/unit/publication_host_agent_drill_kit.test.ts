/**
 * THE PUBLICATION-HOST AGENT DRILL'S OWN PIECES — held without the live servers.
 *
 * scripts/publication_host_agent_drill.ts runs on the instance tier only (it boots Apache,
 * nginx, MariaDB and the agent, inside the CI image). What it builds must be right before
 * it can prove anything, so this gate holds, hermetically:
 *   - the bundle it writes is one the AGENT'S OWN reader (publication/host_agent/src/
 *     releases/ustar.ts, zero-dep by the phase-2 law) extracts byte-for-byte, PAX long
 *     paths included;
 *   - the tree walk refuses a symlink it cannot carry and drops only node_modules/.bin;
 *   - the release id is D9's grammar;
 *   - the stand-ins accept exactly the agent's closed argv — spelled by the agent's OWN
 *     constants (src/exec.ts SUDO / SYSTEMCTL / WEB_CONFIGTEST_BINARY), never respelled —
 *     and refuse (64) anything else, logging every call;
 *   - THE EXEC SEAM: the CI image's dispatchers sit at exactly those absolute paths
 *     (ci/Dockerfile), and the drill tells an armed seam from a plain binary;
 *   - the drill itself is RED, naming what is missing, on a runner without the binaries.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	SUDO,
	SYSTEMCTL,
	V2_SCRATCH_TEMPLATE_SUFFIX,
	WEB_CONFIGTEST_BINARY,
} from '../../publication/host_agent/src/exec.ts';
import { extractBundle } from '../../publication/host_agent/src/releases/ustar.ts';
import {
	AGENT_ACTOR_HEADER,
	collectTree,
	EXEC_SEAM_DIR,
	EXEC_SEAM_MARKER,
	execSeamProblem,
	releaseIdFor,
	renderStandIns,
	writeStandIns,
	writeUstarGz,
} from '../../scripts/lib/publication_host_agent_drill_kit.ts';

const REPO = join(import.meta.dir, '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'dd_pubhost_agent_kit_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const LIMITS = { maxBytes: 1 << 20, maxEntries: 100, maxPathLength: 1024 };
const text = (value: string) => new TextEncoder().encode(value);
const streamOf = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]).stream();

describe('drill kit — the bundle', () => {
	test('round-trips through the agent reader: dirs, modes, a PAX long path, UTF-8', async () => {
		const deep = `node_modules/${'a'.repeat(70)}/${'b'.repeat(70)}`;
		const gz = writeUstarGz([
			{ path: 'src', type: 'dir', mode: 0o755 },
			{ path: 'src/index.ts', type: 'file', mode: 0o644, data: text('export {};\n') },
			{ path: 'run.sh', type: 'file', mode: 0o755, data: new Uint8Array(1500).fill(7) },
			{ path: 'node_modules', type: 'dir', mode: 0o755 },
			{ path: `node_modules/${'a'.repeat(70)}`, type: 'dir', mode: 0o755 },
			{ path: deep, type: 'dir', mode: 0o755 },
			{ path: `${deep}/index.js`, type: 'file', mode: 0o644, data: text('x'.repeat(700)) },
			{ path: 'ñandú.txt', type: 'file', mode: 0o644, data: new Uint8Array(0) },
		]);
		const dest = join(scratch, 'roundtrip');
		mkdirSync(dest);
		const result = await extractBundle(streamOf(gz), dest, LIMITS, []);
		expect(result.entries).toBe(8);
		expect(readFileSync(join(dest, 'src/index.ts'), 'utf8')).toBe('export {};\n');
		expect(readFileSync(join(dest, 'run.sh'))).toEqual(Buffer.from(new Uint8Array(1500).fill(7)));
		expect(readFileSync(join(dest, deep, 'index.js'), 'utf8')).toBe('x'.repeat(700));
		expect(readFileSync(join(dest, 'ñandú.txt')).length).toBe(0);
	});

	test('the same entries always yield the same bytes (uid/gid/mtime 0)', () => {
		const entries = [{ path: 'a', type: 'file' as const, mode: 0o644, data: text('1') }];
		expect(writeUstarGz(entries)).toEqual(writeUstarGz(entries));
	});

	test('collectTree drops node_modules/.bin at any depth and refuses any other symlink', () => {
		const root = join(scratch, 'tree');
		mkdirSync(join(root, 'node_modules/.bin'), { recursive: true });
		mkdirSync(join(root, 'node_modules/p/node_modules/.bin'), { recursive: true });
		writeFileSync(join(root, 'node_modules/p/index.js'), 'p');
		symlinkSync('../p/index.js', join(root, 'node_modules/.bin/p'));
		symlinkSync('../../index.js', join(root, 'node_modules/p/node_modules/.bin/q'));
		expect(collectTree(root).map((e) => e.path)).toEqual([
			'node_modules',
			'node_modules/p',
			'node_modules/p/index.js',
			'node_modules/p/node_modules',
		]);
		symlinkSync('node_modules/p/index.js', join(root, 'escape'));
		expect(() => collectTree(root)).toThrow('symlink the bundle format cannot carry: escape');
	});

	test('the release id is D9 grammar: <version>_<digest7>', () => {
		expect(releaseIdFor('2.1.0', text('bundle'))).toMatch(/^\d+(\.\d+){1,3}_[0-9a-f]{7}$/);
	});
});

describe('drill kit — the exec stand-ins', () => {
	const dir = join(scratch, 'standins');
	const log = join(dir, 'calls.log');
	const run = (tool: string, ...argv: string[]) => {
		const r = Bun.spawnSync([join(dir, 'bin', tool), ...argv], { stdout: 'pipe', stderr: 'pipe' });
		return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString() };
	};

	test("accept exactly the agent's closed argv (its own constants), refuse the rest with 64, log every call", () => {
		mkdirSync(dir, { recursive: true });
		writeStandIns(
			join(dir, 'bin'),
			renderStandIns({
				server: 'apache',
				webBinary: '/bin/echo',
				webMain: '/drill/main.apache.conf',
				webDir: '/drill',
				webErrorLog: '/drill/error.log',
				webUnit: 'apache2',
				v2Unit: 'dedalo-publication-api-v2',
				v2Current: join(dir, 'no_current'),
				v2Scratch: join(dir, 'no_scratch'),
				v2EnvFile: join(dir, 'v2.env'),
				v2PidFile: join(dir, 'v2.pid'),
				v2Output: join(dir, 'v2.log'),
				bun: process.execPath,
				log,
			}),
		);
		expect(run('sudo', '-n', WEB_CONFIGTEST_BINARY.apache, '-t')).toMatchObject({
			code: 0,
			out: '-t -f /drill/main.apache.conf',
		});
		expect(run('systemctl', 'reload', 'apache2')).toMatchObject({
			code: 0,
			out: '-k graceful -f /drill/main.apache.conf',
		});
		expect(run('sudo', '-n', 'apachectl', '-t').code).toBe(64); // a bare name: not exec.ts's argv
		expect(run('sudo', '-n', WEB_CONFIGTEST_BINARY.nginx, '-t').code).toBe(64); // the other server
		expect(run('sudo', 'rm', '-rf', '/').code).toBe(64);
		expect(run('systemctl', 'stop', 'apache2').code).toBe(64);
		expect(run('systemctl', 'reload', 'nginx').code).toBe(64);
		expect(run('php', '-l', '/etc/passwd').code).toBe(64);
		expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual([
			`${SUDO} -n ${WEB_CONFIGTEST_BINARY.apache} -t`,
			`${SYSTEMCTL} reload apache2`,
			`${SUDO} -n apachectl -t`,
			`${SUDO} -n ${WEB_CONFIGTEST_BINARY.nginx} -t`,
			`${SUDO} rm -rf /`,
			`${SYSTEMCTL} stop apache2`,
			`${SYSTEMCTL} reload nginx`,
			'php -l /etc/passwd',
		]);
	});
	test('the v2 scratch TEMPLATE stand-in: start boots <v2>/scratch on the unit port (v2.env cannot move it), stop ends it; only the polkit port grammar', async () => {
		const sdir = join(scratch, 'standins_scratch');
		const slog = join(sdir, 'calls.log');
		const release = join(sdir, 'releases', '7.0.3_a1b2c3d');
		mkdirSync(join(release, 'src'), { recursive: true });
		writeFileSync(
			join(release, 'src', 'index.ts'),
			'Bun.serve({ hostname: process.env.HOST, port: Number(process.env.PORT), fetch: () => Response.json({ env: process.env.NODE_ENV, probe: process.env.V2_PROBE ?? null, cwd: process.cwd() }) });\n',
		);
		symlinkSync(release, join(sdir, 'scratch'));
		writeFileSync(join(sdir, 'v2.env'), 'V2_PROBE="from-shared"\nPORT="9"\nHOST="0.0.0.0"\n');
		const sbin = join(sdir, 'bin');
		writeStandIns(
			sbin,
			renderStandIns({
				server: 'nginx',
				webBinary: '/bin/echo',
				webMain: '/drill/main.nginx.conf',
				webDir: '/drill',
				webErrorLog: '/drill/error.log',
				webUnit: 'nginx',
				v2Unit: 'dedalo-publication-api-v2',
				v2Current: join(sdir, 'no_current'),
				v2Scratch: join(sdir, 'scratch'),
				v2EnvFile: join(sdir, 'v2.env'),
				v2PidFile: join(sdir, 'v2.pid'),
				v2Output: join(sdir, 'v2.log'),
				bun: process.execPath,
				log: slog,
			}),
		);
		const sys = (...argv: string[]) =>
			Bun.spawnSync([join(sbin, 'systemctl'), ...argv], { stdout: 'pipe', stderr: 'pipe' })
				.exitCode;
		const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('') });
		const port = probe.port as number;
		probe.stop(true);
		expect(port).toBeGreaterThanOrEqual(1024);
		const unit = `dedalo-publication-api-v2${V2_SCRATCH_TEMPLATE_SUFFIX}${port}.service`;

		for (const bad of ['0999', '999', '123456', 'x1234']) {
			expect(
				sys('start', `dedalo-publication-api-v2${V2_SCRATCH_TEMPLATE_SUFFIX}${bad}.service`),
			).toBe(64);
		}
		expect(sys('start', `other${V2_SCRATCH_TEMPLATE_SUFFIX}${port}.service`)).toBe(64);
		expect(sys('start', unit, 'extra')).toBe(64);

		expect(sys('start', unit)).toBe(0);
		let body: { env: string; probe: string | null; cwd: string } | null = null;
		for (let i = 0; i < 100 && body === null; i++) {
			try {
				body = (await (await fetch(`http://127.0.0.1:${port}/`)).json()) as typeof body;
			} catch {
				await Bun.sleep(50);
			}
		}
		expect(sys('stop', unit)).toBe(0);
		expect(body).toEqual({ env: 'production', probe: 'from-shared', cwd: realpathSync(release) });
		await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
		const lines = readFileSync(slog, 'utf8').split('\n').filter(Boolean);
		expect(lines.slice(-3)).toEqual([
			`${SYSTEMCTL} start ${unit}`,
			`scratch started in ${realpathSync(release)}`,
			`${SYSTEMCTL} stop ${unit}`,
		]);
	});
});

describe('drill kit — the wire', () => {
	test("AGENT_ACTOR_HEADER is auth.ts's ACTOR_HEADER (read as text: auth.ts loads the agent config)", () => {
		const auth = readFileSync(join(REPO, 'publication/host_agent/src/security/auth.ts'), 'utf8');
		const declared = /export const ACTOR_HEADER = '([^']+)';/.exec(auth)?.[1];
		expect(declared).toBe(AGENT_ACTOR_HEADER.toLowerCase());
	});
});

describe('drill kit — the exec seam (stand-ins AT the agent’s absolute binaries)', () => {
	test("ci/Dockerfile puts a seam dispatcher at exactly exec.ts's SUDO and SYSTEMCTL, into EXEC_SEAM_DIR", () => {
		const dockerfile = readFileSync(join(REPO, 'ci', 'Dockerfile'), 'utf8');
		const has = (needle: string) => dockerfile.includes(needle);
		// One loop diverts the real binaries away from where exec.ts looks, the next writes the
		// dispatchers there: both name exactly exec.ts's two binaries.
		expect(dockerfile.split(`for bin in ${SUDO} ${SYSTEMCTL}; do`).length - 1).toBe(2);
		expect(has('dpkg-divert --local --rename --divert "$bin.distrib" --add "$bin"')).toBe(true);
		expect(has(`install -d -o root -g root -m 0770 ${EXEC_SEAM_DIR};`)).toBe(true);
		expect(has(`"seam=${EXEC_SEAM_DIR}/$name"`)).toBe(true);
		expect(has(`# ${EXEC_SEAM_MARKER} for $bin`)).toBe(true);
	});

	test('execSeamProblem: an armed seam passes; a plain binary, a missing one or no seam dir is named', () => {
		const root = join(scratch, 'seam');
		const seamDir = join(root, 'seam');
		mkdirSync(seamDir, { recursive: true });
		const dispatcher = (name: string, body: string) => {
			const path = join(root, name);
			writeFileSync(path, body);
			chmodSync(path, 0o755);
			return path;
		};
		const good = dispatcher('sudo', `#!/bin/sh\n# ${EXEC_SEAM_MARKER}\nexec x\n`);
		const goodToo = dispatcher('systemctl', `#!/bin/sh\n# ${EXEC_SEAM_MARKER}\nexec y\n`);
		const plain = dispatcher('plain', '#!/bin/sh\nexit 0\n');
		expect(execSeamProblem({ binaries: [good, goodToo], seamDir })).toBeNull();
		expect(execSeamProblem({ binaries: [good, plain], seamDir })).toContain(
			`${plain} is not the CI image's seam dispatcher`,
		);
		expect(execSeamProblem({ binaries: [join(root, 'absent')], seamDir })).toContain(
			`${join(root, 'absent')} does not exist`,
		);
		expect(execSeamProblem({ binaries: [good], seamDir: join(root, 'nope') })).toContain(
			`the seam directory ${join(root, 'nope')} is missing or not writable`,
		);
	});
});

describe('test:pubhost:agent — binaries missing = RED', () => {
	const DRILL = join(REPO, 'scripts', 'publication_host_agent_drill.ts');

	test('PATH without the tools → exit 1, each one named, no green', () => {
		const r = Bun.spawnSync([process.execPath, DRILL], {
			env: { ...process.env, PATH: '/nonexistent' },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const out = `${r.stdout.toString()}${r.stderr.toString()}`;
		expect(r.exitCode).toBe(1);
		expect(out).toContain('missing on PATH: openssl, git, bash, apache: apxs, nginx: nginx');
		expect(out).not.toContain('ALL GREEN');
	});

	test('--only narrows the web-server requirement', () => {
		const r = Bun.spawnSync([process.execPath, DRILL, '--only', 'nginx'], {
			env: { ...process.env, PATH: '/nonexistent' },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(r.exitCode).toBe(1);
		expect(r.stderr.toString()).toContain('missing on PATH: openssl, git, bash, nginx: nginx.');
		expect(r.stderr.toString()).not.toContain('apache: apxs');
	});
});
