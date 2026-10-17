/**
 * The development listener over HTTPS (TODO-055; design DEV_ROUTE_SERVE §1.2,
 * gates 2 and 6) — measured on the REAL server process, not on its options:
 *
 *  A. material from the ONE local-CA generator (deploy/dedalo-tls-rotate.sh,
 *     the developer layout: --dir, --no-reload): the server boots with
 *     SERVER_TCP_TLS_CERT_FILE + _KEY_FILE, prints an `https://` address, and
 *     `/health` answers 200 over a real TLS handshake trusting ONLY that
 *     authority (curl --cacert, openssl s_client's verify code) — and the same
 *     request WITHOUT the authority fails the handshake (curl exit 60, Bun's
 *     fetch rejects): the listener really presents the issued chain, not a
 *     plain-HTTP port;
 *  B. a certificate under 30 days from its end warns at boot, naming
 *     `bun run tls:renew`; one with a year left does not;
 *  C. neither key set: plain HTTP exactly as before (`http://` address, 200);
 *  D. every bad pair REFUSES the boot — exit EX_CONFIG (78), one
 *     `[boot] REFUSED — ` line naming the key and the path, and the listener
 *     never bound: a half pair (either half), an unreadable file, a file that is
 *     not a certificate, a key of another certificate. Never a silent fall back
 *     to HTTP;
 *  E. the pure halves the server composes (pair parsing, URL, the network and
 *     expiry wording at their boundaries) and the catalog entries
 *     (config_census / config_docs / config_declaration tripwires render and
 *     census them; this pins what they say);
 *  F. the pair is inert WITHOUT a listener (a socket-only boot carrying a stray
 *     half pair serves, never exits 78), and every harness that spawns its own
 *     server under an `http://` runner pins plain HTTP: the client suite's
 *     composed environment boots a server that answers plain HTTP although the
 *     parent environment carries a valid pair (the developer route's .env).
 *
 * Isolation as ops_shutdown: an ephemeral unix socket, the diffusion scheduler
 * off, a marked scratch processes dir, the preload's suite database and session
 * store inherited.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SERVER_KEYS } from '../../src/config/catalog/server.ts';
import { readEnv } from '../../src/config/env.ts';
import {
	DEV_LISTENER_REFUSED_EXIT_CODE,
	DevListenerTlsRefusal,
	devListenerExpiryWarning,
	devListenerNetworkWarning,
	devListenerTlsFiles,
	devTcpListener,
	loadDevListenerTls,
	PLAIN_HTTP_DEV_LISTENER_ENV,
} from '../../src/config/tcp_listener.ts';
import { markProcessesDir } from '../helpers/test_media_root.ts';

const ROOT = resolve(import.meta.dir, '../..');
const GENERATOR = join(ROOT, 'deploy/dedalo-tls-rotate.sh');
// Short: macOS caps a unix socket path at 104 bytes.
const scratch = mkdtempSync(join(tmpdir(), 'zzdlt_'));
const CA_DIR = join(scratch, 'ca');
const SHORT_DIR = join(scratch, 'short');
const OPENSSL = Bun.which('openssl') ?? '/usr/bin/openssl';
const CURL = Bun.which('curl') ?? '/usr/bin/curl';

const caPem = join(CA_DIR, 'dedalo-local-ca.pem');
const leafPem = join(CA_DIR, 'fullchain.pem');
const leafKey = join(CA_DIR, 'privkey.pem');
const shortPem = join(SHORT_DIR, 'cert.pem');
const shortKey = join(SHORT_DIR, 'key.pem');

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function run(argv: string[]): { code: number | null; out: string; err: string } {
	const proc = Bun.spawnSync(argv, { stdout: 'pipe', stderr: 'pipe' });
	return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

beforeAll(() => {
	// The developer layout of the ONE generator (never a second one).
	const issued = run([
		'bash',
		GENERATOR,
		'--mode',
		'local-ca',
		'--host',
		'localhost',
		'--dir',
		CA_DIR,
		'--no-reload',
		'--quiet',
	]);
	if (issued.code !== 0) throw new Error(`the local-CA generator failed: ${issued.err}`);
	// A 10-day self-signed pair: the expiry warning's subject (and a key of
	// ANOTHER certificate for the mismatch refusal).
	mkdirSync(SHORT_DIR, { recursive: true });
	const short = run([
		OPENSSL,
		'req',
		'-x509',
		'-newkey',
		'rsa:2048',
		'-nodes',
		'-keyout',
		shortKey,
		'-out',
		shortPem,
		'-days',
		'10',
		'-subj',
		'/CN=localhost',
	]);
	if (short.code !== 0) throw new Error(`openssl req failed: ${short.err}`);
});

/** A port nothing listens on right now. */
function freePort(): number {
	const probe = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } });
	const { port } = probe;
	probe.stop(true);
	return port;
}

