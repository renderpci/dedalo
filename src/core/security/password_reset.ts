/**
 * PASSWORD RESET — self-service "forgot password" recovery (TS port of the
 * frozen-PHP core/password_reset/class.password_reset.php; the wire shapes and
 * error codes below are the contract the copied client consumes —
 * client/dedalo/core/login/js/render_login.js reset handlers).
 *
 * Flow: an unauthenticated user requests a one-time 8-digit code from the login
 * screen; the code is emailed (core/mailer) to the address on the user record
 * (component_email dd134). The user posts the code back with a new password; on
 * a correct, unexpired code the password component (dd133) is rewritten through
 * the ONE write engine (saveComponentData → the component_password Argon2id
 * hashing gate).
 *
 * Security model (mirrors the PHP class; divergences recorded):
 * - The code is NEVER stored/logged in plain text — only its Argon2id digest,
 *   in the session sqlite store (session_store.ts password_resets; the TS
 *   analog of PHP's DEDALO_CACHE/dd_password_reset/*.json file store — storage
 *   is not wire-visible). The only secret is the emailed code; reset_id is an
 *   opaque, non-secret correlation token.
 * - Anti-enumeration: requestPasswordReset ALWAYS returns the same generic
 *   shape, and every no-op path spends one decoy Argon2id verify
 *   (auth.ts normalizeTiming, AUTHZ-03) — a DELIBERATE divergence from PHP's
 *   sleep(2), matching the posture login already uses.
 * - Brute-force resistance against the 1e8 code space: short TTL
 *   (DEDALO_PWRESET_CODE_TTL), a low per-code attempt cap
 *   (DEDALO_PWRESET_MAX_ATTEMPTS; the entry is deleted once reached), plus a
 *   per-(identifier|ip) request throttle and a per-(reset_id|ip) verify
 *   throttle reusing the login throttle store (window/lockout shared with the
 *   login keys — deliberate, same values PHP used).
 * - A successful reset does NOT establish a session; the user logs in normally.
 * - DIVERGENCE (hardening, wire-invisible): a successful reset EVICTS the
 *   user's existing sessions (destroyUserSessions) — PHP did not, which let a
 *   stolen session survive the very reset meant to revoke it.
 *
 * Activity log: PHP wrote a 'PASSWORD RESET' activity row; the TS activity
 * helper skips unmapped WHAT codes and dd42 has none for password reset, so we
 * log server-side only (never a guessed code — ledgered open item).
 */

import { readNumber } from '../../config/readers.ts';
import { type Locator, compareLocators } from '../concepts/locator.ts';
import { sql } from '../db/postgres.ts';
import { cleanEmail, isValidEmail, sendMail } from '../mailer/mailer.ts';
import { normalizeTiming } from './auth.ts';
import {
	buildThrottleKey,
	clearAttempts,
	deletePasswordReset,
	destroyUserSessions,
	incrementPasswordResetAttempts,
	isThrottled,
	loadPasswordReset,
	recordFailedAttempt,
	storePasswordReset,
} from './session_store.ts';

const USERS_SECTION_TIPO = 'dd128';
const USERNAME_COMPONENT = 'dd132';
const PASSWORD_COMPONENT = 'dd133';
const EMAIL_COMPONENT = 'dd134';
/** component_radio_button dd131; item[0] pointing at list entry 1 (Yes) means active. */
const ACTIVE_ACCOUNT_COMPONENT = 'dd131';

/** Minimum new-password length (mirrors the login strlen<8 guard). */
const MIN_PASSWORD_LENGTH = 8;

export interface RequestResetResponse {
	result: true;
	msg: string;
	reset_id: string;
}

export interface ConfirmResetResponse {
	result: boolean;
	msg: string;
	errors: string[];
}

