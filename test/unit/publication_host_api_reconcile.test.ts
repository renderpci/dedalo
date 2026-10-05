/**
 * PUBLICATION API LOCKSTEP — reconcilePublicationApis, its registry definition,
 * the confirmed-boot trigger, the panel rows and the panel's runtime read
 * (publication host phase 4, Task 5).
 *
 * Hermetic: every effect (registry, agent, bundle build, runtime file) is an
 * injected `ApiReconcileDeps`; no DB, no network, no ../private.
 */

import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { ApiBundleError } from '../../src/core/publication_host/api_bundles.ts';
import {
	type AgentApiReleases,
	API_PUSH_ORDER,
	type ApiName,
	type ApiReconcileDeps,
	type ApiRuntimeEntry,
	apiLockstepPanel,
	apiReportToReconcile,
	buildApiLockstepPanel,
	CONFIRM_HOOK_ACTOR,
	lastVerifiedTarget,
	PUBLICATION_APIS_CHECK_EVERY_MS,
	PUBLICATION_APIS_RECONCILE,
	reconcilePublicationApis,
	resolveTargetRelease,
	runPublicationApisDefinition,
	type TargetRelease,
	triggerPublicationApiPush,
} from '../../src/core/publication_host/api_reconcile.ts';
import { BundleWriteError } from '../../src/core/publication_host/bundle_writer.ts';
import { loadPanelRuntime } from '../../src/core/publication_host/panel_runtime.ts';
import { type HostRuntime, RuntimeStateError } from '../../src/core/publication_host/runtime.ts';

const REL = '7.0.3_a1b2c3d';
const OLD = '7.0.2_0f0f0f0';
const NOW = '2026-10-03T12:00:00.000Z';
const ACTOR = 'user:-1';

function held(current: string | null, previous: string | null = null): AgentApiReleases {
	return { v1: { current, previous }, v2: { current, previous } };
}

interface HarnessOptions {
	target?: TargetRelease;
	hosts: Record<string, AgentApiReleases | Error>;
	installFails?: Record<string, Error>;
	bundleFails?: Partial<Record<ApiName, Error>>;
	bundleRelease?: string;
	recordFails?: Error;
}

function harness(options: HarnessOptions) {
	const calls = {
		target: 0,
		status: [] as string[],
		bundle: [] as ApiName[],
		install: [] as string[],
	};
	const recorded = new Map<string, ApiRuntimeEntry>();
	const deps: ApiReconcileDeps = {
		target: async () => {
			calls.target++;
			return options.target ?? { releaseId: REL, refused: null };
		},
		hostNames: () => Object.keys(options.hosts),
		agentApis: async (name) => {
			calls.status.push(name);
			const answer = options.hosts[name];
			if (answer === undefined) throw new Error(`test: no host ${name}`);
			if (answer instanceof Error) throw answer;
			return answer;
		},
		bundle: async (api) => {
			calls.bundle.push(api);
			const failure = options.bundleFails?.[api];
			if (failure !== undefined) throw failure;
			return {
				releaseId: options.bundleRelease ?? REL,
				file: `/nonexistent/${api}.tar.gz`,
				sha256: 'a'.repeat(64),
			};
		},
		install: async (name, api, bundle, mode, actor) => {
			calls.install.push(`${name}:${api}:${mode}:${bundle.releaseId}:${actor}`);
			const failure = options.installFails?.[`${name}:${api}`];
			if (failure !== undefined) throw failure;
		},
		record: async (name, api, entry) => {
			if (options.recordFails !== undefined) throw options.recordFails;
			recorded.set(`${name}:${api}`, entry);
		},
		now: () => NOW,
	};
	return { deps, calls, recorded };
}

let silenced: ReturnType<typeof spyOn> | null = null;
function silenceConsoleError(): ReturnType<typeof spyOn> {
	silenced = spyOn(console, 'error').mockImplementation(() => {});
	return silenced;
}
afterEach(() => {
	silenced?.mockRestore();
	silenced = null;
});