type Boot = ReturnType<typeof Bun.spawn> & { port: number; socket: string };

let bootCount = 0;
function boot(tls: { cert?: string; key?: string }): Boot {
	bootCount += 1;
	const socket = join(scratch, `s${bootCount}.sock`);
	const port = freePort();
	const child = Bun.spawn([process.execPath, 'run', 'src/server.ts'], {
		cwd: ROOT,
		env: {
			...(process.env as Record<string, string>),
			SERVER_UNIX_SOCKET: socket,
			SERVER_TCP_PORT: String(port),
			SERVER_TCP_HOST: '127.0.0.1',
			// '' = unset (an operator's own ../private/.env pair must not leak in).
			SERVER_TCP_TLS_CERT_FILE: tls.cert ?? '',
			SERVER_TCP_TLS_KEY_FILE: tls.key ?? '',
			DEDALO_DIFFUSION_SCHEDULER_ENABLED: 'false',
			DEDALO_MEDIA_PROCESSES_DIR: markProcessesDir(join(scratch, `processes${bootCount}`)),
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return Object.assign(child, { port, socket });
}

/** Wait for a settled /health on the SOCKET (the dev listener binds after it). */
async function waitForSocketHealth(server: Boot, timeoutMs = 30000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) throw new Error(`server exited ${server.exitCode}`);
		try {
			const response = await fetch('http://localhost/health', { unix: server.socket });
			if (response.status === 200) return;
		} catch {
			/* still booting */
		}
		await Bun.sleep(150);
	}
	throw new Error('server never answered /health on its socket');
}

/** Wait until the dev listener's port accepts a connection. */
async function waitForPort(port: number, timeoutMs = 10000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const open = await new Promise<boolean>((resolveOpen) => {
			Bun.connect({
				hostname: '127.0.0.1',
				port,
				socket: {
					open: (socket) => {
						socket.end();
						resolveOpen(true);
					},
					data: () => {},
					connectError: () => resolveOpen(false),
				},
			}).catch(() => resolveOpen(false));
		});
		if (open) return;
		await Bun.sleep(100);
	}
	throw new Error(`port ${port} never opened`);
}

/** SIGTERM, wait, and answer what the server printed. */
async function stop(server: Boot): Promise<{ stdout: string; stderr: string }> {
	server.kill('SIGTERM');
	await server.exited;
	return {
		stdout: await new Response(server.stdout as ReadableStream).text(),
		stderr: await new Response(server.stderr as ReadableStream).text(),
	};
}

/** A refused boot: its exit code and what it printed. */
async function refused(tls: { cert?: string; key?: string }) {
	const server = boot(tls);
	const killer = setTimeout(() => server.kill('SIGKILL'), 30000);
	const code = await server.exited;
	clearTimeout(killer);
	return {
		code,
		stdout: await new Response(server.stdout as ReadableStream).text(),
		stderr: await new Response(server.stderr as ReadableStream).text(),
	};
}