/** Opaque, non-secret correlation token: 32 lowercase hex characters. */
function generateResetId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Cryptographically secure 8-digit numeric code, zero-padded. */
function generateCode(): string {
	const buffer = new Uint32Array(1);
	// Rejection sampling: accept only values below the largest multiple of 1e8,
	// so the modulo is unbiased across the full 8-digit space.
	const limit = Math.floor(0xffffffff / 1e8) * 1e8;
	let value: number;
	do {
		crypto.getRandomValues(buffer);
		value = buffer[0] as number;
	} while (value >= limit);
	return String(value % 1e8).padStart(8, '0');
}

function isValidResetId(resetId: string): boolean {
	return /^[0-9a-f]{32}$/.test(resetId);
}

/** Recovery-code email body — free of any account identifier (PHP-verbatim). */
function buildEmailBody(code: string, ttlMinutes: number): string {
	return `Someone requested a password recovery for your Dédalo account.\n\nYour recovery code is: ${code}\n\nThis code expires in ${ttlMinutes} minutes and can only be used once.\n\nIf you did not request this, you can safely ignore this email; your password will not change.`;
}

/** "Password was changed" notice body (PHP-verbatim). */
function buildPasswordChangedBody(): string {
	return (
		'The password for your Dédalo account was just changed using the password recovery process.\n\n' +
		'If this was you, no further action is needed.\n\n' +
		'If you did NOT change your password, contact your Dédalo administrator immediately — someone may have access to your email account.'
	);
}

/** A matrix_users row as the resolution queries read it. */
interface UserRow {
	section_id: number;
	string: Record<string, { value?: unknown }[] | undefined> | null;
	relation: Record<string, { section_id?: unknown }[] | undefined> | null;
}

const USER_ROW_SELECT = `SELECT section_id, string, relation FROM matrix_users
	 WHERE section_tipo = $1
	   AND string->$2 @> $3::text::jsonb
	 ORDER BY section_id ASC`;

/** Active account = dd131 item[0] points at list entry 1 ('Yes'), compared
 * under the locator law (loose section_id: stored '1' matches 1). Root (-1) is
 * excluded upstream (ids > 0), so no root carve-out is needed here. */
function isActiveAccount(row: UserRow): boolean {
	const item = row.relation?.[ACTIVE_ACCOUNT_COMPONENT]?.[0];
	if (item === null || typeof item !== 'object') return false;
	return compareLocators(item as Locator, { section_id: 1 } as Locator, ['section_id']);
}

/** The validated email on the user record (dd134), or null. */
function userEmail(row: UserRow): string | null {
	const raw = row.string?.[EMAIL_COMPONENT]?.[0]?.value;
	if (typeof raw !== 'string') return null;
	const email = cleanEmail(raw);
	return email !== '' && isValidEmail(email) ? email : null;
}

/**
 * Resolve a username-or-email identifier to exactly ONE active user (id > 0)
 * with a valid email. Zero, multiple, inactive, or email-less matches all
 * return null so the caller treats them as an indistinguishable no-op.
 */
async function resolveSingleTarget(
	identifier: string,
): Promise<{ userId: number; email: string } | null> {
	const candidates = new Map<number, UserRow>();

	// Username lookup (jsonb containment, parameterized — the auth.ts pattern,
	// but ALL matches so a duplicate-username situation is detected and refused).
	const byName = (await sql.unsafe(USER_ROW_SELECT, [
		USERS_SECTION_TIPO,
		USERNAME_COMPONENT,
		JSON.stringify([{ value: identifier }]),
	])) as UserRow[];
	for (const row of byName) {
		if (row.section_id > 0) candidates.set(row.section_id, row);
	}

	// Email lookup, when the identifier is itself a valid address (PHP
	// get_users_with_email matches the lang-stamped item shape).
	const asEmail = cleanEmail(identifier);
	if (asEmail !== '' && isValidEmail(asEmail)) {
		const byEmail = (await sql.unsafe(USER_ROW_SELECT, [
			USERS_SECTION_TIPO,
			EMAIL_COMPONENT,
			JSON.stringify([{ value: asEmail }]),
		])) as UserRow[];
		for (const row of byEmail) {
			if (row.section_id > 0) candidates.set(row.section_id, row);
		}
	}

	const qualified: { userId: number; email: string }[] = [];
	for (const row of candidates.values()) {
		if (!isActiveAccount(row)) continue;
		const email = userEmail(row);
		if (email === null) continue;
		qualified.push({ userId: row.section_id, email });
	}

	return qualified.length === 1 ? (qualified[0] as { userId: number; email: string }) : null;
}

