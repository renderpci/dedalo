/**
 * Session store + login throttle — NEW NATIVE TS AUTH (spec §7.2; explicitly
 * NOT PHP-session-compatible, per project decision).
 *
 * Storage: bun:sqlite database in the private config dir. Deliberate choice:
 * - the shared PostgreSQL schema must stay untouched (spec §2.2) — TS-only
 *   infrastructure lives outside it;
 * - bun:sqlite is built-in, zero-dep, transactional, survives restarts.
 *
 * Security properties (each mirrors or exceeds a PHP guarantee):
 * - session tokens: 32 random bytes; the DB stores only their SHA-256 —
 *   a leaked DB file cannot be replayed as a cookie;
 * - session fixation resistance: tokens are server-minted (never client-set) and
 *   there are no pre-auth/anonymous sessions to fixate, so login issuing a fresh
 *   token cannot be pinned by an attacker. NOTE (AUTHZ-04): login does NOT evict
 *   the user's OTHER existing sessions — concurrent sessions (multi-device) are
 *   allowed by design; a stolen token survives the victim's re-login until its
 *   TTL. `destroyUserSessions` is provided for an explicit "log out everywhere";
 *   whether login should call it is a product decision (see security DECISIONS).
 * - per-session CSRF token (PHP SEC-008), constant-time compared;
 * - sliding-window login throttle keyed namespace|username|ip (PHP SEC-019),
 *   reset on success, shared across processes via the same sqlite file;
 * - sessions expire after SESSION_TTL_SECONDS of inactivity.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { privateDir, readEnv } from '../../config/env.ts';

/** Session cookie name — TS-native, distinct from any PHP cookie. */
export const SESSION_COOKIE = 'dedalo_ts_session';

const SESSION_TTL_SECONDS = Number(readEnv('SESSION_TTL_SECONDS', '43200')); // 12h
/**
 * Absolute session lifetime (L3): a session is rejected once it is older than
 * this since CREATION, regardless of activity — an idle-only TTL let a session
 * used at least once per window live forever, so a stolen token never aged out.
 * Default 30 days; set 0 to disable the absolute cap (idle-only).
 */
const SESSION_ABSOLUTE_TTL_SECONDS = Number(readEnv('SESSION_ABSOLUTE_TTL_SECONDS', '2592000'));
export const LOGIN_MAX_ATTEMPTS = Number(readEnv('LOGIN_MAX_ATTEMPTS', '10'));
export const LOGIN_ATTEMPT_WINDOW_SECONDS = Number(readEnv('LOGIN_ATTEMPT_WINDOW', '900'));
export const LOGIN_LOCKOUT_SECONDS = Number(readEnv('LOGIN_LOCKOUT_SECONDS', '900'));
/**
 * Account-global lockout threshold (per-username, IP-independent). A DEFENSE against
 * IP-rotation brute force that the per-IP bucket alone cannot stop. Deliberately
 * HIGHER than LOGIN_MAX_ATTEMPTS: a low value would let anyone lock a victim's
 * account with a burst of bad passwords (a self-inflicted DoS). Set it very high
 * to effectively disable the account dimension.
 */
export const LOGIN_ACCOUNT_MAX_ATTEMPTS = Number(readEnv('LOGIN_ACCOUNT_MAX_ATTEMPTS', '50'));

/** One authenticated session as the dispatch layer consumes it. */
export interface Session {
	userId: number;
	username: string;
	isGlobalAdmin: boolean;
	csrfToken: string;
	/**
	 * Per-session language overrides (PHP $_SESSION['dedalo']['config']
	 * ['dedalo_application_lang'/'dedalo_data_lang'], set by dd_utils_api::
	 * change_lang). Null until the user picks a language from the menu selector;
	 * null means "use the installation default" (see core/resolve/request_lang.ts).
	 */
	applicationLang: string | null;
	dataLang: string | null;
	/**
	 * The sha256 of the session token — the row key, carried so per-request
	 * writers (setSessionSqo) can update THIS session without the raw token.
	 * Never a secret leak: it is the stored key, not the cookie value.
	 * OPTIONAL: synthetic harness sessions omit it (in-memory-only writes).
	 */
	tokenHash?: string;
	/**
	 * Per-section navigation SQOs (PHP $_SESSION['dedalo']['config']['sqo'],
	 * keyed by section::build_sqo_id = the caller tipo). Written by section
	 * list/edit reads (dd_core_api :2276-98), stamped on section contexts as
	 * `sqo_session`, re-read by tools (tool_export, section_tool navigation).
	 * OPTIONAL for synthetic sessions; getSession always populates it.
	 */
	sqoSession?: Record<string, unknown>;
}

