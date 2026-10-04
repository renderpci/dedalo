/**
 * ONE LOCKED MEDIA-KEY WRITER — the files_info refresh never overwrites a
 * concurrent write (CLOSURE_PLAN Step 2: TOOLS-5 + widening).
 *
 * The finding (audit 2026-09-26): `tool_update_cache`'s media branch and the
 * `files_info` reconcile sweep read the record UNLOCKED, spend seconds on file
 * work (derivative rebuilds, a disk rescan), then write the whole `media[tipo]`
 * array back with a raw `updateMatrixKeyData`. Anything a curator committed in
 * that window — an upload's `original_file_name`, a second item — is silently
 * reverted to the snapshot. A record deleted mid-run is counted "regenerated"
 * although nothing was written; a shrink that only exists in the curator's
 * value is never seen, so it is never held.
 *
 * THE INTERLEAVE (two connections, identity-proven, never a sleep): the
 * curator T2 holds an uncommitted write on the row; the door T1 runs and must
 * provably WAIT on T2's lock (`pg_blocking_pids` names T2 — the anti-vacuity
 * check, true before and after the fix); T2 commits; T1 finishes. The outcome
 * is judged on the committed row.
 *
 * LEGS
 *   L1 update_cache: the curator's change survives AND files_info is refreshed.
 *   L2 files_info sweep (apply): the same.
 *   L3 update_cache, row DELETED mid-run: not counted regenerated; counted
 *      `vanished` and named in `errors`.
 *   L4 update_cache, a SHRINK that exists only under the lock: HELD — the
 *      curator's index survives and `media_held` counts it.
 *   L2b files_info sweep (apply), a SHRINK that exists only under the lock:
 *      HELD (`heldOnApply`), the curator's index survives.
 *   L5 files_info sweep, a FOREIGN index (another record's files — the clone
 *      damage CORE-5 leaves): rewritten, never held as a "shrink".
 *   L5b the verdict is PER ITEM: one foreign item beside a legitimate item whose
 *      claimed file is not on this box — the foreign item is rewritten, the
 *      legitimate item's index survives, and the run counts it held.
 *   L5c only the CLONE SIGNATURE is foreign: an entry named by
 *      `properties.image_id` (a name the scanner never builds) is a SHRINK the
 *      rescan cannot see — HELD on apply, its index kept.
 *   L6 the transform REFUSES to run inside a caller's transaction
 *      (`internal.invariant`), writing nothing — its lock would be held to the
 *      caller's COMMIT (a whole sweep's).
 *   L7 a GENUINE lock timeout (SQLSTATE 55P03, produced by Postgres against a
 *      held row) raised under the transform is the per-record `locked` outcome:
 *      rolled back, nothing written, never an escape. (The sweep's own lock
 *      wait is L8's.)
 *   L8 a REAL lock wait that runs out, per record, in the doors themselves, ON
 *      THE LANE PRODUCTION RUNS THEM (the request pool, which bounds no lock
 *      wait of its own — the transform's `lockWait: 'per-record'` does): a
 *      record held by another transaction is COUNTED `locked` and named by
 *      update_cache, and by the files_info sweep through its reconcile-registry
 *      definition (`detail`), while the next record is still refreshed — the
 *      run is never aborted, and never stalls on the held row.
 *   L9 the per-record bound sits BELOW any request statement ceiling, so the
 *      WAIT ends first, as the classified 55P03 — never as a statement timeout
 *      that escapes and aborts the run.
 *
 * SITUATION: a `zzmu` scratch section (→ matrix_test) with one
 * component_image; records created at runtime; files seeded under the LANE's
 * marked suite media root and swept by identifier prefix. assertTestDatabase
 * before the first write; the situation drop asserts zero residue.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { MAINTENANCE_LOCK_TIMEOUT, sql, withTransaction } from '../../src/core/db/postgres.ts';
import { scanFilesInfo } from '../../src/core/media/files_info.ts';
import { FILES_INFO_RECONCILE, sweepFilesInfo } from '../../src/core/media/files_info_reconcile.ts';
import { resolveMediaPathOptions } from '../../src/core/media/ontology_path.ts';
import { buildMediaLocation, type MediaIdentity } from '../../src/core/media/path.ts';
import {
	perRecordLockWaitMs,
	transformStoredMediaItems,
} from '../../src/core/media/tools/files_info_persist.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { countActivityRows, sweepActivityRows } from '../helpers/activity_rows.ts';
import { sweepSeededMediaEntries } from '../helpers/media_seed_sweep.ts';

const SECTION = 'zzmu1';
const IMAGE = 'zzmu2';
const TABLE = 'matrix_test';
const USER_ID = -1;

const SITUATION = situation({
	tld: 'zzmu',
	name: 'media files_info lost update',
	nodes: [
		{ tipo: SECTION, model: 'section', parent: 'dd14' },
		{ tipo: IMAGE, model: 'component_image', parent: SECTION },
	],
});

const image = mediaTypeOf('component_image')!;
/** A derived tier that is neither default, original, master nor thumb: a plain file the scan indexes and the repair never rebuilds. */
const PLAIN_QUALITY = image.qualities.find(
	(quality) =>
		quality !== image.defaultQuality &&
		quality !== image.originalQuality &&
		!image.masterQualities.includes(quality) &&
		quality !== config.media.thumb.quality,
) as string;
/** Two further tiers the SHRINK leg's curator claims (files that are NOT on disk). */
const CLAIMED_QUALITIES = image.qualities
	.filter((quality) => quality !== PLAIN_QUALITY && quality !== config.media.thumb.quality)
	.slice(0, 2);