/**
 * Step 1: resolve the identifier, store a one-time code (hash only) and email
 * it. ALWAYS returns the same generic response so the caller cannot tell
 * whether an account exists.
 */
export async function requestPasswordReset(
	identifier: string,
	clientIp: string,
): Promise<RequestResetResponse> {
	const trimmed = identifier.trim();

	// reset_id is generated up-front so the response shape is identical on every
	// path; it only becomes meaningful when an entry is actually stored below.
	const resetId = generateResetId();
	const response: RequestResetResponse = {
		result: true,
		msg: 'If an account matches, a recovery code has been sent to its email address.',
		reset_id: resetId,
	};

	// Too short to be a real username or email → no-op.
	if (trimmed.length < 2) {
		await normalizeTiming(trimmed);
		return response;
	}

	// Request throttle (per identifier + trusted IP). When locked we still
	// return the generic OK but skip resolution/sending entirely — and spend the
	// same decoy verify so a throttled identifier is not observably faster.
	const throttleKey = buildThrottleKey('pwreset_req', trimmed, clientIp);
	if (isThrottled(throttleKey)) {
		console.error('[password_reset] request throttled');
		await normalizeTiming(trimmed);
		return response;
	}
	recordFailedAttempt(throttleKey);

	const resolved = await resolveSingleTarget(trimmed);
	if (resolved === null) {
		await normalizeTiming(trimmed);
		return response;
	}

	// Generate + store the code (only its Argon2id digest is persisted).
	const code = generateCode();
	const ttlSeconds = readNumber('DEDALO_PWRESET_CODE_TTL');
	try {
		storePasswordReset(
			resetId,
			resolved.userId,
			await Bun.password.hash(code, { algorithm: 'argon2id' }),
			ttlSeconds,
		);
	} catch (error) {
		// Storage unavailable: behave as a no-op (never send a code the confirm
		// step could not verify).
		console.error('[password_reset] could not persist reset entry:', error);
		return response;
	}

	const mailResult = await sendMail({
		to: resolved.email,
		subject: 'Your Dédalo password recovery code',
		bodyText: buildEmailBody(code, Math.ceil(ttlSeconds / 60)),
	});
	if (!mailResult.result) {
		// Logged, never surfaced (anti-enumeration). The mailer already logged
		// the transport detail; never log the code or the address value here.
		console.error('[password_reset] mailer failed:', mailResult.errors.join(', '));
	}

	console.warn(`[password_reset] recovery code issued for user_id=${resolved.userId}`);

	return response;
}

/** Write the new password through the ONE write engine: saveComponentData
 * funnels component_password through the Argon2id hashing gate, holds the
 * S1-02 row lock and appends the TM audit row. The modification is attributed
 * to the user themself (PHP parity — they are resetting their own password). */
async function resetUserPassword(userId: number, plaintext: string): Promise<boolean> {
	try {
		const { saveComponentData } = await import('../section/record/save_component.ts');
		const result = await saveComponentData({
			componentTipo: PASSWORD_COMPONENT,
			sectionTipo: USERS_SECTION_TIPO,
			sectionId: userId,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', value: [{ id: 1, value: plaintext, lang: 'lg-nolan' }] }],
			userId,
		});
		if (!result.ok) {
			console.error(`[password_reset] save failed for user_id=${userId}: ${result.message}`);
		}
		return result.ok;
	} catch (error) {
		console.error(`[password_reset] save threw for user_id=${userId}:`, error);
		return false;
	}
}

