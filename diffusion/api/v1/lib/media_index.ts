/**
 * MEDIA_INDEX
 * Filesystem allowlist of published media records ("publication markers").
 *
 * The web server (Apache/Nginx) authorizes anonymous access to a media file
 * with a single stat() on a zero-byte marker keyed by the record the file
 * belongs to ({section_tipo}_{section_id}, parsed from the media file name).
 * This module is the ONLY writer of those markers; it mirrors the publication
 * state this engine already owns (row existence in the target MariaDB tables).
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
 *
 * When DEDALO_MEDIA_PATH is not configured every function is a no-op
 * (feature off).
 */

import { promises as fs } from 'fs';
import path                from 'path';
import { get_pool }        from './db';
import { escape_identifier } from './sql_generator';



// {section_tipo}_{section_id} — tipos are strictly alphanumeric (rsc167, oh21…)
const KEY_REGEX = /^[a-z0-9]+_[0-9]+$/i;

// database/table names become directory names: stay strict
const NAME_REGEX = /^[A-Za-z0-9_.-]+$/;

// Per-key mutation chains: serialize marker updates for the same key so the
// union recompute never races itself inside this single-writer process.
const key_locks = new Map<string, Promise<void>>();



/**
 * GET_BASE
 * Resolves the marker store base dir from the DEDALO_MEDIA_PATH env var.
 * Returns null when unset/empty (feature disabled).
 */
export function get_base(): string | null {
	const media_path = process.env.DEDALO_MEDIA_PATH;
	if (!media_path || !path.isAbsolute(media_path)) {
		return null;
	}
	return path.join(media_path, '.publication');
}



/**
 * MAKE_KEY
 * Builds and validates the marker key for a record.
 * Returns null on invalid input (logged by callers as a skip, never a throw).
 */
export function make_key(section_tipo: string, section_id: string | number): string | null {
	const key = `${section_tipo}_${section_id}`;
	return KEY_REGEX.test(key) ? key : null;
}



/**
 * WITH_KEY_LOCK
 * Chains fn onto the per-key mutation queue.
 */
async function with_key_lock(key: string, fn: () => Promise<void>): Promise<void> {
	const prev = key_locks.get(key) ?? Promise.resolve();
	const next = prev.then(fn, fn);
	key_locks.set(key, next);
	try {
		await next;
	} finally {
		if (key_locks.get(key) === next) {
			key_locks.delete(key);
		}
	}
}



/**
 * TOUCH
 * Creates a zero-byte marker file (parent dirs included).
 */
async function touch(file_path: string): Promise<void> {
	await fs.mkdir(path.dirname(file_path), { recursive: true });
	await fs.writeFile(file_path, '');
}



/**
 * UNLINK_QUIET
 * Removes a file, tolerating ENOENT.
 */
async function unlink_quiet(file_path: string): Promise<void> {
	try {
		await fs.unlink(file_path);
	} catch (err: any) {
		if (err?.code !== 'ENOENT') throw err;
	}
}



/**
 * EXISTS
 */
async function exists(file_path: string): Promise<boolean> {
	try {
		await fs.access(file_path);
		return true;
	} catch {
		return false;
	}
}



/**
 * RECOMPUTE_UNION
 * Derives pub/{key} from the full dbs/<db>/<table>/{key} state.
 */
async function recompute_union(base: string, key: string): Promise<void> {
	const dbs_dir = path.join(base, 'dbs');
	let published = false;

	let db_entries: string[] = [];
	try {
		db_entries = await fs.readdir(dbs_dir);
	} catch (err: any) {
		if (err?.code !== 'ENOENT') throw err;
	}

	outer:
	for (const db_name of db_entries) {
		let table_entries: string[] = [];
		try {
			table_entries = await fs.readdir(path.join(dbs_dir, db_name));
		} catch {
			continue;
		}
		for (const table_name of table_entries) {
			if (await exists(path.join(dbs_dir, db_name, table_name, key))) {
				published = true;
				break outer;
			}
		}
	}

	const pub_marker = path.join(base, 'pub', key);
	if (published) {
		await touch(pub_marker);
	} else {
		await unlink_quiet(pub_marker);
	}
}



/**
 * APPLY_TABLE_STATE
 * Mirrors one publication write into the marker store: published_ids gain a
 * marker in dbs/{db}/{table}/, unpublished_ids lose it, and the pub/ union
 * is recomputed per touched key.
 *
 * Never throws on per-key problems: invalid keys are skipped (returned in
 * the skipped list) so a single odd record cannot abort a diffusion.
 * Callers wrap the whole call in try/catch and log — marker failures must
 * never fail the publication itself.
 */
