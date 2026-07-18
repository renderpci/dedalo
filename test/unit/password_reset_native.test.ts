/**
 * Password recovery — TS-native write-path contract (DEC-14b twin of the frozen
 * PHP core/password_reset/class.password_reset.php; the wire shapes asserted
 * here are what the copied client consumes — render_login.js reset handlers).
 *
 * Needs the DB: a SCRATCH user record is inserted into matrix_users (unique
 * username/email, deleted in afterAll together with its TM audit rows). The
 * mailer module is mocked (no network) and captures every send so the test can
 * extract the emailed code. Runs under the bunfig [test] preload (scratch
 * DEDALO_SESSION_DB_PATH), so the session-store wipe is safe.
 */

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';
import {
	deleteMatrixRecord,
	insertMatrixRecordWithCounter,
} from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import * as realMailerModule from '../../src/core/mailer/mailer.ts';
import {
	createSession,
	getSession,
	loadPasswordReset,
	resetSessionStoreForTests,
	storePasswordReset,
} from '../../src/core/security/session_store.ts';

// Capture the REAL module ONCE; mock.restore() does NOT revert mock.module, so
// afterAll re-installs it (the code_update.test.ts pattern — without this the
// mocked mailer leaks into other suites).
const REAL_MAILER = { ...realMailerModule };

/** Every sendMail call the flow makes, captured for code extraction. */
const sentMails: { to: string; subject: string; bodyText: string }[] = [];
let mailerResult = { result: true, msg: 'OK. Mail sent', errors: [] as string[] };

mock.module('../../src/core/mailer/mailer.ts', () => ({
	...REAL_MAILER,
	sendMail: async (options: { to: string; subject: string; bodyText: string }) => {
		sentMails.push({ to: options.to, subject: options.subject, bodyText: options.bodyText });
		return { ...mailerResult, errors: [...mailerResult.errors] };
	},
}));

// Imported AFTER the mock is installed so the flow sees the captured mailer.
const { confirmPasswordReset, requestPasswordReset } = await import(
	'../../src/core/security/password_reset.ts'
);

const USERS_TABLE = 'matrix_users';
const USERS_SECTION_TIPO = 'dd128';
const IP = '203.0.113.9';

