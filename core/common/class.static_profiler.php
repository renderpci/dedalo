<?php declare(strict_types=1);
/**
* CLASS STATIC_PROFILER
* Utility to inspect and report the estimated memory footprint of static
* properties across all PHP classes declared in the current request.
*
* Static properties in Dédalo accumulate data across the lifetime of a
* persistent worker (e.g. PHP-FPM, Swoole). This class provides a quick
* diagnostic snapshot so developers can identify which class statics are
* growing unexpectedly between requests — a common source of the
* state-bleed problem documented in the worker-state-bleed audit.
*
* Responsibilities:
* - Walk every class visible to ReflectionClass and collect its static properties.
* - Estimate each property's serialized byte size as a relative memory proxy.
* - Return a sorted, optionally human-readable report keyed by "Class::$prop".
* - Provide internal helpers for size estimation, formatting, and sort-key parsing.
*
* This class has no dependencies and no persistent state of its own — all
* methods are static utilities. It is not meant for production hot paths; use
* it in diagnostic routes or CLI tools only.
*
* @package Dédalo
* @subpackage Core
*/
class static_profiler {

	/**
	* GET_REPORT
	* Builds and returns a sorted diagnostic report of all non-empty static
	* properties found across every user-land class currently declared in PHP.
	*
	* Each entry in the returned array is keyed as "ClassName::\$propertyName"
	* and has a value of the form "<size> <count>", where:
	*   - <size> is either a raw byte integer (when $human_readable = false) or
	*     a formatted string like "12.5 KB" (when $human_readable = true).
	*   - <count> is the number of elements for countable values, or 0 otherwise.
	*
	* The report is sorted largest-first. With $human_readable = true the sort
	* uses parse_size() to convert the formatted string back to a float for
	* comparison, since the string itself is not numerically sortable.
	*
	* Properties whose value is null, an empty array, or an empty string are
	* skipped — they carry no memory cost worth reporting.
	*
	* Internal PHP extension classes (ReflectionClass::isInternal() === true)
	* are skipped because their static state is not managed by Dédalo and their
	* properties are not meaningful for application diagnostics.
	*
	* @param bool $human_readable = true - when true, sizes are formatted as B/KB/MB strings;
	*                                       when false, raw byte counts are used (enables
	*                                       direct numeric arsort)
	* @return array - associative array keyed "Class::\$prop" => "<size> <count>",
	*                 sorted by estimated size descending
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

					// Ignore small values for noise reduction
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
	* Estimates the memory footprint of a value by measuring its serialized
	* byte length via serialize() + strlen().
	*
	* Serialized length is not a perfect measure of real heap usage, but it
	* is a consistent relative proxy: larger serialized strings reliably
	* indicate larger in-memory data structures, making it useful for
	* ranking which statics are heaviest.
	*
	* When serialization fails (e.g. the value contains a Closure or a stream
	* resource, which PHP cannot serialize), the method falls back to rough
	* heuristics:
	*   - Arrays: count(COUNT_RECURSIVE) × 128 bytes per element.
	*   - Objects: flat 1024-byte placeholder.
	*   - Anything else: 0 (reported as negligible).
	*
	* The @ error-suppression on serialize() is intentional: some non-serializable
	* objects emit E_NOTICE before throwing; the Throwable catch handles the rest.
	*
	* @param mixed $var - the value to measure
	* @return int - estimated byte size; 0 when the value is unmeasurable
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
	* Converts a raw byte count to a human-readable size string.
	*
	* Thresholds:
	*   < 1 024          → "<n> B"
	*   1 024 – 1 048 575 → "<n> KB" (rounded to 2 decimal places)
	*   >= 1 048 576      → "<n> MB" (rounded to 2 decimal places)
	*
	* The output format is consumed by parse_size() for sorting; both methods
	* must stay in sync if thresholds change.
	*
	* @param int $bytes - non-negative byte count
	* @return string - formatted size string, e.g. "12.50 KB"
	*/
	private static function format_size(int $bytes) : string {
		if ($bytes < 1024) return $bytes . ' B';
		if ($bytes < 1048576) return round($bytes / 1024, 2) . ' KB';
		return round($bytes / 1048576, 2) . ' MB';
	}

	/**
	* PARSE_SIZE
	* Converts a human-readable size string produced by format_size() back to
	* a raw float byte value so that the report can be sorted numerically.
	*
	* Recognised suffixes: "MB" (× 1 048 576), "KB" (× 1 024), or none (bytes).
	* The numeric portion is extracted by casting the string to float, which
	* stops at the first non-numeric character — sufficient because format_size()
	* always places the number before the unit.
	*
	* (!) This helper is tightly coupled to format_size(). If format_size() ever
	* emits a different unit string (e.g. "GB"), parse_size() must be updated
	* in step or sort order will silently break.
	*
	* @param string $size_str - a report value string whose first token is produced by
	*                           format_size(), e.g. "3.14 MB 42" or "512 B 1"; the
	*                           float cast stops at the first non-numeric character so
	*                           the trailing element count is ignored automatically
	* @return float - equivalent byte count as a float for comparison
	*/
	private static function parse_size(string $size_str) : float {
		$value = (float)$size_str;
		if (strpos($size_str, 'MB') !== false) return $value * 1048576;
		if (strpos($size_str, 'KB') !== false) return $value * 1024;
		return $value;
	}
}
