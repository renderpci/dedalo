/**
 * update_drill — THE CODE-UPDATER'S REAL-SCENARIO GATE (`bun run test:update`).
 *
 * The unit gates (test/unit/code_update.test.ts) drive the pipeline through its
 * seams against synthetic trees; the browser suite drives the widget DOM with
 * fake values; the rollback drill stubs systemctl. What NOTHING exercised is
 * the scenario the operator actually lives: two REAL engine processes talking
 * over real HTTP, a release built and served by one, discovered and installed
 * by the other, the serving process dying mid-job BY DESIGN, a supervisor
 * bringing it back on the new tree, and /health answering on the new version.
 *
 * NOTE the smoke boot binds a unix socket UNDER THE SCRATCH DIR, and macOS caps
 * a socket path at 104 bytes. On a machine whose `TMPDIR` is long (the default
 * per-user `/var/folders/…` is ~49 chars) every run dies at `preflight` with
 * "failed its pre-swap boot check". Run it with a short scratch root —
 * `TMPDIR=/tmp/dd bun run test:update` — rather than hunting a phantom bug.
 *
 * `--dev` rehearses the DEVELOPER CHANNEL instead: the release is cut from a
 * branch that is not `master` (so it is built and served as `<v>-dev.zip`) and
 * installed OVER THE SAME VERSION, which is how unreleased branch work reaches
 * a real installation. It is the only pass that proves the identity story —
 * with the version fixed on both sides of the swap, only the installed archive
 * digest can tell the new tree from a rolled-back one.
 *
 * This drill IS that scenario, end to end, entirely on scratch surfaces:
 *
 *   RELEASE.md steps 1–7 (the master side)
 *     1. a throwaway `git clone --shared` of THIS checkout gets the release
 *        commit a human release manager would make (RELEASE.md steps 1–2):
 *        version triple bumped to the rung's TO end + `.bun-version` pinned to
 *        the RUNNING bun, committed on a branch literally named `master`;
 *     2. a REAL master instance boots (suite database, scratch state) with
 *        IS_A_CODE_SERVER + DEDALO_CODE_SERVER_GIT_DIR + DEDALO_CODE_FILES_DIR;
 *     3. the release archive is built THROUGH THE WIRE
 *        (widget_request → build_version_from_git_master), sidecar included;
 *     4. the serving URL is probed anonymously (code_serving.ts).
 *
 *   STAGING_VALIDATION §I1/I2-class assertions (the consumer side)
 *     5. a FULL COPY of this checkout becomes the consumer install, booted
 *        under a supervisor loop (the systemd Restart=always stand-in,
 *        DEDALO_SUPERVISED=true) on its own port/socket/session/state;
 *     6. the maintenance panel's exact wire calls are replayed:
 *        get_widget_value (reachability probe against OUR master) →
 *        get_code_update_info (manifest, code-gated; wrong code refused) →
 *        set_maintenance_mode ON → widget_request update_code;
 *     7. NEGATIVE first: a tampered sha256 must die in the VERIFY phase frame,
 *        leave the live tree byte-identical, no backup dir, no sentinel;
 *     8. then the happy path: {pid,pfile} handle → get_process_status SSE
 *        frames download→…→restart(expected_version) → the process DIES
 *        mid-stream (the designed handoff) → the supervisor respawns the NEW
 *        tree → /health answers the RELEASE version with no .dev tag (both
 *        markers moved — RELEASE.md step 10);
 *     9. disk truth: sentinel status "confirmed" (boot_confirm), exactly one
 *        dedalo_<from>_* backup carrying package.json+node_modules+.git (the
 *        rollback-bootability contract), the quarantine's fresh node_modules
 *        live, staging swept, and one more status poll answering the terminal
 *        `interrupted` frame (the dead-owner contract the client's switch to
 *        health polling leans on).
 *
 * WHAT STANDS IN FOR WHAT (honest limits): the systemd units are a bash loop;
 * the release commit is made in the throwaway clone (never in this checkout);
 * the recent-backup precondition is waived via `waive_backup:true` exactly as
 * the API allows (a real pg_dump of the suite DB adds minutes and tests the
 * backup widget, not the updater). Everything else — build, manifest auth,
 * serving, probe, job stream, refusal battery, swap, restart, boot confirm —
 * is the production code path with no seams.
 *
 * Prerequisites: `bun run test:db:setup` (the drill refuses without the suite
 * database's marker), network for the quarantine's `bun install`, zip/unzip/
 * zipinfo/git on PATH, ~3 GB free in TMPDIR (the consumer copy). Runtime ≈
 * 2–5 min warm. `--keep` leaves the scratch dir for post-mortem.
 *
 * One more honest limit: the consumer copy is configured from a COPY of the
 * live `../private/.env` (0600, inside the scratch dir, swept in `finally`) —
 * a real install is configured by its own file and this is the only way the
 * required keys resolve. `--keep` therefore leaves the operator's real secrets
 * on disk in TMPDIR: delete the scratch dir when the post-mortem is done.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { privateDir, projectRoot } from '../src/config/env.ts';
import { DEDALO_ENGINE_VERSION } from '../src/core/update/build_stamp.ts';
import { UPDATE_CATALOG, type UpdateDescriptor } from '../src/core/update/catalog.ts';
import { compareVersionArrays } from '../src/core/update/version.ts';
import {
	assertServedDatabase,
	findFreePort,
	localSuiteFingerprint,
	probeServedDatabase,
	resolveSuiteDatabase,
} from './client_test_server.ts';

// ---------------------------------------------------------------------------
// Fixed drill facts
// ---------------------------------------------------------------------------

/**
 * THE RUNG THE DRILL REHEARSES, DERIVED AT RUNTIME — never a literal.
 *
 * The pair was hardcoded `7.0.0 → 7.0.1`, which made the drill a bomb timed to
 * the exact moment it matters: cutting 7.0.1 (bumping DEDALO_VERSION_TRIPLE)
 * would have reddened the one gate that rehearses cutting a release.
 *
 * So the rung comes from `UPDATE_CATALOG`, which is the engine's own statement
 * of which upgrades exist: the NEWEST descriptor names both ends —
 * `updateFrom*` is the version a consumer upgrades FROM, `version*` the release
 * it lands on. That is also the pair a release manager just authored, so the
 * drill always rehearses the most recent real release rather than a fossil.
 *
 * Neither end is assumed to equal the running engine: the consumer tree is
 * pinned to `from` and the release clone to `to`, so the drill keeps working
 * when the checkout has already moved past both.
 */
