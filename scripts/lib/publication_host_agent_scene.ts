/**
 * THE PUBLICATION-HOST AGENT SCENE — one REAL agent (publication/host_agent, exec module
 * unmodified) with everything it drives: a user-mode Apache or nginx, the sudo/systemctl
 * stand-ins AT the agent's absolute binaries (the CI image's exec seam), a refusing php
 * stand-in, and the v2 releases built from publication/server_api/v2. Shared by the two
 * drills that boot the real agent:
 *   - scripts/publication_host_agent_drill.ts  — phase 2: the agent's own wire;
 *   - scripts/publication_host_engine_drill.ts — phase 3: the ENGINE's door, client, pair
 *     CLI and panel against it.
 * Moved out of the phase-2 drill (one scene, never two). Why the stand-ins sit at the
 * agent's absolute binaries (the CI image's exec seam) and why the agent runs NODE_ENV=test:
 * the phase-2 drill's header, unchanged.
 *
 * CONFIG-FREE BY CONSTRUCTION. Nothing here imports src/config, directly or through an
 * engine module: the engine drill repoints its own process to the suite database BEFORE any
 * engine import freezes `config` (src/core/db/postgres.ts reads config.db at import), and a
 * static config import here would freeze it to the application database first. What needs
 * the engine (the nginx map) or a test helper (the MariaDB credentials) is passed in.
 *
 * TWO LISTENERS (spec §2.2 / §1.1): `tls` (mTLS on 127.0.0.1, the drill's private CA) or
 * `unix` (a socket in the scene dir). The env-file selector and the instance key are the
 * COMMITTED agent's (publication/host_agent/src/config.ts: ENV_FILE_VAR, keys = the
 * AgentConfig field names).
 */

import { randomBytes } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
	SUDO,
	SYSTEMCTL,
	V2_SCRATCH_TEMPLATE_SUFFIX,
	WEB_CONFIGTEST_BINARY,
} from '../../publication/host_agent/src/exec.ts';
import {
	AGENT_ACTOR_HEADER,
	type BundleSourceEntry,
	collectTree,
	EXEC_SEAM_DIR,
	releaseIdFor,
	renderEnvFile,
	renderStandIns,
	sha256Hex,
	type TlsMaterial,
	writeStandIns,
	writeUstarGz,
} from './publication_host_agent_drill_kit.ts';
import {
	apacheBinary,
	apacheMainConf,
	freePort,
	nginxMainConf,
	sh,
	waitUp,
} from './web_server_harness.ts';

export type Server = 'apache' | 'nginx';
/** The agent's two listeners: mTLS over TCP, or a local unix socket. */
export type Listen = 'tls' | 'unix';

export const REPO = join(import.meta.dir, '..', '..');
export const AGENT_DIR = join(REPO, 'publication', 'host_agent');
export const INSTANCE = 'pubdrill';
export const ACTOR = 'drill';
export const WEB_UNIT: Readonly<Record<Server, string>> = { apache: 'apache2', nginx: 'nginx' };
export const V2_UNIT = 'dedalo-publication-api-v2';
export const V2_BASE_PATH = '/publication/server_api/v2';
export const QUALITIES: readonly string[] = ['image/thumb'];
export const PUBLISHED = 'image/thumb/0/test94_test3_1.jpg';
export const UNPUBLISHED = 'image/thumb/0/test94_test3_2.jpg';
export const MEDIA_FILES: Readonly<Record<string, string>> = {
	[PUBLISHED]: 'JPEG-published',
	[UNPUBLISHED]: 'JPEG-unpublished',
	'.publication/pub/test3_1': '',
};
/** The agent's defaults (AgentConfig): the bundle must fit what a host runs with. */
export const MAX_BUNDLE_BYTES = 268_435_456;
export const MAX_BUNDLE_ENTRIES = 200_000;
/** sun_path: 104 bytes on macOS, 108 on Linux; 103 + NUL fits both (the agent's own bound). */
const SOCKET_PATH_MAX_BYTES = 103;

