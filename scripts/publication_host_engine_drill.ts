#!/usr/bin/env bun
/**
 * PUBLICATION-HOST ENGINE DRILL — the WORK ENGINE's side of the publication host
 * (engineering/PUBLICATION_HOST_SPEC.md §2/§5, phase 3) against the REAL agent, end to end:
 *
 *   pair      the root pairing CLI (scripts/publication_host_pair.ts) reads the agent's
 *             engine fragment + engine bundle as an operator leaves them; refuses a left
 *             placeholder, a fingerprint that contradicts instance + token, and a token the
 *             live agent does not hold — exit `refused`, nothing written; then pairs: registry
 *             0600 with no secret in it, secret dir 0700, token + bundle 0600 (E2–E4).
 *   panel     a REAL engine server (src/server.ts on the suite database, its own scratch
 *             private dir) answers the publication_hosts widget over the wire: get_value
 *             (checks, expected vs reported hash, presence flags, never a secret — Review
 *             Focus 5), set_host_fields, apply_rules, probe, rollback_api, remove_host.
 *   httpd     apply_rules renders with the ENGINE's builders from the agent's own status
 *             (E9) and lands in a live user-mode Apache (paired over mTLS) and nginx (paired
 *             over the unix socket): published 200 / unpublished 404 THROUGH the server, the
 *             exact configtest → reload stand-in sequence, reported hash = expected hash.
 *   refusals  a global admin who is not root: every action perm.denied, nothing changes
 *             (Review Focus 3); a re-provisioned agent: pairing_mismatch, and the AGENT'S
 *             request log (LOG_LEVEL info) shows only the anonymous `GET /health` probe — no
 *             bearer route, no 401 — nothing applied, until the CLI re-pairs (Review Focus 1;
 *             the engine code alone cannot prove the order: a 401 is re-probed and reported
 *             pairing_mismatch too, so the bearer's absence is read on the agent side); a frozen agent → timeout|unreachable in bounded
 *             time, a dead one → unreachable, the registry byte-identical (Review Focus 4);
 *             a truncated or hand-edited registry → registry.state registry_invalid with
 *             hosts null, never an empty list, never rewritten, apply refused (Review Focus 2).
 *   lockstep  (phase 4, first pass, after [release]) the engine's Publication API
 *             reconciler against the live agent:
 *             - the live engine (this checkout: no install stamp) answers push_apis with a
 *               refusal (L2), nothing reaching the agent;
 *             - a SCRATCH INSTALLED tree of this checkout (install stamp + extract-time
 *               publication manifest, scripts/lib/publication_host_lockstep.ts) runs the
 *               reconciler through scripts/publication_host_lockstep_driver.ts: a drifted
 *               file (named) and a foreign stamp are refused with nothing sent (L1, Review
 *               Focus 1);
 *             - the confirm hook (server.ts's own callback) in a smoke boot answers
 *               skipped_smoke_boot and pushes nothing (Review Focus 5); after a swap it
 *               starts the push: v2 then v1 (L6), engine-built node_modules (L3), a real
 *               `php -l` per v1 file, the agent serving <version>_<digest7> (L2), the
 *               runtime file recording ok;
 *             - a re-run is `none`; a second tree installs, and restoring the first is
 *               promote_existing (L5: lockstep both ways).
 *
 * TWO TRANSPORTS, ONE PER SERVER. E5 allows exactly two: mTLS over TCP and a unix socket.
 * Apache's pass pairs over TLS, nginx's over the socket: a full run proves both doors.
 * `--only` narrows to one server and so to one transport — the summary line says which.
 *
 * WHAT IS REAL, WHAT STANDS IN. Real: the agent (exec module unmodified; NODE_ENV=test,
 * stated by its env file — why not production: the phase-2 drill's header), the engine
 * server with its widget dispatch, door, client, registry and secret stores, the pair CLI,
 * Apache, nginx, Publication API v2 releases over the suite MariaDB. Stand-ins: sudo and
 * systemctl AT the agent's absolute binaries (the CI image's exec seam — so this drill,
 * like the agent drill, runs only inside the CI image), and php (PHP_BIN): on the first
 * pass it accepts only `php -l <*.php under the v1 API root>` and execs the REAL php (the
 * [lockstep] rows push a real v1 release), elsewhere it refuses everything (the shared
 * scene, scripts/lib/publication_host_agent_scene.ts). The releases rollback_api undoes are
 * planted through the agent's own wire; the [lockstep] rows install through the engine. HONEST LIMITS: "no agent call was made" for a refused action is proved by its
 * EFFECT here (no stand-in call, registry and include unchanged), made observable first: the
 * [authz] and [repair] pairing_mismatch rows move the expected rules off the live include
 * (withDivergedRules), so a leaked apply_rules WOULD configtest, reload and rewrite; a leaked
 * rollback_api is observable only in [release] (a previous release exists — the [authz] row's
 * rollback attempt, before any release, rests on its error code); that the client never
 * dials is the Task 7 widget gate. RF5 scans CENTRALLY: every engine answer (get_value and
 * every action, any status) and every pair-CLI output (any exit code) — the foreign token
 * included — plus the registry file and, last, the live engine's own log (every error path
 * above ran for real); a refused pair run must also leave no `pairing_` staging dir; the fragment is rendered with the agent renderer's
 * ENGINE_KEYS plus pasted values — the byte-exact provisioner render → CLI contract is
 * Task 5's hermetic gate over the committed example renders.
 *
 * THE ENGINE'S PRIVATE DIR IS SCRATCH. The engine server and the pair CLI run with
 * DEDALO_PRIVATE_DIR=<scratch>/private and the operator configuration as environment
 * (scripts/lib/operator_config.ts — the update drill's composition): the registry and the
 * secrets land there, never in the developer's ../private. The drill creates that dir, so
 * the CLI's owner check (it runs as the private dir's owner) holds.
 *
 * CONFIG ORDER. suiteServerEnvironment() repoints THIS process to the suite database; every
 * engine module is imported dynamically AFTER it (config freezes config.db at import).
 * Static imports below are config-free.
 *
 * Needs: what test:pubhost:agent needs (openssl, git, bash, Apache 2.4 + apxs, nginx,
 * MariaDB, publication/host_agent's node_modules, network for the v2 bundle install, the
 * CI image's exec seam), php (CLI: the real v1 lint), network for the engine's own v2
 * dependency builds (two releases), the suite database (`bun run test:db:setup`) and
 * scripts/publication_host_pair.ts. Missing = RED, never a skip. The agent's unix socket
 * must fit sun_path (a short TMPDIR). Wired: scripts/ci/instance_tier.sh stage 6
 * (`bun run test:pubhost:engine`); locally: `bun run ci:local --docker --instance`.
 */

