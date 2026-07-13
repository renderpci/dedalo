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
	if (baseOverrideForTests !== null) return baseOverrideForTests;
	const mediaPath = config.media.rootPath;
	if (mediaPath === null || !path.isAbsolute(mediaPath)) {
		return null;
	}
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
 * reconcileMediaIndex (oracle reconcile): rebuilds pub/ from the dbs/ ground
 * truth (pure filesystem diff). Run at server boot to heal drift from crashes
 * between SQL commit and marker apply. Cheap: two directory walks, no SQL.
 */
export async function reconcileMediaIndex(): Promise<{ added: number; removed: number } | null> {
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

	let added = 0;
	let removed = 0;

	const currentSet = new Set(current);
	for (const key of truth) {
		if (!currentSet.has(key)) {
			await touch(path.join(pubDir, key));
			added++;
		}
	}
	for (const key of current) {
		if (!truth.has(key)) {
			await unlinkQuiet(path.join(pubDir, key));
			removed++;
		}
	}

	return { added, removed };
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
export async function rebuildMediaIndexStore(
	targets: RebuildTarget[],
	/** Test seam: replaces the MariaDB SELECT (temp-dir tests, no target DB). */
	fetchIds: (
		databaseName: string,
		tableName: string,
	) => Promise<(string | number)[]> = fetchPublishedSectionIds,
): Promise<{ result: boolean; msg: string; markers: number; errors?: string[] }> {
	const base = markerStoreBase();
	if (base === null) {
		return {
			result: false,
			msg: 'DEDALO_MEDIA_PATH is not configured in the diffusion engine environment',
			markers: 0,
		};
	}

	const errors: string[] = [];
	const validDirs = new Set<string>(); // "db/table" covered by the ontology
	let markers = 0;

	for (const target of targets) {
		const tableDir = path.join(base, 'dbs', target.database_name, target.table_name);
		validDirs.add(`${target.database_name}/${target.table_name}`);

		// desired state from the publication database
		let desired = new Set<string>();
		try {
			for (const sectionId of await fetchIds(target.database_name, target.table_name)) {
				const key = makeMarkerKey(target.section_tipo, sectionId);
				if (key !== null) desired.add(key);
			}
		} catch (error) {
			if (isMissingTableError(error) || isMissingDatabaseError(error)) {
				// table/database missing: nothing published there
				desired = new Set();
			} else {
				const errMsg = error instanceof Error ? error.message : String(error);
				errors.push(`${target.database_name}.${target.table_name}: ${errMsg}`);
				continue; // keep existing markers for this target (fail-closed for changes, not deletions)
			}
		}

		// current state on disk
		let current: string[] = [];
		try {
			current = await fs.readdir(tableDir);
		} catch (error) {
			if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
				errors.push(`${target.database_name}.${target.table_name}: ${(error as Error).message}`);
				continue;
			}
		}

		// diff-sync
		const currentSet = new Set(current);
		for (const key of desired) {
			if (!currentSet.has(key)) {
				await touch(path.join(tableDir, key));
			}
		}
		for (const key of current) {
			if (!desired.has(key)) {
				await unlinkQuiet(path.join(tableDir, key));
			}
		}
		markers += desired.size;
	}

	// remove per-table dirs no longer covered by the ontology (stale DBs/tables
	// would otherwise keep union markers alive forever)
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
			if (!validDirs.has(`${dbName}/${tableName}`)) {
				await fs.rm(path.join(dbsDir, dbName, tableName), { recursive: true, force: true });
			}
		}
	}

	// derive pub/ from the new ground truth
	await reconcileMediaIndex();

	return {
		result: errors.length === 0,
		msg:
			errors.length === 0
				? `OK. Media index rebuilt (${markers} published record(s))`
				: `Partial failure. ${errors.length} target(s) failed`,
		markers,
		errors: errors.length > 0 ? errors : undefined,
	};
}
