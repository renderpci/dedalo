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
 *
 * THE SCENE (the agent, its stand-ins, the web server, the bundles, the row book) lives in
 * scripts/lib/publication_host_agent_scene.ts, shared with the engine drill
 * (scripts/publication_host_engine_drill.ts): one scene, never two.
 */

import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { SUDO, SYSTEMCTL } from '../publication/host_agent/src/exec.ts';
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
import { execSeamProblem, issueTlsMaterial } from './lib/publication_host_agent_drill_kit.ts';
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
