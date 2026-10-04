/**
 * THE PAIRED PRIVATE AGENT CHANNEL, DRIVEN (engineering/OUTBOUND_SPEC.md §2.1).
 *
 * `src/core/publication_host/transport.ts` is the only engine code that dials a
 * publication agent. Every rule its header states is driven here against loopback
 * agents with a PKI minted in-test by the ONE shared helper
 * (test/helpers/publication_host_fixtures.ts mintTestPki): mTLS with the pinned CA and
 * the registry host as identity, the unix socket, the closed route table, a 3xx refused
 * unread, the deadline, the idle bound, the byte ceiling, a streamed body, the bearer
 * grammar shared with the secrets store, a refused stored bundle typed as unconfigured,
 * NODE_TLS_REJECT_UNAUTHORIZED=0 changing nothing, and — the review focus — that no
 * failure carries the bearer or key material.
 *
 * No real network, no live `<private>`: `dialAgent` takes the material directly;
 * `agentRequest` reads it from a declared scratch base. Proxy variables are cleared for
 * the run (best effort, restored after) because Bun honours them on this transport — the
 * named residual, pinned by its canary.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type DedaloError, isDedaloError, toErrorBody } from '../../src/core/errors/index.ts';
import type { PublicationHostRecord } from '../../src/core/publication_host/registry.ts';
import {
	BUNDLE_FILE,
	type HostTls,
	hostSecretDir,
	TOKEN_SHAPE,
	writeHostSecrets,
} from '../../src/core/publication_host/secrets.ts';
import {
	AGENT_BASE_PATH,
	type AgentRequest,
	agentRequest,
	dialAgent,
} from '../../src/core/publication_host/transport.ts';
import { childDriver, driverResult, repoModule } from '../helpers/child_driver.ts';
import {
	mintTestPki,
	type TestPki,
	useScratchPublicationHostsBase,
} from '../helpers/publication_host_fixtures.ts';

type Mode = 'ok' | 'redirect' | 'stall' | 'stall_body' | 'big' | 'problem';

interface AgentState {
	mode: Mode;
	hits: string[];
	authorizations: Array<string | null>;
}

const PROXY_KEYS = [
	'HTTPS_PROXY',
	'https_proxy',
	'HTTP_PROXY',
	'http_proxy',
	'ALL_PROXY',
	'all_proxy',
];
const savedProxy = new Map(PROXY_KEYS.map((key) => [key, process.env[key]]));

/** 36 visible chars: a bearer of the agent's shape, unique to this run. */
const BEARER = `tok_${crypto.randomUUID().replaceAll('-', '')}`;
/** The longest bearer the secrets store accepts (TOKEN_SHAPE upper bound). */
const LONGEST_BEARER = 'b'.repeat(1024);

let dir = '';
let pki: TestPki;
let roguePki: TestPki;
let clientTls: HostTls;
let agent: ReturnType<typeof Bun.serve>;
let rogue: ReturnType<typeof Bun.serve>;
let elsewhere: ReturnType<typeof Bun.serve>;
let unixAgent: ReturnType<typeof Bun.serve>;
let socketPath = '';
const state: AgentState = { mode: 'ok', hits: [], authorizations: [] };
const rogueHits: string[] = [];
const elsewhereHits: string[] = [];

function answer(req: Request, path: string): Response | Promise<Response> {
	switch (state.mode) {
		case 'redirect':
			return new Response(null, {
				status: 302,
				headers: { location: `http://127.0.0.1:${elsewhere.port}/elsewhere` },
			});
		case 'stall':
			return new Promise<Response>(() => undefined);
		case 'stall_body':
			return new Response(
				new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new Uint8Array(16));
					},
				}),
			);
		case 'big':
			return new Response(new Uint8Array(64 * 1024));
		case 'problem':
			return new Response(JSON.stringify({ status: 409, reason: 'busy' }), {
				status: 409,
				headers: { 'content-type': 'application/problem+json' },
			});
		default:
			return Response.json({ status: 'ok', path, method: req.method });
	}
}

async function agentHandler(req: Request): Promise<Response> {
	const path = new URL(req.url).pathname;
	state.hits.push(`${req.method} ${path}`);
	state.authorizations.push(req.headers.get('authorization'));
	if (path === `${AGENT_BASE_PATH}/v1/rules/apply`) {
		return new Response(String((await req.arrayBuffer()).byteLength));
	}
	return answer(req, path);
}

