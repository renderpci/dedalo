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
 *   copy       (phase 5, PUBLICATION_HOST_SPEC.md §5.2) a SECOND agent with MEDIA_MODE=copy
 *              over an empty copy root; the ENGINE side in child processes on the suite
 *              database (scripts/lib/publication_host_copy_engine.ts — why a child: its
 *              header): pair → rules over the COPY root → publish → reconcile → exactly the
 *              public files + the pub/ marker on the agent, gate 200 → unpublish through the
 *              REAL hook (the started copy worker) with the agent's deletes made to FAIL
 *              (quality dir 0555) → marker gone FIRST (404) while the bytes remain, deletion
 *              pending → reconcile → verified gone; agent DOWN during an unpublish → the
 *              marker's withdrawal pending, still served (no channel, no withdrawal) →
 *              completed on its return.
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
 *
 * THE SCENE (the agent, its stand-ins, the web server, the bundles, the row book) lives in
 * scripts/lib/publication_host_agent_scene.ts, shared with the engine drill
 * (scripts/publication_host_engine_drill.ts): one scene, never two.
 */

import { randomBytes } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { SUDO, SYSTEMCTL } from '../publication/host_agent/src/exec.ts';
import { envSnapshot } from '../src/config/env.ts';
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
import type { HostRuntime } from '../src/core/publication_host/runtime.ts';
import { declareScratchPublicationHostsDir } from '../src/core/publication_host/test_marker.ts';
import {
	ensureSuiteMariadb,
	stopSuiteMariadb,
	suiteMariadbStatus,
} from '../test/helpers/suite_mariadb.ts';
import { SUITE_MARIADB_PASSWORD, SUITE_MARIADB_USER } from '../test/helpers/suite_mariadb_env.ts';
import { markProcessesDir, TEST_MEDIA_MARKER } from '../test/helpers/test_media_root.ts';
import { zzdTargetDatabases } from '../test/helpers/zzd_diffusion_fixture.ts';
import { resolveSuiteDatabase } from './client_test_server.ts';
import {
	execSeamProblem,
	issueTlsMaterial,
	sha256Hex,
} from './lib/publication_host_agent_drill_kit.ts';
import {
	ACTOR,
	AGENT_DIR,
	agentFetch,
	agentStatus,
	BASE,
	type Bundle,
	buildBundles,
	callsSince,
	configtestCall,
	createRowBook,
	disarmSeam,
	eventually,
	INSTANCE,
	inClosedSet,
	logLines,
	MAX_BUNDLE_BYTES,
	MAX_BUNDLE_ENTRIES,
	missingBinaries,
	PUBLISHED,
	postRelease,
	problems,
	QUALITIES,
	REPO,
	refused,
	releaseDir,
	reloadCall,
	restartCall,
	type Scene,
	type Server,
	type Shared,
	scratchCalls,
	setupScene,
	spawnAgent,
	tail,
	teardown,
	UNPUBLISHED,
	v2Health,
	WIRE,
	waitAgent,
	writeAgentEnv,
} from './lib/publication_host_agent_scene.ts';
import {
	COPY_DRILL_HOST,
	COPY_DRILL_PRIVATE_MARKER,
	type CopyEngineCommand,
	type CopyPlanView,
	copyEngineEnv,
	listTree,
	type ManifestView,
	parseDrillResult,
	type ReconcileView,
	type RulesView,
	type UnpublishView,
} from './lib/publication_host_copy_drill_kit.ts';
import { writeEngineBundle } from './lib/publication_host_engine_drill_kit.ts';

export { missingBinaries };

const book = createRowBook();
const { row } = book;

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
	const install = (bundle: Bundle) => postRelease(scene, bundle);
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
			const stray = logLines(scene).filter((line) => !inClosedSet(scene, line));
			return stray.length === 0 ? null : `outside the closed set: ${stray.join(' | ')}`;
		},
	);
}

