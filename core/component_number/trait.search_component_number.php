<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_NUMBER
 * From class component_number
 * Common search methods for number component
 */
trait search_component_number {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object|false $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// q
		$q = is_array($query_object->q)
			? reset($query_object->q)
			: $query_object->q;

		// force to string
		if (!is_string($q)) {
			$q = to_string($q);
		}

		// Validate path and calculate translatable
		if (empty($query_object->path) || !is_array($query_object->path)) {
			throw new Exception("Invalid component path");
		}
		$path_end = end($query_object->path);
		$component_tipo = $path_end->component_tipo;

		// q_operator
		$q_operator = $query_object->q_operator ?? null;

		// q_only_operator string. Applied in client to the q value when only q_operator is introduced.
		$q_only_operator = 'only_operator';

		// Always set fixed values
		$query_object->type = 'number';

		// Always without unaccent (numbers don't need accent handling)
		$query_object->unaccent = false;

		// column
		$column = section_record_data::get_column_name( get_called_class() );

		// table_alias
		$table_alias = $query_object->table_alias;

		// between_separator
		$between_separator = '...';

		switch (true) {

			// EMPTY VALUE (!*)
			// Matches records where the component has no numeric values (empty array, null, or missing).
			// Handles: NULL columns, missing component keys, empty arrays, and null values.
			// Uses OR condition to catch all empty scenarios.
			case ($q_operator==='!*'):
				$query_object->params = [
					'_Q1_' => "$.{$component_tipo}[*] ? (@.value != null)"
				];
				$query_object->sentence = "({$table_alias}.{$column}->'{$component_tipo}' IS NULL OR NOT {$table_alias}.{$column} @? (_Q1_)::jsonpath)";
				break;

			// NOT EMPTY (*)
			// Matches records where the component has at least one non-null numeric value.
			// Uses JSON Path existence operator to verify presence of valid numeric data.
			case ($q_operator==='*'):
				$query_object->params = [
					'_Q1_' => "$.{$component_tipo}[*].value ? (@ != null)"
				];
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				break;

			// BETWEEN (value1...value2)
			// Matches records where the numeric value is between two values (inclusive).
			// Uses JSON Path with numeric comparisons for efficient range queries.
			// Index optimization: Structural pre-filter narrows candidates before numeric comparison.
			case (strpos($q, $between_separator)!==false):
				$ar_parts   = explode($between_separator, $q);
				$first_val  = !empty($ar_parts[0]) ? trim(str_replace(',', '.', $ar_parts[0])) : '0';
				$second_val = !empty($ar_parts[1]) ? trim(str_replace(',', '.', $ar_parts[1])) : $first_val;

				$json_path = "$.{$component_tipo}[*]";

				$query_object->params = [
					'_Q1_' => $first_val,
					'_Q2_' => $second_val
				];

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= "  WHERE (elem->>'value')::numeric >= (_Q1_)::numeric".PHP_EOL;
				$query_object->sentence .= "    AND (elem->>'value')::numeric <= (_Q2_)::numeric".PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// BIGGER OR EQUAL THAN (>=)
			// Matches records where the numeric value is greater than or equal to the search term.
			// Index optimization: Structural pre-filter (@?) for efficient querying.
			// Numeric handling: CAST to numeric type for proper comparison.
			case ($q_operator==='>=' || substr($q, 0, 2)==='>='):
				$q_clean = str_replace(['>=', ','], ['', '.'], $q);
				if ($q_clean==='' || $q_clean===$q_only_operator) {
					$q_clean = '0';
				}

				$json_path = "$.{$component_tipo}[*]";

				$query_object->params = ['_Q1_' => $q_clean];

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= "  WHERE (elem->>'value')::numeric >= (_Q1_)::numeric".PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// SMALLER OR EQUAL THAN (<=)
			// Matches records where the numeric value is less than or equal to the search term.
			// Index optimization: Structural pre-filter (@?) for efficient querying.
			// Numeric handling: CAST to numeric type for proper comparison.
			case ($q_operator==='<=' || substr($q, 0, 2)==='<='):
				$q_clean = str_replace(['<=', ','], ['', '.'], $q);
				if ($q_clean==='' || $q_clean===$q_only_operator) {
					$q_clean = '0';
				}

				$json_path = "$.{$component_tipo}[*]";

				$query_object->params = ['_Q1_' => $q_clean];

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= "  WHERE (elem->>'value')::numeric <= (_Q1_)::numeric".PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// BIGGER THAN (>)
			// Matches records where the numeric value is strictly greater than the search term.
			// Index optimization: Structural pre-filter (@?) for efficient querying.
			// Numeric handling: CAST to numeric type for proper comparison.
			case ($q_operator==='>' || substr($q, 0, 1)==='>'):
				$q_clean = str_replace(['>', ','], ['', '.'], $q);
				if ($q_clean==='' || $q_clean===$q_only_operator) {
					$q_clean = '0';
				}

				$json_path = "$.{$component_tipo}[*]";

				$query_object->params = ['_Q1_' => $q_clean];

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= "  WHERE (elem->>'value')::numeric > (_Q1_)::numeric".PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// SMALLER THAN (<)
			// Matches records where the numeric value is strictly less than the search term.
			// Index optimization: Structural pre-filter (@?) for efficient querying.
			// Numeric handling: CAST to numeric type for proper comparison.
			case ($q_operator==='<' || substr($q, 0, 1)==='<'):
				$q_clean = str_replace(['<', ','], ['', '.'], $q);
				if ($q_clean==='' || $q_clean===$q_only_operator) {
					$q_clean = '0';
				}

				$json_path = "$.{$component_tipo}[*]";

				$query_object->params = ['_Q1_' => $q_clean];

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= "  WHERE (elem->>'value')::numeric < (_Q1_)::numeric".PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// EQUAL (default)
			// Matches records where the numeric value exactly equals the search term.
			// Index optimization: Structural pre-filter (@?) leverages GIN indexes.
			// Numeric handling: Uses string equality within JSON Path for exact matching.
			default:
				$q_clean = str_replace(['+', ','], ['', '.'], $q);

				$json_path = "$.{$component_tipo}[*]";

				$query_object->params = ['_Q1_' => $q_clean];

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= "  WHERE (elem->>'value')::numeric = (_Q1_)::numeric".PHP_EOL;
				$query_object->sentence .= ' )';
				break;
		}//end switch (true)


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'		=> 'no_empty', // not null
			'!*'	=> 'empty', // null
			'...'	=> 'between',
			'>='	=> 'greater_than_or_equal',
			'<='	=> 'less_than_or_equal',
			'>' 	=> 'greater_than',
			'<'		=> 'less_than'
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_number
