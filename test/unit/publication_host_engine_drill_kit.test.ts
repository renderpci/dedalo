/**
 * THE PUBLICATION-HOST ENGINE DRILL'S OWN PIECES — held without the live servers.
 *
 * scripts/publication_host_engine_drill.ts runs on the instance tier only (it boots the
 * engine, the agent, Apache, nginx and MariaDB). What it hands the pair CLI and what it
 * reads back from the panel must be right before it can prove anything, so this gate
 * holds, hermetically:
 *   - the fragment it writes parses back (the ENGINE's own parseEnvFile) to exactly the
 *     agent renderer's ENGINE_KEYS — tls: url + bundle, unix: socket — and refuses a value
 *     that cannot be one double-quoted line;
 *   - the bundle is client certificate, PKCS#8 key, CA, one block each, in that order,
 *     0600 inside a 0700 dir;
 *   - where the engine keeps hosts (E2/E3), the CLI argv (POSITIONAL host name, Task 5's
 *     strict parseArgs has no --name) and the CLI exit codes, mirrored in the kit because
 *     the kit must stay engine-free — held equal to the CLI's own EXIT here;
 *   - the panel reader speaks Task 7's wire: registry.{state, reason}, `hosts` an array iff
 *     the state is ok and null otherwise (an invalid registry carrying [] is refused — that
 *     is the "empty list" Review Focus 2 forbids);
 *   - the secret scan finds a token, a key line and any PEM block and NAMES them, never
 *     echoing the value;
 *   - RF1 read on the AGENT side: a refused mutation's agent request lines are the anonymous
 *     /health probe only — a bearer route (a 401 the engine re-probes into pairing_mismatch)
 *     is named, and no request line at all is "unobserved", never green;
 *   - a refused pair run's leftover `pairing_` staging dir is found (prefix = the CLI's);
 *   - the closed exec set refuses release-only lines on a pass that planted no release;
 *   - the shared row book counts RED;
 *   - the drill itself is RED, naming what is missing, on a runner without the binaries.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SYSTEMCTL, V2_SCRATCH_TEMPLATE_SUFFIX } from '../../publication/host_agent/src/exec.ts';
import { ENGINE_KEYS } from '../../publication/host_agent/src/provision/render/engine_fragment.ts';
import {
	configtestCall,
	createRowBook,
	inClosedSet,
	reloadCall,
	restartCall,
	V2_UNIT,
	WIRE,
} from '../../scripts/lib/publication_host_agent_scene.ts';
import {
	assertSecretFree,
	bearerSentProblem,
	bundleKeySecrets,
	checkState,
	engineBundlePem,
	hostRow,
	hostSecretFiles,
	modeOf,
	okHosts,
	PAIR_CLI,
	PANEL,
	type PanelRow,
	pairArgv,
	readPanel,
	registryFile,
	renderEngineFragment,
	secretLeaks,
	stagingLeftovers,
	writeEngineBundlePem,
} from '../../scripts/lib/publication_host_engine_drill_kit.ts';
import { parseEnvFile } from '../../src/config/env.ts';

const scratch = mkdtempSync(join(tmpdir(), 'dd_pubhost_engine_kit_'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const pem = (label: string, body: string) =>
	`-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
const CERT = pem('CERTIFICATE', 'Q0xJRU5UX0NFUlQ'.repeat(5));
const KEY = pem('PRIVATE KEY', 'S0VZX0JPRFlfTElORQ'.repeat(4));
const CA = pem('CERTIFICATE', 'QVVUSE9SSVRZ'.repeat(6));
const FP = 'a'.repeat(64);
const TOKEN = 't'.repeat(48);
const TLS = {
	kind: 'tls',
	host: '127.0.0.1',
	port: 7443,
	bundlePath: '/work/engine_bundle.pem',
} as const;
const ROW: PanelRow = {
	name: 'drill_apache',
	address_label: '127.0.0.1:7443',
	public_url: null,
	checks: [{ id: 'pairing', state: 'ok' }],
	rules: { expected: null, reported: null },
	apis: { v1: { current: null, previous: null }, v2: { current: null, previous: null } },
	token_present: true,
	bundle_present: true,
	pairing_proved: true,
};

describe('engine drill kit — the operator artifacts', () => {
	test("the tls fragment parses back to the agent's ENGINE_KEYS: url + bundle, never a socket", () => {
		const parsed = parseEnvFile(
			renderEngineFragment({ instance: 'pubdrill', token: TOKEN, fingerprint: FP, address: TLS }),
		);
		expect(parsed).toEqual({
			[ENGINE_KEYS.instance]: 'pubdrill',
			[ENGINE_KEYS.url]: 'https://127.0.0.1:7443/publication/host_agent',
			[ENGINE_KEYS.tlsBundle]: '/work/engine_bundle.pem',
			[ENGINE_KEYS.token]: TOKEN,
			[ENGINE_KEYS.fingerprint]: FP,
		});
	});

	test('the unix fragment carries the socket, never a url or a bundle', () => {
		const parsed = parseEnvFile(
			renderEngineFragment({
				instance: 'pubdrill',
				token: TOKEN,
				fingerprint: FP,
				address: { kind: 'unix', socket: '/run/dedalo_publication_host/pubdrill.sock' },
			}),
		);
		expect(parsed).toEqual({
			[ENGINE_KEYS.instance]: 'pubdrill',
			[ENGINE_KEYS.socket]: '/run/dedalo_publication_host/pubdrill.sock',
			[ENGINE_KEYS.token]: TOKEN,
			[ENGINE_KEYS.fingerprint]: FP,
		});
	});

	test('a value that cannot be one double-quoted line is refused', () => {
		for (const token of ['a"b', 'a\nb', '']) {
			expect(() =>
				renderEngineFragment({ instance: 'pubdrill', token, fingerprint: FP, address: TLS }),
			).toThrow(`${ENGINE_KEYS.token} is empty or cannot be one double-quoted line`);
		}
	});

	test('the bundle is client cert, PKCS#8 key, CA — in that order, one block each', () => {
		expect(engineBundlePem({ cert: CERT, key: KEY, ca: CA })).toBe(`${CERT}${KEY}${CA}`);
		expect(() =>
			engineBundlePem({ cert: CERT, key: pem('EC PRIVATE KEY', 'U0VDMV9LRVlfQk9EWQ'), ca: CA }),
		).toThrow("the key must be exactly one 'PRIVATE KEY' block (PKCS#8");
		expect(() => engineBundlePem({ cert: KEY, key: CERT, ca: CA })).toThrow(
			"the cert must be exactly one 'CERTIFICATE' block",
		);
		expect(() => engineBundlePem({ cert: CERT, key: KEY, ca: `${CA}${CA}` })).toThrow(
			"the ca must be exactly one 'CERTIFICATE' block",
		);
	});

	test('the bundle file is 0600 inside a 0700 dir', () => {
		const path = join(scratch, 'engine_bundle', 'engine_bundle.pem');
		writeEngineBundlePem(path, `${CERT}${KEY}${CA}`);
		expect(statSync(path).mode & 0o777).toBe(0o600);
		expect(statSync(join(scratch, 'engine_bundle')).mode & 0o777).toBe(0o700);
		expect(readFileSync(path, 'utf8')).toBe(`${CERT}${KEY}${CA}`);
	});
});

describe('engine drill kit — where the engine keeps hosts, how the CLI and the panel are spoken', () => {
	test("registry and secret paths are E2/E3's; an absent file has no mode", () => {
		expect(registryFile('/p')).toBe('/p/publication_hosts.json');
		expect(hostSecretFiles('/p', 'drill_apache')).toEqual({
			dir: '/p/publication_hosts/drill_apache',
			token: '/p/publication_hosts/drill_apache/token',
			bundle: '/p/publication_hosts/drill_apache/engine_bundle.pem',
		});
		expect(modeOf(join(scratch, 'absent'))).toBe(-1);
	});

	test('pair argv: the host name is POSITIONAL; add and replace carry the fragment, remove only the name', () => {
		expect(pairArgv('add', 'drill_apache', '/f')).toEqual([
			'add',
			'drill_apache',
			'--fragment',
			'/f',
		]);
		expect(pairArgv('replace', 'drill_nginx', '/g')).toEqual([
			'replace',
			'drill_nginx',
			'--fragment',
			'/g',
		]);
		expect(pairArgv('remove', 'drill_nginx')).toEqual(['remove', 'drill_nginx']);
		expect(pairArgv('add', 'drill_apache', '/f')).not.toContain('--name');
		expect(() => pairArgv('add', 'drill_apache')).toThrow('pair add needs --fragment');
	});

	test("PAIR_CLI.exit mirrors the CLI's EXIT (the kit stays engine-free, so the codes are copied and held equal here)", async () => {
		const { EXIT } = await import('../../scripts/publication_host_pair.ts');
		expect(PAIR_CLI.exit).toEqual({ ...EXIT });
	});

	test("PAIR_CLI.stagingPrefix is the CLI's STAGING_PREFIX; stagingLeftovers lists only those dirs", async () => {
		const { STAGING_PREFIX } = await import('../../scripts/publication_host_pair.ts');
		expect(PAIR_CLI.stagingPrefix).toBe(STAGING_PREFIX);
		const priv = join(scratch, 'staging_private');
		expect(stagingLeftovers(priv)).toEqual([]); // no secrets dir yet
		mkdirSync(join(priv, 'publication_hosts', 'drill_apache'), { recursive: true });
		expect(stagingLeftovers(priv)).toEqual([]);
		mkdirSync(join(priv, 'publication_hosts', `${STAGING_PREFIX}0a1b2c3d`));
		expect(stagingLeftovers(priv)).toEqual([`${STAGING_PREFIX}0a1b2c3d`]);
	});

	test("readPanel: registry.state 'ok' carries a hosts array; a payload without registry.state is refused, naming the field", () => {
		const panel = readPanel({
			[PANEL.registry]: { state: PANEL.registryOk, reason: null },
			[PANEL.hosts]: [ROW],
		});
		expect(panel.registryState).toBe('ok');
		expect(panel.registryReason).toBeNull();
		expect(okHosts(panel)).toHaveLength(1);
		expect(hostRow(panel, 'drill_apache')?.address_label).toBe('127.0.0.1:7443');
		expect(hostRow(panel, 'drill_nginx')).toBeNull();
		expect(checkState(ROW, 'pairing')).toBe('ok');
		expect(checkState(ROW, 'reachable')).toBeNull();
		expect(() => readPanel({ registry: { state: 'ok', reason: null }, hosts: null })).toThrow(
			"registry ok but 'hosts' is not an array",
		);
		expect(() => readPanel({ registry_state: 'ok', hosts: [] })).toThrow(
			"no string 'registry.state'",
		);
	});

	test('readPanel: an unusable registry carries hosts null — never [] — and its reason', () => {
		const panel = readPanel({
			registry: { state: PANEL.registryInvalid, reason: 'invalid_json' },
			hosts: null,
		});
		expect(panel).toEqual({
			registryState: 'registry_invalid',
			registryReason: 'invalid_json',
			hosts: null,
		});
		expect(hostRow(panel, 'drill_apache')).toBeNull();
		expect(() => okHosts(panel)).toThrow('the registry is registry_invalid (invalid_json)');
		expect(() =>
			readPanel({ registry: { state: PANEL.registryInvalid, reason: 'invalid_json' }, hosts: [] }),
		).toThrow("but 'hosts' is [], not null");
	});
});

describe('engine drill kit — the secret scan', () => {
	test('finds a token, a key line and any PEM block — and names them by label, never by value', () => {
		const secrets = [
			{ label: 'the agent token', value: TOKEN },
			...bundleKeySecrets(`${CERT}${KEY}${CA}`),
		];
		const keyLine = KEY.split('\n')[1] as string;
		const leaks = secretLeaks(
			JSON.stringify({ x: TOKEN, y: keyLine, z: '-----BEGIN CERTIFICATE-----' }),
			secrets,
		);
		expect([...leaks].sort()).toEqual(['a PEM block', 'the agent token', 'the engine client key']);
		expect(leaks.join(' ')).not.toContain(TOKEN);
		expect(leaks.join(' ')).not.toContain(keyLine);
	});

	test('clean text has no leak; certificate bodies are not counted as key lines', () => {
		const secrets = bundleKeySecrets(`${CERT}${KEY}${CA}`);
		expect(secrets.length).toBeGreaterThan(0);
		expect(
			secretLeaks(JSON.stringify({ token_present: true, bundle_present: true }), secrets),
		).toEqual([]);
		expect(secretLeaks(CERT.split('\n')[1] as string, secrets)).toEqual([]);
	});

	test('assertSecretFree: throws naming where + labels, never the value; clean text passes', () => {
		const secrets = [{ label: 'the foreign token', value: TOKEN }];
		expect(() => assertSecretFree('the pair CLI (add, exit 3)', 'ok', secrets)).not.toThrow();
		let message = '';
		try {
			assertSecretFree('the pair CLI (add, exit 3)', `refused: ${TOKEN}`, secrets);
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toBe('secret material in the pair CLI (add, exit 3): the foreign token');
		expect(message).not.toContain(TOKEN);
		expect(() => assertSecretFree('get_value', '-----BEGIN PRIVATE KEY-----', [])).toThrow(
			'a PEM block',
		);
	});
});

describe('engine drill kit — RF1 read on the agent side', () => {
	const probe = `GET ${WIRE.health} 200 1.3ms`;
	test('only anonymous /health probes → no problem; non-request lines ignored', () => {
		expect(bearerSentProblem([probe, 'some boot line', probe], WIRE.health)).toBeNull();
	});
	test('a bearer route after the probe (the 401 the engine re-probes into pairing_mismatch) → named', () => {
		const problem = bearerSentProblem(
			[probe, `POST ${WIRE.rulesApply} 401 0.8ms`, probe],
			WIRE.health,
		);
		expect(problem).toContain('the bearer left before the proof');
		expect(problem).toContain(`POST ${WIRE.rulesApply} 401`);
		expect(bearerSentProblem([`GET ${WIRE.status} 200 2.0ms`], WIRE.health)).toContain(WIRE.status);
		expect(bearerSentProblem([`GET ${WIRE.health} 503 2.0ms`], WIRE.health)).not.toBeNull();
	});
	test('no request line at all → the claim is unobserved, never green', () => {
		expect(bearerSentProblem([], WIRE.health)).toContain('unobserved');
		expect(bearerSentProblem(['listening'], WIRE.health)).toContain('unobserved');
	});
});

describe('the closed exec set', () => {
	const scene = { server: 'nginx' } as const;
	test('configtest + reload are always in; release-only lines are refused when no release was planted', () => {
		for (const line of [configtestCall('nginx'), reloadCall('nginx')]) {
			expect(inClosedSet(scene, line)).toBe(true);
			expect(inClosedSet(scene, line, { releases: false })).toBe(true);
		}
		const releaseLines = [
			restartCall,
			'v2 started in /x/releases/1',
			'scratch started in /x',
			`${SYSTEMCTL} start ${V2_UNIT}${V2_SCRATCH_TEMPLATE_SUFFIX}18080.service`,
			`${SYSTEMCTL} stop ${V2_UNIT}${V2_SCRATCH_TEMPLATE_SUFFIX}18080.service`,
		];
		for (const line of releaseLines) {
			expect(inClosedSet(scene, line)).toBe(true);
			expect(inClosedSet(scene, line, { releases: false })).toBe(false);
		}
		expect(inClosedSet(scene, configtestCall('apache'))).toBe(false);
	});
	test('php -l is in only on a release pass with a lint root, only for a .php under that root', () => {
		const root = '/s/publication_api/v1';
		const lint = `php -l ${root}/staging/a/json/index.php`;
		expect(inClosedSet(scene, lint)).toBe(false);
		expect(inClosedSet(scene, lint, { phpLintRoot: root })).toBe(true);
		expect(inClosedSet(scene, lint, { releases: false, phpLintRoot: root })).toBe(false);
		for (const line of [
			'php -l /etc/x.php',
			`php -l ${root}x/a.php`,
			`php -l ${root}/../x.php`,
			`php -l ${root}/a.txt`,
			`php -r ${root}/a.php`,
			`php -l ${root}/a.php extra`,
		])
			expect(inClosedSet(scene, line, { phpLintRoot: root })).toBe(false);
	});
});

describe('the shared row book', () => {
	test('ok and RED lines, the RED count, and fail()', async () => {
		const lines: string[] = [];
		const book = createRowBook((line) => lines.push(line));
		await book.row('a', () => null);
		await book.row('b', () => 'broken');
		await book.row('c', async () => {
			throw new Error('boom');
		});
		book.fail('[apache] the pass could not run', new Error('no apxs'));
		expect(lines).toEqual([
			'ok   a',
			'RED  b (broken)',
			'RED  c (threw: boom)',
			'RED  [apache] the pass could not run: no apxs',
		]);
		expect(book.red).toBe(3);
	});
});

describe('test:pubhost:engine — binaries missing = RED', () => {
	const DRILL = join(import.meta.dir, '..', '..', 'scripts', 'publication_host_engine_drill.ts');
	const run = (...args: string[]) => {
		const r = Bun.spawnSync([process.execPath, DRILL, ...args], {
			env: { ...process.env, PATH: '/nonexistent' },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		return { code: r.exitCode, out: `${r.stdout.toString()}${r.stderr.toString()}` };
	};

	test('PATH without the tools → exit 1, each one named, no green', () => {
		const r = run();
		expect(r.code).toBe(1);
		expect(r.out).toContain(
			'missing on PATH: openssl, git, bash, php, apache: apxs, nginx: nginx.',
		);
		expect(r.out).not.toContain('ALL GREEN');
	});

	test('--only narrows the web-server requirement', () => {
		const r = run('--only', 'apache');
		expect(r.code).toBe(1);
		expect(r.out).toContain('missing on PATH: openssl, git, bash, php, apache: apxs.');
		expect(r.out).not.toContain('nginx: nginx');
	});
});