import { randomBytes } from 'node:crypto';
import {
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
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { SUDO, SYSTEMCTL } from '../publication/host_agent/src/exec.ts';
import {
	BUNDLE_PLACEHOLDER,
	TOKEN_PLACEHOLDER,
} from '../publication/host_agent/src/provision/render/engine_fragment.ts';
import { publicationHostFingerprint } from '../src/core/publication_host/pairing.ts';
import { markProcessesDir } from '../test/helpers/test_media_root.ts';
import {
	assertServedDatabase,
	findFreePort,
	localSuiteFingerprint,
	probeServedDatabase,
	resolveSuiteDatabase,
	suiteServerEnvironment,
} from './client_test_server.ts';
import { operatorConfig } from './lib/operator_config.ts';
import {
	execSeamProblem,
	issueTlsMaterial,
	type SvgHeaderContract,
} from './lib/publication_host_agent_drill_kit.ts';
import {
	AGENT_DIR,
	agentStatus,
	applyCalls,
	buildBundles,
	callsSince,
	createRowBook,
	disarmSeam,
	eventually,
	INSTANCE,
	inClosedSet,
	type Listen,
	liveHostMap,
	logLines,
	missingBinaries,
	PUBLISHED,
	postRelease,
	problems,
	QUALITIES,
	REPO,
	type RowBook,
	releaseDir,
	restartAgent,
	restartCall,
	type Scene,
	type Server,
	type Shared,
	scratchCalls,
	setupScene,
	spawnAgent,
	svgTreatmentProblems,
	tail,
	teardown,
	UNPUBLISHED,
	v1RootOf,
	v2Health,
	WIRE,
	waitAgent,
	writeAgentEnv,
} from './lib/publication_host_agent_scene.ts';
import {
	ACTIONS,
	assertSecretFree,
	bearerSentProblem,
	bundleKeySecrets,
	checkState,
	hostRow,
	hostSecretFiles,
	modeOf,
	okHosts,
	PAIR_CLI,
	PANEL,
	type Panel,
	type PanelRow,
	pairArgv,
	readPanel,
	registryFile,
	renderEngineFragment,
	type Secret,
	secretLeaks,
	stagingLeftovers,
	writeEngineBundle,
} from './lib/publication_host_engine_drill_kit.ts';
import {
	auditBytes,
	drillDigest,
	materializeScratchTree,
	parseDriverResult,
	plantPendingSentinel,
	sentinelStatus,
	writeScratchStamp,
} from './lib/publication_host_lockstep.ts';
import { declareScratchPublicationHostsDir } from './lib/publication_host_scratch.ts';

const LISTEN_OF: Readonly<Record<Server, Listen>> = { apache: 'tls', nginx: 'unix' };
const API_PATH = '/api/v1/json';
const PUBLIC_URL = 'https://publication.drill.test';
/** A frozen agent's health leg may own the deadline (unreachable) or the command's (timeout). */
const FROZEN_CODES: ReadonlySet<string> = new Set([
	'publication_host.timeout',
	'publication_host.unreachable',
]);
/** The door's default deadline is 10 s (E5); this bound only catches a hang. */
const FROZEN_BOUND_MS = 30_000;

interface Auth {
	readonly cookie: string;
	readonly csrf: string;
}

interface Envelope {
	ok?: boolean;
	data?: unknown;
	csrf_token?: unknown;
	error?: { code?: string };
	[key: string]: unknown;
}

interface Answer {
	readonly env: Envelope;
	readonly text: string;
}

type RulesModule = typeof import('../src/core/media/publication_host_rules.ts');

interface Ctx {
	readonly book: RowBook;
	readonly origin: string;
	readonly privateDir: string;
	readonly engineEnv: Record<string, string>;
	readonly root: Auth;
	readonly admin: Auth;
	readonly rules: RulesModule;
	/** The engine's buildNginxMap(): what nginx's host map must be once apply_rules pushed it. */
	readonly nginxMap: string;
	/** The MEDIA-03 header contract (svg_safety.ts, imported after the config repoint). */
	readonly svgContract: SvgHeaderContract;
	readonly bundlePath: string;
	readonly secrets: Secret[];
}

// ── the engine, over the wire ────────────────────────────────────────────────

async function api(origin: string, body: Record<string, unknown>, auth?: Auth): Promise<Answer> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (auth !== undefined) {
		headers.Cookie = auth.cookie;
		headers['X-Dedalo-Csrf-Token'] = auth.csrf;
	}
	const res = await fetch(`${origin}${API_PATH}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(90_000),
	});
	const text = await res.text();
	try {
		return { env: JSON.parse(text) as Envelope, text };
	} catch {
		return { env: { ok: false, error: { code: `http ${res.status}, not JSON` } }, text };
	}
}

async function login(origin: string, username: string, password: string): Promise<Auth> {
	const res = await fetch(`${origin}${API_PATH}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			dd_api: 'dd_utils_api',
			action: 'login',
			prevent_lock: true,
			source: {},
			options: { username, auth: password },
		}),
	});
	const session = res.headers.getSetCookie().find((c) => c.startsWith('dedalo_ts_session='));
	const env = (await res.json()) as Envelope;
	if (session === undefined || typeof env.csrf_token !== 'string')
		throw new Error(`login as ${username} failed: http ${res.status}`);
	return { cookie: session.split(';')[0] as string, csrf: env.csrf_token };
}

const codeOf = (a: Answer): string =>
	a.env.ok === true ? 'ok' : (a.env.error?.code ?? `no error code: ${a.text.slice(0, 200)}`);

/**
 * RF5, CENTRAL: every engine answer is scanned here, whatever its status — the error states
 * (pairing_mismatch, a blocked reachable, registry_invalid, a refusal) are where a leak
 * would hide. A leak THROWS: the row goes RED with the labels, never the value.
 */
async function scanned(ctx: Ctx, where: string, answer: Promise<Answer>): Promise<Answer> {
	const a = await answer;
	assertSecretFree(where, a.text, ctx.secrets);
	return a;
}

const getValue = (ctx: Ctx, auth: Auth) =>
	scanned(
		ctx,
		'the get_value answer',
		api(
			ctx.origin,
			{
				dd_api: 'dd_area_maintenance_api',
				action: 'get_widget_value',
				prevent_lock: true,
				source: { model: PANEL.widget },
			},
			auth,
		),
	);

const act = (ctx: Ctx, auth: Auth, action: string, options: Record<string, unknown>) =>
	scanned(
		ctx,
		`the ${action} answer`,
		api(
			ctx.origin,
			{
				dd_api: 'dd_area_maintenance_api',
				action: 'widget_request',
				prevent_lock: true,
				source: { type: 'widget', model: PANEL.widget, action },
				options,
			},
			auth,
		),
	);

async function panelOf(ctx: Ctx, auth: Auth = ctx.root): Promise<{ panel: Panel; text: string }> {
	const a = await getValue(ctx, auth);
	if (a.env.ok !== true) throw new Error(`get_value answered ${codeOf(a)}`);
	return { panel: readPanel(a.env.data), text: a.text };
}

async function rowOf(ctx: Ctx, name: string): Promise<PanelRow> {
	const { panel } = await panelOf(ctx);
	const row = hostRow(panel, name);
	if (row === null)
		throw new Error(
			`get_value has no row '${name}' (rows: ${
				okHosts(panel)
					.map((h) => h.name)
					.join(', ') || 'none'
			})`,
		);
	return row;
}

const leaksIn = (ctx: Ctx, text: string): string | null => {
	const found = secretLeaks(text, ctx.secrets);
	return found.length === 0 ? null : `secret material in the output: ${found.join(', ')}`;
};

const registryBytes = (ctx: Ctx): string | null => {
	const file = registryFile(ctx.privateDir);
	return existsSync(file) ? readFileSync(file, 'utf8') : null;
};

/** The agent's own stdout/stderr (spawnAgent's 'agent.log'), not the stand-in log. */
const agentLogLines = (scene: Scene): string[] => {
	const path = join(scene.dir, 'agent.log');
	return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter(Boolean) : [];
};

const includeBytes = (scene: Scene): string | null =>
	existsSync(scene.include) ? readFileSync(scene.include, 'utf8') : null;

/** E9, computed by the drill independently: the engine builders over the agent's own root. */
function expectedHash(ctx: Ctx, scene: Scene, qualities: readonly string[] = QUALITIES): string {
	return ctx.rules.getPublicationHostConfigHash(
		scene.server,
		ctx.rules.normalizePublicationHostInput({ root: scene.media, qualities }),
	);
}

/** A second public quality: the expected rules then differ from the live include. */
const DIVERGED_QUALITIES: readonly string[] = [...QUALITIES, 'image/1.5MB'];

/**
 * Makes a LEAKED apply_rules observable. With the expected rules equal to the live include,
 * the agent answers an apply with its no-op (no configtest, no reload, same bytes — see the
 * [repair] replace row), so "no stand-in call, include unchanged" could not fail. Here root
 * first moves the host's qualities (set_host_fields: registry only, no agent call), the drill
 * checks the REGISTRY record carries them and that ITS OWN hash over them (the engine builders,
 * E9 — the panel's rules.expected is null while the pairing is unproved) is not the live
 * stamp, runs `check`, and restores the qualities — a restore failure is RED too.
 */
async function withDivergedRules(
	ctx: Ctx,
	scene: Scene,
	name: string,
	check: () => Promise<string | null>,
): Promise<string | null> {
	const setQualities = (qualities: readonly string[]) =>
		act(ctx, ctx.root, ACTIONS.setHostFields, { name, qualities: [...qualities] });
	const stored = (): string => {
		const hosts =
			(
				JSON.parse(registryBytes(ctx) ?? '{}') as {
					hosts?: { name?: unknown; qualities?: unknown }[];
				}
			).hosts ?? [];
		return JSON.stringify(hosts.find((h) => h.name === name)?.qualities ?? null);
	};
	const moved = await setQualities(DIVERGED_QUALITIES);
	if (moved.env.ok !== true) return `diverging the expected rules: ${codeOf(moved)}`;
	let problem: string | null;
	try {
		problem =
			stored() !== JSON.stringify(DIVERGED_QUALITIES)
				? `the registry qualities ${stored()} after the divergence`
				: (includeBytes(scene) ?? '').includes(
							`# config-hash: ${expectedHash(ctx, scene, DIVERGED_QUALITIES)}`,
						)
					? 'the diverged rules equal the live include: a leaked apply would be invisible'
					: await check();
	} catch (error) {
		problem = `threw: ${error instanceof Error ? error.message : String(error)}`;
	}
	const restored = await setQualities(QUALITIES);
	return problems([
		problem,
		restored.env.ok !== true && `restoring the qualities: ${codeOf(restored)}`,
		restored.env.ok === true &&
			stored() !== JSON.stringify(QUALITIES) &&
			`after the restore the registry qualities ${stored()}`,
	]);
}

const mediaStatus = async (ctx: Ctx, scene: Scene, rel: string): Promise<number> =>
	(await fetch(`http://127.0.0.1:${scene.webPort}${ctx.rules.publicationHostMediaUrl()}/${rel}`))
		.status;

// ── the pair CLI ─────────────────────────────────────────────────────────────

interface CliRun {
	readonly code: number;
	readonly out: string;
}

