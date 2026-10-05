/**
 * MEDIA COPY APPLY (PUBLICATION_HOST_SPEC §5.2 "unpublish is a verified deletion";
 * decisions M2/M4/M6; Review Focus 2 and 3; the agent's put invariant).
 *
 * The situations are BUILT in a fake copy world (test/helpers/media_copy_world.ts):
 * the work host's pub/ markers and public files, and one agent that refuses a put
 * for an unmarked key, as the real one does. The real publication-target lock is
 * exercised in its own leg (another Postgres session holds `media:<host>`).
 *
 * WRITES: a scratch media root (openLocalMediaFile leg); advisory locks on the
 * lane database, released.
 */

import { afterAll, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	DIFFUSION_TARGET_LOCK_CLASS,
	mediaCopyTargetLockKey,
	withTargetLock,
} from '../../src/core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../src/core/errors/index.ts';
import {
	type ApplyPlan,
	applyCopyWith,
	type CopyDeps,
	DELETION_UNVERIFIED,
	hostTakesCopy,
	MEDIA_COPY_ACTOR,
	type MediaCopyRuntime,
	openLocalMediaFile,
	recordRoundFailure,
	syncHostWith,
	type TakesCopyIo,
} from '../../src/diffusion/targets/mediastore/media_copy_apply.ts';
import {
	desired,
	emptyRuntime,
	imageQuality,
	mediaPath,
	newWorld,
	okReport,
	planFrom,
	T0,
	worldDeps,
} from '../helpers/media_copy_world.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';

const K1 = 'test3_1';
const K2 = 'test3_2';
const P1 = mediaPath(K1);
const P1B = mediaPath(K1, 'test88');
const P2 = mediaPath(K2);
const EMPTY: ApplyPlan = { put: [], del: [], mark: [] };

let logSpy: ReturnType<typeof spyOn>;
beforeAll(() => {
	logSpy = spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
	logSpy.mockRestore();
});

async function holdLock(key: string): Promise<{ release: () => Promise<void> }> {
	const connection = await sql.reserve();
	await connection.unsafe('SELECT pg_advisory_lock($1::int, hashtext($2))', [
		DIFFUSION_TARGET_LOCK_CLASS,
		key,
	]);
	return {
		async release() {
			await connection.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
				DIFFUSION_TARGET_LOCK_CLASS,
				key,
			]);
			connection.release();
		},
	};
}