function newestCatalogRung(): { from: number[]; to: number[] } {
	const descriptors = Object.values(UPDATE_CATALOG) as UpdateDescriptor[];
	if (descriptors.length === 0) {
		throw new Error(
			'UPDATE_CATALOG is EMPTY, so there is no upgrade rung to rehearse. The drill will not ' +
				'invent one: the master advertises releases by walking this catalog, so a synthetic ' +
				'target would exercise a path no consumer can reach. Add the descriptor for the next ' +
				'release (engineering/RELEASE.md) and re-run.',
		);
	}
	const newest = descriptors.reduce((best, entry) => {
		const a = [entry.versionMajor, entry.versionMedium, entry.versionMinor];
		const b = [best.versionMajor, best.versionMedium, best.versionMinor];
		return compareVersionArrays(a, b) === 1 ? entry : best;
	});
	return {
		from: [newest.updateFromMajor, newest.updateFromMedium, newest.updateFromMinor],
		to: [newest.versionMajor, newest.versionMedium, newest.versionMinor],
	};
}

/**
 * `--dev` rehearses the DEVELOPER CHANNEL instead of a published rung: the
 * release is built from a branch NOT named `master` (so `code_build_plan.ts`
 * names it `<v>-dev.zip`), the consumer is NOT moved a rung — it installs the
 * SAME version over itself, which is the whole point of the channel.
 *
 * It is the only drill that can prove the identity story: with the version
 * fixed on both sides of the swap, "did the new tree boot?" can only be
 * answered by the installed archive digest (/health `install_digest`), and the
 * rolled-back tree would answer the version check just as happily.
 */
const DEV_CHANNEL_MODE = process.argv.includes('--dev');
/** The branch the release is cut from: `master` publishes, anything else is a dev build. */
const RELEASE_BRANCH = DEV_CHANNEL_MODE ? 'drill_dev_branch' : 'master';

const RUNG = newestCatalogRung();
/** The version the consumer install is pinned to (the upgrade's FROM end). */
const CURRENT_VERSION = RUNG.from.join('.');
/**
 * The version the release clone is bumped to and the master publishes. On the
 * dev channel there IS no bump: a branch build carries the version it was
 * branched from, and installing it over the same version is the feature.
 */
const RELEASE_VERSION = DEV_CHANNEL_MODE ? CURRENT_VERSION : RUNG.to.join('.');
/** The literal `DEDALO_VERSION_TRIPLE` bodies the two trees must carry. */
const CURRENT_TRIPLE_LITERAL = `[${RUNG.from.join(', ')}]`;
const RELEASE_TRIPLE_LITERAL = DEV_CHANNEL_MODE
	? CURRENT_TRIPLE_LITERAL
	: `[${RUNG.to.join(', ')}]`;
/** The archive's file name on each channel (code_build_plan.ts releaseFileName). */
const RELEASE_FILE_NAME = DEV_CHANNEL_MODE
	? `${RELEASE_VERSION}-dev.zip`
	: `${RELEASE_VERSION}.zip`;
/** Shared secret: the consumer's CODE_SERVERS code and the master's accepted code. */
const DRILL_CODE = 'dedalo_update_drill_shared_code';
const API_PATH = '/api/v1/json';
/**
 * The whole-run ceiling. It must stay ABOVE the sum of the per-step budgets
 * below (boots 120s + 150s, streams 180s + 420s, post-restart health 150s,
 * plus the git/copy/build work) — otherwise a cold machine trips this generic
 * deadline instead of the step that is actually slow, and the failure names
 * the wrong thing. Warm runtime is 2–5 min; this is a hang-breaker, not a
 * performance budget.
 */
const TOTAL_DEADLINE_MS = 25 * 60 * 1000;

interface Envelope {
	ok?: boolean;
	request_id?: string;
	data?: unknown;
	msg?: string;
	errors?: string[];
	pid?: number;
	pfile?: string;
	csrf_token?: string;
	error?: { code?: string; message?: string; public_message?: string };
	[key: string]: unknown;
}

interface PhaseFrame {
	phase?: string;
	expected_version?: string;
	message?: string;
	phases?: { id: string; status: string }[];
}

interface JobFrame {
	pid: number | null;
	pfile: string;
	is_running: boolean;
	data: PhaseFrame | null;
	errors: string[];
	total_time: number;
}

interface Auth {
	cookie: string;
	csrf: string;
}

interface HealthBody {
	result?: string;
	version?: string;
	/** sha256 of the installed archive (install_stamp.ts) — the same-version identity. */
	install_digest?: string | null;
	db?: string;
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Wire helpers — exactly what data_manager.request puts on the wire
// ---------------------------------------------------------------------------

let deadline = 0;

function checkDeadline(label: string): void {
	if (Date.now() > deadline) {
		throw new Error(`drill deadline exceeded at: ${label}`);
	}
}

function must(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`FAIL: ${message}`);
	}
}

