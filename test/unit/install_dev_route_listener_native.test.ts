/**
 * THE DEVELOPER ROUTE WRITES A LISTENER THAT SERVES (TODO-054/055; design
 * DEV_ROUTE_SERVE §1.1–1.2, gates 1 and 3; owner answers D1 local_ca default,
 * D3 port 3500 — taken → refused, the next free one suggested).
 *
 * Measured as OUTCOMES:
 *  A. GATE 1 — the plan renders exactly the §1.1 keys per TLS mode (local_ca
 *     by default, none, files) under the "Development only" header, and the
 *     REAL writer (persistConfig, in a child, into a scratch private dir) puts
 *     them in the .env; the server's own readers (src/config/tcp_listener.ts)
 *     read that file back as the listener the Review promised — same URL;
 *  B. production, docker, trial (and a host route's engine child) write NONE
 *     of these keys — the catalog's "unset in production";
 *  C. PRESERVE: a re-run keeps the operator's own port/address/pair/mode lines
 *     (the real writer carries `SERVER_TCP_PORT=3600` verbatim; the Review
 *     says "kept"), an explicit answer replaces them, `none` CLEARS a prior
 *     pair (the server reads plain HTTP) — and SESSION_COOKIE_SECURE always
 *     follows the transport the file ends up with;
 *  D. the answers' refusals (port, address, mode, files, other routes);
 *  E. ONE servesTls: the stack's re-export IS the developer's function;
 *  F. D3 on a REALLY held port: the refusal names it and suggests a port that
 *     really binds; the executor's fresh run refuses before writing anything —
 *     through a fake host AND through the REAL CLI (engineHost), the wiring a
 *     dropped check would silently break;
 *  H. a value the plan KEEPS from the prior .env is held to the answer rules
 *     (a field error, never a raw bind exception), and a listener other
 *     machines reach is a PLAN warning — the Review and the real CLI's
 *     headless plan carry it; this machine only carries none;
 *  G. GATE 3 — a REAL login over the REAL dev listener, with the plan's own
 *     keys: the cookie the login sets is carried by the next request (curl's
 *     cookie jar applies the browser rule: a Secure cookie is never sent to a
 *     non-loopback http:// origin) — https through the local authority, http on
 *     a network address — and the control: the same http listener with
 *     SESSION_COOKIE_SECURE=true (no derivation) loses the session.
 *
 * Isolation: scratch private dirs (DEDALO_INSTALL_PRIVATE_DIR), an ephemeral
 * unix socket per boot, the diffusion scheduler off, a marked processes dir,
 * the preload's suite database (its root credential set through
 * ensureSuiteLoginPassword — the marker's door) and session store.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { config } from '../../src/config/config.ts';
import { parseEnvFile } from '../../src/config/env.ts';
import { devListenerTlsFiles, devTcpListener } from '../../src/config/tcp_listener.ts';
import {
	DEV_LISTENER_ENV_KEYS,
	type DevListenerPlan,
	devListenerNetworkWarning,
	servesTls,
} from '../../src/core/install/dev_listener.ts';
import { devListenerRefusals, probeListenPort } from '../../src/core/install/dev_listener_check.ts';
import { executeInstall } from '../../src/core/install/executor.ts';
import { servesTls as stackServesTls } from '../../src/core/install/host/stack/layout.ts';
import { buildInstallPlan, type InstallPlan } from '../../src/core/install/install_plan.ts';
import { buildPlanFile } from '../../src/core/install/run_files.ts';
import { buildScreens, reviewLines } from '../../src/core/install/screen_model.ts';
import {
	ensureSuiteLoginPassword,
	SUITE_LOGIN_PASSWORD,
} from '../../src/core/test_data/suite_login.ts';
import { freeTcpPort } from '../helpers/free_tcp_port.ts';
import { BASE_RECORD } from '../helpers/install_answer_cases.ts';
import {
	fakeHost,
	fakeTable,
	recordingIo,
	withPrivateDir,
} from '../helpers/install_fake_executor.ts';
import { modelInput } from '../helpers/install_plain_script.ts';
import { markProcessesDir } from '../helpers/test_media_root.ts';

const ROOT = resolve(import.meta.dir, '../..');
const CONFIG_PERSIST = join(ROOT, 'src/core/install/config_persist.ts');
const GENERATOR = join(ROOT, 'deploy/dedalo-tls-rotate.sh');
const CURL = Bun.which('curl') ?? '/usr/bin/curl';
// Short: macOS caps a unix socket path at 104 bytes.
const scratch = mkdtempSync(join(tmpdir(), 'zzdrl_'));
const CA_DIR = join(scratch, 'tls');
const CA_PEM = join(CA_DIR, 'dedalo-local-ca.pem');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const DEV = { route: 'developer', ...BASE_RECORD } as const;
const TLS_DIR = '/zz/private/tls';

/** A developer plan over `prior` (the plan's own builder — what every front end renders). */
function devPlan(
	answers: Record<string, unknown> = {},
	prior: Record<string, string> = {},
	devTlsDir = TLS_DIR,
): InstallPlan {
	return buildInstallPlan({ ...DEV, ...answers }, { priorEnv: prior, devTlsDir });
}

