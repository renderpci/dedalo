/**
 * Authentication — login against the SHARED user records (matrix_users,
 * section dd128) with Argon2id verification, new-native session issuance
 * (spec §7.2; session mechanics in session_store.ts).
 *
 * User data contract (verified on the live DB):
 *   matrix_users.string = { "dd132":[{value: username}], "dd133":[{value: password_hash}], … }
 *   root user is section_id -1 and carries an $argon2id$ hash.
 *
 * Guarantees carried over from PHP login (class.login.php):
 * - Argon2id verify (Bun.password — native, same algorithm);
 * - sliding-window brute-force throttle, reset on success;
 * - ambiguous failure message + no user-existence disclosure;
 * - session rotation on login (a fresh token is always issued).
 *
 * UNCOVERED SCOPE (denied loudly, never silently): legacy pre-Argon2 hashes
 * (base64 AES values still present on non-migrated accounts) — verifying them
 * requires the PHP-side legacy key material; those accounts must log into the
 * PHP server once (lazy rehash) before the TS server accepts them. SAML and
 * maintenance-mode gating are Phase 5 continuation.
 */

import { sql } from '../db/postgres.ts';
import {
	LOGIN_ACCOUNT_MAX_ATTEMPTS,
	buildAccountThrottleKey,
	buildThrottleKey,
	clearAttempts,
	createSession,
	isThrottled,
	recordFailedAttempt,
} from './session_store.ts';

const USERS_SECTION_TIPO = 'dd128';
const USERNAME_COMPONENT = 'dd132';
const PASSWORD_COMPONENT = 'dd133';

/**
 * The WHERE tipo every login/logout activity row carries (PHP
 * login::get_login_tipo — "fixed because never changes").
 */
export const LOGIN_ACTIVITY_TIPO = 'dd229';

/**
 * Append the 'LOG IN' activity row (dd42 code 1). PHP logs BOTH outcomes —
 * a denied attempt is the security-relevant one, and it carries the attempted
 * username so an operator can see who is being probed.
 *
 * The actor is ANONYMOUS_USER_ID on every failure, including a wrong password
 * for a real account: PHP passes logged_user_id(), and nobody is logged in yet
 * at that point. The username lives in the payload instead.
 *
 * DIVERGENCE (recorded): PHP's success payload also carries `browser`
 * ($_SERVER['HTTP_USER_AGENT']) and `DB-backup`. The TS request path does not
 * carry a user-agent at all, so we omit both rather than fake them.
 */
async function logLoginActivity(
	outcome: 'allow' | 'deny',
	cause: string,
	username: string,
	clientIp: string,
	userId?: number,
): Promise<void> {
	const { logActivity, hostFromClientIp, ANONYMOUS_USER_ID } = await import(
		'../api/handlers/activity_log.ts'
	);
	const actor = userId ?? ANONYMOUS_USER_ID;
	await logActivity({
		what: 'LOG IN',
		tipo: LOGIN_ACTIVITY_TIPO,
		userId: actor,
		host: hostFromClientIp(clientIp),
		data: {
			msg:
				outcome === 'allow'
					? `User ${actor} is logged. Hello ${username}`
					: `Denied login attempted by: ${username}. ${cause}`,
			result: outcome,
			cause,
			username,
		},
	});
}

/** Ambiguous by design — never reveals whether the user exists. */
export const LOGIN_FAILED_MESSAGE = 'User does not exist or password is invalid';

/**
 * Memoized Argon2id decoy hash (AUTHZ-03). Login previously returned FAST on the
 * no-user / legacy-hash paths (no crypto) but spent an Argon2id verify for an
 * existing user — a measurable timing side-channel that enumerates usernames
 * despite the ambiguous message. We run a real verify against this decoy on the
 * failure paths so every login costs ~one Argon2id regardless of whether the
 * account exists. (Online guessing rate is bounded by the two-dimension throttle,
 * which already exceeds PHP's per-connection sleep — so no fixed sleep is added.)
 */
let decoyHashPromise: Promise<string> | null = null;
function decoyHash(): Promise<string> {
	if (decoyHashPromise === null) {
		decoyHashPromise = Bun.password.hash(crypto.randomUUID(), { algorithm: 'argon2id' });
	}
	return decoyHashPromise;
}
/** Spend one Argon2id verify against the decoy to normalize failure-path timing.
 * Exported for security/password_reset.ts, which applies the same AUTHZ-03
 * posture to its anti-enumeration no-op paths (in place of PHP's sleep(2)). */
export async function normalizeTiming(password: string): Promise<void> {
	try {
		await Bun.password.verify(password, await decoyHash());
	} catch {
		// never throws in practice; a decoy failure must not change the outcome
	}
}

export interface LoginResult {
	ok: boolean;
	message: string;
	/** Raw session token (cookie value) on success. */
	sessionToken?: string;
	userId?: number;
	/**
	 * The 128-hex media-auth cookie value (Rule A — core/media/protection.ts). Present
	 * only when media protection is enabled; absent means the mode is false and no media
	 * cookie should be set.
	 */
	mediaAuthCookieValue?: string;
}