/**
 * Store path (S1-18): the live file in ../private by default; the
 * DEDALO_SESSION_DB_PATH override exists so `bun test` (bunfig [test].preload
 * → test/preload/session_db.ts) points the WHOLE test process at a per-run
 * scratch file — tests and the live dev server must never share this database.
 */
const LIVE_SESSION_DB_PATH = join(privateDir, 'dedalo_ts_sessions.sqlite');
const sessionDbPath = readEnv('DEDALO_SESSION_DB_PATH') ?? LIVE_SESSION_DB_PATH;
/** The resolved on-disk session store path (honours the override) — read-only
 * accessor for status surfaces (e.g. the check_config maintenance widget). */
export const SESSION_DB_PATH = sessionDbPath;

// BOOTSTRAP ORDER (install): sqlite's `create: true` creates the FILE, never its
// parent DIRECTORY — an absent one is SQLITE_CANTOPEN. This module opens the DB
// at import, which on a fresh tree happens BEFORE the installer has run
// persistConfig/checkDirectories (the steps that would mkdir privateDir), so
// merely importing anything that reaches the session store used to abort the
// install. Create the parent ourselves: 0o700 because this file holds session
// and throttle state (same mode install/config_persist.ts gives privateDir).
// Recursive+idempotent, and a no-op mode-wise when the directory already exists.
mkdirSync(dirname(sessionDbPath), { recursive: true, mode: 0o700 });

const database = new Database(sessionDbPath, { create: true });
// busy_timeout is PER-CONNECTION state: set it immediately after every open,
// or a concurrent writer (dev server + test run) throws SQLITE_BUSY after ~1ms.
database.exec('PRAGMA busy_timeout = 5000');
// journal_mode=WAL is a persistent property of the FILE (idempotent to re-run):
// switched deliberately so cross-process readers and one writer coexist instead
// of serializing on the rollback journal.
database.exec('PRAGMA journal_mode = WAL');
database.exec(`
	CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		username TEXT NOT NULL,
		is_global_admin INTEGER NOT NULL DEFAULT 0,
		csrf_token TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		last_seen INTEGER NOT NULL
	);
	CREATE TABLE IF NOT EXISTS login_attempts (
		attempt_key TEXT NOT NULL,
		attempted_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_attempts_key ON login_attempts(attempt_key, attempted_at);
`);