/**
 * THE WIRE THE DRILLS SPEAK — the agent's routes (router.ts BASE_PATH
 * /publication/host_agent), the config selectors, and the request shapes of rules.apply and
 * release.install/rollback, each spelled as the code that READS it spells it, in ONE place:
 *   - env file selected by DEDALO_HOST_AGENT_ENV_FILE; instance key INSTANCE (config.ts
 *     ENV_FILE_VAR / KNOWN_KEYS);
 *   - the actor of EVERY mutation (rules.apply, release.install, release.rollback) rides ONE
 *     header, auth.ts's ACTOR_HEADER (requireActor; the kit's AGENT_ACTOR_HEADER, pinned to
 *     it — auth.ts itself loads the agent's config), never a second actor header, never the JSON
 *     body. rules.apply's body is exactly {server, text, hash}; release ids and shas ride
 *     X-Release-Id / X-Bundle-Sha256; rollback has NO body.
 */
export const BASE = '/publication/host_agent';
export const WIRE = {
	envFileVar: 'DEDALO_HOST_AGENT_ENV_FILE',
	instanceKey: 'INSTANCE',
	health: `${BASE}/health`,
	status: `${BASE}/v1/status`,
	rulesApply: `${BASE}/v1/rules/apply`,
	install: `${BASE}/v1/releases/v2`,
	rollback: `${BASE}/v1/releases/v2/rollback`,
	releaseIdHeader: 'X-Release-Id',
	sha256Header: 'X-Bundle-Sha256',
	actorHeader: AGENT_ACTOR_HEADER,
} as const;

export interface Bundle {
	readonly id: string;
	readonly sha256: string;
	readonly bytes: Uint8Array<ArrayBuffer>;
	readonly entries: number;
	readonly unpacked: number;
}

export interface Shared {
	readonly root: string;
	readonly tls: TlsMaterial;
	readonly bundles: { r1: Bundle; r2: Bundle; bad: Bundle };
	readonly mariadbSocket: string;
	readonly mariadbUser: string;
	readonly mariadbPassword: string;
	readonly database: string;
}

export interface SceneOptions {
	readonly listen: Listen;
	/** buildNginxMap() — passed in so this module never imports config. */
	readonly nginxMap: string;
}

export interface Scene {
	readonly server: Server;
	readonly listen: Listen;
	readonly dir: string;
	readonly state: string;
	readonly media: string;
	readonly shims: string;
	readonly log: string;
	readonly include: string;
	readonly credentials: string;
	readonly v2Pid: string;
	/** The agent's SERVICE_TOKEN — mutable: restartAgent re-provisions it. */
	token: string;
	/** 0 when listen = unix. */
	readonly agentPort: number;
	readonly agentSocket: string;
	readonly webPort: number;
	readonly v2Port: number;
	readonly shared: Shared;
	web: ReturnType<typeof Bun.spawn> | null;
	agent: ReturnType<typeof Bun.spawn> | null;
}

/** GET /v1/status, structurally (the agent's AgentStatus): only what the rows read. */
export interface StatusBody {
	instance_fingerprint?: unknown;
	apis?: { v2?: { current?: string | null; previous?: string | null } };
	rules?: { server?: string; hash?: string | null };
	media?: { present?: boolean; pub_markers?: number | null };
}

// ── rows ─────────────────────────────────────────────────────────────────────

export interface RowBook {
	row(label: string, check: () => Promise<string | null> | string | null): Promise<void>;
	/** A RED that is not a row (a pass or the setup could not run). */
	fail(label: string, error: unknown): void;
	readonly red: number;
}

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

export function createRowBook(
	print: (line: string) => void = (line) => console.log(line),
): RowBook {
	let red = 0;
	return {
		async row(label, check) {
			let problem: string | null;
			try {
				problem = await check();
			} catch (error) {
				problem = `threw: ${messageOf(error)}`;
			}
			if (problem !== null) red++;
			print(`${problem === null ? 'ok  ' : 'RED '} ${label}${problem ? ` (${problem})` : ''}`);
		},
		fail(label, error) {
			red++;
			print(`RED  ${label}: ${messageOf(error)}`);
		},
		get red() {
			return red;
		},
	};
}

