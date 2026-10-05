/**
 * publication_hosts.push_apis + get_value runtime_invalid / api_lockstep (publication host phase 4).
 *
 * ROOT ONLY (E10): a global admin who is not root is perm.denied and NOTHING is
 * loaded or dialled; a malformed host list is refused before the reconciler runs; the
 * answer is `data:false` with a sentence naming the cause whenever anything was refused
 * or failed. get_value reads the runtime ONCE (loadPanelRuntime), a corrupt runtime is a
 * `runtime_invalid` flag (never a 500), and the panel never runs a reconcile round (it
 * never hashes the tree). Hermetic: every effect is a recording fake in the widget's own
 * deps seam (createPublicationHostsWidget); the real pure row/lockstep builders are used.
 */

import { describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	createPublicationHostsWidget,
	PUSH_ANSWER_CAP_MS,
	type PublicationHostsDeps,
	pushAnswerWithinMs,
	pushHosts,
	widget,
} from '../../src/core/area_maintenance/widgets/publication_hosts.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import {
	type ApiReconcileReport,
	buildApiLockstepPanel,
	type ReconcileApisOptions,
} from '../../src/core/publication_host/api_reconcile.ts';
import {
	buildHostPanelRow,
	statusOutcomeFromError,
} from '../../src/core/publication_host/host_status.ts';
import {
	type PublicationHostRecord,
	RegistryError,
	type RegistryFile,
} from '../../src/core/publication_host/registry.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const ROOT: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: false };
const ADMIN: Principal = { userId: 7, isGlobalAdmin: true, isDeveloper: false };
const REL = '7.0.3_a1b2c3d';

const okReport: ApiReconcileReport = {
	release: REL,
	refused: null,
	hosts: [
		{ name: 'www', v1: { action: 'install', result: 'ok' }, v2: { action: 'none', result: 'ok' } },
	],
};

function record(name: string): PublicationHostRecord {
	return {
		name,
		instance: 'test',
		fingerprint: 'a'.repeat(64),
		address: { kind: 'unix', socket: `/nonexistent/${name}.sock` },
		public_url: null,
		qualities: null,
		probe: { published: null, unpublished: null },
		paired_at: '2026-10-03T00:00:00.000Z',
	};
}

const unused = (what: string) => () => {
	throw new Error(`test: ${what} must not be called`);
};

interface HarnessOptions {
	report?: ApiReconcileReport;
	/** Replaces the reconciler's answer (a pending / rejecting round). */
	round?: () => Promise<ApiReconcileReport>;
	waitMs?: number;
	hosts?: PublicationHostRecord[];
	registryFails?: RegistryError;
	runtimeInvalid?: string;
}

function harness(options: HarnessOptions = {}) {
	const reconciles: ReconcileApisOptions[] = [];
	const counts = { loads: 0, runtimeReads: 0 };
	const file: RegistryFile = { version: 1, hosts: options.hosts ?? [] };
	const deps: PublicationHostsDeps = {
		registryPath: () => '/scratch/private/publication_hosts.json',
		loadRegistry: () => {
			if (options.registryFails !== undefined) throw options.registryFails;
			return structuredClone(file);
		},
		updateRegistry: unused('updateRegistry'),
		secretPresenceOutcome: () => ({ token_present: true, bundle_present: false, refused: null }),
		removeHostSecrets: unused('removeHostSecrets'),
		forgetPairing: unused('forgetPairing'),
		hostStatus: async () => {
			throw new DedaloError('publication_host.unreachable');
		},
		hostMediaProbe: unused('hostMediaProbe'),
		hostApplyRules: unused('hostApplyRules'),
		hostRollbackRelease: unused('hostRollbackRelease'),
		expectedRulesForHost: unused('expectedRulesForHost'),
		expectedRulesOutcome: unused('expectedRulesOutcome'),
		statusOutcomeFromError,
		buildHostPanelRow,
		engineQualities: () => ['image/1.5MB'],
		filterPublicQualities: (configured) => [...configured],
		engineVersion: () => '7.0.3',
		loadPanelRuntime: async () => {
			counts.runtimeReads += 1;
			return { runtime: {}, runtime_invalid: options.runtimeInvalid ?? null };
		},
		buildApiLockstepPanel,
		reconcilePublicationApis: async (opts) => {
			reconciles.push(opts);
			if (options.round !== undefined) return options.round();
			return options.report ?? okReport;
		},
		pushAnswerWithinMs: () => options.waitMs ?? 5_000,
	};
	const module = createPublicationHostsWidget(async () => {
		counts.loads += 1;
		return deps;
	});
	const push = (opts: Record<string, unknown>, principal: Principal = ROOT) => {
		const handler = module.apiActions?.push_apis;
		if (handler === undefined) throw new Error('test: push_apis is not registered');
		return handler(opts, principal);
	};
	const panel = async (principal: Principal = ROOT) =>
		(await module.getValue?.({}, principal))?.data as Record<string, unknown>;
	return { reconciles, counts, push, panel };
}