describe('resolveTargetRelease — what the installed tree may push (L1, L2), verify AWAITED', () => {
	const ok = async () => ({ ok: true as const });

	test('no install digest (a dev checkout) → no_verified_release, the tree is not even hashed', async () => {
		let verified = 0;
		const target = await resolveTargetRelease({
			version: '7.0.3',
			digest: null,
			verify: async () => {
				verified++;
				return { ok: true as const };
			},
		});
		expect(target).toEqual({ releaseId: null, refused: 'no_verified_release' });
		expect(verified).toBe(0);
	});

	test('a digest that is not 64-hex → no_verified_release (the one L2 rule, api_bundles.publicationReleaseId), not hashed', async () => {
		let verified = 0;
		const target = await resolveTargetRelease({
			version: '7.0.3',
			digest: 'not-a-digest',
			verify: async () => {
				verified++;
				return { ok: true as const };
			},
		});
		expect(target).toEqual({ releaseId: null, refused: 'no_verified_release' });
		expect(verified).toBe(0);
	});

	test('a verified tree → <version>_<digest[0:7]>', async () => {
		const digest = `a1b2c3d${'e'.repeat(57)}`;
		expect(await resolveTargetRelease({ version: '7.0.3', digest, verify: ok })).toEqual({
			releaseId: REL,
			refused: null,
		});
	});

	test('a verifier that RESOLVES a refusal later still refuses (the Promise is awaited, never truthy)', async () => {
		const target = await resolveTargetRelease({
			version: '7.0.3',
			digest: 'a'.repeat(64),
			verify: async (api) => {
				await Bun.sleep(1);
				return api === 'v2'
					? {
							ok: false as const,
							drift: ['publication/server_api/v2/src/index.ts (modified)'],
							reason: 'drift' as const,
						}
					: { ok: true as const };
			},
		});
		expect(target).toEqual({
			releaseId: null,
			refused: 'v2: drift: publication/server_api/v2/src/index.ts (modified)',
		});
	});

	test('drift NAMES the files (10, then a count) and refuses the whole release', async () => {
		const drift = Array.from(
			{ length: 12 },
			(_, i) => `publication/server_api/v1/f${i}.php (modified)`,
		);
		const target = await resolveTargetRelease({
			version: '7.0.3',
			digest: 'a'.repeat(64),
			verify: async (api) =>
				api === 'v1'
					? { ok: false as const, drift, reason: 'drift' as const }
					: { ok: true as const },
		});
		expect(target.releaseId).toBeNull();
		expect(target.refused).toBe(`v1: drift: ${drift.slice(0, 10).join(', ')} (+2 more)`);
	});

	test('v2 is verified first; a missing manifest refuses before v1 is read', async () => {
		const seen: ApiName[] = [];
		const target = await resolveTargetRelease({
			version: '7.0.3',
			digest: 'a'.repeat(64),
			verify: async (api) => {
				seen.push(api);
				return { ok: false as const, drift: [], reason: 'missing_manifest' as const };
			},
		});
		expect(target).toEqual({ releaseId: null, refused: 'v2: missing_manifest' });
		expect(seen).toEqual(['v2']);
		expect(API_PUSH_ORDER).toEqual(['v2', 'v1']);
	});
});

describe('reconcilePublicationApis — dry run', () => {
	test('in step → none; behind → install; target held as previous → promote_existing; nothing sent or written', async () => {
		const h = harness({ hosts: { a: held(REL), b: held(OLD), c: held(OLD, REL) } });
		const report = await reconcilePublicationApis({ apply: false, actor: ACTOR }, h.deps);
		expect(report).toEqual({
			release: REL,
			refused: null,
			hosts: [
				{ name: 'a', v1: { action: 'none', result: 'ok' }, v2: { action: 'none', result: 'ok' } },
				{
					name: 'b',
					v1: { action: 'install', result: 'dry_run' },
					v2: { action: 'install', result: 'dry_run' },
				},
				{
					name: 'c',
					v1: { action: 'promote_existing', result: 'dry_run' },
					v2: { action: 'promote_existing', result: 'dry_run' },
				},
			],
		});
		expect(h.calls.status).toEqual(['a', 'b', 'c']);
		expect(h.calls.bundle).toEqual([]);
		expect(h.calls.install).toEqual([]);
		expect(h.recorded.size).toBe(0);
		expect(apiReportToReconcile(report)).toMatchObject({ drift: 4, applied: 0 });
	});

	test('no host selected → the tree is NOT hashed (an install without publication hosts pays nothing)', async () => {
		const h = harness({ hosts: {} });
		const report = await reconcilePublicationApis({ apply: false, actor: ACTOR }, h.deps);
		expect(report).toEqual({ release: null, refused: null, hosts: [] });
		expect(h.calls.target).toBe(0);
	});
});