export const problems = (list: (string | null | false)[]): string | null => {
	const found = list.filter((p): p is string => typeof p === 'string');
	return found.length === 0 ? null : found.join('; ');
};

/** A refused TLS handshake: the fetch must THROW, never answer. */
export async function refused(request: Promise<Response>): Promise<string | null> {
	try {
		const res = await request;
		return `answered ${res.status}`;
	} catch {
		return null;
	}
}

export async function eventually(
	probe: () => Promise<number>,
	want: number,
	ms = 5000,
): Promise<string | null> {
	const deadline = Date.now() + ms;
	let last = -1;
	while (Date.now() < deadline) {
		try {
			last = await probe();
			if (last === want) return null;
		} catch {
			last = -1;
		}
		await Bun.sleep(100);
	}
	return `status ${last}, expected ${want} within ${ms} ms`;
}

// ── the stand-in log ─────────────────────────────────────────────────────────

export function logLines(scene: Scene): string[] {
	return existsSync(scene.log) ? readFileSync(scene.log, 'utf8').split('\n').filter(Boolean) : [];
}

/** A wanted line is exact text, or a RegExp for a line carrying a run-time value (the scratch port). */
export function callsSince(scene: Scene, since: number, want: (string | RegExp)[]): string | null {
	const got = logLines(scene).slice(since);
	const same =
		got.length === want.length &&
		want.every((w, i) => (typeof w === 'string' ? got[i] === w : w.test(got[i] as string)));
	if (same) return null;
	const hint =
		got.length === 0 && want.length > 0
			? ` — no stand-in was called: does src/exec.ts still spawn ${SUDO} / ${SYSTEMCTL}, and is the seam armed?`
			: '';
	return `stand-in calls ${JSON.stringify(got)}, expected ${JSON.stringify(want.map(String))}${hint}`;
}

export const configtestCall = (server: Server) => `${SUDO} -n ${WEB_CONFIGTEST_BINARY[server]} -t`;
export const reloadCall = (server: Server) => `${SYSTEMCTL} reload ${WEB_UNIT[server]}`;
export const restartCall = `${SYSTEMCTL} restart ${V2_UNIT}`;
const reEscape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `systemctl start|stop <V2_UNIT>-scratch@<port>.service` — the polkit rule's 4-5 digit port. */
export const scratchCall = (verb: 'start' | 'stop') =>
	new RegExp(
		`^${reEscape(`${SYSTEMCTL} ${verb} ${V2_UNIT}${V2_SCRATCH_TEMPLATE_SUFFIX}`)}[1-9][0-9]{3,4}\\.service$`,
	);
/** A scratch boot of releases/<id>: the template unit started from it, then stopped. */
export const scratchCalls = (dir: string): (string | RegExp)[] => [
	scratchCall('start'),
	`scratch started in ${dir}`,
	scratchCall('stop'),
];

/**
 * Every line the closed exec set may log (the [exec] rows): the fixed calls + the run-time ones.
 * `releases: false` — a pass that installs no release — closes the set further: no scratch
 * boot, no v2 start/restart may appear.
 */
export function inClosedSet(
	scene: Pick<Scene, 'server'>,
	line: string,
	{ releases = true }: { releases?: boolean } = {},
): boolean {
	if (line === configtestCall(scene.server) || line === reloadCall(scene.server)) return true;
	return (
		releases &&
		(line === restartCall ||
			line.startsWith('v2 started in ') ||
			line.startsWith('scratch started in ') ||
			scratchCall('start').test(line) ||
			scratchCall('stop').test(line))
	);
}

// ── the agent ────────────────────────────────────────────────────────────────

function tlsOptions(m: TlsMaterial, client: 'good' | 'rogue' | 'none', serverCa: 'good' | 'rogue') {
	const read = (path: string) => readFileSync(path, 'utf8');
	const pair = client === 'good' ? m.client : client === 'rogue' ? m.rogueClient : null;
	return {
		ca: read(serverCa === 'good' ? m.ca.cert : m.rogueCa.cert),
		...(pair === null ? {} : { cert: read(pair.cert), key: read(pair.key) }),
	};
}