describe('A. HTTPS with the local authority: a real handshake, trusted only through that CA', () => {
	test('boot → https:// address → /health 200 with the CA, handshake failure without it', async () => {
		const server = boot({ cert: leafPem, key: leafKey });
		try {
			await waitForSocketHealth(server);
			await waitForPort(server.port);
			const url = `https://127.0.0.1:${server.port}/health`;

			// curl, trusting ONLY the generated authority.
			const trusted = run([
				CURL,
				'-sS',
				'--cacert',
				caPem,
				'-o',
				'/dev/null',
				'-w',
				'%{http_code}',
				url,
			]);
			expect({ code: trusted.code, out: trusted.out, err: trusted.err }).toEqual({
				code: 0,
				out: '200',
				err: '',
			});
			const byName = run([
				CURL,
				'-sS',
				'--cacert',
				caPem,
				'-o',
				'/dev/null',
				'-w',
				'%{http_code}',
				`https://localhost:${server.port}/health`,
			]);
			expect(byName.out).toBe('200');

			// Without it: the handshake fails (60 = peer certificate cannot be authenticated).
			const untrusted = run([CURL, '-sS', '-o', '/dev/null', url]);
			expect(untrusted.code).toBe(60);

			// Bun's own client refuses it too without the CA. (WITH the CA it still
			// refuses, measured 2026-10-16 on Bun 1.4.3: its verifier rejects an IP
			// name constraint — "unsupported name constraint type" — which the
			// constrained authority always carries for 127.0.0.1. Browsers, curl and
			// openssl verify it; a Bun client of this listener needs another trust
			// path. Not pinned here: it is Bun's limit, not this listener's contract.)
			let rejected: unknown = null;
			await fetch(url).catch((error: unknown) => {
				rejected = error;
			});
			expect(rejected).not.toBeNull();
			const body = run([CURL, '-sS', '--cacert', caPem, url]);
			expect((JSON.parse(body.out) as { db?: string }).db).toBe('ok');

			// openssl: the chain verifies against the CA alone.
			const handshake = Bun.spawnSync(
				[
					OPENSSL,
					's_client',
					'-connect',
					`127.0.0.1:${server.port}`,
					'-servername',
					'localhost',
					'-CAfile',
					caPem,
					'-verify_return_error',
				],
				{ stdin: new TextEncoder().encode('Q\n'), stdout: 'pipe', stderr: 'pipe' },
			);
			expect(handshake.stdout.toString()).toContain('Verify return code: 0 (ok)');
		} finally {
			const { stdout, stderr } = await stop(server);
			expect(stdout).toContain(
				`Dédalo TS dev listener on https://localhost:${server.port}/dedalo/core/page/`,
			);
			// A year of life left: no expiry warning; loopback: no network warning.
			expect(stderr).not.toContain('tls:renew');
			expect(stderr).not.toContain('other machines can reach it');
		}
	}, 90000);
});

