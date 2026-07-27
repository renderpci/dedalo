<?php declare(strict_types=1);

require_once __DIR__ . '/../../../install/class.migration_committer.php';

/**
* CONFIG_LOCAL_WRITER
* Machine writer for ../private/config.local.php — the catalog's override layer for
* non-secret, list/map config keys (e.g. areas.deny / areas.allow) that cannot live in
* .env (const:null keys are skipped by boot_config_phases::env_overrides). Reads the
* existing returned array, merges the supplied dot-path values over it, and atomically
* commits the rewritten file via migration_committer (timestamped backup, temp+rename).
* Other keys' VALUES are preserved; inline comments are not.
*/
final class config_local_writer {

	/**
	* @param array<string,mixed> $values catalog dot-path => already-typed value
	* @param ?string $target absolute path override (tests); default ../private/config.local.php
	* @return object {result:bool, msg:string, report?:array}
	*/
	public static function set_values(array $values, ?string $target = null) : object {

		$response = (object)['result' => false, 'msg' => 'Error. Request failed'];

		$path = $target ?? self::default_path();
		$dir  = dirname($path);

		if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
			$response->msg = "The directory does not exist and could not be created: {$dir}.";
			return $response;
		}
		if (self::dir_is_writable($dir) === false) {
			$response->msg = "The directory is not writable by the web-server user: {$dir}.";
			return $response;
		}

		// read existing returned array so prior keys survive; a corrupt file => [] (never fatal)
		$existing = [];
		if (is_file($path)) {
			try {
				$loaded = require $path;
				if (is_array($loaded)) {
					$existing = $loaded;
				}
			} catch (\Throwable $e) {
				$existing = [];
			}
		}

		$merged  = array_merge($existing, $values);
		$content = self::render($merged);

		try {
			$report = migration_committer::commit(
				['config_local' => $content],
				['config_local' => $path],
				$dir . '/.install_backups',
				[] // not a secret → default perms (NOT 0600)
			);
		} catch (\Throwable $e) {
			$response->msg = 'Error writing configuration: ' . $e->getMessage();
			return $response;
		}

		// config.local.php is require()d at boot, so OPcache caches it. With
		// validate_timestamps + revalidate_freq>0, a fresh request (e.g. a live menu
		// rebuild fired right after this save) could re-read the STALE cached copy for a
		// few seconds. Force-invalidate the just-written file so the change is visible on
		// the very next request, across all FPM workers (OPcache is shared memory).
		if (function_exists('opcache_invalidate')) {
			opcache_invalidate($path, true);
		}

		$response->result = true;
		$response->msg    = 'OK. Configuration written to ' . $path;
		$response->report = $report;
		return $response;
	}//end set_values


	/** Default target path, resolved exactly as config/config.php resolves the private dir. */
	public static function default_path() : string {
		return dirname(DEDALO_ROOT_PATH) . '/private/config.local.php';
	}


	/** Whether the private dir (where config.local.php lives) is writable by this process. */
	public static function is_writable() : bool {
		$dir = dirname(self::default_path());
		return is_dir($dir) ? self::dir_is_writable($dir) : false;
	}


	/** Render the override file: a documented header + `return <var_export>;` (re-requireable). */
	private static function render(array $values) : string {
		return "<?php declare(strict_types=1);\n\n"
			. "/**\n"
			. "* config.local.php — local config overrides (catalog dot-path => value).\n"
			. "* The areas.* keys are managed by the area_maintenance 'config_areas' widget;\n"
			. "* other keys are preserved on save, but inline comments are NOT. See\n"
			. "* config/sample.config.local.php for the documented format.\n"
			. "*/\n\n"
			. "return " . var_export($values, true) . ";\n";
	}


	/** Prove write permission by creating then removing a temp file inside $path. */
	private static function dir_is_writable(string $path) : bool {
		$probe = rtrim($path, '/') . '/.dedalo_write_test_' . getmypid();
		$ok = @file_put_contents($probe, 'x');
		if ($ok === false) {
			return false;
		}
		@unlink($probe);
		return true;
	}
}