export interface AgentFetchInit extends BunFetchRequestInit {
	client?: 'good' | 'rogue' | 'none';
	serverCa?: 'good' | 'rogue';
	/** null: no Authorization header at all. Default: the scene's token. */
	bearer?: string | null;
}

/** The test client's own dial (never the engine's door): mTLS or the unix socket. */
export function agentFetch(
	scene: Scene,
	path: string,
	init: AgentFetchInit = {},
): Promise<Response> {
	const { client = 'good', serverCa = 'good', bearer = scene.token, headers, ...rest } = init;
	const merged = {
		...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
		...(headers as Record<string, string> | undefined),
	};
	if (scene.listen === 'unix')
		return fetch(`http://localhost${path}`, { ...rest, headers: merged, unix: scene.agentSocket });
	return fetch(`https://127.0.0.1:${scene.agentPort}${path}`, {
		...rest,
		headers: merged,
		tls: tlsOptions(scene.shared.tls, client, serverCa),
	});
}

export async function agentStatus(scene: Scene): Promise<StatusBody> {
	const res = await agentFetch(scene, WIRE.status);
	if (res.status !== 200) throw new Error(`GET /v1/status answered ${res.status}`);
	return (await res.json()) as StatusBody;
}

export function writeAgentEnv(
	scene: Scene,
	name: string,
	overrides: Readonly<Record<string, string | number>> = {},
): string {
	const { tls } = scene.shared;
	const listen: Record<string, string | number> =
		scene.listen === 'tls'
			? {
					LISTEN_KIND: 'tls',
					TLS_HOST: '127.0.0.1',
					TLS_PORT: scene.agentPort,
					TLS_CERT_FILE: tls.server.cert,
					TLS_KEY_FILE: tls.server.key,
					TLS_CLIENT_CA_FILE: tls.ca.cert,
				}
			: { LISTEN_KIND: 'unix', SOCKET_PATH: scene.agentSocket };
	const path = join(scene.dir, name);
	writeFileSync(
		path,
		renderEnvFile({
			[WIRE.instanceKey]: INSTANCE,
			// Stated here, never ambient (the phase-2 drill's header: why not production).
			NODE_ENV: 'test',
			...listen,
			STATE_ROOT: scene.state,
			WEB_SERVER: scene.server,
			WEB_UNIT: WEB_UNIT[scene.server],
			MEDIA_MODE: 'shared',
			MEDIA_ROOT: scene.media,
			PHP_BIN: join(scene.shims, 'php'),
			V2_UNIT,
			V2_HEALTH_URL: `http://127.0.0.1:${scene.v2Port}${V2_BASE_PATH}/health`,
			RELEASES_RETAINED: 3,
			MAX_BUNDLE_BYTES,
			MAX_BUNDLE_ENTRIES,
			...overrides,
		}),
		{ mode: 0o640 },
	);
	return path;
}

/**
 * The agent, as systemd would start it: the env file NAMED, the token from
 * $CREDENTIALS_DIRECTORY, and an environment of nothing else but PATH and HOME — no ambient
 * key can reach its config (and exec.ts hands its children its own fixed PATH anyway).
 */
export function spawnAgent(
	scene: Scene,
	envFile: string,
	logName: string,
): ReturnType<typeof Bun.spawn> {
	const fd = openSync(join(scene.dir, logName), 'a');
	return Bun.spawn([process.execPath, 'run', join(AGENT_DIR, 'src', 'index.ts')], {
		cwd: AGENT_DIR,
		env: {
			PATH: process.env.PATH ?? '/usr/bin:/bin',
			HOME: process.env.HOME ?? scene.dir,
			[WIRE.envFileVar]: envFile,
			CREDENTIALS_DIRECTORY: scene.credentials,
		},
		stdout: fd,
		stderr: fd,
	});
}

export function tail(path: string, lines = 30): string {
	return existsSync(path)
		? readFileSync(path, 'utf8').split('\n').slice(-lines).join('\n')
		: '(no log)';
}

