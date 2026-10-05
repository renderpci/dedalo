/**
 * publication_hosts widget — the media-copy door (plan M3/M6, phase-3 E10).
 *   - reconcile_media_copy is registered, root-only (perm.denied for a global admin who
 *     is not root, with NO agent call), refuses an unknown or missing host, applies
 *     through the registry for one host, and FAILS VISIBLY when that host's round failed;
 *   - get_value carries the per-host `media_copy` check (runtime-derived).
 * The REAL widget (loadDefaultDeps) over the scratch publication-hosts stores and a
 * stateful loopback mock copy agent; the SUITE media root (no file planted: the stray
 * entry on the agent is the drift).
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { widget } from '../../src/core/area_maintenance/widgets/publication_hosts.ts';
import { getPublicQualities } from '../../src/core/media/protection.ts';
import type { HostCheck } from '../../src/core/publication_host/host_status.ts';
import type { ReconcileReport } from '../../src/core/reconcile/registry.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import {
	type CopyMockAgent,
	startCopyMockAgent,
	unregisterCopyMockHost,
	useScratchMediaCopyStores,
} from '../helpers/media_copy_mock_agent.ts';

const ROOT: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const ADMIN: Principal = { userId: 7, isGlobalAdmin: true, isDeveloper: false };
const QUALITY = getPublicQualities()[0] as string;
const STRAY = { rel: `${QUALITY}/0/zzmw2_zzmw1_990003.jpg`, key: 'zzmw1_990003' };

type Outcome = { data: unknown; msg?: string; extend?: { report: ReconcileReport | null } };

async function action(options: Record<string, unknown>, principal: Principal): Promise<Outcome> {
	const handler = widget.apiActions?.reconcile_media_copy;
	if (handler === undefined) throw new Error('test: reconcile_media_copy is not registered');
	return (await handler(options, principal)) as Outcome;
}

let stores: { base: string; dispose: () => void } | null = null;
const agents: CopyMockAgent[] = [];

beforeAll(() => {
	stores = useScratchMediaCopyStores();
});
afterEach(async () => {
	for (const started of agents.splice(0)) {
		await started.stop();
		await unregisterCopyMockHost(started.name);
	}
});
afterAll(() => stores?.dispose());

async function strayCopyHost(name: string): Promise<CopyMockAgent> {
	const started = await startCopyMockAgent(name, 'copy', {
		entries: { [STRAY.rel]: { size: 1, sha256: 'b'.repeat(64) } },
		markers: [STRAY.key],
	});
	agents.push(started);
	return started;
}

describe('publication_hosts.reconcile_media_copy', () => {
	test('registered', () => {
		expect(typeof widget.apiActions?.reconcile_media_copy).toBe('function');
	});

	test('a global admin who is not root → perm.denied, and the agent is never called', async () => {
		const host = await strayCopyHost('zzmw_copy');
		await expect(action({ name: 'zzmw_copy' }, ADMIN)).rejects.toMatchObject({
			code: 'perm.denied',
		});
		expect(host.calls).toEqual([]);
	});

	test('an unknown or missing host is refused (maintenance.action_refused)', async () => {
		await expect(action({ name: 'zzmw_nope' }, ROOT)).rejects.toMatchObject({
			code: 'maintenance.action_refused',
		});
		await expect(action({}, ROOT)).rejects.toMatchObject({ code: 'maintenance.action_refused' });
	});

	test('root: applies for that host — the stray file and marker are gone, the report rides back', async () => {
		const host = await strayCopyHost('zzmw_copy');
		const outcome = await action({ name: 'zzmw_copy' }, ROOT);
		expect(outcome.data).toBe(true);
		expect(outcome.msg).toContain('zzmw_copy');
		expect(outcome.extend?.report?.applied ?? 0).toBeGreaterThanOrEqual(2);
		expect(host.entries.has(STRAY.rel)).toBe(false);
		expect(host.markers.has(STRAY.key)).toBe(false);
		expect(host.events.indexOf(`mark ${STRAY.key} false`)).toBeLessThan(
			host.events.indexOf(`delete ${STRAY.rel}`),
		);
	}, 60_000);

	test('a known copy host whose agent went down: the action FAILS visibly (maintenance.action_failed), never an OK', async () => {
		const host = await strayCopyHost('zzmw_down');
		await action({ name: 'zzmw_down' }, ROOT); // reconciled once: the runtime knows it as a copy host
		await host.stop();
		await expect(action({ name: 'zzmw_down' }, ROOT)).rejects.toMatchObject({
			code: 'maintenance.action_failed',
		});
	}, 60_000);

	test('get_value carries the media_copy check for a reconciled copy host', async () => {
		await strayCopyHost('zzmw_copy');
		await action({ name: 'zzmw_copy' }, ROOT);
		const value = (await widget.getValue?.({}, ROOT)) as {
			data: { hosts: { name: string; checks: HostCheck[] }[] };
		};
		const row = value.data.hosts.find((candidate) => candidate.name === 'zzmw_copy');
		expect(row?.checks.find((check) => check.id === 'media_copy')).toMatchObject({ state: 'ok' });
	}, 60_000);
});
