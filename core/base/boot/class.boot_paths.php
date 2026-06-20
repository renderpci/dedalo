<?php declare(strict_types=1);

/**
* BOOT_PATHS
* Resolves the four base path values from the runtime (the install location and
* the request), returned as a compiler override-layer map. The DERIVED path
* catalog keys (paths.*_path / *_url) compute everything else from these bases.
* Pure: inputs are passed in (the live boot passes __DIR__, $_SERVER, php_sapi_name()).
*/
final class boot_paths {

	/**
	* @param string $config_dir absolute path of the Dédalo config/ directory
	* @param array<string,mixed> $server a $_SERVER-like array
	* @param string $sapi php_sapi_name()
	* @return array<string,string> base override map for paths.root/root_web/host/protocol
	*/
	public static function resolve(string $config_dir, array $server, string $sapi) : array {

		$is_cli = ($sapi === 'cli');

		$root = dirname($config_dir); // the install root that contains config/, core/, ...

		if ($is_cli) {
			$root_web = '/dedalo';
			$host     = 'localhost';
		} else {
			$root_web = self::resolve_root_web($root, $server);
			$host     = (string)($server['HTTP_HOST'] ?? '');
		}

		// Honor a reverse proxy's X-Forwarded-Proto in addition to the direct HTTPS flag.
		$protocol = (
			(isset($server['HTTPS']) && $server['HTTPS'] === 'on')
			|| (isset($server['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $server['HTTP_X_FORWARDED_PROTO']) === 'https')
		) ? 'https://' : 'http://';

		return [
			'paths.root'      => $root,
			'paths.root_web'  => $root_web,
			'paths.host'      => $host,
			'paths.protocol'  => $protocol,
		];
	}//end resolve

	/**
	* Derive the web-root URL segment from the install LOCATION, not a naive first URI segment.
	* Strategy: take the running script's filesystem path (SCRIPT_FILENAME) relative to the
	* install root, then strip that same suffix off the script's URL path (SCRIPT_NAME) — what
	* remains is the web mount point. This is correct for a root-mounted install ('' → URLs like
	* /core, not //core) and for a multi-segment mount ('/apps/dedalo', not the dropped '/apps').
	* Falls back to the legacy '/' . first-REQUEST_URI-segment heuristic when SCRIPT_* are missing
	* or inconsistent. An explicit DEDALO_ROOT_WEB in .env still wins (the env override layer is
	* applied above this boot-resolved layer), so this only governs the default.
	*
	* @param string $root install root filesystem path (dirname of config/)
	* @param array<string,mixed> $server
	* @return string e.g. '/dedalo', '/apps/dedalo', or '' for a root-mounted install
	*/
	private static function resolve_root_web(string $root, array $server) : string {

		$script_name  = (string)($server['SCRIPT_NAME'] ?? '');
		$script_fname = str_replace('\\', '/', (string)($server['SCRIPT_FILENAME'] ?? ''));
		$root_fs      = rtrim(str_replace('\\', '/', $root), '/');

		if ($script_name !== '' && $script_fname !== '' && $root_fs !== '' && str_starts_with($script_fname, $root_fs)) {
			$suffix = substr($script_fname, strlen($root_fs)); // e.g. /core/api/v1/json/index.php
			if ($suffix === '') {
				return rtrim($script_name, '/'); // script IS the install root (unusual)
			}
			// require a '/' boundary so /srv/dedalo doesn't spuriously match /srv/dedalo2/...
			if ($suffix[0] === '/' && str_ends_with($script_name, $suffix)) {
				return rtrim(substr($script_name, 0, -strlen($suffix)), '/'); // '' for a root mount
			}
		}

		// fallback: legacy '/' . first REQUEST_URI segment (preserved for hosts without SCRIPT_*)
		$segments = explode('/', (string)($server['REQUEST_URI'] ?? ''));
		return '/' . ($segments[1] ?? '');
	}//end resolve_root_web
}