export async function waitAgent(scene: Scene): Promise<void> {
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		if (scene.agent?.exitCode !== null && scene.agent?.exitCode !== undefined)
			throw new Error(
				`the agent exited ${scene.agent.exitCode} at boot:\n${tail(join(scene.dir, 'agent.log'))}`,
			);
		try {
			const res = await agentFetch(scene, WIRE.health, { bearer: null });
			if (res.status === 200) return;
		} catch {
			// not listening yet
		}
		await Bun.sleep(150);
	}
	throw new Error(
		`the agent never answered /health in 20 s:\n${tail(join(scene.dir, 'agent.log'))}`,
	);
}

/**
 * Re-provision the agent with a new SERVICE_TOKEN (what a re-run of the provisioner does):
 * stop it, replace the credential, boot it again from the same `agent.env`.
 */
export async function restartAgent(scene: Scene, token: string): Promise<void> {
	if (scene.agent !== null) {
		scene.agent.kill('SIGTERM');
		await scene.agent.exited;
	}
	writeFileSync(join(scene.credentials, 'SERVICE_TOKEN'), token, { mode: 0o600 });
	scene.token = token;
	scene.agent = spawnAgent(scene, join(scene.dir, 'agent.env'), 'agent.log');
	await waitAgent(scene);
}

// ── the scene ────────────────────────────────────────────────────────────────

function plantFiles(root: string, files: Readonly<Record<string, string>>): void {
	for (const [rel, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), content);
	}
}

/**
 * The state root the provisioner would lay out (phase-2 Task 8): the instance marker naming
 * this instance, and the per-API `shared/` that holds state outside every release (§3).
 */
function plantStateRoot(state: string): void {
	for (const sub of ['rules', 'audit', 'publication_api/v1/shared', 'publication_api/v2/shared'])
		mkdirSync(join(state, sub), { recursive: true, mode: 0o750 });
	writeFileSync(join(state, '.dedalo_host_agent_instance'), `${INSTANCE}\n`);
}

/** Remove the drill's stand-ins from the seam: the dispatchers fail closed again. */
export function disarmSeam(): void {
	for (const name of ['sudo', 'systemctl']) rmSync(join(EXEC_SEAM_DIR, name), { force: true });
}

