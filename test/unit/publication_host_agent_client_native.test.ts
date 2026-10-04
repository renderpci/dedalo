/**
 * PUBLICATION-HOST AGENT CLIENT (phase 3, E6/E7) — pairing before the bearer, every §6
 * command, and the agent problem → publication_host.* mapping, against a LOOPBACK mock
 * agent over REAL mTLS (Task 1's openssl-minted PKI) and over unix sockets.
 *
 * Pins: mutations re-prove /health LIVE on every call (a re-provisioned agent receives
 * the anonymous /health and nothing else — Review Focus 1); reads may ride a cached proof
 * keyed on name + fingerprint + address (the named residual: one read bearer may reach a
 * re-provisioned agent before the 401 re-probe); the door refuses a unix socket in a
 * group/other-writable directory or behind a symlink (impostor resistance for unix is the
 * filesystem, not the fingerprint).
 *
 * No live <private>: the registry and the per-host secret dirs live in Task 1's
 * marker-guarded scratch base. Sockets live in a short /tmp scratch dir (sun_path).
 *
 * ORDER-DEPENDENT on purpose: the LAST test scans every error this file provoked and every
 * console.error line for the fixture secrets (Review Focus 5). bun runs a file's tests in
 * declaration order.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { DedaloError, toErrorBody } from '../../src/core/errors/index.ts';
import {
	forgetPairing,
	hostApplyRules,
	hostInstallRelease,
	hostMediaProbe,
	hostRollbackRelease,
	hostStatus,
	pairingProved,
	proveHostPairing,
} from '../../src/core/publication_host/agent_client.ts';
import {
	getHost,
	type PublicationHostRecord,
	registryPath,
	saveRegistry,
} from '../../src/core/publication_host/registry.ts';
import { hostSecretDir, writeHostSecrets } from '../../src/core/publication_host/secrets.ts';
import { AGENT_BASE_PATH } from '../../src/core/publication_host/transport.ts';
import {
	mintTestPki,
	type TestPki,
	useScratchPublicationHostsBase,
} from '../helpers/publication_host_fixtures.ts';
import {
	MOCK_PROBE,
	type MockAgent,
	mockFingerprint,
	mockProblem,
	startMockAgent,
} from '../helpers/publication_host_mock_agent.ts';

const INSTANCE = 'test';
const TOKEN_A = `token-a-${'a'.repeat(40)}`;
const TOKEN_B = `token-b-${'b'.repeat(40)}`;
const ACTOR = 'root';
const RULES_HASH = 'c'.repeat(64);
const RELEASE_ID = '7.0.3_a1b2c3d';
const B = AGENT_BASE_PATH;
const AGENT_PROSE = 'configtest said: /etc/apache2/secret.conf line 9';
const HOST_NAMES = [
	'museum_pub',
	'local_pub',
	'drifted_pub',
	'down_pub',
	'loose_pub',
	'linked_pub',
] as const;

let scratch: { base: string; dispose: () => void } | null = null;
let sockRoot = '';
let pki: TestPki;
let mock: MockAgent;
let unixMock: MockAgent;
let looseMock: MockAgent;
let downMock: MockAgent;
let logSpy: ReturnType<typeof spyOn>;
const seenErrors: DedaloError[] = [];

function record(
	name: string,
	address: PublicationHostRecord['address'],
	fingerprint: string,
): PublicationHostRecord {
	return {
		name,
		instance: INSTANCE,
		fingerprint,
		address,
		public_url: null,
		qualities: null,
		probe: { published: null, unpublished: null },
		paired_at: '2026-10-03T00:00:00.000Z',
	};
}

function hostRecord(name: string): PublicationHostRecord {
	const found = getHost(name);
	if (found === null) throw new Error(`fixture host ${name} is missing from the scratch registry`);
	return found;
}

async function expectCode(pending: Promise<unknown>, code: string): Promise<DedaloError> {
	const error = await pending.then(
		() => null,
		(caught: unknown) => caught,
	);
	expect(error).toBeInstanceOf(DedaloError);
	const typed = error as DedaloError;
	expect<string>(typed.code).toBe(code);
	seenErrors.push(typed);
	return typed;
}

/** What the wire carries for an error (code, sentence, details) — the flag-gated block excluded. */
const wireText = (error: DedaloError) => {
	const body = toErrorBody(error);
	return JSON.stringify([body.code, body.message, body.details]);
};
const trail = (agent: MockAgent) =>
	agent.requests.map(
		(r) => `${r.method} ${r.path} ${r.authorization === null ? 'anon' : 'bearer'}`,
	);
