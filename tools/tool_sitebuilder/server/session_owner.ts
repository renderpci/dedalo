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
 * WHOSE DAEMON, NOT JUST WHOSE SESSION (2026-08-29). Every row also carries the
 * site-builder INSTANCE it was written against, and every read matches on it. A
 * session id is minted by one daemon and unique only there, so without the
 * instance an engine re-pointed at another museum's daemon would read this
 * table's rows as answers about ITS sessions — inheriting another museum's
 * ownership facts, with the ids that happen to collide handing one museum's
 * users control of the other's running agents. A row whose instance differs from
 * the configured one is therefore not "someone else's row to ignore": it is an
 * UNKNOWN OWNER, and fails closed exactly like a missing one.
 *
 * FAIL-CLOSED, AND THE ONE NAMED BYPASS: an unknown owner (a session started
 * before this ledger existed, a row lost, or a row belonging to another
 * instance) denies every ordinary caller. A
 * GLOBAL ADMIN passes regardless — deliberately, and this is the only bypass: an
 * operator must be able to stop a runaway agent that is spending tokens and
 * writing files, and a boundary that cannot be overridden by the installation's
 * administrator would simply be routed around with a daemon restart.
 */

import { config } from '../../../src/config/config.ts';
import { sql } from '../../../src/core/db/postgres.ts';
import type { Principal } from '../../../src/core/security/permissions.ts';
import { resolveSiteBuilderTransport } from '../../../src/core/site_builder/pairing.ts';
import { siteBuilderFailure, siteBuilderRejected } from './wire.ts';

/**
 * The ledger table. Engine-internal machinery (the locks / diffusion-jobs /
 * error-report precedent), NOT heritage data: it holds no cultural content, and
 * dropping it costs exactly the ownership facts, which fail closed.
 */
export const SESSION_OWNER_TABLE = 'dedalo_ts_sitebuilder_sessions';

/**
 * WHICH DAEMON'S SESSIONS THESE ROWS ARE ABOUT — the paired instance, or null on an
 * install whose site builder is not configured.
 *
 * A session id is minted by the DAEMON and is unique within THAT daemon; nothing makes it
 * unique across two of them. So an id alone does not identify a session on this planet, it
 * identifies one on a particular museum's daemon, and a ledger that forgets which daemon is
 * a ledger that answers the wrong question the moment an engine is re-pointed. Every read
 * below therefore matches on the instance as well as the id, and a row belonging to another
 * instance is treated exactly like an unknown owner: refused.
 *
 * Read per call rather than captured: the config module is frozen at boot, but a gate may
 * swap it, and a stale capture would silently keep asserting the previous pairing.
 */
function pairedInstance(): string | null {
	// THE RESOLVER, not the raw key. `config.siteBuilder.instance` is one of the five values
	// that together mean "this engine has a site builder", and reading one of them here was a
	// second opinion about the pairing — the shape of defect 4, which was exactly two places
	// disagreeing about what "configured" means. Asking the resolver also makes this FAIL
	// CLOSED on a half-configured install: an engine with an instance name but no credential
	// or no address is not paired with anything, and must not be stamping ownership rows as
	// though it were.
	return resolveSiteBuilderTransport(config.siteBuilder)?.instance ?? null;
}

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
			instance   text,
			created_at timestamptz NOT NULL DEFAULT now()
		)`,
		[],
	);
	// THE INSTANCE COLUMN ON A TABLE THAT PREDATES IT (2026-08-29). This store is created
	// lazily rather than by the numbered-migration runner (the error_report / temporal
	// precedent), so its schema change is an idempotent ALTER on the same write path — the
	// same shape as the CREATE above, and equally safe to run on every session_start.
	//
	// NULLABLE, DELIBERATELY, and NOT backfilled. A row written before this column existed
	// records that user U owns session S on *whichever* daemon this engine was paired with
	// at the time, which is precisely the fact that cannot be recovered — and inventing it
	// by stamping the CURRENT instance onto every old row is how a re-pointed engine would
	// inherit another museum's sessions, the exact failure this column exists to prevent.
	// So an un-stamped row matches no instance and FAILS CLOSED: its session becomes
	// admin-only, which is the same state a lost row already produces and which the global
	// admin bypass documented in this file's header can always resolve.
	await sql.unsafe(
		`ALTER TABLE "${SESSION_OWNER_TABLE}" ADD COLUMN IF NOT EXISTS instance text`,
		[],
	);
	await sql.unsafe(
		`CREATE INDEX IF NOT EXISTS "${SESSION_OWNER_TABLE}_slug_idx" ON "${SESSION_OWNER_TABLE}" (instance, slug)`,
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
	const instance = pairedInstance();
	if (instance === null) {
		// Unreachable through the tool (session_start runs behind isConfigured, which is
		// false without an instance name), and stated anyway: a row that could not say WHOSE
		// session it is would be worse than no row, because it would read as ownership on
		// every future pairing.
		throw siteBuilderFailure(
			'site_builder.unconfigured',
			'recordSessionOwner: DEDALO_SITE_BUILDER_INSTANCE is unset, so the daemon this ' +
				'session belongs to cannot be recorded. Nothing was written.',
		);
	}
	await ensureSessionOwnerTable();
	await sql.unsafe(
		`INSERT INTO "${SESSION_OWNER_TABLE}" (session_id, slug, user_id, instance)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (session_id) DO NOTHING`,
		[sessionId, slug, userId, instance],
	);
}

/**
 * The recorded owner of a session, or null when there is none — including when
 * the ledger table does not exist yet (a pre-ledger install). A read error is
 * NEVER an allow: it resolves to null, which every caller treats as a denial.
 */
export async function readSessionOwner(sessionId: string): Promise<number | null> {
	const instance = pairedInstance();
	// No pairing, no owner: an engine that cannot say which daemon it talks to cannot
	// attribute that daemon's session ids either.
	if (instance === null) return null;
	try {
		const rows = (await sql.unsafe(
			`SELECT user_id FROM "${SESSION_OWNER_TABLE}"
			  WHERE session_id = $1 AND instance = $2 LIMIT 1`,
			[sessionId, instance],
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
	const instance = pairedInstance();
	if (instance === null) return new Set();
	try {
		const rows = (await sql.unsafe(
			`SELECT session_id FROM "${SESSION_OWNER_TABLE}"
			  WHERE slug = $1 AND user_id = $2 AND instance = $3`,
			[slug, userId, instance],
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
	const instance = pairedInstance();
	if (instance === null) return;
	try {
		// Scoped to this instance: two museums may both have a site called 'museum', and
		// deleting one's ownership rows because the other deleted its site would silently
		// hand that museum's live sessions to nobody.
		await sql.unsafe(`DELETE FROM "${SESSION_OWNER_TABLE}" WHERE slug = $1 AND instance = $2`, [
			slug,
			instance,
		]);
	} catch (error) {
		console.error('[tool_sitebuilder] could not drop session ownership rows:', error);
	}
}
