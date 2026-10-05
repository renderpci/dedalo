/**
 * THE PAIRING CLI (scripts/publication_host_pair.ts) — phase-3 decision E4: a publication host
 * enters the registry ONLY through this command, and ONLY after the pairing was proved LIVE.
 * It runs as the ENGINE USER (the owner of the private dir), never as root.
 *
 * Three layers:
 *   1. PURE — fragment grammar, address policy, token/bundle resolution, the fingerprint check
 *      and the owner rule, driven in-process (none of them touches a file or the network).
 *   2. ONE SPELLING — the fragment vocabulary is spelled in the CLI and in the agent's renderer
 *      (separate deployables); this gate reads the renderer's source and holds them equal.
 *   3. LIVE — the real CLI in a CHILD process whose DEDALO_PRIVATE_DIR is a scratch dir owned
 *      by this test's uid (the live ../private is never touched), against loopback mock agents:
 *      one mTLS listener on the shared phase-3 PKI fixture (test/helpers/publication_host_fixtures.ts
 *      mintTestPki: the agent provisioner's engine_bundle.pem layout), one unix socket. Each mock
 *      records every request, so "no network before the local checks pass" and "no bearer,
 *      ever" are ASSERTED, not assumed. The child is spawned ASYNC: a spawnSync would block
 *      this event loop and the mock agents with it.
 *
 * Every output and the registry text are scanned for the token, any PEM and the fingerprint.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
	AGENT_BASE_PATH,
	assertFragmentFingerprint,
	BUNDLE_PLACEHOLDER,
	commit,
	EXIT,
	FINGERPRINT_PENDING,
	FRAGMENT_KEYS,
	invocationOwnerProblem,
	PairRefusal,
	parseAgentAddress,
	parseFragment,
	resolveBundlePath,
	resolveToken,
	runPublicationHostPairCli,
	TOKEN_PLACEHOLDER,
} from '../../scripts/publication_host_pair.ts';
import { envSnapshot } from '../../src/config/env.ts';
import { publicationHostFingerprint } from '../../src/core/publication_host/pairing.ts';
import {
	loadRegistry,
	type PublicationHostRecord,
	saveRegistry,
} from '../../src/core/publication_host/registry.ts';
import { writeHostSecrets } from '../../src/core/publication_host/secrets.ts';
import {
	mintTestPki,
	type TestPki,
	useScratchPublicationHostsBase,
} from '../helpers/publication_host_fixtures.ts';

const ROOT = resolve(import.meta.dir, '../..');
const CLI = join(ROOT, 'scripts/publication_host_pair.ts');
const RENDERER = join(ROOT, 'publication/host_agent/src/provision/render/engine_fragment.ts');
const INSTANCE = 'test';
const TOKEN = 'pair-cli-test-token-not-a-secret-0123456789abcdef';
const OTHER_TOKEN = 'pair-cli-other-token-not-a-secret-0123456789abcdef';
const NAME = 'pubtest';

type FragmentField = keyof typeof FRAGMENT_KEYS;

const fp = (token: string, instance: string = INSTANCE): string =>
	publicationHostFingerprint(instance, token);

function pairRefusalOf(run: () => unknown): PairRefusal {
	try {
		run();
	} catch (error) {
		if (error instanceof PairRefusal) return error;
		throw error;
	}
	throw new Error('expected a PairRefusal, but the call succeeded');
}

function fragmentText(fields: Partial<Record<FragmentField, string>>): string {
	const lines = ['# test twin of the agent renderer output: KEY="value" lines'];
	for (const [field, key] of Object.entries(FRAGMENT_KEYS) as [FragmentField, string][]) {
		const value = fields[field];
		if (value !== undefined) lines.push(`${key}="${value}"`);
	}
	return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------------- 1. pure

describe('fragment grammar and pairing inputs (pure)', () => {
	const base = {
		instance: INSTANCE,
		url: `https://127.0.0.1:7443${AGENT_BASE_PATH}`,
		fingerprint: fp(TOKEN),
	};

	test('a key outside the pairing vocabulary is refused by name', () => {
		const text = `${fragmentText(base)}DEDALO_SITE_BUILDER_TOKEN="x"\n`;
		expect(pairRefusalOf(() => parseFragment(text)).message).toContain('DEDALO_SITE_BUILDER_TOKEN');
		expect(pairRefusalOf(() => parseFragment('# nothing here\n')).message).toContain(
			'no KEY=value',
		);
	});

	test('exactly one of URL and SOCKET', () => {
		const both = fragmentText({ ...base, socket: '/run/dedalo-pubhost/test/agent.sock' });
		const neither = fragmentText({ instance: INSTANCE, fingerprint: fp(TOKEN) });
		expect(pairRefusalOf(() => parseFragment(both)).message).toContain('exactly one of');
		expect(pairRefusalOf(() => parseFragment(neither)).message).toContain('exactly one of');
	});

	test('a pending or malformed fingerprint and a bad instance are refused; placeholders read as absent', () => {
		expect(
			pairRefusalOf(() =>
				parseFragment(fragmentText({ ...base, fingerprint: FINGERPRINT_PENDING })),
			).message,
		).toContain('provision apply');
		expect(
			pairRefusalOf(() => parseFragment(fragmentText({ ...base, fingerprint: 'ABC' }))).message,
		).toContain('64 lowercase hex');
		expect(
			pairRefusalOf(() => parseFragment(fragmentText({ ...base, instance: 'Bad-Name' }))).message,
		).toContain(FRAGMENT_KEYS.instance);
		const fields = parseFragment(
			fragmentText({ ...base, token: TOKEN_PLACEHOLDER, tlsBundle: BUNDLE_PLACEHOLDER }),
		);
		expect(fields).toEqual({
			instance: INSTANCE,
			fingerprint: fp(TOKEN),
			url: base.url,
			socket: null,
			tlsBundle: null,
			token: null,
		});
	});

	test('address policy: https + the agent base path only; IPv6 unbracketed; 443 default; absolute socket', () => {
		const url = (u: string) => ({ url: u, socket: null });
		expect(
			pairRefusalOf(() => parseAgentAddress(url(`http://10.8.0.2:7443${AGENT_BASE_PATH}`))).message,
		).toContain('https://');
		expect(
			pairRefusalOf(() => parseAgentAddress(url(`https://u:p@10.8.0.2:7443${AGENT_BASE_PATH}`)))
				.message,
		).toContain('https://');
		expect(
			pairRefusalOf(() => parseAgentAddress(url('https://10.8.0.2:7443/other'))).message,
		).toContain(AGENT_BASE_PATH);
		expect(parseAgentAddress(url(`https://[fd00::2]:7443${AGENT_BASE_PATH}`))).toEqual({
			kind: 'tls',
			host: 'fd00::2',
			port: 7443,
		});
		expect(parseAgentAddress(url(`https://pub.example.org${AGENT_BASE_PATH}/`))).toEqual({
			kind: 'tls',
			host: 'pub.example.org',
			port: 443,
		});
		expect(
			pairRefusalOf(() => parseAgentAddress({ url: null, socket: 'run/agent.sock' })).message,
		).toContain('absolute');
		expect(parseAgentAddress({ url: null, socket: '/run/agent.sock' })).toEqual({
			kind: 'unix',
			socket: '/run/agent.sock',
		});
	});

	test('token: placeholder without a supplied one, a contradiction, or a short one is refused', () => {
		expect(pairRefusalOf(() => resolveToken(null, null)).message).toContain('--token-file');
		expect(pairRefusalOf(() => resolveToken(TOKEN, OTHER_TOKEN)).message).toContain('different');
		expect(pairRefusalOf(() => resolveToken(null, 'short')).message).toContain('32');
		expect(resolveToken(TOKEN, null)).toBe(TOKEN);
		expect(resolveToken(null, TOKEN)).toBe(TOKEN);
		expect(resolveToken(TOKEN, TOKEN)).toBe(TOKEN);
	});

	test('bundle: none on a socket, required on mTLS, never two different ones', () => {
		expect(pairRefusalOf(() => resolveBundlePath('unix', null, '/x.pem')).message).toContain(
			'socket pairing',
		);
		expect(pairRefusalOf(() => resolveBundlePath('unix', '/x.pem', null)).message).toContain(
			'socket pairing',
		);
		expect(pairRefusalOf(() => resolveBundlePath('tls', null, null)).message).toContain('--bundle');
		expect(pairRefusalOf(() => resolveBundlePath('tls', '/a.pem', '/b.pem')).message).toContain(
			'different',
		);
		expect(resolveBundlePath('unix', null, null)).toBeNull();
		expect(resolveBundlePath('tls', '/a.pem', null)).toBe('/a.pem');
		expect(resolveBundlePath('tls', null, '/b.pem')).toBe('/b.pem');
	});

	test('the fragment fingerprint must be what instance + token hash to; wrong token and wrong instance read the same', () => {
		expect(assertFragmentFingerprint({ instance: INSTANCE, fingerprint: fp(TOKEN) }, TOKEN)).toBe(
			fp(TOKEN),
		);
		const wrongToken = pairRefusalOf(() =>
			assertFragmentFingerprint({ instance: INSTANCE, fingerprint: fp(TOKEN) }, OTHER_TOKEN),
		);
		const wrongInstance = pairRefusalOf(() =>
			assertFragmentFingerprint({ instance: 'other', fingerprint: fp(TOKEN) }, TOKEN),
		);
		expect(wrongToken.message).toContain('do not hash');
		expect(wrongInstance.message).toBe(wrongToken.message);
		expect(wrongToken.message).not.toContain(fp(TOKEN));
	});

	test('the CLI runs as the engine user (owner of the private dir): never root, never another user', () => {
		expect(invocationOwnerProblem(501, 501)).toBeNull();
		expect(invocationOwnerProblem(501, 0)).toContain('uid 501');
		expect(invocationOwnerProblem(501, 502)).toContain('sudo -u <engine user>');
		expect(invocationOwnerProblem(0, 0)).toContain('owned by root');
		expect(invocationOwnerProblem(0, 501)).toContain('owned by root');
	});

	test('a usage error never echoes a stray positional (a token pasted on the command line)', async () => {
		const stray = 'stray-positional-that-looks-like-a-token-0123456789';
		const r = await runPublicationHostPairCli(['add', NAME, '--fragment', '/nonexistent', stray]);
		expect(r.code).toBe(EXIT.usage);
		expect(r.stderr).not.toContain(stray);
		// parseArgs' own message repeats an unknown option or a missing value verbatim: a token
		// pasted as `--<token>` or after `-` must not come back on stderr
		for (const args of [
			['add', NAME, `--${stray}`],
			['add', NAME, `--token=${stray}`],
			['add', NAME, `-${stray}`],
			['add', NAME, `--dry-run=${stray}`],
		]) {
			const pasted = await runPublicationHostPairCli(args);
			expect(pasted.code).toBe(EXIT.usage);
			expect(pasted.stderr).not.toContain(stray);
			expect(pasted.stderr).not.toContain(stray.slice(1));
		}
		const reserved = await runPublicationHostPairCli(['remove', 'pairing_0a1b2c3d']);
		expect(reserved.code).toBe(EXIT.usage);
		expect(reserved.stderr).toContain('pairing_');
	});
});

// ------------------------------------------------------------------------- 2. one spelling

describe('the fragment vocabulary has ONE spelling across the agent renderer and this CLI', () => {
	test('keys, placeholders and the base path are the renderer literals', () => {
		const source = readFileSync(RENDERER, 'utf8');
		const literal = (name: string): string | undefined =>
			new RegExp(`${name} = '([^']+)'`).exec(source)?.[1];
		expect(literal('TOKEN_PLACEHOLDER')).toBe(TOKEN_PLACEHOLDER);
		expect(literal('BUNDLE_PLACEHOLDER')).toBe(BUNDLE_PLACEHOLDER);
		expect(literal('FINGERPRINT_PENDING')).toBe(FINGERPRINT_PENDING);
		expect(literal('AGENT_BASE_PATH')).toBe(AGENT_BASE_PATH);
		const keys = Object.fromEntries(
			[...source.matchAll(/^\s+(\w+): '(DEDALO_PUBLICATION_HOST_[A-Z_]+)',$/gm)].map((m) => [
				m[1],
				m[2],
			]),
		);
		expect(keys).toEqual({ ...FRAGMENT_KEYS });
	});
});

// --------------------------------------------------------------------------------- 3. live

interface AgentHit {
	method: string;
	path: string;
	authorization: string | null;
}

interface MockAgent {
	readonly port: number;
	readonly requests: AgentHit[];
	reset(publish: string): void;
	/** Run once on the next /health (models a concurrent writer during the proof). */
	onHealth(hook: () => void): void;
	stop(): void;
}

