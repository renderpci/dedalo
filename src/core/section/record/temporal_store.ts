/**
 * TEMPORAL SCRATCH STORE — the ONE owning module for the
 * dedalo_ts_temporal_scratch table (sql_confinement T4; WC-079).
 *
 * A temporal instance addresses NO record (WC-059, ./temporal.ts). It still
 * needs somewhere to keep what the operator typed, because service_tmp_section's
 * children autoload on every render: without a store the staging form came back
 * EMPTY after any reload and a whole import batch's metadata was silently lost.
 * This is that somewhere — and it is deliberately NOT the matrix: nothing here
 * touches a record, a Time Machine row or an activity row.
 *
 * OPT-IN, never derived. `source.is_temporal` means "addresses no record" and
 * has exactly ONE reader by tripwire; persistence rides its own field,
 * `source.temporal_scope`. Four of the five temporal producers would be
 * CORRUPTED by persistence — tool_propagate_component_data seeds its clone from
 * the open record and then bulk-writes across a search result set, and the two
 * component_text_area pickers are transient, so a restored value there is a
 * stale locator stamped into a tag. Only service_tmp_section sends a scope.
 *
 * THE KEY is five discrete columns, never a concatenated string. PHP's
 * matrix_temp_manager::get_uid built `section_tipo . user_id` with no separator,
 * so 'oh1'+42 and 'oh14'+2 addressed the SAME row, and it omitted the owning
 * tool entirely so two tools open on one section clobbered each other.
 *
 * WHAT IS STORED IS RAW: literal items, or relation LOCATORS — never resolved
 * chips. Labels are language- and permission-dependent, so a stored chip would
 * freeze a label the next reader may be in a different language for, or not be
 * allowed to see. The read path re-resolves through the standard pipeline.
 *
 * DDL lives twice by the migrate.ts documented model: the authoritative copy in
 * install/db/migrations/0003_temporal_scratch.sql (applied at boot) and the lazy
 * fallback below — keep them in lockstep when evolving the table.
 */

import { type RqoSource, isTemporalSource } from '../../concepts/rqo.ts';
import { encodeForJsonb } from '../../db/json_codec.ts';
import { sql } from '../../db/postgres.ts';

export const TEMPORAL_SCRATCH_TABLE = 'dedalo_ts_temporal_scratch';

/** Same identifier guard as migrate.ts — table names are interpolated. */
const TABLE_NAME_PATTERN = /^[a-z_][a-z0-9_]*$/;

/**
 * How long an untouched scratch row survives. An operator who fills a form on
 * Friday and imports on Monday keeps it; an abandoned form dies within days.
 * A module constant rather than a DEDALO_* key: nobody will tune this, and a
 * config key drags in the catalog + sample.env + config_env_tripwire surface
 * for a value with one sensible answer.
 */
export const TEMPORAL_SCRATCH_TTL_HOURS = 72;

/**
 * Per-row payload cap. A staging form holds field values, not documents — this
 * stops a client turning the scratch table into a blob store. Over the cap the
 * write is skipped with a warning and the save still echoes: the operator loses
 * only cross-reload persistence for one oversized field, never the edit itself.
 */
export const TEMPORAL_SCRATCH_MAX_BYTES = 256 * 1024;

/**
 * Per-user row cap. `scope` and `lang` are wire-controlled key columns, so
 * without this a client can mint unbounded rows by varying either — the TTL
 * bounds the table in time, not in count. Set far above any real staging form
 * (a ddo_map is a handful of components across a few languages).
 */
export const TEMPORAL_SCRATCH_MAX_ROWS_PER_USER = 500;

/**
 * The scratch row address. Carries NO user id by construction: the key that can
 * be built from a request body must be structurally incapable of naming a user.
 * Identity is a separate required argument on every entry point below.
 */
export interface TemporalScratchAddress {
	readonly scope: string;
	readonly sectionTipo: string;
	readonly componentTipo: string;
	readonly lang: string;
}

/** Scope shape guard — a stale client sending junk must degrade to "no store". */
const SCOPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * THE one address builder, used by BOTH the write and the read seam so the two
 * cannot compute a different lang and silently miss each other's rows.
 *
 * Returns null — meaning "no persistence, behave exactly as before" — unless the
 * source is temporal AND names a well-formed scope AND carries the component
 * identity. `lang` mirrors what the save door stamps (`source.lang ?? lg-nolan`,
 * ./temporal.ts) rather than the read door's `currentDataLang()` fallback, so a
 * round trip is symmetric by construction; every real producer sends a lang.
 */