const bearerSent = (agent: MockAgent) => agent.requests.filter((r) => r.authorization !== null);
const last = (agent: MockAgent) => {
	const r = agent.requests.at(-1);
	if (r === undefined) throw new Error('the mock agent recorded no request');
	return r;
};
const streamOf = (...parts: Uint8Array[]) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			for (const part of parts) controller.enqueue(part);
			controller.close();
		},
	});

beforeAll(() => {
	logSpy = spyOn(console, 'error').mockImplementation(() => {});
	scratch = useScratchPublicationHostsBase();
	pki = mintTestPki();
	sockRoot = mkdtempSync('/tmp/phcl-');
	const looseDir = join(sockRoot, 'loose');
	mkdirSync(looseDir);
	chmodSync(looseDir, 0o777); // writable by anyone: an impostor could bind here
	mock = startMockAgent({ kind: 'tls', pki }, INSTANCE, TOKEN_A);
	downMock = startMockAgent({ kind: 'tls', pki }, INSTANCE, TOKEN_A);
	unixMock = startMockAgent(
		{ kind: 'unix', socket: join(sockRoot, 'agent.sock') },
		INSTANCE,
		TOKEN_A,
	);
	looseMock = startMockAgent(
		{ kind: 'unix', socket: join(looseDir, 'agent.sock') },
		INSTANCE,
		TOKEN_A,
	);
	symlinkSync(join(sockRoot, 'agent.sock'), join(sockRoot, 'linked.sock'));
	const honest = mockFingerprint(INSTANCE, TOKEN_A);
	saveRegistry({
		version: 1,
		hosts: [
			record('museum_pub', { kind: 'tls', host: '127.0.0.1', port: mock.port }, honest),
			record('local_pub', { kind: 'unix', socket: join(sockRoot, 'agent.sock') }, honest),
			// The registry says TOKEN_B's fingerprint, the secret dir holds TOKEN_A: drift.
			record(
				'drifted_pub',
				{ kind: 'tls', host: '127.0.0.1', port: mock.port },
				mockFingerprint(INSTANCE, TOKEN_B),
			),
			record('down_pub', { kind: 'tls', host: '127.0.0.1', port: downMock.port }, honest),
			record('loose_pub', { kind: 'unix', socket: join(looseDir, 'agent.sock') }, honest),
			record('linked_pub', { kind: 'unix', socket: join(sockRoot, 'linked.sock') }, honest),
		],
	});
	for (const name of HOST_NAMES) writeHostSecrets(name, TOKEN_A, pki.bundlePem);
}, 60_000);

beforeEach(() => {
	mock.reset();
	unixMock.reset();
	looseMock.reset();
	for (const name of HOST_NAMES) forgetPairing(name);
});

afterAll(() => {
	mock?.stop();
	unixMock?.stop();
	looseMock?.stop();
	downMock?.stop();
	scratch?.dispose();
	logSpy?.mockRestore();
	if (sockRoot !== '') rmSync(sockRoot, { recursive: true, force: true });
});

