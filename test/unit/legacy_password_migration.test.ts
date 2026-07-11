/**
 * v6 → v7 PASSWORD RECOVERY: a legacy AES password can be re-hashed to Argon2id
 * without the user choosing a new one.
 *
 * The interop claim being pinned: our TS decryption reproduces PHP's
 * `dedalo_encrypt_openssl` exactly — double base64, AES-256-CBC, key
 * `md5(md5(DEDALO_INFORMATION))`, IV = first 16 hex chars of
 * `sha256(DEDALO_INFO_KEY)`, plaintext `serialize()`d. The fixture below is a
 * blob produced by REAL PHP (`php -r`), not by our own encryptor, so this test
 * fails if we ever drift from PHP's scheme.
 *
 * Everything here uses DUMMY key material and DUMMY passwords on a SCRATCH user.
 * No real credential is read or decrypted.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	type LegacyKeyMaterial,
	decryptLegacyPassword,
	encryptLegacyPasswordForTest,
	rehashLegacyPassword,
} from '../../src/core/security/legacy_password.ts';
import { isArgon2Hash } from '../../src/core/security/password_hash.ts';

const USERS_SECTION = config.usersSectionTipo;
const PASSWORD_TIPO = 'dd133';
const SCRATCH_ID = 999_000_778;

/** Produced by REAL PHP with information='TEST_INFORMATION', infoKey='test_entity': */
const PHP_BLOB = 'ZHdKVDU5Y0FsOTZYTGZudkw4Y1ZVQTUxTHNMY0tna2JST2hORHRFMTRCUT0=';
const PHP_PLAINTEXT = 'dummy-password-123';
const PHP_MATERIAL: LegacyKeyMaterial = {
	information: 'TEST_INFORMATION',
	infoKey: 'test_entity',
};

beforeAll(async () => {
	await sql`DELETE FROM matrix_users WHERE section_id = ${SCRATCH_ID}`;
});
afterAll(async () => {
	await sql`DELETE FROM matrix_users WHERE section_id = ${SCRATCH_ID}`;
});

describe('interop with PHP dedalo_encrypt_openssl', () => {
	test('a blob produced by REAL PHP decrypts here', () => {
		expect(decryptLegacyPassword(PHP_BLOB, PHP_MATERIAL)).toBe(PHP_PLAINTEXT);
	});

	test('the WRONG key material does not decrypt (no false positives)', () => {
		expect(decryptLegacyPassword(PHP_BLOB, { information: 'WRONG', infoKey: 'test_entity' })).toBe(
			null,
		);
		expect(
			decryptLegacyPassword(PHP_BLOB, { information: 'TEST_INFORMATION', infoKey: 'wrong' }),
		).toBe(null);
	});

	test('non-v6 input is refused rather than mangled', () => {
		expect(decryptLegacyPassword('not-base64-at-all!!', PHP_MATERIAL)).toBe(null);
		expect(decryptLegacyPassword('', PHP_MATERIAL)).toBe(null);
	});

	test('unicode and long passwords survive the round-trip (byte-length check)', () => {
		const material: LegacyKeyMaterial = { information: 'Dédalo install version', infoKey: 'museu' };
		for (const pw of ['contrasenya-ñ-€', 'a'.repeat(200), 'p@ss word #1']) {
			const blob = encryptLegacyPasswordForTest(pw, material);
			expect(decryptLegacyPassword(blob, material)).toBe(pw);
		}
	});
});

describe('re-hash: the user keeps their password', () => {
	test('a legacy blob becomes an Argon2id hash that verifies the ORIGINAL password', async () => {
		const hash = (await rehashLegacyPassword(PHP_BLOB, PHP_MATERIAL)) as string;
		expect(isArgon2Hash(hash)).toBe(true);
		// The whole point: the user logs in with the password they already had.
		expect(await Bun.password.verify(PHP_PLAINTEXT, hash)).toBe(true);
		expect(await Bun.password.verify('some-other-password', hash)).toBe(false);
	});

	test('end to end on a SCRATCH user: legacy row → Argon2id row, login would now succeed', async () => {
		const material: LegacyKeyMaterial = { information: 'Dédalo install version', infoKey: 'museu' };
		const plaintext = 'scratch-user-pw';
		const legacy = encryptLegacyPasswordForTest(plaintext, material);

		// Seed the scratch user exactly as a v6 install would have left them.
		await sql`
			INSERT INTO matrix_users (section_id, section_tipo, "string")
			VALUES (
				${SCRATCH_ID}, ${USERS_SECTION},
				jsonb_build_object(${PASSWORD_TIPO}::text,
					jsonb_build_array(jsonb_build_object('id', 1, 'value', ${legacy}::text, 'lang', 'lg-nolan')))
			)
		`;

		const before = (await sql`
			SELECT "string"->${PASSWORD_TIPO}->0->>'value' AS v FROM matrix_users WHERE section_id = ${SCRATCH_ID}
		`) as { v: string }[];
		expect(isArgon2Hash(before[0]?.v)).toBe(false); // locked out of v7 today

		// What the migration does.
		const hash = (await rehashLegacyPassword(before[0]?.v as string, material)) as string;
		await sql`
			UPDATE matrix_users
			   SET "string" = jsonb_set("string", ${`{${PASSWORD_TIPO}}`}::text[],
			         jsonb_build_array(jsonb_build_object('id', 1, 'value', ${hash}::text, 'lang', 'lg-nolan')))
			 WHERE section_id = ${SCRATCH_ID}
		`;

		const after = (await sql`
			SELECT "string"->${PASSWORD_TIPO}->0->>'value' AS v FROM matrix_users WHERE section_id = ${SCRATCH_ID}
		`) as { v: string }[];

		expect(isArgon2Hash(after[0]?.v)).toBe(true);
		// The stored value is a hash of the ORIGINAL password — auth.ts would accept it.
		expect(await Bun.password.verify(plaintext, after[0]?.v as string)).toBe(true);
		// And the plaintext is nowhere in the row.
		expect(after[0]?.v).not.toContain(plaintext);
	});
});
