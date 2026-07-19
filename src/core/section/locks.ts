/**
 * Component edit-locks — TS-NATIVE redesign (replaces the PHP model by
 * explicit decision, 2026-07-02).
 *
 * THE GUARANTEE (unchanged): while a user edits a component of a specific
 * record (section_tipo + section_id + component_tipo), no other user can edit
 * that same component at the same time. Locks expire automatically (crash /
 * closed-tab recovery) and are released on blur or section navigation.
 *
 * WHY A REDESIGN (vs the PHP lock_components registry):
 * - PHP stores ALL locks as one JSON array in a single row
 *   (matrix_notifications id=1) and serializes EVERY focus/blur in the whole
 *   installation on that one row lock, rewriting the full array each time —
 *   a global contention point with O(locks) scans.
 * - Here each lock is one ROW in a dedicated table whose PRIMARY KEY is the
 *   component triple. Acquisition is ONE atomic upsert: the unique constraint
 *   is the mutual exclusion, contention exists only between users touching
 *   the SAME component, and expiry is a WHERE predicate on locked_at.
 * - The wire contract (update_lock_components_state / get_lock_status
 *   actions, in_use/msg/full_username response fields) is unchanged — the
 *   copied client needs no edits. One deliberate difference: PHP returns the
 *   ENTIRE registry as `data` to any caller; the client never reads it, so we
 *   return null (don't leak who is editing what across the installation).
 *
 * TWO-SERVER COEXISTENCE: the table lives in the shared matrix DB, so every
 * TS process sees the same locks. Locks held by PHP users (the legacy JSON
 * registry) are additionally consulted READ-ONLY on acquire/status, so a
 * PHP-held lock still blocks TS users. The reverse (PHP seeing TS locks)
 * requires pointing PHP's lock_components at this table — a one-file change
 * documented for the cutover, acceptable one-way during the transition.
 */

import { sql } from '../db/postgres.ts';

/** TS-owned lock table (created on first use; lives in the shared matrix DB). */
const LOCK_TABLE = 'dedalo_ts_component_locks';
/** Lock lifetime — matches the PHP TTL (2.5 min ≈ 3 client heartbeats). */
const LOCK_TTL_SECONDS = 150;

/** Legacy PHP registry (read-only coexistence visibility). */
const LEGACY_TABLE = 'matrix_notifications';
const LEGACY_RECORD_ID = 1;

export interface LockUpdateResult {
	result: boolean;
	msg: string;
	/** Kept for wire-shape compatibility; always null (see module header). */
	dato: null;
	in_use: boolean;
	full_username?: string | null;
}

let tableReady = false;

/** Create the lock table on first use (idempotent; safe under concurrency). */
async function ensureTable(): Promise<void> {
	if (tableReady) return;
	await sql.unsafe(
		`CREATE TABLE IF NOT EXISTS "${LOCK_TABLE}" (
			section_tipo   text NOT NULL,
			section_id     text NOT NULL,
			component_tipo text NOT NULL,
			user_id        integer NOT NULL,
			full_username  text NOT NULL DEFAULT '',
			locked_at      timestamptz NOT NULL DEFAULT now(),
			PRIMARY KEY (section_tipo, section_id, component_tipo)
		)`,
	);
	tableReady = true;
}

/** The lock target triple. section_id is normalized to text (PHP loose ids). */
interface LockTriple {
	section_tipo: string;
	section_id: string;
	component_tipo: string;
}

function tripleOf(options: {
	section_tipo: string | null;
	section_id: unknown;
	component_tipo: string | null;
}): LockTriple | null {
	if (!options.section_tipo || !options.component_tipo) return null;
	if (options.section_id === null || options.section_id === undefined) return null;
	return {
		section_tipo: options.section_tipo,
		section_id: String(options.section_id),
		component_tipo: options.component_tipo,
	};
}

/**
 * Legacy PHP registry check (read-only): a live 'focus' event by ANOTHER user
 * on the triple. Keeps PHP-held locks visible to TS users during coexistence.
 */