/** The plan's "Development only" section as [key, value] pairs. */
function devSection(plan: InstallPlan): [string, string][] {
	const sections = plan.env.filter((section) => section.comment.includes('Development only'));
	expect(sections.length, 'exactly one Development only section').toBe(1);
	return (sections[0]?.entries ?? []).map((item) => [item.key, item.value]);
}

const listenerOf = (plan: InstallPlan): DevListenerPlan => {
	expect(plan.devListener).not.toBeNull();
	return plan.devListener as DevListenerPlan;
};

/** persistConfig in a child, private dir redirected; the .env it wrote. */
function persistInChild(answers: Record<string, unknown>, privateDir: string): string {
	const script = `const { persistConfig } = await import(${JSON.stringify(CONFIG_PERSIST)});
await persistConfig(JSON.parse(await Bun.stdin.text()));`;
	const proc = Bun.spawnSync([process.execPath, '-e', script], {
		cwd: ROOT,
		env: {
			...Bun.env,
			DEDALO_INSTALL_PRIVATE_DIR: privateDir,
			DEDALO_TS_STATE_PATH: join(privateDir, 'ts_state.json'),
		},
		stdin: Buffer.from(JSON.stringify(answers)),
		stdout: 'pipe',
		stderr: 'pipe',
	});
	expect(proc.exitCode, `persistConfig child failed: ${proc.stderr.toString()}`).toBe(0);
	return readFileSync(join(privateDir, '.env'), 'utf8');
}

const privateDir = (name: string): string => mkdtempSync(join(scratch, `${name}_`));

// ── A. gate 1: the keys per TLS mode ────────────────────────────────────────