describe('pairing before the bearer', () => {
	test('an unknown host is unconfigured and nothing is dialled', async () => {
		await expectCode(hostStatus('nobody_here'), 'publication_host.unconfigured');
		expect(mock.requests).toEqual([]);
	});

	test('a token file that does not imply the registry fingerprint is a mismatch, nothing dialled', async () => {
		await expectCode(hostStatus('drifted_pub'), 'publication_host.pairing_mismatch');
		expect(mock.requests).toEqual([]);
	});

	test('a token file the secrets store refuses (mode widened) is unconfigured, nothing dialled', async () => {
		const tokenFile = join(hostSecretDir('museum_pub'), 'token');
		chmodSync(tokenFile, 0o644);
		try {
			const error = await expectCode(hostStatus('museum_pub'), 'publication_host.unconfigured');
			expect(error.coordinates?.secret_reason).toBe('bad_mode');
		} finally {
			chmodSync(tokenFile, 0o600);
		}
		expect(mock.requests).toEqual([]);
	});

	test('an agent publishing another fingerprint: only the anonymous /health crosses the wire', async () => {
		mock.setToken(TOKEN_B);
		await expectCode(hostStatus('museum_pub'), 'publication_host.pairing_mismatch');
		expect(trail(mock)).toEqual([`GET ${B}/health anon`]);
		expect(bearerSent(mock)).toEqual([]);
		expect(pairingProved(hostRecord('museum_pub'))).toBe(false);
	});

	test('reads ride a cached proof: two reads, one /health', async () => {
		await hostStatus('museum_pub');
		await hostMediaProbe('museum_pub');
		expect(trail(mock)).toEqual([
			`GET ${B}/health anon`,
			`GET ${B}/v1/status bearer`,
			`GET ${B}/v1/media/probe bearer`,
		]);
		expect(bearerSent(mock).map((r) => r.authorization)).toEqual([
			`Bearer ${TOKEN_A}`,
			`Bearer ${TOKEN_A}`,
		]);
	});

	test('a mutation re-proves /health live even under a cached proof', async () => {
		await hostStatus('museum_pub');
		await hostRollbackRelease('museum_pub', 'v2', ACTOR);
		expect(trail(mock)).toEqual([
			`GET ${B}/health anon`,
			`GET ${B}/v1/status bearer`,
			`GET ${B}/health anon`,
			`POST ${B}/v1/releases/v2/rollback bearer`,
		]);
	});

	test('proveHostPairing always probes live and records the proof', async () => {
		const host = hostRecord('museum_pub');
		expect(pairingProved(host)).toBe(false);
		await proveHostPairing(host);
		await proveHostPairing(host);
		expect(pairingProved(host)).toBe(true);
		expect(trail(mock)).toEqual([`GET ${B}/health anon`, `GET ${B}/health anon`]);
	});

	test('the proof is keyed on fingerprint AND address: a re-paired entry re-proves', async () => {
		const host = hostRecord('museum_pub');
		await proveHostPairing(host);
		expect(pairingProved({ ...host, address: { kind: 'tls', host: '127.0.0.1', port: 1 } })).toBe(
			false,
		);
		expect(pairingProved({ ...host, fingerprint: mockFingerprint(INSTANCE, TOKEN_B) })).toBe(false);
		expect(pairingProved(host)).toBe(true);
	});

	test('READ residual: re-provisioned after a proof → one read bearer, the 401 drops the proof, the re-probe names the mismatch', async () => {
		const host = hostRecord('museum_pub');
		await proveHostPairing(host);
		mock.setToken(TOKEN_B);
		await expectCode(hostStatus('museum_pub'), 'publication_host.pairing_mismatch');
		expect(trail(mock)).toEqual([
			`GET ${B}/health anon`,
			`GET ${B}/v1/status bearer`,
			`GET ${B}/health anon`,
		]);
		expect(pairingProved(host)).toBe(false);
	});

	test('MUTATIONS after a re-provision send no bearer, no actor, no body — /health only, the stream unread', async () => {
		const host = hostRecord('museum_pub');
		await proveHostPairing(host);
		mock.setToken(TOKEN_B);
		mock.requests.length = 0;
		await expectCode(
			hostApplyRules('museum_pub', { server: 'apache', text: '# x\n', hash: RULES_HASH }, ACTOR),
			'publication_host.pairing_mismatch',
		);
		await expectCode(
			hostRollbackRelease('museum_pub', 'v2', ACTOR),
			'publication_host.pairing_mismatch',
		);
		let pulled = false;
		const lazy = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					pulled = true;
					controller.enqueue(new Uint8Array([1]));
					controller.close();
				},
			},
			{ highWaterMark: 0 },
		);
		await expectCode(
			hostInstallRelease('museum_pub', 'v2', RELEASE_ID, 'd'.repeat(64), lazy, ACTOR),
			'publication_host.pairing_mismatch',
		);
		expect(trail(mock)).toEqual([
			`GET ${B}/health anon`,
			`GET ${B}/health anon`,
			`GET ${B}/health anon`,
		]);
		expect(bearerSent(mock)).toEqual([]);
		expect(mock.requests.every((r) => r.actor === null && r.body.length === 0)).toBe(true);
		expect(pulled).toBe(false);
		expect(lazy.locked).toBe(false);
	});

	test('a status body naming another fingerprint is a mismatch and drops the proof', async () => {
		mock.setStatusFingerprint('f'.repeat(64));
		await expectCode(hostStatus('museum_pub'), 'publication_host.pairing_mismatch');
		expect(pairingProved(hostRecord('museum_pub'))).toBe(false);
	});

	test('a 401 from an agent that still proves the pairing is auth; the bearer is not re-sent', async () => {
		mock.reply(
			'GET',
			'/v1/status',
			mockProblem(401, 'unauthorized', 'Unauthorized', 'Missing or invalid bearer token.'),
		);
		await expectCode(hostStatus('museum_pub'), 'publication_host.auth');
		expect(trail(mock)).toEqual([
			`GET ${B}/health anon`,
			`GET ${B}/v1/status bearer`,
			`GET ${B}/health anon`,
		]);
		expect(pairingProved(hostRecord('museum_pub'))).toBe(false);
	});

	test('agent down after the proof: unreachable, and the proof is forgotten', async () => {
		const host = hostRecord('down_pub');
		await proveHostPairing(host);
		expect(pairingProved(host)).toBe(true);
		downMock.stop();
		await expectCode(hostMediaProbe('down_pub'), 'publication_host.unreachable');
		expect(pairingProved(host)).toBe(false);
		await expectCode(proveHostPairing(host), 'publication_host.unreachable');
	});

	test('a corrupt registry is registry_invalid, never "no such host", and nothing is dialled', async () => {
		const saved = readFileSync(registryPath(), 'utf8');
		writeFileSync(registryPath(), '{"version":1,"hosts":[');
		try {
			await expectCode(hostStatus('museum_pub'), 'publication_host.registry_invalid');
		} finally {
			writeFileSync(registryPath(), saved);
		}
		expect(mock.requests).toEqual([]);
	});
});