function record(address: PublicationHostRecord['address']): PublicationHostRecord {
	return {
		name: 'test',
		instance: 'test',
		fingerprint: '0'.repeat(64),
		address,
		public_url: null,
		qualities: null,
		probe: { published: null, unpublished: null },
		paired_at: '2026-10-03T00:00:00.000Z',
	};
}

/** A TCP server's port (Bun types it optional: a unix-socket server has none). */
function portOf(port: number | undefined): number {
	if (port === undefined) throw new Error('the loopback agent has no TCP port');
	return port;
}

const tlsHost = (port: number | undefined, host = '127.0.0.1') =>
	record({ kind: 'tls', host, port: portOf(port) });
const GET_HEALTH: AgentRequest = { method: 'GET', path: '/health' };
const GET_STATUS: AgentRequest = { method: 'GET', path: '/v1/status' };

/** The error a promise rejects with (fails the test when it resolves). */
async function rejection(promise: Promise<unknown>): Promise<DedaloError> {
	try {
		await promise;
	} catch (error) {
		if (isDedaloError(error)) return error;
		throw error;
	}
	throw new Error('expected a typed rejection, got an answer');
}

beforeAll(() => {
	for (const key of PROXY_KEYS) delete process.env[key];
	dir = mkdtempSync(join(tmpdir(), 'dd_pubhost_transport_'));
	// The server leaf names ONLY 127.0.0.1: dialling 'localhost' must fail on identity.
	pki = mintTestPki('dd-pubhost-transport', 'IP:127.0.0.1');
	// An unrelated CA whose server leaf names the right address: the rogue agent.
	roguePki = mintTestPki('dd-pubhost-rogue', 'IP:127.0.0.1');
	clientTls = { cert: pki.clientCertPem, key: pki.clientKeyPem, ca: pki.caPem };
	const agentTls = { ca: pki.caPem, requestCert: true, rejectUnauthorized: true };
	agent = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		tls: { ...agentTls, cert: pki.serverCertPem, key: pki.serverKeyPem },
		fetch: agentHandler,
	});
	rogue = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		tls: { ...agentTls, cert: roguePki.serverCertPem, key: roguePki.serverKeyPem },
		fetch: (req) => {
			rogueHits.push(req.headers.get('authorization') ?? '');
			return new Response('rogue');
		},
	});
	elsewhere = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: (req) => {
			elsewhereHits.push(req.headers.get('authorization') ?? '');
			return new Response('elsewhere');
		},
	});
	socketPath = join(dir, 'agent.sock');
	unixAgent = Bun.serve({ unix: socketPath, fetch: agentHandler });
});

afterAll(() => {
	for (const server of [agent, rogue, elsewhere, unixAgent]) server?.stop(true);
	if (dir !== '') rmSync(dir, { recursive: true, force: true });
	for (const [key, value] of savedProxy) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe('mTLS to the registry address', () => {
	test('the agent answers over mTLS at the base path, and no bearer travels unless passed', async () => {
		state.mode = 'ok';
		const res = await dialAgent(tlsHost(agent.port), clientTls, GET_HEALTH, null);
		expect(res.status).toBe(200);
		expect(JSON.parse(res.text)).toEqual({
			status: 'ok',
			path: `${AGENT_BASE_PATH}/health`,
			method: 'GET',
		});
		expect(state.authorizations.at(-1)).toBeNull();
	});

	test('the bearer travels as ONE Authorization header, only when passed', async () => {
		state.mode = 'ok';
		const res = await dialAgent(tlsHost(agent.port), clientTls, GET_STATUS, BEARER);
		expect(res.status).toBe(200);
		expect(state.authorizations.at(-1)).toBe(`Bearer ${BEARER}`);
	});

	test('an agent whose certificate is not from the pinned CA is refused before any HTTP byte', async () => {
		const error = await rejection(dialAgent(tlsHost(rogue.port), clientTls, GET_STATUS, BEARER));
		expect(error.code).toBe('publication_host.unreachable');
		expect(error.coordinates?.reason).toBe('tls');
		expect(error.coordinates?.publication_host).toBe('test');
		expect(rogueHits, 'the bearer reached an agent the engine never paired').toEqual([]);
	});

	test('a certificate that does not name the registry host is refused', async () => {
		const before = state.hits.length;
		const error = await rejection(
			dialAgent(tlsHost(agent.port, 'localhost'), clientTls, GET_STATUS, BEARER),
		);
		expect(error.code).toBe('publication_host.unreachable');
		expect(state.hits.length, 'an HTTP request reached the agent under the wrong identity').toBe(
			before,
		);
	});

	test('a TCP host without its engine bundle is unconfigured, and no socket opens', async () => {
		const before = state.hits.length;
		const error = await rejection(dialAgent(tlsHost(agent.port), null, GET_HEALTH, null));
		expect(error.code).toBe('publication_host.unconfigured');
		expect(error.coordinates).toEqual({ reason: 'engine_bundle', publication_host: 'test' });
		expect(state.hits.length).toBe(before);
	});

	test('a closed port is publication_host.unreachable', async () => {
		const gone = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('x') });
		const port = gone.port;
		gone.stop(true);
		const error = await rejection(dialAgent(tlsHost(port), clientTls, GET_HEALTH, null));
		expect(error.code).toBe('publication_host.unreachable');
		expect(error.coordinates?.stage).toBe('connect');
	});
});

