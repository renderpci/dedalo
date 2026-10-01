/**
 * MEDIA_INDEX — native port of the old engine's publication-marker store
 * (oracle: v7_php_frozen/master_dedalo/diffusion/api/v1/lib/media_index.ts; S2-31/DEC-19
 * cutover blocker — record-delete propagation and media-index rebuild must
 * not depend on the decommission-bound old-engine socket).
 *
 * Filesystem allowlist of published media records ("publication markers").
 * The web server (Apache/Nginx) authorizes anonymous access to a media file
 * with a single stat() on a zero-byte marker keyed by the record the file
 * belongs to ({section_tipo}_{section_id}, parsed from the media file name).
 * This module is the ONLY writer of those markers; it mirrors the publication
 * state the diffusion module already owns (row existence in the target
 * MariaDB tables).
 *
 * Layout under DEDALO_MEDIA_PATH/.publication/:
 *   pub/{section_tipo}_{section_id}        union across all dbs/tables — the
 *                                          only path web servers test
 *   dbs/{db_name}/{table_name}/{key}       ground truth per publication target
 *   auth/{cookie_value}                    PHP-owned (login cookie markers),
 *                                          never touched here
 *
 * Semantics: a pub/ marker exists ⇔ the key exists in at least one
 * dbs/{db}/{table}/ dir. Appliers recompute that union from the full dir
 * state (never counters), so concurrent publish/unpublish stay idempotent.
 * All failure modes are fail-closed: a missing marker only means a published
 * record is not publicly visible until the next publish/reconcile/rebuild.
 * Marker failures must NEVER fail the publication/delete that triggered them
 * (callers wrap and log — oracle delete_handler.ts:138 / index.ts:212-224).
 *
 * When DEDALO_MEDIA_PATH is not configured every function is a no-op
 * (feature off). PHP glossary: get_base/make_key/apply_table_state/
 * reconcile/get_status/rebuild → markerStoreBase/makeMarkerKey/
 * applyTableState/reconcileMediaIndex/getMediaIndexStatus/rebuildMediaIndex.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { config } from '../../../config/config.ts';
import {
	sqlTargetLockKey,
	withTargetLock,
	withTargetLocks,
} from '../../../core/diffusion_bridge/target_lock.ts';
import { DedaloError } from '../../../core/errors/index.ts';
import { assertTestMediaRoot } from '../../../core/media/test_media_root.ts';
import { escapeSqlIdentifier } from '../../plan/identifier.ts';
import { getTargetPool, isMissingDatabaseError, isMissingTableError } from '../mariadb/db.ts';

// {section_tipo}_{section_id} — tipos are strictly alphanumeric (rsc167, oh21…)
const KEY_REGEX = /^[a-z0-9]+_[0-9]+$/i;

// database/table names become directory names: stay strict
const NAME_REGEX = /^[A-Za-z0-9_.-]+$/;

// Per-key mutation chains: serialize marker updates for the same key so the
// union recompute never races itself inside this single-writer process.
// NOT request state (module_state rule): a pure serialization primitive whose
// entries are deleted as soon as their chain drains.
const keyLocks = new Map<string, Promise<void>>();

/** Test seam: override the store base (a scratch temp dir) — null restores
 * the config resolution. Guarded to tmp-ish paths so a test can never point
 * the writer at a real media tree. */
let baseOverrideForTests: string | null = null;
export function overrideMediaIndexBaseForTests(base: string | null): void {
	if (base !== null && !/\/(tmp|T)\//.test(base) && !base.startsWith('/tmp')) {
		throw new Error('overrideMediaIndexBaseForTests only accepts temp-dir paths');
	}
	baseOverrideForTests = base;
}

/**
 * markerStoreBase (oracle get_base): the store base dir from the media root.
 * Returns null when unset (feature disabled).
 */
export function markerStoreBase(): string | null {
	// The override is a STORE base, not a media root (a tmp dir standing in for
	// `<root>/.publication`), and its own tmp-only guard above already keeps it off
	// a real tree — so it short-circuits before the media-root guard.
	if (baseOverrideForTests !== null) return baseOverrideForTests;
	const mediaPath = config.media.rootPath;
	if (mediaPath === null || !path.isAbsolute(mediaPath)) {
		return null;
	}
	// A ROOT RESOLVER: this module WRITES the publication marker store inside the
	// media tree without going through path.ts, so the test-media guard sits here
	// too (inert outside the test seam — core/media/test_media_root.ts).
	assertTestMediaRoot(mediaPath, 'media_index.markerStoreBase');
	return path.join(mediaPath, '.publication');
}

