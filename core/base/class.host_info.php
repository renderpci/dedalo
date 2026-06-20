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
}//end class host_info
