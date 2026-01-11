<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_PASSWORD
 * From class component_password
 * Common search methods for password component
 */
trait search_component_password {



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

		// Always set fixed values
		$query_object->type = 'password';

		// column
		$column = section_record_data::get_column_name( get_called_class() );

		// table_alias
		$table_alias = $query_object->table_alias;

		// Validate path and get component_tipo
		$path_end = end($query_object->path);
		$component_tipo = is_object($path_end) ? $path_end->component_tipo : ($query_object->tipo ?? null);

		// json_path
		// Password data is non-translatable, so no language filtering is needed
		$json_path = "$.{$component_tipo}[*]";

		// EQUALS (default and only supported operator)
		// Matches records where the encrypted password exactly equals the search term.
		// Password values are encrypted before comparison for security.
		// Non-translatable: Password data has no language property.
		// Index optimization: Structural pre-filter (@?) leverages GIN indexes.
		// Security: Uses exists subquery to compare encrypted password values.

		$query_object->params = ['_Q1_' => component_password::encrypt_password($q)];

		$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
		$query_object->sentence .= '  SELECT 1'.PHP_EOL;
		$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
		$query_object->sentence .= "  WHERE elem->>'value' = _Q1_".PHP_EOL;
		$query_object->sentence .= ' )';

		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'='		=> 'equal'
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_password
