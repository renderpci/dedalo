#!/usr/bin/env bun
/**
 * PUBLICATION-HOST AGENT DRILL — the agent (publication/host_agent,
 * engineering/PUBLICATION_HOST_SPEC.md §2/§3/§6) end to end, on REAL processes:
 *
 *   transport  openssl-issued private CA; the agent boots LISTEN_KIND=tls on 127.0.0.1 and
 *              refuses: no client cert, a rogue-CA client cert, a client that pins another
 *              server CA; a missing client CA refuses to BOOT (Review Focus 1), and so does
 *              NODE_ENV=production on a state root whose audit trail is not root's and
 *              append-only. /health carries the engine's pairing fingerprint and never the
 *              instance name.
 *   rules      the publication-host include rendered by the ENGINE's builders →
 *              POST /v1/rules/apply → configtest → reload of a live user-mode Apache and
 *              nginx → a published file 200 / an unpublished one 404 THROUGH the server;
 *              a stamped include that passes the agent's directive allowlist but FAILS
 *              configtest leaves the previous one serving and never reloads (Review Focus 4).
 *   releases   REAL Publication API v2 bundles built from publication/server_api/v2 (its
 *              production node_modules installed into scratch: network) → install →
 *              scratch boot → promote → restart → health, over the suite MariaDB; a
 *              second release; one whose scratch boot fails leaves the old release serving
 *              (Review Focus 3); rollback; a re-install of a known id only re-points
 *              `current` (D9).
 *
 * THE EXEC SEAM — STAND-INS AT THE AGENT'S ABSOLUTE BINARIES, INSIDE THE CI IMAGE.
 * The agent's publication/host_agent/src/exec.ts is a closed set of named commands, and its argv[0] is ABSOLUTE:
 * `SUDO -n WEB_CONFIGTEST_BINARY[server] -t`, `SYSTEMCTL reload <WEB_UNIT>`, `SYSTEMCTL
 * restart <V2_UNIT>`, `SYSTEMCTL start|stop <V2_UNIT>-scratch@<port>.service` (the release
 * under test runs in the v2 user's template unit, never as the agent), `<PHP_BIN> -l`, every child with the
 * fixed CHILD_PATH (plan Task 1 DEVIATION 7: no ambient input chooses which binary runs as
 * the agent). So the only seam that runs exec.ts UNMODIFIED is a stand-in AT /usr/bin/sudo
 * and /usr/bin/systemctl — which needs a machine the drill may rewrite. That is the CI
 * image (ci/Dockerfile, "exec seam"): both paths are dispatchers that run the stand-in
 * this drill writes into EXEC_SEAM_DIR, the real sudo is diverted (and its setuid bit
 * stripped), and the image is disposable. Anywhere else (a developer's macOS or Linux
 * host, where /usr/bin/sudo is the real thing) the drill is RED and says where to run it;
 * it never touches a real sudo or systemctl. The stand-ins accept exactly exec.ts's argv,
 * spelled by exec.ts's OWN constants, log every call, and the drill asserts the EXACT
 * call sequence per action. PHP_BIN is configuration, so its refusing stand-in is a plain
 * scratch file. Rejected:
 *   - stand-ins first on the agent's PATH: exec.ts never consults PATH (absolute binaries,
 *     constant CHILD_PATH), and making it do so would let an ambient input pick the binary;
 *   - `setExecForTests`: an injected Exec would skip the argv construction this drill
 *     exists to prove;
 *   - a private mount namespace (unshare + bind mounts): Docker's default seccomp profile
 *     refuses the mount-namespace unshare inside the job container, so it could not run on
 *     the tier it is for.
 *
 * NODE_ENV=test, STATED BY THE ENV FILE (never ambient — the agent's config law). Under
 * NODE_ENV=production the boot preflight demands a ROOT-owned audit/ and a chattr +a trail
 * (src/instance/roots.ts 'enforce'); the job's bare uid 1001 can produce neither, and
 * Docker's default capability set has no CAP_LINUX_IMMUTABLE. So the agent this drill
 * drives runs with the 'suite' audit protection and unscrubbed 5xx detail — the only two
 * runtime differences (the test-only seams it would also admit are never called by the
 * process entry). The production door is still exercised: one row boots NODE_ENV=production
 * on this unprovisioned tree and asserts it REFUSES at the audit preflight.
 *
 * Needs: openssl, git, bash, Apache 2.4 + apxs, nginx, MariaDB (mariadbd,
 * mariadb-install-db, mariadb — the suite MariaDB lane), publication/host_agent's
 * node_modules, network for the bundle's `bun install`, and the CI image's exec seam. A
 * missing one is RED, never a skip. Wired: scripts/ci/instance_tier.sh
 * (`bun run test:pubhost:agent`); locally: `bun run ci:local --docker --instance`.
 */