/** RF5, CENTRAL: every run's output is scanned, whatever the exit code, before any row prints it. */
function pairCli(ctx: Ctx, argv: string[]): CliRun {
	const r = Bun.spawnSync([process.execPath, 'run', PAIR_CLI.script, ...argv], {
		cwd: REPO,
		env: ctx.engineEnv,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const out = `${r.stdout.toString()}${r.stderr.toString()}`.trim();
	assertSecretFree(`the pair CLI (${argv[0]}, exit ${r.exitCode})`, out, ctx.secrets);
	return { code: r.exitCode, out };
}

/**
 * A refusal is EXIT.refused exactly. "Non-zero" is not enough: a usage error (2) means the
 * drill spoke an argv the CLI does not take, and would have passed for a refusal.
 */
function notRefused(label: string, r: CliRun): string | null {
	if (r.code === PAIR_CLI.exit.refused) return null;
	const usage =
		r.code === PAIR_CLI.exit.usage ? ' — a USAGE error: the drill argv does not match the CLI' : '';
	return `${label} exited ${r.code}, expected ${PAIR_CLI.exit.refused} (refused)${usage}: ${r.out.slice(-300)}`;
}

function writeFragment(
	ctx: Ctx,
	scene: Scene,
	file: string,
	token: string,
	fingerprint: string,
	bundlePath: string = ctx.bundlePath,
): string {
	const dir = join(scene.dir, 'pairing');
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const path = join(dir, file);
	const address =
		scene.listen === 'tls'
			? ({ kind: 'tls', host: '127.0.0.1', port: scene.agentPort, bundlePath } as const)
			: ({ kind: 'unix', socket: scene.agentSocket } as const);
	writeFileSync(path, renderEngineFragment({ instance: INSTANCE, token, fingerprint, address }), {
		mode: 0o600,
	});
	return path;
}

function addressProblem(record: Record<string, unknown> | undefined, scene: Scene): string | null {
	const a = (record?.address ?? {}) as Record<string, unknown>;
	const ok =
		scene.listen === 'tls'
			? a.kind === 'tls' && a.host === '127.0.0.1' && a.port === scene.agentPort
			: a.kind === 'unix' && a.socket === scene.agentSocket;
	return ok ? null : `record.address ${JSON.stringify(record?.address)}`;
}

// ── the rows ─────────────────────────────────────────────────────────────────

async function pairRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	const s = `[${scene.server}][pair]`;
	const files = hostSecretFiles(ctx.privateDir, name);
	const good = publicationHostFingerprint(INSTANCE, scene.token);
	const untouched = (before: string | null) =>
		problems([
			registryBytes(ctx) !== before && 'the registry changed',
			existsSync(files.dir) && `the secret dir ${files.dir} was created`,
			// The CLI stages the secrets for its live proof and removes them in `finally`: a
			// leftover would keep the refused token on disk.
			...stagingLeftovers(ctx.privateDir).map((dir) => `staging dir ${dir} left behind`),
		]);

	await ctx.book.row(`${s} a placeholder left in the fragment → refused, nothing written`, () => {
		const before = registryBytes(ctx);
		const runs: (readonly [string, CliRun])[] = [
			[
				'the token placeholder',
				pairCli(
					ctx,
					pairArgv(
						'add',
						name,
						writeFragment(ctx, scene, 'token_placeholder.env', TOKEN_PLACEHOLDER, good),
					),
				),
			],
		];
		if (scene.listen === 'tls')
			runs.push([
				'the bundle placeholder',
				pairCli(
					ctx,
					pairArgv(
						'add',
						name,
						writeFragment(
							ctx,
							scene,
							'bundle_placeholder.env',
							scene.token,
							good,
							BUNDLE_PLACEHOLDER,
						),
					),
				),
			]);
		return problems([...runs.map(([label, r]) => notRefused(label, r)), untouched(before)]);
	});
	await ctx.book.row(
		`${s} a fingerprint contradicting instance + token → refused, nothing written`,
		() => {
			const before = registryBytes(ctx);
			const lie = publicationHostFingerprint(INSTANCE, `${scene.token}x`);
			const r = pairCli(
				ctx,
				pairArgv('add', name, writeFragment(ctx, scene, 'contradiction.env', scene.token, lie)),
			);
			return problems([notRefused('the contradiction', r), untouched(before)]);
		},
	);
	await ctx.book.row(
		`${s} a self-consistent fragment whose token the live agent does not hold → the live proof refuses, nothing written`,
		() => {
			const before = registryBytes(ctx);
			const other = randomBytes(24).toString('hex');
			// Scanned for like any secret: a refusal that echoes the token it rejected is a leak.
			ctx.secrets.push({ label: 'the foreign (refused) token', value: other });
			const r = pairCli(
				ctx,
				pairArgv(
					'add',
					name,
					writeFragment(
						ctx,
						scene,
						'foreign_token.env',
						other,
						publicationHostFingerprint(INSTANCE, other),
					),
				),
			);
			return problems([notRefused('the foreign token', r), untouched(before)]);
		},
	);
	await ctx.book.row(
		`${s} the operator's fragment → paired: registry 0600 without a secret, secret dir 0700, token${scene.listen === 'tls' ? ' + bundle' : ''} 0600`,
		() => {
			const r = pairCli(
				ctx,
				pairArgv('add', name, writeFragment(ctx, scene, 'engine.env.fragment', scene.token, good)),
			);
			if (r.code !== PAIR_CLI.exit.ok) return `exit ${r.code}: ${r.out.slice(-400)}`;
			const registry = registryFile(ctx.privateDir);
			const text = readFileSync(registry, 'utf8');
			const parsed = JSON.parse(text) as { version?: unknown; hosts?: Record<string, unknown>[] };
			const record = parsed.hosts?.find((h) => h.name === name);
			const tls = scene.listen === 'tls';
			return problems([
				modeOf(registry) !== 0o600 && `registry mode ${modeOf(registry).toString(8)}`,
				parsed.version !== 1 && `registry version ${String(parsed.version)}`,
				record === undefined && 'no registry record',
				record?.instance !== INSTANCE && `record.instance ${String(record?.instance)}`,
				record?.fingerprint !== good && 'record.fingerprint is not the agent fingerprint',
				addressProblem(record, scene),
				leaksIn(ctx, text),
				modeOf(files.dir) !== 0o700 && `secret dir mode ${modeOf(files.dir).toString(8)}`,
				modeOf(files.token) !== 0o600 && `token mode ${modeOf(files.token).toString(8)}`,
				existsSync(files.token) &&
					readFileSync(files.token, 'utf8').trim() !== scene.token &&
					'the stored token is not the agent token',
				tls && modeOf(files.bundle) !== 0o600 && `bundle mode ${modeOf(files.bundle).toString(8)}`,
				tls &&
					existsSync(files.bundle) &&
					readFileSync(files.bundle, 'utf8') !== readFileSync(ctx.bundlePath, 'utf8') &&
					'the stored bundle is not the engine bundle',
				!tls && existsSync(files.bundle) && 'a unix-socket host got a TLS bundle',
			]);
		},
	);
}

async function panelRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	await ctx.book.row(
		`[${scene.server}][panel] get_value (root): paired, reachable, secret-free; rules expected, none reported yet`,
		async () => {
			const { panel } = await panelOf(ctx);
			const host = hostRow(panel, name);
			if (host === null) return `no row ${name} (registry.state ${panel.registryState})`;
			return problems([
				panel.registryState !== PANEL.registryOk && `registry.state ${panel.registryState}`,
				host.token_present !== true && `token_present ${host.token_present}`,
				host.bundle_present !== (scene.listen === 'tls') && `bundle_present ${host.bundle_present}`,
				host.pairing_proved !== true && `pairing_proved ${host.pairing_proved}`,
				...['registry', 'secrets', 'reachable', 'pairing'].map(
					(id) => checkState(host, id) !== 'ok' && `check ${id} ${checkState(host, id)}`,
				),
				!/^[0-9a-f]{64}$/.test(host.rules.expected ?? '') &&
					`rules.expected ${host.rules.expected}`,
				host.rules.reported !== null && `rules.reported ${host.rules.reported}`,
				checkState(host, 'rules_hash') === 'ok' && 'rules_hash ok with nothing applied',
				// nginx serves the host-wide map (B3: its state is a check): nothing loaded yet is red.
				scene.server === 'nginx' &&
					checkState(host, 'nginx_map') !== 'blocked' &&
					`check nginx_map ${checkState(host, 'nginx_map')}, expected blocked before any push`,
				scene.server === 'apache' &&
					checkState(host, 'nginx_map') !== null &&
					'an nginx_map check on an apache host',
			]);
		},
	);
}

async function fieldsRow(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	await ctx.book.row(
		`[${scene.server}][fields] set_host_fields (root): qualities, public_url, probe ids land; expected hash = the engine builders over the agent's root`,
		async () => {
			const a = await act(ctx, ctx.root, ACTIONS.setHostFields, {
				name,
				public_url: PUBLIC_URL,
				qualities: [...QUALITIES],
				probe: { published: PUBLISHED, unpublished: UNPUBLISHED },
			});
			if (a.env.ok !== true) return `set_host_fields: ${codeOf(a)}`;
			const host = await rowOf(ctx, name);
			const want = expectedHash(ctx, scene);
			return problems([
				host.public_url !== PUBLIC_URL && `public_url ${host.public_url}`,
				host.rules.expected !== want &&
					`rules.expected ${host.rules.expected}, the drill computes ${want}`,
			]);
		},
	);
}