describe('withdraw → delete → verify (unpublish is a verified deletion)', () => {
	test('pending is recorded before the first agent call; marker false, then delete, then verified', async () => {
		const world = newWorld();
		world.agentFiles.set(P1, 'jpeg');
		world.agentMarkers.add(K1);
		const d = worldDeps(world);
		let pendingAtFirstCall = null as string[] | null;
		const spied: CopyDeps = {
			...d,
			mark: async (host, key, published, actor) => {
				pendingAtFirstCall ??= (world.runtime.get('pub1')?.pending_deletions ?? []).map(
					(p) => p.path,
				);
				return d.mark(host, key, published, actor);
			},
		};
		const report = await applyCopyWith(spied, 'pub1', planFrom(world));
		expect(pendingAtFirstCall).toEqual(['.publication/pub/test3_1', P1]);
		expect(world.calls).toEqual(['mark test3_1 false', `del ${P1}`]);
		expect([...world.actors]).toEqual([MEDIA_COPY_ACTOR]);
		expect(report).toMatchObject({
			state: 'ok',
			withdrawn: 1,
			deleted: 1,
			pending_deletions: 0,
			error: null,
		});
		const runtime = world.runtime.get('pub1');
		expect(runtime?.pending_deletions).toEqual([]);
		expect(runtime?.last_verified_at).toBe(new Date(T0).toISOString());
		expect(runtime?.state).toBe('ok');
	});

	test('Review Focus 3: agent down → stays pending (first since kept), no put tried; the next round completes it', async () => {
		const world = newWorld();
		world.agentFiles.set(P1, 'jpeg');
		world.agentMarkers.add(K1);
		world.local.set(P2, { bytes: 'png!', mtimeMs: 5 });
		world.published.add(K2);
		const d = worldDeps(world);
		const plan = planFrom(world);

		world.down = true;
		const first = await applyCopyWith(d, 'pub1', plan);
		expect(first).toMatchObject({
			state: 'pending',
			error: 'publication_host.unreachable',
			put: 0,
		});
		expect(world.calls).toEqual([]);
		const since = new Date(T0).toISOString();
		expect(world.runtime.get('pub1')?.pending_deletions).toEqual([
			{ path: '.publication/pub/test3_1', since },
			{ path: P1, since },
		]);

		world.clock.t = T0 + 60_000;
		const again = await applyCopyWith(d, 'pub1', plan);
		expect(again.state).toBe('pending');
		expect(world.runtime.get('pub1')?.pending_deletions.map((p) => p.since)).toEqual([
			since,
			since,
		]);

		world.down = false;
		world.clock.t = T0 + 3_600_000;
		const recovered = await applyCopyWith(d, 'pub1', plan);
		expect(recovered).toMatchObject({ state: 'ok', put: 1, published: 1, pending_deletions: 0 });
		expect(world.calls).toEqual([
			'mark test3_1 false',
			`del ${P1}`,
			'mark test3_2 true',
			`put ${P2}`,
		]);
		expect(world.agentFiles.has(P1)).toBe(false);
		expect(world.agentMarkers.has(K1)).toBe(false);
		expect(world.agentFiles.get(P2)).toBe('png!');
		expect(world.agentMarkers.has(K2)).toBe(true);
		expect(world.runtime.get('pub1')?.last_verified_at).toBe(
			new Date(T0 + 3_600_000).toISOString(),
		);
	});

	test('a deletion the manifest still lists stays pending and the round is failed (deletion_unverified)', async () => {
		const world = newWorld();
		world.agentFiles.set(P1, 'jpeg');
		const d = worldDeps(world);
		const lying: CopyDeps = { ...d, del: async () => undefined };
		const report = await applyCopyWith(lying, 'pub1', planFrom(world));
		expect(report).toMatchObject({
			state: 'failed',
			error: DELETION_UNVERIFIED,
			pending_deletions: 1,
		});
		expect(world.runtime.get('pub1')).toMatchObject({
			state: 'failed',
			error: DELETION_UNVERIFIED,
		});
	});

	test('an IRREGULAR agent path (a link) is deleted and verified against the irregular list, never cleared while listed', async () => {
		const world = newWorld();
		const link = `${imageQuality()}/0/test99_test3_7.jpg`;
		world.agentIrregular.add(link);
		const d = worldDeps(world);
		const plan = planFrom(world);
		expect(plan.del).toEqual([link]);
		const stubborn = await applyCopyWith({ ...d, del: async () => undefined }, 'pub1', plan);
		expect(stubborn).toMatchObject({
			state: 'failed',
			error: DELETION_UNVERIFIED,
			pending_deletions: 1,
		});
		const done = await applyCopyWith(d, 'pub1', plan);
		expect(done).toMatchObject({ state: 'ok', pending_deletions: 0 });
		expect(world.agentIrregular.size).toBe(0);
	});

	test('withdrawal is per key best-effort: a refused key never shields the keys after it', async () => {
		const world = newWorld();
		world.agentMarkers.add(K1);
		world.agentMarkers.add(K2);
		const d = worldDeps(world);
		const refusing: CopyDeps = {
			...d,
			mark: async (host, key, published, actor) => {
				if (key === K1)
					throw new DedaloError('publication_host.rejected', { message: 'key_invalid (test)' });
				return d.mark(host, key, published, actor);
			},
		};
		const plan: ApplyPlan = {
			put: [],
			del: [],
			mark: [
				{ key: K1, published: false },
				{ key: K2, published: false },
			],
		};
		const report = await applyCopyWith(refusing, 'pub1', plan);
		expect(world.calls).toEqual(['mark test3_2 false']);
		expect(world.agentMarkers.has(K2)).toBe(false);
		expect(report).toMatchObject({
			state: 'failed',
			error: 'publication_host.rejected',
			withdrawn: 1,
		});
	});

	test('a held lock (fake) defers the unit: nothing is sent, the deletion stays pending', async () => {
		const world = newWorld();
		world.agentFiles.set(P1, 'jpeg');
		world.agentMarkers.add(K1);
		world.lockBusy = true;
		const report = await applyCopyWith(worldDeps(world), 'pub1', planFrom(world));
		expect(world.calls).toEqual([]);
		expect(report.deferred).toBe(1);
		expect(report.state).toBe('pending');
		expect(report.pending_deletions).toBe(2);
	});

	test('a runtime file the round cannot record in stops it BEFORE any agent call', async () => {
		const world = newWorld();
		world.agentFiles.set(P1, 'jpeg');
		world.agentMarkers.add(K1);
		const broken: CopyDeps = {
			...worldDeps(world),
			updateRuntime: async () => {
				throw new Error('runtime file corrupt (test)');
			},
		};
		await expect(applyCopyWith(broken, 'pub1', planFrom(world))).rejects.toThrow('corrupt');
		expect(world.calls).toEqual([]);
	});
});

