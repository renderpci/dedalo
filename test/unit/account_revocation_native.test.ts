/**
 * ENDING AN ACCOUNT ENDS ITS ACCESS (P1-4 — closes SEC-07, SEC-08, SEC-09, SEC-14,
 * SEC-15).
 *
 * Before this gate the engine had no concept of revocation. Three stores held a live
 * credential for one account and none of them was reached by the transitions that were
 * supposed to end it:
 *
 *   - the SESSIONS table. `endUserSessions` had exactly two production callers — the
 *     `DEDALO_SINGLE_SESSION` path (default OFF) and self-service password recovery. So
 *     deleting a user, or changing their password from the admin form, terminated
 *     nothing: "this account is compromised, change its password" is the standard
 *     operator reflex and it revoked NOTHING.
 *   - the MEDIA MARKER set. The credential is a zero-byte file the WEB SERVER stat()s;
 *     no engine process is in the media byte path, so unlinking it is the ONLY thing
 *     that can revoke the cookie. `getSession` expired sessions with the bare destroy
 *     its own docblock warns about, twice, with no automatic collector — an expired
 *     session kept read access to the entire digitised archive, permanently.
 *   - the PENDING RECOVERY CODES. Nothing deleted them on a deletion, a deactivation or
 *     a competing password change.
 *
 * And the flag an operator actually reaches for did nothing at all: an account
 * deactivated with dd131 'Active account' = No STILL LOGGED IN. `ACTIVE_ACCOUNT_COMPONENT`
 * appeared in exactly one non-test file — the password RECOVERY path — so recovery
 * honoured the flag and login did not.
 *
 * THE MATRIX below is transitions × survivals. It is TOTAL over the transition set by
 * DERIVATION, not by hand: the component-keyed rows are checked against
 * `ACCOUNT_TRANSITION_COMPONENTS` (the set `invalidatePermissionsForWrite` fires the
 * seam for) so a new trigger cannot be added to the engine without a row here, and a row
 * cannot name a component the engine does not treat as a transition.
 *
 * "A SUBSEQUENT LOGIN IS REFUSED" is stated per row rather than assumed, because it is
 * not true of every transition and pretending otherwise would be the vacuity this
 * programme exists to remove: a demotion does not revoke the password (it revokes the
 * SESSION, which is the only place `is_global_admin` is snapshotted — SEC-14), and a
 * password change lets the account back in with the NEW password. Each row declares the
 * outcome it means and the matrix asserts THAT.
 */
// Generic `test` TLD only (AGENTS.md): the situation is BUILT here — scratch dd128
// records inserted through the counter-allocating writer and deleted in afterAll. The
// dd128/dd131/dd133/dd244/dd64 tipos are seed-shipped (every installation has them) and
// have no `test` twin.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentServicePrincipal } from '../../src/ai/mcp/server.ts';
import { coreApiActions } from '../../src/core/api/handlers/dd_core_api.ts';
import {
	deleteMatrixRecord,
	insertMatrixRecordWithCounter,
} from '../../src/core/db/matrix_write.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import {
	layAuthMarker,
	MARKER_REAP_GRACE_MS,
	overrideMediaProtectionPathsForTests,
} from '../../src/core/media/protection.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { persistRecordKeys } from '../../src/core/section_record/index.ts';
import { ARGON2_OPTIONS } from '../../src/core/security/argon2_params.ts';
import { login } from '../../src/core/security/auth.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { runWithRequestContext } from '../../src/core/security/request_context.ts';
import {
	ACCOUNT_TRANSITION_COMPONENTS,
	runWithoutAccountRevocation,
} from '../../src/core/security/revocation.ts';
import {
	startExpiredSessionSweeper,
	stopExpiredSessionSweeper,
	sweepExpiredSessions,
} from '../../src/core/security/session_media.ts';
import {
	ageSessionForTests,
	createSession,
	destroySession,
	destroyUserSessionsDetail,
	getSession,
	loadPasswordReset,
	pruneExpiredSessionsDetail,
	resetSessionStoreForTests,
	storePasswordReset,
} from '../../src/core/security/session_store.ts';
import { markMediaRoot } from '../helpers/media_scratch_root.ts';

const USERS_TABLE = 'matrix_users';
const USERS = 'dd128';
const ACTIVE_ACCOUNT = 'dd131';
const USERNAME = 'dd132';
const PASSWORD = 'dd133';
const GLOBAL_ADMIN = 'dd244';
/** dd64 yes/no list: entry 1 = Yes, entry 2 = No (read out of matrix_dd.string.dd62). */
const YES = 1;
const NO = 2;