async function legacyHolder(triple: LockTriple, userId: number): Promise<string | null> {
	const rows = (await sql.unsafe(`SELECT data FROM "${LEGACY_TABLE}" WHERE id = $1 LIMIT 1`, [
		LEGACY_RECORD_ID,
	])) as {
		data:
			| {
					section_id?: unknown;
					section_tipo?: string;
					component_tipo?: string;
					action?: string;
					user_id?: unknown;
					full_username?: string;
					date?: string;
			  }[]
			| null;
	}[];
	const cutoff = Date.now() - LOCK_TTL_SECONDS * 1000;
	for (const event of rows[0]?.data ?? []) {
		if (event.action !== 'focus') continue;
		const timestamp = Date.parse((event.date ?? '').replace(' ', 'T'));
		if (!Number.isNaN(timestamp) && timestamp < cutoff) continue; // expired
		if (
			String(event.section_id) === triple.section_id &&
			event.section_tipo === triple.section_tipo &&
			event.component_tipo === triple.component_tipo &&
			String(event.user_id) !== String(userId)
		) {
			return event.full_username ?? '';
		}
	}
	return null;
}

/**
 * Apply one lock event. Actions (client contract, unchanged):
 * - 'focus'  → acquire (or renew) the triple; in_use when another live user
 *   holds it; also drops the user's other locks on the same record;
 * - 'blur'   → release the triple (only the holder can);
 * - 'delete_user_section_locks' → drop every lock the user holds in the
 *   section, any record (navigation cleanup).
 */
export async function updateLockComponentsState(event: {
	section_id: unknown;
	section_tipo: string | null;
	component_tipo: string | null;
	action: string;
	user_id: number;
	full_username: string;
}): Promise<LockUpdateResult> {
	await ensureTable();

	switch (event.action) {
		case 'focus': {
			const triple = tripleOf(event);
			if (triple === null) {
				return {
					result: false,
					msg: 'focus requires the full component triple',
					dato: null,
					in_use: false,
				};
			}
			// PHP-held lock (coexistence): report in_use without acquiring.
			const phpHolder = await legacyHolder(triple, event.user_id);
			if (phpHolder !== null) {
				return {
					result: false,
					msg: `Component in use by ${phpHolder}`,
					dato: null,
					in_use: true,
					full_username: phpHolder,
				};
			}
			// A user switching fields never accumulates locks on the record: drop
			// their OTHER locks on this section_tipo+section_id first (PHP parity).
			await sql.unsafe(
				`DELETE FROM "${LOCK_TABLE}"
				 WHERE section_tipo = $1 AND section_id = $2 AND user_id = $3 AND component_tipo <> $4`,
				[triple.section_tipo, triple.section_id, event.user_id, triple.component_tipo],
			);
			// THE acquisition: one atomic upsert. The unique key is the mutual
			// exclusion; the WHERE lets the same user renew and lets anyone take
			// over an EXPIRED lock. No row back ⇒ a live lock by someone else.
			const acquired = (await sql.unsafe(
				`INSERT INTO "${LOCK_TABLE}"
					(section_tipo, section_id, component_tipo, user_id, full_username, locked_at)
				 VALUES ($1, $2, $3, $4, $5, now())
				 ON CONFLICT (section_tipo, section_id, component_tipo) DO UPDATE
					SET user_id = EXCLUDED.user_id,
						full_username = EXCLUDED.full_username,
						locked_at = now()
					WHERE "${LOCK_TABLE}".user_id = EXCLUDED.user_id
					   OR "${LOCK_TABLE}".locked_at < now() - interval '${LOCK_TTL_SECONDS} seconds'
				 RETURNING user_id`,
				[
					triple.section_tipo,
					triple.section_id,
					triple.component_tipo,
					event.user_id,
					event.full_username,
				],
			)) as { user_id: number }[];
			if (acquired.length > 0) {
				return { result: true, msg: 'Lock acquired', dato: null, in_use: false };
			}
			// Conflict — report the live holder (the client shows the modal + polls).
			const holder = (await sql.unsafe(
				`SELECT full_username FROM "${LOCK_TABLE}"
				 WHERE section_tipo = $1 AND section_id = $2 AND component_tipo = $3`,
				[triple.section_tipo, triple.section_id, triple.component_tipo],
			)) as { full_username: string }[];
			const holderName = holder[0]?.full_username ?? 'another user';
			return {
				result: false,
				msg: `Component in use by ${holderName}`,
				dato: null,
				in_use: true,
				full_username: holderName,
			};
		}
		case 'blur': {
			const triple = tripleOf(event);
			if (triple === null) {
				return {
					result: false,
					msg: 'blur requires the full component triple',
					dato: null,
					in_use: false,
				};
			}
			await sql.unsafe(
				`DELETE FROM "${LOCK_TABLE}"
				 WHERE section_tipo = $1 AND section_id = $2 AND component_tipo = $3 AND user_id = $4`,
				[triple.section_tipo, triple.section_id, triple.component_tipo, event.user_id],
			);
			return { result: true, msg: 'Lock released', dato: null, in_use: false };
		}
		case 'delete_user_section_locks': {
			if (!event.section_tipo) {
				return {
					result: false,
					msg: 'delete_user_section_locks requires section_tipo',
					dato: null,
					in_use: false,
				};
			}
			await sql.unsafe(`DELETE FROM "${LOCK_TABLE}" WHERE section_tipo = $1 AND user_id = $2`, [
				event.section_tipo,
				event.user_id,
			]);
			// Opportunistic GC: expired locks anywhere are dead weight — prune
			// them here (navigation events are frequent enough, and this DELETE
			// touches only expired rows).
			await sql.unsafe(
				`DELETE FROM "${LOCK_TABLE}" WHERE locked_at < now() - interval '${LOCK_TTL_SECONDS} seconds'`,
			);
			return { result: true, msg: 'User section locks released', dato: null, in_use: false };
		}
		default:
			return {
				result: false,
				msg: `Error event_element->action not valid (${event.action})`,
				dato: null,
				in_use: false,
			};
	}
}

