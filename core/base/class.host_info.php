<?php declare(strict_types=1);
/**
* CLASS HOST_INFO
* Cross-platform host hardware/OS introspection for Dédalo.
*
* Dependency-free replacement for the LinFo library: every public getter
* degrades silently to null/''/[] when a fact is unavailable and never throws.
* Each probe splits into a pure parser (unit-tested with fixtures) and a thin
* OS reader. Linux and macOS (Darwin) are first-class; other OSes fall back to
* php_uname()/null.
*
* @package Dédalo
* @subpackage Core
*/
class host_info {

	/**
	* OS_FAMILY
	* Normalised platform key used to branch the OS readers.
	* @return string 'linux' | 'darwin' | 'other'
	*/
	public static function os_family() : string {
		return match (PHP_OS_FAMILY) {
			'Linux'  => 'linux',
			'Darwin' => 'darwin',
			default  => 'other',
		};
	}

	/**
	* GET_OS
	* Operating system name, e.g. 'Linux', 'Darwin'.
	* @return string
	*/
	public static function get_os() : string {
		return php_uname('s');
	}

	/**
	* GET_KERNEL
	* Kernel release string, e.g. '6.8.0-40-generic'.
	* @return string
	*/
	public static function get_kernel() : string {
		return php_uname('r');
	}

	/**
	* GET_CPU_ARCHITECTURE
	* Machine hardware name, e.g. 'x86_64', 'arm64'.
	* @return string
	*/
	public static function get_cpu_architecture() : string {
		return php_uname('m');
	}

	/**
	* GET_HOSTNAME
	* Host network name.
	* @return string
	*/
	public static function get_hostname() : string {
		$hostname = gethostname();
		return $hostname !== false ? $hostname : php_uname('n');
	}

	/**
	* PARSE_MEMINFO
	* Extract MemTotal (in kB) from /proc/meminfo content and convert to bytes.
	* @param string $raw
	* @return int|null bytes, or null when MemTotal is absent
	*/
	public static function parse_meminfo(string $raw) : ?int {
		if (preg_match('/^MemTotal:\s+(\d+)\s*kB/mi', $raw, $m) === 1) {
			return ((int)$m[1]) * 1024;
		}
		return null;
	}

	/**
	* PARSE_SYSCTL_INT
	* Read the first positive integer from raw `sysctl -n <key>` output.
	* @param string $raw
	* @return int|null null when empty, non-numeric, or <= 0
	*/
	public static function parse_sysctl_int(string $raw) : ?int {
		$trimmed = trim($raw);
		if ($trimmed === '' || !ctype_digit($trimmed)) {
			return null;
		}
		$value = (int)$trimmed;
		return $value > 0 ? $value : null;
	}

	/**
	* GET_RAM_BYTES
	* Total physical RAM in bytes. Linux: /proc/meminfo. Darwin: sysctl hw.memsize.
	* @return int|null
	*/
	public static function get_ram_bytes() : ?int {
		try {
			switch (self::os_family()) {
				case 'linux':
					if (is_readable('/proc/meminfo')) {
						$raw = @file_get_contents('/proc/meminfo');
						if (is_string($raw) && $raw !== '') {
							return self::parse_meminfo($raw);
						}
					}
					return null;

				case 'darwin':
					$raw = @shell_exec('/usr/sbin/sysctl -n hw.memsize 2>/dev/null');
					return is_string($raw) ? self::parse_sysctl_int($raw) : null;

				default:
					return null;
			}
		} catch (\Throwable $e) {
			return null;
		}
	}

	/**
	* GET_RAM
	* Structured RAM info for widget display.
	* @return array{type:string, total:int}
	*/
	public static function get_ram() : array {
		return [
			'type'  => 'Physical',
			'total' => self::get_ram_bytes() ?? 0,
		];
	}
}//end class host_info