import { randomBytes } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
	SUDO,
	SYSTEMCTL,
	V2_SCRATCH_TEMPLATE_SUFFIX,
	WEB_CONFIGTEST_BINARY,
} from '../publication/host_agent/src/exec.ts';
import { buildNginxMap } from '../src/core/media/protection.ts';
import {
	buildPublicationHostApacheConf,
	buildPublicationHostNginxConf,
	getPublicationHostConfigHash,
	normalizePublicationHostInput,
	publicationHostMediaUrl,
} from '../src/core/media/publication_host_rules.ts';
import {
	publicationHostFingerprint,
	publicationHostFingerprintMatches,
} from '../src/core/publication_host/pairing.ts';
import {
	ensureSuiteMariadb,
	stopSuiteMariadb,
	suiteMariadbStatus,
} from '../test/helpers/suite_mariadb.ts';
import { SUITE_MARIADB_PASSWORD, SUITE_MARIADB_USER } from '../test/helpers/suite_mariadb_env.ts';
import { zzdTargetDatabases } from '../test/helpers/zzd_diffusion_fixture.ts';
import {
	AGENT_ACTOR_HEADER,
	type BundleSourceEntry,
	collectTree,
	EXEC_SEAM_DIR,
	execSeamProblem,
	issueTlsMaterial,
	releaseIdFor,
	renderEnvFile,
	renderStandIns,
	sha256Hex,
	type TlsMaterial,
	writeStandIns,
	writeUstarGz,
} from './lib/publication_host_agent_drill_kit.ts';
import {
	apacheBinary,
	apacheMainConf,
	freePort,
	nginxMainConf,
	sh,
	waitUp,
} from './lib/web_server_harness.ts';

type Server = 'apache' | 'nginx';

const REPO = join(import.meta.dir, '..');
const AGENT_DIR = join(REPO, 'publication', 'host_agent');
const INSTANCE = 'pubdrill';
const ACTOR = 'drill';
const WEB_UNIT: Record<Server, string> = { apache: 'apache2', nginx: 'nginx' };
const V2_UNIT = 'dedalo-publication-api-v2';
const V2_BASE_PATH = '/publication/server_api/v2';
const QUALITIES = ['image/thumb'];
const PUBLISHED = 'image/thumb/0/test94_test3_1.jpg';
const UNPUBLISHED = 'image/thumb/0/test94_test3_2.jpg';
const MEDIA_FILES: Record<string, string> = {
	[PUBLISHED]: 'JPEG-published',
	[UNPUBLISHED]: 'JPEG-unpublished',
	'.publication/pub/test3_1': '',
};
/** The agent's defaults (AgentConfig): the bundle must fit what a host runs with. */
const MAX_BUNDLE_BYTES = 268_435_456;
const MAX_BUNDLE_ENTRIES = 200_000;

/**
 * THE WIRE THIS DRILL SPEAKS — the agent's routes (router.ts BASE_PATH
 * /publication/host_agent), the config selectors, and the request shapes of rules.apply
 * (Task 5) and release.install/rollback (Task 7), each spelled as the code that READS it
 * spells it, in ONE place:
 *   - env file selected by DEDALO_HOST_AGENT_ENV_FILE; instance key INSTANCE
 *     (config.ts ENV_FILE_VAR / KNOWN_KEYS);
 *   - every mutation carries the actor in auth.ts's ACTOR_HEADER (requireActor; the kit's
 *     AGENT_ACTOR_HEADER, pinned to it — auth.ts itself loads the agent's config);
 *     rules.apply's body is {server, text, hash}; release ids and shas ride
 *     X-Release-Id / X-Bundle-Sha256; rollback has NO body.
 */