async function rulesRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	const s = `[${scene.server}][rules]`;
	// No include yet: the main conf's own answer — 404 (nginx root) or 403 (Apache's
	// `<Directory /> Require all denied`). Either way, not the file.
	await ctx.book.row(
		`${s} before apply_rules: the published file is NOT served (403/404)`,
		async () => {
			const status = await mediaStatus(ctx, scene, PUBLISHED);
			return status === 403 || status === 404 ? null : `status ${status}`;
		},
	);
	await ctx.book.row(
		`${s} apply_rules (root) → ${scene.server === 'nginx' ? 'the host map pushed (rules.map), then ' : ''}configtest then reload; published 200, unpublished 404 through ${scene.server}; reported = expected`,
		async () => {
			const since = logLines(scene).length;
			const want = expectedHash(ctx, scene);
			const a = await act(ctx, ctx.root, ACTIONS.applyRules, { name });
			if (a.env.ok !== true) return `apply_rules: ${codeOf(a)}`;
			const host = await rowOf(ctx, name);
			return problems([
				(a.env.data as { hash?: unknown } | undefined)?.hash !== want &&
					`answer ${a.text.slice(0, 200)}`,
				callsSince(scene, since, applyCalls(scene.server, true)),
				await eventually(() => mediaStatus(ctx, scene, PUBLISHED), 200),
				await eventually(() => mediaStatus(ctx, scene, UNPUBLISHED), 404),
				!(includeBytes(scene) ?? '').includes(`# config-hash: ${want}`) &&
					'the live include does not carry the expected stamp',
				host.rules.reported !== want && `rules.reported ${host.rules.reported}`,
				checkState(host, 'rules_hash') !== 'ok' &&
					`check rules_hash ${checkState(host, 'rules_hash')}`,
				scene.server === 'nginx' &&
					checkState(host, 'nginx_map') !== 'ok' &&
					`check nginx_map ${checkState(host, 'nginx_map')}`,
				scene.server === 'nginx' &&
					liveHostMap(scene) !== ctx.nginxMap &&
					"the live host map is not the engine's map (one contribution renders byte-equal)",
			]);
		},
	);
	await ctx.book.row(
		`${s} MEDIA-03 through ${scene.server} after apply_rules: the envelope SVG inline (no Content-Disposition, the envelope CSP), the uploaded SVG \`attachment\` + the quarantine CSP`,
		async () => {
			const found = await svgTreatmentProblems(
				scene,
				ctx.rules.publicationHostMediaUrl(),
				ctx.svgContract,
			);
			return found.length === 0 ? null : found.join('; ');
		},
	);
}

async function probeRow(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	await ctx.book.row(
		`[${scene.server}][probe] probe (root) → the agent's media probe: shared, present, one publication marker`,
		async () => {
			const a = await act(ctx, ctx.root, ACTIONS.probe, { name });
			if (a.env.ok !== true) return `probe: ${codeOf(a)}`;
			// Task 7 answers {host, probe: MediaProbe}.
			const data = (a.env.data ?? {}) as {
				host?: unknown;
				probe?: { mode?: unknown; present?: unknown; pub_markers?: unknown };
			};
			const p = data.probe ?? {};
			return problems([
				data.host !== name && `answer host ${String(data.host)}`,
				p.mode !== 'shared' && `probe.mode ${String(p.mode)}`,
				p.present !== true && `probe.present ${String(p.present)}`,
				p.pub_markers !== 1 && `probe.pub_markers ${String(p.pub_markers)}`,
			]);
		},
	);
}

async function authzRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	const s = `[${scene.server}][authz]`;
	await ctx.book.row(
		`${s} get_value as a global admin who is not root → answered, secret-free`,
		async () => {
			const a = await getValue(ctx, ctx.admin);
			if (a.env.ok !== true) return `get_value: ${codeOf(a)}`;
			return hostRow(readPanel(a.env.data), name) === null ? `no row ${name}` : null;
		},
	);
	await ctx.book.row(
		`${s} every action as that admin (expected rules diverged first) → perm.denied; no stand-in call, registry and live include unchanged`,
		() =>
			withDivergedRules(ctx, scene, name, async () => {
				const since = logLines(scene).length;
				const registry = registryBytes(ctx);
				const include = includeBytes(scene);
				const tries: readonly (readonly [string, Record<string, unknown>])[] = [
					[ACTIONS.applyRules, { name }],
					[ACTIONS.probe, { name }],
					[ACTIONS.rollbackApi, { name, api: 'v2' }],
					[ACTIONS.setHostFields, { name, public_url: 'https://elsewhere.drill.test' }],
					[ACTIONS.removeHost, { name }],
					[ACTIONS.pushApis, { hosts: [name] }],
				];
				const wrong: string[] = [];
				for (const [action, options] of tries) {
					const code = codeOf(await act(ctx, ctx.admin, action, options));
					if (code !== 'perm.denied') wrong.push(`${action} → ${code}`);
				}
				return problems([
					wrong.length > 0 && wrong.join('; '),
					callsSince(scene, since, []),
					registryBytes(ctx) !== registry && 'the registry changed',
					includeBytes(scene) !== include && 'the live include changed',
				]);
			}),
	);
}

async function releaseRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	const s = `[${scene.server}][release]`;
	const { r1, r2 } = scene.shared.bundles;
	const planted = async (id: string, request: Promise<Response>) => {
		const res = await request;
		return res.status === 200 ? null : `planting ${id}: ${res.status} ${await res.text()}`;
	};
	await ctx.book.row(
		`${s} setup: ${r1.id} then ${r2.id} planted through the agent's own wire (engine install is phase 4)`,
		async () =>
			problems([
				await planted(r1.id, postRelease(scene, r1)),
				await planted(r2.id, postRelease(scene, r2)),
			]),
	);
	await ctx.book.row(`${s} get_value: v2 current ${r2.id}, previous ${r1.id}`, async () => {
		const host = await rowOf(ctx, name);
		return problems([
			host.apis.v2.current !== r2.id && `apis.v2.current ${host.apis.v2.current}`,
			host.apis.v2.previous !== r1.id && `apis.v2.previous ${host.apis.v2.previous}`,
		]);
	});
	// The [authz] row's rollback_api runs before any release exists, where a leaked call would
	// change nothing either: here, with a previous release to roll back to, it would restart.
	await ctx.book.row(
		`${s} rollback_api v2 as the non-root admin → perm.denied; no restart, ${r2.id} still current`,
		async () => {
			const since = logLines(scene).length;
			const code = codeOf(await act(ctx, ctx.admin, ACTIONS.rollbackApi, { name, api: 'v2' }));
			const host = await rowOf(ctx, name);
			return problems([
				code !== 'perm.denied' && `code ${code}`,
				callsSince(scene, since, []),
				host.apis.v2.current !== r2.id && `apis.v2.current ${host.apis.v2.current}`,
			]);
		},
	);
	await ctx.book.row(
		`${s} rollback_api v2 (root) → ${r1.id} serving again: restarted on it, v2 healthy over MariaDB, the panel follows`,
		async () => {
			const since = logLines(scene).length;
			const a = await act(ctx, ctx.root, ACTIONS.rollbackApi, { name, api: 'v2' });
			if (a.env.ok !== true) return `rollback_api: ${codeOf(a)}`;
			const body = (a.env.data ?? {}) as { from?: unknown; to?: unknown };
			const health = await v2Health(scene);
			const host = await rowOf(ctx, name);
			return problems([
				(body.from !== r2.id || body.to !== r1.id) && `answer ${a.text.slice(0, 200)}`,
				callsSince(scene, since, [restartCall, `v2 started in ${releaseDir(scene, r1.id)}`]),
				(health.status !== 200 || health.body.databases?.[scene.shared.database] !== 'connected') &&
					`v2 health ${health.status} ${JSON.stringify(health.body)}`,
				host.apis.v2.current !== r1.id && `apis.v2.current ${host.apis.v2.current}`,
				host.apis.v2.previous !== r2.id && `apis.v2.previous ${host.apis.v2.previous}`,
			]);
		},
	);
}

async function multiRow(
	ctx: Ctx,
	scene: Scene,
	name: string,
	earlier: readonly string[],
): Promise<void> {
	await ctx.book.row(
		`[${scene.server}][multi] get_value lists every host: ${earlier.join(', ')} (agent gone) blocked, ${name} paired — one dead host never blanks the panel (E1)`,
		async () => {
			const { panel } = await panelOf(ctx);
			const mine = hostRow(panel, name);
			return problems([
				mine === null && `no row ${name}`,
				mine !== null &&
					checkState(mine, 'pairing') !== 'ok' &&
					`${name} pairing ${checkState(mine, 'pairing')}`,
				...earlier.map((other) => {
					const row = hostRow(panel, other);
					if (row === null) return `no row ${other}`;
					return (
						checkState(row, 'reachable') !== 'blocked' &&
						`${other} reachable ${checkState(row, 'reachable')}`
					);
				}),
			]);
		},
	);
}