async function pass(server: Server, shared: Shared, first: boolean): Promise<void> {
	const scene = await setupScene(server, shared, { listen: 'tls', nginxMap: buildNginxMap() });
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

// ── the copy pass (phase 5) ──────────────────────────────────────────────────

/*
 * THE COPY PASS — PUBLICATION_HOST_SPEC §5.2 on real processes. A second agent with
 * MEDIA_MODE=copy over an EMPTY copy root, the phase-1 publication_host profile rendered
 * over that root (one gate code path for both modes), and the ENGINE side (registry,
 * client, planner, copy apply, reconcile, the copy worker) run in child processes
 * (scripts/lib/publication_host_copy_engine.ts — why a child: its header). The child's
 * private dir and WORK media root are scratch dirs that declare themselves (marker
 * files); every child asserts the suite database's marker first.
 *
 * What stands in for what: a publish is left to MEDIA_COPY_RECONCILE (the correctness
 * path, M3); an unpublish goes through the REAL latency hook — the child starts the copy
 * worker as server.ts does, withdraws the work marker, and the pub/ flip reaches the
 * worker (immediate withdrawal, then the host's lane run). Review Focus 2's interleaving
 * (a put in flight vs an unpublish) stays Task 9's hermetic gate: no live timing can pin
 * it. The failing delete is a REAL filesystem fault (the copy root's quality dir made
 * 0555; the agent refuses root, so chmod binds it), not a seam. With the agent DOWN no
 * channel exists: what the engine can know is that the key's withdrawal is owed (its
 * agent marker, pending); the public gate keeps serving until the agent returns — stated
 * by a row, never hidden.
 */

const COPY_ENGINE = join(REPO, 'scripts', 'lib', 'publication_host_copy_engine.ts');
const ENGINE_CHILD_TIMEOUT_MS = 120_000;
const COPY_KEY = 'test3_1';
/** The agent-side marker path, as the runtime records its withdrawal (agentMarkerPath). */
const COPY_MARKER_PATH = `.publication/pub/${COPY_KEY}`;
/** The published record's two public files, sorted: exactly what the plan must name. */
const COPY_PUBLISHED = [
	'image/thumb/0/test88_test3_1_lg-spa.jpg',
	'image/thumb/0/test99_test3_1.jpg',
] as const;
const ALL_PENDING = JSON.stringify([...COPY_PUBLISHED]);
/** Work-side files that must NEVER reach the agent, each for its own reason. */
const COPY_NEVER = {
	master: 'image/original/0/test99_test3_1.tif',
	non_public_quality: 'image/1.5MB/0/test99_test3_1.jpg',
	working_file: 'image/thumb/0/test99_test3_1.tmp',
	unparseable_name: 'image/thumb/0/renamed_by_hand.jpg',
	unpublished_record: 'image/thumb/0/test99_test3_2.jpg',
} as const;
/** The agent-side directory made read-only to stage the failing delete. */
const COPY_LOCKED_DIR = 'image/thumb/0';
const COPY_MANIFEST = `${BASE}/v1/media/manifest`;

type MediaCopyRuntime = HostRuntime['media_copy'];

interface CopyScene {
	readonly scene: Scene;
	/** The engine's WORK media root (marked .dedalo_test_media): marker store + media files. */
	readonly work: string;
	/** The engine's scratch private dir (marked): registry, secrets, runtime, sha cache. */
	readonly enginePrivate: string;
	readonly engineEnv: Record<string, string>;
	/** The copy agent's env file, reused when it is restarted. */
	readonly agentEnv: string;
	/** Stand-in log length after the rules apply: the media commands may spawn nothing. */
	execSince: number;
	/** last_verified_at after the first verified deletion; the agent-down leg must advance it. */
	lastVerified: string | null;
}

function copyWorkFiles(): Record<string, Uint8Array> {
	const text = (value: string) => new TextEncoder().encode(value);
	return {
		// 5 MiB: a streamed put over many chunks, hashed both sides.
		[COPY_PUBLISHED[0]]: randomBytes(5 * 2 ** 20),
		[COPY_PUBLISHED[1]]: randomBytes(3000),
		[COPY_NEVER.master]: text('TIFF master: never leaves the work host'),
		[COPY_NEVER.non_public_quality]: text('a quality that is not public'),
		[COPY_NEVER.working_file]: text('a working file the hardening denies to everyone'),
		[COPY_NEVER.unparseable_name]: text('no record in its name: login-only by design'),
		[COPY_NEVER.unpublished_record]: text('a record nobody published'),
	};
}

function prepareCopy(scene: Scene): CopyScene {
	const { suiteDb } = resolveSuiteDatabase();
	const work = join(scene.dir, 'work_media');
	mkdirSync(work, { recursive: true });
	writeFileSync(
		join(work, TEST_MEDIA_MARKER),
		'publication-host copy drill: the scratch WORK media root\n',
	);
	for (const [rel, bytes] of Object.entries(copyWorkFiles())) {
		mkdirSync(dirname(join(work, rel)), { recursive: true });
		writeFileSync(join(work, rel), bytes);
	}
	const enginePrivate = join(scene.dir, 'engine_private');
	mkdirSync(enginePrivate, { recursive: true, mode: 0o700 });
	declareScratchPublicationHostsDir(enginePrivate, 'publication_host_agent_drill (copy pass)');
	writeFileSync(
		join(enginePrivate, COPY_DRILL_PRIVATE_MARKER),
		'publication-host copy drill: the scratch engine private dir\n',
	);
	return {
		scene,
		work,
		enginePrivate,
		engineEnv: copyEngineEnv({
			base: envSnapshot(),
			privateDir: enginePrivate,
			suiteDb,
			mediaRoot: work,
			processesDir: markProcessesDir(`${work}.processes`),
		}),
		agentEnv: writeAgentEnv(scene, 'agent_copy.env', { MEDIA_MODE: 'copy' }),
		execSince: 0,
		lastVerified: null,
	};
}

/** One engine command in a fresh child; a failure result or a refusal throws (→ RED row). */
async function engine<T>(
	copy: CopyScene,
	command: CopyEngineCommand,
	...args: string[]
): Promise<T> {
	const proc = Bun.spawn([process.execPath, 'run', COPY_ENGINE, command, ...args], {
		cwd: REPO,
		env: copy.engineEnv,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const timer = setTimeout(() => proc.kill('SIGKILL'), ENGINE_CHILD_TIMEOUT_MS);
	try {
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		await proc.exited;
		const result = parseDrillResult(stdout, stderr);
		if (!result.ok) throw new Error(`engine ${command} failed: ${result.error}`);
		return result.value as T;
	} finally {
		clearTimeout(timer);
	}
}

const gateUrl = (scene: Scene, rel: string) =>
	`http://127.0.0.1:${scene.webPort}${publicationHostMediaUrl()}/${rel}`;

async function gateIs(
	scene: Scene,
	rels: readonly string[],
	want: number,
): Promise<(string | null)[]> {
	return Promise.all(
		rels.map(async (rel) => {
			const problem = await eventually(async () => (await fetch(gateUrl(scene, rel))).status, want);
			return problem === null ? null : `gate ${rel}: ${problem}`;
		}),
	);
}

const workSha = (copy: CopyScene, rel: string) => sha256Hex(readFileSync(join(copy.work, rel)));

/**
 * What the agent's copy root holds. Top-level dot entries (the agent's own `.publication`
 * and its transient probe file) are not media; everything else must be exactly the
 * published files, byte-identical to the work side, and pub/ must hold exactly the key.
 */
function agentHolds(copy: CopyScene, held: boolean): (string | false)[] {
	const { media } = copy.scene;
	const served = listTree(media).filter((path) => !path.startsWith('.'));
	const want: string[] = held ? [...COPY_PUBLISHED] : [];
	const markers = listTree(join(media, '.publication', 'pub'));
	return [
		JSON.stringify(served) !== JSON.stringify(want) &&
			`copy root holds ${JSON.stringify(served)}, expected ${JSON.stringify(want)}`,
		...want.map(
			(rel) =>
				existsSync(join(media, rel)) &&
				sha256Hex(readFileSync(join(media, rel))) !== workSha(copy, rel) &&
				`bytes differ from the work file: ${rel}`,
		),
		JSON.stringify(markers) !== JSON.stringify(held ? [COPY_KEY] : []) &&
			`agent pub/ markers ${JSON.stringify(markers)}`,
	];
}

async function mediaCopyRuntime(copy: CopyScene): Promise<MediaCopyRuntime> {
	const runtime = await engine<HostRuntime | null>(copy, 'runtime');
	if (runtime === null) throw new Error(`the runtime file holds no entry for ${COPY_DRILL_HOST}`);
	return runtime.media_copy;
}

const pending = (mc: MediaCopyRuntime) =>
	JSON.stringify(mc.pending_deletions.map((entry) => entry.path).sort());

/** The agent's audit actions, in order (it audits media.put / media.delete / media.mark). */
function auditActions(scene: Scene): string[] {
	const file = join(scene.state, 'audit', 'audit.jsonl');
	if (!existsSync(file)) return [];
	return readFileSync(file, 'utf8')
		.split('\n')
		.filter(Boolean)
		.flatMap((line) => {
			try {
				const action = (JSON.parse(line) as { action?: unknown }).action;
				return typeof action === 'string' ? [action] : [];
			} catch {
				return [];
			}
		});
}

/** Can this uid still create a file in `dir`? (root ignores 0555: the fault cannot be staged) */
function uidCanWrite(dir: string): boolean {
	const probe = join(dir, '.drill_write_probe');
	try {
		writeFileSync(probe, '');
		rmSync(probe, { force: true });
		return true;
	} catch {
		return false;
	}
}

async function copySetupRows(copy: CopyScene): Promise<void> {
	const { scene } = copy;
	const s = `[${scene.server}][copy]`;
	await row(
		`${s} pair: registry + secrets in the scratch private dir, pairing proved`,
		async () => {
			const tokenFile = join(scene.dir, 'engine_token');
			writeFileSync(tokenFile, scene.token, { mode: 0o600 });
			const bundleFile = join(scene.dir, 'engine_bundle', 'engine_bundle.pem');
			writeEngineBundle(bundleFile, scene.shared.tls);
			const spec = join(scene.dir, 'pair_spec.json');
			const record = {
				name: COPY_DRILL_HOST,
				instance: INSTANCE,
				fingerprint: publicationHostFingerprint(INSTANCE, scene.token),
				address: { kind: 'tls', host: '127.0.0.1', port: scene.agentPort },
				public_url: null,
				qualities: null,
				probe: { published: null, unpublished: null },
				paired_at: new Date().toISOString(),
			};
			writeFileSync(
				spec,
				JSON.stringify({ record, token_file: tokenFile, bundle_file: bundleFile }),
				{ mode: 0o600 },
			);
			const paired = await engine<{ name: string; paired: boolean }>(copy, 'pair', spec);
			const registry = join(copy.enginePrivate, 'publication_hosts.json');
			return problems([
				(paired.name !== COPY_DRILL_HOST || paired.paired !== true) &&
					`pair answered ${JSON.stringify(paired)}`,
				!existsSync(registry) && 'no registry in the scratch private dir',
				existsSync(registry) &&
					readFileSync(registry, 'utf8').includes(scene.token) &&
					'the token is in the registry file',
			]);
		},
	);
	await row(
		`${s} rules over the COPY root (engine render → configtest + reload); nothing served before a copy`,
		async () => {
			const since = logLines(scene).length;
			const applied = await engine<RulesView>(copy, 'rules');
			copy.execSince = logLines(scene).length;
			const include = existsSync(scene.include) ? readFileSync(scene.include, 'utf8') : '';
			return problems([
				applied.applied_hash !== applied.expected_hash &&
					`applied ${applied.applied_hash}, expected ${applied.expected_hash}`,
				applied.root !== scene.media &&
					`the agent reported media root ${applied.root}, not its copy root ${scene.media}`,
				!include.includes(`# config-hash: ${applied.expected_hash}`) &&
					'the live include does not carry the expected hash',
				callsSince(scene, since, [configtestCall(scene.server), reloadCall(scene.server)]),
				...(await gateIs(scene, COPY_PUBLISHED, 404)),
			]);
		},
	);
}

async function copyPublishRows(copy: CopyScene): Promise<void> {
	const { scene } = copy;
	const s = `[${scene.server}][copy]`;
	await row(
		`${s} publish ${COPY_KEY} → the plan names exactly its 2 public files + the marker (never a master, a non-public quality, a working file, an unparseable name, an unpublished record)`,
		async () => {
			await engine(copy, 'publish', 'test3', '1');
			const plan = await engine<CopyPlanView>(copy, 'plan');
			return problems([
				JSON.stringify(plan.put) !== ALL_PENDING && `put ${JSON.stringify(plan.put)}`,
				plan.del.length !== 0 && `del ${JSON.stringify(plan.del)}`,
				JSON.stringify(plan.mark) !== JSON.stringify([{ key: COPY_KEY, published: true }]) &&
					`mark ${JSON.stringify(plan.mark)}`,
			]);
		},
	);
	await row(
		`${s} reconcile → the agent holds the 2 files byte-identical + pub/${COPY_KEY}; the gate serves them, nothing else`,
		async () => {
			const report = await engine<ReconcileView>(copy, 'reconcile');
			const served = await Promise.all(
				COPY_PUBLISHED.map(async (rel) => {
					const res = await fetch(gateUrl(scene, rel));
					const body = new Uint8Array(await res.arrayBuffer());
					return res.status === 200 && sha256Hex(body) === workSha(copy, rel)
						? null
						: `gate ${rel}: ${res.status}, ${body.length} bytes`;
				}),
			);
			return problems([
				(report.applied === 0 || report.state !== 'ok') && `reconcile ${JSON.stringify(report)}`,
				...agentHolds(copy, true),
				...served,
				...(await gateIs(scene, Object.values(COPY_NEVER), 404)),
			]);
		},
	);
	await row(
		`${s} GET /v1/media/manifest: the 2 files with the work sha256, markers [${COPY_KEY}]`,
		async () => {
			const res = await agentFetch(scene, `${COPY_MANIFEST}?limit=1000`);
			if (res.status !== 200) return `status ${res.status}: ${await res.text()}`;
			const body = (await res.json()) as ManifestView;
			const entries = [...body.entries].sort((a, b) => (a.path < b.path ? -1 : 1));
			const want = COPY_PUBLISHED.map((rel) => [rel, workSha(copy, rel)]);
			return problems([
				JSON.stringify(entries.map((e) => [e.path, e.sha256])) !== JSON.stringify(want) &&
					`entries ${JSON.stringify(entries)}`,
				(body.irregular ?? []).length !== 0 && `irregular ${JSON.stringify(body.irregular)}`,
				JSON.stringify(body.markers) !== JSON.stringify([COPY_KEY]) &&
					`markers ${JSON.stringify(body.markers)}`,
				body.next !== null && `next ${body.next}`,
			]);
		},
	);
	await row(`${s} runtime: media_copy ok, desired 2, present 2, nothing pending`, async () => {
		const mc = await mediaCopyRuntime(copy);
		return problems([
			mc.state !== 'ok' && `state ${mc.state} (${mc.error})`,
			mc.desired !== 2 && `desired ${mc.desired}`,
			mc.present !== 2 && `present ${mc.present}`,
			mc.pending_puts !== 0 && `pending_puts ${mc.pending_puts}`,
			mc.pending_deletions.length !== 0 && `pending_deletions ${pending(mc)}`,
		]);
	});
	await row(`${s} in sync → empty plan, reconcile drift 0`, async () => {
		const plan = await engine<CopyPlanView>(copy, 'plan');
		const report = await engine<ReconcileView>(copy, 'reconcile');
		return problems([
			plan.put.length + plan.del.length + plan.mark.length !== 0 && `plan ${JSON.stringify(plan)}`,
			(report.drift !== 0 || report.applied !== 0) && `reconcile ${JSON.stringify(report)}`,
		]);
	});
}

async function copyFailingDeleteRows(copy: CopyScene): Promise<void> {
	const { scene } = copy;
	const s = `[${scene.server}][copy]`;
	await row(
		`${s} unpublish (real hook) with the agent's deletes FAILING (quality dir 0555) → marker FIRST: 404 while the bytes are still on disk; deletion pending, never reported done`,
		async () => {
			const locked = join(scene.media, COPY_LOCKED_DIR);
			const auditFrom = auditActions(scene).length;
			chmodSync(locked, 0o555);
			try {
				if (uidCanWrite(locked)) {
					return 'chmod 0555 does not stop this uid (root?): the failing-delete fault cannot be staged';
				}
				const sent = await engine<UnpublishView>(copy, 'unpublish', 'test3', '1');
				const mc = await mediaCopyRuntime(copy);
				const media = auditActions(scene)
					.slice(auditFrom)
					.filter((action) => action.startsWith('media.'));
				return problems([
					JSON.stringify(sent.paths) !== ALL_PENDING &&
						`unpublish targeted ${JSON.stringify(sent.paths)}`,
					(sent.round === null || sent.round.state === 'ok') &&
						`the worker's round reported ${JSON.stringify(sent.round)}`,
					existsSync(join(scene.media, COPY_MARKER_PATH)) &&
						'the agent marker survived the unpublish',
					...(await gateIs(scene, COPY_PUBLISHED, 404)),
					...COPY_PUBLISHED.map(
						(rel) =>
							!existsSync(join(scene.media, rel)) &&
							`${rel} is gone although its delete was made to fail (the fault was not staged)`,
					),
					pending(mc) !== ALL_PENDING && `pending_deletions ${pending(mc)}`,
					mc.state === 'ok' && 'media_copy reports ok with deletions outstanding',
					media[0] !== 'media.mark' &&
						`first media command after the unpublish: ${media[0] ?? 'none'} (the marker must go first)`,
					!media.includes('media.delete') && 'no media.delete was attempted',
					media.includes('media.put') && 'a media.put was sent during an unpublish',
				]);
			} finally {
				chmodSync(locked, 0o755);
			}
		},
	);
	await row(
		`${s} the failed deletion recovers: dir writable again → reconcile → files gone, verified`,
		async () => {
			const startedAt = Date.now();
			const report = await engine<ReconcileView>(copy, 'reconcile');
			const mc = await mediaCopyRuntime(copy);
			copy.lastVerified = mc.last_verified_at;
			return problems([
				(report.applied === 0 || report.state !== 'ok') && `reconcile ${JSON.stringify(report)}`,
				...agentHolds(copy, false),
				...(await gateIs(scene, COPY_PUBLISHED, 404)),
				mc.pending_deletions.length !== 0 && `pending_deletions ${pending(mc)}`,
				mc.state !== 'ok' && `state ${mc.state} (${mc.error})`,
				(mc.last_verified_at === null || Date.parse(mc.last_verified_at) < startedAt - 1000) &&
					`last_verified_at ${mc.last_verified_at} was not set by this reconcile`,
			]);
		},
	);
}

async function copyAgentDownRows(copy: CopyScene): Promise<void> {
	const { scene } = copy;
	const s = `[${scene.server}][copy]`;
	await row(`${s} republish → reconcile → served again (200)`, async () => {
		await engine(copy, 'publish', 'test3', '1');
		const report = await engine<ReconcileView>(copy, 'reconcile');
		return problems([
			report.state !== 'ok' && `reconcile ${JSON.stringify(report)}`,
			...agentHolds(copy, true),
			...(await gateIs(scene, COPY_PUBLISHED, 200)),
		]);
	});
	await row(
		`${s} agent DOWN during an unpublish (real hook) → the marker's withdrawal pending, media_copy not ok, error recorded; the public gate still serves (honest limit: no channel, no withdrawal)`,
		async () => {
			scene.agent?.kill('SIGTERM');
			await scene.agent?.exited;
			scene.agent = null;
			const sent = await engine<UnpublishView>(copy, 'unpublish', 'test3', '1');
			const mc = await mediaCopyRuntime(copy);
			return problems([
				JSON.stringify(sent.paths) !== ALL_PENDING &&
					`unpublish targeted ${JSON.stringify(sent.paths)}`,
				(sent.round === null || sent.round.state === 'ok' || sent.round.error === null) &&
					`the worker's round reported ${JSON.stringify(sent.round)}`,
				!mc.pending_deletions.some((entry) => entry.path === COPY_MARKER_PATH) &&
					`pending_deletions ${pending(mc)} lack ${COPY_MARKER_PATH}`,
				mc.state === 'ok' && 'media_copy reports ok with the host unreachable',
				mc.error === null && 'no error recorded',
				...agentHolds(copy, true),
				...(await gateIs(scene, COPY_PUBLISHED, 200)),
			]);
		},
	);
	await row(
		`${s} agent back → reconcile completes the pending deletion: files + marker gone, 404, verified again`,
		async () => {
			scene.agent = spawnAgent(scene, copy.agentEnv, 'agent_restarted.log');
			await waitAgent(scene);
			const report = await engine<ReconcileView>(copy, 'reconcile');
			const mc = await mediaCopyRuntime(copy);
			return problems([
				(report.applied === 0 || report.state !== 'ok') && `reconcile ${JSON.stringify(report)}`,
				...agentHolds(copy, false),
				...(await gateIs(scene, COPY_PUBLISHED, 404)),
				mc.pending_deletions.length !== 0 && `pending_deletions ${pending(mc)}`,
				mc.state !== 'ok' && `state ${mc.state} (${mc.error})`,
				(mc.last_verified_at === null ||
					copy.lastVerified === null ||
					Date.parse(mc.last_verified_at) <= Date.parse(copy.lastVerified)) &&
					`last_verified_at ${mc.last_verified_at} did not advance past ${copy.lastVerified}`,
			]);
		},
	);
	await row(
		`[${scene.server}][copy][exec] the media commands spawned nothing (no stand-in call after the rules apply)`,
		() => callsSince(scene, copy.execSince, []),
	);
}

async function copyPass(server: Server, shared: Shared): Promise<void> {
	const scene = await setupScene(server, shared, {
		listen: 'tls',
		nginxMap: buildNginxMap(),
		media: 'copy',
	});
	try {
		const copy = prepareCopy(scene);
		scene.agent = spawnAgent(scene, copy.agentEnv, 'agent.log');
		await waitAgent(scene);
		await copySetupRows(copy);
		await copyPublishRows(copy);
		await copyFailingDeleteRows(copy);
		await copyAgentDownRows(copy);
	} finally {
		// A row that died mid-fault must not leave a 0555 dir rmSync cannot empty.
		const locked = join(scene.media, COPY_LOCKED_DIR);
		if (existsSync(locked)) chmodSync(locked, 0o755);
		await teardown(scene);
	}
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
			bundles: await buildBundles(root),
			mariadbSocket: mariadb.socket,
			mariadbUser: SUITE_MARIADB_USER,
			mariadbPassword: SUITE_MARIADB_PASSWORD,
			database: zzdTargetDatabases()[0] as string,
		};
		for (const [i, server] of servers.entries()) {
			try {
				await pass(server, shared, i === 0);
			} catch (error) {
				book.fail(`[${server}] the pass could not run`, error);
			}
			try {
				await copyPass(server, shared);
			} catch (error) {
				book.fail(`[${server}][copy] the pass could not run`, error);
			}
		}
	} catch (error) {
		book.fail('the drill could not set up', error);
	} finally {
		disarmSeam();
		rmSync(root, { recursive: true, force: true });
		if (!mariadbWasRunning) await stopSuiteMariadb();
	}
	console.log(book.red === 0 ? '\nALL GREEN' : `\n${book.red} RED row(s)`);
	process.exit(book.red === 0 ? 0 : 1);
}
