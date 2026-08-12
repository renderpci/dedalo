<?php
/**
 * Canonical JSON encoding, shared by the diffusion migration and the parity harness.
 *
 * Sorts OBJECT keys recursively but PRESERVES ARRAY ORDER: in the v7 grammar a ddo_map
 * entry list and a parser chain are ordered sequences — reordering them changes meaning,
 * so array order is data, not formatting.
 *
 * This is the same function that migrate_diffusion_properties.php defines (:5906).
 *
 * ONLY ONE LOAD ORDER IS SAFE. That script declares diffusion_canonical_json()
 * UNCONDITIONALLY, so the function_exists() guard below protects exactly one direction:
 *   migrate_diffusion_properties.php first, then this file  → OK (this file no-ops)
 *   this file first, then migrate_diffusion_properties.php  → FATAL "cannot redeclare"
 * Nothing loads both today (the parity comparator loads only this file), but do not assume
 * the guard makes the pairing order-independent — it does not.
 *
 * FOLLOW-UP (owned elsewhere, deliberately not done here): put the same !function_exists()
 * guard around the declaration in migrate_diffusion_properties.php:5906, or better, delete
 * that copy and require this file there instead.
 */

if (!function_exists('diffusion_canonical_json')) {

	/**
	 * @param mixed $value
	 * @return string canonical JSON
	 */
	function diffusion_canonical_json($value) : string {

		$canonical = static function($v) use (&$canonical) {
			if (is_object($v)) {
				$v = (array)$v;
			}
			if (is_array($v)) {
				$is_list = ($v === [] || array_keys($v) === range(0, count($v) - 1));
				$out = [];
				foreach ($v as $k => $item) {
					$out[$k] = $canonical($item);
				}
				if (!$is_list) {
					ksort($out);
				}
				return $out;
			}
			return $v;
		};

		return (string) json_encode($canonical($value));
	}//end diffusion_canonical_json
}