describe('A. the developer plan writes the listener, per TLS mode', () => {
	test('unanswered: 3500 on this machine over the LOCAL CA (D1, D3), dev mode + error details, Secure cookie', () => {
		const plan = devPlan();
		expect(devSection(plan)).toEqual([
			['SERVER_TCP_PORT', '3500'],
			['SERVER_TCP_HOST', '127.0.0.1'],
			['SERVER_TCP_TLS_CERT_FILE', `${TLS_DIR}/fullchain.pem`],
			['SERVER_TCP_TLS_KEY_FILE', `${TLS_DIR}/privkey.pem`],
			['SESSION_COOKIE_SECURE', 'true'],
			['DEDALO_DEV_MODE', 'true'],
			['DEDALO_DEBUG_API_ERRORS', 'true'],
		]);
		const listener = listenerOf(plan);
		expect(listener.tlsSource).toBe('local_ca');
		expect(listener.url).toBe('https://localhost:3500/dedalo/core/page/');
		expect(listener.networkReachable).toBe(false);
		expect(listener.kept).toEqual([]);
		expect(plan.errors).toEqual([]);
	});

	test('none: plain HTTP — no pair, SESSION_COOKIE_SECURE=false', () => {
		const plan = devPlan({ tls_mode: 'none' });
		expect(devSection(plan)).toEqual([
			['SERVER_TCP_PORT', '3500'],
			['SERVER_TCP_HOST', '127.0.0.1'],
			['SESSION_COOKIE_SECURE', 'false'],
			['DEDALO_DEV_MODE', 'true'],
			['DEDALO_DEBUG_API_ERRORS', 'true'],
		]);
		expect(listenerOf(plan).url).toBe('http://localhost:3500/dedalo/core/page/');
	});

	test('files: the developer’s own pair, as given; another port and the network', () => {
		const plan = devPlan({
			tls_mode: 'files',
			tls_cert_path: '/home/me/cert.pem',
			tls_key_path: '/home/me/key.pem',
			dev_port: '4400',
			dev_host: '0.0.0.0',
		});
		expect(devSection(plan)).toEqual([
			['SERVER_TCP_PORT', '4400'],
			['SERVER_TCP_HOST', '0.0.0.0'],
			['SERVER_TCP_TLS_CERT_FILE', '/home/me/cert.pem'],
			['SERVER_TCP_TLS_KEY_FILE', '/home/me/key.pem'],
			['SESSION_COOKIE_SECURE', 'true'],
			['DEDALO_DEV_MODE', 'true'],
			['DEDALO_DEBUG_API_ERRORS', 'true'],
		]);
		expect(listenerOf(plan).networkReachable).toBe(true);
	});

	test('the REAL writer puts them in the .env, and the server reads back the listener the plan promised', () => {
		const dir = privateDir('fresh');
		const env = parseEnvFile(persistInChild({ ...DEV }, dir));
		expect(env.SERVER_TCP_PORT).toBe('3500');
		expect(env.SERVER_TCP_HOST).toBe('127.0.0.1');
		// The local-CA pair lives in THIS install's own private dir (paths.ts devTlsDir).
		expect(env.SERVER_TCP_TLS_CERT_FILE).toBe(join(dir, 'tls', 'fullchain.pem'));
		expect(env.SERVER_TCP_TLS_KEY_FILE).toBe(join(dir, 'tls', 'privkey.pem'));
		expect(env.SESSION_COOKIE_SECURE).toBe('true');
		expect(env.DEDALO_DEV_MODE).toBe('true');
		expect(env.DEDALO_DEBUG_API_ERRORS).toBe('true');
		expect(readFileSync(join(dir, '.env'), 'utf8')).toContain('# --- Development only');
		const served = devTcpListener(
			env.SERVER_TCP_PORT,
			env.SERVER_TCP_HOST as string,
			devListenerTlsFiles(env.SERVER_TCP_TLS_CERT_FILE, env.SERVER_TCP_TLS_KEY_FILE),
		);
		const promised = listenerOf(devPlan({}, {}, join(dir, 'tls')));
		expect(served?.url).toBe(promised.url);
		expect(served?.tls).toEqual(promised.tls);
	});
});

// ── B. no other route writes them ───────────────────────────────────────────

describe('B. production, docker, trial and an engine child write none of them', () => {
	const cases: [string, Record<string, unknown>][] = [
		[
			'production',
			{ route: 'production', instance: 'devroute', server_name: 'dedalo.example.org' },
		],
		['docker', { route: 'docker', server_name: 'dedalo.example.org' }],
		['trial', { route: 'trial' }],
		['production engine child', { route: 'production', instance: 'devroute', engine_only: true }],
	];
	for (const [name, answers] of cases) {
		test(name, () => {
			const plan = buildInstallPlan(
				{ ...BASE_RECORD, ...answers },
				{ priorEnv: { SERVER_TCP_PORT: '3600' } },
			);
			expect(plan.devListener).toBeNull();
			expect(plan.envKeys.length, 'anti-vacuity: the plan writes keys').toBeGreaterThan(10);
			expect(plan.envKeys.filter((key) => DEV_LISTENER_ENV_KEYS.includes(key))).toEqual([]);
		});
	}
});

// ── C. PRESERVE ─────────────────────────────────────────────────────────────