/** The agent's one public route, exactly as phase 2 serves it; everything else 404. */
function startAgent(listen: { tls: TestPki } | { unix: string }, publish: string): MockAgent {
	const requests: AgentHit[] = [];
	let published = publish;
	let healthHook: (() => void) | null = null;
	const fetch = (req: Request): Response => {
		const path = new URL(req.url).pathname;
		requests.push({ method: req.method, path, authorization: req.headers.get('authorization') });
		if (req.method === 'GET' && path === `${AGENT_BASE_PATH}/health`) {
			const hook = healthHook;
			healthHook = null;
			hook?.();
			return Response.json({
				status: 'ok',
				service: 'dedalo-publication-host-agent',
				instance_fingerprint: published,
			});
		}
		return new Response(null, { status: 404 });
	};
	const server =
		'unix' in listen
			? Bun.serve({ unix: listen.unix, fetch })
			: Bun.serve({
					hostname: '127.0.0.1',
					port: 0,
					fetch,
					tls: {
						cert: listen.tls.serverCertPem,
						key: listen.tls.serverKeyPem,
						ca: listen.tls.caPem,
						requestCert: true,
						rejectUnauthorized: true,
					},
				});
	return {
		port: server.port ?? 0,
		requests,
		reset(next: string): void {
			published = next;
			requests.length = 0;
			healthHook = null;
		},
		onHealth(hook: () => void): void {
			healthHook = hook;
		},
		stop(): void {
			server.stop(true);
		},
	};
}

