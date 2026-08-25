/**
 * WHO OWNS AN AGENT SESSION — the engine-side ownership ledger for
 * tool_sitebuilder sessions (P2-8(b), 2026-08-24).
 *
 * THE CONCRETE FAILURE THIS PREVENTS: a session id is the whole capability. With
 * `session_message` / `session_stop` / `session_stream` keyed by nothing but that
 * id, any caller who could reach those actions could type into ANOTHER user's
 * running agent (an agent with write access to that site's workspace and a
 * budget of LLM tokens), kill their turn mid-write, or read the full transcript
 * of what they asked it to do — prompts, file contents the agent echoed back,
 * error text. Ownership is what makes "your session" a real boundary instead of
 * a UI convention.
 *
 * WHY THE LEDGER LIVES HERE AND NOT IN THE DAEMON. The daemon's session record
 * (publication/site_builder src/sessions/events.ts `SessionMeta`) has NO owner
 * field: it stores session_id / slug / driver / started_at / turns / state /
 * resume_token, and the actor reaches the daemon only as an audit line
 * (`audit.jsonl`) — an append-only tail that is read newest-first with a bounded
 * limit, so it cannot answer "who owns THIS id" for anything but a recent
 * session. Recording the owner where the session lives would be the structurally
 * better home, and it is where this belongs the day the daemon is touched; the
 * engine is nonetheless the right authority for the DECISION (it is the only
 * side that knows the principal at all — the browser never reaches the daemon),
 * so the engine records the fact it alone knows.
 *
 * DURABILITY: a module Map was rejected. Ownership that evaporates on restart or
 * differs per worker process is not an authorization boundary — it is a boundary
 * that opens whenever the process recycles. So the fact is a row in a small
 * engine-owned table, on the same Postgres as everything else. The table is
 * created lazily on first WRITE (the error_report store idiom); the read path
 * never issues DDL, and a missing table simply means "no owner recorded", which
 * FAILS CLOSED.
 *
 * FAIL-CLOSED, AND THE ONE NAMED BYPASS: an unknown owner (a session started
 * before this ledger existed, or a row lost) denies every ordinary caller. A
 * GLOBAL ADMIN passes regardless — deliberately, and this is the only bypass: an
 * operator must be able to stop a runaway agent that is spending tokens and
 * writing files, and a boundary that cannot be overridden by the installation's
 * administrator would simply be routed around with a daemon restart.
 */

import { sql } from '../../../src/core/db/postgres.ts';
import type { Principal } from '../../../src/core/security/permissions.ts';
import { siteBuilderRejected } from './wire.ts';

/**
 * The ledger table. Engine-internal machinery (the locks / diffusion-jobs /
 * error-report precedent), NOT heritage data: it holds no cultural content, and
 * dropping it costs exactly the ownership facts, which fail closed.
 */
export const SESSION_OWNER_TABLE = 'dedalo_ts_sitebuilder_sessions';

/**
 * The refusal every ownership denial uses — ONE sentence for "not yours" and for
 * "no owner recorded" alike, so the refusal cannot be used as an oracle telling a
 * caller which session ids exist.
 */
const NOT_YOURS = 'This agent session belongs to another user.';

/**
 * Idempotent provisioning, run on the WRITE path only (session_start). Keeping
 * DDL off the read path means an install whose ledger table is missing refuses
 * reads rather than silently creating a table under a SELECT.
 *
 * Exported for the gate (test/unit/tool_sitebuilder_authz_native.test.ts), which
 * has to be able to clean the table before it has ever been written to.
 */
export async function ensureSessionOwnerTable(): Promise<void> {
	await sql.unsafe(
		`CREATE TABLE IF NOT EXISTS "${SESSION_OWNER_TABLE}" (
			session_id text PRIMARY KEY,
			slug       text        NOT NULL,
			user_id    integer     NOT NULL,
			created_at timestamptz NOT NULL DEFAULT now()
		)`,
		[],
	);
	await sql.unsafe(
		`CREATE INDEX IF NOT EXISTS "${SESSION_OWNER_TABLE}_slug_idx" ON "${SESSION_OWNER_TABLE}" (slug)`,
		[],
	);
}

/**
 * Record the caller as the owner of a freshly started session.
 *
 * FIRST WRITER WINS (`ON CONFLICT DO NOTHING`): re-recording an id must never be
 * able to TRANSFER ownership, or the ownership check would be defeated by
 * replaying a session_start with a chosen id.
 *
 * Throws on failure. The caller (sessionStart) decides what that means — the
 * daemon has already started the agent by then, so the failure is logged loudly
 * and the session is left admin-only rather than being reported as never started.
 */
export async function recordSessionOwner(
	sessionId: string,
	slug: string,
	userId: number,
): Promise<void> {
	await ensureSessionOwnerTable();
	await sql.unsafe(
		`INSERT INTO "${SESSION_OWNER_TABLE}" (session_id, slug, user_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (session_id) DO NOTHING`,
		[sessionId, slug, userId],
	);
}

/**
 * The recorded owner of a session, or null when there is none — including when
 * the ledger table does not exist yet (a pre-ledger install). A read error is
 * NEVER an allow: it resolves to null, which every caller treats as a denial.
 */
export async function readSessionOwner(sessionId: string): Promise<number | null> {
	try {
		const rows = (await sql.unsafe(
			`SELECT user_id FROM "${SESSION_OWNER_TABLE}" WHERE session_id = $1 LIMIT 1`,
			[sessionId],
		)) as { user_id: number }[];
		return rows[0]?.user_id ?? null;
	} catch (error) {
		// A missing table is the expected shape on an install that has not started
		// a session since the ledger landed; anything else is a real fault. Both
		// mean the same thing to the gate — no owner is known — so both fail closed,
		// loudly.
		console.error('[tool_sitebuilder] session ownership lookup failed:', error);
		return null;
	}
}

/**
 * THE GATE. Refuses unless the caller owns the session, or is a global admin
 * (the named operator bypass documented in this file's header). Call it BEFORE
 * the daemon call — the daemon executes whatever the engine sends.
 */
export async function assertSessionOwner(sessionId: string, principal: Principal): Promise<void> {
	if (principal.isGlobalAdmin) return;
	const owner = await readSessionOwner(sessionId);
	if (owner === null || owner !== principal.userId) {
		throw siteBuilderRejected(NOT_YOURS);
	}
}

/**
 * The caller's own session ids for one site — the filter session_history applies
 * to the daemon's (site-wide, collaborative) list, so a list read discloses only
 * sessions the caller could actually open. Empty on any read failure: fail closed.
 */
export async function ownedSessionIds(slug: string, userId: number): Promise<Set<string>> {
	try {
		const rows = (await sql.unsafe(
			`SELECT session_id FROM "${SESSION_OWNER_TABLE}" WHERE slug = $1 AND user_id = $2`,
			[slug, userId],
		)) as { session_id: string }[];
		return new Set(rows.map((row) => row.session_id));
	} catch (error) {
		console.error('[tool_sitebuilder] session ownership listing failed:', error);
		return new Set();
	}
}

/**
 * Drop a site's ownership rows when the site itself is deleted. Best effort: the
 * site is already gone, so a failure here leaks rows that address nothing — worth
 * a loud line, never worth turning a completed delete into an error.
 */
export async function forgetSiteSessions(slug: string): Promise<void> {
	try {
		await sql.unsafe(`DELETE FROM "${SESSION_OWNER_TABLE}" WHERE slug = $1`, [slug]);
	} catch (error) {
		console.error('[tool_sitebuilder] could not drop session ownership rows:', error);
	}
}
