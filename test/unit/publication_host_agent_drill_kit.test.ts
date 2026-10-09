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
 *     constants (src/exec.ts SUDO / SYSTEMCTL, layout.ts pickConfigtestBinary), never respelled —
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
} from '../../publication/host_agent/src/exec.ts';
import {
	HOST_MAP_UNIT,
	pickConfigtestBinary,
} from '../../publication/host_agent/src/provision/layout.ts';
import { extractBundle } from '../../publication/host_agent/src/releases/ustar.ts';
import {
	contributionOf,
	isMapRefusal,
	parseNginxMap,
} from '../../publication/host_agent/src/rules/directives.ts';
import {
	AGENT_ACTOR_HEADER,
	bundleBytes,
	collectTree,
	EXEC_SEAM_DIR,
	EXEC_SEAM_MARKER,
	execSeamProblem,
	releaseIdFor,
	renderHostMapDriver,
	renderStandIns,
	SVG_DRILL_FILES,
	SVG_DRILL_QUALITIES,
	svgTreatmentProblem,
	writeStandIns,
} from '../../scripts/lib/publication_host_agent_drill_kit.ts';
import { config } from '../../src/config/config.ts';
import { buildNginxMap, filterPublicQualities } from '../../src/core/media/protection.ts';
import { normalizePublicationHostInput } from '../../src/core/media/publication_host_rules.ts';
import {
	imageEnvelopePcre,
	isImageEnvelopeSvg,
	MEDIA_NOSNIFF,
	SVG_ENVELOPE_CSP,
	SVG_QUARANTINE_CSP,
	SVG_QUARANTINE_DISPOSITION,
	svgQuarantinePcre,
} from '../../src/core/media/svg_safety.ts';