let work: string;
let sockDir: string;
let pki: TestPki;
let tlsAgent: MockAgent;
let unixAgent: MockAgent;
let privateRoot: string;
let bundleFile: string;
let tokenFile: string;
let otherTokenFile: string;
let fragmentSeq = 0;

function writePrivate(path: string, body: string): string {
	writeFileSync(path, body, { mode: 0o600 });
	chmodSync(path, 0o600);
	return path;
}

/** 0644 on purpose: a fragment with only placeholders carries no secret and needs no 0600. */
function writeFragment(fields: Partial<Record<FragmentField, string>>): string {
	fragmentSeq += 1;
	const path = join(work, `fragment-${fragmentSeq}.env`);
	writeFileSync(path, fragmentText(fields), { mode: 0o644 });
	chmodSync(path, 0o644);
	return path;
}

const socketPath = (): string => join(sockDir, 'agent.sock');
const tlsFields = (
	over: Partial<Record<FragmentField, string>> = {},
): Partial<Record<FragmentField, string>> => ({
	instance: INSTANCE,
	url: `https://127.0.0.1:${tlsAgent.port}${AGENT_BASE_PATH}`,
	tlsBundle: BUNDLE_PLACEHOLDER,
	token: TOKEN_PLACEHOLDER,
	fingerprint: fp(TOKEN),
	...over,
});
const unixFields = (): Partial<Record<FragmentField, string>> => ({
	instance: INSTANCE,
	socket: socketPath(),
	token: TOKEN_PLACEHOLDER,
	fingerprint: fp(TOKEN),
});
const addTlsArgs = (
	name: string = NAME,
	fields = tlsFields(),
	token: string = tokenFile,
): string[] => [
	name,
	'--fragment',
	writeFragment(fields),
	'--bundle',
	bundleFile,
	'--token-file',
	token,
];

