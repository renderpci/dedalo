<?php declare(strict_types=1);

/**
* CONFIG
* Read-only singleton over the resolved flat config map (dot-path => value).
* New code reads via this or the config() global; legacy code keeps reading the
* DEDALO_* constants emitted by compat_shim.
*/
final class config {

	public const UNSET = "\0__config_unset__\0";

	private static ?config $instance = null;

	/** @param array<string,mixed> $values */
	private function __construct(private array $values) {}

	/** @param array<string,mixed> $flat */
	public static function boot(array $flat) : void {
		self::$instance ??= new self($flat);
	}

	public static function i() : config {
		if (self::$instance === null) {
			throw new \RuntimeException('config not booted: call config::boot() first');
		}
		return self::$instance;
	}

	/** test seam */
	public static function reset() : void {
		self::$instance = null;
	}

	public function get(string $key, mixed $default = self::UNSET) : mixed {
		if (array_key_exists($key, $this->values)) {
			return $this->values[$key];
		}
		if ($default === self::UNSET) {
			throw new \RuntimeException("config key not found: {$key}");
		}
		return $default;
	}

	public function has(string $key) : bool {
		return array_key_exists($key, $this->values);
	}

	public function int(string $key, mixed $default = self::UNSET) : int {
		return (int) $this->get($key, $default);
	}

	public function bool(string $key, mixed $default = self::UNSET) : bool {
		$v = $this->get($key, $default);
		if (is_bool($v)) {
			return $v;
		}
		return in_array(strtolower(trim((string) $v)), ['1', 'true', 'yes', 'on'], true);
	}

	public function str(string $key, mixed $default = self::UNSET) : string {
		return (string) $this->get($key, $default);
	}

	/** @return array<mixed> */
	public function list(string $key) : array {
		return (array) $this->get($key, []);
	}
}

if (!function_exists('config')) {
	/**
	* CONFIG (global reader)
	* Convenience accessor mirroring the house procedural style.
	* @param string $key dot-path
	* @param mixed $default returned when the key is absent
	* @return mixed
	*/
	function config(string $key, mixed $default = config::UNSET) : mixed {
		return config::i()->get($key, $default);
	}
}