describe('one request, bounded', () => {
	test('a 3xx is refused unread and its Location is never contacted', async () => {
		state.mode = 'redirect';
		const error = await rejection(dialAgent(tlsHost(agent.port), clientTls, GET_STATUS, BEARER));
		state.mode = 'ok';
		expect(error.code).toBe('publication_host.unreachable');
		expect(error.coordinates?.reason).toBe('redirect');
		expect(elsewhereHits, 'the transport followed the redirect').toEqual([]);
	});

	test('an agent that never answers ends at the deadline as publication_host.timeout', async () => {
		state.mode = 'stall';
		const started = Date.now();
		const error = await rejection(
			dialAgent(tlsHost(agent.port), clientTls, { ...GET_STATUS, timeoutMs: 300 }, BEARER),
		);
		state.mode = 'ok';
		expect(error.code).toBe('publication_host.timeout');
		expect(Date.now() - started, 'the deadline did not bound the wait').toBeLessThan(3_000);
	});

	test('a body that goes silent mid-stream ends as publication_host.timeout', async () => {
		state.mode = 'stall_body';
		const started = Date.now();
		const error = await rejection(
			dialAgent(tlsHost(agent.port), clientTls, { ...GET_STATUS, timeoutMs: 300 }, BEARER),
		);
		state.mode = 'ok';
		expect(error.code).toBe('publication_host.timeout');
		expect(error.coordinates?.stage).toBe('body');
		expect(Date.now() - started).toBeLessThan(3_000);
	});

	test('over the byte ceiling: publication_host.failed minted by wire.ts engineFailure (wire reason body_cap)', async () => {
		state.mode = 'big';
		const error = await rejection(
			dialAgent(tlsHost(agent.port), clientTls, { ...GET_STATUS, maxResponseBytes: 1024 }, BEARER),
		);
		state.mode = 'ok';
		expect(error.code).toBe('publication_host.failed');
		expect(error.coordinates).toEqual({
			publication_host: 'test',
			reason: 'body_cap',
			max_bytes: 1024,
		});
		expect(toErrorBody(error).details).toEqual({ reason: 'body_cap' });
	});

	test('a streamed request body reaches the agent whole', async () => {
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(1000));
				controller.enqueue(new Uint8Array(500));
				controller.close();
			},
		});
		const res = await dialAgent(
			tlsHost(agent.port),
			clientTls,
			{ method: 'POST', path: '/v1/rules/apply', body },
			BEARER,
		);
		expect(res.status).toBe(200);
		expect(res.text).toBe('1500');
	});

	test('a non-2xx answer is RETURNED for the client to map, not thrown', async () => {
		state.mode = 'problem';
		const res = await dialAgent(tlsHost(agent.port), clientTls, GET_STATUS, BEARER);
		state.mode = 'ok';
		expect(res.status).toBe(409);
		expect(res.headers.get('content-type')).toBe('application/problem+json');
		expect(JSON.parse(res.text)).toEqual({ status: 409, reason: 'busy' });
	});
});

describe('one bearer grammar, shared with the secrets store', () => {
	test('the longest token the store accepts is a valid bearer and is sent', async () => {
		expect(TOKEN_SHAPE.test(LONGEST_BEARER), 'the store no longer accepts 1024 chars').toBe(true);
		state.mode = 'ok';
		const res = await dialAgent(tlsHost(agent.port), clientTls, GET_STATUS, LONGEST_BEARER);
		expect(res.status).toBe(200);
		expect(state.authorizations.at(-1)).toBe(`Bearer ${LONGEST_BEARER}`);
	});
});