export function temporalScratchAddress(
	source: RqoSource | undefined | null,
): TemporalScratchAddress | null {
	// Via the EXPORTED predicate, never the wire literal: `is_temporal` has
	// exactly one reader by tripwire, and a second hand-rolled check here is the
	// "two subtly different definitions" failure that gate exists to prevent.
	if (!isTemporalSource(source) || source == null) return null;
	const scope = (source as { temporal_scope?: unknown }).temporal_scope;
	if (typeof scope !== 'string' || !SCOPE_PATTERN.test(scope)) return null;
	const sectionTipo = source.section_tipo;
	const componentTipo = source.tipo;
	if (typeof sectionTipo !== 'string' || sectionTipo === '') return null;
	if (typeof componentTipo !== 'string' || componentTipo === '') return null;
	return {
		scope,
		sectionTipo,
		componentTipo,
		lang: typeof source.lang === 'string' && source.lang !== '' ? source.lang : 'lg-nolan',
	};
}

function tableOrThrow(table: string | undefined): string {
	const name = table ?? TEMPORAL_SCRATCH_TABLE;
	if (!TABLE_NAME_PATTERN.test(name)) {
		throw new Error(`temporal_store: invalid table name '${name}'`);
	}
	return name;
}

/**
 * Bootstrap memo. The ONLY module-level state in this file, and it carries no
 * request identity — the same shape as core/section/locks.ts:tableReady
 * (module_state_tripwire allowlist). A per-user cache here would be exactly the
 * cross-request bleed that tripwire exists to forbid: the TABLE is the store.
 */
let tableReady = false;

/**
 * Idempotently provision the table + sweep index. Lazy fallback for installs
 * where the boot migration could not run — 0003 is authoritative.
 */
export async function ensureTemporalScratchTable(table?: string): Promise<void> {
	const name = tableOrThrow(table);
	if (tableReady && table === undefined) return;
	await sql.unsafe(
		`CREATE TABLE IF NOT EXISTS "${name}" (
			user_id        integer     NOT NULL,
			scope          text        NOT NULL,
			section_tipo   text        NOT NULL,
			component_tipo text        NOT NULL,
			lang           text        NOT NULL,
			entries        jsonb       NOT NULL,
			updated_at     timestamptz NOT NULL DEFAULT now(),
			PRIMARY KEY (user_id, scope, section_tipo, component_tipo, lang)
		)`,
		[],
	);
	await sql.unsafe(
		`CREATE INDEX IF NOT EXISTS "${name}_updated_idx" ON "${name}" (updated_at)`,
		[],
	);
	if (table === undefined) tableReady = true;
}

/**
 * Upsert one component's scratch value for one user, then opportunistically
 * prune stale rows (the error_report/store.ts retention precedent — no
 * scheduler, and the table stays bounded by construction; PHP never GC'd at all).
 *
 * An EMPTY value deletes the row rather than storing an empty husk, so a cleared
 * field does not resurrect on the next read.
 */
