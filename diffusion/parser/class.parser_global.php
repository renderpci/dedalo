<?php declare(strict_types=1);

/**
 * PARSER_GLOBAL
 * Global parser functions for diffusion logic not tied to a specific component.
 *
 * @package Dedalo
 * @subpackage Diffusion
 */
class parser_global {

	/**
	 * MERGE_COLUMNS
	 * Merges the values of specified columns into a single string.
	 * 
	 * @param array|null $data The current row data mapped by column names
	 * @param object $options Options containing 'columns' array and 'fields_separator'
	 * @return string|null
	 */
	public static function merge_columns(?array $data, object $options): ?string {
		$columns = $options->columns ?? [];
		$fields_separator = $options->fields_separator ?? ' ';
		
		if (empty($columns) || empty($data)) {
			return null;
		}

		$merged = [];
		
		foreach ($data as $item) {
			if (is_object($item) && isset($item->id) && in_array($item->id, $columns)) {
				$val = $item->value ?? null;
				if ($val !== null && $val !== '') {
					if (is_array($val)) {
						// Flatten array elements intelligently
						$mapped = array_map(function($v) {
							return is_scalar($v) ? (string)$v : json_encode($v);
						}, $val);
						
						// Remove empty strings
						$mapped = array_filter($mapped, function($v) {
							return $v !== '';
						});

						if (!empty($mapped)) {
							$merged[] = implode($fields_separator, $mapped);
						}
					} else if (is_scalar($val)) {
						$merged[] = (string)$val;
					} else {
						$merged[] = json_encode($val);
					}
				}
			}
		}

		return empty($merged) ? null : implode($fields_separator, $merged);
	}
}