// Migration: the per-session language columns were added after the sessions
// table shipped. ADD COLUMN on an existing DB throws "duplicate column" once
// applied, so each is guarded — SQLite has no idempotent ADD COLUMN.
for (const column of ['application_lang', 'data_lang', 'sqo_session']) {
	try {
		database.exec(`ALTER TABLE sessions ADD COLUMN ${column} TEXT`);
	} catch (error) {
		// ONLY the expected duplicate-column error is benign (the migration
		// already applied). Anything else (locked DB, disk full, corrupt file)
		// must fail the boot loudly — swallowing it leaves the column missing
		// and every subsequent getSession() throwing (audit S2-39).
		if (!String((error as Error).message ?? error).includes('duplicate column')) {
			throw error;
		}
	}
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

function sha256Hex(value: string): string {
	return new Bun.CryptoHasher('sha256').update(value).digest('hex');
}

/** Create a session for a verified user. Returns the RAW token (cookie value). */
export function createSession(userId: number, username: string, isGlobalAdmin: boolean): string {
	const rawToken =
		crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
	const csrfToken =
		crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
	database
		.query(
			`INSERT INTO sessions (token_hash, user_id, username, is_global_admin, csrf_token, created_at, last_seen)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			sha256Hex(rawToken),
			userId,
			username,
			isGlobalAdmin ? 1 : 0,
			csrfToken,
			nowSeconds(),
			nowSeconds(),
		);
	// Language columns start NULL (installation default) — a fresh login carries
	// no per-user language preference until the user picks one from the menu.
	return rawToken;
}

/**
 * Persist a per-session language override (PHP change_lang → $_SESSION). Only
 * the languages supplied are written; passing `undefined` leaves that column
 * untouched. Missing session (expired between the read and this write) is a
 * silent no-op — the caller already validated the request.
 */
export function setSessionLangs(
	rawToken: string,
	langs: { applicationLang?: string; dataLang?: string },
): void {
	if (langs.applicationLang !== undefined) {
		database
			.query('UPDATE sessions SET application_lang = ? WHERE token_hash = ?')
			.run(langs.applicationLang, sha256Hex(rawToken));
	}
	if (langs.dataLang !== undefined) {
		database
			.query('UPDATE sessions SET data_lang = ? WHERE token_hash = ?')
			.run(langs.dataLang, sha256Hex(rawToken));
	}
}

/** Resolve a raw token to a live session (touching last_seen); null if invalid/expired. */
export function getSession(rawToken: string): Session | null {
	const row = database
		.query(
			'SELECT user_id, username, is_global_admin, csrf_token, created_at, last_seen, application_lang, data_lang, sqo_session FROM sessions WHERE token_hash = ?',
		)
		.get(sha256Hex(rawToken)) as {
		user_id: number;
		username: string;
		is_global_admin: number;
		csrf_token: string;
		created_at: number;
		last_seen: number;
		application_lang: string | null;
		data_lang: string | null;
		sqo_session: string | null;
	} | null;
	if (row === null) return null;
	if (nowSeconds() - row.last_seen > SESSION_TTL_SECONDS) {
		destroySession(rawToken);
		return null;
	}
	// Absolute lifetime cap (L3): even a continuously-used session must expire.
	if (
		SESSION_ABSOLUTE_TTL_SECONDS > 0 &&
		nowSeconds() - row.created_at > SESSION_ABSOLUTE_TTL_SECONDS
	) {
		destroySession(rawToken);
		return null;
	}
	database
		.query('UPDATE sessions SET last_seen = ? WHERE token_hash = ?')
		.run(nowSeconds(), sha256Hex(rawToken));
	let sqoSession: Record<string, unknown> = {};
	if (row.sqo_session !== null && row.sqo_session !== '') {
		try {
			sqoSession = JSON.parse(row.sqo_session) as Record<string, unknown>;
		} catch (error) {
			// A corrupt map must not kill the session — report and start empty.
			console.error('[session_store] corrupt sqo_session JSON dropped', error);
		}
	}
	return {
		userId: row.user_id,
		username: row.username,
		isGlobalAdmin: row.is_global_admin === 1,
		csrfToken: row.csrf_token,
		applicationLang: row.application_lang,
		dataLang: row.data_lang,
		tokenHash: sha256Hex(rawToken),
		sqoSession,
	};
}

/**
 * Persist ONE section's navigation SQO on a live session (PHP
 * section::set_session_sqo + the dd_core_api :2288/:2339 write sites). Also
 * mutates the in-memory session so the SAME request's context stamp
 * (sqo_session) sees the just-stored value — PHP stores before resolving the
 * context and stamps the fresh value.
 */
export function setSessionSqo(session: Session, sqoId: string, sqo: unknown): void {
	session.sqoSession ??= {};
	session.sqoSession[sqoId] = sqo;
	// Synthetic (harness) sessions carry no tokenHash — in-memory only.
	if (session.tokenHash !== undefined) {
		database
			.query('UPDATE sessions SET sqo_session = ? WHERE token_hash = ?')
			.run(JSON.stringify(session.sqoSession), session.tokenHash);
	}
}

export function destroySession(rawToken: string): void {
	database.query('DELETE FROM sessions WHERE token_hash = ?').run(sha256Hex(rawToken));
}

/**
 * Evict all of a user's sessions except an optional one to keep (AUTHZ-04 —
 * "log out everywhere"). Returns the number of sessions removed. Not called by
 * login automatically (concurrent sessions are allowed by design); expose it via
 * an explicit user action or call it from login if the deployment opts into
 * single-session semantics.
 */
export function destroyUserSessions(userId: number, keepRawToken?: string): number {
	if (keepRawToken !== undefined) {
		return database
			.query('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
			.run(userId, sha256Hex(keepRawToken)).changes;
	}
	return database.query('DELETE FROM sessions WHERE user_id = ?').run(userId).changes;
}

/** Constant-time CSRF comparison (PHP hash_equals equivalent). */
export function verifyCsrf(session: Session, candidate: string | null): boolean {
	if (candidate === null || candidate.length === 0) return false;
	const expected = Buffer.from(session.csrfToken);
	const received = Buffer.from(candidate);
	if (expected.length !== received.length) return false;
	return crypto.timingSafeEqual(expected, received);
}

/** Throttle key: namespace|lowercased-username|ip (PHP SEC-019 shape). */
export function buildThrottleKey(namespace: string, username: string, ip: string): string {
	return `${namespace}|${username.toLowerCase()}|${ip}`;
}

/**
 * Account-global throttle key: namespace|acct|lowercased-username (NO ip). Rotating
 * a spoofed X-Forwarded-For cannot mint a fresh bucket for this key, so it caps
 * total failures against one account regardless of source IP. Distinct shape from
 * buildThrottleKey so the two dimensions never collide.
 */
export function buildAccountThrottleKey(namespace: string, username: string): string {
	return `${namespace}|acct|${username.toLowerCase()}`;
}

/**
 * True when this key is currently locked out (sliding window). `maxAttempts`
 * defaults to the per-IP threshold; the account-global caller passes the higher
 * LOGIN_ACCOUNT_MAX_ATTEMPTS.
 */
export function isThrottled(attemptKey: string, maxAttempts: number = LOGIN_MAX_ATTEMPTS): boolean {
	const windowStart = nowSeconds() - LOGIN_ATTEMPT_WINDOW_SECONDS;
	const row = database
		.query(
			'SELECT COUNT(*) AS attempts, MAX(attempted_at) AS latest FROM login_attempts WHERE attempt_key = ? AND attempted_at > ?',
		)
		.get(attemptKey, windowStart) as { attempts: number; latest: number | null };
	return (
		row.attempts >= maxAttempts &&
		row.latest !== null &&
		row.latest + LOGIN_LOCKOUT_SECONDS > nowSeconds()
	);
}

export function recordFailedAttempt(attemptKey: string): void {
	database
		.query('INSERT INTO login_attempts (attempt_key, attempted_at) VALUES (?, ?)')
		.run(attemptKey, nowSeconds());
	// Opportunistic residue GC (audit S3-46): attempts older than the sliding
	// window + lockout can never influence a throttle decision again, yet the
	// table previously grew forever. One indexed DELETE per failed login is
	// cheap and keeps the store bounded without a background timer.
	database
		.query('DELETE FROM login_attempts WHERE attempted_at < ?')
		.run(nowSeconds() - (LOGIN_ATTEMPT_WINDOW_SECONDS + LOGIN_LOCKOUT_SECONDS));
}

/** Successful login unlocks immediately (PHP behavior). */
export function clearAttempts(attemptKey: string): void {
	database.query('DELETE FROM login_attempts WHERE attempt_key = ?').run(attemptKey);
}

/** Test hook: wipe volatile state (sessions + attempts). */
export function resetSessionStoreForTests(): void {
	// S1-18 guard: this wipes both tables, and the open store may be the LIVE
	// ../private file. Refuse unless the store was opened at the explicit
	// DEDALO_SESSION_DB_PATH test override — re-read at call time so a
	// mutated/unset environment cannot leave a stale pass.
	const override = readEnv('DEDALO_SESSION_DB_PATH');
	if (
		override === undefined ||
		resolve(sessionDbPath) !== resolve(override) ||
		resolve(sessionDbPath) === resolve(LIVE_SESSION_DB_PATH)
	) {
		throw new Error(
			`resetSessionStoreForTests refused: the open session store ('${sessionDbPath}') is not the DEDALO_SESSION_DB_PATH test override — wiping it would destroy live sessions (S1-18). Run under the bunfig [test] preload.`,
		);
	}
	database.exec('DELETE FROM sessions; DELETE FROM login_attempts;');
}

/** Prune sessions idle past the TTL (the TS analog of PHP session-file GC). */
export function pruneExpiredSessions(): number {
	const cutoff = Math.floor(Date.now() / 1000) - SESSION_TTL_SECONDS;
	const result = database.query('DELETE FROM sessions WHERE last_seen < ?').run(cutoff);
	return Number((result as { changes?: number }).changes ?? 0);
}