const BASE = '/publication/host_agent';
const WIRE = {
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

interface Bundle {
	readonly id: string;
	readonly sha256: string;
	readonly bytes: Uint8Array<ArrayBuffer>;
	readonly entries: number;
	readonly unpacked: number;
}

interface Shared {
	readonly root: string;
	readonly tls: TlsMaterial;
	readonly bundles: { r1: Bundle; r2: Bundle; bad: Bundle };
	readonly mariadbSocket: string;
	readonly database: string;
}

interface Scene {
	readonly server: Server;
	readonly dir: string;
	readonly state: string;
	readonly media: string;
	readonly shims: string;
	readonly log: string;
	readonly include: string;
	readonly credentials: string;
	readonly v2Pid: string;
	readonly token: string;
	readonly agentPort: number;
	readonly webPort: number;
	readonly v2Port: number;
	readonly shared: Shared;
	web: ReturnType<typeof Bun.spawn> | null;
	agent: ReturnType<typeof Bun.spawn> | null;
}

/** GET /v1/status, structurally (the agent's AgentStatus): only what the rows read. */
interface StatusBody {
	instance_fingerprint?: unknown;
	apis?: { v2?: { current?: string | null; previous?: string | null } };
	rules?: { server?: string; hash?: string | null };
	media?: { present?: boolean; pub_markers?: number | null };
}

// ── rows ─────────────────────────────────────────────────────────────────────

let red = 0;

async function row(
	label: string,
	check: () => Promise<string | null> | string | null,
): Promise<void> {
	let problem: string | null;
	try {
		problem = await check();
	} catch (error) {
		problem = `threw: ${error instanceof Error ? error.message : String(error)}`;
	}
	if (problem !== null) red++;
	console.log(`${problem === null ? 'ok  ' : 'RED '} ${label}${problem ? ` (${problem})` : ''}`);
}

const problems = (list: (string | null | false)[]): string | null => {
	const found = list.filter((p): p is string => typeof p === 'string');
	return found.length === 0 ? null : found.join('; ');
};

/** A refused TLS handshake: the fetch must THROW, never answer. */
async function refused(request: Promise<Response>): Promise<string | null> {
	try {
		const res = await request;
		return `answered ${res.status}`;
	} catch {
		return null;
	}
}

async function eventually(
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

function logLines(scene: Scene): string[] {
	return existsSync(scene.log) ? readFileSync(scene.log, 'utf8').split('\n').filter(Boolean) : [];
}

/** A wanted line is exact text, or a RegExp for a line carrying a run-time value (the scratch port). */
function callsSince(scene: Scene, since: number, want: (string | RegExp)[]): string | null {
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

const configtestCall = (server: Server) => `${SUDO} -n ${WEB_CONFIGTEST_BINARY[server]} -t`;
const reloadCall = (server: Server) => `${SYSTEMCTL} reload ${WEB_UNIT[server]}`;
const restartCall = `${SYSTEMCTL} restart ${V2_UNIT}`;
const reEscape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `systemctl start|stop <V2_UNIT>-scratch@<port>.service` — the polkit rule's 4-5 digit port. */
const scratchCall = (verb: 'start' | 'stop') =>
	new RegExp(
		`^${reEscape(`${SYSTEMCTL} ${verb} ${V2_UNIT}${V2_SCRATCH_TEMPLATE_SUFFIX}`)}[1-9][0-9]{3,4}\\.service$`,
	);
/** A scratch boot of releases/<id>: the template unit started from it, then stopped. */
const scratchCalls = (dir: string): (string | RegExp)[] => [
	scratchCall('start'),
	`scratch started in ${dir}`,
	scratchCall('stop'),
];

// ── the agent ────────────────────────────────────────────────────────────────

function tlsOptions(m: TlsMaterial, client: 'good' | 'rogue' | 'none', serverCa: 'good' | 'rogue') {
	const read = (path: string) => readFileSync(path, 'utf8');
	const pair = client === 'good' ? m.client : client === 'rogue' ? m.rogueClient : null;
	return {
		ca: read(serverCa === 'good' ? m.ca.cert : m.rogueCa.cert),
		...(pair === null ? {} : { cert: read(pair.cert), key: read(pair.key) }),
	};
}

interface AgentRequest extends BunFetchRequestInit {
	client?: 'good' | 'rogue' | 'none';
	serverCa?: 'good' | 'rogue';
	/** null: no Authorization header at all. Default: the scene's token. */
	bearer?: string | null;
}

function agentFetch(scene: Scene, path: string, init: AgentRequest = {}): Promise<Response> {
	const { client = 'good', serverCa = 'good', bearer = scene.token, headers, ...rest } = init;
	return fetch(`https://127.0.0.1:${scene.agentPort}${path}`, {
		...rest,
		headers: {
			...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
			...(headers as Record<string, string> | undefined),
		},
		tls: tlsOptions(scene.shared.tls, client, serverCa),
	});
}

async function agentStatus(scene: Scene): Promise<StatusBody> {
	const res = await agentFetch(scene, WIRE.status);
	if (res.status !== 200) throw new Error(`GET /v1/status answered ${res.status}`);
	return (await res.json()) as StatusBody;
}

function writeAgentEnv(scene: Scene, name: string, overrides: Record<string, string> = {}): string {
	const { tls } = scene.shared;
	const path = join(scene.dir, name);
	writeFileSync(
		path,
		renderEnvFile({
			[WIRE.instanceKey]: INSTANCE,
			// Stated here, never ambient (the header: why not production).
			NODE_ENV: 'test',
			LISTEN_KIND: 'tls',
			TLS_HOST: '127.0.0.1',
			TLS_PORT: scene.agentPort,
			TLS_CERT_FILE: tls.server.cert,
			TLS_KEY_FILE: tls.server.key,
			TLS_CLIENT_CA_FILE: tls.ca.cert,
			STATE_ROOT: scene.state,
			WEB_SERVER: scene.server,
			WEB_UNIT: WEB_UNIT[scene.server],
			MEDIA_MODE: 'shared',
			MEDIA_ROOT: scene.media,
			PHP_BIN: join(scene.shims, 'php'),
			BUN_BIN: process.execPath,
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
function spawnAgent(scene: Scene, envFile: string, logName: string): ReturnType<typeof Bun.spawn> {
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

function tail(path: string, lines = 30): string {
	return existsSync(path)
		? readFileSync(path, 'utf8').split('\n').slice(-lines).join('\n')
		: '(no log)';
}

async function waitAgent(scene: Scene): Promise<void> {
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

/** Boot an agent that must REFUSE: its exit code (null = still running after 15 s) and log. */
async function bootRefusal(
	scene: Scene,
	envFile: string,
	logName: string,
): Promise<{ code: number | null; log: string }> {
	const proc = spawnAgent(scene, envFile, logName);
	const code = await Promise.race([proc.exited, Bun.sleep(15_000).then(() => null)]);
	if (code === null) {
		proc.kill('SIGKILL');
		await proc.exited;
	}
	return { code, log: tail(join(scene.dir, logName)) };
}

// ── the scene ────────────────────────────────────────────────────────────────

function plantFiles(root: string, files: Record<string, string>): void {
	for (const [rel, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), content);
	}
}

/**
 * The state root the provisioner would lay out (Task 8): the instance marker naming this
 * instance, and the per-API `shared/` that holds state outside every release (§3).
 */
function plantStateRoot(state: string): void {
	for (const sub of ['rules', 'audit', 'publication_api/v1/shared', 'publication_api/v2/shared'])
		mkdirSync(join(state, sub), { recursive: true, mode: 0o750 });
	writeFileSync(join(state, '.dedalo_host_agent_instance'), `${INSTANCE}\n`);
}

/** Remove the drill's stand-ins from the seam: the dispatchers fail closed again. */
function disarmSeam(): void {
	for (const name of ['sudo', 'systemctl']) rmSync(join(EXEC_SEAM_DIR, name), { force: true });
}

async function setupScene(server: Server, shared: Shared): Promise<Scene> {
	const dir = join(shared.root, server);
	const scene: Scene = {
		server,
		dir,
		state: join(dir, 'state'),
		media: join(dir, 'media'),
		shims: join(dir, 'bin'),
		log: join(dir, 'stand_in_calls.log'),
		include: join(dir, 'state', 'rules', `dedalo_media_publication.${server}.conf`),
		credentials: join(dir, 'credentials'),
		v2Pid: join(dir, 'v2.pid'),
		token: randomBytes(24).toString('hex'),
		agentPort: freePort(),
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
			DB_USER: SUITE_MARIADB_USER,
			DB_PASSWORD: SUITE_MARIADB_PASSWORD,
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
		writeFileSync(map, buildNginxMap());
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

async function teardown(scene: Scene): Promise<void> {
	scene.agent?.kill('SIGTERM');
	await scene.agent?.exited;
	const pids = readdirSync(dirname(scene.v2Pid))
		.filter(
			(name) =>
				name === basename(scene.v2Pid) || name.startsWith(`${basename(scene.v2Pid)}.scratch-`),
		)
		.map((name) => join(dirname(scene.v2Pid), name));
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
 * scratch health can never pass, which is Review Focus 3's first leg.
 */
function buildBundles(root: string): Shared['bundles'] {
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

// ── the rows ─────────────────────────────────────────────────────────────────

async function refusalRows(scene: Scene): Promise<void> {
	await row(
		'[transport] client CA file missing → the agent refuses to BOOT, nothing listens',
		async () => {
			const envFile = writeAgentEnv(scene, 'agent_no_client_ca.env', {
				TLS_CLIENT_CA_FILE: join(scene.dir, 'absent_client_ca.pem'),
			});
			const { code, log } = await bootRefusal(scene, envFile, 'agent_refusal.log');
			if (code === null) return 'still running after 15 s';
			if (code === 0) return 'exited 0';
			// Refused FOR THAT REASON: any other boot failure (a typo'd key) would pass this row
			// while proving nothing about the client CA.
			return problems([
				!log.includes('TLS_CLIENT_CA_FILE') &&
					`the refusal does not name TLS_CLIENT_CA_FILE:\n${log}`,
				await refused(agentFetch(scene, WIRE.health, { bearer: null })),
			]);
		},
	);
	await row(
		'[transport] NODE_ENV=production on an unprovisioned state root (agent-owned audit/, no chattr +a) → refuses to BOOT at the audit preflight',
		async () => {
			const envFile = writeAgentEnv(scene, 'agent_production.env', { NODE_ENV: 'production' });
			const { code, log } = await bootRefusal(scene, envFile, 'agent_production.log');
			if (code === null) return 'still running after 15 s';
			if (code === 0) return 'exited 0';
			return problems([
				!log.includes('[preflight] assertAuditTrail') &&
					`the refusal is not the audit preflight's:\n${log}`,
				await refused(agentFetch(scene, WIRE.health, { bearer: null })),
			]);
		},
	);
}

async function transportRows(scene: Scene): Promise<void> {
	const s = `[${scene.server}][transport]`;
	const expected = publicationHostFingerprint(INSTANCE, scene.token);
	await row(
		`${s} GET /health → 200, the engine's fingerprint, never the instance name`,
		async () => {
			const res = await agentFetch(scene, WIRE.health, { bearer: null });
			const text = await res.text();
			if (res.status !== 200) return `status ${res.status}`;
			const published = (JSON.parse(text) as { instance_fingerprint?: unknown })
				.instance_fingerprint;
			return problems([
				!publicationHostFingerprintMatches(expected, published) &&
					'fingerprint ≠ the engine recipe',
				publicationHostFingerprintMatches(
					publicationHostFingerprint(INSTANCE, `${scene.token}x`),
					published,
				) && 'a wrong token matched',
				publicationHostFingerprintMatches(
					publicationHostFingerprint('otherinstance', scene.token),
					published,
				) && 'a wrong instance matched',
				text.includes(INSTANCE) && 'the instance name is in the body',
			]);
		},
	);
	await row(`${s} no client certificate → handshake refused`, () =>
		refused(agentFetch(scene, WIRE.health, { client: 'none', bearer: null })),
	);
	await row(`${s} client certificate from a rogue CA → handshake refused`, () =>
		refused(agentFetch(scene, WIRE.health, { client: 'rogue', bearer: null })),
	);
	await row(`${s} a client pinning another server CA → refuses the agent`, () =>
		refused(agentFetch(scene, WIRE.health, { serverCa: 'rogue', bearer: null })),
	);
	await row(`${s} valid certificate, wrong bearer → 401 problem+json`, async () => {
		const res = await agentFetch(scene, WIRE.status, { bearer: 'w'.repeat(48) });
		return problems([
			res.status !== 401 && `status ${res.status}`,
			!(res.headers.get('content-type') ?? '').startsWith('application/problem+json') &&
				`content-type ${res.headers.get('content-type')}`,
		]);
	});
	await row(
		`${s} unauthenticated: known route, unknown route, wrong method → one indistinguishable 401`,
		async () => {
			const shapes = await Promise.all(
				[
					agentFetch(scene, WIRE.status, { bearer: null }),
					agentFetch(scene, `${BASE}/v1/no_such_route`, { bearer: null }),
					agentFetch(scene, WIRE.status, { bearer: null, method: 'DELETE' }),
				].map(async (request) => {
					const res = await request;
					const body = (await res.json()) as Record<string, unknown>;
					return JSON.stringify([
						res.status,
						res.headers.get('content-type'),
						body.type,
						body.title,
						body.detail,
					]);
				}),
			);
			return new Set(shapes).size === 1 && shapes[0]?.startsWith('[401,')
				? null
				: `distinguishable: ${shapes.join(' | ')}`;
		},
	);
	await row(
		`${s} GET /v1/status → 200: fingerprint, shared media probed, no rules, no v2 release`,
		async () => {
			const st = await agentStatus(scene);
			return problems([
				!publicationHostFingerprintMatches(expected, st.instance_fingerprint) && 'fingerprint',
				st.media?.present !== true && `media.present ${st.media?.present}`,
				st.media?.pub_markers !== 1 && `media.pub_markers ${st.media?.pub_markers}`,
				st.rules?.hash !== null && `rules.hash ${st.rules?.hash}`,
				st.apis?.v2?.current !== null && `apis.v2.current ${st.apis?.v2?.current}`,
			]);
		},
	);
}

async function rulesRows(scene: Scene): Promise<void> {
	const s = `[${scene.server}][rules]`;
	const input = { root: scene.media, qualities: QUALITIES };
	const text =
		scene.server === 'apache'
			? buildPublicationHostApacheConf(input)
			: buildPublicationHostNginxConf(input);
	const hash = getPublicationHostConfigHash(scene.server, normalizePublicationHostInput(input));
	// Directives the agent's ALLOWLIST accepts (publication/host_agent/src/rules/directives.ts: negative Options; a
	// two-word location) that the SERVER refuses: the failure must reach configtest, or this
	// row would prove the allowlist, not Review Focus 4.
	const broken =
		scene.server === 'apache'
			? `${text}\nOptions -DrillBogusOption\n`
			: `${text}\nlocation ~~ /drill_bogus { deny all; }\n`;
	const media = async (rel: string) =>
		(await fetch(`http://127.0.0.1:${scene.webPort}${publicationHostMediaUrl()}/${rel}`)).status;
	const apply = (body: Record<string, string>) =>
		agentFetch(scene, WIRE.rulesApply, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', [WIRE.actorHeader]: ACTOR },
			body: JSON.stringify(body),
		});

	await row(`${s} the engine render carries its own config-hash stamp`, () =>
		text.includes(`# config-hash: ${hash}`) ? null : 'stamp missing',
	);
	// No include yet: the main conf's own answer — 404 (nginx root) or 403 (Apache's
	// `<Directory /> Require all denied`). Either way, not the file.
	await row(`${s} before any apply: the published file is NOT served (403/404)`, async () => {
		const status = await media(PUBLISHED);
		return status === 403 || status === 404 ? null : `status ${status}`;
	});
	await row(
		`${s} hash that is not the text's stamp → 4xx, nothing written, nothing run`,
		async () => {
			const since = logLines(scene).length;
			const res = await apply({ server: scene.server, text, hash: 'f'.repeat(64) });
			return problems([
				(res.status < 400 || res.status >= 500) && `status ${res.status}`,
				existsSync(scene.include) && 'the include was written',
				callsSince(scene, since, []),
			]);
		},
	);
	await row(
		`${s} apply → 200; configtest then reload; published 200, unpublished 404 through ${scene.server}`,
		async () => {
			const since = logLines(scene).length;
			const res = await apply({ server: scene.server, text, hash });
			const body = await res.text();
			if (res.status !== 200) return `status ${res.status}: ${body}`;
			return problems([
				(JSON.parse(body) as { hash?: unknown }).hash !== hash && `body ${body}`,
				callsSince(scene, since, [configtestCall(scene.server), reloadCall(scene.server)]),
				await eventually(() => media(PUBLISHED), 200),
				await eventually(() => media(UNPUBLISHED), 404),
				(await agentStatus(scene)).rules?.hash !== hash && 'status rules.hash',
			]);
		},
	);
	await row(
		`${s} stamped include that FAILS configtest → refused; previous file restored, re-tested, never reloaded`,
		async () => {
			const since = logLines(scene).length;
			const res = await apply({ server: scene.server, text: broken, hash });
			const body = await res.text();
			await Bun.sleep(300);
			return problems([
				res.status < 400 && `status ${res.status}: ${body}`,
				callsSince(scene, since, [configtestCall(scene.server), configtestCall(scene.server)]),
				readFileSync(scene.include, 'utf8') !== text && 'the live include is not the previous file',
				(await media(PUBLISHED)) !== 200 && 'the published file stopped being served',
				(await media(UNPUBLISHED)) !== 404 && 'the unpublished file is served',
				(await agentStatus(scene)).rules?.hash !== hash && 'status rules.hash moved',
			]);
		},
	);
}

const v2Health = async (scene: Scene) => {
	const res = await fetch(`http://127.0.0.1:${scene.v2Port}${V2_BASE_PATH}/health`);
	return { status: res.status, body: (await res.json()) as { databases?: Record<string, string> } };
};

/** releases/<id> as `pwd -P` prints it; the parent is resolved, so a release a failed install removed still names. */
const releaseDir = (scene: Scene, id: string) =>
	join(realpathSync(join(scene.state, 'publication_api', 'v2', 'releases')), id);

const v2PidNow = (scene: Scene) =>
	existsSync(scene.v2Pid) ? readFileSync(scene.v2Pid, 'utf8').trim() : null;

async function servingCheck(
	scene: Scene,
	current: string,
	previous: string | null,
): Promise<(string | false)[]> {
	const health = await v2Health(scene);
	const st = await agentStatus(scene);
	return [
		(health.status !== 200 || health.body.databases?.[scene.shared.database] !== 'connected') &&
			`v2 health ${health.status} ${JSON.stringify(health.body)}`,
		st.apis?.v2?.current !== current &&
			`status current ${st.apis?.v2?.current}, expected ${current}`,
		st.apis?.v2?.previous !== previous &&
			`status previous ${st.apis?.v2?.previous}, expected ${previous}`,
	];
}

async function releaseRows(scene: Scene): Promise<void> {
	const { r1, r2, bad } = scene.shared.bundles;
	const install = (bundle: Bundle) =>
		agentFetch(scene, WIRE.install, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/gzip',
				[WIRE.releaseIdHeader]: bundle.id,
				[WIRE.sha256Header]: bundle.sha256,
				[WIRE.actorHeader]: ACTOR,
			},
			body: bundle.bytes,
		});
	const installed = async (
		bundle: Bundle,
		want: { from: string | null; reused: boolean; previous: string | null },
	): Promise<string | null> => {
		const since = logLines(scene).length;
		const res = await install(bundle);
		const text = await res.text();
		if (res.status !== 200) return `status ${res.status}: ${text}`;
		const body = JSON.parse(text) as Record<string, unknown>;
		return problems([
			(body.api !== 'v2' ||
				body.to !== bundle.id ||
				body.from !== want.from ||
				body.reused !== want.reused ||
				body.health !== 'ok') &&
				`body ${text}`,
			callsSince(scene, since, [
				...(want.reused ? [] : scratchCalls(releaseDir(scene, bundle.id))),
				restartCall,
				`v2 started in ${releaseDir(scene, bundle.id)}`,
			]),
			...(await servingCheck(scene, bundle.id, want.previous)),
		]);
	};

	await row(
		`[release] the v2 bundle fits the agent's default caps (${r1.entries} entries, ${(r1.unpacked / 2 ** 20).toFixed(0)} MiB unpacked, ${(r1.bytes.length / 2 ** 20).toFixed(0)} MiB gz)`,
		() =>
			problems([
				r1.entries > MAX_BUNDLE_ENTRIES && 'too many entries',
				r1.unpacked > MAX_BUNDLE_BYTES && 'too large',
			]),
	);
	await row(`[release] install ${r1.id} (first) → scratch health, promote, restart, health`, () =>
		installed(r1, { from: null, reused: false, previous: null }),
	);
	await row(`[release] install ${r2.id} → serving ${r2.id}, previous ${r1.id}`, () =>
		installed(r2, { from: r1.id, reused: false, previous: r1.id }),
	);
	await row(
		`[release] a bundle whose scratch boot fails (${bad.id}) → 422 scratch_health_failed; ${r2.id} keeps serving, never restarted`,
		async () => {
			const since = logLines(scene).length;
			const pid = v2PidNow(scene);
			const res = await install(bad);
			const text = await res.text();
			const reason = res.status === 422 ? (JSON.parse(text) as { reason?: unknown }).reason : null;
			return problems([
				(res.status !== 422 || reason !== 'scratch_health_failed') &&
					`status ${res.status}: ${text}`,
				// booted in the v2 user's scratch unit (from releases/<id>, removed after), never restarted
				callsSince(scene, since, scratchCalls(releaseDir(scene, bad.id))),
				v2PidNow(scene) !== pid && 'the serving v2 process was replaced',
				...(await servingCheck(scene, r2.id, r1.id)),
			]);
		},
	);
	await row(`[release] rollback → ${r1.id} serving again`, async () => {
		const since = logLines(scene).length;
		// The actor rides the actor header; the rollback request has NO body.
		const res = await agentFetch(scene, WIRE.rollback, {
			method: 'POST',
			headers: { [WIRE.actorHeader]: ACTOR },
		});
		const text = await res.text();
		if (res.status !== 200) return `status ${res.status}: ${text}`;
		const body = JSON.parse(text) as Record<string, unknown>;
		return problems([
			(body.from !== r2.id || body.to !== r1.id) && `body ${text}`,
			callsSince(scene, since, [restartCall, `v2 started in ${releaseDir(scene, r1.id)}`]),
			...(await servingCheck(scene, r1.id, r2.id)),
		]);
	});
	await row(
		`[release] re-install of a known id (${r2.id}) → reused, only re-points current (D9)`,
		() => installed(r2, { from: r1.id, reused: true, previous: r1.id }),
	);
}

async function execRow(scene: Scene): Promise<void> {
	await row(
		`[${scene.server}][exec] every stand-in call was in the closed set; php never called`,
		() => {
			const allowed = new Set([
				configtestCall(scene.server),
				reloadCall(scene.server),
				restartCall,
			]);
			const stray = logLines(scene).filter(
				(line) =>
					!allowed.has(line) &&
					!line.startsWith('v2 started in ') &&
					!line.startsWith('scratch started in ') &&
					!scratchCall('start').test(line) &&
					!scratchCall('stop').test(line),
			);
			return stray.length === 0 ? null : `outside the closed set: ${stray.join(' | ')}`;
		},
	);
}

async function pass(server: Server, shared: Shared, first: boolean): Promise<void> {
	const scene = await setupScene(server, shared);
	try {
		if (first) await refusalRows(scene);
		scene.agent = spawnAgent(scene, writeAgentEnv(scene, 'agent.env'), 'agent.log');
		await waitAgent(scene);
		await transportRows(scene);
		await rulesRows(scene);
		if (first) await releaseRows(scene);
		await execRow(scene);
	} finally {
		await teardown(scene);
	}
}

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

if (import.meta.main) {
	let only: string | undefined;
	try {
		only = parseArgs({ options: { only: { type: 'string' } }, strict: true }).values.only;
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
	if (only !== undefined && only !== 'apache' && only !== 'nginx') {
		console.error(`--only must be 'apache' or 'nginx' (got ${JSON.stringify(only)})`);
		process.exit(1);
	}
	const servers = (['apache', 'nginx'] as const).filter((s) => only === undefined || s === only);
	const missing = missingBinaries(servers);
	if (missing.length > 0) {
		console.error(
			`RED — missing on PATH: ${missing.join(', ')}. Needs openssl, git, bash, Apache 2.4 + apxs, nginx (engineering/CI.md).`,
		);
		process.exit(1);
	}
	const seam = execSeamProblem();
	if (seam !== null) {
		console.error(
			`RED — no exec seam here: ${seam}. The agent spawns ${SUDO} and ${SYSTEMCTL} by absolute path, so the drill's stand-ins must sit AT those paths, which only the CI image allows (ci/Dockerfile, "exec seam"); this drill never touches a real sudo or systemctl. Run it there: bun run ci:local --docker --instance.`,
		);
		process.exit(1);
	}
	if (!existsSync(join(AGENT_DIR, 'node_modules'))) {
		console.error(
			'RED — publication/host_agent has no node_modules: bun install --frozen-lockfile --cwd publication/host_agent',
		);
		process.exit(1);
	}
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'dd_pubhost_agent_')));
	const mariadbWasRunning = (await suiteMariadbStatus()).running;
	try {
		const mariadb = await ensureSuiteMariadb();
		const shared: Shared = {
			root,
			tls: issueTlsMaterial(join(root, 'tls')),
			bundles: buildBundles(root),
			mariadbSocket: mariadb.socket,
			database: zzdTargetDatabases()[0] as string,
		};
		for (const [i, server] of servers.entries()) {
			try {
				await pass(server, shared, i === 0);
			} catch (error) {
				red++;
				console.log(
					`RED  [${server}] the pass could not run: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
	} catch (error) {
		red++;
		console.log(
			`RED  the drill could not set up: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		disarmSeam();
		rmSync(root, { recursive: true, force: true });
		if (!mariadbWasRunning) await stopSuiteMariadb();
	}
	console.log(red === 0 ? '\nALL GREEN' : `\n${red} RED row(s)`);
	process.exit(red === 0 ? 0 : 1);
}