describe('the unix socket on this machine', () => {
	test('a unix-socket agent is dialled at its socket, the base path kept, no TLS needed', async () => {
		state.mode = 'ok';
		const res = await dialAgent(
			record({ kind: 'unix', socket: socketPath }),
			null,
			GET_STATUS,
			BEARER,
		);
		expect(res.status).toBe(200);
		expect(JSON.parse(res.text).path).toBe(`${AGENT_BASE_PATH}/v1/status`);
		expect(state.authorizations.at(-1)).toBe(`Bearer ${BEARER}`);
	});

	test('a missing socket is publication_host.unreachable', async () => {
		const error = await rejection(
			dialAgent(record({ kind: 'unix', socket: join(dir, 'none.sock') }), null, GET_HEALTH, null),
		);
		expect(error.code).toBe('publication_host.unreachable');
	});
});

describe('agentRequest: the material comes from the host secret dir, never the caller', () => {
	test('a stored, coherent bundle dials the agent', async () => {
		const scratch = useScratchPublicationHostsBase();
		try {
			writeHostSecrets('test', BEARER, pki.bundlePem);
			state.mode = 'ok';
			const res = await agentRequest(tlsHost(agent.port), GET_HEALTH, null);
			expect(res.status).toBe(200);
		} finally {
			scratch.dispose();
		}
	});

	test('no stored bundle is unconfigured, and no socket opens', async () => {
		const scratch = useScratchPublicationHostsBase();
		try {
			const before = state.hits.length;
			const error = await rejection(agentRequest(tlsHost(agent.port), GET_HEALTH, null));
			expect(error.code).toBe('publication_host.unconfigured');
			expect(state.hits.length).toBe(before);
		} finally {
			scratch.dispose();
		}
	});

	test('a bundle widened to 0644 is refused TYPED (unconfigured, secret_reason bad_mode), never internal.unexpected', async () => {
		const scratch = useScratchPublicationHostsBase();
		try {
			writeHostSecrets('test', BEARER, pki.bundlePem);
			chmodSync(join(hostSecretDir('test'), BUNDLE_FILE), 0o644);
			const before = state.hits.length;
			const error = await rejection(agentRequest(tlsHost(agent.port), GET_HEALTH, null));
			expect(error.code).toBe('publication_host.unconfigured');
			expect(error.coordinates).toEqual({
				reason: 'engine_bundle',
				secret_reason: 'bad_mode',
				publication_host: 'test',
			});
			expect(JSON.stringify(toErrorBody(error))).not.toContain('PRIVATE KEY');
			expect(state.hits.length).toBe(before);
		} finally {
			scratch.dispose();
		}
	});
});

describe('the door contract: closed routes, the transport’s own headers', () => {
	const misuses: Array<[string, AgentRequest, string | null]> = [
		['a path outside the route table', { method: 'GET', path: '/v1/run' }, null],
		['a traversal', { method: 'GET', path: '/v1/../../etc/passwd' }, null],
		['a query string', { method: 'GET', path: '/v1/status?x=1' }, null],
		['an already-prefixed path', { method: 'GET', path: `${AGENT_BASE_PATH}/health` }, null],
		['an empty path', { method: 'GET', path: '' }, null],
		['a method outside GET/POST', { method: 'PUT' as 'GET', path: '/v1/status' }, null],
		['a GET with a body', { method: 'GET', path: '/v1/status', body: 'x' }, null],
		[
			'a caller-set Authorization',
			{ method: 'GET', path: '/v1/status', headers: { Authorization: 'Bearer other' } },
			null,
		],
		['a caller-set Host', { method: 'GET', path: '/v1/status', headers: { host: 'x' } }, null],
		['a bearer with a line break', GET_STATUS, `${BEARER}\r\nX-Evil: 1`],
		['a short bearer', GET_STATUS, 'short'],
		['a bearer past the store bound', GET_STATUS, 'b'.repeat(1025)],
		['a zero byte ceiling', { ...GET_STATUS, maxResponseBytes: 0 }, null],
		['a ceiling past 16 MiB', { ...GET_STATUS, maxResponseBytes: 16 * 1024 * 1024 + 1 }, null],
		['a deadline past 30 min', { ...GET_STATUS, timeoutMs: 30 * 60_000 + 1 }, null],
		['a fractional deadline', { ...GET_STATUS, timeoutMs: 1.5 }, null],
	];

	for (const [what, req, bearer] of misuses) {
		test(`${what} is refused before any socket opens`, async () => {
			const before = state.hits.length;
			const error = await rejection(dialAgent(tlsHost(agent.port), clientTls, req, bearer));
			expect(error.code).toBe('internal.unexpected');
			expect(state.hits.length).toBe(before);
		});
	}
});