const bulkRuns: number[] = [];
/** The image/original tier this gate built for the sweep's root guard (removed if still empty). */
let originalTier = '';
let createdOriginalTier = false;
let bulkTable = '';

const identityOf = (sectionId: number): MediaIdentity => ({
	componentTipo: IMAGE,
	sectionTipo: SECTION,
	sectionId,
	lang: null,
});

/** Seed the plain-tier file of a record on disk; returns its absolute path. */
async function seedFile(sectionId: number): Promise<string> {
	const opts = await resolveMediaPathOptions(IMAGE, SECTION, sectionId);
	const path = buildMediaLocation(
		image,
		identityOf(sectionId),
		PLAIN_QUALITY,
		image.defaultExtension,
		opts,
	).absolutePath;
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `media_files_info_lost_update ${sectionId}`);
	return path;
}

/** What a scan of the disk indexes for a record right now. */
async function diskIndex(sectionId: number): Promise<Record<string, unknown>[]> {
	const opts = await resolveMediaPathOptions(IMAGE, SECTION, sectionId);
	return scanFilesInfo(image, identityOf(sectionId), opts, {}) as unknown as Record<
		string,
		unknown
	>[];
}

/** A record with a STALE stored index (`files_info: []`) over a file that IS on disk. */
async function staleRecord(): Promise<number> {
	const id = await createSectionRecord(SECTION, USER_ID);
	await seedFile(id);
	await writeMedia(id, [{ id: 1, files_info: [] }]);
	return id;
}

async function writeMedia(sectionId: number, items: unknown[]): Promise<void> {
	await sql.unsafe(
		`UPDATE "${TABLE}" SET media = jsonb_build_object($3::text, $4::text::jsonb)
		  WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, IMAGE, JSON.stringify(items)],
	);
}

async function storedItems(sectionId: number): Promise<Record<string, unknown>[] | null> {
	const rows = (await sql.unsafe(
		`SELECT media->$3 AS items FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, IMAGE],
	)) as { items: Record<string, unknown>[] | null }[];
	if (rows.length === 0) return null;
	return rows[0]?.items ?? [];
}