/** The real CLI, in a child whose private dir is the scratch one. Async on purpose (see header). */
async function runCli(args: string[], stdin?: string): Promise<{ code: number; out: string }> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(envSnapshot()))
		if (value !== undefined) env[key] = value;
	env.DEDALO_PRIVATE_DIR = privateRoot;
	const child = Bun.spawn([process.execPath, 'run', CLI, ...args], {
		cwd: ROOT,
		env,
		stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { code, out: `${stdout}${stderr}` };
}

const registryFile = (): string => join(privateRoot, 'publication_hosts.json');
const secretDir = (name: string): string => join(privateRoot, 'publication_hosts', name);
const registryHosts = (): Array<Record<string, unknown>> =>
	(JSON.parse(readFileSync(registryFile(), 'utf8')) as { hosts: Array<Record<string, unknown>> })
		.hosts;
function secretEntries(): string[] {
	const root = join(privateRoot, 'publication_hosts');
	return existsSync(root) ? readdirSync(root).sort() : [];
}
function expectNoSecret(text: string): void {
	expect(text).not.toContain(TOKEN);
	expect(text).not.toContain(OTHER_TOKEN);
	expect(text).not.toContain('BEGIN');
	expect(text).not.toContain(fp(TOKEN));
	expect(text).not.toContain(fp(OTHER_TOKEN));
}
function expectNothingWritten(): void {
	expect(existsSync(registryFile())).toBe(false);
	expect(secretEntries()).toEqual([]);
}
const HEALTH_ONLY: AgentHit = {
	method: 'GET',
	path: `${AGENT_BASE_PATH}/health`,
	authorization: null,
};

describe('live proof before write (child process, scratch private dir, loopback agents)', () => {
	beforeAll(() => {
		work = mkdtempSync(join(tmpdir(), 'dedalo-pair-cli-'));
		// macOS caps a unix socket path at 104 bytes; the default TMPDIR is too long for it.
		sockDir = mkdtempSync('/tmp/phpair-');
		pki = mintTestPki('dedalo-pair-cli-test');
		tlsAgent = startAgent({ tls: pki }, fp(TOKEN));
		unixAgent = startAgent({ unix: socketPath() }, fp(TOKEN));
		bundleFile = writePrivate(join(work, 'engine_bundle.pem'), pki.bundlePem);
		tokenFile = writePrivate(join(work, 'token'), `${TOKEN}\n`);
		otherTokenFile = writePrivate(join(work, 'other_token'), `${OTHER_TOKEN}\n`);
	});

	afterAll(() => {
		tlsAgent?.stop();
		unixAgent?.stop();
		rmSync(work, { recursive: true, force: true });
		rmSync(sockDir, { recursive: true, force: true });
	});

	beforeEach(() => {
		privateRoot = mkdtempSync(join(work, 'private-'));
		tlsAgent.reset(fp(TOKEN));
		unixAgent.reset(fp(TOKEN));
	});

	test('add over mTLS: proved by /health alone (no bearer), then registry + 0600 secrets, nothing secret anywhere', async () => {
		const r = await runCli(['add', ...addTlsArgs()]);
		expect(r.code, r.out).toBe(EXIT.ok);
		expect(r.out).toContain('pairing proved');
		expectNoSecret(r.out);
		expect(tlsAgent.requests).toEqual([HEALTH_ONLY]);
		const [host] = registryHosts();
		expect(host).toMatchObject({
			name: NAME,
			instance: INSTANCE,
			fingerprint: fp(TOKEN),
			address: { kind: 'tls', host: '127.0.0.1', port: tlsAgent.port },
			public_url: null,
			qualities: null,
			probe: { published: null, unpublished: null },
		});
		expect(typeof host?.paired_at).toBe('string');
		const registryText = readFileSync(registryFile(), 'utf8');
		expect(registryText).not.toContain(TOKEN);
		expect(registryText).not.toContain('BEGIN');
		expect(statSync(registryFile()).mode & 0o777).toBe(0o600);
		expect(statSync(secretDir(NAME)).mode & 0o777).toBe(0o700);
		expect(statSync(join(secretDir(NAME), 'token')).mode & 0o777).toBe(0o600);
		expect(statSync(join(secretDir(NAME), 'engine_bundle.pem')).mode & 0o777).toBe(0o600);
		expect(readFileSync(join(secretDir(NAME), 'token'), 'utf8').trim()).toBe(TOKEN);
		expect(secretEntries()).toEqual([NAME]); // the pairing_<hex> staging is gone
	});

	test('--dry-run proves the pairing and writes nothing', async () => {
		const r = await runCli(['add', ...addTlsArgs(), '--dry-run']);
		expect(r.code, r.out).toBe(EXIT.ok);
		expect(r.out).toContain('--dry-run');
		expect(tlsAgent.requests).toEqual([HEALTH_ONLY]);
		expectNothingWritten();
		// not even the secrets root the proof's transient staging needed
		expect(existsSync(join(privateRoot, 'publication_hosts'))).toBe(false);
	});

	test('--dry-run: a concurrent writer into the root it created never masks the proof outcome', async () => {
		// another pair run writes a host dir into the root this dry run just created: the
		// root is no longer only the dry run's, so it stays — and the verdict is the proof's
		const other = join(privateRoot, 'publication_hosts', 'other_pub');
		tlsAgent.onHealth(() => mkdirSync(other, { mode: 0o700 }));
		const ok = await runCli(['add', ...addTlsArgs(), '--dry-run']);
		expect(ok.code, ok.out).toBe(EXIT.ok);
		expect(ok.out).not.toContain('ENOTEMPTY');
		expect(secretEntries()).toEqual(['other_pub']);
		rmSync(join(privateRoot, 'publication_hosts'), { recursive: true });

		tlsAgent.reset(fp(OTHER_TOKEN)); // a failed proof keeps its own verdict too
		tlsAgent.onHealth(() => mkdirSync(other, { recursive: true, mode: 0o700 }));
		const bad = await runCli(['add', ...addTlsArgs(), '--dry-run']);
		expect(bad.code, bad.out).toBe(EXIT.refused);
		expect(bad.out).toContain('pairing_mismatch');
		expect(bad.out).not.toContain('ENOTEMPTY');
		expect(secretEntries()).toEqual(['other_pub']);
	});

	test('--dry-run never sweeps: a stale staging dir survives a dry add and a dry remove', async () => {
		const stale = join(privateRoot, 'publication_hosts', 'pairing_0a1b2c3d');
		mkdirSync(stale, { recursive: true, mode: 0o700 });
		const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
		utimesSync(stale, old, old);
		const dryAdd = await runCli(['add', ...addTlsArgs(), '--dry-run']);
		expect(dryAdd.code, dryAdd.out).toBe(EXIT.ok);
		const dryRemove = await runCli(['remove', NAME, '--dry-run']);
		expect(dryRemove.code, dryRemove.out).toBe(EXIT.refused); // nothing to remove
		expect(secretEntries()).toEqual(['pairing_0a1b2c3d']);
		expect(existsSync(registryFile())).toBe(false);
	});

	test('a dangling pairing_<hex> symlink is skipped by the sweep, never fatal, never followed', async () => {
		const root = join(privateRoot, 'publication_hosts');
		mkdirSync(root, { recursive: true, mode: 0o700 });
		symlinkSync(join(work, 'does-not-exist'), join(root, 'pairing_0a1b2c3d'));
		const r = await runCli(['add', ...addTlsArgs()]);
		expect(r.code, r.out).toBe(EXIT.ok);
		expect(r.out).toContain("skipped 'pairing_0a1b2c3d'");
		expect(secretEntries()).toEqual(['pairing_0a1b2c3d', NAME].sort());
	});

	test('the placeholder token without --token-file is refused before any connection', async () => {
		const r = await runCli([
			'add',
			NAME,
			'--fragment',
			writeFragment(tlsFields()),
			'--bundle',
			bundleFile,
		]);
		expect(r.code, r.out).toBe(EXIT.refused);
		expect(r.out).toContain('--token-file');
		expect(tlsAgent.requests).toEqual([]);
		expectNothingWritten();
	});

	test('a fragment carrying the live token must be 0600: at 0644 refused before any connection; at 0600 it pairs', async () => {
		const fragment = writeFragment(tlsFields({ token: TOKEN }));
		const loose = await runCli(['add', NAME, '--fragment', fragment, '--bundle', bundleFile]);
		expect(loose.code, loose.out).toBe(EXIT.refused);
		expect(loose.out).toContain('chmod 600');
		expectNoSecret(loose.out);
		expect(tlsAgent.requests).toEqual([]);
		expectNothingWritten();

		chmodSync(fragment, 0o600);
		const r = await runCli(['add', NAME, '--fragment', fragment, '--bundle', bundleFile]);
		expect(r.code, r.out).toBe(EXIT.ok);
		expectNoSecret(r.out);
		expect(tlsAgent.requests).toEqual([HEALTH_ONLY]);
		expect(readFileSync(join(secretDir(NAME), 'token'), 'utf8').trim()).toBe(TOKEN);
	});

	test('a token that does not hash to the fragment fingerprint is refused before any connection', async () => {
		const r = await runCli(['add', ...addTlsArgs(NAME, tlsFields(), otherTokenFile)]);
		expect(r.code, r.out).toBe(EXIT.refused);
		expect(r.out).toContain('do not hash');
		expectNoSecret(r.out);
		expect(tlsAgent.requests).toEqual([]);
		expectNothingWritten();
	});

	test('a group-readable bundle is refused before any connection', async () => {
		const loose = join(work, 'loose_bundle.pem');
		writeFileSync(loose, pki.bundlePem);
		chmodSync(loose, 0o644);
		const r = await runCli([
			'add',
			NAME,
			'--fragment',
			writeFragment(tlsFields()),
			'--bundle',
			loose,
			'--token-file',
			tokenFile,
		]);
		expect(r.code, r.out).toBe(EXIT.refused);
		expect(r.out).toContain('chmod 600');
		expect(tlsAgent.requests).toEqual([]);
		expectNothingWritten();
	});

	test('a LIVE pairing mismatch (agent re-provisioned) is refused: health only, no bearer, nothing written', async () => {
		tlsAgent.reset(fp(OTHER_TOKEN));
		const r = await runCli(['add', ...addTlsArgs()]);
		expect(r.code, r.out).toBe(EXIT.refused);
		expect(r.out).toContain('pairing_mismatch');
		expectNoSecret(r.out);
		expect(tlsAgent.requests).toEqual([HEALTH_ONLY]);
		expectNothingWritten();
	});

	test('an unreachable agent fails visibly and writes nothing', async () => {
		const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response(null) });
		const closedPort = probe.port;
		probe.stop(true);
		const fields = tlsFields({ url: `https://127.0.0.1:${closedPort}${AGENT_BASE_PATH}` });
		const r = await runCli(['add', ...addTlsArgs(NAME, fields)]);
		expect(r.code, r.out).toBe(EXIT.failed);
		expect(r.out).toContain('unreachable');
		expectNothingWritten();
	});

	test('add refuses a taken name (no connection); replace keeps the panel-edited fields', async () => {
		expect((await runCli(['add', ...addTlsArgs()])).code).toBe(EXIT.ok);
		tlsAgent.reset(fp(TOKEN));
		const again = await runCli(['add', ...addTlsArgs()]);
		expect(again.code, again.out).toBe(EXIT.refused);
		expect(again.out).toContain('replace');
		expect(tlsAgent.requests).toEqual([]);

		const file = JSON.parse(readFileSync(registryFile(), 'utf8')) as {
			hosts: Array<Record<string, unknown>>;
		};
		(file.hosts[0] as Record<string, unknown>).public_url = 'https://www.example.org';
		writeFileSync(registryFile(), JSON.stringify(file));
		const r = await runCli(['replace', ...addTlsArgs()]);
		expect(r.code, r.out).toBe(EXIT.ok);
		expect(registryHosts()).toHaveLength(1);
		expect(registryHosts()[0]?.public_url).toBe('https://www.example.org');
		expect(tlsAgent.requests).toEqual([HEALTH_ONLY]);
	});

	test('replace with a fragment the live agent does not match leaves the record and the token untouched', async () => {
		expect((await runCli(['add', ...addTlsArgs()])).code).toBe(EXIT.ok);
		const before = readFileSync(registryFile(), 'utf8');
		const tokenBefore = readFileSync(join(secretDir(NAME), 'token'), 'utf8');
		const fields = tlsFields({ fingerprint: fp(OTHER_TOKEN) });
		const r = await runCli(['replace', ...addTlsArgs(NAME, fields, otherTokenFile)]);
		expect(r.code, r.out).toBe(EXIT.refused);
		expect(r.out).toContain('pairing_mismatch');
		expect(readFileSync(registryFile(), 'utf8')).toBe(before);
		expect(readFileSync(join(secretDir(NAME), 'token'), 'utf8')).toBe(tokenBefore);
		expect(secretEntries()).toEqual([NAME]);
	});

	test('one agent cannot be registered under a second name', async () => {
		expect((await runCli(['add', ...addTlsArgs()])).code).toBe(EXIT.ok);
		tlsAgent.reset(fp(TOKEN));
		const r = await runCli(['add', ...addTlsArgs('pubtest_b')]);
		expect(r.code, r.out).toBe(EXIT.refused);
		expect(r.out).toContain(`'${NAME}'`);
		expect(tlsAgent.requests).toEqual([]);
		expect(registryHosts().map((h) => h.name)).toEqual([NAME]);
	});

	test('a corrupt registry is refused loudly (registry_invalid), never read as empty, never overwritten', async () => {
		const corrupt = '{"version":1,"hosts":[';
		writePrivate(registryFile(), corrupt);
		const r = await runCli(['add', ...addTlsArgs()]);
		expect(r.code, r.out).toBe(EXIT.refused);
		expect(r.out).toContain('registry_invalid');
		expect(readFileSync(registryFile(), 'utf8')).toBe(corrupt);
		expect(tlsAgent.requests).toEqual([]);
		expect(secretEntries()).toEqual([]);
	});

	test('remove deletes the entry and its secrets; removing an unknown host is refused', async () => {
		expect((await runCli(['add', ...addTlsArgs()])).code).toBe(EXIT.ok);
		const r = await runCli(['remove', NAME]);
		expect(r.code, r.out).toBe(EXIT.ok);
		expect(registryHosts()).toEqual([]);
		expect(secretEntries()).toEqual([]);
		const again = await runCli(['remove', NAME]);
		expect(again.code, again.out).toBe(EXIT.refused);
		expect(again.out).toContain('no publication host');
	});

	test('a host whose secret the engine refuses (token 0644) is still removable', async () => {
		expect((await runCli(['add', ...addTlsArgs()])).code).toBe(EXIT.ok);
		chmodSync(join(secretDir(NAME), 'token'), 0o644);
		const r = await runCli(['remove', NAME]);
		expect(r.code, r.out).toBe(EXIT.ok);
		expect(registryHosts()).toEqual([]);
		expect(secretEntries()).toEqual([]);

		// leftovers only (no registry entry), refused mode: still removable, never "no host"
		mkdirSync(secretDir('pubtest_c'), { recursive: true, mode: 0o700 });
		writeFileSync(join(secretDir('pubtest_c'), 'token'), `${TOKEN}\n`, { mode: 0o644 });
		chmodSync(join(secretDir('pubtest_c'), 'token'), 0o644);
		const leftovers = await runCli(['remove', 'pubtest_c']);
		expect(leftovers.code, leftovers.out).toBe(EXIT.ok);
		expect(leftovers.out).toContain('leftover secrets');
		expectNoSecret(leftovers.out);
		expect(secretEntries()).toEqual([]);
	});

	test('the staging sweep removes only a stale pairing_<hex> dir; a pairing_ name that is not a host name is skipped, never fatal', async () => {
		const root = join(privateRoot, 'publication_hosts');
		const stale = join(root, 'pairing_0a1b2c3d');
		const fresh = join(root, 'pairing_99999999');
		const odd = join(root, 'pairing_ABC');
		for (const dir of [stale, fresh, odd]) mkdirSync(dir, { recursive: true, mode: 0o700 });
		const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
		utimesSync(stale, old, old);
		utimesSync(odd, old, old);
		const r = await runCli(['remove', NAME]);
		expect(r.code, r.out).toBe(EXIT.refused); // the sweep ran; the remove itself has nothing to remove
		expect(r.out).toContain('no publication host');
		expect(r.out).toContain("'pairing_ABC'");
		expect(secretEntries()).toEqual(['pairing_99999999', 'pairing_ABC']);
	});

	test('a token pasted where a PATH belongs (--token-file, --bundle, --fragment) is never echoed', async () => {
		const tlsFragment = writeFragment(tlsFields());
		const runs = [
			['add', NAME, '--fragment', tlsFragment, '--bundle', bundleFile, '--token-file', TOKEN],
			['add', NAME, '--fragment', tlsFragment, '--bundle', TOKEN, '--token-file', tokenFile],
			['add', NAME, '--fragment', TOKEN, '--bundle', bundleFile, '--token-file', tokenFile],
		];
		for (const args of runs) {
			const r = await runCli(args);
			expect(r.code, r.out).toBe(EXIT.refused);
			expect(r.out).toContain('could not be read (ENOENT)');
			expect(r.out).not.toContain(TOKEN);
		}
		expect(tlsAgent.requests).toEqual([]);
		expectNothingWritten();
	});

	test('same machine: a socket pairing with the token on stdin; no bundle stored; a --bundle is refused', async () => {
		const refused = await runCli(
			[
				'add',
				'pubsock',
				'--fragment',
				writeFragment(unixFields()),
				'--bundle',
				bundleFile,
				'--token-stdin',
			],
			TOKEN,
		);
		expect(refused.code, refused.out).toBe(EXIT.refused);
		expect(refused.out).toContain('socket pairing');
		expect(unixAgent.requests).toEqual([]);

		const r = await runCli(
			['add', 'pubsock', '--fragment', writeFragment(unixFields()), '--token-stdin'],
			TOKEN,
		);
		expect(r.code, r.out).toBe(EXIT.ok);
		expectNoSecret(r.out);
		expect(unixAgent.requests).toEqual([HEALTH_ONLY]);
		expect(registryHosts()[0]).toMatchObject({
			name: 'pubsock',
			address: { kind: 'unix', socket: socketPath() },
		});
		expect(existsSync(join(secretDir('pubsock'), 'token'))).toBe(true);
		expect(existsSync(join(secretDir('pubsock'), 'engine_bundle.pem'))).toBe(false);
	});
});

