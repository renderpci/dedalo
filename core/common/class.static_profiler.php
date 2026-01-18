<?php
/**
* STATIC_PROFILER
* Utility to inspect and report on the memory usage of static properties across declared classes.
*/
class static_profiler {

	/**
	* GET_REPORT
	* Returns an associative array of static properties and their estimated memory size.
	* @param bool $human_readable If true, returns sizes in KB/MB.
	* @return array
	*/
	public static function get_report(bool $human_readable = true) : array {
		
		$report = [];
		$classes = get_declared_classes();

		foreach ($classes as $class) {
			// Skip internal PHP classes to focus on the application
			$reflection = new ReflectionClass($class);
            if ($reflection->isInternal()) {
                continue;
            }

			$props = $reflection->getStaticProperties();
			foreach ($props as $name => $value) {
				if ($value !== null && $value !== [] && $value !== '') {
					$size_bytes = self::estimate_memory($value);
					
					// Ignore small values to noise reduction
					if ($size_bytes < 0) {
						continue;
					}

					$key = "{$class}::\${$name}";
					$report[$key] = ($human_readable ? self::format_size($size_bytes) : $size_bytes) . ' ' . (is_countable($value) ? count($value) : 0);
				}
			}
		}

		// Sort by size (if not human readable, we can sort numerically)
		if (!$human_readable) {
			arsort($report);
		} else {
			// For human readable, we need to sort by the internal byte value
			uasort($report, function($a, $b) {
				return self::parse_size($b) <=> self::parse_size($a);
			});
		}

		return $report;
	}

	/**
	* ESTIMATE_MEMORY
	* Estimates the memory footprint of a variable.
	* Note: This is an estimation. serialize() is a common shortcut for relative size.
	*/
	private static function estimate_memory($var) : int {
		try {
			// Disable error reporting temporarily to avoid warnings on non-serializable objects
			return @strlen(serialize($var));
		} catch (Throwable $t) {
			// If serialization fails (e.g. contains a Closure), provide a rough estimation
			if (is_array($var)) {
				return count($var, COUNT_RECURSIVE) * 128; // 128 bytes per element as rough guestimate
			}
			if (is_object($var)) {
				return 1024; // Minimal block for non-serializable objects
			}
			return 0;
		}
	}

	/**
	* FORMAT_SIZE
	*/
	private static function format_size(int $bytes) : string {
		if ($bytes < 1024) return $bytes . ' B';
		if ($bytes < 1048576) return round($bytes / 1024, 2) . ' KB';
		return round($bytes / 1048576, 2) . ' MB';
	}

	/**
	* PARSE_SIZE
	* Helper to sort human-readable strings.
	*/
	private static function parse_size(string $size_str) : float {
		$value = (float)$size_str;
		if (strpos($size_str, 'MB') !== false) return $value * 1048576;
		if (strpos($size_str, 'KB') !== false) return $value * 1024;
		return $value;
	}
}
?>