describe('B. a certificate near its end warns at every boot, naming the renew command', () => {
	test('10 days left → the warning names `bun run tls:renew`', async () => {
		const server = boot({ cert: shortPem, key: shortKey });
		try {
			await waitForSocketHealth(server);
			await waitForPort(server.port);
		} finally {
			const { stdout, stderr } = await stop(server);
			expect(stdout).toContain(`dev listener on https://localhost:${server.port}/`);
			expect(stderr).toMatch(/the dev listener's certificate expires in (9|10) days/);
			expect(stderr).toContain('bun run tls:renew');
		}
	}, 90000);
});

describe('C. neither key: plain HTTP, as before', () => {
	test('http:// address, /health 200 over plain HTTP', async () => {
		const server = boot({});
		try {
			await waitForSocketHealth(server);
			await waitForPort(server.port);
			const response = await fetch(`http://127.0.0.1:${server.port}/health`);
			expect(response.status).toBe(200);
		} finally {
			const { stdout } = await stop(server);
			expect(stdout).toContain(
				`Dédalo TS dev listener on http://localhost:${server.port}/dedalo/core/page/`,
			);
		}
	}, 90000);
});

describe('D. a bad pair refuses the boot (EX_CONFIG), never falls back to HTTP', () => {
	const cases: { name: string; tls: { cert?: string; key?: string }; says: string[] }[] = [
		{
			name: 'certificate without key',
			tls: { cert: leafPem },
			says: ['SERVER_TCP_TLS_CERT_FILE is set', 'SERVER_TCP_TLS_KEY_FILE is not', leafPem],
		},
		{
			name: 'key without certificate',
			tls: { key: leafKey },
			says: ['SERVER_TCP_TLS_KEY_FILE is set', 'SERVER_TCP_TLS_CERT_FILE is not', leafKey],
		},
		{
			name: 'an unreadable key file',
			tls: { cert: leafPem, key: join(scratch, 'absent.pem') },
			says: [
				'SERVER_TCP_TLS_KEY_FILE names a file this server cannot read',
				join(scratch, 'absent.pem'),
				'ENOENT',
			],
		},
		{
			name: 'a certificate file that is not a certificate',
			tls: { cert: leafKey, key: leafKey },
			says: ['SERVER_TCP_TLS_CERT_FILE', 'is not a PEM certificate', leafKey],
		},
		{
			name: 'the key of another certificate',
			tls: { cert: leafPem, key: shortKey },
			says: ['is not the key of the certificate', shortKey, leafPem],
		},
	];
	for (const item of cases) {
		test(`${item.name} → exit 78, one REFUSED line naming key and path`, async () => {
			const outcome = await refused(item.tls);
			expect(outcome.code, outcome.stderr.slice(-1500)).toBe(DEV_LISTENER_REFUSED_EXIT_CODE);
			expect(outcome.stderr.match(/\[boot\] REFUSED — /g)?.length, 'ONE journal line').toBe(1);
			for (const fragment of item.says) expect(outcome.stderr).toContain(fragment);
			expect(outcome.stdout).not.toContain('dev listener on');
		}, 60000);
	}
});

describe('E. the pure halves and the catalog', () => {
	test('both or neither: null, the pair, a typed half-pair refusal', () => {
		expect(devListenerTlsFiles(undefined, undefined)).toBeNull();
		expect(devListenerTlsFiles('  ', '')).toBeNull();
		expect(devListenerTlsFiles('/a.pem', '/b.pem')).toEqual({
			certFile: '/a.pem',
			keyFile: '/b.pem',
		});
		let caught: unknown = null;
		try {
			devListenerTlsFiles('/a.pem', '');
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(DevListenerTlsRefusal);
		expect((caught as DevListenerTlsRefusal).reason).toBe('half_pair');
		expect((caught as DevListenerTlsRefusal).key).toBe('SERVER_TCP_TLS_KEY_FILE');
	});

	test('the URL follows the pair; the network warning says "no TLS" only without one', () => {
		const files = { certFile: '/a.pem', keyFile: '/b.pem' };
		expect(devTcpListener('3500', '', files)?.url).toBe('https://localhost:3500/dedalo/core/page/');
		expect(devTcpListener('3500', '', null)?.url).toBe('http://localhost:3500/dedalo/core/page/');
		const lanPlain = devTcpListener('3500', '0.0.0.0', null);
		const lanTls = devTcpListener('3500', '0.0.0.0', files);
		expect(devListenerNetworkWarning(lanPlain as NonNullable<typeof lanPlain>)).toContain('no TLS');
		expect(devListenerNetworkWarning(lanTls as NonNullable<typeof lanTls>)).not.toContain('no TLS');
		expect(devListenerNetworkWarning(lanTls as NonNullable<typeof lanTls>)).toContain('over TLS');
		const loopback = devTcpListener('3500', '', files);
		expect(devListenerNetworkWarning(loopback as NonNullable<typeof loopback>)).toBeNull();
	});

	test('expiry: 30 days left is quiet, 29 warns, past the end says EXPIRED — each names the command', () => {
		const now = new Date('2026-10-16T12:00:00Z');
		const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000);
		expect(devListenerExpiryWarning(inDays(30), now)).toBeNull();
		expect(devListenerExpiryWarning(inDays(29.5), now)).toContain('expires in 29 days');
		expect(devListenerExpiryWarning(inDays(1.2), now)).toContain('expires in 1 day ');
		const expired = devListenerExpiryWarning(inDays(-1), now) as string;
		expect(expired).toContain('EXPIRED on 2026-10-15');
		for (const line of [devListenerExpiryWarning(inDays(29.5), now), expired]) {
			expect(line).toContain('bun run tls:renew');
		}
	});

	test('the generated leaf loads: its notAfter is the leaf, not the CA', async () => {
		const material = await loadDevListenerTls({ certFile: leafPem, keyFile: leafKey });
		const daysLeft = (material.notAfter.getTime() - Date.now()) / 86_400_000;
		// The generator's leaf lifetime (397 days); the CA lives ten years.
		expect(daysLeft).toBeGreaterThan(390);
		expect(daysLeft).toBeLessThan(400);
	});

	test('the two catalog keys: operator scope, no default, development only', () => {
		for (const key of ['SERVER_TCP_TLS_CERT_FILE', 'SERVER_TCP_TLS_KEY_FILE'] as const) {
			const entry = SERVER_KEYS[key];
			expect(entry.scope).toBe('operator');
			expect(entry.default).toBeUndefined();
			expect(entry.typeSuffix).toContain('development only');
		}
		expect(SERVER_KEYS.SERVER_TCP_TLS_CERT_FILE.doc).toContain('bun run tls:renew');
	});

	test('a path that is not a readable file is refused with its errno, not a stack', async () => {
		const dir = join(scratch, 'not_a_file');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(scratch, 'k.pem'), 'x');
		let caught: unknown = null;
		try {
			await loadDevListenerTls({ certFile: dir, keyFile: join(scratch, 'k.pem') });
		} catch (error) {
			caught = error;
		}
		expect((caught as DevListenerTlsRefusal).reason).toBe('unreadable');
		expect((caught as Error).message).toContain('EISDIR');
	});
});