/** Best-effort "your password was changed" notice; failures logged, swallowed. */
async function sendPasswordChangedNotice(userId: number): Promise<void> {
	const rows = (await sql.unsafe(
		`SELECT section_id, string, relation FROM matrix_users
		 WHERE section_tipo = $1 AND section_id = $2`,
		[USERS_SECTION_TIPO, userId],
	)) as UserRow[];
	const row = rows[0];
	if (row === undefined) return;
	const email = userEmail(row);
	if (email === null) return;
	const mailResult = await sendMail({
		to: email,
		subject: 'Your Dédalo password was changed',
		bodyText: buildPasswordChangedBody(),
	});
	if (!mailResult.result) {
		console.error('[password_reset] notice email failed:', mailResult.errors.join(', '));
	}
}

/**
 * Step 2: verify the code against the stored hash and, on success, write the
 * new password. Failure responses are deliberately generic; the only specific
 * error is 'weak_password' (the user's own input, does not consume an attempt).
 */
export async function confirmPasswordReset(
	resetId: string,
	code: string,
	newPassword: string,
	clientIp: string,
): Promise<ConfirmResetResponse> {
	const invalidOrExpired: ConfirmResetResponse = {
		result: false,
		msg: 'Invalid or expired code.',
		errors: ['invalid_or_expired'],
	};
	const tooManyAttempts: ConfirmResetResponse = {
		result: false,
		msg: 'Too many attempts. Please request a new code.',
		errors: ['too_many_attempts'],
	};

	if (!isValidResetId(resetId)) {
		return invalidOrExpired;
	}

	// Verify throttle (per reset_id + trusted IP).
	const throttleKey = buildThrottleKey('pwreset_verify', resetId, clientIp);
	if (isThrottled(throttleKey)) {
		return tooManyAttempts;
	}

	// Missing or expired → generic invalid_or_expired (cleaning up any residue).
	const entry = loadPasswordReset(resetId);
	if (entry === null || entry.expires < Math.floor(Date.now() / 1000)) {
		deletePasswordReset(resetId);
		return invalidOrExpired;
	}

	// Validate the new password BEFORE consuming a verify attempt: a weak
	// password is the user's own input problem, not a wrong-code guess.
	if (newPassword.length < MIN_PASSWORD_LENGTH) {
		return {
			result: false,
			msg: `Password too short. Use at least ${MIN_PASSWORD_LENGTH} characters.`,
			errors: ['weak_password'],
		};
	}

	const maxAttempts = readNumber('DEDALO_PWRESET_MAX_ATTEMPTS');
	const verified =
		entry.codeHash !== '' && (await Bun.password.verify(code.trim(), entry.codeHash));
	if (!verified) {
		// Wrong code: count the attempt against this code and against the IP.
		recordFailedAttempt(throttleKey);
		const attempts = incrementPasswordResetAttempts(resetId);
		if (attempts >= maxAttempts) {
			deletePasswordReset(resetId);
			return tooManyAttempts;
		}
		return invalidOrExpired;
	}

	// Correct code: write the new password and burn the code.
	const saved = await resetUserPassword(entry.userId, newPassword);
	deletePasswordReset(resetId);
	clearAttempts(throttleKey);

	if (!saved) {
		return {
			result: false,
			msg: 'Could not update the password. Please try again later.',
			errors: ['reset_failed'],
		};
	}

	console.warn(`[password_reset] password reset completed for user_id=${entry.userId}`);

	// HARDENING (divergence from PHP, wire-invisible): revoke every existing
	// session of this user — a reset must also cut off whoever holds a stolen
	// token, or the recovery flow cannot recover a compromised account.
	destroyUserSessions(entry.userId);

	// Notify the account owner so an unauthorized reset is noticed. Best-effort.
	await sendPasswordChangedNotice(entry.userId);

	return {
		result: true,
		msg: 'Your password has been updated. You can now log in.',
		errors: [],
	};
}