const REPO = join(import.meta.dir, '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'dd_pubhost_agent_kit_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const LIMITS = { maxBytes: 1 << 20, maxEntries: 100, maxPathLength: 1024 };
const text = (value: string) => new TextEncoder().encode(value);
const streamOf = (bytes: Uint8Array<ArrayBuffer>) => new Blob([bytes]).stream();

describe('drill kit — the bundle', () => {
	test('round-trips through the agent reader: dirs, modes, a PAX long path, UTF-8', async () => {
		const deep = `node_modules/${'a'.repeat(70)}/${'b'.repeat(70)}`;
		const gz = await bundleBytes([
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

	test('the same entries always yield the same bytes (uid/gid/mtime 0)', async () => {
		const entries = [{ path: 'a', type: 'file' as const, mode: 0o644, data: text('1') }];
		expect(await bundleBytes(entries)).toEqual(await bundleBytes(entries));
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
		expect(run('sudo', '-n', pickConfigtestBinary('apache'), '-t')).toMatchObject({
			code: 0,
			out: '-t -f /drill/main.apache.conf',
		});
		expect(run('systemctl', 'reload', 'apache2')).toMatchObject({
			code: 0,
			out: '-k graceful -f /drill/main.apache.conf',
		});
		expect(run('sudo', '-n', 'apachectl', '-t').code).toBe(64); // a bare name: not exec.ts's argv
		expect(run('sudo', '-n', pickConfigtestBinary('nginx'), '-t').code).toBe(64); // the other server
		expect(run('sudo', 'rm', '-rf', '/').code).toBe(64);
		expect(run('systemctl', 'stop', 'apache2').code).toBe(64);
		expect(run('systemctl', 'reload', 'nginx').code).toBe(64);
		expect(run('php', '-l', '/etc/passwd').code).toBe(64);
		expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual([
			`${SUDO} -n ${pickConfigtestBinary('apache')} -t`,
			`${SYSTEMCTL} reload apache2`,
			`${SUDO} -n apachectl -t`,
			`${SUDO} -n ${pickConfigtestBinary('nginx')} -t`,
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
		type Body = { env: string; probe: string | null; cwd: string };
		// A holder, not a `let`: TS narrows a `let … | null = null` to `null` past the loop.
		const got: { body: Body | null } = { body: null };
		for (let i = 0; i < 100 && got.body === null; i++) {
			try {
				got.body = (await (await fetch(`http://127.0.0.1:${port}/`)).json()) as Body;
			} catch {
				await Bun.sleep(50);
			}
		}
		expect(sys('stop', unit)).toBe(0);
		expect(got.body).toEqual({
			env: 'production',
			probe: 'from-shared',
			cwd: realpathSync(release),
		});
		await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
		const lines = readFileSync(slog, 'utf8').split('\n').filter(Boolean);
		expect(lines.slice(-3)).toEqual([
			`${SYSTEMCTL} start ${unit}`,
			`scratch started in ${realpathSync(release)}`,
			`${SYSTEMCTL} stop ${unit}`,
		]);
	});
});

describe('drill kit — the php lint stand-in (phase 4: real v1 pushes)', () => {
	const dir = join(scratch, 'standins_php');
	const log = join(dir, 'calls.log');
	const root = '/drill/state/publication_api/v1';
	const run = (...argv: string[]) => {
		const r = Bun.spawnSync([join(dir, 'bin', 'php'), ...argv], { stdout: 'pipe', stderr: 'pipe' });
		return { code: r.exitCode, out: r.stdout.toString().trim() };
	};

	test('accepts only -l <file under the v1 API root> and execs the real binary on it; logs every call', () => {
		mkdirSync(dir, { recursive: true });
		writeStandIns(
			join(dir, 'bin'),
			renderStandIns({
				server: 'nginx',
				webBinary: '/bin/echo',
				webMain: '/drill/main.nginx.conf',
				webDir: '/drill',
				webErrorLog: '/drill/error.log',
				webUnit: 'nginx',
				v2Unit: 'dedalo-publication-api-v2',
				v2Current: join(dir, 'no_current'),
				v2Scratch: join(dir, 'no_scratch'),
				v2EnvFile: join(dir, 'v2.env'),
				v2PidFile: join(dir, 'v2.pid'),
				v2Output: join(dir, 'v2.log'),
				bun: process.execPath,
				phpLint: { binary: '/bin/echo', root },
				log,
			}),
		);
		const inside = `${root}/staging/x/json/index.php`;
		expect(run('-l', inside)).toEqual({ code: 0, out: `-l ${inside}` });
		expect(run('-l', '/etc/passwd').code).toBe(64);
		expect(run('-l', `${root}/../../../../tmp/evil.php`).code).toBe(64);
		expect(run('-l', `${root}/./a.php`).code).toBe(64);
		expect(run('-l', `${root}x/a.php`).code).toBe(64);
		expect(run('-l', `${root}/`).code).toBe(64);
		expect(run('-r', 'phpinfo();').code).toBe(64);
		expect(run('-l').code).toBe(64);
		expect(run('-l', inside, 'extra').code).toBe(64);
		expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual([
			`php -l ${inside}`,
			'php -l /etc/passwd',
			`php -l ${root}/../../../../tmp/evil.php`,
			`php -l ${root}/./a.php`,
			`php -l ${root}x/a.php`,
			`php -l ${root}/`,
			'php -r phpinfo();',
			'php -l',
			`php -l ${inside} extra`,
		]);
	});
});

describe('drill kit — the host-wide map (B1: the drills push the map, root renders it)', () => {
	const dir = join(scratch, 'host_map');
	const hostBase = join(dir, '_host');
	const mapDir = join(hostBase, 'nginx_map');
	const log = join(dir, 'calls.log');
	const nginxLog = join(dir, 'nginx_calls.log');

	test('systemctl start <HOST_MAP_UNIT>.service runs the driver, with an empty environment; refused without one', () => {
		mkdirSync(dir, { recursive: true });
		const base = {
			server: 'nginx' as const,
			webBinary: '/bin/echo',
			webMain: '/drill/main.nginx.conf',
			webDir: '/drill',
			webErrorLog: '/drill/error.log',
			webUnit: 'nginx',
			v2Unit: 'dedalo-publication-api-v2',
			v2Current: join(dir, 'no_current'),
			v2Scratch: join(dir, 'no_scratch'),
			v2EnvFile: join(dir, 'v2.env'),
			v2PidFile: join(dir, 'v2.pid'),
			v2Output: join(dir, 'v2.log'),
			bun: process.execPath,
			log,
		};
		const driver = join(dir, 'driver_env.ts');
		writeFileSync(
			driver,
			"console.log(JSON.stringify(Object.keys(process.env).filter(k => k !== 'PATH').sort()));\n",
		);
		writeStandIns(join(dir, 'bin'), renderStandIns({ ...base, hostMapDriver: driver }));
		const start = Bun.spawnSync(
			[join(dir, 'bin', 'systemctl'), 'start', `${HOST_MAP_UNIT}.service`],
			{
				stdout: 'pipe',
				env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LEAKED_SECRET: 'x' },
			},
		);
		expect(start.exitCode).toBe(0);
		expect(start.stdout.toString()).not.toContain('LEAKED_SECRET');
		writeStandIns(join(dir, 'bin_none'), renderStandIns(base));
		expect(
			Bun.spawnSync([join(dir, 'bin_none', 'systemctl'), 'start', `${HOST_MAP_UNIT}.service`])
				.exitCode,
		).toBe(64);
		expect(readFileSync(log, 'utf8').split('\n').filter(Boolean)).toEqual([
			`${SYSTEMCTL} start ${HOST_MAP_UNIT}.service`,
			`${SYSTEMCTL} start ${HOST_MAP_UNIT}.service`,
		]);
	});

	test("the driver runs the agent's OWN renderer: an owned contribution is rendered byte-equal, configtested, reloaded; result.json says applied", () => {
		mkdirSync(join(mapDir, 'contrib'), { recursive: true });
		mkdirSync(join(hostBase, 'locks'), { recursive: true });
		writeFileSync(join(hostBase, 'locks', 'web.lock'), '', { mode: 0o640 });
		chmodSync(join(hostBase, 'locks', 'web.lock'), 0o640);
		const identities = join(hostBase, 'identities.json');
		writeFileSync(identities, JSON.stringify({ pubdrill: process.getuid?.() ?? 0 }));
		const engineMap = buildNginxMap();
		const parsed = parseNginxMap(engineMap);
		if (isMapRefusal(parsed)) throw new Error(`the engine map is refused: ${parsed.why}`);
		const contribution = contributionOf(parsed, 'pubdrill');
		if (typeof contribution === 'string') throw new Error(contribution);
		writeFileSync(join(mapDir, 'contrib', 'pubdrill.json'), JSON.stringify(contribution));
		// A recording nginx: every argv logged, exit 0; its "master" is this test process.
		const nginx = join(dir, 'nginx');
		writeFileSync(nginx, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${nginxLog}'\nexit 0\n`);
		chmodSync(nginx, 0o755);
		const pid = join(dir, 'nginx.pid');
		writeFileSync(pid, `${process.pid}\n`);
		const driver = join(dir, 'driver.ts');
		writeFileSync(
			driver,
			renderHostMapDriver({
				agentDir: join(REPO, 'publication', 'host_agent'),
				mapDir,
				locksDir: join(hostBase, 'locks'),
				identitiesPath: identities,
				nginx: {
					binary: nginx,
					errorLog: join(dir, 'error.log'),
					dir,
					main: join(dir, 'main.conf'),
					pid,
				},
			}),
		);
		const run = Bun.spawnSync([process.execPath, '--no-env-file', driver], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(run.stderr.toString()).toContain('applied');
		expect(run.exitCode).toBe(0);
		expect(readFileSync(join(mapDir, 'dedalo_media_map.nginx.conf'), 'utf8')).toBe(engineMap);
		expect(JSON.parse(readFileSync(join(mapDir, 'result.json'), 'utf8'))).toMatchObject({
			outcome: 'applied',
			host_hash: parsed.hash,
		});
		expect(readFileSync(nginxLog, 'utf8').split('\n').filter(Boolean)).toEqual([
			`-e ${join(dir, 'error.log')} -t -p ${dir} -c ${join(dir, 'main.conf')}`,
			`-e ${join(dir, 'error.log')} -s reload -p ${dir} -c ${join(dir, 'main.conf')}`,
		]);
		// The same contribution again: unchanged — no configtest, no reload.
		const again = Bun.spawnSync([process.execPath, '--no-env-file', driver], {
			stdout: 'pipe',
			stderr: 'pipe',
		});
		expect(again.exitCode).toBe(0);
		expect(readFileSync(nginxLog, 'utf8').split('\n').filter(Boolean).length).toBe(2);
	});
});

describe('drill kit — the SVG treatment rows (MEDIA-03 through the publication host)', () => {
	const contract = {
		envelopeCsp: SVG_ENVELOPE_CSP,
		quarantineCsp: SVG_QUARANTINE_CSP,
		quarantineDisposition: SVG_QUARANTINE_DISPOSITION,
		nosniff: MEDIA_NOSNIFF,
	};
	const url = (rel: string) => `/dedalo/${config.mediaDir}/${rel}`;
	const served = (extra: Record<string, string>) =>
		new Headers({ 'X-Content-Type-Options': MEDIA_NOSNIFF, ...extra });

	test('each planted file IS the population it names (the engine selection rule, both dialects)', () => {
		const envelope = new RegExp(imageEnvelopePcre());
		const quarantine = new RegExp(svgQuarantinePcre());
		expect(isImageEnvelopeSvg(SVG_DRILL_FILES.envelope.split('/'))).toBe(true);
		expect(envelope.test(url(SVG_DRILL_FILES.envelope))).toBe(true);
		expect(isImageEnvelopeSvg(SVG_DRILL_FILES.uploaded.split('/'))).toBe(false);
		expect(envelope.test(url(SVG_DRILL_FILES.uploaded))).toBe(false);
		expect(quarantine.test(url(SVG_DRILL_FILES.uploaded))).toBe(true);
	});

	test('their qualities are public (survive the filter and the host input), and each file sits in one', () => {
		expect(filterPublicQualities(SVG_DRILL_QUALITIES)).toEqual([...SVG_DRILL_QUALITIES]);
		const host = normalizePublicationHostInput({ root: '/m', qualities: SVG_DRILL_QUALITIES });
		expect(host.dropped).toEqual([]);
		for (const rel of Object.values(SVG_DRILL_FILES))
			expect(SVG_DRILL_QUALITIES.some((q) => rel.startsWith(`${q}/`))).toBe(true);
	});

	test('the envelope: inline (absent or empty disposition) with the envelope CSP passes; anything else names what is wrong', () => {
		const good = served({ 'Content-Security-Policy': SVG_ENVELOPE_CSP });
		expect(svgTreatmentProblem('envelope', 200, good, contract)).toBeNull();
		expect(
			svgTreatmentProblem(
				'envelope',
				200,
				served({ 'Content-Security-Policy': SVG_ENVELOPE_CSP, 'Content-Disposition': '' }),
				contract,
			),
		).toBeNull();
		const attachment = served({
			'Content-Security-Policy': SVG_ENVELOPE_CSP,
			'Content-Disposition': 'attachment',
		});
		expect(svgTreatmentProblem('envelope', 200, attachment, contract)).toContain(
			'a Content-Disposition',
		);
		const quarantined = served({ 'Content-Security-Policy': SVG_QUARANTINE_CSP });
		expect(svgTreatmentProblem('envelope', 200, quarantined, contract)).toContain(
			'not the envelope CSP',
		);
		expect(svgTreatmentProblem('envelope', 404, good, contract)).toContain('status 404');
		const bare = new Headers({ 'Content-Security-Policy': SVG_ENVELOPE_CSP });
		expect(svgTreatmentProblem('envelope', 200, bare, contract)).toContain('no nosniff');
	});

	test('the uploaded svg: exactly `attachment` + the quarantine CSP passes; inline, absent or the envelope CSP fails', () => {
		const good = served({
			'Content-Security-Policy': SVG_QUARANTINE_CSP,
			'Content-Disposition': SVG_QUARANTINE_DISPOSITION,
		});
		expect(svgTreatmentProblem('uploaded', 200, good, contract)).toBeNull();
		for (const disposition of [undefined, '', 'inline']) {
			const headers = served({
				'Content-Security-Policy': SVG_QUARANTINE_CSP,
				...(disposition === undefined ? {} : { 'Content-Disposition': disposition }),
			});
			expect(svgTreatmentProblem('uploaded', 200, headers, contract)).toContain(
				'not Content-Disposition attachment',
			);
		}
		const envelopeCsp = served({
			'Content-Security-Policy': SVG_ENVELOPE_CSP,
			'Content-Disposition': SVG_QUARANTINE_DISPOSITION,
		});
		expect(svgTreatmentProblem('uploaded', 200, envelopeCsp, contract)).toContain(
			'not the quarantine CSP',
		);
		expect(svgTreatmentProblem('uploaded', 403, good, contract)).toContain('status 403');
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