describe('F. the pair needs a listener; harnesses that speak http:// pin plain HTTP', () => {
	test('socket-only (SERVER_TCP_PORT empty) with a stray half pair: boots and serves, no refusal', async () => {
		bootCount += 1;
		const socket = join(scratch, `s${bootCount}.sock`);
		const server = Object.assign(
			Bun.spawn([process.execPath, 'run', 'src/server.ts'], {
				cwd: ROOT,
				env: {
					...(process.env as Record<string, string>),
					SERVER_UNIX_SOCKET: socket,
					SERVER_TCP_PORT: '',
					SERVER_TCP_TLS_CERT_FILE: leafPem,
					SERVER_TCP_TLS_KEY_FILE: '',
					DEDALO_DIFFUSION_SCHEDULER_ENABLED: 'false',
					DEDALO_MEDIA_PROCESSES_DIR: markProcessesDir(join(scratch, `processes${bootCount}`)),
				},
				stdout: 'pipe',
				stderr: 'pipe',
			}),
			{ port: 0, socket },
		);
		try {
			await waitForSocketHealth(server);
		} finally {
			const { stderr } = await stop(server);
			expect(stderr).not.toContain('[boot] REFUSED');
		}
	}, 90000);

	/** The client suite's spawned-server environment, composed in a child exactly as the runner does. */
	function composeSuiteEnvironment(
		parent: Record<string, string>,
		port: number,
	): Record<string, string> {
		const script = `
			const m = await import(${JSON.stringify(join(ROOT, 'scripts', 'client_test_server.ts'))});
			const out = m.suiteServerEnvironment({ suiteDb: ${JSON.stringify(readEnv('DB_NAME'))}, port: ${port}, ...m.suiteServerPaths() });
			console.log(JSON.stringify(out));
		`;
		const child = Bun.spawnSync([process.execPath, '-e', script], { cwd: ROOT, env: parent });
		expect(child.exitCode, child.stderr.toString()).toBe(0);
		return JSON.parse(child.stdout.toString().trim().split('\n').at(-1) as string);
	}

	/** The URL the server a given environment boots would print — its own devTcpListener(). */
	function listenerUrlUnder(env: Record<string, string>): string {
		const script = `const m = await import(${JSON.stringify(join(ROOT, 'src/config/tcp_listener.ts'))}); console.log(m.devTcpListener()?.url ?? 'none');`;
		const child = Bun.spawnSync([process.execPath, '-e', script], { cwd: ROOT, env });
		expect(child.exitCode, child.stderr.toString()).toBe(0);
		return child.stdout.toString().trim().split('\n').at(-1) as string;
	}

	test('the client suite server answers plain HTTP although the inherited environment carries a valid pair', async () => {
		const port = freePort();
		// The developer route's .env, played by the parent environment (readEnv's
		// first half): a VALID pair, so an unpinned server would really serve TLS.
		const parent: Record<string, string> = {
			...(process.env as Record<string, string>),
			SERVER_TCP_TLS_CERT_FILE: leafPem,
			SERVER_TCP_TLS_KEY_FILE: leafKey,
		};
		const env = composeSuiteEnvironment(parent, port);
		// Positive control: without the pin the same environment IS an https listener.
		const unpinned = { ...env };
		for (const key of Object.keys(PLAIN_HTTP_DEV_LISTENER_ENV))
			unpinned[key] = parent[key] as string;
		expect(listenerUrlUnder(unpinned)).toBe(`https://localhost:${port}/dedalo/core/page/`);

		bootCount += 1;
		const server = Object.assign(
			Bun.spawn([process.execPath, 'run', 'src/server.ts'], {
				cwd: ROOT,
				env: {
					...env,
					DEDALO_DIFFUSION_SCHEDULER_ENABLED: 'false',
					DEDALO_MEDIA_PROCESSES_DIR: markProcessesDir(join(scratch, `processes${bootCount}`)),
				},
				stdout: 'pipe',
				stderr: 'pipe',
			}),
			{ port, socket: env.SERVER_UNIX_SOCKET as string },
		);
		try {
			await waitForSocketHealth(server);
			await waitForPort(port);
			// The runner's origin (client_test_server.ts: `http://localhost:<port>`).
			const response = await fetch(`http://localhost:${port}/health`);
			expect(response.status).toBe(200);
		} finally {
			const { stdout } = await stop(server);
			expect(stdout).toContain(
				`Dédalo TS dev listener on http://localhost:${port}/dedalo/core/page/`,
			);
		}
	}, 120000);

	test('every script that spawns a server on its own SERVER_TCP_PORT spreads the plain-HTTP pin', () => {
		// The other harnesses (update drill, update probe) cannot be composed in a
		// child without running them; the property they must share is this one.
		const scriptsDir = join(ROOT, 'scripts');
		const files = readdirSync(scriptsDir, { recursive: true, encoding: 'utf8' }).filter((name) =>
			name.endsWith('.ts'),
		);
		const spawners = files.filter((name) =>
			/\bSERVER_TCP_PORT:\s*(?!'')\S/.test(readFileSync(join(scriptsDir, name), 'utf8')),
		);
		expect(spawners.length).toBeGreaterThanOrEqual(3);
		const unpinned = spawners.filter(
			(name) =>
				!readFileSync(join(scriptsDir, name), 'utf8').includes('...PLAIN_HTTP_DEV_LISTENER_ENV'),
		);
		expect(
			unpinned,
			'these spawn a server under an http:// runner without pinning plain HTTP',
		).toEqual([]);
	});
});