describe('marks and puts (a put lands only while pub/<key> exists on the agent; M4: re-check locally)', () => {
	test('the fake agent refuses a put for a key it holds no marker for (the real invariant)', async () => {
		const world = newWorld();
		await expect(
			worldDeps(world).put(
				'pub1',
				{ path: P1, sha256: 'a'.repeat(64), size: 4, body: new Blob(['jpeg']).stream() },
				MEDIA_COPY_ACTOR,
			),
		).rejects.toMatchObject({
			code: 'publication_host.rejected',
			coordinates: { agent_reason: 'key_unpublished' },
		});
		expect(world.agentFiles.size).toBe(0);
	});

	test('grants precede the puts, only for keys still published', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.published.add(K1);
		world.published.add(K2);
		const plan: ApplyPlan = {
			put: [desired(world, P1)],
			del: [],
			mark: [
				{ key: K1, published: true },
				{ key: 'test3_3', published: true },
			],
		};
		const report = await applyCopyWith(worldDeps(world), 'pub1', plan);
		expect(world.calls).toEqual(['mark test3_1 true', `put ${P1}`]);
		expect(report).toMatchObject({ state: 'ok', put: 1, published: 1 });
	});

	test('the marker is ensured in the put own unit when the plan carries no grant', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.published.add(K1);
		const plan: ApplyPlan = { put: [desired(world, P1)], del: [], mark: [] };
		const report = await applyCopyWith(worldDeps(world), 'pub1', plan);
		expect(world.calls).toEqual(['mark test3_1 true', `put ${P1}`]);
		expect(report).toMatchObject({ state: 'ok', put: 1, published: 1 });
	});

	test('a key unpublished before its unit is never marked nor sent', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		const plan: ApplyPlan = { put: [desired(world, P1)], del: [], mark: [] };
		const report = await applyCopyWith(worldDeps(world), 'pub1', plan);
		expect(world.calls).toEqual([]);
		expect(report).toMatchObject({ state: 'ok', put: 0, skipped_unpublished: 1 });
	});

	test('Review Focus 2: unpublished while the bytes are in flight → marker withdrawn, file deleted again at once', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.published.add(K1);
		world.duringPut = async () => {
			world.published.delete(K1);
		};
		const report = await applyCopyWith(worldDeps(world), 'pub1', planFrom(world));
		expect(world.calls).toEqual([
			'mark test3_1 true',
			`put ${P1}`,
			'mark test3_1 false',
			`del ${P1}`,
		]);
		expect(world.agentFiles.size).toBe(0);
		expect(world.agentMarkers.size).toBe(0);
		expect(report).toMatchObject({
			state: 'ok',
			compensated: 1,
			withdrawn: 1,
			pending_deletions: 0,
		});
	});

	test('compensation removes EVERY file of the key this round landed', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.local.set(P1B, { bytes: 'jpeg-b', mtimeMs: 1 });
		world.published.add(K1);
		world.duringPut = async (path) => {
			if (path === P1B) world.published.delete(K1);
		};
		const report = await applyCopyWith(worldDeps(world), 'pub1', planFrom(world));
		expect(world.calls).toEqual([
			'mark test3_1 true',
			`put ${P1}`,
			`put ${P1B}`,
			'mark test3_1 false',
			`del ${P1},${P1B}`,
		]);
		expect(world.agentFiles.size).toBe(0);
		expect(report).toMatchObject({ state: 'ok', put: 1, compensated: 1, pending_deletions: 0 });
	});

	test('a put that times out is DEFERRED: the files after it still land, the host stays pending', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.local.set(P2, { bytes: 'png!', mtimeMs: 1 });
		world.published.add(K1);
		world.published.add(K2);
		const d = worldDeps(world);
		const slow: CopyDeps = {
			...d,
			put: async (host, file, actor) => {
				if (file.path !== P1) return d.put(host, file, actor);
				await file.body.cancel();
				throw new DedaloError('publication_host.timeout', { message: 'slow link (test)' });
			},
		};
		const report = await applyCopyWith(slow, 'pub1', planFrom(world));
		expect(world.agentFiles.get(P2)).toBe('png!');
		expect(world.agentFiles.has(P1)).toBe(false);
		expect(report).toMatchObject({ state: 'pending', error: null, put: 1, deferred: 1 });
		expect(world.runtime.get('pub1')).toMatchObject({ state: 'pending', pending_puts: 1 });
	});

	test('a put that times out while its record is unpublished is compensated (its bytes may have landed)', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.published.add(K1);
		const d = worldDeps(world);
		const slow: CopyDeps = {
			...d,
			put: async (host, file, actor) => {
				await d.put(host, file, actor); // landed…
				world.published.delete(K1);
				throw new DedaloError('publication_host.timeout', { message: 'answer lost (test)' });
			},
		};
		const report = await applyCopyWith(slow, 'pub1', planFrom(world));
		expect(world.calls).toEqual([
			'mark test3_1 true',
			`put ${P1}`,
			'mark test3_1 false',
			`del ${P1}`,
		]);
		expect(world.agentFiles.size).toBe(0);
		expect(report).toMatchObject({ state: 'ok', compensated: 1, pending_deletions: 0 });
	});

	test('a file changed since the plan is deferred, never marked nor sent', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.published.add(K1);
		const plan: ApplyPlan = { put: [desired(world, P1)], del: [], mark: [] };
		world.local.set(P1, { bytes: 'jpeg-v2', mtimeMs: 2 });
		const report = await applyCopyWith(worldDeps(world), 'pub1', plan);
		expect(world.calls).toEqual([]);
		expect(report).toMatchObject({ state: 'pending', deferred: 1 });
		expect(world.runtime.get('pub1')?.pending_puts).toBe(1);
	});

	test('an unstable sha (the cache answers null) is deferred, never sent with a null X-Sha256', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.published.add(K1);
		world.unstable.add(P1);
		const plan: ApplyPlan = { put: [desired(world, P1)], del: [], mark: [] };
		const report = await applyCopyWith(worldDeps(world), 'pub1', plan);
		expect(world.calls).toEqual([]);
		expect(report).toMatchObject({ state: 'pending', deferred: 1, error: null });
	});

	test('a plan naming a master, a working file, an unsafe path or the wrong key is refused before any agent call', async () => {
		const world = newWorld();
		const master = `${imageQuality().split('/')[0]}/${config.media.image.originalQuality}/0/test99_test3_1.jpg`;
		const working = `${imageQuality()}/0/test99_test3_1.tmp`;
		const entries = [
			{ path: master, key: K1 },
			{ path: working, key: K1 },
			{ path: `/${P1}`, key: K1 },
			{ path: `${imageQuality()}/../x/test99_test3_1.jpg`, key: K1 },
			{ path: P1, key: 'test3_9' },
		];
		expect(entries.length).toBeGreaterThan(4); // the loop below really runs every refusal
		for (const { path, key } of entries) {
			const plan: ApplyPlan = { put: [{ path, key, size: 1, mtimeMs: 1 }], del: [], mark: [] };
			let caught: unknown = null;
			try {
				await applyCopyWith(worldDeps(world), 'pub1', plan);
			} catch (error) {
				caught = error;
			}
			expect((caught as DedaloError).code, path).toBe('internal.invariant');
		}
		expect(world.calls).toEqual([]);
		expect(world.runtime.size).toBe(0);
	});
});