/**
 * Read-only lock check (the client's notify-on-release poll): is the triple
 * held by ANOTHER user right now (TS table or legacy PHP registry)?
 */
export async function getLockStatus(event: {
	section_id: unknown;
	section_tipo: string | null;
	component_tipo: string | null;
	user_id: number;
}): Promise<{ result: boolean; in_use: boolean; full_username: string | null }> {
	await ensureTable();
	const triple = tripleOf(event);
	if (triple === null) return { result: true, in_use: false, full_username: null };

	const rows = (await sql.unsafe(
		`SELECT full_username FROM "${LOCK_TABLE}"
		 WHERE section_tipo = $1 AND section_id = $2 AND component_tipo = $3
		   AND user_id <> $4
		   AND locked_at >= now() - interval '${LOCK_TTL_SECONDS} seconds'`,
		[triple.section_tipo, triple.section_id, triple.component_tipo, event.user_id],
	)) as { full_username: string }[];
	if (rows.length > 0) {
		return { result: true, in_use: true, full_username: rows[0]?.full_username ?? null };
	}
	const phpHolder = await legacyHolder(triple, event.user_id);
	if (phpHolder !== null) {
		return { result: true, in_use: true, full_username: phpHolder };
	}
	return { result: true, in_use: false, full_username: null };
}

/**
 * Release EVERY component lock held by one user (SECTION_SPEC §10, PHP
 * force_unlock_all_components, lock_components.php:399). PHP calls this on every
 * section read: navigating to a list means the user is no longer editing, so
 * their stale edit locks are dropped proactively (belt-and-braces over the TTL
 * expiry + blur release). Touches only this user's TS-owned rows — never other
 * users' locks nor the legacy PHP registry. Returns the number of locks freed.
 */
export async function forceUnlockAllComponents(userId: number): Promise<number> {
	await ensureTable();
	const freed = (await sql.unsafe(
		`DELETE FROM "${LOCK_TABLE}" WHERE user_id = $1 RETURNING component_tipo`,
		[userId],
	)) as { component_tipo: string }[];
	return freed.length;
}

/**
 * Release EVERY live component lock in this engine's table — the lock_components
 * widget's "unlock all users" path (PHP force_unlock_all_components with no
 * user_id). Touches only this engine's TS-owned rows, never the legacy PHP
 * registry. Returns the number of locks freed.
 */
