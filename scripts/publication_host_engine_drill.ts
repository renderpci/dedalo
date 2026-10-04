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
 *             (Review Focus 3); a re-provisioned agent: pairing_mismatch — never `auth`,
 *             which would mean the bearer left before the proof — nothing applied, until the
 *             CLI re-pairs (Review Focus 1); a frozen agent → timeout|unreachable in bounded
 *             time, a dead one → unreachable, the registry byte-identical (Review Focus 4);
 *             a truncated or hand-edited registry → registry.state registry_invalid with
 *             hosts null, never an empty list, never rewritten, apply refused (Review Focus 2).
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
 * like the agent drill, runs only inside the CI image), php as a refusing PHP_BIN (the
 * shared scene, scripts/lib/publication_host_agent_scene.ts). The releases rollback_api
 * undoes are planted through the agent's own wire (engine install is
 * phase 4). HONEST LIMITS: "no agent call was made" for a refused action is proved by its
 * EFFECT here (no stand-in call, registry and include unchanged), made observable first: the
 * [authz] and [repair] pairing_mismatch rows move the expected rules off the live include
 * (withDivergedRules), so a leaked apply_rules WOULD configtest, reload and rewrite; a leaked
 * rollback_api is observable only in [release] (a previous release exists — the [authz] row's
 * rollback attempt, before any release, rests on its error code); that the client never
 * dials is the Task 7 widget gate. RF5 scans CENTRALLY: every engine answer (get_value and
 * every action, any status) and every pair-CLI output (any exit code) — the foreign token
 * included — plus the registry file; the fragment is rendered with the agent renderer's
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
 * CI image's exec seam), the suite database (`bun run test:db:setup`) and
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
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { SUDO, SYSTEMCTL } from '../publication/host_agent/src/exec.ts';
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
import { execSeamProblem, issueTlsMaterial } from './lib/publication_host_agent_drill_kit.ts';
import {
	AGENT_DIR,
	buildBundles,
	callsSince,
	configtestCall,
	createRowBook,
	disarmSeam,
	eventually,
	INSTANCE,
	inClosedSet,
	type Listen,
	logLines,
	missingBinaries,
	PUBLISHED,
	postRelease,
	problems,
	QUALITIES,
	REPO,
	type RowBook,
	releaseDir,
	reloadCall,
	restartAgent,
	restartCall,
	type Scene,
	type Server,
	type Shared,
	setupScene,
	spawnAgent,
	tail,
	teardown,
	UNPUBLISHED,
	v2Health,
	waitAgent,
	writeAgentEnv,
} from './lib/publication_host_agent_scene.ts';
import {
	ACTIONS,
	assertSecretFree,
	BUNDLE_PLACEHOLDER,
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
	TOKEN_PLACEHOLDER,
	writeEngineBundle,
} from './lib/publication_host_engine_drill_kit.ts';

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
		`${s} apply_rules (root) → configtest then reload; published 200, unpublished 404 through ${scene.server}; reported = expected`,
		async () => {
			const since = logLines(scene).length;
			const want = expectedHash(ctx, scene);
			const a = await act(ctx, ctx.root, ACTIONS.applyRules, { name });
			if (a.env.ok !== true) return `apply_rules: ${codeOf(a)}`;
			const host = await rowOf(ctx, name);
			return problems([
				(a.env.data as { hash?: unknown } | undefined)?.hash !== want &&
					`answer ${a.text.slice(0, 200)}`,
				callsSince(scene, since, [configtestCall(scene.server), reloadCall(scene.server)]),
				await eventually(() => mediaStatus(ctx, scene, PUBLISHED), 200),
				await eventually(() => mediaStatus(ctx, scene, UNPUBLISHED), 404),
				!(includeBytes(scene) ?? '').includes(`# config-hash: ${want}`) &&
					'the live include does not carry the expected stamp',
				host.rules.reported !== want && `rules.reported ${host.rules.reported}`,
				checkState(host, 'rules_hash') !== 'ok' &&
					`check rules_hash ${checkState(host, 'rules_hash')}`,
			]);
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
		`${s} apply_rules (expected rules diverged first) → publication_host.pairing_mismatch; nothing applied, registry unchanged`,
		() =>
			withDivergedRules(ctx, scene, name, async () => {
				const since = logLines(scene).length;
				const registry = registryBytes(ctx);
				const include = includeBytes(scene);
				const code = codeOf(await act(ctx, ctx.root, ACTIONS.applyRules, { name }));
				return problems([
					code !== 'publication_host.pairing_mismatch' &&
						`code ${code}${code === 'publication_host.auth' ? ' — the bearer was SENT before the pairing was proved' : ''}`,
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

async function execRow(ctx: Ctx, scene: Scene): Promise<void> {
	await ctx.book.row(
		`[${scene.server}][exec] every stand-in call was in the closed set; php never called`,
		() => {
			const stray = logLines(scene).filter((line) => !inClosedSet(scene, line));
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
	nginxMap: string,
): Promise<void> {
	const scene = await setupScene(server, shared, { listen: LISTEN_OF[server], nginxMap });
	ctx.secrets.push({ label: `the ${server} agent token`, value: scene.token });
	try {
		scene.agent = spawnAgent(scene, writeAgentEnv(scene, 'agent.env'), 'agent.log');
		await waitAgent(scene);
		await pairRows(ctx, scene, name);
		await panelRows(ctx, scene, name);
		await fieldsRow(ctx, scene, name);
		await rulesRows(ctx, scene, name);
		await probeRow(ctx, scene, name);
		await authzRows(ctx, scene, name);
		if (first) await releaseRows(ctx, scene, name);
		if (earlier.length > 0) await multiRow(ctx, scene, name, earlier);
		await repairRows(ctx, scene, name);
		await registryRows(ctx, scene, name);
		await downRows(ctx, scene, name);
		await execRow(ctx, scene);
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
		bundles: buildBundles(root),
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
		bundlePath,
		secrets: bundleKeySecrets(readFileSync(bundlePath, 'utf8')),
	};
	const names: string[] = [];
	for (const [index, server] of servers.entries()) {
		const name = `drill_${server}`;
		const earlier = [...names];
		names.push(name);
		try {
			await pass(ctx, server, shared, name, index === 0, earlier, buildNginxMap());
		} catch (error) {
			book.fail(`[${server}] the pass could not run`, error);
		}
	}
	await removalRows(ctx, names);
}

async function main(servers: readonly Server[]): Promise<number> {
	const book = createRowBook();
	const { suiteDb } = resolveSuiteDatabase();
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'dd_pubhost_engine_')));
	const privateDir = join(root, 'private');
	mkdirSync(privateDir, { mode: 0o700 });
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
	if (!existsSync(join(REPO, PAIR_CLI.script))) {
		console.error(`RED — ${PAIR_CLI.script} is missing (the pairing CLI, phase 3 Task 5)`);
		process.exit(1);
	}
	process.exit(await main(servers));
}
