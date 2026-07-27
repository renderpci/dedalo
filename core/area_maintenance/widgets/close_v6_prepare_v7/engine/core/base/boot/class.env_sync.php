<?php declare(strict_types=1);

/**
* ENV_SYNC
* Single-source guard for the values shared between the PHP `.env` and the
* Bun diffusion engine `.env` (diffusion/api/v1/.env). Pure comparator over
* the canonical name map (design spec, Appendix B).
*/
final class env_sync {

	/**
	* SHARED keys that live in BOTH .env files (PHP and Bun) — the drift contract.
	* PHP/.env key => Bun/.env key.
	*/
	public const MAP = [
		'DEDALO_DIFFUSION_SOCKET_PATH'		=> 'SOCKET_PATH',
		'DEDALO_DIFFUSION_INTERNAL_TOKEN'	=> 'DIFFUSION_INTERNAL_TOKEN',
		'DEDALO_API_URL'					=> 'DEDALO_API_URL',
		'DEDALO_MEDIA_PATH'					=> 'DEDALO_MEDIA_PATH',
	];

	/**
	* MariaDB connection: Bun-only. MariaDB config is NOT a PHP constant / catalog key /
	* PHP .env value — it lives solely in the Bun engine's .env. This map exists only so the
	* installer and the v6→v7 migration can WRITE the Bun .env (render_bun) and recognise the
	* legacy v6 constant names. NOT part of the drift contract (compare() ignores it): the PHP
	* side never carries these, so comparing would always report false drift.
	* Legacy MariaDB constant name => Bun/.env key.
	*/
	public const BUN_DB_MAP = [
		'MYSQL_DEDALO_HOSTNAME_CONN'		=> 'DB_HOST',
		'MYSQL_DEDALO_DB_PORT_CONN'			=> 'DB_PORT',
		'MYSQL_DEDALO_USERNAME_CONN'		=> 'DB_USER',
		'MYSQL_DEDALO_PASSWORD_CONN'		=> 'DB_PASSWORD',
		'MYSQL_DEDALO_DATABASE_CONN'		=> 'DB_NAME',
		'MYSQL_DEDALO_SOCKET_CONN'			=> 'DB_SOCKET', // Bun reads process.env.DB_SOCKET
	];

	/**
	* COMPARE
	* @param array<string,string> $php parsed PHP-side .env
	* @param array<string,string> $bun parsed Bun-side .env
	* @return array<int,array{php_key:string,bun_key:string,php_val:?string,bun_val:?string}>
	*/
	public static function compare(array $php, array $bun) : array {

		$drift = [];
		foreach (self::MAP as $php_key => $bun_key) {
			// treat '' (empty template placeholder) the same as null (not configured)
			$pv = (isset($php[$php_key]) && $php[$php_key] !== '') ? $php[$php_key] : null;
			$bv = (isset($bun[$bun_key]) && $bun[$bun_key] !== '') ? $bun[$bun_key] : null;
			if ($pv === null && $bv === null) {
				continue; // neither side sets it: not drift
			}
			if ($pv !== $bv) {
				$drift[] = [
					'php_key' => $php_key,
					'bun_key' => $bun_key,
					'php_val' => $pv,
					'bun_val' => $bv,
				];
			}
		}

		return $drift;
	}//end compare
}