describe('a grant supersedes a pending withdrawal (republished before the deletion was verified)', () => {
	test('agent down during the unpublish, then republished: the next round returns to ok (never a stuck deletion_unverified)', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.agentFiles.set(P1, 'jpeg');
		world.agentMarkers.add(K1);
		const d = worldDeps(world);
		// Unpublished while the agent is down: the withdrawal is recorded pending.
		world.down = true;
		const first = await applyCopyWith(d, 'pub1', planFrom(world));
		expect(first).toMatchObject({ state: 'pending', error: 'publication_host.unreachable' });
		expect(world.runtime.get('pub1')?.pending_deletions.map((p) => p.path)).toEqual([
			'.publication/pub/test3_1',
			P1,
		]);
		// Republished; the agent is back and still holds the marker and the file.
		world.published.add(K1);
		world.down = false;
		const plan = planFrom(world);
		expect(plan).toEqual(EMPTY);
		const again = await applyCopyWith(d, 'pub1', plan);
		expect(again).toMatchObject({ state: 'ok', error: null, pending_deletions: 0 });
		expect(world.runtime.get('pub1')).toMatchObject({ state: 'ok', pending_deletions: [] });
		expect(world.agentMarkers.has(K1)).toBe(true);
		expect(world.agentFiles.get(P1)).toBe('jpeg');
	});

	test('unpublished and republished inside one round (takeWithdrawn): the re-grant drops the pending marker, the round is ok', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.local.set(P1B, { bytes: 'jpeg-b', mtimeMs: 1 });
		world.published.add(K1);
		const d = worldDeps(world);
		let drained = false;
		const takeWithdrawn = (): readonly string[] => {
			// After the first put: K1 was unpublished and republished meanwhile.
			if (drained || !world.agentFiles.has(P1)) return [];
			drained = true;
			return [K1];
		};
		const report = await applyCopyWith(d, 'pub1', planFrom(world), { takeWithdrawn });
		expect(world.calls).toEqual([
			'mark test3_1 true',
			`put ${P1}`,
			'mark test3_1 false',
			'mark test3_1 true',
			`put ${P1B}`,
		]);
		expect(report).toMatchObject({ state: 'ok', error: null, put: 2, pending_deletions: 0 });
		expect(world.runtime.get('pub1')).toMatchObject({ state: 'ok', pending_deletions: [] });
		expect(world.agentMarkers.has(K1)).toBe(true);
	});

	test('a put that lands drops its own path from pending; a still-unpublished path, or one recorded after the decision, is never dropped', async () => {
		const world = newWorld();
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.published.add(K1);
		world.runtime.set('pub1', {
			...emptyRuntime(),
			pending_deletions: [
				{ path: P1, since: new Date(T0 - 1).toISOString() },
				{ path: P2, since: new Date(T0 - 1).toISOString() },
				// Recorded AFTER this round's decision instant: a newer unpublish, never superseded.
				{ path: '.publication/pub/test3_1', since: new Date(T0 + 1).toISOString() },
			],
		});
		world.agentMarkers.add(K1);
		world.agentFiles.set(P1, 'old');
		world.agentFiles.set(P2, 'png!');
		const d: CopyDeps = { ...worldDeps(world), del: async () => undefined };
		const plan: ApplyPlan = { put: [desired(world, P1)], del: [P2], mark: [] };
		const report = await applyCopyWith(d, 'pub1', plan);
		expect(world.agentFiles.get(P1)).toBe('jpeg');
		expect(world.runtime.get('pub1')?.pending_deletions.map((p) => p.path)).toEqual([
			P2,
			'.publication/pub/test3_1',
		]);
		expect(report).toMatchObject({ state: 'failed', error: DELETION_UNVERIFIED });
	});
});

