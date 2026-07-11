/**
 * LEGACY (v6) PASSWORD RECOVERY — read-once, re-hash, forget.
 *
 * v6 did not HASH passwords: it reversibly ENCRYPTED them
 * (`component_password::encrypt_password` → `dedalo_encrypt_openssl`,
 * shared/core_functions.php:892):
 *
 *     base64( openssl_encrypt( serialize($pw), 'AES-256-CBC',
 *                              md5(md5(DEDALO_INFORMATION)), 0,
 *                              substr(sha256(DEDALO_INFO_KEY), 0, 16) ) )
 *
 * …and `openssl_encrypt` with options=0 ALREADY returns base64, so the stored
 * value is base64 TWICE. The key is the 32-char md5-of-md5 hex string used as raw
 * bytes; the IV is the first 16 chars of the sha256 hex of DEDALO_INFO_KEY (which
 * itself defaults to DEDALO_ENTITY).
 *
 * v7 stores Argon2id, and `auth.ts` refuses anything else — so every user who
 * never logged into a PHP-v7 server (which lazily upgraded on login) is locked out
 * of the TS engine. Because the v6 storage is REVERSIBLE, they do not need to
 * choose a new password: we can decrypt once, re-hash with Argon2id, and write the
 * hash back. `scripts/migrate_v6_passwords.ts` is the only caller.
 *
 * This is a strict security IMPROVEMENT, not a weakening: DEDALO_INFORMATION
 * defaults to the published constant 'Dédalo install version' and the IV seed is
 * the entity name, so on a default install anyone holding the database can already
 * decrypt every password. Argon2id ends that.
 *
 * The recovered plaintext exists only long enough to be hashed. It is never
 * logged, never returned to a caller, and never written anywhere.
 */

import { createDecipheriv, createHash } from 'node:crypto';

export interface LegacyKeyMaterial {
	/** PHP DEDALO_INFORMATION — the encryption key. */
	readonly information: string;
	/** PHP DEDALO_INFO_KEY — the IV seed (defaults to DEDALO_ENTITY). */
	readonly infoKey: string;
}

/** PHP's default when the installer never changed it — most installs. */
export const DEFAULT_INFORMATION = 'Dédalo install version';

const md5Hex = (value: string): string => createHash('md5').update(value, 'utf8').digest('hex');

/** The AES-256-CBC key/IV exactly as PHP derives them (hex strings used as raw bytes). */
function deriveKeyIv(material: LegacyKeyMaterial): { key: Buffer; iv: Buffer } {
	const key = Buffer.from(md5Hex(md5Hex(material.information)), 'utf8'); // 32 bytes
	const ivHex = createHash('sha256').update(material.infoKey, 'utf8').digest('hex');
	const iv = Buffer.from(ivHex.slice(0, 16), 'utf8'); // 16 bytes
	return { key, iv };
}

/** `s:18:"dummy-password-123";` → `dummy-password-123` (PHP serialize() of a string). */
function phpUnserializeString(serialized: string): string | null {
	const m = /^s:(\d+):"([\s\S]*)";$/.exec(serialized);
	if (m === null) return null;
	const value = m[2] as string;
	// PHP's length is in BYTES — validate, so a wrong key that happens to produce
	// syntactically valid padding is still rejected.
	if (Buffer.byteLength(value, 'utf8') !== Number(m[1])) return null;
	return value;
}

/**
 * Recover the plaintext of one legacy value, or null when it is not decryptable
 * with this key material (wrong key, or not a v6 blob at all).
 *
 * CALLER CONTRACT: hash the result immediately and drop it. Never log it, never
 * return it over the wire, never persist it.
 */
export function decryptLegacyPassword(stored: string, material: LegacyKeyMaterial): string | null {
	try {
		// PHP base64s the already-base64 openssl output.
		const inner = Buffer.from(stored, 'base64').toString('utf8');
		const ciphertext = Buffer.from(inner, 'base64');
		if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) return null;

		const { key, iv } = deriveKeyIv(material);
		const decipher = createDecipheriv('aes-256-cbc', key, iv);
		const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
		return phpUnserializeString(plain);
	} catch {
		// A wrong key fails the PKCS#7 padding check — that is the signal, not an error.
		return null;
	}
}

/**
 * ENCRYPT with the v6 scheme. Exists ONLY so the test suite can build realistic
 * legacy fixtures without a PHP binary — the engine never encrypts a password.
 */
export function encryptLegacyPasswordForTest(
	plaintext: string,
	material: LegacyKeyMaterial,
): string {
	const { createCipheriv } = require('node:crypto') as typeof import('node:crypto');
	const { key, iv } = deriveKeyIv(material);
	const cipher = createCipheriv('aes-256-cbc', key, iv);
	const serialized = `s:${Buffer.byteLength(plaintext, 'utf8')}:"${plaintext}";`;
	const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
	return Buffer.from(encrypted.toString('base64'), 'utf8').toString('base64');
}

/**
 * Decrypt one legacy value and return a fresh Argon2id hash of it. The plaintext
 * never leaves this function.
 */
export async function rehashLegacyPassword(
	stored: string,
	material: LegacyKeyMaterial,
): Promise<string | null> {
	const plaintext = decryptLegacyPassword(stored, material);
	if (plaintext === null) return null;
	return await Bun.password.hash(plaintext, { algorithm: 'argon2id' });
}