export async function writeTemporalScratch(
	userId: number,
	address: TemporalScratchAddress,
	entries: readonly unknown[],
	options?: { table?: string; ttlHours?: number; maxBytes?: number; maxRowsPerUser?: number },
): Promise<boolean> {
	const name = tableOrThrow(options?.table);
	await ensureTemporalScratchTable(options?.table);

	if (entries.length === 0) {
		await clearTemporalScratchEntry(userId, address, options);
		return true;
	}

	// encodeForJsonb throws loudly on undefined/NaN/functions — a client-supplied
	// entries array can carry them, and JSON.stringify would silently null them.
	const payload = encodeForJsonb(entries as unknown[]);
	const maxBytes = options?.maxBytes ?? TEMPORAL_SCRATCH_MAX_BYTES;
	if (Buffer.byteLength(payload, 'utf8') > maxBytes) {
		console.warn(
			`[temporal_store] scratch payload for '${address.componentTipo}' exceeds ${maxBytes} bytes — not persisted`,
		);
		// DROP any previous row for this address. Leaving it would be worse than
		// storing nothing: the next reload would restore an OLDER value as though it
		// were current, silently discarding everything typed since — a wrong value
		// presented confidently. An empty field is an honest failure.
		await clearTemporalScratchEntry(userId, address, options);
		return false;
	}

	// Per-user row cap. `scope` and `lang` are WIRE-CONTROLLED key columns, so a
	// client can mint unlimited distinct rows by varying either. The TTL bounds
	// them in TIME but not in COUNT between sweeps, so refuse past the cap rather
	// than let one user grow the table without limit. Well above any real form:
	// a ddo_map is a handful of components across a few languages.
	const maxRows = options?.maxRowsPerUser ?? TEMPORAL_SCRATCH_MAX_ROWS_PER_USER;
	const existing = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${name}" WHERE user_id = $1`,
		[userId],
	)) as { n: number }[];
	const rowCount = existing[0]?.n ?? 0;
	if (rowCount >= maxRows) {
		// Only refuse a row that does not exist yet — an UPSERT over an address the
		// user already holds does not grow the table and must keep working.
		const held = await readTemporalScratch(userId, address, options);
		if (held === null) {
			console.warn(
				`[temporal_store] user ${userId} holds ${rowCount} scratch rows (cap ${maxRows}) — not persisting '${address.componentTipo}'`,
			);
			return false;
		}
	}

	// The payload binds through the ::text::jsonb chain. Casting the parameter
	// straight to jsonb instead would DOUBLE-encode it into a jsonb string
	// scalar, which reads back as a string and breaks the read graft (S1-07).
	// (Spelling the bare cast out here, even as a warning, trips the ws_a scan —
	// it reads raw file content and cannot tell a comment from a query.)
	await sql.unsafe(
		`INSERT INTO "${name}"
			(user_id, scope, section_tipo, component_tipo, lang, entries, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6::text::jsonb, now())
		 ON CONFLICT (user_id, scope, section_tipo, component_tipo, lang)
		 DO UPDATE SET entries = EXCLUDED.entries, updated_at = now()`,
		[userId, address.scope, address.sectionTipo, address.componentTipo, address.lang, payload],
	);

	// Best effort: a prune failure never fails the write.
	try {
		await sweepTemporalScratch({ table: options?.table, ttlHours: options?.ttlHours });
	} catch (error) {
		console.warn('[temporal_store] sweep failed:', (error as Error).message);
	}
	return true;
}

/** Read one component's scratch value for one user; null when there is no row. */
export async function readTemporalScratch(
	userId: number,
	address: TemporalScratchAddress,
	options?: { table?: string },
): Promise<unknown[] | null> {
	const name = tableOrThrow(options?.table);
	await ensureTemporalScratchTable(options?.table);
	const rows = (await sql.unsafe(
		`SELECT entries FROM "${name}"
		 WHERE user_id = $1 AND scope = $2 AND section_tipo = $3
		   AND component_tipo = $4 AND lang = $5`,
		[userId, address.scope, address.sectionTipo, address.componentTipo, address.lang],
	)) as { entries: unknown }[];
	const stored = rows[0]?.entries;
	// Defensive: a non-array here means the jsonb bind regressed to a string
	// scalar. Treat it as absent rather than grafting a string into a locator slot.
	return Array.isArray(stored) ? stored : null;
}

/** Drop ONE component's row (used by the empty-value path). */
async function clearTemporalScratchEntry(
	userId: number,
	address: TemporalScratchAddress,
	options?: { table?: string },
): Promise<void> {
	const name = tableOrThrow(options?.table);
	await sql.unsafe(
		`DELETE FROM "${name}"
		 WHERE user_id = $1 AND scope = $2 AND section_tipo = $3
		   AND component_tipo = $4 AND lang = $5`,
		[userId, address.scope, address.sectionTipo, address.componentTipo, address.lang],
	);
}

/**
 * CONSUME: drop every row this user holds under one scope. Called by the owning
 * tool once the values have been written into real records — scope granularity
 * is exactly what "this form was consumed" means, and it cannot reach another
 * tool's rows (the scope predicate) or another user's (the user_id predicate).
 */
export async function clearTemporalScratch(
	userId: number,
	scope: string,
	options?: { table?: string },
): Promise<number> {
	const name = tableOrThrow(options?.table);
	await ensureTemporalScratchTable(options?.table);
	const rows = (await sql.unsafe(
		`DELETE FROM "${name}" WHERE user_id = $1 AND scope = $2 RETURNING user_id`,
		[userId, scope],
	)) as unknown[];
	return rows.length;
}

/**
 * TTL prune. The ONE statement in this module without a `user_id` predicate —
 * it is age-scoped and can only remove rows already dead by TTL.
 */
export async function sweepTemporalScratch(options?: {
	table?: string;
	ttlHours?: number;
}): Promise<number> {
	const name = tableOrThrow(options?.table);
	const ttlHours = options?.ttlHours ?? TEMPORAL_SCRATCH_TTL_HOURS;
	const rows = (await sql.unsafe(
		`DELETE FROM "${name}"
		 WHERE updated_at < now() - make_interval(hours => $1) RETURNING user_id`,
		[ttlHours],
	)) as unknown[];
	return rows.length;
}