describe('the real publication-target lock', () => {
	test('another session holding media:<host> defers every unit; released, the round completes', async () => {
		const world = newWorld();
		world.agentFiles.set(P1, 'jpeg');
		world.agentMarkers.add(K1);
		const d: CopyDeps = {
			...worldDeps(world),
			lock: (host, work) => withTargetLock(mediaCopyTargetLockKey(host), work, { mode: 'try' }),
		};
		const plan = planFrom(world);
		const holder = await holdLock(mediaCopyTargetLockKey('pubtest'));
		try {
			const blocked = await applyCopyWith(d, 'pubtest', plan);
			expect(blocked).toMatchObject({ state: 'pending', deferred: 1 });
			expect(world.calls).toEqual([]);
		} finally {
			await holder.release();
		}
		const done = await applyCopyWith(d, 'pubtest', plan);
		expect(done.state).toBe('ok');
		expect(world.agentFiles.size).toBe(0);
		expect(world.agentMarkers.size).toBe(0);
	});
});

describe('syncHostWith', () => {
	test('a host not in copy mode is left alone', async () => {
		const seen: string[] = [];
		const result = await syncHostWith(
			{
				takesCopy: async () => false,
				plan: async () => {
					seen.push('plan');
					return EMPTY;
				},
				apply: async () => {
					seen.push('apply');
					return okReport('pub1');
				},
				recordFailure: async () => okReport('pub1'),
			},
			'pub1',
			[K1],
		);
		expect(result).toBeNull();
		expect(seen).toEqual([]);
	});

	test('withdrawn keys go first; an agent that is down stops the sync before planning', async () => {
		const world = newWorld();
		world.down = true;
		const d = worldDeps(world);
		let planned = false;
		const report = await syncHostWith(
			{
				takesCopy: async () => true,
				plan: async () => {
					planned = true;
					return planFrom(world);
				},
				apply: (host, plan) => applyCopyWith(d, host, plan),
				recordFailure: (host, error) => recordRoundFailure(d, host, error),
			},
			'pub1',
			[K1],
		);
		expect(planned).toBe(false);
		expect(report).toMatchObject({ state: 'pending', error: 'publication_host.unreachable' });
		expect(world.runtime.get('pub1')?.pending_deletions.map((p) => p.path)).toEqual([
			'.publication/pub/test3_1',
		]);
	});

	test('withdrawn keys go first, then the plan from ground truth', async () => {
		const world = newWorld();
		world.agentMarkers.add(K1);
		world.agentFiles.set(P1, 'jpeg');
		world.local.set(P2, { bytes: 'png!', mtimeMs: 5 });
		world.published.add(K2);
		const d = worldDeps(world);
		const report = await syncHostWith(
			{
				takesCopy: async () => true,
				plan: async () => planFrom(world),
				apply: (host, plan) => applyCopyWith(d, host, plan),
				recordFailure: (host, error) => recordRoundFailure(d, host, error),
			},
			'pub1',
			[K1],
		);
		expect(world.calls).toEqual([
			'mark test3_1 false',
			`del ${P1}`,
			'mark test3_2 true',
			`put ${P2}`,
		]);
		expect(report).toMatchObject({ state: 'ok', put: 1 });
	});

	test('a stale pending deletion never stops a hook unpublish before planning: both deleted and verified', async () => {
		const world = newWorld();
		world.agentFiles.set(P1, 'jpeg'); // left pending by an earlier round that failed after recording
		world.agentMarkers.add(K2);
		world.agentFiles.set(P2, 'png!');
		world.runtime.set('pub1', {
			...emptyRuntime(),
			state: 'pending',
			pending_deletions: [{ path: P1, since: new Date(T0 - 3_600_000).toISOString() }],
		});
		const d = worldDeps(world);
		let planned = false;
		const report = await syncHostWith(
			{
				takesCopy: async () => true,
				plan: async () => {
					planned = true;
					return planFrom(world);
				},
				apply: (host, plan, options) => applyCopyWith(d, host, plan, options),
				recordFailure: (host, error) => recordRoundFailure(d, host, error),
			},
			'pub1',
			[K2],
		);
		expect(planned).toBe(true);
		expect(world.agentFiles.size).toBe(0);
		expect(world.agentMarkers.has(K2)).toBe(false);
		expect(report).toMatchObject({ state: 'ok', error: null, pending_deletions: 0 });
		expect(world.runtime.get('pub1')).toMatchObject({ state: 'ok', pending_deletions: [] });
	});

	test('a withdraw-only pass keeps pending_puts and never judges an older pending deletion unverified', async () => {
		const world = newWorld();
		world.agentFiles.set(P1, 'jpeg');
		world.agentMarkers.add(K2);
		world.runtime.set('pub1', {
			...emptyRuntime(),
			state: 'pending',
			pending_puts: 3,
			pending_deletions: [{ path: P1, since: new Date(T0).toISOString() }],
		});
		const report = await applyCopyWith(
			worldDeps(world),
			'pub1',
			{ put: [], del: [], mark: [{ key: K2, published: false }] },
			{ withdrawOnly: true },
		);
		expect(report).toMatchObject({ state: 'pending', error: null, withdrawn: 1 });
		expect(world.runtime.get('pub1')).toMatchObject({ state: 'pending', pending_puts: 3 });
		expect(world.runtime.get('pub1')?.pending_deletions.map((p) => p.path)).toEqual([P1]);
	});

	test('keys withdrawn while a round runs pre-empt its NEXT unit: recorded, then marked false before the next put', async () => {
		const world = newWorld();
		world.agentMarkers.add(K2);
		world.agentFiles.set(P2, 'png!');
		world.local.set(P1, { bytes: 'jpeg', mtimeMs: 1 });
		world.local.set(P1B, { bytes: 'jpeg', mtimeMs: 1 });
		world.local.set(P2, { bytes: 'png!', mtimeMs: 1 }); // B copied in an earlier round
		world.published.add(K1);
		world.published.add(K2);
		const withdrawnMeanwhile: string[] = [];
		world.duringPut = async (path) => {
			if (path === P1) {
				world.published.delete(K2);
				withdrawnMeanwhile.push(K2);
			}
		};
		const recordedBeforeMark: boolean[] = [];
		const d = worldDeps(world);
		const spying: CopyDeps = {
			...d,
			mark: async (host, key, published, actor) => {
				if (key === K2 && !published) {
					recordedBeforeMark.push(
						world.runtime
							.get(host)
							?.pending_deletions.some((p) => p.path === '.publication/pub/test3_2') === true,
					);
				}
				await d.mark(host, key, published, actor);
			},
		};
		const report = await applyCopyWith(spying, 'pub1', planFrom(world), {
			takeWithdrawn: () => withdrawnMeanwhile.splice(0),
		});
		expect(world.calls).toEqual([
			'mark test3_1 true',
			`put ${P1}`,
			'mark test3_2 false',
			`put ${P1B}`,
		]);
		expect(recordedBeforeMark).toEqual([true]);
		// The pre-empted marker is VERIFIED gone at the round's end (never a false
		// deletion_unverified); its files are the queued run's plan to delete.
		expect(world.agentMarkers.has(K2)).toBe(false);
		expect(report).toMatchObject({
			state: 'ok',
			error: null,
			withdrawn: 1,
			put: 2,
			deferred: 0,
			pending_deletions: 0,
		});
		expect(world.runtime.get('pub1')).toMatchObject({
			state: 'ok',
			error: null,
			pending_deletions: [],
		});
	});

	test('a planning failure is recorded as a code in the runtime file (typed → its code, untyped → internal.unexpected)', async () => {
		const world = newWorld();
		const d = worldDeps(world);
		const deps = (error: Error) => ({
			takesCopy: async () => true,
			plan: async (): Promise<ApplyPlan> => {
				throw error;
			},
			apply: (host: string, plan: ApplyPlan) => applyCopyWith(d, host, plan),
			recordFailure: (host: string, failure: unknown) => recordRoundFailure(d, host, failure),
		});
		const timeout = await syncHostWith(
			deps(new DedaloError('publication_host.timeout')),
			'pub1',
			[],
		);
		expect(timeout).toMatchObject({ state: 'pending', error: 'publication_host.timeout' });
		expect(world.runtime.get('pub1')).toMatchObject({
			state: 'pending',
			error: 'publication_host.timeout',
		});
		const broken = await syncHostWith(deps(new Error('walk broke (test)')), 'pub1', []);
		expect(broken).toMatchObject({ state: 'failed', error: 'internal.unexpected' });
	});
});