async function repairRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	const s = `[${scene.server}][repair]`;
	const fresh = randomBytes(24).toString('hex');
	ctx.secrets.push({ label: `the re-provisioned ${scene.server} agent token`, value: fresh });
	await ctx.book.row(
		`${s} the agent re-provisioned with a new token → get_value: pairing blocked, not proved; reachable`,
		async () => {
			await restartAgent(scene, fresh);
			const host = await rowOf(ctx, name);
			return problems([
				host.pairing_proved !== false && `pairing_proved ${host.pairing_proved}`,
				checkState(host, 'pairing') !== 'blocked' && `check pairing ${checkState(host, 'pairing')}`,
				checkState(host, 'reachable') !== 'ok' &&
					`check reachable ${checkState(host, 'reachable')}`,
			]);
		},
	);
	await ctx.book.row(
		`${s} apply_rules (expected rules diverged first) → publication_host.pairing_mismatch; the agent saw only the anonymous /health probe (no bearer route, no 401); nothing applied, registry unchanged`,
		() =>
			withDivergedRules(ctx, scene, name, async () => {
				const since = logLines(scene).length;
				const agentSince = agentLogLines(scene).length;
				const registry = registryBytes(ctx);
				const include = includeBytes(scene);
				const code = codeOf(await act(ctx, ctx.root, ACTIONS.applyRules, { name }));
				return problems([
					// `auth` would mean the proof MATCHED and the bearer was refused — a broken
					// scene, not the RF1 order: that is read below, on the agent side.
					code !== 'publication_host.pairing_mismatch' && `code ${code}`,
					bearerSentProblem(agentLogLines(scene).slice(agentSince), WIRE.health),
					callsSince(scene, since, []),
					registryBytes(ctx) !== registry && 'the registry changed',
					includeBytes(scene) !== include && 'the live include changed',
				]);
			}),
	);
	await ctx.book.row(
		`${s} the CLI re-pairs (replace) from the new fragment → apply_rules works again (the include is unchanged: the agent's no-op, no configtest, no reload)`,
		async () => {
			const r = pairCli(
				ctx,
				pairArgv(
					'replace',
					name,
					writeFragment(
						ctx,
						scene,
						'engine.env.fragment.reprovisioned',
						fresh,
						publicationHostFingerprint(INSTANCE, fresh),
					),
				),
			);
			if (r.code !== PAIR_CLI.exit.ok) return `replace exit ${r.code}: ${r.out.slice(-400)}`;
			const since = logLines(scene).length;
			const want = expectedHash(ctx, scene);
			const a = await act(ctx, ctx.root, ACTIONS.applyRules, { name });
			const host = await rowOf(ctx, name);
			const token = hostSecretFiles(ctx.privateDir, name).token;
			return problems([
				a.env.ok !== true && `apply_rules: ${codeOf(a)}`,
				(a.env.data as { hash?: unknown } | undefined)?.hash !== want &&
					`answer ${a.text.slice(0, 200)}`,
				// The agent re-applies the SAME include ([rules] landed it before the
				// re-provision): publication/host_agent/src/rules/apply.ts answers an unchanged
				// live include {hash, reloaded: true} without a configtest or a reload. The
				// bearer was accepted (ok, not publication_host.auth); nothing ran.
				callsSince(scene, since, []),
				host.rules.reported !== want && `rules.reported ${host.rules.reported}`,
				host.pairing_proved !== true && `pairing_proved ${host.pairing_proved}`,
				readFileSync(token, 'utf8').trim() !== fresh && 'the stored token was not replaced',
			]);
		},
	);
}

async function registryRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	const s = `[${scene.server}][registry]`;
	const file = registryFile(ctx.privateDir);
	const original = readFileSync(file, 'utf8');
	const cases: readonly (readonly [string, string])[] = [
		['truncated mid-write', original.slice(0, Math.floor(original.length / 2))],
		[
			'hand-edited: a host without an address',
			`${JSON.stringify({ version: 1, hosts: [{ name: 'drill_handedit' }] })}\n`,
		],
	];
	try {
		for (const [what, bytes] of cases) {
			await ctx.book.row(
				`${s} ${what} → get_value: registry.state ${PANEL.registryInvalid} with its reason and hosts null, never a list; the file left as found; apply_rules refused`,
				async () => {
					writeFileSync(file, bytes);
					const since = logLines(scene).length;
					const value = await getValue(ctx, ctx.root);
					const applied = await act(ctx, ctx.root, ACTIONS.applyRules, { name });
					// readPanel itself refuses an unusable registry that carries a list (RF2): the row
					// then reports "threw: … not null".
					const panel = value.env.ok === true ? readPanel(value.env.data) : null;
					return problems([
						panel === null && `get_value failed instead of reporting: ${codeOf(value)}`,
						panel !== null &&
							panel.registryState !== PANEL.registryInvalid &&
							`registry.state ${panel.registryState}`,
						panel !== null && panel.registryReason === null && 'registry.reason missing',
						applied.env.ok === true && 'apply_rules ran on an invalid registry',
						callsSince(scene, since, []),
						readFileSync(file, 'utf8') !== bytes && 'the engine rewrote the registry',
					]);
				},
			);
		}
	} finally {
		writeFileSync(file, original);
	}
	await ctx.book.row(
		`${s} restored → registry.state ${PANEL.registryOk}, the host back`,
		async () => {
			const { panel } = await panelOf(ctx);
			return problems([
				panel.registryState !== PANEL.registryOk && `registry.state ${panel.registryState}`,
				hostRow(panel, name) === null && `no row ${name}`,
			]);
		},
	);
}

async function downRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	const s = `[${scene.server}][down]`;
	await ctx.book.row(
		`${s} a frozen agent (SIGSTOP) → apply_rules fails typed (timeout|unreachable) within ${FROZEN_BOUND_MS / 1000} s; registry unchanged`,
		async () => {
			const agent = scene.agent;
			if (agent === null) return 'no agent';
			const registry = registryBytes(ctx);
			const started = Date.now();
			process.kill(agent.pid, 'SIGSTOP');
			let code: string;
			try {
				code = codeOf(await act(ctx, ctx.root, ACTIONS.applyRules, { name }));
			} finally {
				process.kill(agent.pid, 'SIGCONT');
			}
			const took = Date.now() - started;
			await waitAgent(scene);
			return problems([
				!FROZEN_CODES.has(code) && `code ${code}`,
				took > FROZEN_BOUND_MS && `answered after ${took} ms`,
				registryBytes(ctx) !== registry && 'the registry changed',
			]);
		},
	);
	await ctx.book.row(
		`${s} a dead agent (SIGKILL) → apply_rules: publication_host.unreachable; get_value still answers, reachable blocked; registry unchanged`,
		async () => {
			const agent = scene.agent;
			if (agent === null) return 'no agent';
			const registry = registryBytes(ctx);
			agent.kill('SIGKILL');
			await agent.exited;
			const code = codeOf(await act(ctx, ctx.root, ACTIONS.applyRules, { name }));
			const host = await rowOf(ctx, name);
			return problems([
				code !== 'publication_host.unreachable' && `code ${code}`,
				checkState(host, 'reachable') !== 'blocked' &&
					`check reachable ${checkState(host, 'reachable')}`,
				registryBytes(ctx) !== registry && 'the registry changed',
			]);
		},
	);
}

// ── phase 4: API lockstep, engine → agent, from a scratch INSTALLED tree ─────

const DRIFT_FILE = 'publication/server_api/v2/src/index.ts';
/** A push builds v2's production node_modules (network) and scratch-boots it: generous. */
const PUSH_WAIT_MS = 600_000;
const V1_TREE = 'publication/server_api/v1';

interface Lockstep {
	readonly base: string;
	readonly tree: string;
	readonly backupRoot: string;
	readonly env: Record<string, string>;
	version: string;
}

interface ApiActionOut {
	action?: string;
	result?: string;
	error?: string;
}
interface ReportOut {
	release: string | null;
	refused: string | null;
	hosts: { name: string; v1: ApiActionOut; v2: ApiActionOut }[];
}
interface ReconcileOut {
	version: string;
	digest: string | null;
	report: ReportOut;
}
interface VerifyOne {
	ok?: boolean;
	reason?: string;
	drift?: string[];
}
interface VerifyOut {
	v1?: VerifyOne;
	v2?: VerifyOne;
}
interface RuntimeApi {
	state?: string;
	release?: string | null;
	at?: string | null;
	error?: string | null;
}
type RuntimeApis = Record<'v1' | 'v2', RuntimeApi> | null;
interface ConfirmOut {
	/** What triggerPublicationApiPush answered; null = the hook never ran (no flip). */
	trigger: 'started' | 'skipped_smoke_boot' | 'skipped_install_mode' | null;
	settled: boolean;
	before: RuntimeApis;
	apis: RuntimeApis;
}
interface Mark {
	readonly since: number;
	readonly audit: number;
}
type Held = { v1: string | null; v2: string | null };

/**
 * The scratch installed tree and the driver's environment: the engine server's own
 * (operator config, the suite database, THE scratch private dir the pair CLI wrote — so the
 * driver reaches exactly the host this pass paired), plus a scratch backup root (the
 * `.pubapi_build` cache, the sentinel). Also planted: v1's operator configuration in the
 * agent's shared/ (§3, outside every release; the bundle carries the headers file).
 */
