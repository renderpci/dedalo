/**
 * Install secret generation (PHP installer_secret::generate_token parity).
 *
 * 32 random bytes → 64 lowercase hex chars (256-bit), `.env`-safe (no quoting).
 * Used for DEDALO_SALT_STRING and DEDALO_DIFFUSION_INTERNAL_TOKEN. An existing
 * value is always preserved by the caller (never rotated on an existing install).
 */

/** A fresh 256-bit secret as 64 lowercase hex characters. */
export function generateSecret(bytes = 32): string {
	const buffer = new Uint8Array(Math.max(16, bytes));
	crypto.getRandomValues(buffer);
	return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