export async function setupScene(
	server: Server,
	shared: Shared,
	options: SceneOptions,
): Promise<Scene> {
	const dir = join(shared.root, server);
	const agentSocket = join(dir, 'agent.sock');
	if (options.listen === 'unix' && Buffer.byteLength(agentSocket) > SOCKET_PATH_MAX_BYTES)
		throw new Error(
			`the agent socket path is ${Buffer.byteLength(agentSocket)} bytes (sun_path allows ${SOCKET_PATH_MAX_BYTES}): run with a short TMPDIR, e.g. TMPDIR=/tmp/dd`,
		);
	const scene: Scene = {
		server,
		listen: options.listen,
		dir,
		state: join(dir, 'state'),
		media: join(dir, 'media'),
		shims: join(dir, 'bin'),
		log: join(dir, 'stand_in_calls.log'),
		include: join(dir, 'state', 'rules', `dedalo_media_publication.${server}.conf`),
		credentials: join(dir, 'credentials'),
		v2Pid: join(dir, 'v2.pid'),
		token: randomBytes(24).toString('hex'),
		agentPort: options.listen === 'tls' ? freePort() : 0,
		agentSocket,
		webPort: freePort(),
		v2Port: freePort(),
		shared,
		web: null,
		agent: null,
	};
	for (const sub of ['www', 'nginx_tmp']) mkdirSync(join(dir, sub), { recursive: true });
	plantFiles(scene.media, MEDIA_FILES);
	plantStateRoot(scene.state);
	const v2Env = join(scene.state, 'publication_api', 'v2', 'shared', 'v2.env');
	writeFileSync(
		v2Env,
		renderEnvFile({
			NODE_ENV: 'production',
			DEPLOYMENT_MODE: 'standalone',
			TRUST_PROXY: 'false',
			HOST: '127.0.0.1',
			PORT: scene.v2Port,
			BASE_PATH: V2_BASE_PATH,
			DB_SOCKET: shared.mariadbSocket,
			DB_HOST: '',
			DB_USER: shared.mariadbUser,
			DB_PASSWORD: shared.mariadbPassword,
			DB_NAMES: shared.database,
			API_KEYS: '',
			MCP_ENABLED: 'false',
			LOG_LEVEL: 'warn',
		}),
	);
	mkdirSync(scene.credentials, { mode: 0o700 });
	writeFileSync(join(scene.credentials, 'SERVICE_TOKEN'), scene.token, { mode: 0o600 });

	const webBinary = server === 'apache' ? apacheBinary() : (Bun.which('nginx') as string);
	const main = join(dir, `main.${server}.conf`);
	const errorLog = join(dir, 'nginx_error.log');
	const { sudo, systemctl, php } = renderStandIns({
		server,
		webBinary,
		webMain: main,
		webDir: dir,
		webErrorLog: errorLog,
		webUnit: WEB_UNIT[server],
		v2Unit: V2_UNIT,
		v2Current: join(scene.state, 'publication_api', 'v2', 'current'),
		v2Scratch: join(scene.state, 'publication_api', 'v2', 'scratch'),
		v2EnvFile: v2Env,
		v2PidFile: scene.v2Pid,
		v2Output: join(dir, 'v2.log'),
		bun: process.execPath,
		log: scene.log,
	});
	// sudo + systemctl AT the agent's absolute binaries (the image's dispatchers run these);
	// php is configuration (PHP_BIN), so a plain scratch file.
	writeStandIns(EXEC_SEAM_DIR, { sudo, systemctl });
	writeStandIns(scene.shims, { php });

	if (server === 'apache') {
		writeFileSync(
			main,
			apacheMainConf(dir, scene.webPort, scene.include, true, { optionalInclude: true }),
		);
		const t = sh([webBinary, '-t', '-f', main]);
		if (t.code !== 0) throw new Error(`${webBinary} -t failed before any include:\n${t.out}`);
		scene.web = Bun.spawn([webBinary, '-DFOREGROUND', '-f', main], {
			stdout: 'ignore',
			stderr: 'pipe',
		});
	} else {
		const map = join(dir, 'map.nginx.conf');
		writeFileSync(map, options.nginxMap);
		writeFileSync(
			main,
			nginxMainConf(dir, scene.webPort, scene.include, map, { optionalInclude: true }),
		);
		const t = sh([webBinary, '-e', errorLog, '-t', '-p', dir, '-c', main]);
		if (t.code !== 0) throw new Error(`nginx -t failed before any include:\n${t.out}`);
		scene.web = Bun.spawn([webBinary, '-e', errorLog, '-p', dir, '-c', main], {
			stdout: 'ignore',
			stderr: 'pipe',
		});
	}
	await waitUp(`http://127.0.0.1:${scene.webPort}`);
	return scene;
}

export async function teardown(scene: Scene): Promise<void> {
	if (scene.agent !== null) {
		try {
			scene.agent.kill('SIGCONT'); // a frozen agent handles no SIGTERM
			scene.agent.kill('SIGTERM');
		} catch {
			// already gone
		}
		await scene.agent.exited;
	}
	const pids = existsSync(dirname(scene.v2Pid))
		? readdirSync(dirname(scene.v2Pid))
				.filter(
					(name) =>
						name === basename(scene.v2Pid) || name.startsWith(`${basename(scene.v2Pid)}.scratch-`),
				)
				.map((name) => join(dirname(scene.v2Pid), name))
		: [];
	for (const file of pids) {
		try {
			process.kill(Number(readFileSync(file, 'utf8').trim()), 'SIGTERM');
		} catch {
			// already gone
		}
	}
	scene.web?.kill('SIGTERM');
	await scene.web?.exited;
}

// ── the bundles ──────────────────────────────────────────────────────────────

/**
 * v2's tracked sources (src/ + the package files) copied into scratch, its PRODUCTION tree
 * installed there with the pinned bun and the HOISTED linker (D6: the bundle carries
 * node_modules; the isolated linker's symlinks cannot travel in it), and three bundles:
 * r1 and r2 (the same tree, told apart by a DRILL_RELEASE file, so two digests) and `bad`
 * — the SAME full tree (node_modules included, so it passes the agent's node_modules check
 * and really reaches the scratch boot) with an entrypoint that throws at import: its
 * scratch health can never pass.
 */