async function apiPost(
	origin: string,
	body: Record<string, unknown>,
	auth?: Auth,
): Promise<Envelope> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (auth !== undefined) {
		headers.Cookie = auth.cookie;
		headers['X-Dedalo-Csrf-Token'] = auth.csrf;
	}
	const response = await fetch(`${origin}${API_PATH}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
	return (await response.json()) as Envelope;
}

async function wireLogin(origin: string, username: string, password: string): Promise<Auth> {
	const response = await fetch(`${origin}${API_PATH}`, {
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
	const setCookie = response.headers.get('set-cookie') ?? '';
	const json = (await response.json()) as Envelope;
	if (!setCookie.startsWith('dedalo_ts_session=') || typeof json.csrf_token !== 'string') {
		throw new Error(`login failed on ${origin}: http ${response.status}`);
	}
	return { cookie: setCookie.split(';')[0] ?? '', csrf: json.csrf_token };
}

async function fetchHealth(origin: string): Promise<HealthBody> {
	const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(3000) });
	return (await response.json()) as HealthBody;
}

async function waitHealthy(
	origin: string,
	options: { expectedVersion: string; fingerprint: string; timeoutMs: number; label: string },
): Promise<void> {
	const until = Date.now() + options.timeoutMs;
	let last = 'no answer yet';
	let iteration = 0;
	let loggedNullFingerprint = false;
	while (Date.now() < until) {
		checkDeadline(options.label);
		iteration += 1;
		try {
			const served = await probeServedDatabase(origin, 2000);
			if (served.status === 200) {
				if (served.fingerprint === null && !loggedNullFingerprint) {
					loggedNullFingerprint = true;
					console.log(
						`[drill][wait:${options.label}] a 200 without a fingerprint: ${JSON.stringify(await fetchHealth(origin))}`,
					);
				}
				assertServedDatabase({ origin, expected: options.fingerprint, served });
				const body = await fetchHealth(origin);
				if (body.version === options.expectedVersion && body.db === 'ok') return;
				last = `version ${String(body.version)} db ${String(body.db)}`;
			} else {
				last = `/health ${served.status}`;
			}
		} catch (error) {
			last = error instanceof Error ? error.message : String(error);
		}
		if (iteration % 10 === 1) {
			console.log(`[drill][wait:${options.label}] probe ${iteration}: ${last.slice(0, 160)}`);
		}
		await Bun.sleep(500);
	}
	throw new Error(`[${options.label}] ${origin} never became healthy (${last})`);
}

/**
 * Follow the job-status SSE stream until it ends: a terminal frame, server
 * death (the planned restart kills the connection mid-stream), or timeout.
 * Framing per core/api/job_stream.ts: `data:\n{json}` padded with spaces,
 * terminated `\n\n`.
 */
async function followJobStream(
	origin: string,
	auth: Auth,
	pid: number,
	pfile: string,
	timeoutMs: number,
): Promise<JobFrame[]> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const frames: JobFrame[] = [];
	try {
		const response = await fetch(`${origin}${API_PATH}`, {
			method: 'POST',
			signal: controller.signal,
			headers: {
				'Content-Type': 'application/json',
				Cookie: auth.cookie,
				'X-Dedalo-Csrf-Token': auth.csrf,
			},
			body: JSON.stringify({
				dd_api: 'dd_utils_api',
				action: 'get_process_status',
				update_rate: 400,
				prevent_lock: true,
				source: {},
				options: { pid, pfile },
			}),
		});
		if (response.body !== null) {
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			for (;;) {
				checkDeadline('job stream');
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				let boundary = buffer.indexOf('\n\n');
				while (boundary !== -1) {
					const chunk = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					const payload = chunk.replace(/^data:\n/, '').trim();
					try {
						frames.push(JSON.parse(payload) as JobFrame);
					} catch {
						// padding-split artifact — the next chunk carries the rest
					}
					boundary = buffer.indexOf('\n\n');
				}
				const last = frames.at(-1);
				if (last !== undefined && last.is_running !== true) break;
			}
		}
	} catch {
		// connection died mid-stream = the planned restart handoff
	} finally {
		clearTimeout(timer);
	}
	return frames;
}

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

async function runGit(args: string[], label: string): Promise<void> {
	const child = Bun.spawn(['git', ...args], { stdout: 'ignore', stderr: 'pipe' });
	const stderr = await new Response(child.stderr).text();
	if ((await child.exited) !== 0) {
		throw new Error(`git ${args.join(' ')} failed (${label}): ${stderr.trim()}`);
	}
}

interface ManagedProcess {
	stop: () => Promise<void>;
}

function spawnServer(args: string[], cwd: string, env: Record<string, string>): ManagedProcess {
	const child = Bun.spawn(args, { cwd, env, stdio: ['ignore', 'inherit', 'inherit'] });
	console.log(`[drill] spawned pid ${child.pid}: ${args.join(' ')} (cwd ${cwd})`);
	return {
		stop: async () => {
			if (!child.killed) child.kill('SIGTERM');
			await Promise.race([child.exited, Bun.sleep(8000).then(() => undefined)]);
			if (child.exitCode === null) child.kill('SIGKILL');
			await child.exited;
		},
	};
}

/** The systemd Restart=always stand-in: respawn whatever the loop runs, forever. */
function spawnSupervisor(
	command: string,
	cwd: string,
	env: Record<string, string>,
): ManagedProcess {
	const child = Bun.spawn(['/bin/bash', '-c', command], {
		cwd,
		env,
		stdio: ['ignore', 'inherit', 'inherit'],
		detached: true,
	});
	return {
		stop: async () => {
			try {
				process.kill(-child.pid, 'SIGTERM'); // the whole group: bash + current bun
			} catch {
				/* already gone */
			}
			await Promise.race([child.exited, Bun.sleep(6000).then(() => undefined)]);
			try {
				process.kill(-child.pid, 'SIGKILL');
			} catch {
				/* already gone */
			}
			await child.exited;
		},
	};
}

// ---------------------------------------------------------------------------
// The instance environment — every runtime surface scoped to the drill
// ---------------------------------------------------------------------------

function instanceEnvironment(options: {
	suiteDb: string;
	port: number;
	socketPath: string;
	sessionDbPath: string;
	stateFilePath: string;
	scratch: string;
	extra: Record<string, string>;
}): Record<string, string> {
	const role = options.extra.DRILL_ROLE ?? 'instance';
	const backupRoot = join(options.scratch, `${role}_code_backups`);
	mkdirSync(backupRoot, { recursive: true });
	mkdirSync(join(options.scratch, 'ontology_io'), { recursive: true });
	mkdirSync(join(options.scratch, 'transform_definitions'), { recursive: true });
	return {
		DB_NAME: options.suiteDb,
		DEDALO_DATABASE_CONN: options.suiteDb,
		// The spawn env REPLACES the parent environment: without these the server
		// cannot exec its own toolchain (git for the release build, magick probes).
		PATH: process.env.PATH ?? '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
		HOME: process.env.HOME ?? tmpdir(),
		SERVER_TCP_PORT: String(options.port),
		SERVER_UNIX_SOCKET: options.socketPath,
		DEDALO_TS_STATE_PATH: options.stateFilePath,
		DEDALO_SESSION_DB_PATH: options.sessionDbPath,
		DEDALO_MEDIA_PROCESSES_DIR: join(options.scratch, `${role}_processes`),
		DEDALO_BACKUP_PATH: backupRoot,
		ONTOLOGY_DATA_IO_DIR: join(options.scratch, 'ontology_io'),
		DEDALO_TRANSFORM_DEFINITIONS_DIR: join(options.scratch, 'transform_definitions'),
		DEDALO_ONTOLOGY_RECOVERY_PATH: join(options.scratch, 'recovery_dump.sql.gz'),
		DEDALO_GEOIP_ENABLED: 'false',
		DIFFUSION_JOBS_TABLE: 'dedalo_ts_test_drill_diffusion_jobs',
		DIFFUSION_ACTIVITY_TABLE: 'dedalo_ts_test_drill_diffusion_activity',
		DEDALO_DEV_MODE: 'true',
		...options.extra,
	};
}

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

/**
 * The one-line source edit a release commit makes (RELEASE.md step 1), applied
 * to whichever tree needs pinning: the clone to the release version, the
 * consumer copy to the version it upgrades FROM.
 *
 * The match is the GENERIC triple shape, not this release's digits — the whole
 * point of deriving the rung is defeated by a regex that only recognises one
 * version. It is anchored on the `as [number, number, number]` assertion, which
 * exists exactly once in version.ts.
 */
function setVersionTriple(text: string, tripleLiteral: string, whose: string): string {
	const replaced = text.replace(
		/\[\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,?\s*\]\s*\)\s*as\s*\[number,\s*number,\s*number\]/,
		`${tripleLiteral}) as [number, number, number]`,
	);
	if (replaced === text) {
		throw new Error(`could not patch DEDALO_VERSION_TRIPLE in the ${whose}`);
	}
	return replaced;
}

/** The exact body update_code.js::update_code puts on the wire (+ waive_backup). */
function updateRequestBody(file: {
	version: string;
	url: string;
	sha256?: string;
	/** Forwarded VERBATIM from the manifest item — the dev channel travels here. */
	channel?: string;
}): Record<string, unknown> {
	return {
		dd_api: 'dd_area_maintenance_api',
		action: 'widget_request',
		prevent_lock: true,
		source: { type: 'widget', model: 'update_code', action: 'update_code' },
		options: {
			file,
			info: {
				version: RELEASE_VERSION,
				date: new Date().toISOString(),
				entity_id: 1,
				entity: 'drill',
				host: '',
			},
			waive_backup: true,
		},
	};
}

/**
 * The consumer's OLD install: a pristine `git archive HEAD` export plus this
 * checkout's node_modules. A deployed install holds exactly the release's
 * files — never a dev checkout's operator dirs (rewrite/, audits/, agent
 * aliases, .DS_Store) — and the pipeline's ROOT WHITELIST correctly refuses
 * any tree carrying them. Exporting HEAD gives the honest previous release:
 * byte-identical to what the new release replaces, version stamp unexpanded
 * ('.dev' posture included), with nothing untracked at the root.
 */
function materializeConsumer(fromRoot: string, to: string): Promise<void> {
	return (async () => {
		mkdirSync(to, { recursive: true });
		// bun's stdin sink is a FileSink, not a WritableStream — pipe in the shell.
		const child = Bun.spawn(
			['bash', '-c', `git -C '${fromRoot}' archive --format=tar HEAD | tar -x -C '${to}'`],
			{ stdout: 'ignore', stderr: 'inherit' },
		);
		if ((await child.exited) !== 0) {
			throw new Error(`git archive | tar failed (exit ${await child.exited})`);
		}
		// Belt for the same invariant: `.gitattributes` export-ignore already
		// keeps the agent-alias symlinks out of any archive, but a DEPLOYED
		// install never carries them, so neither does the consumer — even if a
		// future alias lands before its rule does.
		for (const alias of ['.claude', 'CLAUDE.md']) {
			rmSync(join(to, alias), { recursive: true, force: true });
		}
		// PIN the consumer to the rung's FROM end. The export carries HEAD's
		// triple, which stops being the upgrade's starting point the moment the
		// checkout moves past it — after cutting a release, HEAD IS the release,
		// and a consumer already on it would be asked to install itself (which
		// assertLinearUpgrade refuses as a same-version install). Idempotent when
		// HEAD already is the FROM end.
		const consumerVersionTs = join(to, 'src', 'core', 'update', 'version.ts');
		writeFileSync(
			consumerVersionTs,
			setVersionTriple(
				readFileSync(consumerVersionTs, 'utf8'),
				CURRENT_TRIPLE_LITERAL,
				'consumer install',
			),
		);
		Bun.spawnSync(['cp', '-R', join(fromRoot, 'node_modules'), join(to, 'node_modules')], {
			stdout: 'ignore',
			stderr: 'inherit',
		});
		if (!existsSync(join(to, 'package.json'))) {
			throw new Error(`consumer materialization failed: ${to} has no package.json`);
		}
	})();
}

/** A sealed state file so neither instance ever boots into the install wizard. */
function sealStateFile(path: string): void {
	mkdirSync(join(path, '..'), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ install_status: 'sealed' })}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	deadline = Date.now() + TOTAL_DEADLINE_MS;
	const keepScratch = process.argv.includes('--keep');
	const { suiteDb } = resolveSuiteDatabase();

	// Point THIS process at the suite database before any engine import freezes
	// a connection (same seam as the client runner); the marker assertion is
	// the drill's proof that it may touch this database at all.
	process.env.DB_NAME = suiteDb;
	process.env.DEDALO_DATABASE_CONN = suiteDb;
	const fingerprint = await localSuiteFingerprint();
	// The ONE media tree both instances serve from — created and marked, so the
	// engine's media-root refusal is armed and the LIVE media root is never
	// resolved (the census's media entry would otherwise fall through to the
	// master's <live private>/media default).
	const { ensureTestMediaRoot } = await import('../test/helpers/test_media_root.ts');
	const testMediaRoot = ensureTestMediaRoot(suiteDb);
	const { ensureSuiteLoginPassword, SUITE_LOGIN_PASSWORD } = await import(
		'../src/core/test_data/suite_login.ts'
	);
	await ensureSuiteLoginPassword('root', SUITE_LOGIN_PASSWORD);

	const scratch = join(tmpdir(), `dedalo_update_drill_${process.pid}_${Date.now()}`);
	mkdirSync(scratch, { recursive: true });

	let master: ManagedProcess | null = null;
	let supervisor: ManagedProcess | null = null;

	try {
		// ---------------------------------------------------------------
		// STEP 1 — the release commit, in a throwaway shared clone
		// ---------------------------------------------------------------
		const cloneDir = join(scratch, 'release_clone');
		console.log('[drill] cloning the checkout for the release commit…');
		await runGit(['clone', '--shared', '--quiet', projectRoot, cloneDir], 'clone');
		const versionTsPath = join(cloneDir, 'src', 'core', 'update', 'version.ts');
		writeFileSync(
			versionTsPath,
			setVersionTriple(
				readFileSync(versionTsPath, 'utf8'),
				RELEASE_TRIPLE_LITERAL,
				'release clone',
			),
		);
		writeFileSync(join(cloneDir, '.bun-version'), Bun.version);
		// The clone INHERITS the repo's export rules — it never repairs them.
		// A drill that patched a missing `export-ignore` would go green on the
		// very regression it exists to catch (the 2026-08-23 alias-symlink bug),
		// so a clone whose archive still carries a symlink entry is a HARD STOP
		// here, pointing at the gate that owns the invariant.
		const exported = Bun.spawnSync(
			['bash', '-c', `git -C '${cloneDir}' archive --format=tar HEAD | tar -tvf -`],
			{ stdout: 'pipe', stderr: 'pipe' },
		);
		const symlinkEntries = exported.stdout
			.toString()
			.split('\n')
			.filter((line) => /^l[rwxsStT-]{9}\s/.test(line));
		must(
			symlinkEntries.length === 0,
			`the release clone's archive carries symlink entries, so the installer ` +
				`would refuse it outright — add the missing \`export-ignore\` rules to ` +
				`.gitattributes (gate: test/unit/release_archive_tripwire.test.ts):\n` +
				symlinkEntries.join('\n'),
		);
		await runGit(['-C', cloneDir, 'add', '-A'], 'add');
		await runGit(
			[
				'-C',
				cloneDir,
				'-c',
				'user.name=update drill',
				'-c',
				'user.email=drill@localhost',
				'commit',
				'-m',
				`release ${RELEASE_VERSION} (update drill)`,
			],
			'commit',
		);
		// Only a ref named `master` claims the published <v>.zip name
		// (code_build_plan.ts). `--dev` deliberately renames to something else, so
		// the build lands as `<v>-dev.zip` — a real developer build, not a release
		// wearing a different name.
		await runGit(['-C', cloneDir, 'branch', '-m', RELEASE_BRANCH], `branch -m ${RELEASE_BRANCH}`);

		// ---------------------------------------------------------------
		// STEPS 2–4 — the MASTER: boot, build through the wire, serve
		// ---------------------------------------------------------------
		const masterPort = await findFreePort(4391);
		const masterOrigin = `http://127.0.0.1:${masterPort}`;
		const codeFilesDir = join(scratch, 'code_files');
		const masterEnv = instanceEnvironment({
			suiteDb,
			port: masterPort,
			socketPath: join(scratch, 'master.sock'),
			sessionDbPath: join(scratch, 'master_sessions.sqlite'),
			stateFilePath: join(scratch, 'master_state.json'),
			scratch,
			extra: {
				DRILL_ROLE: 'master',
				DEDALO_TEST_MEDIA_ROOT: testMediaRoot,
				IS_A_CODE_SERVER: 'true',
				// The master half of the dev channel's TWO switches: without it the
				// master answers a `channel:'dev'` ask with releases only (which the
				// release pass of this drill relies on staying true).
				...(DEV_CHANNEL_MODE ? { DEDALO_CODE_SERVER_DEV_CHANNEL: 'true' } : {}),
				DEDALO_CODE_FILES_DIR: codeFilesDir,
				DEDALO_CODE_SERVER_GIT_DIR: cloneDir,
				CODE_SERVERS: JSON.stringify([
					{ name: 'drill peer', url: `${masterOrigin}${API_PATH}`, code: DRILL_CODE },
				]),
				DEDALO_HOST: `127.0.0.1:${masterPort}`,
				DEDALO_PROTOCOL: 'http://',
			},
		});
		console.log(`[drill] starting the MASTER on ${masterOrigin}…`);
		sealStateFile(join(scratch, 'master_state.json'));
		master = spawnServer([process.execPath, 'run', 'src/server.ts'], projectRoot, masterEnv);
		await waitHealthy(masterOrigin, {
			// The master runs THIS CHECKOUT unpatched, so it answers whatever the
			// engine currently is — which is NOT the rung's FROM end once the
			// checkout has moved past it. Its own version gates nothing here: the
			// manifest keys on the CALLER's version, and the build is asked for an
			// explicit release version below.
			expectedVersion: DEDALO_ENGINE_VERSION,
			fingerprint,
			timeoutMs: 120_000,
			label: 'master boot',
		});

		const masterAuth = await wireLogin(masterOrigin, 'root', SUITE_LOGIN_PASSWORD);
		const built = await apiPost(
			masterOrigin,
			{
				dd_api: 'dd_area_maintenance_api',
				action: 'widget_request',
				prevent_lock: true,
				source: {
					type: 'widget',
					model: 'update_code',
					action: 'build_version_from_git_master',
				},
				options: { version: RELEASE_VERSION, ref: RELEASE_BRANCH },
			},
			masterAuth,
		);
		must(built.ok === true, `master build refused: ${JSON.stringify(built.error ?? built)}`);
		const builtData = built.data as Record<string, unknown>;
		const builtSha = typeof builtData?.sha256 === 'string' ? builtData.sha256 : '';
		must(/^[a-f0-9]{64}$/.test(builtSha), 'built sha256 is not 64 hex chars');

		// The artifact on disk, exactly where RELEASE.md step 6 looks.
		const releaseZip = join(codeFilesDir, '7', '7.0', RELEASE_FILE_NAME);
		must(existsSync(releaseZip), `release archive missing at ${releaseZip}`);
		const sidecarDigest = (
			readFileSync(`${releaseZip}.sha256`, 'utf8').trim().split(/\s+/)[0] ?? ''
		).trim();
		must(sidecarDigest === builtSha, 'sidecar digest does not match the build answer');

		// STEP 4 — the serving URL answers anonymously (code_serving route).
		const manifestBase = `${masterOrigin}/dedalo/install/code`;
		const served = await fetch(`${manifestBase}/${RELEASE_VERSION}/${RELEASE_FILE_NAME}`);
		must(served.ok, `serving URL answered ${served.status}`);
		await served.body?.cancel();

		// ---------------------------------------------------------------
		// STEP 5 — the CONSUMER: a full copy under a supervisor loop
		// ---------------------------------------------------------------
		const consumerTree = join(scratch, 'consumer');
		console.log('[drill] copying the checkout as the consumer install…');
		await materializeConsumer(projectRoot, consumerTree);
		// A real install is configured by its own <private>/.env; give the copy
		// one (the live operator keys, 0600), so the required keys resolve while
		// EVERY runtime surface above stays pinned to the scratch dirs — process
		// env outranks the file, exactly as in production.
		const consumerPrivateDir = join(scratch, 'private');
		mkdirSync(consumerPrivateDir, { recursive: true });
		const consumerEnvFile = join(consumerPrivateDir, '.env');
		writeFileSync(consumerEnvFile, readFileSync(join(privateDir, '.env'), 'utf8'), { mode: 0o600 });
		const consumerBackupRoot = join(scratch, 'consumer_code_backups');
		const consumerPort = await findFreePort(masterPort + 1);
		const consumerOrigin = `http://127.0.0.1:${consumerPort}`;
		const consumerEnv = instanceEnvironment({
			suiteDb,
			port: consumerPort,
			socketPath: join(scratch, 'consumer.sock'),
			sessionDbPath: join(scratch, 'consumer_sessions.sqlite'),
			stateFilePath: join(scratch, 'consumer_state.json'),
			scratch,
			extra: {
				DRILL_ROLE: 'consumer',
				DEDALO_TEST_MEDIA_ROOT: testMediaRoot,
				CODE_SERVERS: JSON.stringify([
					{ name: 'drill master', url: `${masterOrigin}${API_PATH}`, code: DRILL_CODE },
				]),
				// A pure CONSUMER: this role must not depend on the live .env's
				// IS_A_CODE_SERVER (the panel asserts the negative) nor inherit its
				// code-master paths — census-registered keys an operator points at
				// THEIR master would land inside this tree and refuse the swap.
				IS_A_CODE_SERVER: 'false',
				DEDALO_CODE_FILES_DIR: '',
				DEDALO_CODE_SERVER_GIT_DIR: '',
				DEDALO_SOURCE_VERSION_LOCAL_DIR: '',
				DEDALO_SUPERVISED: 'true',
			},
		});
		consumerEnv.BUN = process.execPath;
		// The loop must RE-RESOLVE the app path every iteration: after the swap
		// renames, the shell's inherited cwd follows the OLD tree's inode into
		// the backup dir (systemd re-resolves WorkingDirectory per spawn — this
		// is the same contract).
		consumerEnv.APP_DIR = consumerTree;
		const supervisedLoop =
			'while :; do cd "$APP_DIR" || exit 9; "$BUN" run src/server.ts; code=$?; echo "[supervisor] exit $code — respawning"; sleep 0.3; done';
		console.log(`[drill] starting the CONSUMER on ${consumerOrigin} under a supervisor…`);
		sealStateFile(join(scratch, 'consumer_state.json'));
		supervisor = spawnSupervisor(supervisedLoop, consumerTree, consumerEnv);
		await waitHealthy(consumerOrigin, {
			// A git-archive export is a RELEASE tree: its build stamp is expanded
			// (export-subst), so it self-identifies WITHOUT the '.dev' tag.
			expectedVersion: CURRENT_VERSION,
			fingerprint,
			timeoutMs: 150_000,
			label: 'consumer boot',
		});
		const consumerAuth = await wireLogin(consumerOrigin, 'root', SUITE_LOGIN_PASSWORD);
		const livePackageJsonBefore = readFileSync(join(consumerTree, 'package.json'), 'utf8');

		// ---------------------------------------------------------------
		// STEP 6a — the panel value: our master probes reachable
		// ---------------------------------------------------------------
		const panel = await apiPost(
			consumerOrigin,
			{
				dd_api: 'dd_area_maintenance_api',
				action: 'get_widget_value',
				prevent_lock: true,
				source: { model: 'update_code' },
			},
			consumerAuth,
		);
		must(panel.ok === true, `get_widget_value refused: ${JSON.stringify(panel.error ?? panel)}`);
		const panelData = panel.data as {
			servers: Record<string, unknown>[];
			is_a_code_server: boolean;
		};
		must(Array.isArray(panelData.servers) && panelData.servers.length >= 1, 'no servers listed');
		must(panelData.servers[0]?.response_code === 200, 'our master did not probe reachable');
		must(panelData.is_a_code_server === false, 'consumer misreports itself a code server');

		// ---------------------------------------------------------------
		// STEP 6b — the manifest: code-gated, advertising exactly one rung
		// ---------------------------------------------------------------
		const manifest = await apiPost(masterOrigin, {
			dd_api: 'dd_utils_api',
			action: 'get_code_update_info',
			prevent_lock: true,
			source: {},
			options: {
				version: CURRENT_VERSION,
				code: DRILL_CODE,
				...(DEV_CHANNEL_MODE ? { channel: 'dev' } : {}),
			},
		});
		must(manifest.ok === true, `manifest refused: ${JSON.stringify(manifest.error ?? manifest)}`);
		const info = manifest.data as {
			files: { version: string; url: string; sha256?: string; channel?: string }[];
			info: { version: string };
		};
		// `info.version` is the MASTER's OWN version (code_manifest.ts passes
		// `serverVersion: DEDALO_VERSION_TRIPLE`), NOT the rung's FROM end — the
		// two only coincided while this checkout still sat on 7.0.0. The master
		// here runs this unpatched checkout, so the honest expectation is the
		// running engine's data version: DEDALO_ENGINE_VERSION minus its
		// prerelease tag, which is what the manifest reports.
		const masterDataVersion = DEDALO_ENGINE_VERSION.replace(/\.dev$/, '');
		must(
			info.info.version === masterDataVersion,
			`manifest reports server version ${info.info.version}, expected ${masterDataVersion}`,
		);
		// On the dev channel the master answers with the developer build FIRST and
		// may add published rungs behind it; on the release channel it is exactly
		// the one rung.
		must(
			Array.isArray(info.files) &&
				(DEV_CHANNEL_MODE ? info.files.length >= 1 : info.files.length === 1),
			`expected ${DEV_CHANNEL_MODE ? 'at least the developer build' : `exactly the ${RELEASE_VERSION} rung`}`,
		);
		const file = info.files[0] as {
			version: string;
			url: string;
			sha256?: string;
			channel?: string;
		};
		must(file.version === RELEASE_VERSION, 'wrong rung advertised');
		if (DEV_CHANNEL_MODE) {
			must(file.channel === 'dev', 'the developer build is not marked channel:dev');
			must(file.url.endsWith('-dev.zip'), `the advertised URL is not the dev archive: ${file.url}`);
			// The point of the whole exercise: the version does NOT move.
			must(file.version === CURRENT_VERSION, 'the dev build should carry the INSTALLED version');
		}
		must(new URL(file.url).origin === new URL(manifestBase).origin, 'manifest URL off-origin');
		must(file.sha256 === builtSha, 'advertised digest differs from the sidecar');

		const badCode = await apiPost(masterOrigin, {
			dd_api: 'dd_utils_api',
			action: 'get_code_update_info',
			prevent_lock: true,
			source: {},
			options: { version: CURRENT_VERSION, code: 'not_the_code' },
		});
		must(
			badCode.ok !== true && badCode.error?.code === 'update_server.refused',
			'a wrong code must be refused with update_server.refused',
		);

		// ---------------------------------------------------------------
		// STEP 6c — maintenance mode ON, through the operator's own action
		// ---------------------------------------------------------------
		const flipped = await apiPost(
			consumerOrigin,
			{
				dd_api: 'dd_area_maintenance_api',
				action: 'widget_request',
				prevent_lock: true,
				source: { type: 'widget', model: 'check_config', action: 'set_maintenance_mode' },
				options: { value: true },
			},
			consumerAuth,
		);
		must(flipped.ok === true, `set_maintenance_mode refused: ${JSON.stringify(flipped.error)}`);

		// ---------------------------------------------------------------
		// STEP 7 — NEGATIVE: a tampered digest dies in VERIFY, touches nothing
		// ---------------------------------------------------------------
		console.log('[drill] submitting the TAMPERED-digest update (must fail in verify)…');
		const tampered = await apiPost(
			consumerOrigin,
			updateRequestBody({ ...file, sha256: 'a'.repeat(64) }),
			consumerAuth,
		);
		must(tampered.ok === true, 'tampered submit should still answer ok (background job)');
		const tamperedPid = typeof tampered.pid === 'number' ? tampered.pid : 0;
		const tamperedPfile = typeof tampered.pfile === 'string' ? tampered.pfile : '';
		must(tamperedPid !== 0 && tamperedPfile !== '', 'no pid/pfile handle returned');
		const tamperedFrames = await followJobStream(
			consumerOrigin,
			consumerAuth,
			tamperedPid,
			tamperedPfile,
			180_000,
		);
		const lastTampered = tamperedFrames.at(-1);
		must(
			lastTampered !== undefined && lastTampered.is_running === false,
			'tampered job never ended',
		);
		must(
			JSON.stringify(tamperedFrames.map((frame) => frame.data)).includes('checksum mismatch'),
			'verify phase did not report the mismatch',
		);
		const healthyAfterNegative = await fetchHealth(consumerOrigin);
		must(healthyAfterNegative.version === CURRENT_VERSION, 'server moved off the old version');
		must(
			readFileSync(join(consumerTree, 'package.json'), 'utf8') === livePackageJsonBefore,
			'live tree changed on a refused update',
		);
		must(
			readdirSync(consumerBackupRoot).filter((n) => n.startsWith('dedalo_')).length === 0,
			'a backup dir appeared on a refused update',
		);
		must(
			!existsSync(join(consumerBackupRoot, 'last_code_update.json')),
			'a sentinel appeared on a refused update',
		);

		// ---------------------------------------------------------------
		// STEP 8 — HAPPY PATH: install the release across a planned restart
		// ---------------------------------------------------------------
		console.log(
			`[drill] installing ${RELEASE_VERSION} (the stream will DIE at restart — by design)…`,
		);
		const submitted = await apiPost(consumerOrigin, updateRequestBody(file), consumerAuth);
		must(submitted.ok === true, `update submit refused: ${JSON.stringify(submitted.error)}`);
		const pid = typeof submitted.pid === 'number' ? submitted.pid : 0;
		const pfile = typeof submitted.pfile === 'string' ? submitted.pfile : '';
		must(pid !== 0 && pfile !== '', 'no pid/pfile handle returned');

		const frames = await followJobStream(consumerOrigin, consumerAuth, pid, pfile, 420_000);
		const phases = frames
			.map((frame) => frame.data?.phase)
			.filter((p): p is string => typeof p === 'string');
		console.log(
			`[drill] phases streamed: ${phases.join(' -> ') || '<connection died before frames>'}`,
		);
		const restartFrame = frames.find((frame) => frame.data?.phase === 'restart');
		if (restartFrame !== undefined) {
			must(
				restartFrame.data?.expected_version === RELEASE_VERSION,
				'restart frame lacks expected_version',
			);
		}

		// The supervisor brings the NEW tree up; /health must answer the release.
		//
		// ON THE DEV CHANNEL THE VERSION CANNOT BE THE PROOF. The installed tree
		// carries the version it replaced, so the string only gains its `.dev`
		// tag (install_stamp channel → build_stamp) — and a ROLLED-BACK tree
		// would answer with a version just as expected-looking. What actually
		// separates the two is `install_digest`: the sha256 of the archive that
		// was verified and swapped in.
		const expectedHealthVersion = DEV_CHANNEL_MODE ? `${RELEASE_VERSION}.dev` : RELEASE_VERSION;
		const healthLanded = (body: HealthBody): boolean =>
			body.db === 'ok' &&
			body.version === expectedHealthVersion &&
			(!DEV_CHANNEL_MODE || body.install_digest === builtSha);
		const healthUntil = Date.now() + 150_000;
		let health: HealthBody = {};
		while (Date.now() < healthUntil) {
			checkDeadline('post-restart health');
			try {
				health = await fetchHealth(consumerOrigin);
				if (healthLanded(health)) break;
			} catch {
				/* down — keep polling */
			}
			await Bun.sleep(700);
		}
		must(
			health.version === expectedHealthVersion,
			`server never came back on ${expectedHealthVersion}: ${JSON.stringify(health)}`,
		);
		if (DEV_CHANNEL_MODE) {
			must(
				health.install_digest === builtSha,
				`/health names archive ${String(health.install_digest)}, expected the one just installed (${builtSha}) — a same-version rollback looks exactly like this`,
			);
			console.log('[drill] /health install_digest matches the installed archive');
		}
		console.log(`[drill] /health answers ${String(health.version)} — the new tree is LIVE`);

		// ---------------------------------------------------------------
		// STEP 9 — the disk truth after a successful update
		// ---------------------------------------------------------------
		// boot_confirm flips the sentinel once the RUNNING version matches.
		const sentinelPath = join(consumerBackupRoot, 'last_code_update.json');
		const sentinelUntil = Date.now() + 30_000;
		let sentinel: Record<string, unknown> = {};
		while (Date.now() < sentinelUntil) {
			try {
				sentinel = JSON.parse(readFileSync(sentinelPath, 'utf8')) as Record<string, unknown>;
				if (sentinel.status === 'confirmed') break;
			} catch {
				/* not written yet */
			}
			await Bun.sleep(500);
		}
		must(sentinel.status === 'confirmed', `sentinel not confirmed: ${JSON.stringify(sentinel)}`);
		must(
			sentinel.version === RELEASE_VERSION && sentinel.previousVersion === CURRENT_VERSION,
			'sentinel names the wrong versions',
		);
		must(
			sentinel.installDigest === builtSha,
			`sentinel installDigest ${String(sentinel.installDigest)} is not the installed archive ${builtSha}`,
		);
		if (DEV_CHANNEL_MODE) {
			// The confirmation above is only meaningful BECAUSE the digest differs
			// while the versions do not: boot_confirm compared versions until
			// 2026-08-24, and on this exact path that check confirms a rollback.
			must(
				sentinel.version === sentinel.previousVersion,
				'the dev drill is not rehearsing a same-version install',
			);
			const stamp = JSON.parse(
				readFileSync(join(consumerTree, 'src', 'core', 'update', 'install_stamp.json'), 'utf8'),
			) as Record<string, unknown>;
			must(stamp.digest === builtSha, 'the installed tree is stamped with another archive');
			must(stamp.channel === 'dev', 'the installed tree does not know it is a developer build');
		}

		const backups = readdirSync(consumerBackupRoot).filter((n) => n.startsWith('dedalo_'));
		must(backups.length === 1, `expected exactly one backup dir, got ${backups.join(', ')}`);
		const backupDir = join(consumerBackupRoot, backups[0] as string);
		for (const carried of ['package.json', 'node_modules']) {
			must(existsSync(join(backupDir, carried)), `backup lost ${carried} (rollback bootability)`);
		}
		must(
			existsSync(join(consumerTree, 'node_modules')),
			'new tree has no node_modules (quarantine install missing)',
		);
		must(!existsSync(join(consumerBackupRoot, '.code_staging')), 'staging dir was not swept');
		// NOTE on the dev channel this says little (both trees declare the same
		// triple) — the load-bearing tree assertion there is the install stamp
		// checked above, which names the exact archive.
		must(
			readFileSync(join(consumerTree, 'src', 'core', 'update', 'version.ts'), 'utf8').includes(
				RELEASE_TRIPLE_LITERAL,
			),
			`live tree is not the ${RELEASE_VERSION} code`,
		);
		must(
			!readFileSync(join(consumerTree, 'src', 'core', 'update', 'build_info.txt'), 'utf8').includes(
				'$Format:',
			),
			'build stamp did not expand (RELEASE.md step 10)',
		);

		// The final poll answers ONE terminal frame. Which one depends on timing
		// (both are correct): the job HANDLER returns before the deferred exit,
		// so the record is usually already 'done' carrying the pipeline's
		// installed-version envelope; if death won the race, the new boot's
		// dead-owner reconcile marks it 'interrupted' instead.
		const interrupted = await followJobStream(consumerOrigin, consumerAuth, pid, pfile, 15_000);
		const terminal = interrupted[0];
		must(
			terminal !== undefined && terminal.is_running === false,
			'no terminal frame after the restart',
		);
		const terminalText = JSON.stringify(interrupted);
		must(
			terminalText.includes('interrupted') ||
				terminalText.includes(`Installed Dédalo ${RELEASE_VERSION}`),
			`terminal frame neither interrupted nor the installed-version result: ${terminalText.slice(0, 300)}`,
		);

		console.log(
			`[drill] PASS — build -> serve -> discover -> refuse-bad-sha -> install -> planned-death restart -> confirmed sentinel.`,
		);
	} finally {
		if (supervisor !== null) await supervisor.stop();
		if (master !== null) await master.stop();
		if (keepScratch) {
			console.log(`[drill] --keep: scratch left at ${scratch}`);
		} else {
			rmSync(scratch, { recursive: true, force: true });
		}
	}
}

try {
	await main();
	process.exit(0);
} catch (error) {
	console.error(
		`\n[drill] ${(error instanceof Error ? error.stack : String(error)) ?? 'unknown failure'}`,
	);
	process.exit(1);
}