export async function apply_table_state(
	database_name:   string,
	table_name:      string,
	section_tipo:    string,
	published_ids:   (string | number)[],
	unpublished_ids: (string | number)[]
): Promise<{ applied: number; skipped: string[] }> {

	const base = get_base();
	if (base === null) {
		return { applied: 0, skipped: [] };
	}
	if (!NAME_REGEX.test(database_name) || !NAME_REGEX.test(table_name)) {
		return { applied: 0, skipped: [`invalid db/table name: ${database_name}.${table_name}`] };
	}

	const table_dir = path.join(base, 'dbs', database_name, table_name);
	const skipped: string[] = [];
	let applied = 0;

	const ops: Array<{ key: string; publish: boolean }> = [];
	for (const id of published_ids) {
		const key = make_key(section_tipo, id);
		if (key === null) { skipped.push(`${section_tipo}_${id}`); continue; }
		ops.push({ key, publish: true });
	}
	for (const id of unpublished_ids) {
		const key = make_key(section_tipo, id);
		if (key === null) { skipped.push(`${section_tipo}_${id}`); continue; }
		ops.push({ key, publish: false });
	}

	for (const op of ops) {
		await with_key_lock(op.key, async () => {
			if (op.publish) {
				await touch(path.join(table_dir, op.key));
			} else {
				await unlink_quiet(path.join(table_dir, op.key));
			}
			await recompute_union(base, op.key);
		});
		applied++;
	}

	return { applied, skipped };
}



/**
 * RECONCILE
 * Rebuilds pub/ from the dbs/ ground truth (pure filesystem diff).
 * Run at engine boot to heal drift from crashes between SQL commit and
 * marker apply. Cheap: two directory walks, no SQL.
 */
export async function reconcile(): Promise<{ added: number; removed: number } | null> {

	const base = get_base();
	if (base === null) {
		return null;
	}

	// collect every key present under dbs/<db>/<table>/
	const truth = new Set<string>();
	const dbs_dir = path.join(base, 'dbs');
	let db_entries: string[] = [];
	try {
		db_entries = await fs.readdir(dbs_dir);
	} catch (err: any) {
		if (err?.code !== 'ENOENT') throw err;
	}
	for (const db_name of db_entries) {
		let table_entries: string[] = [];
		try {
			table_entries = await fs.readdir(path.join(dbs_dir, db_name));
		} catch {
			continue;
		}
		for (const table_name of table_entries) {
			let keys: string[] = [];
			try {
				keys = await fs.readdir(path.join(dbs_dir, db_name, table_name));
			} catch {
				continue;
			}
			for (const key of keys) {
				if (KEY_REGEX.test(key)) truth.add(key);
			}
		}
	}

	// current pub/ state
	const pub_dir = path.join(base, 'pub');
	let current: string[] = [];
	try {
		current = await fs.readdir(pub_dir);
	} catch (err: any) {
		if (err?.code !== 'ENOENT') throw err;
	}

	let added = 0;
	let removed = 0;

	const current_set = new Set(current);
	for (const key of truth) {
		if (!current_set.has(key)) {
			await touch(path.join(pub_dir, key));
			added++;
		}
	}
	for (const key of current) {
		if (!truth.has(key)) {
			await unlink_quiet(path.join(pub_dir, key));
			removed++;
		}
	}

	return { added, removed };
}



/**
 * GET_STATUS
 * Lightweight inspection of the marker store for the maintenance UI
 * (media_control widget): whether the feature is enabled in this engine
 * (DEDALO_MEDIA_PATH set) and current marker counts. Read-only.
 */
export async function get_status(): Promise<{
	enabled:      boolean;
	base:         string | null;
	pub_markers:  number;
	auth_markers: number;
	databases:    string[];
}> {

	const base = get_base();
	if (base === null) {
		return { enabled: false, base: null, pub_markers: 0, auth_markers: 0, databases: [] };
	}

	const count_dir = async (dir: string): Promise<number> => {
		try {
			return (await fs.readdir(dir)).length;
		} catch (err: any) {
			if (err?.code !== 'ENOENT') throw err;
			return 0;
		}
	};

	let databases: string[] = [];
	try {
		databases = await fs.readdir(path.join(base, 'dbs'));
	} catch (err: any) {
		if (err?.code !== 'ENOENT') throw err;
	}

	return {
		enabled:      true,
		base,
		pub_markers:  await count_dir(path.join(base, 'pub')),
		auth_markers: await count_dir(path.join(base, 'auth')),
		databases,
	};
}