/** Find a user row by exact username (jsonb containment — indexed, parameterized). */
async function findUserByUsername(
	username: string,
): Promise<{ section_id: number; passwordHash: string | null } | null> {
	const rows = (await sql.unsafe(
		`SELECT section_id, string FROM matrix_users
		 WHERE section_tipo = $1
		   AND string->$2 @> $3::text::jsonb
		 LIMIT 1`,
		[USERS_SECTION_TIPO, USERNAME_COMPONENT, JSON.stringify([{ value: username }])],
	)) as { section_id: number; string: Record<string, { value?: string }[]> }[];
	const row = rows[0];
	if (row === undefined) return null;
	const passwordItems = row.string?.[PASSWORD_COMPONENT];
	return {
		section_id: row.section_id,
		passwordHash: passwordItems?.[0]?.value ?? null,
	};
}

/**
 * Authenticate and open a session. `clientIp` feeds the throttle key — the
 * HTTP layer passes the proxy-validated address.
 */
export async function login(
	username: string,
	password: string,
	clientIp: string,
): Promise<LoginResult> {
	// Two throttle dimensions: per-IP (fast lockout of one source) and
	// account-global (IP-independent — a spoofed X-Forwarded-For rotation cannot
	// evade it). A lockout on EITHER refuses, with the same ambiguous message.
	const throttleKey = buildThrottleKey('login', username, clientIp);
	const accountKey = buildAccountThrottleKey('login', username);
	const recordFailure = (): void => {
		recordFailedAttempt(throttleKey);
		recordFailedAttempt(accountKey);
	};
	if (isThrottled(throttleKey) || isThrottled(accountKey, LOGIN_ACCOUNT_MAX_ATTEMPTS)) {
		// Same ambiguous message: lockout must not confirm the account exists.
		// (No PHP twin — v6 had no throttle. Logged anyway: a lockout is exactly
		// the event an operator reviewing the audit trail wants to see.)
		await logLoginActivity('deny', 'Too many failed attempts (throttled)', username, clientIp);
		return { ok: false, message: LOGIN_FAILED_MESSAGE };
	}

	const user = await findUserByUsername(username);
	if (user === null || user.passwordHash === null) {
		await normalizeTiming(password); // AUTHZ-03: match the existing-user Argon2id cost
		recordFailure();
		await logLoginActivity('deny', 'User does not exist', username, clientIp);
		return { ok: false, message: LOGIN_FAILED_MESSAGE };
	}

	if (!user.passwordHash.startsWith('$argon2')) {
		// Legacy AES hash — uncovered scope (see module header). Deny loudly
		// in the server log, ambiguously on the wire.
		console.error(
			`auth: user '${username}' still has a legacy (pre-Argon2) password hash — log into the PHP server once to upgrade it.`,
		);
		await normalizeTiming(password); // AUTHZ-03: no fast-path timing tell
		recordFailure();
		await logLoginActivity('deny', 'Legacy (pre-Argon2) password hash', username, clientIp);
		return { ok: false, message: LOGIN_FAILED_MESSAGE };
	}

	const verified = await Bun.password.verify(password, user.passwordHash);
	if (!verified) {
		recordFailure();
		await logLoginActivity('deny', 'wrong password', username, clientIp);
		return { ok: false, message: LOGIN_FAILED_MESSAGE };
	}

	clearAttempts(throttleKey);
	clearAttempts(accountKey);

	// MAINTENANCE MODE (TS-native server state): only the superuser may log
	// in while the flag is set (the TS analog of PHP's
	// DEDALO_MAINTENANCE_MODE_CUSTOM config_core override).
	if (user.section_id !== -1) {
		const { getServerState } = await import('../resolve/server_state.ts');
		if (getServerState().maintenance_mode === true) {
			// Credentials were CORRECT — the refusal is the maintenance gate, and
			// the audit row must say so rather than read as a failed attempt.
			await logLoginActivity('deny', 'Server under maintenance', username, clientIp);
			return { ok: false, message: 'Server under maintenance. Please try again later.' };
		}
	}

	// MEDIA ACCESS CONTROL, Rule A (PHP login::init_cookie_auth). Mints/recycles the
	// daily media-auth cookie, lays its marker, and refreshes the generated web-server
	// rules. Returns null when the mode is false — then this is a TOTAL no-op.
	//
	// It lives HERE, beside createSession, and not in the login HANDLER, so that no
	// future login door (SAML is a ledgered open item) can ship without it and leave its
	// users 404ing on every media file.
	//
	// It runs BEFORE createSession deliberately: it throws on filesystem failure
	// (CONVENTIONS §1 — a configured gate that cannot be written must not degrade into
	// silently unprotected media), and doing it first means a throw leaves no orphan
	// session behind. Divergence from PHP, recorded: PHP unlinked its cookie store on a
	// rules-write failure — we do NOT. The markers are already laid, and deleting the
	// store would rotate every other editor's cookie value out on the next login,
	// revoking media access install-wide over a transient EPERM.
	const { initMediaAuthCookie } = await import('../media/protection.ts');
	const mediaAuthCookieValue = initMediaAuthCookie();

	// PHP: superuser is user_id -1; global-admin flag also derives from the
	// profile — v0 grants admin to the superuser only (profile-based admins
	// are Phase 5 continuation alongside the permissions matrix).
	const isGlobalAdmin = user.section_id === -1;
	const sessionToken = createSession(user.section_id, username, isGlobalAdmin);
	await logLoginActivity('allow', 'correct user and password', username, clientIp, user.section_id);
	return {
		ok: true,
		message: 'ok',
		sessionToken,
		userId: user.section_id,
		...(mediaAuthCookieValue !== null ? { mediaAuthCookieValue } : {}),
	};
}