describe('publication_hosts.push_apis', () => {
	test('a global admin who is not root is perm.denied: nothing loaded, nothing dialled', async () => {
		const h = harness();
		await expect(h.push({}, ADMIN)).rejects.toMatchObject({ code: 'perm.denied' });
		expect(h.reconciles).toEqual([]);
		expect(h.counts.loads).toBe(0);
	});

	test('a malformed host list is refused before the reconciler runs', async () => {
		const h = harness();
		for (const hosts of ['www', ['../etc'], [1], [{}], ['Www']]) {
			await expect(h.push({ hosts })).rejects.toMatchObject({ code: 'maintenance.action_refused' });
		}
		expect(h.reconciles).toEqual([]);
		expect(pushHosts(undefined)).toBeNull();
		expect(pushHosts(['www', 'mirror_2'])).toEqual(['www', 'mirror_2']);
	});

	test('root pushes as the agent actor of root, with the host filter when given', async () => {
		const h = harness();
		const all = await h.push({});
		const one = await h.push({ hosts: ['www'] });
		expect(h.reconciles).toEqual([
			{ apply: true, actor: 'dedalo_user:-1' },
			{ apply: true, actor: 'dedalo_user:-1', hosts: ['www'] },
		]);
		expect(all.data).toBe(true);
		expect(all.msg).toBe(`OK. Release ${REL} is current on 1 publication host(s).`);
		expect(all.extend).toEqual({ report: okReport, running: false });
		expect(one.data).toBe(true);
	});

	test('a refused tree answers data:false and names the refusal', async () => {
		const refused = 'v1: drift: publication/server_api/v1/json/index.php (modified)';
		const h = harness({ report: { release: null, refused, hosts: [] } });
		const response = await h.push({});
		expect(response.data).toBe(false);
		expect(response.msg).toContain(refused);
	});

	test('a failed API answers data:false and names the host, the code and the bundle detail', async () => {
		const h = harness({
			report: {
				release: REL,
				refused: null,
				hosts: [
					{
						name: 'www',
						v1: { action: 'install', result: 'ok' },
						v2: {
							action: 'install',
							result: 'failed',
							error: 'bundle_refused:drift',
							detail: 'publication/server_api/v2/src/index.ts',
						},
					},
				],
			},
		});
		const response = await h.push({});
		expect(response.data).toBe(false);
		expect(response.msg).toContain(
			'www v2 (bundle_refused:drift: publication/server_api/v2/src/index.ts)',
		);
	});

	test('an unrecorded runtime is said, without turning a landed push into a failure', async () => {
		const h = harness({ report: { ...okReport, runtime_error: 'runtime_invalid' } });
		const response = await h.push({});
		expect(response.data).toBe(true);
		expect(response.msg).toContain('runtime_invalid');
	});

	test('a round that outlives the wait answers running (data:null) and finishes detached, logged', async () => {
		let finish: (report: ApiReconcileReport) => void = () => {};
		const pending = new Promise<ApiReconcileReport>((done) => {
			finish = done;
		});
		const h = harness({ round: () => pending, waitMs: 20 });
		const info = spyOn(console, 'info').mockImplementation(() => {});
		try {
			const response = await h.push({});
			expect(response.data).toBeNull();
			expect(response.extend).toEqual({ report: null, running: true });
			expect(response.msg).toContain('still running');
			expect(response.msg).toContain('reload this panel');
			finish(okReport);
			await pending;
			await Bun.sleep(0);
			const lines = info.mock.calls.map((call) => String(call[0]));
			expect(lines.some((line) => line.includes('answered running'))).toBe(true);
			expect(lines.some((line) => line.includes(`release=${REL}`))).toBe(true);
		} finally {
			info.mockRestore();
		}
	});

	test('a round that fails after the answer is logged, never an unhandled rejection', async () => {
		let fail: (error: Error) => void = () => {};
		const pending = new Promise<ApiReconcileReport>((_, reject) => {
			fail = reject;
		});
		const h = harness({ round: () => pending, waitMs: 20 });
		const info = spyOn(console, 'info').mockImplementation(() => {});
		const errors = spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect((await h.push({})).extend?.running).toBe(true);
			fail(new Error('late boom'));
			await pending.catch(() => undefined);
			await Bun.sleep(0);
			expect(errors.mock.calls.some((call) => String(call[0]).includes('push_apis'))).toBe(true);
		} finally {
			info.mockRestore();
			errors.mockRestore();
		}
	});

	test('a refusal inside the wait still answers as itself (resource.conflict propagates)', async () => {
		const h = harness({
			round: async () => {
				throw new DedaloError('resource.conflict', { message: 'a push is already running' });
			},
		});
		await expect(h.push({})).rejects.toMatchObject({ code: 'resource.conflict' });
	});

	test('the production wait stays below the server idle timeout (Bun cuts a silent socket there)', () => {
		for (const idle of [1, 2, 10, 60, 120, 255]) {
			const ms = pushAnswerWithinMs(idle);
			expect(ms, `idle ${idle}s`).toBeLessThan(idle * 1000);
			expect(ms).toBeLessThanOrEqual(PUSH_ANSWER_CAP_MS);
		}
		expect(pushAnswerWithinMs(255)).toBe(PUSH_ANSWER_CAP_MS);
		expect(pushAnswerWithinMs(10)).toBe(5_000);
	});

	test('the production widget registers push_apis', () => {
		expect(typeof widget.apiActions?.push_apis).toBe('function');
	});
});