describe('C. a re-run keeps what the operator has', () => {
	const PRIOR = {
		SERVER_TCP_PORT: '3600',
		SERVER_TCP_HOST: '0.0.0.0',
		SERVER_TCP_TLS_CERT_FILE: '/home/me/mine.pem',
		SERVER_TCP_TLS_KEY_FILE: '/home/me/mine.key',
		DEDALO_DEV_MODE: 'false',
	};

	test('unanswered: the port, address, pair and mode lines are kept, the cookie flag follows the kept pair', () => {
		const plan = devPlan({}, PRIOR);
		const listener = listenerOf(plan);
		expect(devSection(plan)).toEqual([
			['SESSION_COOKIE_SECURE', 'true'],
			['DEDALO_DEBUG_API_ERRORS', 'true'],
		]);
		expect(listener.kept).toEqual([
			'SERVER_TCP_PORT',
			'SERVER_TCP_HOST',
			'SERVER_TCP_TLS_CERT_FILE',
			'SERVER_TCP_TLS_KEY_FILE',
			'DEDALO_DEV_MODE',
		]);
		expect(listener.tlsSource).toBe('kept');
		expect(listener.url).toBe('https://localhost:3600/dedalo/core/page/');
		// The Review says so.
		const lines = reviewLines(plan, modelInput({ ...DEV }, { priorEnv: PRIOR }));
		expect(lines).toContainEqual({ label: 'kept from .env', value: listener.kept.join(', ') });
		expect(lines).toContainEqual({ label: 'development server', value: listener.url });
	});

	test('the REAL writer carries `SERVER_TCP_PORT=3600` verbatim; an explicit answer replaces it', () => {
		const dir = privateDir('rerun');
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, '.env'), 'SERVER_TCP_PORT=3600\nDEDALO_DEV_MODE=false\n', {
			mode: 0o600,
		});
		const kept = parseEnvFile(persistInChild({ ...DEV }, dir));
		expect(kept.SERVER_TCP_PORT).toBe('3600');
		expect(kept.DEDALO_DEV_MODE).toBe('false');
		const replaced = parseEnvFile(persistInChild({ ...DEV, dev_port: '3700' }, dir));
		expect(replaced.SERVER_TCP_PORT).toBe('3700');
		expect(readFileSync(join(dir, '.env'), 'utf8').match(/^SERVER_TCP_PORT=/gm)?.length).toBe(1);
	});

	test('`none` over a prior pair CLEARS it: the server reads plain HTTP, the cookie flag is false', () => {
		const plan = devPlan({ tls_mode: 'none' }, PRIOR);
		const section = new Map(devSection(plan));
		expect(section.get('SERVER_TCP_TLS_CERT_FILE')).toBe('');
		expect(section.get('SERVER_TCP_TLS_KEY_FILE')).toBe('');
		expect(section.get('SESSION_COOKIE_SECURE')).toBe('false');
		expect(
			devListenerTlsFiles(
				section.get('SERVER_TCP_TLS_CERT_FILE'),
				section.get('SERVER_TCP_TLS_KEY_FILE'),
			),
		).toBeNull();
	});

	test('a prior HALF pair is not kept (it refuses the boot): the local CA writes both halves', () => {
		const plan = devPlan({}, { SERVER_TCP_TLS_CERT_FILE: '/home/me/only.pem' });
		expect(listenerOf(plan).tlsSource).toBe('local_ca');
		expect(new Map(devSection(plan)).get('SERVER_TCP_TLS_KEY_FILE')).toBe(`${TLS_DIR}/privkey.pem`);
	});
});

// ── D. refusals ─────────────────────────────────────────────────────────────

describe('D. the answers the developer listener refuses', () => {
	const cases: [string, Record<string, unknown>, string][] = [
		['a port that is not one', { ...DEV, dev_port: 'x' }, 'dev_port'],
		['a port out of range', { ...DEV, dev_port: '70000' }, 'dev_port'],
		['a host name', { ...DEV, dev_host: 'dev.example.org' }, 'dev_host'],
		[
			"Let's Encrypt (a checkout has no public name)",
			{ ...DEV, tls_mode: 'letsencrypt' },
			'tls_mode',
		],
		['files without paths', { ...DEV, tls_mode: 'files' }, 'tls_cert_path'],
		[
			'a dev port on production',
			{ ...BASE_RECORD, route: 'production', instance: 'devroute', dev_port: '3500' },
			'dev_port',
		],
		['a dev host on docker', { ...BASE_RECORD, route: 'docker', dev_host: '0.0.0.0' }, 'dev_host'],
	];
	for (const [name, raw, key] of cases) {
		test(name, () => {
			expect(buildInstallPlan(raw).fieldErrors.map((item) => item.key)).toContain(key);
		});
	}
	test('valid: an IPv6 loopback, localhost, a port given', () => {
		for (const dev_host of ['::1', 'localhost', '192.168.1.20']) {
			expect(devPlan({ dev_host, dev_port: '4500' }).errors, dev_host).toEqual([]);
		}
	});
});