export interface rebuild_target {
	database_name: string;
	table_name:    string;
	section_tipo:  string;
}

/**
 * VALIDATE_REBUILD_TARGETS
 * Manual validation (no zod in this project). Error message or null.
 * An empty array is valid: it means "no publication targets in the
 * ontology" and rebuild clears the store accordingly.
 */
export function validate_rebuild_targets(targets: unknown): string | null {

	if (!Array.isArray(targets)) {
		return 'Missing targets array';
	}
	for (const target of targets) {
		if (typeof target !== 'object' || target === null) {
			return 'Invalid target: not an object';
		}
		const t = target as Partial<rebuild_target>;
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



/**
 * REBUILD
 * Full resync from the publication databases, for initial migration and
 * drift repair. PHP resolves the targets from the diffusion ontology
 * (this engine never interprets the ontology).
 *
 * Diff-syncs each dbs/{db}/{table} dir against SELECT DISTINCT section_id
 * (create missing markers, unlink extras — never a wipe, so there is no
 * deny-everything window), removes per-table dirs no longer present in the
 * ontology targets, then reconciles pub/.
 *
 * Missing table (errno 1146) / database (1049) are treated as "nothing
 * published there" (empty set), mirroring delete_handler semantics.
 */
export async function rebuild(
	targets: rebuild_target[]
): Promise<{ result: boolean; msg: string; markers: number; errors?: string[] }> {

	const base = get_base();
	if (base === null) {
		return { result: false, msg: 'DEDALO_MEDIA_PATH is not configured in the diffusion engine environment', markers: 0 };
	}

	const errors: string[] = [];
	const valid_dirs = new Set<string>(); // "db/table" covered by the ontology
	let markers = 0;

	for (const target of targets) {

		const table_dir = path.join(base, 'dbs', target.database_name, target.table_name);
		valid_dirs.add(`${target.database_name}/${target.table_name}`);

		// desired state from the publication database
		let desired = new Set<string>();
		try {
			const pool = get_pool(target.database_name);
			const [rows] = await pool.query(
				`SELECT DISTINCT section_id FROM ${escape_identifier(target.table_name)}`
			) as any;
			for (const row of rows) {
				const key = make_key(target.section_tipo, row.section_id);
				if (key !== null) desired.add(key);
			}
		} catch (err: any) {
			if (err?.errno === 1146 || err?.errno === 1049) {
				// table/database missing: nothing published there
				desired = new Set();
			} else {
				const err_msg = err instanceof Error ? err.message : String(err);
				errors.push(`${target.database_name}.${target.table_name}: ${err_msg}`);
				continue; // keep existing markers for this target (fail-closed for changes, not deletions)
			}
		}

		// current state on disk
		let current: string[] = [];
		try {
			current = await fs.readdir(table_dir);
		} catch (err: any) {
			if (err?.code !== 'ENOENT') {
				errors.push(`${target.database_name}.${target.table_name}: ${err.message}`);
				continue;
			}
		}

		// diff-sync
		const current_set = new Set(current);
		for (const key of desired) {
			if (!current_set.has(key)) {
				await touch(path.join(table_dir, key));
			}
		}
		for (const key of current) {
			if (!desired.has(key)) {
				await unlink_quiet(path.join(table_dir, key));
			}
		}
		markers += desired.size;
	}

	// remove per-table dirs no longer covered by the ontology (stale DBs/tables
	// would otherwise keep union markers alive forever)
	const dbs_dir = path.join(base, 'dbs');
	let db_entries: string[] = [];
	try {
		db_entries = await fs.readdir(dbs_dir);
	} catch (err: any) {
		if (err?.code !== 'ENOENT') throw err;
	}
	for (const db_name of db_entries) {
		let table_entries: string[] = [];
		try {
			table_entries = await fs.readdir(path.join(dbs_dir, db_name));
		} catch {
			continue;
		}
		for (const table_name of table_entries) {
			if (!valid_dirs.has(`${db_name}/${table_name}`)) {
				await fs.rm(path.join(dbs_dir, db_name, table_name), { recursive: true, force: true });
			}
		}
	}

	// derive pub/ from the new ground truth
	await reconcile();

	return {
		result: errors.length === 0,
		msg:    errors.length === 0
			? `OK. Media index rebuilt (${markers} published record(s))`
			: `Partial failure. ${errors.length} target(s) failed`,
		markers,
		errors: errors.length > 0 ? errors : undefined,
	};
}