describe('hostTakesCopy (the agent decides; unreachable → the last runtime state)', () => {
	function io(mode: string | Error, last: MediaCopyRuntime['state'] | undefined) {
		const marked: string[] = [];
		const probe: TakesCopyIo = {
			status: async () => {
				if (mode instanceof Error) throw mode;
				return { media: { mode } };
			},
			lastState: async () => last,
			markNotCopy: async (name: string) => {
				marked.push(name);
			},
		};
		return { marked, io: probe };
	}
	const down = new DedaloError('publication_host.unreachable', { message: 'down (test)' });

	test('copy → true', async () => {
		expect(await hostTakesCopy('pub1', io('copy', undefined).io)).toBe(true);
	});
	test('shared → false, and the runtime is marked n/a', async () => {
		const probe = io('shared', 'ok');
		expect(await hostTakesCopy('pub1', probe.io)).toBe(false);
		expect(probe.marked).toEqual(['pub1']);
	});
	test('unreachable after a copy round → true (the withdrawal must be recorded pending)', async () => {
		expect(await hostTakesCopy('pub1', io(down, 'ok').io)).toBe(true);
		expect(await hostTakesCopy('pub1', io(down, 'failed').io)).toBe(true);
	});
	test('unreachable and never a copy host → false (it holds nothing to withdraw)', async () => {
		expect(await hostTakesCopy('pub1', io(down, undefined).io)).toBe(false);
		expect(await hostTakesCopy('pub1', io(down, 'n/a').io)).toBe(false);
	});
});

