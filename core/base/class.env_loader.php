<?php declare(strict_types=1);
/**
 * ENV_LOADER
 * Lightweight .env file parser for Dédalo configuration.
 * Loads key=value pairs from .env files into $_ENV and putenv().
 * Supports hostname-keyed files (.env.{hostname}) for multi-system setups.
 *
 * Features:
 * - Comment lines (#) and empty lines are skipped
 * - Quoted values (single/double) are unquoted
 * - Both $_ENV and putenv() are set (needed for different PHP SAPIs)
 * - Hostname-keyed loading: .env.{hostname} takes priority over .env
 * - CLI support: falls back to DEDALO_HOST env var or 'localhost'
 *
 * @package Dedalo
 * @subpackage Core
 */
class env_loader {

	/**
	 * Load environment variables from a .env file.
	 * Does NOT overwrite existing env vars (first-wins principle).
	 *
	 * @param string $path Absolute path to .env file
	 * @return int Number of variables loaded
	 */
	public static function load(string $path) : int {

		if (!file_exists($path)) {
			return 0;
		}

		$lines	= file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
		$count	= 0;

		foreach ($lines as $line) {
			$line = trim($line);

			// Skip comments
			if ($line === '' || str_starts_with($line, '#')) {
				continue;
			}

			// Must contain '='
			if (!str_contains($line, '=')) {
				continue;
			}

			[$key, $value] = explode('=', $line, 2);
			$key	= trim($key);
			$value	= trim($value);

			// Skip if key is empty
			if ($key === '') {
				continue;
			}

			// Unquote values
			$len = strlen($value);
			if ($len >= 2) {
				if ($value[0] === '"' && $value[$len - 1] === '"') {
					$value = substr($value, 1, $len - 2);
				} elseif ($value[0] === "'" && $value[$len - 1] === "'") {
					$value = substr($value, 1, $len - 2);
				}
			}

			// First-wins: do not overwrite existing env vars
			if (getenv($key) !== false) {
				continue;
			}

			$_ENV[$key]	= $value;
			putenv("{$key}={$value}");
			$count++;
		}

		return $count;
	}


	/**
	 * Load hostname-keyed .env file with fallback.
	 * Resolution order:
	 *   1. .env.{hostname}  (system-specific)
	 *   2. .env             (generic fallback)
	 *
	 * For CLI contexts, hostname is resolved from:
	 *   - DEDALO_HOST env var (if already set)
	 *   - $_SERVER['HTTP_HOST']
	 *   - 'localhost' (final fallback)
	 *
	 * @param string $directory Directory containing .env files
	 * @return int Number of variables loaded
	 */
	public static function load_for_host(string $directory) : int {

		// Resolve hostname for file selection
		$hostname = getenv('DEDALO_HOST');
		if ($hostname === false || $hostname === '') {
			$hostname = $_SERVER['HTTP_HOST'] ?? 'localhost';
		}
		// Normalize: strip port
		$hostname = explode(':', $hostname)[0];

		// Try hostname-specific file first
		$env_file_host	= rtrim($directory, '/') . '/.env.' . $hostname;
		$env_file		= rtrim($directory, '/') . '/.env';

		// Load hostname-specific first (higher priority, first-wins)
		$count  = self::load($env_file_host);
		$count += self::load($env_file);

		return $count;
	}


	/**
	 * Get an environment variable value with optional default.
	 * Convenience method for getenv() with fallback.
	 *
	 * @param string $key Environment variable name
	 * @param string|bool|int|null $default Default value if not set
	 * @return string|bool|int|null
	 */
	public static function get(string $key, string|bool|int|null $default=null) : string|bool|int|null {

		$value = getenv($key);
		if ($value === false) {
			return $default;
		}

		return $value;
	}


	/**
	 * Get an environment variable as boolean.
	 * Recognizes: true/false, yes/no, 1/0, on/off (case-insensitive)
	 *
	 * @param string $key Environment variable name
	 * @param bool|null $default Default value if not set
	 * @return bool|null
	 */
	public static function get_bool(string $key, ?bool $default=null) : ?bool {

		$value = getenv($key);
		if ($value === false) {
			return $default;
		}

		return filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
	}


	/**
	 * Get an environment variable as integer.
	 *
	 * @param string $key Environment variable name
	 * @param int|null $default Default value if not set
	 * @return int|null
	 */
	public static function get_int(string $key, ?int $default=null) : ?int {

		$value = getenv($key);
		if ($value === false) {
			return $default;
		}

		$int = filter_var($value, FILTER_VALIDATE_INT);
		return ($int !== false) ? $int : $default;
	}


	/**
	 * Get an environment variable as decoded JSON array.
	 *
	 * @param string $key Environment variable name
	 * @param array $default Default value if not set or invalid JSON
	 * @return array
	 */
	public static function get_json(string $key, array $default=[]) : array {

		$value = getenv($key);
		if ($value === false) {
			return $default;
		}

		$decoded = json_decode($value, true);
		return is_array($decoded) ? $decoded : $default;
	}
}