// ── E. one servesTls ────────────────────────────────────────────────────────

describe('E. SESSION_COOKIE_SECURE has ONE source on every route', () => {
	test('the stack’s servesTls IS the developer listener’s; the matrix', () => {
		expect(stackServesTls).toBe(servesTls);
		expect(servesTls({ route: 'docker', tls_mode: 'letsencrypt' })).toBe(true);
		expect(servesTls({ route: 'trial', tls_mode: 'none' })).toBe(false);
		expect(servesTls({ route: 'developer', tls_mode: '' })).toBe(true);
		expect(servesTls({ route: 'developer', tls_mode: 'none' })).toBe(false);
		expect(servesTls({ route: 'developer', tls_mode: 'files' })).toBe(true);
	});
});

// ── F. D3: a port in use ────────────────────────────────────────────────────

/** Hold a real port on 127.0.0.1 for the duration of `work`. */
async function holding<T>(work: (port: number) => Promise<T>): Promise<T> {
	const held = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => {} } });
	try {
		return await work(held.port);
	} finally {
		held.stop(true);
	}
}

describe('F. D3 — a port in use is refused, the next free one suggested', () => {
	test('a held port: refused, named, and the suggested port really binds', async () => {
		await holding(async (port) => {
			const refusals = await devListenerRefusals({ host: '127.0.0.1', port: String(port) });
			expect(refusals.length).toBe(1);
			expect(refusals[0]).toContain(`port ${port} (SERVER_TCP_PORT) is already in use`);
			const suggested = Number(refusals[0]?.match(/; (\d+) is free$/)?.[1]);
			expect(suggested).toBeGreaterThan(port);
			expect((await probeListenPort('127.0.0.1', suggested)).kind).toBe('free');
		});
	});

	test('a free port: nothing refused; no listener (another route): nothing asked', async () => {
		expect(await devListenerRefusals({ host: '127.0.0.1', port: String(freeTcpPort()) })).toEqual(
			[],
		);
		expect(await devListenerRefusals(null)).toEqual([]);
	});

	test('the executor’s fresh run refuses a held port BEFORE writing anything', async () => {
		await holding(async (port) => {
			await withPrivateDir(privateDir('exec'), async (dir) => {
				const plan = devPlan({ dev_port: String(port) });
				expect(plan.errors).toEqual([]);
				const calls: string[] = [];
				const { host } = fakeHost();
				const outcome = await executeInstall(
					{
						mode: 'fresh',
						planFile: buildPlanFile(plan, { root_password: 'Mosaic-Kestrel-Harbor-47' }),
						plan,
						secrets: { root_password: 'Mosaic-Kestrel-Harbor-47' },
					},
					recordingIo().io,
					{ table: fakeTable(calls), host: { ...host, devListenerRefusals } },
				);
				expect(outcome.result).toBe('refused');
				expect(outcome.message).toContain(`port ${port} (SERVER_TCP_PORT) is already in use`);
				expect(calls).toEqual([]);
				expect(readdirSync(dir)).toEqual([]);
			});
		});
	});

	// The PRODUCTION wiring, not a fake host carrying the function: the real
	// CLI (scripts/install.ts → engineHost) on the developer route, headless,
	// over a really held port. A host that dropped the check would write the
	// .env with the taken port and report success; this run must refuse first.
	// The database is never created: the listener check precedes the claim.
	test('the REAL CLI (engineHost) refuses a held port and writes nothing', async () => {
		await holding(async (port) => {
			const dir = privateDir('cli');
			const proc = Bun.spawn(
				[
					process.execPath,
					'run',
					join(ROOT, 'scripts/install.ts'),
					'--route',
					'developer',
					'--hierarchies',
					'none',
					'--db-name',
					`zzdrl_cli_${process.pid}`,
					'--db-user',
					config.db.user,
					'--db-host',
					config.db.host,
					'--db-port',
					String(config.db.port),
					...(config.db.socket === '' ? [] : ['--db-socket', config.db.socket]),
					'--entity',
					'zzdrlcli',
					'--skip-tools',
					'--tls',
					'none',
					'--dev-port',
					String(port),
				],
				{
					cwd: ROOT,
					env: {
						...(process.env as Record<string, string>),
						DEDALO_INSTALL_ROOT_PASSWORD: 'Mosaic-Kestrel-Harbor-47',
						...(config.db.password ? { DEDALO_INSTALL_DB_PASSWORD: config.db.password } : {}),
						DEDALO_INSTALL_PRIVATE_DIR: dir,
						DEDALO_TS_STATE_PATH: join(dir, 'ts_state.json'),
						DEDALO_SESSION_DB_PATH: join(dir, 'sessions.sqlite'),
					},
					stdout: 'pipe',
					stderr: 'pipe',
				},
			);
			// Async spawn: the held port's listener lives in THIS event loop and
			// must keep accepting while the child probes it.
			const [out, err, code] = await Promise.all([
				new Response(proc.stdout).text(),
				new Response(proc.stderr).text(),
				proc.exited,
			]);
			const text = out + err;
			expect(code, text).not.toBe(0);
			expect(text).toContain(`port ${port} (SERVER_TCP_PORT) is already in use`);
			expect(existsSync(join(dir, '.env')), 'no .env written').toBe(false);
			expect(existsSync(join(dir, 'install', 'install.state.json')), 'no install record').toBe(
				false,
			);
		});
	}, 60_000);
});