describe('a unix socket is trusted by its filesystem, not by its fingerprint', () => {
	test('a socket in a directory writable by others is refused before any connection', async () => {
		const error = await expectCode(hostStatus('loose_pub'), 'publication_host.unreachable');
		expect(error.coordinates?.reason).toBe('socket_perms');
		expect(looseMock.requests).toEqual([]);
	});

	test('a socket path that is a symlink is refused before any connection', async () => {
		const error = await expectCode(hostStatus('linked_pub'), 'publication_host.unreachable');
		expect(error.coordinates?.reason).toBe('socket_perms');
		expect(unixMock.requests).toEqual([]);
	});
});

describe('the §6 commands over the door', () => {
	test('status over mTLS returns the typed body', async () => {
		const status = await hostStatus('museum_pub');
		expect(status.instance_fingerprint).toBe(mockFingerprint(INSTANCE, TOKEN_A));
		expect(status.apis.v2).toEqual({ current: '7.0.2_aaaaaaa', previous: '7.0.1_bbbbbbb' });
		expect(status.rules).toEqual({ server: 'apache', hash: null });
		expect(status.media).toEqual({ ...MOCK_PROBE, problems: [] });
	});

	test('media.probe returns the probe', async () => {
		expect(await hostMediaProbe('museum_pub')).toEqual({ ...MOCK_PROBE, problems: [] });
		expect(last(mock).path).toBe(`${B}/v1/media/probe`);
	});

	test('rules.apply sends {server, text, hash} as JSON with the actor header', async () => {
		const text = `# Dedalo publication host media rules\n# config-hash: ${RULES_HASH}\n`;
		const applied = await hostApplyRules(
			'museum_pub',
			{ server: 'apache', text, hash: RULES_HASH },
			ACTOR,
		);
		expect(applied).toEqual({ hash: RULES_HASH, reloaded: true });
		const sent = last(mock);
		expect(sent.method).toBe('POST');
		expect(sent.path).toBe(`${B}/v1/rules/apply`);
		expect(sent.actor).toBe(ACTOR);
		expect(sent.contentType).toBe('application/json');
		expect(JSON.parse(new TextDecoder().decode(sent.body))).toEqual({
			server: 'apache',
			text,
			hash: RULES_HASH,
		});
	});

	test('release.install streams the bundle with its release headers', async () => {
		const head = new Uint8Array([31, 139, 8, 0, 1, 2, 3]);
		const tail = new Uint8Array(70_000).fill(7);
		const whole = new Uint8Array([...head, ...tail]);
		const sha = new Bun.CryptoHasher('sha256').update(whole).digest('hex');
		const result = await hostInstallRelease(
			'museum_pub',
			'v2',
			RELEASE_ID,
			sha,
			streamOf(head, tail),
			ACTOR,
		);
		expect(result).toEqual({
			api: 'v2',
			from: '7.0.2_aaaaaaa',
			to: RELEASE_ID,
			reused: false,
			health: 'ok',
		});
		const sent = last(mock);
		expect(sent.path).toBe(`${B}/v1/releases/v2`);
		expect(sent.contentType).toBe('application/gzip');
		expect(sent.releaseId).toBe(RELEASE_ID);
		expect(sent.bundleSha256).toBe(sha);
		expect(sent.actor).toBe(ACTOR);
		expect(Buffer.from(sent.body).equals(Buffer.from(whole))).toBe(true);
	});

	test('release.rollback sends the actor and no body', async () => {
		expect(await hostRollbackRelease('museum_pub', 'v1', ACTOR)).toEqual({
			from: '7.0.3_a1b2c3d',
			to: '7.0.2_aaaaaaa',
		});
		const sent = last(mock);
		expect(sent.path).toBe(`${B}/v1/releases/v1/rollback`);
		expect(sent.actor).toBe(ACTOR);
		expect(sent.body.length).toBe(0);
	});

	test('a unix-socket host is driven through the same door, without TLS', async () => {
		const status = await hostStatus('local_pub');
		expect(status.instance_fingerprint).toBe(mockFingerprint(INSTANCE, TOKEN_A));
		expect(trail(unixMock)).toEqual([`GET ${B}/health anon`, `GET ${B}/v1/status bearer`]);
		expect(mock.requests).toEqual([]);
	});
});