function lockstepSetup(ctx: Ctx, scene: Scene): Lockstep {
	const base = join(scene.shared.root, 'lockstep');
	const tree = join(base, 'tree');
	const backupRoot = join(base, 'backups');
	mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
	materializeScratchTree(REPO, tree);
	writeFileSync(
		join(scene.state, 'publication_api', 'v1', 'shared', 'server_config_api.php'),
		'<?php\n// drill: the Publication API v1 shared configuration\n',
		// Private to its owner: the agent refuses a v1 config readable by group or others.
		{ mode: 0o600 },
	);
	const env: Record<string, string> = {
		...ctx.engineEnv,
		DEDALO_BACKUP_PATH: backupRoot,
		DEDALO_RECONCILE_SCHEDULER_ENABLED: 'false',
	};
	return { base, tree, backupRoot, env, version: '' };
}

async function driver<T>(
	lk: Lockstep,
	command: string,
	args: Record<string, unknown>,
	extraEnv: Record<string, string> = {},
): Promise<T> {
	const proc = Bun.spawn(
		[
			process.execPath,
			'run',
			join('scripts', 'publication_host_lockstep_driver.ts'),
			command,
			JSON.stringify(args),
		],
		{ cwd: lk.tree, env: { ...lk.env, ...extraEnv }, stdout: 'pipe', stderr: 'pipe' },
	);
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return parseDriverResult<T>(out, err, code);
}

const releaseOf = (lk: Lockstep, digest: string) => `${lk.version}_${digest.slice(0, 7)}`;
const auditOf = (scene: Scene) => auditBytes(join(scene.state, 'audit'));
const mark = (scene: Scene): Mark => ({ since: logLines(scene).length, audit: auditOf(scene) });
const heldOf = async (scene: Scene): Promise<Held> => {
	const st = await agentStatus(scene);
	return { v1: st.apis?.v1?.current ?? null, v2: st.apis?.v2?.current ?? null };
};

/**
 * NOTHING reached the agent. No stand-in call. The audit log did not grow: the agent
 * audits every mutation it receives, refusals included, so a request refused agent-side
 * still turns this row red. Neither API's `current` moved.
 */
async function nothingSent(scene: Scene, m: Mark, want: Held): Promise<(string | null | false)[]> {
	const held = await heldOf(scene);
	return [
		callsSince(scene, m.since, []),
		auditOf(scene) !== m.audit && 'a mutation reached the agent (its audit log grew)',
		held.v2 !== want.v2 && `agent v2 current ${held.v2}, expected ${want.v2}`,
		held.v1 !== want.v1 && `agent v1 current ${held.v1}, expected ${want.v1}`,
	];
}

/** Every `.php` the v1 tree carries: the agent lints each one before it promotes. */
function v1PhpCount(lk: Lockstep): number {
	return readdirSync(join(lk.tree, V1_TREE), { recursive: true, withFileTypes: true }).filter(
		(entry) => entry.isFile() && /\.php$/i.test(entry.name),
	).length;
}

/**
 * A push of `id` landed:
 *   - v2's calls are exactly one install's (a fresh one scratch-boots first; a promote only
 *     restarts), and all of them precede v1's first lint (L6: v2 then v1);
 *   - v1 was linted once per .php, every one under its root — or, on a promote, not at all;
 *   - v2 is healthy over the suite MariaDB, and both APIs report `id` current with the
 *     expected previous.
 */
async function pushedCheck(
	lk: Lockstep,
	scene: Scene,
	since: number,
	id: string,
	want: { previous: Held; fresh: boolean },
): Promise<(string | false)[]> {
	const got = logLines(scene).slice(since);
	const isLint = (line: string) => line.startsWith('php ');
	const lint = got.filter(isLint);
	const v2 = got.filter((line) => !isLint(line));
	const firstLint = got.findIndex(isLint);
	const root = v1RootOf(scene.state);
	const outside = lint.find((line) => !inClosedSet(scene, line, { phpLintRoot: root }));
	const dir = releaseDir(scene, id);
	const v2Calls = [...(want.fresh ? scratchCalls(dir) : []), restartCall, `v2 started in ${dir}`];
	const st = await agentStatus(scene);
	const health = await v2Health(scene);
	const php = want.fresh ? v1PhpCount(lk) : 0;
	return [
		v2.length !== v2Calls.length ||
		v2Calls.some((w, i) => (typeof w === 'string' ? v2[i] !== w : !w.test(v2[i] as string)))
			? `v2 stand-in calls ${JSON.stringify(v2)}, expected ${JSON.stringify(v2Calls.map(String))}`
			: false,
		lint.length !== php && `${lint.length} php -l call(s), expected ${php} (one per v1 .php)`,
		new Set(lint).size !== lint.length && 'a v1 file was linted twice',
		outside !== undefined && `php outside the v1 root: ${outside}`,
		firstLint !== -1 &&
			got.slice(firstLint).some((line) => !isLint(line)) &&
			'v1 began before v2 finished (L6: v2 then v1)',
		(health.status !== 200 || health.body.databases?.[scene.shared.database] !== 'connected') &&
			`v2 health ${health.status} ${JSON.stringify(health.body)}`,
		...(['v2', 'v1'] as const).flatMap((api) => [
			(st.apis?.[api]?.current ?? null) !== id &&
				`agent ${api} current ${st.apis?.[api]?.current}, expected ${id}`,
			(st.apis?.[api]?.previous ?? null) !== want.previous[api] &&
				`agent ${api} previous ${st.apis?.[api]?.previous}, expected ${want.previous[api]}`,
		]),
	];
}

const runtimeOk = (apis: RuntimeApis, id: string): (string | false)[] =>
	(['v2', 'v1'] as const).map(
		(api) =>
			(apis?.[api]?.state !== 'ok' || apis?.[api]?.release !== id) &&
			`runtime ${api} ${JSON.stringify(apis?.[api])}, expected ok @ ${id}`,
	);

const actionIs = (act: ApiActionOut | undefined, action: string, result: string): string | false =>
	(act?.action !== action || act?.result !== result) &&
	`${JSON.stringify(act)}, expected ${action}/${result}`;

