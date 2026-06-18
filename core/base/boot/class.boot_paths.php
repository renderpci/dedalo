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
			$uri      = (string)($server['REQUEST_URI'] ?? '');
			$segments = explode('/', $uri);
			$root_web = '/' . ($segments[1] ?? '');
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
}