// ── H. what the plan keeps or opens is held to the answer rules ────────────

/** The real CLI's `--plan` JSON for the developer route over `dir` as private dir. */
function cliPlan(args: string[], dir: string): { warnings: string[]; errors: string[] } {
	const proc = Bun.spawnSync(
		[
			process.execPath,
			'run',
			join(ROOT, 'scripts/install.ts'),
			'--plan',
			'--route',
			'developer',
			'--hierarchies',
			'none',
			'--entity',
			'zzdrlplan',
			...args,
		],
		{
			cwd: ROOT,
			env: {
				...(process.env as Record<string, string>),
				DEDALO_INSTALL_PRIVATE_DIR: dir,
				DEDALO_TS_STATE_PATH: join(dir, 'ts_state.json'),
			},
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	const out = proc.stdout.toString();
	const line = out.split('\n').find((item) => item.startsWith('{'));
	expect(line, `--plan printed no JSON: ${out}${proc.stderr.toString()}`).toBeDefined();
	return JSON.parse(line as string);
}

describe('H. kept values are validated; a network listener is a plan warning', () => {
	test('a malformed KEPT port/address is a field error on the answer that replaces it', () => {
		for (const [prior, key, needle] of [
			[{ SERVER_TCP_PORT: 'abc' }, 'dev_port', "SERVER_TCP_PORT 'abc' kept from your .env"],
			[{ SERVER_TCP_PORT: '70000' }, 'dev_port', "SERVER_TCP_PORT '70000' kept from your .env"],
			[{ SERVER_TCP_HOST: 'my.host' }, 'dev_host', "SERVER_TCP_HOST 'my.host' kept from your .env"],
		] as const) {
			const plan = devPlan({}, prior);
			expect(
				plan.errors.some((error) => error.includes(needle)),
				JSON.stringify(prior),
			).toBe(true);
			expect(
				plan.fieldErrors.some((item) => item.key === key && item.message.includes(needle)),
			).toBe(true);
			// An explicit answer replaces the bad kept value: no error left.
			const answered = devPlan({ dev_port: '3501', dev_host: '127.0.0.1' }, prior);
			expect(answered.errors.filter((error) => error.includes('kept from your .env'))).toEqual([]);
		}
		// A sound kept pair is no error.
		expect(devPlan({}, { SERVER_TCP_PORT: '3600', SERVER_TCP_HOST: '0.0.0.0' }).errors).toEqual([]);
	});

	test('the port check names a malformed port instead of throwing', async () => {
		for (const port of ['abc', '0', '70000', '']) {
			const refusals = await devListenerRefusals({ host: '127.0.0.1', port });
			expect(refusals).toEqual([
				`the development port '${port}' (SERVER_TCP_PORT) must be an integer 1-65535 — choose another port on the Development server step (--dev-port)`,
			]);
		}
	});

	test('the REAL CLI --plan refuses a malformed kept SERVER_TCP_PORT', () => {
		const dir = privateDir('keptbad');
		writeFileSync(join(dir, '.env'), 'SERVER_TCP_PORT=abc\n', { mode: 0o600 });
		const plan = cliPlan([], dir);
		expect(plan.errors.some((error) => error.includes("SERVER_TCP_PORT 'abc' kept"))).toBe(true);
	});

	test('0.0.0.0 over plain HTTP: the warning reaches the Review and the headless plan; 127.0.0.1 none', () => {
		const network = devListenerNetworkWarning('0.0.0.0', false);
		const open = devPlan({ dev_host: '0.0.0.0', tls_mode: 'none' });
		expect(open.warnings).toContain(network);
		const review = buildScreens(modelInput({ ...DEV, dev_host: '0.0.0.0', tls_mode: 'none' })).find(
			(screen) => screen.id === 'review',
		);
		expect(review?.notices).toContainEqual({ level: 'warn', text: network });
		// A KEPT network address warns too (a re-run over a prior .env).
		expect(devPlan({}, { SERVER_TCP_HOST: '0.0.0.0' }).warnings).toContain(
			devListenerNetworkWarning('0.0.0.0', true),
		);
		// This machine only: no network warning.
		const local = devPlan({ tls_mode: 'none' });
		expect(local.warnings.some((warning) => warning.startsWith('Bound to'))).toBe(false);
		// Headless: the real CLI's plan carries it.
		const headless = cliPlan(['--dev-host', '0.0.0.0', '--tls', 'none'], privateDir('netplan'));
		expect(headless.warnings).toContain(network);
		expect(cliPlan(['--tls', 'none'], privateDir('localplan')).warnings).not.toContain(network);
	});
});

// ── G. gate 3: a real login over the real listener ─────────────────────────

function run(argv: string[]): { code: number | null; out: string; err: string } {
	const proc = Bun.spawnSync(argv, { stdout: 'pipe', stderr: 'pipe' });
	return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

/** This machine's first non-loopback IPv4 address (a LAN origin), or undefined. */
const LAN_IP = Object.values(networkInterfaces())
	.flat()
	.find((item) => item !== undefined && item.family === 'IPv4' && !item.internal)?.address;

type Boot = ReturnType<typeof Bun.spawn> & { socket: string };
let bootCount = 0;

/** The real server with the plan's OWN listener keys (an override = the control). */
function bootFromPlan(plan: InstallPlan, override: Record<string, string> = {}): Boot {
	bootCount += 1;
	const socket = join(scratch, `s${bootCount}.sock`);
	const keys = Object.fromEntries(listenerOf(plan).entries.map((item) => [item.key, item.value]));
	const child = Bun.spawn([process.execPath, 'run', 'src/server.ts'], {
		cwd: ROOT,
		env: {
			...(process.env as Record<string, string>),
			// '' = unset: an operator's own ../private/.env pair must not leak in.
			SERVER_TCP_TLS_CERT_FILE: '',
			SERVER_TCP_TLS_KEY_FILE: '',
			...keys,
			...override,
			SERVER_UNIX_SOCKET: socket,
			DEDALO_DIFFUSION_SCHEDULER_ENABLED: 'false',
			DEDALO_MEDIA_PROCESSES_DIR: markProcessesDir(join(scratch, `processes${bootCount}`)),
		},
		stdout: 'pipe',
		stderr: 'pipe',
	});
	return Object.assign(child, { socket });
}

/** Wait until the dev listener answers /health over `origin` (curl: the CA when https). */
async function waitForListener(server: Boot, origin: string, timeoutMs = 40000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) {
			const err = await new Response(server.stderr as ReadableStream).text();
			throw new Error(`server exited ${server.exitCode}: ${err.slice(-400)}`);
		}
		const probe = run([
			CURL,
			'-s',
			'-o',
			'/dev/null',
			'-w',
			'%{http_code}',
			'--cacert',
			CA_PEM,
			`${origin}/health`,
		]);
		if (probe.out === '200') return;
		await Bun.sleep(200);
	}
	throw new Error(`the dev listener never answered /health on ${origin}`);
}

async function stop(server: Boot): Promise<void> {
	server.kill('SIGTERM');
	await server.exited;
}

/**
 * The browser-visible outcome: log in as root over `origin` into a cookie jar,
 * then ask the session-gated, admin-only counters with the same jar (200 = the
 * session cookie was carried; 404 = it was not).
 */
function loginRoundTrip(origin: string): { loginOk: boolean; setCookie: string; counters: string } {
	const jar = join(scratch, `jar${bootCount}_${Date.now()}`);
	const headers = join(scratch, `headers${bootCount}_${Date.now()}`);
	const login = run([
		CURL,
		'-s',
		'--cacert',
		CA_PEM,
		'-c',
		jar,
		'-b',
		jar,
		'-D',
		headers,
		'-H',
		'Content-Type: application/json',
		'--data',
		JSON.stringify({
			dd_api: 'dd_utils_api',
			action: 'login',
			prevent_lock: true,
			source: {},
			options: { username: 'root', auth: SUITE_LOGIN_PASSWORD },
		}),
		`${origin}/api/v1/json`,
	]);
	const setCookie =
		readFileSync(headers, 'utf8')
			.split('\r\n')
			.find((line) => /^set-cookie: dedalo_ts_session=/i.test(line)) ?? '';
	const counters = run([
		CURL,
		'-s',
		'--cacert',
		CA_PEM,
		'-o',
		'/dev/null',
		'-w',
		'%{http_code}',
		'-c',
		jar,
		'-b',
		jar,
		`${origin}/api/v1/counters`,
	]);
	return {
		loginOk: (JSON.parse(login.out || '{}') as { ok?: unknown }).ok === true,
		setCookie,
		counters: counters.out,
	};
}

describe('G. gate 3 — the login cookie survives the next request on the listener the plan writes', () => {
	beforeAll(async () => {
		// The developer layout of the ONE local-CA generator (never a second one).
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
		// BUILD the situation: the suite seed ships `root` with no password.
		await ensureSuiteLoginPassword('root', SUITE_LOGIN_PASSWORD);
	});

	test('https (local_ca, D1): Secure cookie set, carried, session holds', async () => {
		const plan = devPlan({ dev_port: String(freeTcpPort()) }, {}, CA_DIR);
		const listener = listenerOf(plan);
		expect(listener.sessionCookieSecure).toBe(true);
		const origin = new URL(listener.url).origin;
		expect(origin.startsWith('https://localhost:')).toBe(true);
		const server = bootFromPlan(plan);
		try {
			await waitForListener(server, origin);
			const trip = loginRoundTrip(origin);
			expect(trip.loginOk).toBe(true);
			expect(trip.setCookie).toMatch(/;\s*Secure/i);
			expect(trip.counters).toBe('200');
		} finally {
			await stop(server);
		}
	}, 90000);

	test.if(LAN_IP !== undefined)(
		'http on a network address (none, 0.0.0.0): cookie without Secure, carried — and the control: SESSION_COOKIE_SECURE=true loses the session (requires a non-loopback IPv4)',
		async () => {
			const plan = devPlan(
				{ tls_mode: 'none', dev_host: '0.0.0.0', dev_port: String(freeTcpPort()) },
				{},
				CA_DIR,
			);
			const listener = listenerOf(plan);
			expect(listener.sessionCookieSecure).toBe(false);
			expect(listener.url.startsWith('http://')).toBe(true);
			const origin = `http://${LAN_IP}:${listener.port}`;
			const derived = bootFromPlan(plan);
			try {
				await waitForListener(derived, origin);
				const trip = loginRoundTrip(origin);
				expect(trip.loginOk).toBe(true);
				expect(trip.setCookie).not.toMatch(/;\s*Secure/i);
				expect(trip.counters).toBe('200');
			} finally {
				await stop(derived);
			}
			// The control: what an underived (catalog default true) flag does on plain HTTP.
			const control = bootFromPlan(plan, { SESSION_COOKIE_SECURE: 'true' });
			try {
				await waitForListener(control, origin);
				const trip = loginRoundTrip(origin);
				expect(trip.loginOk, 'the login itself succeeds').toBe(true);
				expect(trip.setCookie).toMatch(/;\s*Secure/i);
				expect(trip.counters, 'the Secure cookie is never sent back over http://').toBe('404');
			} finally {
				await stop(control);
			}
		},
		120000,
	);
});