async function lockstepRows(ctx: Ctx, scene: Scene, name: string): Promise<void> {
	const s = `[${scene.server}][lockstep]`;
	let lk: Lockstep;
	try {
		lk = lockstepSetup(ctx, scene);
	} catch (error) {
		ctx.book.fail(`${s} the scratch installed tree could not be set up`, error);
		return;
	}
	const was = await heldOf(scene);
	const A = drillDigest('A');
	const B = drillDigest('B');
	const reconcile = (apply: boolean) => driver<ReconcileOut>(lk, 'reconcile', { apply, name });
	const hostOf = (out: ReconcileOut) => out.report.hosts.find((h) => h.name === name);
	const stamp = async (digest: string) => {
		writeScratchStamp(lk.tree, digest);
		return driver<{ digest: string; version: string }>(lk, 'manifest', {});
	};

	await ctx.book.row(
		`${s} push_apis (root) on the live engine — this checkout, no install stamp → refused no_verified_release, nothing reaches the agent (L2)`,
		async () => {
			const m = mark(scene);
			const a = await act(ctx, ctx.root, ACTIONS.pushApis, { hosts: [name] });
			const report = (a.env.report ?? null) as ReportOut | null;
			return problems([
				a.env.ok !== true && `push_apis: ${codeOf(a)}`,
				a.env.data !== false && `data ${JSON.stringify(a.env.data)}, expected false`,
				(report?.release !== null || report?.refused !== 'no_verified_release') &&
					`report ${JSON.stringify(report)}`,
				...(await nothingSent(scene, m, was)),
			]);
		},
	);

	await ctx.book.row(
		`${s} install stamp + extract-time manifest → verifyPublicationTree ok for v1 and v2`,
		async () => {
			const m = await stamp(A);
			lk.version = m.version;
			const v = await driver<VerifyOut>(lk, 'verify', {});
			return problems([
				m.digest !== A && `manifest digest ${m.digest}, expected ${A}`,
				v.v1?.ok !== true && `v1 ${JSON.stringify(v.v1)}`,
				v.v2?.ok !== true && `v2 ${JSON.stringify(v.v2)}`,
			]);
		},
	);

	await ctx.book.row(
		`${s} a file edited after the install (${DRIFT_FILE}) → drift named, push refused, nothing reaches the agent (L1, Review Focus 1)`,
		async () => {
			const path = join(lk.tree, DRIFT_FILE);
			const original = readFileSync(path);
			writeFileSync(
				path,
				Buffer.concat([original, Buffer.from('\n// drill: drift after the install\n')]),
			);
			try {
				const m = mark(scene);
				const v = await driver<VerifyOut>(lk, 'verify', {});
				const out = await reconcile(true);
				return problems([
					(v.v2?.ok !== false ||
						v.v2.reason !== 'drift' ||
						!(v.v2.drift ?? []).some((d) => d.startsWith(DRIFT_FILE))) &&
						`verify v2 ${JSON.stringify(v.v2)}`,
					v.v1?.ok !== true && `verify v1 ${JSON.stringify(v.v1)} (only v2 drifted)`,
					!(out.report.refused ?? '').includes(DRIFT_FILE) &&
						`the refusal does not name the file: ${out.report.refused}`,
					out.report.release !== null && `release ${out.report.release} on a drifted tree`,
					...(await nothingSent(scene, m, was)),
				]);
			} finally {
				writeFileSync(path, original);
			}
		},
	);

	await ctx.book.row(
		`${s} a stamp that is not the manifest's (another archive) → digest_mismatch, push refused, nothing reaches the agent`,
		async () => {
			writeScratchStamp(lk.tree, B);
			try {
				const m = mark(scene);
				const v = await driver<VerifyOut>(lk, 'verify', {});
				const out = await reconcile(true);
				return problems([
					v.v1?.reason !== 'digest_mismatch' && `verify v1 ${JSON.stringify(v.v1)}`,
					v.v2?.reason !== 'digest_mismatch' && `verify v2 ${JSON.stringify(v.v2)}`,
					(out.report.refused === null || out.report.release !== null) &&
						`report ${JSON.stringify(out.report)}`,
					...(await nothingSent(scene, m, was)),
				]);
			} finally {
				writeScratchStamp(lk.tree, A);
			}
		},
	);

	await ctx.book.row(
		`${s} the confirm hook in a SMOKE BOOT → sentinel confirmed, trigger skipped_smoke_boot: no bundle built, runtime untouched, nothing reaches the agent (Review Focus 5)`,
		async () => {
			plantPendingSentinel(lk.backupRoot, lk.version, A);
			const m = mark(scene);
			const out = await driver<ConfirmOut>(
				lk,
				'confirm',
				{ name, waitMs: 10_000 },
				{ DEDALO_SMOKE_BOOT: 'true' },
			);
			return problems([
				// The hook ran (afterConfirmed fires only after the flip) and its own guard refused.
				sentinelStatus(lk.backupRoot) !== 'confirmed' &&
					`sentinel ${sentinelStatus(lk.backupRoot)}: the hook path never ran`,
				out.trigger !== 'skipped_smoke_boot' &&
					`trigger answered ${out.trigger}, expected skipped_smoke_boot`,
				JSON.stringify(out.apis) !== JSON.stringify(out.before) &&
					`the runtime moved: ${JSON.stringify(out.apis)}`,
				existsSync(join(lk.backupRoot, '.pubapi_build')) && 'a bundle build dir appeared',
				...(await nothingSent(scene, m, was)),
			]);
		},
	);

	await ctx.book.row(
		`${s} dry run → release <version>_<digest7>, both APIs planned 'install', nothing reaches the agent`,
		async () => {
			const m = mark(scene);
			const out = await reconcile(false);
			const host = hostOf(out);
			const id = releaseOf(lk, A);
			return problems([
				out.report.release !== id && `release ${out.report.release}, expected ${id}`,
				out.report.refused !== null && `refused: ${out.report.refused}`,
				actionIs(host?.v2, 'install', 'dry_run'),
				actionIs(host?.v1, 'install', 'dry_run'),
				...(await nothingSent(scene, m, was)),
			]);
		},
	);

	await ctx.book.row(
		`${s} the confirm hook after a swap (same driver, no smoke boot) → trigger started; v2 then v1 pushed (engine-built deps, real php -l); the agent serves <version>_${A.slice(0, 7)} (L2/L3/L5/L6)`,
		async () => {
			plantPendingSentinel(lk.backupRoot, lk.version, A);
			const m = mark(scene);
			const out = await driver<ConfirmOut>(lk, 'confirm', { name, waitMs: PUSH_WAIT_MS });
			const id = releaseOf(lk, A);
			return problems([
				sentinelStatus(lk.backupRoot) !== 'confirmed' &&
					`sentinel ${sentinelStatus(lk.backupRoot)}`,
				out.trigger !== 'started' && `trigger answered ${out.trigger}, expected started`,
				out.trigger === 'started' &&
					!out.settled &&
					`the detached push never settled in ${PUSH_WAIT_MS} ms: ${JSON.stringify(out.apis)}`,
				// L3: the engine built and cached the bundle (its deps dir is removed after the
				// pack), and the release the agent promoted carries node_modules.
				!existsSync(join(lk.backupRoot, '.pubapi_build', id, 'v2.tar.gz')) &&
					'no engine-side v2 bundle in the build cache (L3)',
				!existsSync(join(releaseDir(scene, id), 'node_modules')) &&
					'the promoted v2 release carries no node_modules (L3)',
				...runtimeOk(out.apis, id),
				...(await pushedCheck(lk, scene, m.since, id, { previous: was, fresh: true })),
			]);
		},
	);

	await ctx.book.row(
		`${s} again, nothing changed → 'none' for both, nothing reaches the agent`,
		async () => {
			const m = mark(scene);
			const out = await reconcile(true);
			const host = hostOf(out);
			const id = releaseOf(lk, A);
			return problems([
				actionIs(host?.v2, 'none', 'ok'),
				actionIs(host?.v1, 'none', 'ok'),
				...(await nothingSent(scene, m, { v1: id, v2: id })),
			]);
		},
	);

	await ctx.book.row(
		`${s} another tree installed (an update) → push installs <version>_${B.slice(0, 7)} for v2 and v1`,
		async () => {
			await stamp(B);
			const m = mark(scene);
			const out = await reconcile(true);
			const host = hostOf(out);
			const idA = releaseOf(lk, A);
			const idB = releaseOf(lk, B);
			return problems([
				out.report.release !== idB && `release ${out.report.release}, expected ${idB}`,
				actionIs(host?.v2, 'install', 'ok'),
				actionIs(host?.v1, 'install', 'ok'),
				...(await pushedCheck(lk, scene, m.since, idB, {
					previous: { v1: idA, v2: idA },
					fresh: true,
				})),
			]);
		},
	);

	await ctx.book.row(
		`${s} the first tree restored → promote_existing for both; <version>_${A.slice(0, 7)} serves again, no re-lint (L5: lockstep both ways)`,
		async () => {
			await stamp(A);
			const m = mark(scene);
			const out = await reconcile(true);
			const host = hostOf(out);
			const idA = releaseOf(lk, A);
			const idB = releaseOf(lk, B);
			return problems([
				out.report.release !== idA && `release ${out.report.release}, expected ${idA}`,
				actionIs(host?.v2, 'promote_existing', 'ok'),
				actionIs(host?.v1, 'promote_existing', 'ok'),
				...(await pushedCheck(lk, scene, m.since, idA, {
					previous: { v1: idB, v2: idB },
					fresh: false,
				})),
			]);
		},
	);
}

async function execRow(ctx: Ctx, scene: Scene, releases: boolean): Promise<void> {
	const phpLintRoot = releases ? v1RootOf(scene.state) : undefined;
	await ctx.book.row(
		`[${scene.server}][exec] every stand-in call was in the closed set${releases ? '; php only ever linted a .php under the v1 API root' : ' (no release planted: no scratch boot, no v2 start); php never called'}`,
		() => {
			const stray = logLines(scene).filter(
				(line) => !inClosedSet(scene, line, { releases, phpLintRoot }),
			);
			return stray.length === 0 ? null : `outside the closed set: ${stray.join(' | ')}`;
		},
	);
}

async function removalRows(ctx: Ctx, names: readonly string[]): Promise<void> {
	const [viaWidget, viaCli] = names;
	const gone = async (name: string): Promise<(string | false)[]> => {
		const { panel } = await panelOf(ctx);
		const hosts =
			(JSON.parse(registryBytes(ctx) ?? '{"hosts":[]}') as { hosts?: { name?: unknown }[] })
				.hosts ?? [];
		return [
			hosts.some((h) => h.name === name) && `${name} still in the registry`,
			existsSync(hostSecretFiles(ctx.privateDir, name).dir) && `${name}'s secret dir still exists`,
			hostRow(panel, name) !== null && `${name} still on the panel`,
		];
	};
	if (viaWidget !== undefined)
		await ctx.book.row(
			`[remove] remove_host (root) ${viaWidget} → gone from registry, secret dir and panel`,
			async () => {
				const a = await act(ctx, ctx.root, ACTIONS.removeHost, { name: viaWidget });
				return problems([
					a.env.ok !== true && `remove_host: ${codeOf(a)}`,
					...(await gone(viaWidget)),
				]);
			},
		);
	if (viaCli !== undefined)
		await ctx.book.row(
			`[remove] the pair CLI removes ${viaCli} → gone from registry, secret dir and panel`,
			async () => {
				const r = pairCli(ctx, pairArgv('remove', viaCli));
				return problems([
					r.code !== PAIR_CLI.exit.ok && `exit ${r.code}: ${r.out.slice(-300)}`,
					...(await gone(viaCli)),
				]);
			},
		);
	await ctx.book.row('[remove] get_value: no host left, registry.state ok', async () => {
		const { panel } = await panelOf(ctx);
		const left = okHosts(panel);
		return problems([
			panel.registryState !== PANEL.registryOk && `registry.state ${panel.registryState}`,
			left.length !== 0 && `rows left: ${left.map((h) => h.name).join(', ')}`,
		]);
	});
}