describe('no secret reaches a failure (review focus 5)', () => {
	test('the bearer and the key material appear in no error field, wire body or cause', async () => {
		const failures: DedaloError[] = [];
		failures.push(await rejection(dialAgent(tlsHost(rogue.port), clientTls, GET_STATUS, BEARER)));
		failures.push(
			await rejection(dialAgent(tlsHost(agent.port, 'localhost'), clientTls, GET_STATUS, BEARER)),
		);
		for (const mode of ['redirect', 'stall', 'big'] as const) {
			state.mode = mode;
			failures.push(
				await rejection(
					dialAgent(
						tlsHost(agent.port),
						clientTls,
						{ ...GET_STATUS, timeoutMs: 300, maxResponseBytes: 1024 },
						BEARER,
					),
				),
			);
		}
		state.mode = 'ok';
		expect(failures.length).toBe(5);
		const keyBody = pki.clientKeyPem.split('\n')[1] ?? '';
		expect(keyBody.length, 'the probe for key material is empty').toBeGreaterThan(40);
		for (const error of failures) {
			const cause = error.cause as { message?: string } | undefined;
			const text = [
				JSON.stringify({
					message: error.message,
					details: error.details,
					coordinates: error.coordinates,
					publicMessage: error.publicMessage,
					extend: error.extend,
				}),
				JSON.stringify(toErrorBody(error)),
				String(error.cause),
				cause?.message ?? '',
			].join('\n');
			expect(text, `${error.code} carries the bearer`).not.toContain(BEARER);
			expect(text, `${error.code} carries key material`).not.toContain(keyBody);
			expect(text, `${error.code} carries PEM text`).not.toContain('PRIVATE KEY');
		}
	});
});

/**
 * The process environment is read by Bun ONCE (proxy variables at the first outbound call,
 * NODE_TLS_REJECT_UNAUTHORIZED at start), so these run the door in a CHILD started with the
 * variable set — a value set mid-run in this process proves nothing (measured: ignored).
 * The client material is embedded in the child's own scratch script (childDriver disposes it).
 */
async function dialInChild(
	port: number | undefined,
	env: Record<string, string>,
): Promise<{ outcome: string; status?: number; code?: string; reason?: string }> {
	const driver = childDriver('dd_pubhost_env');
	try {
		const { stdout, stderr } = await driver.run(
			'dial.ts',
			`import { dialAgent } from ${repoModule('src/core/publication_host/transport.ts')};
const host = {
	name: 'test', instance: 'test', fingerprint: '0'.repeat(64),
	address: { kind: 'tls' as const, host: '127.0.0.1', port: ${portOf(port)} },
	public_url: null, qualities: null, probe: { published: null, unpublished: null },
	paired_at: '2026-10-03T00:00:00.000Z',
};
const tls = ${JSON.stringify(clientTls)};
try {
	const res = await dialAgent(host, tls, { method: 'GET', path: '/health' }, ${JSON.stringify(BEARER)});
	console.log('RESULT ' + JSON.stringify({ outcome: 'answered', status: res.status }));
} catch (error) {
	const e = error as { code?: string; coordinates?: { reason?: string } };
	console.log('RESULT ' + JSON.stringify({ outcome: 'failed', code: e.code, reason: e.coordinates?.reason }));
}
`,
			{ HTTPS_PROXY: '', https_proxy: '', NO_PROXY: '', no_proxy: '', ...env },
		);
		return driverResult(stdout, stderr);
	} finally {
		driver.dispose();
	}
}

describe('the process environment cannot open the channel', () => {
	test('NODE_TLS_REJECT_UNAUTHORIZED=0 does not switch verification off: the rogue agent is still refused', async () => {
		const result = await dialInChild(rogue.port, { NODE_TLS_REJECT_UNAUTHORIZED: '0' });
		expect(result).toEqual({
			outcome: 'failed',
			code: 'publication_host.unreachable',
			reason: 'tls',
		});
		expect(rogueHits, 'the bearer reached an unverified agent').toEqual([]);
	});

	test('RESIDUAL CANARY: Bun still routes a TCP agent through HTTPS_PROXY — exclude agents with NO_PROXY', async () => {
		let proxied = 0;
		const proxy = createServer((socket) => {
			proxied++;
			socket.destroy();
		});
		await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
		const { port: proxyPort } = proxy.address() as { port: number };
		try {
			const result = await dialInChild(agent.port, {
				HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
			});
			expect(result.outcome).toBe('failed');
			expect(result.code).toBe('publication_host.unreachable');
			expect(
				proxied,
				'Bun no longer proxies this call: re-read the residual in transport.ts and OUTBOUND_SPEC §2.1',
			).toBe(1);
		} finally {
			proxy.close();
		}
	});
});