const RUN_TAG = `revocation_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;
const PASSPHRASE = 'scratch_revocation_password_42';

let scratch = '';
let authDir = '';
let superuser: Principal;
/** Every scratch dd128 id this file created, for the afterAll sweep. */
const created: number[] = [];

/** A dd64 yes/no radio locator for one of the flag components. */
function flagLocator(componentTipo: string, entry: number) {
	return {
		id: 1,
		type: 'dd151',
		section_id: String(entry),
		section_tipo: 'dd64',
		from_component_tipo: componentTipo,
	};
}

/** A scratch user with a REAL Argon2id credential, active by default. */
async function insertUser(options: {
	username: string;
	/** Below-target cost, to exercise the login-time rehash. */
	weakHash?: boolean;
	active?: number;
	globalAdmin?: boolean;
}): Promise<number> {
	const hash = await Bun.password.hash(
		PASSPHRASE,
		options.weakHash === true
			? { algorithm: 'argon2id', memoryCost: ARGON2_OPTIONS.memoryCost, timeCost: 2 }
			: ARGON2_OPTIONS,
	);
	const relation: Record<string, unknown[]> = {
		[ACTIVE_ACCOUNT]: [flagLocator(ACTIVE_ACCOUNT, options.active ?? YES)],
	};
	if (options.globalAdmin === true) relation[GLOBAL_ADMIN] = [flagLocator(GLOBAL_ADMIN, YES)];
	const id = await insertMatrixRecordWithCounter(USERS_TABLE, USERS, {
		relation,
		string: {
			[USERNAME]: [{ id: 1, lang: 'lg-nolan', value: options.username }],
			[PASSWORD]: [{ id: 1, lang: 'lg-nolan', value: hash }],
		},
		data: { label: RUN_TAG, section_tipo: USERS, created_by_user_id: -1 },
	});
	created.push(id);
	clearPrincipalCache();
	clearPermissionsCache();
	clearUserProjectsCache();
	return id;
}

/** A unique username per call — the login throttle is keyed by username. */
let usernameCounter = 0;
function nextUsername(): string {
	usernameCounter += 1;
	return `${RUN_TAG}_u${String(usernameCounter)}`;
}

interface LiveSession {
	token: string;
	mediaKey: string;
}

/** Log in for real and return the two credentials the login issued. */
async function loginAs(username: string, password = PASSPHRASE): Promise<LiveSession> {
	const result = await login(username, password, '127.0.0.1');
	expect(result.ok, `login(${username}) should have succeeded: ${result.message}`).toBe(true);
	expect(result.sessionToken).toBeDefined();
	// Media protection is ON in this file's scratch root, so a login that issued no
	// media key would silently make every "the marker is gone" assertion vacuous.
	expect(result.mediaAuthCookieValue, 'login issued no media credential').toMatch(
		/^[a-f0-9]{128}$/,
	);
	return {
		token: result.sessionToken as string,
		mediaKey: result.mediaAuthCookieValue as string,
	};
}

/** The stored Argon2 hash for a username — the positive control for a rollback. */
async function storedPasswordHash(username: string): Promise<string | null> {
	const rows = (await sql.unsafe(
		`SELECT string->$3->0->>'value' AS hash FROM matrix_users
		 WHERE section_tipo = $1 AND string->$4 @> $2::text::jsonb`,
		[USERS, JSON.stringify([{ value: username }]), PASSWORD, USERNAME],
	)) as { hash: string | null }[];
	return rows[0]?.hash ?? null;
}

/** Everything that still authenticates for this account, after a transition. */
function liveCredentials(session: LiveSession): { session: boolean; marker: boolean } {
	return {
		session: getSession(session.token) !== null,
		marker: existsSync(join(authDir, session.mediaKey)),
	};
}

/** Drive the REAL save door as the superuser (what an admin form does). */
async function saveAsAdmin(
	sectionId: number,
	componentTipo: string,
	value: unknown[],
): Promise<void> {
	const handler = coreApiActions.save;
	if (!handler) throw new Error("dd_core_api has no 'save' action registered");
	const response = await handler(
		{
			source: {
				tipo: componentTipo,
				section_tipo: USERS,
				section_id: sectionId,
				lang: 'lg-nolan',
			},
			data: { changed_data: [{ action: 'set_data', value }] },
		} as unknown as Parameters<typeof handler>[0],
		{
			principal: superuser,
			session: { userId: -1 },
			clientIp: '127.0.0.1',
			requestId: RUN_TAG,
		} as unknown as Parameters<typeof handler>[1],
	);
	expect(response.status).toBe(200);
}

/** Drive the REAL delete door as the superuser. */
async function deleteRecordAsAdmin(sectionId: number): Promise<void> {
	const handler = coreApiActions.delete;
	if (!handler) throw new Error("dd_core_api has no 'delete' action registered");
	const response = await handler(
		{
			source: { section_tipo: USERS, section_id: sectionId, delete_mode: 'delete_record' },
		} as unknown as Parameters<typeof handler>[0],
		{
			principal: superuser,
			session: { userId: -1 },
			clientIp: '127.0.0.1',
			requestId: RUN_TAG,
		} as unknown as Parameters<typeof handler>[1],
	);
	expect(response.status).toBe(200);
}

beforeAll(async () => {
	superuser = await resolvePrincipal(-1);
});

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'dedalo_revocation_'));
	markMediaRoot(join(scratch, 'media'));
	overrideMediaProtectionPathsForTests({
		mediaRoot: join(scratch, 'media'),
		authStorePath: join(scratch, 'private', 'media_auth.json'),
	});
	setServerState({ media_access_mode: 'private' });
	authDir = join(scratch, 'media', '.publication', 'auth');
	resetSessionStoreForTests();
});

afterEach(() => {
	setServerState({ media_access_mode: null });
	overrideMediaProtectionPathsForTests(null);
	rmSync(scratch, { recursive: true, force: true });
});

afterAll(async () => {
	for (const id of created) {
		await deleteMatrixRecord(USERS_TABLE, USERS, id);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[USERS, id],
		);
	}
	await sql.unsafe("DELETE FROM matrix_activity WHERE data->>'username' LIKE $1", [`${RUN_TAG}%`]);
});

// ---------------------------------------------------------------------------
// THE MATRIX
// ---------------------------------------------------------------------------

/** What a pre-transition PASSWORD is expected to do afterwards. */
type LoginAfter =
	/** The credential no longer authenticates at all. */
	| 'refused'
	/** It still authenticates — the transition revoked the SESSION, not the password. */
	| 'allowed';

interface TransitionRow {
	id: string;
	/** The dd128 component whose write IS the transition; null for a record-level one. */
	component: string | null;
	/** Apply it through a real door. */
	apply: (userId: number) => Promise<void>;
	loginAfter: LoginAfter;
	why: string;
}

const TRANSITIONS: TransitionRow[] = [
	{
		id: 'deactivate (dd131 = No)',
		component: ACTIVE_ACCOUNT,
		apply: async (userId) => {
			await saveAsAdmin(userId, ACTIVE_ACCOUNT, [flagLocator(ACTIVE_ACCOUNT, NO)]);
		},
		loginAfter: 'refused',
		why: "the operator's only NON-DESTRUCTIVE revocation; it used to be a total no-op",
	},
	{
		id: 'rename (dd132 username)',
		component: USERNAME,
		apply: async (userId) => {
			await saveAsAdmin(userId, USERNAME, [
				{ id: 1, lang: 'lg-nolan', value: `${RUN_TAG}_renamed_${String(userId)}` },
			]);
		},
		loginAfter: 'refused',
		why: 'the session row carries the username; a rename is a new identity',
	},
	{
		id: 'admin password change (dd133, by someone else)',
		component: PASSWORD,
		apply: async (userId) => {
			await saveAsAdmin(userId, PASSWORD, [
				{ id: 1, lang: 'lg-nolan', value: 'a_new_scratch_password_77' },
			]);
		},
		loginAfter: 'refused',
		why: '"this account is compromised, change its password" — the reflex that revoked nothing',
	},
	{
		id: 'demote (dd244 = No)',
		component: GLOBAL_ADMIN,
		apply: async (userId) => {
			await saveAsAdmin(userId, GLOBAL_ADMIN, [flagLocator(GLOBAL_ADMIN, NO)]);
		},
		loginAfter: 'allowed',
		why: 'is_global_admin is SNAPSHOTTED on the session row (SEC-14); only ending the session can reach the two routes that read it',
	},
	{
		id: 'delete the user record',
		component: null,
		apply: async (userId) => {
			await deleteRecordAsAdmin(userId);
		},
		loginAfter: 'refused',
		why: 'the session still resolved and the re-resolved Principal was not zero-access',
	},
];

describe('the transition census is TOTAL, by derivation', () => {
	test('every component the engine treats as a transition has a row (and no row invents one)', () => {
		const covered = new Set(
			TRANSITIONS.map((row) => row.component).filter((tipo): tipo is string => tipo !== null),
		);
		expect([...covered].sort()).toEqual([...ACCOUNT_TRANSITION_COMPONENTS].sort());
	});

	test('the record-level transition (delete) is present too', () => {
		expect(TRANSITIONS.some((row) => row.component === null)).toBe(true);
	});

	test('the store — not a caller, not a hook — owns the marker unlink', () => {
		// The unlink used to be a REGISTERED hook that session_media wired at module
		// load, which is vacuous in exactly the process that matters: one that expires a
		// session without having imported the registering module revokes nothing and
		// only logs about it. `session_store.ts` now imports `dropAuthMarker` directly,
		// so the unlink is unconditionally present wherever a session can be read.
		const source = readFileSync(
			join(import.meta.dir, '../../src/core/security/session_store.ts'),
			'utf8',
		);
		expect(source).toContain("import { dropAuthMarker } from '../media/protection.ts';");
		// And the fail-OPEN idiom is gone: nothing here frees a credential by deleting
		// the row that names it. (A RATCHET, secondary to the behavioural legs below —
		// the order itself is proved by driving the bare store functions.)
		expect(source).not.toMatch(/DELETE FROM sessions[^']*RETURNING media_key/);
	});
});

describe('transitions × survivals', () => {
	for (const row of TRANSITIONS) {
		test(`${row.id}: session gone, marker gone, reset row gone, login ${row.loginAfter} — ${row.why}`, async () => {
			const username = nextUsername();
			const userId = await insertUser({ username, globalAdmin: true });
			const session = await loginAs(username);
			// A pending recovery code, in flight at the moment of the transition.
			const resetId = `${'a'.repeat(24)}${String(userId).padStart(8, '0')}`.slice(0, 32);
			storePasswordReset(resetId, userId, await Bun.password.hash('12345678', ARGON2_OPTIONS), 600);
			// Positive control: everything is live BEFORE the transition, or the
			// assertions below would prove nothing.
			expect(liveCredentials(session)).toEqual({ session: true, marker: true });
			expect(loadPasswordReset(resetId)).not.toBeNull();

			await row.apply(userId);

			expect(liveCredentials(session)).toEqual({ session: false, marker: false });
			expect(loadPasswordReset(resetId)).toBeNull();

			const after = await login(username, PASSPHRASE, '127.0.0.1');
			expect(after.ok).toBe(row.loginAfter === 'allowed');
		});
	}
});

describe('the self password change keeps the acting session and kills every other', () => {
	test('a curator changing their own password is not logged out of the tab they are in', async () => {
		// Killing the session someone is using to change their own password is hostile
		// and teaches people not to change passwords. Leaving every OTHER session alive
		// is precisely the compromise case, because "someone else is logged in as me" is
		// why the password is being changed.
		const username = nextUsername();
		const userId = await insertUser({ username });
		const acting = await loginAs(username);
		const otherDevice = await loginAs(username);

		const actingSession = getSession(acting.token);
		expect(actingSession).not.toBeNull();
		const principal = await resolvePrincipal(userId);
		await runWithRequestContext(
			{ principal, session: actingSession, requestId: RUN_TAG, clientIp: '127.0.0.1' },
			async () => {
				const outcome = await saveComponentData({
					componentTipo: PASSWORD,
					sectionTipo: USERS,
					sectionId: userId,
					lang: 'lg-nolan',
					changedData: [
						{ action: 'set_data', value: [{ id: 1, value: 'my_own_new_password_88' }] },
					],
					userId,
				});
				expect(outcome.ok).toBe(true);
			},
		);

		expect(liveCredentials(acting)).toEqual({ session: true, marker: true });
		expect(liveCredentials(otherDevice)).toEqual({ session: false, marker: false });
	});

	test('an ADMIN changing someone ELSE’s password keeps nothing of theirs', async () => {
		// The acting session is kept only when it belongs to the account being revoked.
		const username = nextUsername();
		const userId = await insertUser({ username });
		const victim = await loginAs(username);

		const adminName = nextUsername();
		const adminId = await insertUser({ username: adminName, globalAdmin: true });
		const adminSession = await loginAs(adminName);
		const adminLive = getSession(adminSession.token);
		expect(adminLive).not.toBeNull();

		await runWithRequestContext(
			{
				principal: await resolvePrincipal(adminId),
				session: adminLive,
				requestId: RUN_TAG,
				clientIp: '127.0.0.1',
			},
			async () => {
				await saveAsAdmin(userId, PASSWORD, [
					{ id: 1, lang: 'lg-nolan', value: 'admin_set_this_password_99' },
				]);
			},
		);

		expect(liveCredentials(victim)).toEqual({ session: false, marker: false });
		// The admin's own session is untouched — a revocation must not spill.
		expect(liveCredentials(adminSession)).toEqual({ session: true, marker: true });
	});
});

describe('a pending recovery code does not survive a deactivation (SEC-15)', () => {
	test('the code issued before the deactivation is gone, and confirm refuses it', async () => {
		const username = nextUsername();
		const userId = await insertUser({ username });
		const resetId = 'b'.repeat(32);
		storePasswordReset(resetId, userId, await Bun.password.hash('87654321', ARGON2_OPTIONS), 600);
		expect(loadPasswordReset(resetId)).not.toBeNull();

		await saveAsAdmin(userId, ACTIVE_ACCOUNT, [flagLocator(ACTIVE_ACCOUNT, NO)]);

		expect(loadPasswordReset(resetId)).toBeNull();
		const { confirmPasswordReset } = await import('../../src/core/security/password_reset.ts');
		await expect(
			confirmPasswordReset(resetId, '87654321', 'a_brand_new_password_11', '127.0.0.1'),
		).rejects.toThrow();
	});

	test('CONFIRM re-validates the account even for a row the seam never saw', async () => {
		// The belt for the window between issue and confirm, and for a row an
		// out-of-process transition could not reach: the code is stored AFTER the
		// deactivation, so nothing deleted it, and confirm must still refuse.
		const username = nextUsername();
		const userId = await insertUser({ username, active: NO });
		const resetId = 'c'.repeat(32);
		const code = '13572468';
		storePasswordReset(resetId, userId, await Bun.password.hash(code, ARGON2_OPTIONS), 600);

		const { confirmPasswordReset } = await import('../../src/core/security/password_reset.ts');
		await expect(
			confirmPasswordReset(resetId, code, 'a_brand_new_password_12', '127.0.0.1'),
		).rejects.toThrow();
		// And the row is burned, so a retry cannot grind it.
		expect(loadPasswordReset(resetId)).toBeNull();
	});
});

describe('SESSION EXPIRY takes the media marker with it (SEC-09)', () => {
	test('an idle-expired session leaves NO marker behind', async () => {
		// The measured shape of the bug: session destroyed, "MARKER STILL ON DISK: true",
		// listActiveMediaKeys() []. The web server never consults the session store, so
		// the cookie kept reading the whole protected media tree — forever, since there
		// is no automatic collector.
		const username = nextUsername();
		await insertUser({ username });
		const session = await loginAs(username);
		expect(existsSync(join(authDir, session.mediaKey))).toBe(true);

		ageSessionForTests(session.token, { lastSeenSecondsAgo: 60 * 60 * 24 * 400 });

		expect(getSession(session.token)).toBeNull();
		expect(existsSync(join(authDir, session.mediaKey))).toBe(false);
	});

	test('an absolute-cap-expired session leaves NO marker behind', async () => {
		const username = nextUsername();
		await insertUser({ username });
		const session = await loginAs(username);
		// Old enough for the absolute cap, fresh enough for the idle window — so this
		// exercises the SECOND bare destroy, not the first.
		ageSessionForTests(session.token, { createdSecondsAgo: 60 * 60 * 24 * 400 });

		expect(getSession(session.token)).toBeNull();
		expect(existsSync(join(authDir, session.mediaKey))).toBe(false);
	});

	test('expiring one session never touches another', async () => {
		const first = nextUsername();
		const second = nextUsername();
		await insertUser({ username: first });
		await insertUser({ username: second });
		const expiring = await loginAs(first);
		const staying = await loginAs(second);

		ageSessionForTests(expiring.token, { lastSeenSecondsAgo: 60 * 60 * 24 * 400 });
		expect(getSession(expiring.token)).toBeNull();

		expect(existsSync(join(authDir, staying.mediaKey))).toBe(true);
		expect(getSession(staying.token)).not.toBeNull();
	});
});

describe('login consults dd131 (SEC-07)', () => {
	test('a deactivated account is refused, with the SAME ambiguous message', async () => {
		const username = nextUsername();
		await insertUser({ username, active: NO });
		const result = await login(username, PASSPHRASE, '127.0.0.1');
		expect(result.ok).toBe(false);
		expect(result.sessionToken).toBeUndefined();
		// Ambiguity is the point: a deactivated account must not be distinguishable
		// from a wrong password by an unauthenticated prober.
		const wrongPassword = await login(nextUsername(), 'not_the_password', '127.0.0.1');
		expect(result.message).toBe(wrongPassword.message);
	});

	test('an ACTIVE account still logs in — the refusal is not a blanket outage', async () => {
		const username = nextUsername();
		await insertUser({ username, active: YES });
		expect((await login(username, PASSPHRASE, '127.0.0.1')).ok).toBe(true);
	});

	test('a MISSING dd131 datum LOGS IN, loudly — the measured decision', async () => {
		// Every user this engine creates is born with dd131 absent: the shipped node has
		// no `properties.dato_default`, record_defaults.ts seeds only dato_default, the
		// client radio has no preselect, dd131 is not mandatory, and nothing in src/
		// writes it. "Missing = inactive" would therefore lock out zero EXISTING records
		// (measured: 0 absent in 99 records across two real installs) and every FUTURE
		// one. This assertion is the guard against someone "completing" the PHP parity
		// without shipping the default + the migration first.
		const username = nextUsername();
		const userId = await insertUser({ username });
		await sql.unsafe(
			'UPDATE matrix_users SET relation = relation - $3 WHERE section_tipo = $1 AND section_id = $2',
			[USERS, userId, ACTIVE_ACCOUNT],
		);
		expect((await login(username, PASSPHRASE, '127.0.0.1')).ok).toBe(true);
	});

	test('an EMPTY dd131 array is treated as missing, not as inactive', async () => {
		const username = nextUsername();
		const userId = await insertUser({ username });
		await sql.unsafe(
			`UPDATE matrix_users SET relation = jsonb_set(relation, ARRAY[$3], '[]'::jsonb)
			 WHERE section_tipo = $1 AND section_id = $2`,
			[USERS, userId, ACTIVE_ACCOUNT],
		);
		expect((await login(username, PASSPHRASE, '127.0.0.1')).ok).toBe(true);
	});
});

describe('the login-time password COST UPGRADE is not a revocation', () => {
	test('a login on a below-target hash keeps the session it just issued', async () => {
		// rehashStoredPassword writes dd133 — the seam's own trigger — with the SAME
		// plaintext, on the login path, racing createSession. Without the ALS
		// suppression this login would intermittently destroy its own session: a correct
		// password that sometimes does not log you in.
		const username = nextUsername();
		await insertUser({ username, weakHash: true });
		const session = await loginAs(username);
		// The rehash is fire-and-forget; give it room to land, then assert the session
		// (and its media marker) is still exactly where the login left it.
		for (let attempt = 0; attempt < 40; attempt++) {
			const stored = (await sql.unsafe(
				`SELECT string->$3->0->>'value' AS hash FROM matrix_users
				 WHERE section_tipo = $1 AND string->$4 @> $2::text::jsonb`,
				[USERS, JSON.stringify([{ value: username }]), PASSWORD, USERNAME],
			)) as { hash: string }[];
			if (/t=3/.test(stored[0]?.hash ?? '')) break;
			await Bun.sleep(50);
		}
		expect(liveCredentials(session)).toEqual({ session: true, marker: true });
	});

	test('INSIDE the scope a dd133 write really does not revoke — the mechanism does something', async () => {
		// The counterfactual, stated directly: without this the previous test could pass
		// because the rehash never ran, rather than because the suppression works.
		const username = nextUsername();
		const userId = await insertUser({ username });
		const session = await loginAs(username);
		await runWithoutAccountRevocation('gate: suppressed dd133 write', async () => {
			const outcome = await saveComponentData({
				componentTipo: PASSWORD,
				sectionTipo: USERS,
				sectionId: userId,
				lang: 'lg-nolan',
				changedData: [{ action: 'set_data', value: [{ id: 1, value: 'suppressed_write_66' }] }],
				userId,
			});
			expect(outcome.ok).toBe(true);
		});
		expect(liveCredentials(session)).toEqual({ session: true, marker: true });
	});

	test('the suppression is request-local: a CONCURRENT genuine change still revokes', async () => {
		// A module-level flag would leak — a real password change running while a cost
		// upgrade is in flight would silently skip its revocation. ALS cannot.
		const suppressedName = nextUsername();
		const suppressedId = await insertUser({ username: suppressedName });
		const suppressedSession = await loginAs(suppressedName);

		const genuineName = nextUsername();
		const genuineId = await insertUser({ username: genuineName });
		const genuineSession = await loginAs(genuineName);

		await Promise.all([
			runWithoutAccountRevocation('gate: concurrent suppressed write', async () => {
				await Bun.sleep(20);
				await saveComponentData({
					componentTipo: PASSWORD,
					sectionTipo: USERS,
					sectionId: suppressedId,
					lang: 'lg-nolan',
					changedData: [{ action: 'set_data', value: [{ id: 1, value: 'suppressed_race_77' }] }],
					userId: suppressedId,
				});
			}),
			saveAsAdmin(genuineId, PASSWORD, [
				{ id: 1, lang: 'lg-nolan', value: 'concurrency_probe_password_55' },
			]),
		]);

		expect(liveCredentials(suppressedSession)).toEqual({ session: true, marker: true });
		expect(liveCredentials(genuineSession)).toEqual({ session: false, marker: false });
	});
});

// ---------------------------------------------------------------------------
// THE LANE (reviewer must-fix 1) — a ROLLED-BACK transition revokes NOTHING
// ---------------------------------------------------------------------------

describe('the revocation rides the COMMIT-ONLY lane', () => {
	test('a dd133 write that ROLLS BACK leaves the session, the marker and the code alive', async () => {
		// The first shape of this seam hung off `invalidatePermissionsForWrite`, which
		// the save door queues on `deferPostTransaction` — the lane whose documented
		// contract is idempotent cache invalidation and which REPLAYS ON ROLLBACK. So an
		// admin whose password edit failed had destroyed the target's sessions anyway,
		// and the audit trail recorded an edit that never happened. The revocation is
		// destructive and non-idempotent; it belongs on `registerCommitAction`.
		const username = nextUsername();
		const userId = await insertUser({ username });
		const session = await loginAs(username);
		const resetId = 'd'.repeat(32);
		storePasswordReset(resetId, userId, await Bun.password.hash('55555555', ARGON2_OPTIONS), 600);

		const before = await storedPasswordHash(username);
		expect(before).not.toBeNull();

		await expect(
			withTransaction(async () => {
				const outcome = await saveComponentData({
					componentTipo: PASSWORD,
					sectionTipo: USERS,
					sectionId: userId,
					lang: 'lg-nolan',
					changedData: [{ action: 'set_data', value: [{ id: 1, value: 'rolled_back_pw_44' }] }],
					userId,
				});
				expect(outcome.ok).toBe(true);
				throw new Error('gate: deliberate rollback');
			}),
		).rejects.toThrow('gate: deliberate rollback');

		// The write really did roll back — without this the assertions below could pass
		// because nothing was written rather than because the lane is right.
		expect(await storedPasswordHash(username)).toBe(before);
		expect(liveCredentials(session)).toEqual({ session: true, marker: true });
		expect(loadPasswordReset(resetId)).not.toBeNull();
		// And the old password still works, which is what "revoked nothing" has to mean.
		expect((await login(username, PASSPHRASE, '127.0.0.1')).ok).toBe(true);
	});

	test('the SAME write COMMITTED does revoke — the counterfactual', async () => {
		const username = nextUsername();
		const userId = await insertUser({ username });
		const session = await loginAs(username);
		await withTransaction(async () => {
			const outcome = await saveComponentData({
				componentTipo: PASSWORD,
				sectionTipo: USERS,
				sectionId: userId,
				lang: 'lg-nolan',
				changedData: [{ action: 'set_data', value: [{ id: 1, value: 'committed_pw_45' }] }],
				userId,
			});
			expect(outcome.ok).toBe(true);
		});
		expect(liveCredentials(session)).toEqual({ session: false, marker: false });
	});
});

// ---------------------------------------------------------------------------
// THE ORDER (reviewer must-fix 2) — marker first, row second
// ---------------------------------------------------------------------------

describe('no store path frees a media credential before it can be revoked', () => {
	// Every path used to be DELETE … RETURNING media_key, with the caller looping
	// dropAuthMarker afterwards. A crash in between left NO session row and a LIVE
	// marker — and the web server never consults the session store, so that cookie kept
	// read access to the entire digitised archive, permanently, with nothing left to
	// name it. The order is now inside the store, so these tests drive the BARE store
	// functions (never session_media) and assert the marker is already gone when they
	// return. The crash window itself is not simulable in-process; what is provable is
	// that no caller is relied upon.

	test('destroySession (the bare store call) revokes the marker itself', async () => {
		const username = nextUsername();
		await insertUser({ username });
		const session = await loginAs(username);
		expect(existsSync(join(authDir, session.mediaKey))).toBe(true);

		destroySession(session.token);

		expect(getSession(session.token)).toBeNull();
		expect(existsSync(join(authDir, session.mediaKey))).toBe(false);
	});

	test('destroyUserSessionsDetail (the bare store call) revokes every marker itself', async () => {
		const username = nextUsername();
		const userId = await insertUser({ username });
		const first = await loginAs(username);
		const second = await loginAs(username);

		const detail = destroyUserSessionsDetail(userId);

		expect(detail.removed).toBe(2);
		for (const key of detail.mediaKeys) expect(existsSync(join(authDir, key))).toBe(false);
		expect(existsSync(join(authDir, first.mediaKey))).toBe(false);
		expect(existsSync(join(authDir, second.mediaKey))).toBe(false);
	});

	test('the KEPT session keeps its marker (the revocation must not spill)', async () => {
		const username = nextUsername();
		const userId = await insertUser({ username });
		const kept = await loginAs(username);
		const other = await loginAs(username);
		const keptSession = getSession(kept.token);
		expect(keptSession?.tokenHash).toBeDefined();

		destroyUserSessionsDetail(userId, undefined, keptSession?.tokenHash);

		expect(existsSync(join(authDir, kept.mediaKey))).toBe(true);
		expect(getSession(kept.token)).not.toBeNull();
		expect(existsSync(join(authDir, other.mediaKey))).toBe(false);
	});

	test('pruneExpiredSessionsDetail (the bare store call) revokes every marker itself', async () => {
		const username = nextUsername();
		await insertUser({ username });
		const session = await loginAs(username);
		ageSessionForTests(session.token, { lastSeenSecondsAgo: 60 * 60 * 24 * 400 });

		const detail = pruneExpiredSessionsDetail();

		expect(detail.pruned).toBeGreaterThanOrEqual(1);
		expect(existsSync(join(authDir, session.mediaKey))).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// THE REACH (reviewer must-fix 3) — the WRITE CHOKEPOINT, not one door
// ---------------------------------------------------------------------------

describe('the seam is reached from the record-write chokepoint', () => {
	test('persistRecordKeys — the primitive every non-API door writes through — revokes', async () => {
		// This is the door class the audit missed: tool_propagate_component_data, both
		// time-machine restore doors, tool_translation and the observer mirror all write
		// through `persistRecordKeys` and NEVER through `saveComponentData`, so they
		// reached no invalidation at all. A password rewritten by a batch propagate used
		// to leave every session of that account live.
		const username = nextUsername();
		const userId = await insertUser({ username });
		const session = await loginAs(username);
		const resetId = 'e'.repeat(32);
		storePasswordReset(resetId, userId, await Bun.password.hash('66666666', ARGON2_OPTIONS), 600);

		await persistRecordKeys(
			{ table: USERS_TABLE, sectionTipo: USERS, sectionId: userId },
			[
				{
					column: 'string',
					key: PASSWORD,
					value: [
						{
							id: 1,
							lang: 'lg-nolan',
							value: await Bun.password.hash('chokepoint_written_pw_31', ARGON2_OPTIONS),
						},
					],
				},
			],
			false,
		);

		expect(liveCredentials(session)).toEqual({ session: false, marker: false });
		expect(loadPasswordReset(resetId)).toBeNull();
	});

	test('persistRecordKeys on a NON-transition dd128 component revokes nothing', async () => {
		// The seam is component-scoped, not section-scoped: a profile assignment
		// (dd1725) re-resolves per request through the caches this same reaction drops,
		// so ending sessions there would be a mass logout bought for no revocation.
		const username = nextUsername();
		const userId = await insertUser({ username });
		const session = await loginAs(username);

		await persistRecordKeys(
			{ table: USERS_TABLE, sectionTipo: USERS, sectionId: userId },
			[{ column: 'relation', key: 'dd1725', value: [] }],
			false,
		);

		expect(liveCredentials(session)).toEqual({ session: true, marker: true });
	});
});

// ---------------------------------------------------------------------------
// AUTOMATIC COLLECTION (reviewer must-fix 4)
// ---------------------------------------------------------------------------

describe('the MCP service account re-asks its standing on every call (SEC-09b)', () => {
	// THE ONE SURFACE A REVOCATION CANNOT REACH BY ENDING SESSIONS. The stdio MCP server
	// is long-lived and holds none: it took DEDALO_MCP_USER_ID at startup, resolved the
	// principal once, and ran every tool under it for the life of the process. So the
	// operator's deactivation ended the account's web sessions, revoked its media
	// markers, refused its next login — and the agent kept reading and writing under the
	// old grants until somebody happened to restart the server.
	//
	// Behavioural, not structural (GATE-24): each case builds a real dd128 record,
	// applies the transition through a real door, and asks the function the tool-call
	// lambda asks.
	test('a DEACTIVATED service account is refused', async () => {
		const username = nextUsername();
		const userId = await insertUser({ username });
		const before = await currentServicePrincipal(
			{ userId, isGlobalAdmin: false, isDeveloper: false },
			{},
		);
		expect(before instanceof DedaloError, 'a live account was refused before the write').toBe(
			false,
		);

		await saveAsAdmin(userId, ACTIVE_ACCOUNT, [flagLocator(ACTIVE_ACCOUNT, NO)]);

		const after = await currentServicePrincipal(
			{ userId, isGlobalAdmin: false, isDeveloper: false },
			{},
		);
		expect(after instanceof DedaloError).toBe(true);
		expect((after as DedaloError).code).toBe('perm.denied');
	});

	test('a DELETED service account is refused', async () => {
		const username = nextUsername();
		const userId = await insertUser({ username });
		await sql.unsafe(`DELETE FROM ${USERS_TABLE} WHERE section_id = $1`, [userId]);

		const after = await currentServicePrincipal(
			{ userId, isGlobalAdmin: false, isDeveloper: false },
			{},
		);
		expect(after instanceof DedaloError).toBe(true);
		expect((after as DedaloError).code).toBe('perm.denied');
	});

	test('an account PROMOTED to global admin mid-process loses write mode', async () => {
		// The confused-deputy refusal is enforced when the server is BUILT. A dd244
		// granted after startup is the one direction it exists to stop, so it is
		// re-asked here — and only in write mode, which is what the gates carry.
		const username = nextUsername();
		const userId = await insertUser({ username, globalAdmin: true });

		const readOnly = await currentServicePrincipal(
			{ userId, isGlobalAdmin: false, isDeveloper: false },
			{},
		);
		expect(readOnly instanceof DedaloError, 'READ-ONLY must still allow a global admin').toBe(
			false,
		);

		const writable = await currentServicePrincipal(
			{ userId, isGlobalAdmin: false, isDeveloper: false },
			{ allowWrite: true },
		);
		expect(writable instanceof DedaloError).toBe(true);
	});
});

describe('orphan markers are collected automatically, backlog included', () => {
	test('the sweep collects a marker with no session behind it', async () => {
		// The BACKLOG: one orphan per session that expired under the old
		// delete-then-unlink order since the per-session credential shipped
		// (2026-08-24). Nothing automatic collected them — `sweepExpiredSessions` had
		// exactly one caller, the runtime_info maintenance widget, i.e. a human clicking
		// a button. The reconcile inside the sweep unlinks every marker that is not a
		// live session's key, so the first scheduled sweep after an upgrade clears the
		// whole backlog in one pass. There is no migration to run.
		const username = nextUsername();
		await insertUser({ username });
		const live = await loginAs(username);
		mkdirSync(authDir, { recursive: true });
		const orphan = 'f'.repeat(128);
		writeFileSync(join(authDir, orphan), '');
		// Age it past the login-in-flight grace: a marker laid milliseconds ago is
		// indistinguishable from a login sitting between `layAuthMarker` and its session
		// INSERT, and the reconcile declines to guess (media_protection.test.ts holds
		// that half). A BACKLOG orphan is by definition old.
		const aged = (Date.now() - MARKER_REAP_GRACE_MS * 2) / 1000;
		utimesSync(join(authDir, orphan), aged, aged);
		expect(existsSync(join(authDir, orphan))).toBe(true);

		sweepExpiredSessions();

		expect(existsSync(join(authDir, orphan))).toBe(false);
		// …and the live editor's marker is untouched, which is the whole reason the
		// reconcile may not run at boot (an empty throwaway store would unlink it).
		expect(existsSync(join(authDir, live.mediaKey))).toBe(true);
	});

	test('the sweeper starts once and can be stopped (no stacked timers)', () => {
		// The scheduler is what makes collection automatic; it is idempotent so a
		// re-entered boot cannot stack timers, and its handle is unref'd so it never
		// holds the process open against a SIGTERM drain.
		try {
			startExpiredSessionSweeper();
			startExpiredSessionSweeper();
		} finally {
			stopExpiredSessionSweeper();
		}
		// Starting again after a stop must work — otherwise a stop would be permanent.
		startExpiredSessionSweeper();
		stopExpiredSessionSweeper();
	});

	test('the serving process actually starts it (and never in a smoke boot)', () => {
		const server = readFileSync(join(import.meta.dir, '../../src/server.ts'), 'utf8');
		expect(server).toContain('startExpiredSessionSweeper');
		// The reconcile inside the sweep unlinks every marker not backed by a live
		// session; a smoke boot holds an EMPTY throwaway session store and the
		// production MEDIA_PATH, so starting it there would log every editor out of the
		// media tree. The guard is the same `!config.installMode && !smokeBoot` the
		// migrations and the schedulers already sit behind.
		const call =
			/if \(!config\.installMode && !smokeBoot\)[\s\S]{0,3000}?startExpiredSessionSweeper\(\)/.exec(
				server,
			);
		expect(call, 'startExpiredSessionSweeper is not behind the smoke-boot guard').not.toBeNull();
	});
});

describe('a LARGE eviction is not one oversized statement', () => {
	test('more sessions than the delete chunk are all ended, markers included', async () => {
		// The delete is CHUNKED because bun:sqlite refuses a bound-parameter list above
		// 32766 (measured), and the markers are unlinked BEFORE the delete — so one
		// oversized statement would throw with every credential in the batch already
		// revoked and every row still present. This gate does NOT reproduce that ceiling
		// (450 sessions is a test, not a load test): what it proves is the LOOP —
		// DELETE_CHUNK is 400, so 450 crosses the boundary and every row in BOTH chunks
		// must be gone, with no marker left behind.
		// THROUGH THE STORE, NOT THROUGH login(). Written first as 450 real logins, which
		// is 450 Argon2id verifies — a hash that is EXPENSIVE ON PURPOSE, so the gate
		// took ~150 s alone and blew a 120 s budget under any load (measured
		// 2026-08-29). Authentication is not what this gate is about: the property is
		// the eviction LOOP's chunking, and it needs 450 session ROWS carrying media
		// keys, not 450 password checks. `createSession` + `layAuthMarker` are the two
		// doors `login()` itself calls for exactly this, one line further down.
		//
		// Nothing is weakened by the change: the rows are real rows in the real store,
		// the markers are real files in the real marker directory, and the assertions
		// are the same two. The dd128 record is still created through the counter-
		// allocating writer so the user id is a real one.
		const username = nextUsername();
		const userId = await insertUser({ username });
		const markers: string[] = [];
		for (let index = 0; index < 450; index++) {
			const mediaKey = createHash('sha512')
				.update(`${username}:${String(index)}`)
				.digest('hex');
			createSession(userId, username, false, mediaKey);
			layAuthMarker(mediaKey);
			markers.push(mediaKey);
		}
		// The situation is real before it is destroyed, or the assertions below are
		// vacuous against a directory that never had the files.
		expect(markers.filter((key) => existsSync(join(authDir, key)))).toHaveLength(450);

		const removed = destroyUserSessionsDetail(userId).removed;

		expect(removed).toBe(450);
		expect(markers.filter((key) => existsSync(join(authDir, key)))).toEqual([]);
	}, 120000);
});