async function pass(
	ctx: Ctx,
	server: Server,
	shared: Shared,
	name: string,
	first: boolean,
	earlier: readonly string[],
): Promise<void> {
	const scene = await setupScene(server, shared, {
		listen: LISTEN_OF[server],
		// The first pass pushes a REAL v1 release ([lockstep]): php lints for real there.
		...(first ? { phpLint: Bun.which('php') as string } : {}),
	});
	ctx.secrets.push({ label: `the ${server} agent token`, value: scene.token });
	try {
		// LOG_LEVEL info STATED (not the agent's default): [repair] reads the per-request lines.
		const env = writeAgentEnv(scene, 'agent.env', { LOG_LEVEL: 'info' });
		scene.agent = spawnAgent(scene, env, 'agent.log');
		await waitAgent(scene);
		await pairRows(ctx, scene, name);
		await panelRows(ctx, scene, name);
		await fieldsRow(ctx, scene, name);
		await rulesRows(ctx, scene, name);
		await probeRow(ctx, scene, name);
		await authzRows(ctx, scene, name);
		if (first) {
			await releaseRows(ctx, scene, name);
			await lockstepRows(ctx, scene, name);
		}
		if (earlier.length > 0) await multiRow(ctx, scene, name, earlier);
		await repairRows(ctx, scene, name);
		await registryRows(ctx, scene, name);
		await downRows(ctx, scene, name);
		await execRow(ctx, scene, first);
	} finally {
		await teardown(scene);
	}
}

// ── the run ──────────────────────────────────────────────────────────────────

async function stopProcess(proc: ReturnType<typeof Bun.spawn>): Promise<void> {
	proc.kill('SIGTERM');
	await Promise.race([proc.exited, Bun.sleep(8000)]);
	if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL');
	await proc.exited;
}

async function waitEngine(
	origin: string,
	fingerprint: string,
	proc: ReturnType<typeof Bun.spawn>,
	log: string,
): Promise<void> {
	const deadline = Date.now() + 120_000;
	let last = 'no answer yet';
	while (Date.now() < deadline) {
		if (proc.exitCode !== null)
			throw new Error(`the engine exited ${proc.exitCode} at boot:\n${tail(log)}`);
		const served = await probeServedDatabase(origin, 2000).catch((error: unknown) => {
			last = error instanceof Error ? error.message : String(error);
			return null;
		});
		if (served !== null && served.status === 200) {
			assertServedDatabase({ origin, expected: fingerprint, served });
			return;
		}
		if (served !== null) last = `/health ${served.status}`;
		await Bun.sleep(500);
	}
	throw new Error(`the engine never answered /health in 120 s (${last}):\n${tail(log)}`);
}

async function run(
	book: RowBook,
	servers: readonly Server[],
	suiteDb: string,
	root: string,
	privateDir: string,
	cleanups: (() => Promise<unknown>)[],
): Promise<void> {
	const port = await findFreePort(4460);
	const engineEnv: Record<string, string> = {
		...operatorConfig(),
		// Repoints THIS process to the suite database too (DB_NAME, sessions, media root).
		...suiteServerEnvironment({
			suiteDb,
			port,
			socketPath: join(root, 'engine.sock'),
			sessionDbPath: join(root, 'engine_sessions.sqlite'),
			stateFilePath: join(root, 'engine_state.json'),
		}),
		DEDALO_PRIVATE_DIR: privateDir,
		DEDALO_MEDIA_PROCESSES_DIR: markProcessesDir(join(root, 'engine_processes')),
		DEDALO_GEOIP_ENABLED: 'false',
	};
	// From here on, engine modules may load: config will freeze on the suite database.
	const fingerprint = await localSuiteFingerprint();
	const { ensureSuiteLoginPassword, SUITE_LOGIN_PASSWORD } = await import(
		'../src/core/test_data/suite_login.ts'
	);
	await ensureSuiteLoginPassword('root', SUITE_LOGIN_PASSWORD);
	const acl = await import('../test/helpers/acl_identity_fixture.ts');
	await acl.installAclIdentityFixture();
	cleanups.push(() => acl.removeAclIdentityFixture());
	const sessions = await import('../src/core/security/session_store.ts');
	const adminToken = sessions.createSession(acl.ACL_ADMIN_USER_ID, 'zzacl_admin', true);
	const adminCsrf = sessions.getSession(adminToken)?.csrfToken;
	if (adminCsrf === undefined)
		throw new Error('the minted admin session does not read back from the engine session store');
	const rules = await import('../src/core/media/publication_host_rules.ts');
	const { buildNginxMap } = await import('../src/core/media/protection.ts');
	const svg = await import('../src/core/media/svg_safety.ts');
	const mdb = await import('../test/helpers/suite_mariadb.ts');
	const { SUITE_MARIADB_PASSWORD } = await import('../test/helpers/suite_mariadb_env.ts');
	const { zzdTargetDatabases } = await import('../test/helpers/zzd_diffusion_fixture.ts');
	if (!(await mdb.suiteMariadbStatus(suiteDb)).running)
		cleanups.push(() => mdb.stopSuiteMariadb(suiteDb));
	const mariadb = await mdb.ensureSuiteMariadb({ suiteDb });
	const tls = issueTlsMaterial(join(root, 'tls'));
	const bundlePath = join(root, 'engine_bundle', 'engine_bundle.pem');
	writeEngineBundle(bundlePath, tls);
	const shared: Shared = {
		root,
		tls,
		bundles: await buildBundles(root),
		mariadbSocket: mariadb.socket,
		mariadbUser: mdb.SUITE_MARIADB_USER,
		mariadbPassword: SUITE_MARIADB_PASSWORD,
		database: zzdTargetDatabases()[0] as string,
	};
	const engineLog = join(root, 'engine.log');
	const fd = openSync(engineLog, 'a');
	const engine = Bun.spawn([process.execPath, 'run', 'src/server.ts'], {
		cwd: REPO,
		env: engineEnv,
		stdout: fd,
		stderr: fd,
	});
	cleanups.push(() => stopProcess(engine));
	const origin = `http://127.0.0.1:${port}`;
	await waitEngine(origin, fingerprint, engine, engineLog);
	const ctx: Ctx = {
		book,
		origin,
		privateDir,
		engineEnv,
		root: await login(origin, 'root', SUITE_LOGIN_PASSWORD),
		admin: { cookie: `dedalo_ts_session=${adminToken}`, csrf: adminCsrf },
		rules,
		nginxMap: buildNginxMap(),
		svgContract: {
			envelopeCsp: svg.SVG_ENVELOPE_CSP,
			quarantineCsp: svg.SVG_QUARANTINE_CSP,
			quarantineDisposition: svg.SVG_QUARANTINE_DISPOSITION,
			nosniff: svg.MEDIA_NOSNIFF,
		},
		bundlePath,
		secrets: bundleKeySecrets(readFileSync(bundlePath, 'utf8')),
	};
	const names: string[] = [];
	for (const [index, server] of servers.entries()) {
		const name = `drill_${server}`;
		const earlier = [...names];
		names.push(name);
		try {
			await pass(ctx, server, shared, name, index === 0, earlier);
		} catch (error) {
			book.fail(`[${server}] the pass could not run`, error);
		}
	}
	await removalRows(ctx, names);
	await ctx.book.row(
		"[rf5] the live engine's own log (every error path above ran for real) holds no secret",
		() => {
			assertSecretFree('the engine log', readFileSync(engineLog, 'utf8'), ctx.secrets);
			return null;
		},
	);
}

async function main(servers: readonly Server[]): Promise<number> {
	const book = createRowBook();
	const { suiteDb } = resolveSuiteDatabase();
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'dd_pubhost_engine_')));
	const privateDir = join(root, 'private');
	mkdirSync(privateDir, { mode: 0o700 });
	declareScratchPublicationHostsDir(privateDir, 'publication_host_engine_drill');
	const cleanups: (() => Promise<unknown>)[] = [];
	try {
		await run(book, servers, suiteDb, root, privateDir, cleanups);
	} catch (error) {
		book.fail('the drill could not set up', error);
	} finally {
		disarmSeam();
		for (const cleanup of cleanups.reverse()) {
			try {
				await cleanup();
			} catch (error) {
				book.fail('cleanup', error);
			}
		}
		rmSync(root, { recursive: true, force: true });
	}
	const one = servers[0] as Server;
	const narrowed =
		servers.length < 2 ? ` (--only ${one}: the ${LISTEN_OF[one]} transport only)` : '';
	console.log(book.red === 0 ? `\nALL GREEN${narrowed}` : `\n${book.red} RED row(s)`);
	return book.red === 0 ? 0 : 1;
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
	const missing = missingBinaries(servers, ['php']);
	if (missing.length > 0) {
		console.error(
			`RED — missing on PATH: ${missing.join(', ')}. Needs openssl, git, bash, php (CLI), Apache 2.4 + apxs, nginx (engineering/CI.md).`,
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
	if (!existsSync(join(REPO, PAIR_CLI.script))) {
		console.error(`RED — ${PAIR_CLI.script} is missing (the pairing CLI, phase 3 Task 5)`);
		process.exit(1);
	}
	process.exit(await main(servers));
}