// Unique per run so a crashed previous run can never collide.
const RUN_TAG = `pwreset_scratch_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
const USERNAME = RUN_TAG;
const EMAIL = `${RUN_TAG}@example.test`;
const OLD_PASSWORD = 'old_password_123';
const NEW_PASSWORD = 'brand_new_password_9';

/** The dd131 'active account' locator as real user records carry it. */
const ACTIVE_LOCATOR = {
	id: 1,
	type: 'dd151',
	section_id: '1',
	section_tipo: 'dd64',
	from_component_tipo: 'dd131',
};

function userColumns(username: string, email: string, activeSectionId: string) {
	return {
		string: {
			dd132: [{ id: 1, lang: 'lg-nolan', value: username }],
			dd133: [{ id: 1, lang: 'lg-nolan', value: '' }], // hashed in beforeAll
			dd134: [{ id: 1, lang: 'lg-nolan', value: email }],
		},
		relation: {
			dd131: [{ ...ACTIVE_LOCATOR, section_id: activeSectionId }],
		},
	};
}

let scratchUserId = 0;
let inactiveUserId = 0;

async function storedPasswordHash(sectionId: number): Promise<string> {
	const rows = (await sql.unsafe(
		`SELECT string->'dd133'->0->>'value' AS hash FROM matrix_users
		 WHERE section_tipo = $1 AND section_id = $2`,
		[USERS_SECTION_TIPO, sectionId],
	)) as { hash: string | null }[];
	return rows[0]?.hash ?? '';
}

async function cleanupScratchUser(sectionId: number): Promise<void> {
	if (sectionId <= 0) return;
	await deleteMatrixRecord(USERS_TABLE, USERS_SECTION_TIPO, sectionId);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		USERS_SECTION_TIPO,
		sectionId,
	]);
}

/** Request a code for the scratch user and return {resetId, code} from the capture. */
async function requestCode(): Promise<{ resetId: string; code: string }> {
	sentMails.length = 0;
	const response = await requestPasswordReset(USERNAME, IP);
	expect(sentMails).toHaveLength(1);
	const code = /Your recovery code is: (\d{8})/.exec(sentMails[0]?.bodyText ?? '')?.[1];
	if (code === undefined) throw new Error('no code in captured email');
	return { resetId: response.reset_id, code };
}

beforeAll(async () => {
	const oldHash = await Bun.password.hash(OLD_PASSWORD, { algorithm: 'argon2id' });
	const active = userColumns(USERNAME, EMAIL, '1');
	(active.string.dd133[0] as { value: string }).value = oldHash;
	scratchUserId = await insertMatrixRecordWithCounter(USERS_TABLE, USERS_SECTION_TIPO, active);

	// A second, INACTIVE user (dd131 → 'No') for the anti-enumeration cases.
	const inactive = userColumns(`${RUN_TAG}_inactive`, `${RUN_TAG}_inactive@example.test`, '2');
	(inactive.string.dd133[0] as { value: string }).value = oldHash;
	inactiveUserId = await insertMatrixRecordWithCounter(USERS_TABLE, USERS_SECTION_TIPO, inactive);
});

afterAll(async () => {
	mock.module('../../src/core/mailer/mailer.ts', () => REAL_MAILER);
	mock.restore();
	await cleanupScratchUser(scratchUserId);
	await cleanupScratchUser(inactiveUserId);
});

afterEach(() => {
	sentMails.length = 0;
	mailerResult = { result: true, msg: 'OK. Mail sent', errors: [] };
	resetSessionStoreForTests();
});

describe('requestPasswordReset — anti-enumeration', () => {
	test('nonexistent identifier: generic OK shape, fresh reset_id, zero mails', async () => {
		const response = await requestPasswordReset(`${RUN_TAG}_nobody`, IP);
		expect(response.result).toBe(true);
		expect(response.reset_id).toMatch(/^[0-9a-f]{32}$/);
		expect(response.msg).toBe(
			'If an account matches, a recovery code has been sent to its email address.',
		);
		expect(sentMails).toHaveLength(0);
		// Nothing was stored — the confirm step must treat the id as unknown.
		const confirm = await confirmPasswordReset(response.reset_id, '12345678', NEW_PASSWORD, IP);
		expect(confirm.errors).toEqual(['invalid_or_expired']);
	});

	test('inactive account: byte-identical generic shape, zero mails', async () => {
		const response = await requestPasswordReset(`${RUN_TAG}_inactive`, IP);
		expect(response.result).toBe(true);
		expect(response.reset_id).toMatch(/^[0-9a-f]{32}$/);
		expect(sentMails).toHaveLength(0);
	});

	test('too-short identifier: generic shape, zero mails', async () => {
		const response = await requestPasswordReset('x', IP);
		expect(response.result).toBe(true);
		expect(sentMails).toHaveLength(0);
	});
});

describe('happy path', () => {
	test('request emails a code; confirm rewrites dd133 and evicts sessions', async () => {
		// A live session that MUST die with the reset (the hardening divergence).
		const stolenToken = createSession(scratchUserId, USERNAME, false);
		expect(getSession(stolenToken)).not.toBeNull();

		const { resetId, code } = await requestCode();
		expect(sentMails[0]?.to).toBe(EMAIL);
		expect(sentMails[0]?.subject).toBe('Your Dédalo password recovery code');

		sentMails.length = 0;
		const confirm = await confirmPasswordReset(resetId, code, NEW_PASSWORD, IP);
		expect(confirm).toEqual({
			result: true,
			msg: 'Your password has been updated. You can now log in.',
			errors: [],
		});

		// The stored value is a FRESH Argon2id hash of the new password.
		const hash = await storedPasswordHash(scratchUserId);
		expect(hash.startsWith('$argon2')).toBe(true);
		expect(await Bun.password.verify(NEW_PASSWORD, hash)).toBe(true);
		expect(await Bun.password.verify(OLD_PASSWORD, hash)).toBe(false);

		// The entry is burned: the same code can never be replayed.
		expect(loadPasswordReset(resetId)).toBeNull();
		const replay = await confirmPasswordReset(resetId, code, NEW_PASSWORD, IP);
		expect(replay.errors).toEqual(['invalid_or_expired']);

		// Session eviction (wire-invisible hardening — WIRE_CONTRACT entry).
		expect(getSession(stolenToken)).toBeNull();

		// The owner was notified that the password changed.
		expect(sentMails).toHaveLength(1);
		expect(sentMails[0]?.subject).toBe('Your Dédalo password was changed');
	});

	test('the identifier may be the EMAIL as well as the username', async () => {
		sentMails.length = 0;
		await requestPasswordReset(EMAIL, IP);
		expect(sentMails).toHaveLength(1);
		expect(sentMails[0]?.to).toBe(EMAIL);
	});
});

describe('confirm guards', () => {
	test('malformed reset_id shapes are rejected without touching the store', async () => {
		for (const bad of ['', 'short', 'A'.repeat(32), 'g'.repeat(32), 'a'.repeat(31)]) {
			const response = await confirmPasswordReset(bad, '12345678', NEW_PASSWORD, IP);
			expect(response.result).toBe(false);
			expect(response.errors).toEqual(['invalid_or_expired']);
		}
	});

	test('weak password refuses WITHOUT consuming the code, which still works after', async () => {
		const { resetId, code } = await requestCode();
		const weak = await confirmPasswordReset(resetId, code, 'short', IP);
		expect(weak.errors).toEqual(['weak_password']);
		expect(weak.msg).toBe('Password too short. Use at least 8 characters.');
		expect(loadPasswordReset(resetId)?.attempts).toBe(0);

		const ok = await confirmPasswordReset(resetId, code, NEW_PASSWORD, IP);
		expect(ok.result).toBe(true);
	});

	test('wrong codes hit the attempt cap; then even the correct code fails', async () => {
		const { resetId, code } = await requestCode();
		const wrongCode = code === '00000000' ? '00000001' : '00000000';

		// Attempts 1..4 → generic invalid_or_expired; the 5th (the cap) burns it.
		for (let attempt = 1; attempt <= 4; attempt++) {
			const response = await confirmPasswordReset(resetId, wrongCode, NEW_PASSWORD, IP);
			expect(response.errors).toEqual(['invalid_or_expired']);
		}
		const capped = await confirmPasswordReset(resetId, wrongCode, NEW_PASSWORD, IP);
		expect(capped.errors).toEqual(['too_many_attempts']);
		expect(loadPasswordReset(resetId)).toBeNull();

		const afterCap = await confirmPasswordReset(resetId, code, NEW_PASSWORD, IP);
		expect(afterCap.result).toBe(false);
	});

	test('an expired entry is refused and cleaned up', async () => {
		const resetId = 'ab'.repeat(16);
		const codeHash = await Bun.password.hash('12345678', { algorithm: 'argon2id' });
		storePasswordReset(resetId, scratchUserId, codeHash, 0); // expires this second
		await Bun.sleep(1100);
		const response = await confirmPasswordReset(resetId, '12345678', NEW_PASSWORD, IP);
		expect(response.errors).toEqual(['invalid_or_expired']);
		expect(loadPasswordReset(resetId)).toBeNull();
	});
});

describe('mailer (real module, no network)', () => {
	test('unconfigured SMTP host refuses without sending', async () => {
		// The suite env carries no DEDALO_SMTP_HOST, so the real sendMail must
		// refuse up-front — this is the hermetic no-config guard.
		const response = await REAL_MAILER.sendMail({
			to: 'someone@example.test',
			subject: 'x',
			bodyText: 'y',
		});
		expect(response.result).toBe(false);
		expect(response.errors).toEqual(['mailer_not_configured']);
	});

	test('email helpers strip header-injection payloads', () => {
		expect(REAL_MAILER.cleanEmail('a@b.co\r\nBcc: evil@x.y')).toBe('a@b.coBcc: evil@x.y');
		expect(REAL_MAILER.isValidEmail('a@b.co')).toBe(true);
		expect(REAL_MAILER.isValidEmail('not-an-email')).toBe(false);
		expect(REAL_MAILER.cleanEmail('Name <a@b.co>')).toBe('a@b.co');
	});
});
