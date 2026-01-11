<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_SECTION_ID
 * From class component_section_id
 * Common search methods for section id component
 */
trait search_component_section_id {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object|false $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// q. reset array value
			$query_object->q = is_array($query_object->q)
				? reset($query_object->q)
				: $query_object->q;

		// q. if q is a locator, get the section_id as int
			$query_object->q = is_object($query_object->q) && isset($query_object->q->section_id)
				? $query_object->q->section_id
				: $query_object->q;

		// set the q. Force string always
		$q = $query_object->q . "";

		// q_operator. Prepend q_operator if exists
		if (isset($query_object->q_operator)) {
			$q = $query_object->q_operator . $q;
		}

		// Validate path and calculate translatable
		if (empty($query_object->path) || !is_array($query_object->path)) {
			throw new Exception("Invalid component path");
		}
		
		// column
		$column = section_record_data::get_column_name( get_called_class() );
		
		// table_alias
		$table_alias = $query_object->table_alias;

		// Always set fixed values
		$query_object->type = 'number';

		// Always without unaccent
		$query_object->unaccent = false;

		// format. Always set format to column (but in sequence case)
		$query_object->format = 'column';

		// column_name
		$query_object->column_name = 'section_id';

		// component path
		$query_object->component_path = ['section_id'];

		$between_separator  = '...';
		$sequence_separator = ',';

		switch (true) {

			// BETWEEN (...)
			// Resolves range searches like "100...200".
			// Internally, it splits the query into two separate comparative SQOs (Search Query Objects):
			// - One for the lower bound (>=)
			// - One for the upper bound (<=)
			// These are then nested within a new parent SQO using the '$and' logical operator.
			// This allows the search class to process them as a single atomic filter.
			case (strpos($q, $between_separator)!==false):
				$ar_parts	= explode($between_separator, $q);
				$first_val	= !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
				$second_val	= !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

				$query_object_one = clone $query_object;
					$sql = "{$table_alias}.{$column}::integer >= _Q1_";
					$query_object_one->sentence = $sql;
					$query_object_one->params = ['_Q1_' => $first_val];

				$query_object_two = clone $query_object;
					$sql = "{$table_alias}.{$column}::integer <= _Q1_";
					$query_object_two->sentence = $sql;
					$query_object_two->params = ['_Q1_' => $second_val];

				// Group the two separate comparative objects in a new parent "AND" object
				$current_op = '$and';
				$new_query_object = new stdClass();
					$new_query_object->{$current_op} = [$query_object_one,$query_object_two];

				$query_object = $new_query_object;
				break;

			// SEQUENCE (,)
			// Resolves comma-separated lists like "12,25,36".
			// instead of generating multiple "ORID = 12 OR ID = 25..." clauses or dynamic placeholders ($1, $2, $3...),
			// it uses the PostgreSQL '= ANY()' operator with an array literal.
			// This is more efficient as it uses a single bound parameter (_Q1_), avoids the 65k parameter limit,
			// and allows PostgreSQL to optimize the search using indexes if available.
			// Note: The integer array cast (::integer[]) is vital for matching the column type.
			case (strpos($q, $sequence_separator)!==false):
				$ar_parts	= explode($sequence_separator, $q);
				$q_clean  = array_map(function($el){
					return (int)$el;
				}, $ar_parts);
				$sql = "{$table_alias}.{$column}::integer = ANY(_Q1_::integer[])";
				$query_object->sentence = $sql;
				$query_object->params = ['_Q1_' => '{' . implode(',', $q_clean) . '}'];
				break;

			// DISTINCT OF (!=)
			// Standard PostgreSQL numeric inequality check after casting the column to integer.
			case (substr($q, 0, 2)==='!='):
				$sql = "{$table_alias}.{$column}::integer != _Q1_";
				$query_object->sentence = $sql;
				$q_clean = str_replace('!=', '', $q);
				$query_object->params = ['_Q1_' => $q_clean];
				break;

			// BIGGER OR EQUAL THAN (>=)
			// Numeric comparison (Greater than or Equal) with explicit integer casting.
			case (substr($q, 0, 2)==='>='):
				$sql = "{$table_alias}.{$column}::integer >= _Q1_";
				$query_object->sentence = $sql;
				$q_clean = str_replace('>=', '', $q);
				$query_object->params = ['_Q1_' => $q_clean];
				break;

			// SMALLER OR EQUAL THAN (<=)
			// Numeric comparison (Less than or Equal) with explicit integer casting.
			case (substr($q, 0, 2)==='<='):
				$sql = "{$table_alias}.{$column}::integer <= _Q1_";
				$query_object->sentence = $sql;
				$q_clean = str_replace('<=', '', $q);
				$query_object->params = ['_Q1_' => $q_clean];
				break;

			// BIGGER THAN (>)
			// Simple numeric comparison (Strictly Greater Than) with explicit integer casting.
			case (substr($q, 0, 1)==='>'):
				$sql = "{$table_alias}.{$column}::integer > _Q1_";
				$query_object->sentence = $sql;
				$q_clean = str_replace('>', '', $q);
				$query_object->params = ['_Q1_' => $q_clean];
				break;

			// SMALLER THAN (<)
			// Simple numeric comparison (Strictly Less Than) with explicit integer casting.
			case (substr($q, 0, 1)==='<'):				
				$sql = "{$table_alias}.{$column}::integer < _Q1_";
				$query_object->sentence = $sql;
				$q_clean = str_replace('<', '', $q);
				$query_object->params = ['_Q1_' => $q_clean];
				break;

			// EQUAL DEFAULT
			// Exact match numeric comparison using explicit integer casting for accuracy.
			default:
				$sql = "{$table_alias}.{$column}::integer = _Q1_";
				$query_object->sentence = $sql;
				// Remove '+' prefix if it exists (legacy compatibility for forced positive numbers)
				$q_clean = str_replace('+', '', $q);
				$query_object->params = ['_Q1_' => $q_clean];
				break;
		}//end switch (true) {


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'...'	=> 'between',
			','		=> 'sequence',
			'>='	=> 'greater_than_or_equal',
			'<='	=> 'less_than_or_equal',
			'>'		=> 'greater_than',
			'<'		=> 'less_than'
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_section_id