const existing = (filesInfo: unknown): Record<string, unknown>[] =>
	(Array.isArray(filesInfo) ? filesInfo : []).filter(
		(entry) => (entry as Record<string, unknown>).file_exist === true,
	) as Record<string, unknown>[];

/**
 * Poll until some backend waits on a lock HELD BY `pid` — identity, not a
 * sleep (bulk_operation_atomicity_native's primitive).
 */
async function waitUntilBlockedBy(pid: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM pg_stat_activity
			 WHERE wait_event_type = 'Lock' AND $1::int = ANY(pg_blocking_pids(pid))`,
			[String(pid)],
		)) as { n: number }[];
		if ((rows[0]?.n ?? 0) > 0) return true;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	return false;
}

/** T2 holds `curatorWork` uncommitted; T1 runs `door` and must wait on T2; T2 commits. */
async function interleave<T>(
	curatorWork: () => Promise<void>,
	door: () => Promise<T>,
): Promise<{ blocked: boolean; door: { value: T } | { error: unknown } }> {
	let release: () => void = () => {};
	const hold = new Promise<void>((resolve) => {
		release = resolve;
	});
	let wrote: () => void = () => {};
	const written = new Promise<void>((resolve) => {
		wrote = resolve;
	});
	let curatorPid = 0;
	const curator = withTransaction(async () => {
		const pidRows = (await sql.unsafe('SELECT pg_backend_pid() AS pid')) as { pid: number }[];
		curatorPid = Number(pidRows[0]?.pid ?? 0);
		await curatorWork();
		wrote();
		await hold;
	});
	await written;
	expect(curatorPid).toBeGreaterThan(0);
	const run = door().then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
	const blocked = await waitUntilBlockedBy(curatorPid, 20_000);
	release();
	await curator;
	return { blocked, door: await run };
}

interface UpdateCacheData {
	regenerated: number;
	errors: string[];
	media_held: number;
	vanished?: number;
	locked?: number;
	bulk_process_id: number;
}

async function updateCache(...sectionIds: number[]): Promise<UpdateCacheData> {
	const loaded = await getLoadedTool('tool_update_cache');
	const action = loaded?.module.apiActions.update_cache;
	if (action === undefined) throw new Error('tool_update_cache.update_cache is not registered');
	const response = await action.handler({
		principal: await resolvePrincipal(USER_ID),
		userId: USER_ID,
		background: true,
		options: {
			section_tipo: SECTION,
			components_selection: [{ tipo: IMAGE }],
			sqo: {
				section_tipo: [SECTION],
				filter_by_locators: sectionIds.map((sectionId) => ({
					section_tipo: SECTION,
					section_id: String(sectionId),
				})),
			},
		},
	});
	expect(response.ok).toBe(true);
	const data = response.data as UpdateCacheData;
	bulkRuns.push(data.bulk_process_id);
	return data;
}

const doorValue = <T>(door: { value: T } | { error: unknown }): T => {
	if ('error' in door) throw door.error;
	return door.value;
};

/** Every file under the lane media root whose name carries this section's identifier prefix (the paths removed). */
function sweepSeededFiles(): string[] {
	return sweepSeededMediaEntries(config.media.rootPath, image.typeFolder, isSeededFile);
}

/** A file this gate seeded: its name carries the zzmu identifier prefix. */
function isSeededFile(name: string, isDirectory: boolean): boolean {
	return !isDirectory && name.startsWith(`${IMAGE}_${SECTION}_`);
}

beforeAll(async () => {
	await assertTestDatabase('media_files_info_lost_update_native');
	sweepSeededFiles();
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
	expect(await getModelByTipo(IMAGE)).toBe('component_image');
	expect(config.media.rootPath, 'no suite media root — the preload did not arm it').not.toBeNull();
	expect(PLAIN_QUALITY).toBeDefined();
	expect(CLAIMED_QUALITIES).toHaveLength(2);
	bulkTable = (await getMatrixTableFromTipo('dd800')) as string;
	// BUILD the tree the sweep's root guard demands of a real install (guardedMediaRoot:
	// `image/original` must exist, or it refuses as "the wrong tree" BEFORE any lock). A
	// fresh lane root has none — measured 2026-10-01 on the hosted runner, where every
	// sweep leg refused at once (media.not_configured) and never reached the row lock;
	// locally another gate in the lane had happened to create it first.
	originalTier = join(config.media.rootPath as string, 'image', 'original');
	createdOriginalTier = !existsSync(originalTier);
	mkdirSync(originalTier, { recursive: true });
}, 60_000);

afterAll(async () => {
	// Ours, and still empty: remove it. rmdir refuses a non-empty directory, so a tier
	// another gate filled meanwhile is left alone (ENOTEMPTY) — no listing needed.
	if (createdOriginalTier) {
		try {
			rmdirSync(originalTier);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== 'ENOTEMPTY' && code !== 'ENOENT') throw error;
		}
	}
	for (const id of bulkRuns) {
		await sql.unsafe(
			`DELETE FROM "${bulkTable}" WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
	}
	await sql.unsafe('DELETE FROM dedalo_ts_record_generation WHERE section_tipo = $1', [SECTION]);
	// The 'NEW' activity rows of every record this file created (the zzmu1
	// records and the dd800 runs): dropSituation's residue count never sees
	// matrix_activity, so they are swept AND counted here (activity_rows.ts).
	await sweepActivityRows(SECTION);
	await sweepActivityRows('dd800', bulkRuns);
	expect(
		(await countActivityRows(SECTION)) + (await countActivityRows('dd800', bulkRuns)),
		'activity residue after the sweep',
	).toBe(0);
	sweepSeededFiles();
	expect(await dropSituation(SITUATION), 'zzmu residue after drop').toBe(0);
}, 60_000);