describe('reconcilePublicationApis — apply', () => {
	test('v2 then v1 per host; one bundle build per API per round; runtime records ok', async () => {
		const h = harness({ hosts: { a: held(OLD), b: held(OLD, REL) } });
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(h.calls.install).toEqual([
			`a:v2:install:${REL}:${ACTOR}`,
			`a:v1:install:${REL}:${ACTOR}`,
			`b:v2:promote_existing:${REL}:${ACTOR}`,
			`b:v1:promote_existing:${REL}:${ACTOR}`,
		]);
		expect(h.calls.bundle).toEqual(['v2', 'v1']);
		expect(h.recorded.get('a:v2')).toEqual({ state: 'ok', release: REL, error: null, at: NOW });
		expect(h.recorded.get('b:v1')).toEqual({ state: 'ok', release: REL, error: null, at: NOW });
		expect(report.runtime_error).toBeUndefined();
		expect(apiReportToReconcile(report)).toMatchObject({ drift: 4, applied: 4 });
	});

	test('L6: a failed v2 does not stop v1, and each is recorded on its own', async () => {
		const h = harness({
			hosts: { a: held(OLD) },
			installFails: { 'a:v2': new DedaloError('publication_host.failed') },
		});
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(report.hosts[0]).toEqual({
			name: 'a',
			v2: { action: 'install', result: 'failed', error: 'publication_host.failed' },
			v1: { action: 'install', result: 'ok' },
		});
		expect(h.calls.install).toEqual([
			`a:v2:install:${REL}:${ACTOR}`,
			`a:v1:install:${REL}:${ACTOR}`,
		]);
		expect(h.recorded.get('a:v2')).toEqual({
			state: 'failed',
			release: REL,
			error: 'publication_host.failed',
			at: NOW,
		});
		expect(h.recorded.get('a:v1')?.state).toBe('ok');
	});

	test('REVIEW FOCUS 1: a drifted tree refuses, names the file, and NOTHING is sent', async () => {
		const refused = 'v1: drift: publication/server_api/v1/json/index.php (modified)';
		const h = harness({ target: { releaseId: null, refused }, hosts: { a: held(OLD) } });
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(report.refused).toContain('publication/server_api/v1/json/index.php');
		expect(report.release).toBeNull();
		expect(report.hosts).toEqual([
			{
				name: 'a',
				v1: { action: 'none', result: 'skipped', error: refused },
				v2: { action: 'none', result: 'skipped', error: refused },
			},
		]);
		expect(h.calls.status).toEqual([]);
		expect(h.calls.bundle).toEqual([]);
		expect(h.calls.install).toEqual([]);
		expect(h.recorded.get('a:v1')).toEqual({
			state: 'pending',
			release: null,
			error: refused,
			at: NOW,
		});
		expect(apiReportToReconcile(report)).toMatchObject({ drift: 2, applied: 0 });
	});

	test('an unreachable host is failed by CODE and recorded unknown; the next host still gets its push', async () => {
		const h = harness({
			hosts: { a: new DedaloError('publication_host.unreachable'), b: held(OLD) },
		});
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(report.hosts[0]).toEqual({
			name: 'a',
			v1: { action: 'none', result: 'failed', error: 'publication_host.unreachable' },
			v2: { action: 'none', result: 'failed', error: 'publication_host.unreachable' },
		});
		expect(h.recorded.get('a:v2')?.state).toBe('unknown');
		expect(h.calls.install).toEqual([
			`b:v2:install:${REL}:${ACTOR}`,
			`b:v1:install:${REL}:${ACTOR}`,
		]);
	});

	test('an untyped failure is internal.unexpected; its prose never reaches the report', async () => {
		const logged = silenceConsoleError();
		const h = harness({
			hosts: { a: held(OLD) },
			installFails: { 'a:v1': new Error('agent said: /srv/secret/path exploded') },
		});
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(report.hosts[0]?.v1).toEqual({
			action: 'install',
			result: 'failed',
			error: 'internal.unexpected',
		});
		expect(JSON.stringify(report)).not.toContain('/srv/secret');
		expect(logged).toHaveBeenCalled();
	});

	test('a pack-time ApiBundleError keeps its reason and NAMES the paths; v1 still ships', async () => {
		const drifted = 'publication/server_api/v2/src/index.ts';
		const h = harness({
			hosts: { a: held(OLD) },
			bundleFails: {
				v2: new ApiBundleError('drift', `Publication API bundle refused (drift): ${drifted}`, [
					drifted,
				]),
			},
		});
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(report.hosts[0]?.v2).toEqual({
			action: 'install',
			result: 'failed',
			error: 'bundle_refused:drift',
			detail: drifted,
		});
		expect(report.hosts[0]?.v1).toEqual({ action: 'install', result: 'ok' });
		expect(h.recorded.get('a:v2')?.error).toBe('bundle_refused:drift');
	});

	test('a BundleWriteError is recorded by its reason, never internal.unexpected', async () => {
		const h = harness({
			hosts: { a: held(OLD) },
			bundleFails: { v1: new BundleWriteError('size_mismatch', 'node_modules/x/index.js') },
		});
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(report.hosts[0]?.v1).toEqual({
			action: 'install',
			result: 'failed',
			error: 'bundle_write:size_mismatch',
		});
	});

	test('a corrupt runtime file never stops the push: runtime_error is reported, both APIs installed', async () => {
		silenceConsoleError();
		const h = harness({
			hosts: { a: held(OLD) },
			recordFails: new RuntimeStateError(
				'invalid_json',
				'/scratch/publication_hosts_runtime.json',
				'bad',
			),
		});
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(h.calls.install).toEqual([
			`a:v2:install:${REL}:${ACTOR}`,
			`a:v1:install:${REL}:${ACTOR}`,
		]);
		expect(report.hosts[0]).toEqual({
			name: 'a',
			v2: { action: 'install', result: 'ok' },
			v1: { action: 'install', result: 'ok' },
		});
		expect(report.runtime_error).toBe('runtime_invalid');
	});

	test('a bundle built for another release is an invariant failure and is never sent', async () => {
		const h = harness({ hosts: { a: held(OLD) }, bundleRelease: OLD });
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(report.hosts[0]?.v2).toEqual({
			action: 'install',
			result: 'failed',
			error: 'internal.invariant',
		});
		expect(h.calls.install).toEqual([]);
	});

	test('a failed v2 build fails v2 on every host from ONE build, v1 still ships', async () => {
		const h = harness({
			hosts: { a: held(OLD), b: held(OLD) },
			bundleFails: { v2: new DedaloError('publication_host.failed') },
		});
		const report = await reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps);
		expect(h.calls.bundle.filter((api) => api === 'v2')).toHaveLength(1);
		expect(report.hosts.map((host) => host.v2.result)).toEqual(['failed', 'failed']);
		expect(report.hosts.map((host) => host.v1.result)).toEqual(['ok', 'ok']);
	});

	test('a host filter narrows the round; an unknown name refuses it before any call', async () => {
		const h = harness({ hosts: { a: held(OLD), b: held(OLD) } });
		await expect(
			reconcilePublicationApis({ apply: true, actor: ACTOR, hosts: ['zz_unknown'] }, h.deps),
		).rejects.toMatchObject({ code: 'resource.not_found' });
		expect(h.calls.status).toEqual([]);
		expect(h.calls.target).toBe(0);
		const report = await reconcilePublicationApis(
			{ apply: true, actor: ACTOR, hosts: ['b'] },
			h.deps,
		);
		expect(report.hosts.map((host) => host.name)).toEqual(['b']);
	});

	test('single flight: a second APPLY is resource.conflict while one runs; dry runs pass; the latch is released', async () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const h = harness({ hosts: { a: held(REL) } });
		const slow: ApiReconcileDeps = {
			...h.deps,
			agentApis: async (name) => {
				await gate;
				return h.deps.agentApis(name);
			},
		};
		const first = reconcilePublicationApis({ apply: true, actor: ACTOR }, slow);
		await expect(
			reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps),
		).rejects.toMatchObject({
			code: 'resource.conflict',
		});
		const dry = await reconcilePublicationApis({ apply: false, actor: ACTOR }, h.deps);
		expect(dry.release).toBe(REL);
		release();
		await first;
		await expect(
			reconcilePublicationApis({ apply: true, actor: ACTOR }, h.deps),
		).resolves.toBeDefined();
	});
});