describe('get_value — one runtime read, runtime_invalid, api_lockstep (no round, no hash)', () => {
	test('rows + a readable runtime: api_lockstep has one row per host×API, v2 first; no reconcile ran', async () => {
		const h = harness({ hosts: [record('www')] });
		const data = await h.panel();
		expect(h.counts.runtimeReads).toBe(1);
		expect(data.runtime_invalid).toBeNull();
		const lockstep = data.api_lockstep as { rows: { host: string; api: string; state: string }[] };
		expect(lockstep.rows.map((row) => `${row.host}:${row.api}`)).toEqual(['www:v2', 'www:v1']);
		// the agent was not reached: its release is unknown, never "behind"
		expect(lockstep.rows.map((row) => row.state)).toEqual(['unknown', 'unknown']);
		expect(h.reconciles).toEqual([]);
	});

	test('a corrupt runtime file is a red flag on a still-rendered panel', async () => {
		const h = harness({ hosts: [record('www')], runtimeInvalid: 'invalid_json' });
		const data = await h.panel();
		expect(data.runtime_invalid).toBe('invalid_json');
		expect((data.hosts as unknown[]).length).toBe(1);
	});

	test('a corrupt REGISTRY still carries runtime_invalid and an (empty) api_lockstep', async () => {
		const h = harness({ registryFails: new RegistryError('invalid_json', 'x') });
		const data = await h.panel();
		expect(data.hosts).toBeNull();
		expect(data.runtime_invalid).toBeNull();
		expect((data.api_lockstep as { rows: unknown[] }).rows).toEqual([]);
		expect(h.counts.runtimeReads).toBe(1);
	});

	test('the widget source reads the runtime through ONE panel read and never hashes or reconciles', () => {
		const source = stripComments(
			readFileSync(
				join(import.meta.dir, '..', '..', 'src/core/area_maintenance/widgets/publication_hosts.ts'),
				'utf8',
			),
		);
		expect(source.match(/deps\.loadPanelRuntime\(\)/g)).toHaveLength(1);
		expect(source).toContain('runtime_invalid: panelRuntime.runtime_invalid');
		expect(source).toMatch(
			/api_lockstep: deps\.buildApiLockstepPanel\(hosts, panelRuntime\.runtime\)/,
		);
		expect(source).not.toMatch(/\bloadRuntime\(/);
		expect(source).not.toContain('verifyPublicationTree');
		expect(source).not.toContain('defaultApiReconcileDeps');
		// the only reconcile call is push_apis's apply round
		expect(source.match(/deps\.reconcilePublicationApis\(/g)).toHaveLength(1);
	});
});