/**
 * Run a door that must END on its own while a row is held: rejects (red, with
 * the reason) when it is still waiting after 40s — an unbounded lock wait.
 */
async function boundedRun<T>(door: () => Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const stalled = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() =>
				reject(
					new Error(
						'the door is still waiting on the held row after 40s — its lock wait is unbounded on the lane it runs on',
					),
				),
			40_000,
		);
	});
	try {
		return await Promise.race([door(), stalled]);
	} finally {
		clearTimeout(timer);
	}
}

/** A stored entry like `real` but for another quality or file name. */
function entryLike(
	real: Record<string, unknown>,
	patch: { quality?: string; fileName?: string },
): Record<string, unknown> {
	const path = String(real.file_path);
	let filePath = patch.quality === undefined ? path : path.replace(PLAIN_QUALITY, patch.quality);
	if (patch.fileName !== undefined) {
		filePath = `${filePath.slice(0, filePath.lastIndexOf('/') + 1)}${patch.fileName}`;
	}
	return { ...real, quality: patch.quality ?? real.quality, file_path: filePath };
}

describe('the files_info refresh is a LOCKED transform — a concurrent write survives', () => {
	test('floor: the seeded record IS stale (its disk index is not what is stored)', async () => {
		const id = await staleRecord();
		expect(existing((await storedItems(id))?.[0]?.files_info)).toEqual([]);
		expect(existing(await diskIndex(id))).toHaveLength(1);
	});

	test('L1 update_cache: the curator’s concurrent change survives and files_info is refreshed', async () => {
		const id = await staleRecord();
		const curatorItems = [
			{ id: 1, files_info: [], original_file_name: 'curator_upload.tif' },
			{ id: 2, files_info: [] },
		];
		const { blocked, door } = await interleave(
			() => writeMedia(id, curatorItems),
			() => updateCache(id),
		);
		expect(
			blocked,
			'update_cache never waited on the curator’s lock — the interleave proves nothing',
		).toBe(true);
		doorValue(door);
		const items = (await storedItems(id)) ?? [];
		expect(
			items.map((item) => item.id),
			'update_cache wrote its SNAPSHOT back over the curator’s committed items (lost update, TOOLS-5)',
		).toEqual([1, 2]);
		expect(items[0]?.original_file_name, 'the curator’s original_file_name was reverted').toBe(
			'curator_upload.tif',
		);
		expect(
			existing(items[0]?.files_info),
			'the refresh did not index the file on disk',
		).toHaveLength(1);
	}, 90_000);

	test('L2 files_info sweep (apply): the curator’s concurrent change survives and files_info is refreshed', async () => {
		const id = await staleRecord();
		const curatorItems = [
			{ id: 1, files_info: [], original_file_name: 'curator_upload.tif' },
			{ id: 2, files_info: [] },
		];
		const { blocked, door } = await interleave(
			() => writeMedia(id, curatorItems),
			() => sweepFilesInfo({ apply: true, section: SECTION, id }),
		);
		expect(
			blocked,
			'the sweep never waited on the curator’s lock — the interleave proves nothing',
		).toBe(true);
		doorValue(door);
		const items = (await storedItems(id)) ?? [];
		expect(
			items.map((item) => item.id),
			'the sweep wrote its SNAPSHOT back over the curator’s committed items (lost update)',
		).toEqual([1, 2]);
		expect(items[0]?.original_file_name).toBe('curator_upload.tif');
		expect(existing(items[0]?.files_info)).toHaveLength(1);
	}, 90_000);

	test('L3 update_cache, row DELETED mid-run: not counted regenerated, counted vanished and named', async () => {
		const id = await staleRecord();
		const { blocked, door } = await interleave(
			async () => {
				await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
					SECTION,
					id,
				]);
			},
			() => updateCache(id),
		);
		expect(blocked).toBe(true);
		const data = doorValue(door);
		expect(await storedItems(id), 'the row came back — re-read this gate').toBeNull();
		expect(
			data.regenerated,
			'a record deleted during the run is reported "regenerated" although nothing was written',
		).toBe(0);
		expect(data.vanished, 'the vanished record is not counted').toBe(1);
		expect(
			data.errors.some(
				(line) => line.includes(`${IMAGE}#${id}`) && line.includes('deleted during the run'),
			),
			'the vanished record is not named in errors',
		).toBe(true);
	}, 90_000);

	test('L4 update_cache, a SHRINK that exists only under the lock is HELD', async () => {
		const id = await staleRecord();
		const [real] = existing(await diskIndex(id));
		expect(real).toBeDefined();
		// The curator's index claims two MORE tiers than the disk holds: rescanned,
		// it shrinks — but only the LOCKED value says so; the snapshot says grow.
		const claims = CLAIMED_QUALITIES.map((quality) => ({
			...(real as Record<string, unknown>),
			quality,
			file_path: String((real as Record<string, unknown>).file_path).replace(
				PLAIN_QUALITY,
				quality,
			),
		}));
		const curatorItems = [{ id: 1, files_info: [real, ...claims] }];
		const { blocked, door } = await interleave(
			() => writeMedia(id, curatorItems),
			() => updateCache(id),
		);
		expect(blocked).toBe(true);
		const data = doorValue(door);
		expect(
			existing((await storedItems(id))?.[0]?.files_info),
			'the curator’s index was overwritten from the snapshot — a shrink visible only under the lock was never held',
		).toHaveLength(3);
		expect(data.media_held, 'the held shrink is not counted').toBe(1);
	}, 90_000);

	test('L2b files_info sweep (apply), a SHRINK that exists only under the lock is HELD', async () => {
		const id = await staleRecord();
		const [real] = existing(await diskIndex(id));
		expect(real).toBeDefined();
		const claims = CLAIMED_QUALITIES.map((quality) => ({
			...(real as Record<string, unknown>),
			quality,
			file_path: String((real as Record<string, unknown>).file_path).replace(
				PLAIN_QUALITY,
				quality,
			),
		}));
		const { blocked, door } = await interleave(
			() => writeMedia(id, [{ id: 1, files_info: [real, ...claims] }]),
			() => sweepFilesInfo({ apply: true, section: SECTION, id }),
		);
		expect(blocked, 'the sweep never waited on the curator’s lock').toBe(true);
		const summary = doorValue(door);
		expect(
			existing((await storedItems(id))?.[0]?.files_info),
			'the sweep adjudicated on its unlocked snapshot (a GROW) and wrote over the curator’s index — a shrink visible only under the lock was never held',
		).toHaveLength(3);
		expect(summary.heldOnApply, 'the shrink held under the lock is not counted').toBe(1);
		expect(summary.repaired).toBe(0);
	}, 90_000);

	test('L6 the locked transform REFUSES a caller’s transaction and writes nothing', async () => {
		const id = await staleRecord();
		const before = await storedItems(id);
		let ran = false;
		await expect(
			withTransaction(() =>
				transformStoredMediaItems(
					{ sectionTipo: SECTION, sectionId: id, componentTipo: IMAGE },
					() => {
						ran = true;
						return { write: [{ id: 1, files_info: [{ refused: true }] }] as never };
					},
					{ lockWait: 'request' },
				),
			),
		).rejects.toMatchObject({ code: 'internal.invariant' });
		expect(ran, 'the transform ran inside the caller’s transaction').toBe(false);
		expect(await storedItems(id)).toEqual(before);
	}, 60_000);

	test('L7 a genuine lock timeout under the transform is the per-record `locked` outcome, nothing written', async () => {
		const id = await staleRecord();
		const before = await storedItems(id);
		// A REAL 55P03, as Postgres raises it: a second transaction with a short
		// lock_timeout asks for a row the first one holds.
		let release: () => void = () => {};
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		let held: () => void = () => {};
		const holding = new Promise<void>((resolve) => {
			held = resolve;
		});
		const holder = withTransaction(async () => {
			await sql.unsafe(
				`SELECT 1 FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
				[SECTION, id],
			);
			held();
			await hold;
		});
		await holding;
		const timeout = await withTransaction(async () => {
			await sql.unsafe("SET LOCAL lock_timeout = '50ms'");
			await sql.unsafe(
				`SELECT 1 FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
				[SECTION, id],
			);
		}).then(
			() => null,
			(error: unknown) => error,
		);
		release();
		await holder;
		expect(timeout, 'no lock timeout was provoked — re-read this gate').not.toBeNull();
		expect((await import('../../src/core/db/postgres.ts')).sqlStateOf(timeout)).toBe('55P03');

		const outcome = await transformStoredMediaItems(
			{ sectionTipo: SECTION, sectionId: id, componentTipo: IMAGE },
			() => {
				throw timeout;
			},
			{ lockWait: 'request' },
		);
		expect(
			outcome.action,
			'a lock timeout escaped the transform — one locked record would abort a whole sweep',
		).toBe('locked');
		expect(outcome.affected).toBe(0);
		expect(await storedItems(id)).toEqual(before);
	}, 60_000);

	test('L8 a REAL lock wait that runs out is COUNTED `locked` per record — update_cache and the sweep carry on to the next record', async () => {
		const lockedId = await staleRecord();
		const freeForCache = await staleRecord();
		const before = await storedItems(lockedId);
		let release: () => void = () => {};
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		let held: () => void = () => {};
		const holding = new Promise<void>((resolve) => {
			held = resolve;
		});
		// Another transaction holds the record's row for the whole leg.
		const holder = withTransaction(async () => {
			await sql.unsafe(
				`SELECT 1 FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
				[SECTION, lockedId],
			);
			held();
			await hold;
		});
		await holding;
		try {
			// The PRODUCTION lane: no withUnboundedStatements here — the doors run on
			// the request pool, and the bound on the wait is the transform's own. A
			// door that waits forever fails the race, not the 120s test timeout.
			const data = await boundedRun(() => updateCache(lockedId, freeForCache));
			expect(data.locked, 'update_cache did not count the record whose lock wait ran out').toBe(1);
			expect(
				data.errors.some(
					(line) => line.includes(`${IMAGE}#${lockedId}`) && line.includes('locked'),
				),
				'the locked record is not named in errors',
			).toBe(true);
			expect(await storedItems(lockedId), 'a locked record was written').toEqual(before);
			expect(
				existing((await storedItems(freeForCache))?.[0]?.files_info),
				'update_cache stopped at the locked record — the next one was never refreshed',
			).toHaveLength(1);

			const freeForSweep = await staleRecord();
			const report = await boundedRun(() =>
				FILES_INFO_RECONCILE.run({ apply: true, scope: [SECTION] }),
			);
			const detail = report.detail as Record<string, unknown>;
			expect(
				detail.locked,
				'the sweep’s registry report does not name the record whose lock wait ran out',
			).toBe(1);
			expect(await storedItems(lockedId)).toEqual(before);
			expect(
				existing((await storedItems(freeForSweep))?.[0]?.files_info),
				'the sweep stopped at the locked record — the next one was never refreshed',
			).toHaveLength(1);
		} finally {
			release();
			await holder;
		}
	}, 120_000);

	test('L5 files_info sweep: a FOREIGN index (another record’s files) is rewritten, never held as a shrink', async () => {
		const source = await staleRecord();
		const clone = await createSectionRecord(SECTION, USER_ID);
		// The clone's stored index names the SOURCE's files (what a duplicate whose
		// copy failed leaves behind); the clone's own identity has no file on disk.
		const foreign = existing(await diskIndex(source));
		expect(foreign).toHaveLength(1);
		await writeMedia(clone, [{ id: 1, files_info: foreign }]);
		expect(existing(await diskIndex(clone))).toEqual([]);

		const summary = await sweepFilesInfo({ apply: true, section: SECTION, id: clone });

		const after = existing((await storedItems(clone))?.[0]?.files_info);
		expect(
			after.filter((entry) => String(entry.file_path).includes(`${IMAGE}_${SECTION}_${source}.`)),
			'the clone still indexes the SOURCE record’s files — the sweep HELD a foreign index as a shrink',
		).toEqual([]);
		expect(summary.repaired).toBe(1);
	}, 90_000);

	test('L5b files_info sweep: the verdict is PER ITEM — a foreign item never carries a legitimate item’s shrink through', async () => {
		const source = await staleRecord();
		const clone = await createSectionRecord(SECTION, USER_ID);
		const [foreign] = existing(await diskIndex(source));
		expect(foreign).toBeDefined();
		// Item 2 claims the clone's OWN file — legitimately named, absent on this box
		// (a partial-media copy): its rescan is a SHRINK.
		const ownClaim = String((foreign as Record<string, unknown>).file_path).replace(
			`${IMAGE}_${SECTION}_${source}.`,
			`${IMAGE}_${SECTION}_${clone}.`,
		);
		expect(ownClaim).toContain(`${IMAGE}_${SECTION}_${clone}.`);
		const legitimate = { ...(foreign as Record<string, unknown>), file_path: ownClaim };
		await writeMedia(clone, [
			{ id: 1, files_info: [foreign] },
			{ id: 2, files_info: [legitimate] },
		]);
		expect(existing(await diskIndex(clone)), 'the clone has a file on disk — re-read').toEqual([]);

		const dry = await sweepFilesInfo({ apply: false, section: SECTION, id: clone });
		expect(dry.changes).toHaveLength(1);
		expect(dry.changes[0]?.kind).toBe('FOREIGN');
		expect(dry.changes[0]?.heldItems, 'the legitimate item’s shrink is not held').toBe(1);

		const summary = await sweepFilesInfo({ apply: true, section: SECTION, id: clone });
		const items = (await storedItems(clone)) ?? [];
		expect(items.map((item) => item.id)).toEqual([1, 2]);
		expect(
			existing(items[0]?.files_info),
			'the FOREIGN item still names the source’s file',
		).toEqual([]);
		expect(
			existing(items[1]?.files_info).map((entry) => entry.file_path),
			'the legitimate item’s index was wiped with its foreign sibling — a per-component FOREIGN verdict carried a SHRINK through (the 2026-07-19 index-wipe class)',
		).toEqual([ownClaim]);
		expect(summary.repaired).toBe(1);
		expect(summary.held, 'the held item is not counted').toBe(1);
	}, 90_000);

	test('L5c files_info sweep: only the CLONE SIGNATURE is foreign — an image_id-named entry the scan cannot see is HELD', async () => {
		const source = await staleRecord();
		const renamed = await createSectionRecord(SECTION, USER_ID);
		const [real] = existing(await diskIndex(source));
		expect(real).toBeDefined();
		// A `properties.image_id` file: named by a sibling value, not by the identifier.
		const named = entryLike(real as Record<string, unknown>, { fileName: 'IMG_0042.jpg' });
		await writeMedia(renamed, [{ id: 1, files_info: [named] }]);
		const before = await storedItems(renamed);

		const summary = await sweepFilesInfo({ apply: true, section: SECTION, id: renamed });
		expect(
			await storedItems(renamed),
			'the sweep wiped an index whose file the scanner cannot name — a non-identifier name was judged FOREIGN and bypassed the shrink hold',
		).toEqual(before);
		expect(summary.changes[0]?.kind).toBe('SHRINK');
		expect(summary.held).toBe(1);
		expect(summary.repaired).toBe(0);
	}, 90_000);

	test('L9 the per-record lock bound ends BELOW any request statement ceiling', () => {
		const maintenanceMs = Number(/^(\d+)s$/.exec(MAINTENANCE_LOCK_TIMEOUT)?.[1]) * 1000;
		expect(maintenanceMs).toBeGreaterThan(0);
		expect(perRecordLockWaitMs(0), 'no ceiling: the maintenance bound').toBe(maintenanceMs);
		expect(perRecordLockWaitMs(60_000)).toBe(maintenanceMs);
		for (const ceiling of [1, 2, 1000, maintenanceMs, maintenanceMs + 1]) {
			const bound = perRecordLockWaitMs(ceiling);
			expect(bound, `ceiling ${ceiling}ms: the bound is not below it`).toBeLessThan(
				Math.max(2, ceiling),
			);
			expect(bound).toBeGreaterThan(0);
		}
	});

	test('the cleanup sweep finds a file this gate seeds — its afterAll is never blind', async () => {
		// Last in the file: it sweeps every zzmu file the cases above seeded too.
		const id = await createSectionRecord(SECTION, USER_ID);
		const path = await seedFile(id);
		expect(existsSync(path)).toBe(true);
		const swept = sweepSeededFiles();
		expect(swept.length).toBeGreaterThan(0);
		expect(existsSync(path), 'the sweep walked past a file this gate seeded').toBe(false);
	});

	test('the cleanup sweep REFUSES a root without the test-media marker, deleting nothing', () => {
		const unmarked = mkdtempSync(join(tmpdir(), 'zzmu_unmarked_'));
		try {
			const planted = join(unmarked, image.typeFolder, `${IMAGE}_${SECTION}_1.jpg`);
			mkdirSync(dirname(planted), { recursive: true });
			writeFileSync(planted, 'not a test media root');
			expect(() => sweepSeededMediaEntries(unmarked, image.typeFolder, isSeededFile)).toThrow(
				/no \.dedalo_test_media marker/,
			);
			expect(existsSync(planted), 'a refused sweep deleted a file').toBe(true);
		} finally {
			rmSync(unmarked, { recursive: true, force: true });
		}
	});
});