describe('PUBLICATION_APIS_RECONCILE — the interval DRY check (L5)', () => {
	test('facets: interval, no autoApply, owner listed as its own source', () => {
		expect(PUBLICATION_APIS_RECONCILE.name).toBe('publication_apis');
		expect(PUBLICATION_APIS_RECONCILE.schedule).toEqual({
			everyMs: PUBLICATION_APIS_CHECK_EVERY_MS,
		});
		expect(PUBLICATION_APIS_RECONCILE.autoApply).toBeUndefined();
		expect(PUBLICATION_APIS_RECONCILE.sources).toContain(
			'src/core/publication_host/api_reconcile.ts',
		);
	});

	test('apply through the registry is perm.denied and dials nothing (code push is root-only)', async () => {
		const h = harness({ hosts: { a: held(OLD) } });
		await expect(runPublicationApisDefinition({ apply: true }, h.deps)).rejects.toMatchObject({
			code: 'perm.denied',
		});
		expect(h.calls.status).toEqual([]);
		expect(h.calls.target).toBe(0);
	});

	test('the dry run is scoped by host name and counts drift per host×API', async () => {
		const h = harness({ hosts: { a: held(REL), b: held(OLD) } });
		const report = await runPublicationApisDefinition({ apply: false, scope: ['b'] }, h.deps);
		expect(report.drift).toBe(2);
		expect(report.applied).toBe(0);
		expect(report.detail.release).toBe(REL);
		expect(h.calls.status).toEqual(['b']);
	});
});

