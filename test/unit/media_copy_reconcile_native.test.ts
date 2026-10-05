/**
 * MEDIA_COPY RECONCILE — behaviour (PUBLICATION_HOST_SPEC §5.2; plan M2/M3/M4/M6; Review
 * Focus 2/3). Through a stateful loopback mock copy agent and the SUITE media root
 * (marker-guarded):
 *   - only copy-mode hosts are reconciled (Task 9 hostTakesCopy); a dry run of a shared
 *     host writes NOTHING, an apply records n/a (Task 9 markNotCopy);
 *   - a DRY run plans and sends nothing mutating, and is byte-equal twice;
 *   - APPLY goes through Task 9's lane (syncMediaCopyHost) and converges: missing
 *     published files are put (sha-verified) and marked, an unpublished file is UNMARKED
 *     BEFORE it is deleted, and `applied` is measured by re-planning (remaining 0);
 *   - an unreachable agent: the dry run reports it and writes nothing; an apply records
 *     Task 9's verdict (pending + the code), KEEPS the pending deletion, and the panel
 *     check is blocked — the deletion is never reported as done;
 *   - a copy host re-declared shared while it still holds debt → failed /
 *     copy_mode_withdrawn, debt kept, check blocked (never a silent n/a);
 *   - an unknown scoped host is a typed resource.not_found.
 * Scratch: ONE publication-hosts store + sha cache (useScratchMediaCopyStores), `zzmc*`
 * keys and host names, planted files removed by path.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { getPublicQualities } from '../../src/core/media/protection.ts';
import {
	COPY_MODE_WITHDRAWN,
	MEDIA_COPY_PERIOD_MS,
	mediaCopyCheck,
} from '../../src/core/publication_host/media_copy_status.ts';
import { loadRuntime, updateHostRuntime } from '../../src/core/publication_host/runtime.ts';
import { registerAllReconciles } from '../../src/core/reconcile/catalog.ts';
import { runReconcile, validateDefinition } from '../../src/core/reconcile/registry.ts';
import {
	type MediaCopyHostOutcome,
	runMediaCopyReconcile,
} from '../../src/diffusion/api/media_copy_reconcile.ts';
import { MEDIA_COPY_RECONCILE } from '../../src/diffusion/api/reconcile.ts';
import {
	type CopyMockAgent,
	type MockMode,
	type MockSeed,
	sha256Hex,
	startCopyMockAgent,
	unregisterCopyMockHost,
	useScratchMediaCopyStores,
} from '../helpers/media_copy_mock_agent.ts';
import { stripComments } from '../helpers/strip_comments.ts';

const REPO = join(import.meta.dir, '..', '..');

const QUALITY = (() => {
	const quality = getPublicQualities().find((q) => q.startsWith('image/'));
	if (quality === undefined) throw new Error('no public image quality configured');
	return quality;
})();

const PUBLISHED = {
	key: 'zzmc1_990001',
	rel: `${QUALITY}/0/zzmc2_zzmc1_990001.jpg`,
	bytes: 'zzmc media copy — published bytes',
};
const UNPUBLISHED = { key: 'zzmc1_990002', rel: `${QUALITY}/0/zzmc2_zzmc1_990002.jpg` };
const STRAY_SEED: MockSeed = {
	entries: { [UNPUBLISHED.rel]: { size: 3, sha256: 'a'.repeat(64) } },
	markers: [UNPUBLISHED.key],
};

function mediaRoot(): string {
	const root = config.media.rootPath;
	if (root === null) throw new Error('suite media root not configured');
	return root;
}

function plantPublished(): void {
	const file = join(mediaRoot(), PUBLISHED.rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, PUBLISHED.bytes);
	const marker = join(mediaRoot(), '.publication', 'pub', PUBLISHED.key);
	mkdirSync(dirname(marker), { recursive: true });
	writeFileSync(marker, '');
}

function unplantPublished(): void {
	rmSync(join(mediaRoot(), PUBLISHED.rel), { force: true });
	rmSync(join(mediaRoot(), '.publication', 'pub', PUBLISHED.key), { force: true });
}

async function seedPendingDeletion(name: string, sinceMs: number): Promise<void> {
	await updateHostRuntime(name, (cur) => ({
		...cur,
		media_copy: {
			...cur.media_copy,
			state: 'pending',
			present: 1,
			error: null,
			pending_deletions: [
				{ path: UNPUBLISHED.rel, since: new Date(Date.now() - sinceMs).toISOString() },
			],
		},
	}));
}

const hostsOf = (detail: Record<string, unknown>) =>
	detail.hosts as Record<string, MediaCopyHostOutcome>;

let stores: { base: string; dispose: () => void } | null = null;
const agents: CopyMockAgent[] = [];

async function agent(name: string, mode: MockMode, seed: MockSeed = {}): Promise<CopyMockAgent> {
	const started = await startCopyMockAgent(name, mode, seed);
	agents.push(started);
	return started;
}

beforeAll(async () => {
	stores = useScratchMediaCopyStores();
	await registerAllReconciles();
});

afterEach(async () => {
	for (const started of agents.splice(0)) {
		await started.stop();
		await unregisterCopyMockHost(started.name);
	}
	unplantPublished();
});

afterAll(() => stores?.dispose());

describe('media_copy definition', () => {
	test('name, two stores, interval = MEDIA_COPY_PERIOD_MS, auto-applied with a reason, scoped by host', () => {
		expect(() => validateDefinition(MEDIA_COPY_RECONCILE)).not.toThrow();
		expect(MEDIA_COPY_RECONCILE.name).toBe('media_copy');
		expect(MEDIA_COPY_RECONCILE.schedule).toEqual({ everyMs: MEDIA_COPY_PERIOD_MS });
		expect(MEDIA_COPY_RECONCILE.autoApply?.reason.length ?? 0).toBeGreaterThan(40);
		expect(MEDIA_COPY_RECONCILE.scopeLabel).toBe('publication host name');
		expect(MEDIA_COPY_RECONCILE.sources).toEqual([
			'src/diffusion/targets/mediastore/media_copy.ts',
			'src/diffusion/api/media_copy.ts',
			'src/diffusion/api/media_copy_reconcile.ts',
			'src/diffusion/api/reconcile.ts',
		]);
	});

	test('the run applies ONLY through the Task 9 lane (syncMediaCopyHost), never applyCopy directly', () => {
		const source = stripComments(
			readFileSync(join(REPO, 'src/diffusion/api/media_copy_reconcile.ts'), 'utf8'),
		);
		expect(source).toContain('syncMediaCopyHost(');
		expect(source).toContain('planMediaCopyHost(');
		expect(source).not.toContain('applyCopy(');
		expect(source).not.toContain('syncHost(');
		expect(source).not.toContain('hostStatus(');
	});
});

describe('media_copy run', () => {
	test('no registered host → drift 0, nothing to do', async () => {
		expect(await runMediaCopyReconcile({ apply: false })).toEqual({
			drift: 0,
			applied: 0,
			detail: { hosts: {} },
		});
	});

	test('a shared host: dry writes NOTHING; only an apply records n/a; only status is asked', async () => {
		const shared = await agent('zzmc_shared', 'shared');
		const dry = await runMediaCopyReconcile({ apply: false, scope: ['zzmc_shared'] });
		expect(dry.drift).toBe(0);
		expect(hostsOf(dry.detail).zzmc_shared).toEqual({
			takes_copy: false,
			planned: null,
			sent: null,
			state: null,
			pending_deletions: 0,
			remaining: null,
			error: null,
		});
		expect((await loadRuntime()).zzmc_shared).toBeUndefined();
		await runMediaCopyReconcile({ apply: true, scope: ['zzmc_shared'] });
		const row = (await loadRuntime()).zzmc_shared?.media_copy;
		expect(row?.state).toBe('n/a');
		expect(row?.last_verified_at).not.toBeNull();
		expect(shared.calls.length).toBeGreaterThan(0);
		expect(shared.calls.every((call) => call === 'GET /v1/status')).toBe(true);
	}, 60_000);

	test('DRY on a copy host plans put + unmark/delete, sends nothing mutating, byte-equal twice', async () => {
		plantPublished();
		const copy = await agent('zzmc_copy', 'copy', STRAY_SEED);
		const first = await runMediaCopyReconcile({ apply: false, scope: ['zzmc_copy'] });
		const outcome = hostsOf(first.detail).zzmc_copy;
		expect(outcome?.takes_copy).toBe(true);
		expect(outcome?.error).toBeNull();
		expect(outcome?.planned?.put ?? 0).toBeGreaterThanOrEqual(1);
		expect(outcome?.planned?.del ?? 0).toBeGreaterThanOrEqual(1);
		expect(outcome?.sent).toBeNull();
		expect(first.drift).toBeGreaterThanOrEqual(2);
		expect(first.applied).toBe(0);
		expect(copy.calls.filter((call) => !call.startsWith('GET '))).toEqual([]);
		expect(copy.events).toEqual([]);
		expect((await loadRuntime()).zzmc_copy).toBeUndefined();
		const second = await runMediaCopyReconcile({ apply: false, scope: ['zzmc_copy'] });
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		expect(copy.entries.has(UNPUBLISHED.rel)).toBe(true);
	}, 60_000);

	test('APPLY converges through the lane: put + mark the published, unmark BEFORE delete, applied measured', async () => {
		plantPublished();
		const copy = await agent('zzmc_copy', 'copy', STRAY_SEED);
		const report = await runMediaCopyReconcile({ apply: true, scope: ['zzmc_copy'] });
		const outcome = hostsOf(report.detail).zzmc_copy;
		expect(outcome?.error).toBeNull();
		expect(outcome?.state).toBe('ok');
		expect(outcome?.remaining).toBe(0);
		expect(outcome?.sent?.put ?? 0).toBeGreaterThanOrEqual(1);
		expect(report.drift).toBeGreaterThanOrEqual(2);
		expect(report.applied).toBe(report.drift);
		expect(copy.entries.get(PUBLISHED.rel)).toEqual({
			size: Buffer.byteLength(PUBLISHED.bytes),
			sha256: sha256Hex(PUBLISHED.bytes),
		});
		expect(copy.markers.has(PUBLISHED.key)).toBe(true);
		expect(copy.entries.has(UNPUBLISHED.rel)).toBe(false);
		expect(copy.markers.has(UNPUBLISHED.key)).toBe(false);
		const unmark = copy.events.indexOf(`mark ${UNPUBLISHED.key} false`);
		const deletion = copy.events.indexOf(`delete ${UNPUBLISHED.rel}`);
		expect(unmark).toBeGreaterThanOrEqual(0);
		expect(deletion).toBeGreaterThan(unmark);
		// the published key is marked before its file lands
		expect(copy.events.indexOf(`mark ${PUBLISHED.key} true`)).toBeLessThan(
			copy.events.indexOf(`put ${PUBLISHED.rel}`),
		);
		expect((await loadRuntime()).zzmc_copy?.media_copy.pending_deletions).toEqual([]);
		expect((await runMediaCopyReconcile({ apply: false, scope: ['zzmc_copy'] })).drift).toBe(0);
	}, 60_000);

	test('agent unreachable: dry reports + writes nothing; apply records the Task 9 verdict, KEEPS the deletion, panel blocked', async () => {
		const down = await agent('zzmc_down', 'copy');
		await seedPendingDeletion('zzmc_down', 2 * MEDIA_COPY_PERIOD_MS);
		await down.stop();
		const before = JSON.stringify((await loadRuntime()).zzmc_down);

		const dry = await runMediaCopyReconcile({ apply: false, scope: ['zzmc_down'] });
		expect(hostsOf(dry.detail).zzmc_down).toMatchObject({
			error: 'publication_host.unreachable',
			pending_deletions: 1,
			remaining: null,
		});
		expect(dry.drift).toBeGreaterThanOrEqual(1);
		expect(JSON.stringify((await loadRuntime()).zzmc_down)).toBe(before);

		const applied = await runMediaCopyReconcile({ apply: true, scope: ['zzmc_down'] });
		expect(applied.applied).toBe(0);
		expect(applied.drift).toBeGreaterThanOrEqual(1);
		expect(hostsOf(applied.detail).zzmc_down?.error).toBe('publication_host.unreachable');
		const runtime = (await loadRuntime()).zzmc_down?.media_copy;
		expect(runtime?.state).toBe('pending');
		expect(runtime?.error).toBe('publication_host.unreachable');
		expect(runtime?.pending_deletions.map((deletion) => deletion.path)).toEqual([UNPUBLISHED.rel]);
		expect(mediaCopyCheck(runtime, Date.now())?.state).toBe('blocked');
	}, 60_000);

	test('a copy host re-declared shared while holding debt → failed / copy_mode_withdrawn, never a silent n/a', async () => {
		const host = await agent('zzmc_withdrawn', 'copy', STRAY_SEED);
		await seedPendingDeletion('zzmc_withdrawn', 60_000);
		host.setMode('shared');
		await runMediaCopyReconcile({ apply: true, scope: ['zzmc_withdrawn'] });
		const runtime = (await loadRuntime()).zzmc_withdrawn?.media_copy;
		expect(runtime?.state).toBe('failed');
		expect(runtime?.error).toBe(COPY_MODE_WITHDRAWN);
		expect(runtime?.pending_deletions.map((deletion) => deletion.path)).toEqual([UNPUBLISHED.rel]);
		expect(mediaCopyCheck(runtime, Date.now())?.state).toBe('blocked');
		expect(host.events).toEqual([]);
	}, 60_000);

	test('an unknown scoped host is a typed resource.not_found (never an empty success)', async () => {
		await expect(
			runMediaCopyReconcile({ apply: false, scope: ['zzmc_nope'] }),
		).rejects.toMatchObject({ code: 'resource.not_found' });
	});

	test('through the registry door: runReconcile records the run, no error', async () => {
		await agent('zzmc_copy', 'copy');
		const { report, record } = await runReconcile('media_copy', {
			apply: false,
			scope: ['zzmc_copy'],
		});
		expect(record.error).toBeNull();
		expect(report.detail).toHaveProperty('hosts.zzmc_copy');
	}, 60_000);
});
