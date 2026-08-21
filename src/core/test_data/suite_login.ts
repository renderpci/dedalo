/**
 * THE SUITE DATABASE'S LOGIN CREDENTIAL — so the client run can perform a REAL
 * login against the database it is allowed to write to.
 *
 * WHY THIS EXISTS. `bun run test:client` used to drive whatever server the
 * developer had running, on the APPLICATION's database, and it authenticated
 * with that install's credentials. Now the run owns its server on the SUITE
 * database (scripts/client_test_server.ts) — and the suite database is built
 * from the install seed, whose `root` user ships with NO password at all (the
 * installer sets it). So the honest login path had nothing to log in with, and
 * the only way in was `--auth mint`, which verifies no credential and therefore
 * does not exercise authentication at all.
 *
 * A gate that cannot exercise the real path teaches nothing, so the run BUILDS
 * the situation it tests — the same law every other test follows: it sets the
 * credential on the disposable database, then logs in with it for real
 * (password verified, throttle applied, audit line written).
 *
 * SAFE BY THE SAME DOOR AS EVERYTHING ELSE. `assertTestDatabase` first: this
 * writes to `matrix_users`, and on a database that does not declare itself
 * disposable that is somebody's real account. The refusal is the marker's, not
 * a check invented here.
 *
 * It writes through `updateMatrixRecord` (the one matrix write door), merging
 * into the row's existing `string` object — component_password's hash is stored
 * raw in `string.dd133[0].value` and must start with `$argon2`, exactly as
 * core/security/auth.ts reads it and core/security/password_hash.ts explains.
 */

import { updateMatrixRecord } from '../db/matrix_write.ts';
import { sql } from '../db/postgres.ts';
import { DedaloError } from '../errors/index.ts';
import { assertTestDatabase } from './test_database_marker.ts';

const USERS_TABLE = 'matrix_users';
const USERS_SECTION_TIPO = 'dd128';
const USERNAME_COMPONENT = 'dd132';
const PASSWORD_COMPONENT = 'dd133';

/**
 * The credential the client run uses when none is configured. A CONSTANT, not a
 * key: the suite database is disposable and rebuilt at will, so its password is
 * a property of the test fixture — inventing a config key for it would make the
 * gate depend on an operator's file again. `DEDALO_TEST_PASSWORD` still wins
 * when it is set (scripts/client_test_runner.ts).
 */
export const SUITE_LOGIN_PASSWORD = 'dedalo_suite_client_tests';

/** What the door did — reported so a run's log says whether it changed anything. */
export type SuiteLoginOutcome = 'unchanged' | 'set';

/**
 * Does the row's STORED component_password value already verify `password`? A
 * value that is not an argon2 hash — absent, or malformed — verifies nothing,
 * so the caller replaces it.
 */
async function verifiesPassword(stored: string | undefined, password: string): Promise<boolean> {
	if (stored?.startsWith('$argon2') !== true) return false;
	try {
		return await Bun.password.verify(password, stored);
	} catch {
		// A malformed hash is simply replaced by the caller.
		return false;
	}
}

/**
 * Make `username` / `password` a valid login on the suite database. Idempotent:
 * a row that already verifies the password is left alone.
 */
export async function ensureSuiteLoginPassword(
	username: string,
	password: string,
): Promise<SuiteLoginOutcome> {
	await assertTestDatabase('ensureSuiteLoginPassword');
	if (password.length < 8) {
		throw new DedaloError('internal.invariant', {
			message: 'ensureSuiteLoginPassword: the suite login password must be at least 8 characters.',
			coordinates: { username },
		});
	}

	const rows = (await sql`
		SELECT section_id, string
		  FROM matrix_users
		 WHERE section_tipo = ${USERS_SECTION_TIPO}
		   AND string->${USERNAME_COMPONENT}->0->>'value' = ${username}
		 LIMIT 1
	`) as { section_id: number; string: Record<string, { value?: string }[]> | null }[];
	const row = rows[0];
	if (row === undefined) {
		throw new DedaloError('internal.invariant', {
			message: `ensureSuiteLoginPassword: no user '${username}' on the suite database. Rebuild it with 'bun run test:db:setup' (the install seed ships 'root'), or pass --user.`,
			coordinates: { username },
		});
	}

	if (await verifiesPassword(row.string?.[PASSWORD_COMPONENT]?.[0]?.value, password)) {
		return 'unchanged';
	}

	const hash = await Bun.password.hash(password, { algorithm: 'argon2id' });
	const merged = { ...(row.string ?? {}) };
	merged[PASSWORD_COMPONENT] = [{ id: 1, value: hash, lang: 'lg-nolan' }] as never;
	await updateMatrixRecord(USERS_TABLE, USERS_SECTION_TIPO, row.section_id, { string: merged });
	return 'set';
}