describe('agent refusals map onto publication_host.* (Task 2 wire.ts)', () => {
	const install = () =>
		hostInstallRelease(
			'museum_pub',
			'v2',
			RELEASE_ID,
			'd'.repeat(64),
			streamOf(new Uint8Array([1, 2, 3])),
			ACTOR,
		);
	const rules = () =>
		hostApplyRules('museum_pub', { server: 'nginx', text: '# x\n', hash: RULES_HASH }, ACTOR);
	const rollback = () => hostRollbackRelease('museum_pub', 'v2', ACTOR);
	const status = () => hostStatus('museum_pub');
	const CASES = [
		{
			label: 'rules.apply busy (409)',
			method: 'POST',
			route: '/v1/rules/apply',
			status: 409,
			slug: 'conflict',
			reason: 'busy',
			code: 'publication_host.busy',
			run: rules,
		},
		{
			label: 'rules.apply directive refused (422)',
			method: 'POST',
			route: '/v1/rules/apply',
			status: 422,
			slug: 'refused',
			reason: 'directive_refused',
			code: 'publication_host.rejected',
			run: rules,
		},
		{
			label: 'rules.apply reload failed (503)',
			method: 'POST',
			route: '/v1/rules/apply',
			status: 503,
			slug: 'host-action-failed',
			reason: 'reload_failed',
			code: 'publication_host.failed',
			run: rules,
		},
		{
			label: 'release.install sha mismatch (422)',
			method: 'POST',
			route: '/v1/releases/v2',
			status: 422,
			slug: 'release-refused',
			reason: 'sha_mismatch',
			code: 'publication_host.rejected',
			run: install,
		},
		{
			label: 'release.rollback without a previous release (422)',
			method: 'POST',
			route: '/v1/releases/v2/rollback',
			status: 422,
			slug: 'release-refused',
			reason: 'no_previous_release',
			code: 'publication_host.rejected',
			run: rollback,
		},
		{
			label: 'a malformed request (400)',
			method: 'POST',
			route: '/v1/releases/v2/rollback',
			status: 400,
			slug: 'validation-error',
			reason: 'actor_missing',
			code: 'publication_host.rejected',
			run: rollback,
		},
		{
			label: 'an agent internal error (500)',
			method: 'GET',
			route: '/v1/status',
			status: 500,
			slug: 'internal-error',
			reason: null,
			code: 'publication_host.failed',
			run: status,
		},
	] as const;

	test.each([...CASES])('$label → $code, agent prose never on the wire', async (c) => {
		const extensions = c.reason === null ? {} : { reason: c.reason };
		mock.reply(
			c.method,
			c.route,
			mockProblem(c.status, c.slug, 'Agent problem', AGENT_PROSE, extensions),
		);
		const error = await expectCode(c.run(), c.code);
		expect(wireText(error)).not.toContain('secret.conf');
		if (c.code !== 'publication_host.busy')
			expect(error.details).toEqual({ reason: c.reason ?? 'unspecified' });
	});

	test('a 2xx body this engine cannot read is publication_host.failed', async () => {
		mock.reply('GET', '/v1/media/probe', { status: 200, body: { mode: 'mirror' } });
		const shape = await expectCode(hostMediaProbe('museum_pub'), 'publication_host.failed');
		expect(shape.details).toEqual({ reason: 'unreadable_body' });
		mock.reply('GET', '/v1/status', { status: 200, body: 'not json' });
		const json = await expectCode(hostStatus('museum_pub'), 'publication_host.failed');
		expect(json.details).toEqual({ reason: 'unreadable_body' });
	});

	test('a malformed actor, server, hash, release id, sha or api is refused (input_invalid) before dialling', async () => {
		const empty = () => streamOf();
		const refusals = [
			() =>
				hostApplyRules('museum_pub', { server: 'apache', text: '# x\n', hash: RULES_HASH }, 'a\tb'),
			() =>
				hostApplyRules(
					'museum_pub',
					{ server: 'apache', text: '# x\n', hash: RULES_HASH },
					'x'.repeat(201),
				),
			() =>
				hostApplyRules(
					'museum_pub',
					{ server: 'apache', text: '# x\n', hash: RULES_HASH },
					'\u0141ukasz',
				),
			() =>
				hostApplyRules(
					'museum_pub',
					{ server: 'iis' as 'apache', text: '# x\n', hash: RULES_HASH },
					ACTOR,
				),
			() =>
				hostApplyRules('museum_pub', { server: 'apache', text: '# x\n', hash: 'nothex' }, ACTOR),
			() => hostApplyRules('museum_pub', { server: 'apache', text: '', hash: RULES_HASH }, ACTOR),
			() => hostInstallRelease('museum_pub', 'v2', 'latest', 'd'.repeat(64), empty(), ACTOR),
			() => hostInstallRelease('museum_pub', 'v2', RELEASE_ID, 'XYZ', empty(), ACTOR),
			() => hostRollbackRelease('museum_pub', 'v3' as 'v1', ACTOR),
		];
		for (const run of refusals) {
			const error = await expectCode(run(), 'publication_host.rejected');
			expect(error.details).toEqual({ reason: 'input_invalid' });
		}
		expect(mock.requests).toEqual([]);
	});
});

describe('no secret leaves in an error or a log line (Review Focus 5)', () => {
	test('every error this file provoked, and every console.error line, is free of token, key, CA and fingerprint', () => {
		const needles = [
			TOKEN_A,
			TOKEN_B,
			'PRIVATE KEY',
			pki.clientKeyPem.split('\n')[1] ?? 'unreachable-needle',
			pki.caPem.split('\n')[1] ?? 'unreachable-needle',
			mockFingerprint(INSTANCE, TOKEN_A),
			mockFingerprint(INSTANCE, TOKEN_B),
		];
		expect(seenErrors.length).toBeGreaterThan(20);
		for (const error of seenErrors) {
			const text = JSON.stringify({
				message: error.message,
				publicMessage: error.publicMessage,
				coordinates: error.coordinates,
				details: error.details,
				wire: wireText(error),
			});
			for (const needle of needles) expect(text.includes(needle)).toBe(false);
		}
		const logged = logSpy.mock.calls
			.map((call: unknown[]) => call.map((part: unknown) => String(part)).join(' '))
			.join('\n');
		expect(logged.length).toBeGreaterThan(0);
		for (const needle of needles) expect(logged.includes(needle)).toBe(false);
	});
});