export async function forceUnlockAllUsers(): Promise<number> {
	await ensureTable();
	const freed = (await sql.unsafe(`DELETE FROM "${LOCK_TABLE}" RETURNING component_tipo`, [])) as {
		component_tipo: string;
	}[];
	return freed.length;
}

/**
 * The installation-wide live lock map, enriched for the lock_components
 * maintenance widget (PHP lock_components::get_active_users_full): every current
 * focus lock, described by owner + component + section with human labels. Reads
 * THIS engine's lock table (rows within the TTL) AND the legacy PHP registry
 * (matrix_notifications focus events) so PHP-held locks are visible during
 * coexistence. Fails soft (never throws — it also feeds the eager catalog value):
 * a probe error yields an empty list. Returns the widget's exact shape:
 * { result:true, ar_user_actions:[…] }.
 */
export async function getActiveLockUsers(): Promise<{
	result: boolean;
	ar_user_actions: Record<string, unknown>[];
}> {
	try {
		await ensureTable();
		const { getModelByTipo } = await import('../ontology/resolver.ts');
		const { termByTipo } = await import('../ontology/labels.ts');
		// PHP get_active_users_full labels in DEDALO_DATA_LANG
		// (class.lock_components.php:589-590) — request-scoped, never a
		// hardcoded lg-spa backstop (S2-28).
		const { currentDataLang } = await import('../resolve/request_lang.ts');
		const labelLang = currentDataLang();

		const enrich = async (row: {
			user_id: number;
			full_username: string;
			component_tipo: string;
			section_tipo: string;
			section_id: string;
			date: string;
		}): Promise<Record<string, unknown>> => ({
			user_id: row.user_id,
			full_username: row.full_username,
			component_model: (await getModelByTipo(row.component_tipo)) ?? '',
			component_tipo: row.component_tipo,
			component_label: await termByTipo(row.component_tipo, labelLang),
			section_tipo: row.section_tipo,
			section_id: row.section_id,
			section_label: await termByTipo(row.section_tipo, labelLang),
			date: row.date,
		});

		const ar_user_actions: Record<string, unknown>[] = [];

		// TS-owned live locks (within the TTL window)
		const tsRows = (await sql.unsafe(
			`SELECT user_id, full_username, component_tipo, section_tipo, section_id,
			        to_char(locked_at, 'YYYY-MM-DD HH24:MI:SS') AS date
			 FROM "${LOCK_TABLE}"
			 WHERE locked_at >= now() - interval '${LOCK_TTL_SECONDS} seconds'
			 ORDER BY locked_at DESC`,
			[],
		)) as {
			user_id: number;
			full_username: string;
			component_tipo: string;
			section_tipo: string;
			section_id: string;
			date: string;
		}[];
		for (const row of tsRows) {
			ar_user_actions.push(await enrich(row));
		}

		// Legacy PHP registry focus events (coexistence visibility)
		const legacyRows = (await sql.unsafe(
			`SELECT data FROM "${LEGACY_TABLE}" WHERE id = $1 LIMIT 1`,
			[LEGACY_RECORD_ID],
		)) as {
			data:
				| {
						section_id?: unknown;
						section_tipo?: string;
						component_tipo?: string;
						action?: string;
						user_id?: unknown;
						full_username?: string;
						date?: string;
				  }[]
				| null;
		}[];
		const cutoff = Date.now() - LOCK_TTL_SECONDS * 1000;
		for (const event of legacyRows[0]?.data ?? []) {
			if (event.action !== 'focus') continue;
			const timestamp = Date.parse((event.date ?? '').replace(' ', 'T'));
			if (!Number.isNaN(timestamp) && timestamp < cutoff) continue; // expired
			if (!event.component_tipo || !event.section_tipo) continue;
			ar_user_actions.push(
				await enrich({
					user_id: Number(event.user_id ?? 0),
					full_username: event.full_username ?? '',
					component_tipo: event.component_tipo,
					section_tipo: event.section_tipo,
					section_id: String(event.section_id ?? ''),
					date: event.date ?? '',
				}),
			);
		}

		return { result: true, ar_user_actions };
	} catch {
		// Fail soft: the widget panel (and eager catalog value) shows no locks
		// rather than breaking the dashboard render.
		return { result: true, ar_user_actions: [] };
	}
}
