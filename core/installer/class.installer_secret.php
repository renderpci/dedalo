<?php declare(strict_types=1);

/**
* INSTALL_SECRET
* Generates the cryptographically strong secrets the installer persists on the
* administrator's behalf — DEDALO_SALT_STRING (the master string that encrypts stored
* credentials) and DEDALO_DIFFUSION_INTERNAL_TOKEN (server-to-server diffusion auth).
* Output is plain lowercase hex: high entropy and .env-safe (no quoting needed), so it
* round-trips through env_loader unchanged. These are shown to the admin once and must
* never be rotated on an existing install (rotating the salt makes stored creds unreadable).
*/
final class installer_secret {

	/**
	* GENERATE_TOKEN
	* @param int $bytes number of random bytes (default 32 → 256-bit, 64 hex chars)
	* @return string lowercase hex string of length 2*$bytes
	*/
	public static function generate_token(int $bytes = 32) : string {
		return bin2hex(random_bytes(max(16, $bytes)));
	}//end generate_token
}
