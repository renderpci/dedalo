/**
 * SEC — a password is NEVER stored in plaintext, whichever door writes it.
 *
 * `component_password` is, to the write engine, a plain string component (its
 * descriptor declares `column:'string'` and nothing else). Before this gate a save
 * wrote the client's value verbatim: the user's PLAINTEXT password landed in
 * `matrix_users.string.dd133` — and then failed every login anyway, because
 * `auth.ts` accepts only Argon2id. Both halves are asserted here.
 *
 * The write goes to a SCRATCH record in the users section and is deleted again —
 * never a real user (scratch-twin rule).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	hashPasswordChanges,
	hashPasswordForStorage,
	isArgon2Hash,
	isLegacyEncryptedPassword,
} from '../../src/core/security/password_hash.ts';

const USERS_SECTION = config.usersSectionTipo; // dd128
const PASSWORD_TIPO = 'dd133';
const SCRATCH_ID = 999_000_777; // far outside any real user id

async function readStored(): Promise<string | null> {
	const rows = (await sql`
		SELECT "string"->${PASSWORD_TIPO}->0->>'value' AS value
		FROM matrix_users WHERE section_id = ${SCRATCH_ID}
	`) as { value: string | null }[];
	return rows[0]?.value ?? null;
}

beforeAll(async () => {
	await sql`DELETE FROM matrix_users WHERE section_id = ${SCRATCH_ID}`;
	await sql`
		INSERT INTO matrix_users (section_id, section_tipo, "string")
		VALUES (${SCRATCH_ID}, ${USERS_SECTION}, '{}'::jsonb)
	`;
});

afterAll(async () => {
	await sql`DELETE FROM matrix_users WHERE section_id = ${SCRATCH_ID}`;
});

describe('password hashing (pure)', () => {
	test('plaintext is Argon2id-hashed', async () => {
		const hash = (await hashPasswordForStorage('correct horse battery staple')) as string;
		expect(isArgon2Hash(hash)).toBe(true);
		expect(hash).not.toContain('correct horse');
		expect(await Bun.password.verify('correct horse battery staple', hash)).toBe(true);
	});

	test('an existing hash passes through VERBATIM (never double-wrapped)', async () => {
		const existing = await Bun.password.hash('x', { algorithm: 'argon2id' });
		expect(await hashPasswordForStorage(existing)).toBe(existing);
	});

	test('two hashes of the same password differ (per-password salt is embedded)', async () => {
		const a = (await hashPasswordForStorage('same')) as string;
		const b = (await hashPasswordForStorage('same')) as string;
		expect(a).not.toBe(b);
		expect(await Bun.password.verify('same', a)).toBe(true);
		expect(await Bun.password.verify('same', b)).toBe(true);
	});

	test('changed_data items are hashed in place, keeping id/lang', async () => {
		const [change] = await hashPasswordChanges([
			{ action: 'update', value: { id: 1, value: 'plain', lang: 'lg-nolan' } },
		] as { action: string; value: unknown }[]);
		const item = (change as { value: { id: number; value: string; lang: string } }).value;
		expect(item.id).toBe(1);
		expect(item.lang).toBe('lg-nolan');
		expect(isArgon2Hash(item.value)).toBe(true);
	});

	test('a legacy v6 AES blob is recognised, and is NOT an Argon2 hash', () => {
		const legacy = 'ZHdKVDU5Y0FsOTZYTGZudkw4Y1ZVQTUxTHNMY0tna2JST2hORHRFMTRCUT0=';
		expect(isLegacyEncryptedPassword(legacy)).toBe(true);
		expect(isArgon2Hash(legacy)).toBe(false);
	});
});

describe('the WRITE ENGINE never stores a plaintext password', () => {
	test('saving a password through save_component stores an Argon2id hash', async () => {
		const plaintext = 'sup3r-s3cret-pw';

		const result = await saveComponentData({
			componentTipo: PASSWORD_TIPO,
			sectionTipo: USERS_SECTION,
			sectionId: SCRATCH_ID,
			lang: 'lg-nolan',
			changedData: [
				{ action: 'update', id: 1, value: { id: 1, value: plaintext, lang: 'lg-nolan' } },
			],
			userId: 1,
		});
		expect(result.ok).toBe(true);

		const stored = await readStored();
		expect(stored).not.toBe(null);
		// The regression this gate exists for.
		expect(stored).not.toBe(plaintext);
		expect(stored).not.toContain(plaintext);
		expect(isArgon2Hash(stored)).toBe(true);
		// …and it is the RIGHT hash: the login path would accept this password.
		expect(await Bun.password.verify(plaintext, stored as string)).toBe(true);
	});

	test('re-saving the stored hash does not double-wrap it (import round-trip)', async () => {
		const before = (await readStored()) as string;

		const result = await saveComponentData({
			componentTipo: PASSWORD_TIPO,
			sectionTipo: USERS_SECTION,
			sectionId: SCRATCH_ID,
			lang: 'lg-nolan',
			changedData: [{ action: 'update', id: 1, value: { id: 1, value: before, lang: 'lg-nolan' } }],
			userId: 1,
		});
		expect(result.ok).toBe(true);

		const after = await readStored();
		expect(after).toBe(before); // verbatim — a re-hash here would lock the user out
		expect(await Bun.password.verify('sup3r-s3cret-pw', after as string)).toBe(true);
	});
});