describe('triggerPublicationApiPush — the confirmed-boot hook (L5, Review Focus 5)', () => {
	test('a smoke boot pushes nothing', () => {
		let called = 0;
		const outcome = triggerPublicationApiPush({ smokeBoot: true, installMode: false }, async () => {
			called++;
			return { release: null, refused: null, hosts: [] };
		});
		expect(outcome).toBe('skipped_smoke_boot');
		expect(called).toBe(0);
	});

	test('install mode pushes nothing', () => {
		let called = 0;
		const outcome = triggerPublicationApiPush({ smokeBoot: false, installMode: true }, async () => {
			called++;
			return { release: null, refused: null, hosts: [] };
		});
		expect(outcome).toBe('skipped_install_mode');
		expect(called).toBe(0);
	});

	test('a normal boot starts ONE detached apply as the confirm actor, and returns before it settles', async () => {
		const seen: unknown[] = [];
		let settle: () => void = () => {};
		const outcome = triggerPublicationApiPush({ smokeBoot: false, installMode: false }, (opts) => {
			seen.push(opts);
			return new Promise((resolve) => {
				settle = () => resolve({ release: REL, refused: null, hosts: [] });
			});
		});
		expect(outcome).toBe('started');
		expect(seen).toEqual([{ apply: true, actor: CONFIRM_HOOK_ACTOR }]);
		settle();
		await Bun.sleep(0);
	});

	test('a failing push never throws out of the hook (logged)', async () => {
		const logged = silenceConsoleError();
		expect(() =>
			triggerPublicationApiPush({ smokeBoot: false, installMode: false }, () =>
				Promise.reject(new Error('boom')),
			),
		).not.toThrow();
		await Bun.sleep(0);
		expect(logged).toHaveBeenCalled();
	});
});