// --------------------------------------------------------------- 4. the locked commit (race)

describe('commit: the slot is re-checked under the registry lock BEFORE any secret is written', () => {
	let scratch: ReturnType<typeof useScratchPublicationHostsBase>;
	beforeEach(() => {
		scratch = useScratchPublicationHostsBase();
	});
	afterEach(() => scratch.dispose());

	const record = (name: string, token: string, port: number): PublicationHostRecord => ({
		name,
		instance: INSTANCE,
		fingerprint: fp(token),
		address: { kind: 'tls', host: '127.0.0.1', port },
		public_url: null,
		qualities: null,
		probe: { published: null, unpublished: null },
		paired_at: '2026-10-05T00:00:00.000Z',
	});
	const tokenOf = (name: string): string =>
		readFileSync(join(scratch.base, 'publication_hosts', name, 'token'), 'utf8').trim();

	test('a concurrent add won the name: refused, and the registered host keeps its token', () => {
		saveRegistry({ version: 1, hosts: [record('pub_a', TOKEN, 7001)] });
		writeHostSecrets('pub_a', TOKEN, null);
		const refusal = pairRefusalOf(() =>
			commit('add', record('pub_a', OTHER_TOKEN, 7002), OTHER_TOKEN, null),
		);
		expect(refusal.message).toContain('already registered');
		expect(tokenOf('pub_a')).toBe(TOKEN);
		expect(loadRegistry().hosts).toEqual([record('pub_a', TOKEN, 7001)]);
	});

	test('the host being replaced was removed meanwhile: refused, and no credential is left unlisted', () => {
		saveRegistry({ version: 1, hosts: [] });
		const refusal = pairRefusalOf(() =>
			commit('replace', record('pub_a', OTHER_TOKEN, 7002), OTHER_TOKEN, null),
		);
		expect(refusal.message).toContain('Use `add`');
		expect(existsSync(join(scratch.base, 'publication_hosts', 'pub_a'))).toBe(false);
		expect(loadRegistry().hosts).toEqual([]);
	});

	test('a free slot: secrets and entry land together', () => {
		commit('add', record('pub_a', TOKEN, 7001), TOKEN, null);
		expect(tokenOf('pub_a')).toBe(TOKEN);
		expect(loadRegistry().hosts.map((h) => h.name)).toEqual(['pub_a']);
	});
});