/**
 * makeMarkerKey (oracle make_key): builds and validates the marker key for a
 * record. Returns null on invalid input (logged by callers as a skip, never
 * a throw).
 */
export function makeMarkerKey(sectionTipo: string, sectionId: string | number): string | null {
	const key = `${sectionTipo}_${sectionId}`;
	return KEY_REGEX.test(key) ? key : null;
}

/** Chains fn onto the per-key mutation queue (oracle with_key_lock). */
async function withKeyLock(key: string, fn: () => Promise<void>): Promise<void> {
	const prev = keyLocks.get(key) ?? Promise.resolve();
	const next = prev.then(fn, fn);
	keyLocks.set(key, next);
	try {
		await next;
	} finally {
		if (keyLocks.get(key) === next) {
			keyLocks.delete(key);
		}
	}
}

/** Creates a zero-byte marker file (parent dirs included). */
async function touch(filePath: string): Promise<void> {
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, '');
}

/** Removes a file, tolerating ENOENT. */
async function unlinkQuiet(filePath: string): Promise<void> {
	try {
		await fs.unlink(filePath);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/** Derives pub/{key} from the full dbs/<db>/<table>/{key} state. */
async function recomputeUnion(base: string, key: string): Promise<void> {
	const dbsDir = path.join(base, 'dbs');
	let published = false;

	let dbEntries: string[] = [];
	try {
		dbEntries = await fs.readdir(dbsDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
	}

	outer: for (const dbName of dbEntries) {
		let tableEntries: string[] = [];
		try {
			tableEntries = await fs.readdir(path.join(dbsDir, dbName));
		} catch {
			continue;
		}
		for (const tableName of tableEntries) {
			if (await fileExists(path.join(dbsDir, dbName, tableName, key))) {
				published = true;
				break outer;
			}
		}
	}

	const pubMarker = path.join(base, 'pub', key);
	if (published) {
		await touch(pubMarker);
	} else {
		await unlinkQuiet(pubMarker);
	}
}

/**
 * applyTableState (oracle apply_table_state): mirrors one publication write
 * into the marker store — publishedIds gain a marker in dbs/{db}/{table}/,
 * unpublishedIds lose it, and the pub/ union is recomputed per touched key.
 *
 * Never throws on per-key problems: invalid keys are skipped (returned in
 * the skipped list) so a single odd record cannot abort a diffusion.
 * Callers wrap the whole call in try/catch and log — marker failures must
 * never fail the publication itself.
 */
export async function applyTableState(
	databaseName: string,
	tableName: string,
	sectionTipo: string,
	publishedIds: (string | number)[],
	unpublishedIds: (string | number)[],
): Promise<{ applied: number; skipped: string[] }> {
	const base = markerStoreBase();
	if (base === null) {
		return { applied: 0, skipped: [] };
	}
	if (!NAME_REGEX.test(databaseName) || !NAME_REGEX.test(tableName)) {
		return { applied: 0, skipped: [`invalid db/table name: ${databaseName}.${tableName}`] };
	}
	// Scratch-surface guard (the test law: DB writes in tests only on scratch
	// surfaces): `dedalo_ts_*` tables are scratch by convention — their rows
	// must NEVER widen the PRODUCTION media allowlist (markers only ever widen
	// access). The integration writer/delete gates run real scratch upserts;
	// without this guard they would mint real pub/ markers for real tipos.
	if (tableName.startsWith('dedalo_ts_')) {
		return { applied: 0, skipped: [] };
	}

	const tableDir = path.join(base, 'dbs', databaseName, tableName);
	const skipped: string[] = [];
	let applied = 0;

	const ops: Array<{ key: string; publish: boolean }> = [];
	for (const id of publishedIds) {
		const key = makeMarkerKey(sectionTipo, id);
		if (key === null) {
			skipped.push(`${sectionTipo}_${id}`);
			continue;
		}
		ops.push({ key, publish: true });
	}
	for (const id of unpublishedIds) {
		const key = makeMarkerKey(sectionTipo, id);
		if (key === null) {
			skipped.push(`${sectionTipo}_${id}`);
			continue;
		}
		ops.push({ key, publish: false });
	}

	for (const op of ops) {
		await withKeyLock(op.key, async () => {
			if (op.publish) {
				await touch(path.join(tableDir, op.key));
			} else {
				await unlinkQuiet(path.join(tableDir, op.key));
			}
			await recomputeUnion(base, op.key);
		});
		applied++;
	}

	return { applied, skipped };
}

/**
 * diffMediaIndex — the READ half of the reconcile: which pub/ markers the
 * dbs/ ground truth says are missing, and which are stray. Pure filesystem
 * read, no SQL, writes nothing — the dry run every door (boot, widget, CLI)
 * reports from. Null when the store is off.
 */
export async function diffMediaIndex(): Promise<{ toAdd: string[]; toRemove: string[] } | null> {
	const base = markerStoreBase();
	if (base === null) {
		return null;
	}

	// collect every key present under dbs/<db>/<table>/
	const truth = new Set<string>();
	const dbsDir = path.join(base, 'dbs');
	let dbEntries: string[] = [];
	try {
		dbEntries = await fs.readdir(dbsDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
	}
	for (const dbName of dbEntries) {
		let tableEntries: string[] = [];
		try {
			tableEntries = await fs.readdir(path.join(dbsDir, dbName));
		} catch {
			continue;
		}
		for (const tableName of tableEntries) {
			let keys: string[] = [];
			try {
				keys = await fs.readdir(path.join(dbsDir, dbName, tableName));
			} catch {
				continue;
			}
			for (const key of keys) {
				if (KEY_REGEX.test(key)) truth.add(key);
			}
		}
	}

	// current pub/ state
	const pubDir = path.join(base, 'pub');
	let current: string[] = [];
	try {
		current = await fs.readdir(pubDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
	}

	const currentSet = new Set(current);
	const toAdd = [...truth].filter((key) => !currentSet.has(key)).sort();
	const toRemove = current.filter((key) => !truth.has(key)).sort();
	return { toAdd, toRemove };
}

/** Most rounds the fenced apply re-runs because a database appeared during it. */
const MEDIA_INDEX_FENCE_ROUNDS = 5;

/**
 * How long ONE reconcile — or ONE rebuild, its closing reconcile included —
 * waits IN TOTAL for publication targets other writers hold. The multi-target
 * fence holds nothing while it waits (withTargetLocks is all-or-none), so the
 * bound costs nobody but the door: it ends a wait that needs every marker
 * database free at one instant, and the rebuild request that runs it. Spent ⇒
 * the reconcile is DEFERRED (nothing applied, the busy target named), the
 * rebuild reports what it could not resync.
 */
export const MEDIA_INDEX_FENCE_BOUND_MS = 120_000;

/** What is left of a fence budget, as a bounded lock mode (0 ⇒ one try). */
function remainingFence(deadline: number): { boundMs: number } {
	return { boundMs: Math.max(0, deadline - Date.now()) };
}

/**
 * A reconcile's outcome: healed (what the apply touched), or DEFERRED — the
 * budget ran out with `busy_target` held by a writer, and nothing was applied.
 */
export type MediaIndexReconcileOutcome =
	| { added: number; removed: number; deferred?: undefined }
	| { deferred: { busy_target: string } };

export interface MediaIndexFenceOptions {
	/** Total fence-wait budget (ms); default MEDIA_INDEX_FENCE_BOUND_MS. */
	boundMs?: number;
}

/** The databases with a `dbs/<db>` subtree now (the marker writers to hold off). */
async function listMarkerDatabases(base: string): Promise<string[]> {
	try {
		return await fs.readdir(path.join(base, 'dbs'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
		return [];
	}
}

/**
 * reconcileMediaIndex (oracle reconcile): rebuilds pub/ from the dbs/ ground
 * truth (pure filesystem diff, diffMediaIndex above, then applied). Run at
 * server boot to heal drift from crashes between SQL commit and marker apply.
 * Cheap: two directory walks, no SQL on the target.
 *
 * THE ONE APPLY DOOR, FENCED (DIFF-2, WC-2026-09-30-diffusion-target-fence).
 * A batch writing `dbs/<db>/…/K` then `pub/K` holds `sql:<db>`; the diff reads
 * dbs/ first and pub/ second, so a marker pair landing between the two reads
 * would be classed stray and unlinked (a just-published record's media 404s).
 * So the diff runs under the fence of every database with a `dbs/` subtree —
 * and since that set cannot be known before the locks are held, the apply
 * CHECKS BEFORE IT WRITES: after the diff it re-lists dbs/, and a database it
 * did not hold (a FIRST publication, whose writer was never held off) voids
 * the round — nothing is touched or unlinked — and the next round holds that
 * database too. A writer that creates its subtree only after the re-list wrote
 * nothing the diff read (its pub/ marker follows its dbs/ one), so the round
 * that ends with no new database is exact and is the only one applied.
 * Bounded (a store that keeps growing names more databases than any install
 * has): the typed internal.invariant. This is the ONLY exported apply: the
 * boot registry definition, the media_control widget (through the
 * core/diffusion_bridge seam) and the rebuild all come through it.
 *
 * THE WAIT HOLDS NOTHING AND ENDS: the databases are taken all or none
 * (withTargetLocks), so a busy one never keeps a free one locked — a runner or
 * an unpublish on A is never held off because B's writer is busy — and the
 * whole reconcile shares ONE budget (`boundMs`). Spent ⇒ DEFERRED, nothing
 * applied, the target that held it off named.
 */
export async function reconcileMediaIndex(
	options: MediaIndexFenceOptions = {},
): Promise<MediaIndexReconcileOutcome | null> {
	const base = markerStoreBase();
	if (base === null) return null;
	const deadline = Date.now() + (options.boundMs ?? MEDIA_INDEX_FENCE_BOUND_MS);
	const held = new Set(await listMarkerDatabases(base));
	for (let round = 1; ; round++) {
		type Round =
			| { grown: string[]; healed?: undefined }
			| { grown?: undefined; healed: { added: number; removed: number } }
			| null;
		const fenced = await withTargetLocks(
			[...held].map(sqlTargetLockKey),
			async (): Promise<Round> => {
				const diff = await diffMediaIndex();
				if (diff === null) return null;
				const grown = (await listMarkerDatabases(base)).filter((database) => !held.has(database));
				// A database nobody held: the diff may have read half of its writer's
				// pair — apply NOTHING of it.
				if (grown.length > 0) return { grown };
				const pubDir = path.join(base, 'pub');
				for (const key of diff.toAdd) await touch(path.join(pubDir, key));
				for (const key of diff.toRemove) await unlinkQuiet(path.join(pubDir, key));
				return { healed: { added: diff.toAdd.length, removed: diff.toRemove.length } };
			},
			{ mode: remainingFence(deadline) },
		);
		if (!fenced.acquired) return { deferred: { busy_target: fenced.busyKey } };
		const outcome = fenced.value;
		if (outcome === null) return null;
		if (outcome.healed !== undefined) return outcome.healed;
		if (round >= MEDIA_INDEX_FENCE_ROUNDS) {
			throw new DedaloError('internal.invariant', {
				message: `media_index reconcile: new publication databases kept appearing under the fence (${outcome.grown.join(', ')}) after ${round} rounds`,
			});
		}
		for (const database of outcome.grown) held.add(database);
	}
}

/**
 * getMediaIndexStatus (oracle get_status): lightweight inspection of the
 * marker store for the maintenance UI (media_control widget). Read-only.
 */
export async function getMediaIndexStatus(): Promise<{
	enabled: boolean;
	base: string | null;
	pub_markers: number;
	auth_markers: number;
	databases: string[];
}> {
	const base = markerStoreBase();
	if (base === null) {
		return { enabled: false, base: null, pub_markers: 0, auth_markers: 0, databases: [] };
	}

	const countDir = async (dir: string): Promise<number> => {
		try {
			return (await fs.readdir(dir)).length;
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
			return 0;
		}
	};

	let databases: string[] = [];
	try {
		databases = await fs.readdir(path.join(base, 'dbs'));
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
	}

	return {
		enabled: true,
		base,
		pub_markers: await countDir(path.join(base, 'pub')),
		auth_markers: await countDir(path.join(base, 'auth')),
		databases,
	};
}

export interface RebuildTarget {
	database_name: string;
	table_name: string;
	section_tipo: string;
}

/**
 * validateRebuildTargets (oracle validate_rebuild_targets): manual validation.
 * Error message or null. An empty array is valid: it means "no publication
 * targets in the ontology" and rebuild clears the store accordingly.
 */
export function validateRebuildTargets(targets: unknown): string | null {
	if (!Array.isArray(targets)) {
		return 'Missing targets array';
	}
	for (const target of targets) {
		if (typeof target !== 'object' || target === null) {
			return 'Invalid target: not an object';
		}
		const t = target as Partial<RebuildTarget>;
		if (typeof t.database_name !== 'string' || !NAME_REGEX.test(t.database_name)) {
			return 'Invalid target: missing database_name';
		}
		if (typeof t.table_name !== 'string' || !NAME_REGEX.test(t.table_name)) {
			return 'Invalid target: missing table_name';
		}
		if (typeof t.section_tipo !== 'string' || t.section_tipo.length === 0) {
			return `Invalid target: missing section_tipo for table "${t.table_name}"`;
		}
	}
	return null;
}

/** Published section_ids of one target table (SELECT DISTINCT — the rebuild
 * ground truth). Missing table (1146) / database (1049) mean "nothing
 * published there" (empty set), mirroring delete_record.ts semantics. */
async function fetchPublishedSectionIds(
	databaseName: string,
	tableName: string,
): Promise<(string | number)[]> {
	const pool = getTargetPool(databaseName);
	// The PUBLISHED MariaDB target, not the matrix: its section_id column carries
	// the published string shape (a pinned edge — publication v1 LIKE-probes the
	// quoted form), so the union stays. WC-2026-08-10-section-id-int-canonical.
	const rows = (await pool.unsafe(
		`SELECT DISTINCT section_id FROM ${escapeSqlIdentifier(tableName)}`,
		[],
	)) as { section_id: string | number }[];
	return rows.map((row) => row.section_id);
}

/**
 * rebuildMediaIndexStore (oracle rebuild): full resync from the publication
 * databases, for initial migration and drift repair. Core resolves the
 * targets from the diffusion ontology (this module never interprets it).
 *
 * Diff-syncs each dbs/{db}/{table} dir against SELECT DISTINCT section_id
 * (create missing markers, unlink extras — never a wipe, so there is no
 * deny-everything window), removes per-table dirs no longer present in the
 * ontology targets, then reconciles pub/.
 */
/**
 * The rebuild outcome — an INTERNAL report handed to the diffusion bridge, not
 * a wire body: `ok` + a human `message`, never the envelope-shaped
 * `{result,msg}` pair the P1 error sweep retires.
 */
export interface MediaIndexRebuildReport {
	ok: boolean;
	message: string;
	markers: number;
	errors?: string[];
}

type FetchPublishedIds = (databaseName: string, tableName: string) => Promise<(string | number)[]>;

/**
 * Diff-sync ONE target table's `dbs/<db>/<table>` markers against the ids its
 * MariaDB table publishes. The number of published markers, or null when the
 * target failed (its finding pushed to `errors`, its markers kept —
 * fail-closed for changes, not deletions). Runs under the database's fence.
 */
async function syncTargetMarkers(
	base: string,
	target: RebuildTarget,
	fetchIds: FetchPublishedIds,
	errors: string[],
): Promise<number | null> {
	const tableDir = path.join(base, 'dbs', target.database_name, target.table_name);
	// desired state from the publication database
	let desired = new Set<string>();
	try {
		for (const sectionId of await fetchIds(target.database_name, target.table_name)) {
			const key = makeMarkerKey(target.section_tipo, sectionId);
			if (key !== null) desired.add(key);
		}
	} catch (error) {
		if (!isMissingTableError(error) && !isMissingDatabaseError(error)) {
			const errMsg = error instanceof Error ? error.message : String(error);
			errors.push(`${target.database_name}.${target.table_name}: ${errMsg}`);
			return null;
		}
		// table/database missing: nothing published there
		desired = new Set();
	}

	// current state on disk
	let current: string[] = [];
	try {
		current = await fs.readdir(tableDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
			errors.push(`${target.database_name}.${target.table_name}: ${(error as Error).message}`);
			return null;
		}
	}

	// diff-sync
	const currentSet = new Set(current);
	for (const key of desired) {
		if (!currentSet.has(key)) await touch(path.join(tableDir, key));
	}
	for (const key of current) {
		if (!desired.has(key)) await unlinkQuiet(path.join(tableDir, key));
	}
	return desired.size;
}

/**
 * Run `work` holding database `database`'s publication-target fence, waiting at
 * most what is left of the rebuild's budget. Not acquired ⇒ a writer kept the
 * database the whole time: its finding goes to `errors` (that database is not
 * resynced, its markers kept) and the answer is null.
 */
async function underDatabaseFence<T>(
	database: string,
	deadline: number,
	errors: string[],
	work: () => Promise<T>,
): Promise<T | null> {
	const held = await withTargetLock(sqlTargetLockKey(database), work, {
		mode: remainingFence(deadline),
	});
	if (held.acquired) return held.value;
	errors.push(
		`${database}: publication target busy (a writer held it past the rebuild's wait) — not resynced, its markers kept; re-run the rebuild`,
	);
	return null;
}

/**
 * THE REBUILD IS FENCED PER DATABASE (DIFF-2): a runner batch holding
 * `sql:<db>` inserts row K and writes marker K in one unit, so the rebuild's
 * SELECT → readdir → diff-sync of that database must not interleave with it —
 * a row landing after the SELECT would have its just-written marker unlinked as
 * "not published" (and the pub/ pass would then unlink `pub/K`). Each
 * database's targets sync under its own fence, one database at a time (a
 * runner holds one target, so no lock cycle); the stale-table sweep of a
 * database takes that database's fence too; the closing pub/ derivation is the
 * fenced reconcileMediaIndex. ONE budget (`boundMs`) for every wait of the
 * rebuild: a database a writer keeps past it is reported, not resynced, and the
 * request ends.
 */
export async function rebuildMediaIndexStore(
	targets: RebuildTarget[],
	/** Test seam: replaces the MariaDB SELECT (temp-dir tests, no target DB). */
	fetchIds: FetchPublishedIds = fetchPublishedSectionIds,
	options: MediaIndexFenceOptions = {},
): Promise<MediaIndexRebuildReport> {
	const base = markerStoreBase();
	if (base === null) {
		return {
			ok: false,
			message: 'DEDALO_MEDIA_PATH is not configured in the diffusion engine environment',
			markers: 0,
		};
	}

	const deadline = Date.now() + (options.boundMs ?? MEDIA_INDEX_FENCE_BOUND_MS);
	const errors: string[] = [];
	const validDirs = new Set<string>(); // "db/table" covered by the ontology
	const byDatabase = new Map<string, RebuildTarget[]>();
	for (const target of targets) {
		validDirs.add(`${target.database_name}/${target.table_name}`);
		const group = byDatabase.get(target.database_name) ?? [];
		group.push(target);
		byDatabase.set(target.database_name, group);
	}

	let markers = 0;
	for (const [database, group] of byDatabase) {
		markers +=
			(await underDatabaseFence(database, deadline, errors, async () => {
				let synced = 0;
				for (const target of group)
					synced += (await syncTargetMarkers(base, target, fetchIds, errors)) ?? 0;
				return synced;
			})) ?? 0;
	}

	// remove per-table dirs no longer covered by the ontology (stale DBs/tables
	// would otherwise keep union markers alive forever)
	const dbsDir = path.join(base, 'dbs');
	for (const dbName of await listMarkerDatabases(base)) {
		await underDatabaseFence(dbName, deadline, errors, async () => {
			let tableEntries: string[] = [];
			try {
				tableEntries = await fs.readdir(path.join(dbsDir, dbName));
			} catch {
				return;
			}
			for (const tableName of tableEntries) {
				if (!validDirs.has(`${dbName}/${tableName}`)) {
					await fs.rm(path.join(dbsDir, dbName, tableName), { recursive: true, force: true });
				}
			}
		});
	}

	// derive pub/ from the new ground truth (the fenced apply), on what is left
	// of the budget
	const derived = await reconcileMediaIndex(remainingFence(deadline));
	if (derived?.deferred !== undefined) {
		errors.push(
			`pub/: derivation deferred (${derived.deferred.busy_target} held by a writer past the rebuild's wait) — re-run the rebuild`,
		);
	}

	return {
		ok: errors.length === 0,
		message:
			errors.length === 0
				? `OK. Media index rebuilt (${markers} published record(s))`
				: `Partial failure. ${errors.length} target(s) failed`,
		markers,
		errors: errors.length > 0 ? errors : undefined,
	};
}