describe('apiLockstepPanel — engine release vs each host (panel rows, no hashing)', () => {
	function runtimeWith(apis: Partial<Record<ApiName, ApiRuntimeEntry>>): HostRuntime {
		const unknown: ApiRuntimeEntry = { state: 'unknown', release: null, error: null, at: null };
		return {
			apis: { v1: apis.v1 ?? unknown, v2: apis.v2 ?? unknown },
			media_copy: {
				state: 'n/a',
				desired: 0,
				present: 0,
				pending_puts: 0,
				pending_deletions: [],
				last_verified_at: null,
				error: null,
			},
			probe: {
				state: 'unknown',
				at: null,
				published_status: null,
				unpublished_status: null,
				detail: null,
			},
		};
	}
	const failedPush: ApiRuntimeEntry = {
		state: 'failed',
		release: REL,
		error: 'publication_host.failed',
		at: NOW,
	};

	test('ok / failed / mismatch / unknown, v2 row first per host, with the verdict time', () => {
		const panel = apiLockstepPanel(
			{ target: { releaseId: REL, refused: null }, at: NOW },
			[
				{ name: 'www', reachable: true, apis: { v2: { current: REL }, v1: { current: OLD } } },
				{ name: 'mirror', reachable: true, apis: { v2: { current: OLD }, v1: { current: OLD } } },
				{ name: 'down', reachable: false, apis: { v2: { current: null }, v1: { current: null } } },
			],
			{ www: runtimeWith({ v1: failedPush }) },
		);
		expect(panel.engine_release).toBe(REL);
		expect(panel.refused).toBeNull();
		expect(panel.checked_at).toBe(NOW);
		expect(panel.rows.map((row) => `${row.host}:${row.api}:${row.state}`)).toEqual([
			'www:v2:ok',
			'www:v1:failed',
			'mirror:v2:mismatch',
			'mirror:v1:mismatch',
			'down:v2:unknown',
			'down:v1:unknown',
		]);
		expect(panel.rows[1]?.last_push).toEqual(failedPush);
		expect(panel.rows[4]?.host_current).toBeNull();
	});

	test('a refused tree makes every row unknown (or failed), never ok', () => {
		const panel = apiLockstepPanel(
			{ target: { releaseId: null, refused: 'no_verified_release' }, at: NOW },
			[{ name: 'www', reachable: true, apis: { v2: { current: OLD }, v1: { current: OLD } } }],
			{},
		);
		expect(panel.refused).toBe('no_verified_release');
		expect(panel.rows.map((row) => row.state)).toEqual(['unknown', 'unknown']);
	});

	test('no round since boot → not verified yet: no release, no refusal, no time, rows unknown', () => {
		const panel = apiLockstepPanel(
			null,
			[{ name: 'www', reachable: true, apis: { v2: { current: REL }, v1: { current: REL } } }],
			{},
		);
		expect(panel).toMatchObject({ engine_release: null, refused: null, checked_at: null });
		expect(panel.rows.map((row) => row.state)).toEqual(['unknown', 'unknown']);
	});

	test('buildApiLockstepPanel reads the LAST round verdict and computes none itself', async () => {
		const h = harness({ hosts: { a: held(REL) } });
		await reconcilePublicationApis({ apply: false, actor: ACTOR }, h.deps);
		const targetsBefore = h.calls.target;
		expect(lastVerifiedTarget()).toEqual({ target: { releaseId: REL, refused: null }, at: NOW });
		const panel = buildApiLockstepPanel([], {});
		expect(panel.engine_release).toBe(REL);
		expect(panel.checked_at).toBe(NOW);
		expect(h.calls.target).toBe(targetsBefore);
	});
});

describe('loadPanelRuntime — one runtime read per panel, a corrupt file degrades', () => {
	test('a readable runtime passes through with no flag', async () => {
		expect(await loadPanelRuntime(async () => ({}))).toEqual({
			runtime: {},
			runtime_invalid: null,
		});
	});

	test('a corrupt runtime → empty map + runtime_invalid <reason>, never a throw', async () => {
		silenceConsoleError();
		const out = await loadPanelRuntime(async () => {
			throw new RuntimeStateError('invalid_json', '/scratch/publication_hosts_runtime.json', 'bad');
		});
		expect(out).toEqual({ runtime: {}, runtime_invalid: 'invalid_json' });
	});

	test('anything that is not a runtime-state error still propagates (never hidden)', async () => {
		await expect(
			loadPanelRuntime(async () => {
				throw new TypeError('bug');
			}),
		).rejects.toThrow('bug');
	});
});