export function buildBundles(root: string): Shared['bundles'] {
	const src = join(root, 'v2_src');
	const prefix = 'publication/server_api/v2/';
	const listed = Bun.spawnSync(['git', 'ls-files', '-z', '--', prefix], {
		cwd: REPO,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	if (listed.exitCode !== 0) throw new Error(`git ls-files failed: ${listed.stderr.toString()}`);
	const keep = /^(src\/|package\.json$|bun\.lock$|bunfig\.toml$|tsconfig\.json$)/;
	for (const file of listed.stdout.toString().split('\0').filter(Boolean)) {
		const rel = file.slice(prefix.length);
		if (!keep.test(rel)) continue;
		mkdirSync(dirname(join(src, rel)), { recursive: true });
		copyFileSync(join(REPO, file), join(src, rel));
	}
	const install = Bun.spawnSync(
		[process.execPath, 'install', '--frozen-lockfile', '--production', '--linker', 'hoisted'],
		{ cwd: src, stdout: 'pipe', stderr: 'pipe' },
	);
	if (install.exitCode !== 0)
		throw new Error(
			`bun install of the v2 bundle tree failed (network?):\n${install.stderr.toString()}`,
		);
	const tree = collectTree(src);
	const version = (
		JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')) as { version: string }
	).version;
	const text = (value: string) => new TextEncoder().encode(value);
	const marker = (name: string): BundleSourceEntry => ({
		path: 'DRILL_RELEASE',
		type: 'file',
		mode: 0o644,
		data: text(`${name}\n`),
	});
	const make = (entries: BundleSourceEntry[]): Bundle => {
		const bytes = writeUstarGz(entries);
		return {
			id: releaseIdFor(version, bytes),
			sha256: sha256Hex(bytes),
			bytes,
			entries: entries.length,
			unpacked: entries.reduce((sum, e) => sum + (e.data?.length ?? 0), 0),
		};
	};
	const broken = text("throw new Error('drill: a deliberately broken release');\n");
	return {
		r1: make([...tree, marker('r1')]),
		r2: make([...tree, marker('r2')]),
		bad: make(
			[...tree, marker('bad')].map((e) => (e.path === 'src/index.ts' ? { ...e, data: broken } : e)),
		),
	};
}

/** POST /v1/releases/v2: the raw gzip body + id, sha and the one actor header. */
export function postRelease(scene: Scene, bundle: Bundle): Promise<Response> {
	return agentFetch(scene, WIRE.install, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/gzip',
			[WIRE.releaseIdHeader]: bundle.id,
			[WIRE.sha256Header]: bundle.sha256,
			[WIRE.actorHeader]: ACTOR,
		},
		body: bundle.bytes,
	});
}

export async function v2Health(
	scene: Scene,
): Promise<{ status: number; body: { databases?: Record<string, string> } }> {
	const res = await fetch(`http://127.0.0.1:${scene.v2Port}${V2_BASE_PATH}/health`);
	return { status: res.status, body: (await res.json()) as { databases?: Record<string, string> } };
}

/** releases/<id> as `pwd -P` prints it; the parent is resolved, so a release a failed install removed still names. */
export const releaseDir = (scene: Scene, id: string): string =>
	join(realpathSync(join(scene.state, 'publication_api', 'v2', 'releases')), id);

/** The binaries PATH lacks (asked, not spawned: no ENOENT stack). MariaDB names its own. */
export function missingBinaries(servers: readonly Server[]): string[] {
	const common = ['openssl', 'git', 'bash'].filter((bin) => Bun.which(bin) === null);
	const web = servers.flatMap((s) =>
		(s === 'apache' ? ['apxs'] : ['nginx'])
			.filter((bin) => Bun.which(bin) === null)
			.map((bin) => `${s}: ${bin}`),
	);
	return [...common, ...web];
}