describe('openLocalMediaFile (confined to the media root, never through a link)', () => {
	test('stat + stream of a real file; absent → null; a link → null; traversal refused', async () => {
		const root = scratchMediaRoot('dedalo_media_copy_open_');
		try {
			const relative = `${imageQuality()}/0/test99_test3_1.jpg`;
			mkdirSync(join(root, imageQuality(), '0'), { recursive: true });
			writeFileSync(join(root, relative), 'jpeg');
			const opened = await openLocalMediaFile(relative, root);
			expect(opened?.size).toBe(4);
			expect(typeof opened?.mtimeMs).toBe('number');
			expect(await new Response(opened?.body).text()).toBe('jpeg');
			expect(await openLocalMediaFile(`${imageQuality()}/0/test99_test3_404.jpg`, root)).toBeNull();
			const linked = `${imageQuality()}/0/test99_test3_2.jpg`;
			symlinkSync(join(root, relative), join(root, linked));
			expect(await openLocalMediaFile(linked, root)).toBeNull();
			mkdirSync(join(root, imageQuality(), '0', 'test99_test3_3.jpg'));
			expect(await openLocalMediaFile(`${imageQuality()}/0/test99_test3_3.jpg`, root)).toBeNull();
			await expect(openLocalMediaFile('../../etc/passwd', root)).rejects.toMatchObject({
				code: 'media.invalid_path',
			});
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
