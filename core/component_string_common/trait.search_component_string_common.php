<?php declare(strict_types=1);
include_once dirname(__DIR__).'/component_common/trait.search_component_sql_builder.php';
/**
* TRAIT SEARCH_COMPONENT_STRING_COMMON
* From class component_string_common
* Common search methods for string components
*/
trait search_component_string_common {

	// Shared search scaffolding: extract_normalized_q, split_search_terms, get_search_context
	use search_component_sql_builder;



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object|false $query_object
	* Edited/parsed version of received object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// 1. Extract and Normalize search value (q)
		$q = self::extract_normalized_q($query_object);
		if ($q === false) {
			return false;
		}

		// 2. Handle Query Splitting (if applicable)
		if (($query_object->q_split ?? false) === true && !search::is_literal($q)) {
			$q_items = self::split_search_terms($q);
			if (count($q_items) > 1) {
				return self::handle_query_splitting($query_object, $q_items, '$and');
			}
		}

		// 3. Gather Search Context (metadata, column, table, etc.)
		$ctx = self::get_search_context($query_object);
		if (!$ctx) {
			return false;
		}

		// 4. Dispatch to Specific Operator Handler
		return self::dispatch_operator_sql($query_object, $q, $ctx);
	}



	// extract_normalized_q(), split_search_terms() and get_search_context() are provided by
	// the shared search_component_sql_builder trait (use'd above).



	/**
	* DISPATCH_OPERATOR_SQL
	* Routes the search resolution to the correct operator handler.
	*/
	protected static function dispatch_operator_sql(object $query_object, string $q, object $ctx) : object {

		if($ctx->table==='matrix_time_machine') {
			return self::dispatch_operator_sql_tm($query_object, $q, $ctx);
		}

		switch (true) {
			case ($q==='!*' || $ctx->q_operator==='!*'):
				return self::resolve_empty_value_sql($query_object, $ctx);

			case ($q==='*' || $ctx->q_operator==='*'):
				return self::resolve_not_empty_value_sql($query_object, $ctx);

			case (strpos($q, '!=')===0 || $ctx->q_operator==='!='):
				return self::resolve_different_sql($query_object, $q, $ctx);

			case (strpos($q, '==')===0 || $ctx->q_operator==='=='):
				return self::resolve_exactly_equal_sql($query_object, $q, $ctx);

			case (strpos($q, '-')===0 || $ctx->q_operator==='-'):
				return self::resolve_not_contain_sql($query_object, $q, $ctx);

			case (strpos($q, '!!')===0 || $ctx->q_operator==='!!'):
				return self::resolve_duplicated_sql($query_object, $ctx);

			case (substr($q, 0, 1)==='*' || substr($q, -1)==='*' || search::is_literal($q)):
				return self::resolve_wildcard_literal_sql($query_object, $q, $ctx);

			default:
				return self::resolve_contains_sql($query_object, $q, $ctx);
		}
	}



	/**
	* RESOLVE_EMPTY_VALUE_SQL (!*)
	* !* Is Empty
	* Translation: "Is empty" / "Does not have data"
	* Technical Logic: column IS NULL OR NOT (column @? jsonpath)
	* What it returns: Records where the specific string field is null or contains only empty/null values.
	*/
	protected static function resolve_empty_value_sql(object $query_object, object $ctx) : object {
		$query_object->params = [
			'_Q1_' => ($query_object->lang === 'all')
				? "$.{$ctx->component_tipo}[*].value ? (@ != \"\" && @ != null)"
				: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.value != \"\" && @.value != null)"
		];
		$query_object->sentence = "({$ctx->table_alias}.{$ctx->column} IS NULL OR NOT ({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath))";
		return $query_object;
	}



	/**
	* RESOLVE_NOT_EMPTY_VALUE_SQL (*)
	* * Not Empty
	* Translation: "Not empty" / "Has data"
	* Technical Logic: (column @? jsonpath)
	* What it returns: Records that have at least one non-empty string entry.
	*/
	protected static function resolve_not_empty_value_sql(object $query_object, object $ctx) : object {
		$query_object->params = [
			'_Q1_' => ($query_object->lang === 'all')
				? "$.{$ctx->component_tipo}[*].value ? (@ != \"\" && @ != null)"
				: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.value != \"\" && @.value != null)"
		];
		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
		return $query_object;
	}



	/**
	* RESOLVE_DIFFERENT_SQL (!=)
	* != Different
	* Translation: "Has data AND does not contain X."
	* Technical Logic: (column @? jsonpath) AND NOT EXISTS (specific match)
	* What it returns: Records with data where the specific pattern X is not present.
	*/
	protected static function resolve_different_sql(object $query_object, string $q, object $ctx) : object {
		$q_clean = trim(str_replace('!=', '', $q));
		$query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];

		$json_path = ($query_object->lang === 'all')
			? "$.{$ctx->component_tipo}[*]"
			: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

		$first_char = mb_substr($q_clean, 0, 1);
		$last_char  = mb_substr($q_clean, -1);

		$match_logic = '';
		switch (true) {
			case ($first_char==='*' && $last_char==='*'):
				$match_logic = "f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)";
				break;
			case ($first_char==='*'):
				$match_logic = "f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')";
				break;
			case ($last_char==='*'):
				$match_logic = "f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_))";
				break;
			default:
				$match_logic = "f_unaccent(elem->>'value') = f_unaccent(_Q1_)";
				break;
		}

		$query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND NOT EXISTS (" . PHP_EOL .
			"  SELECT 1" . PHP_EOL .
			"  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
			"  WHERE {$match_logic}" . PHP_EOL . " )";

		return $query_object;
	}



	/**
	* RESOLVE_EXACTLY_EQUAL_SQL (==)
	* == Exactly Equal
	* Translation: "Contains exactly X."
	* Technical Logic: EXISTS (unaccented exact match)
	* What it returns: Records where at least one entry matches the full string exactly.
	*/
	protected static function resolve_exactly_equal_sql(object $query_object, string $q, object $ctx) : object {
		$q_clean = trim(str_replace('==', '', $q));
		$query_object->params = ['_Q1_' => $q_clean];

		$json_path = ($query_object->lang === 'all')
			? "$.{$ctx->component_tipo}[*]"
			: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

		$query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
			"  SELECT 1" . PHP_EOL .
			"  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
			"  WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_)" . PHP_EOL . " )";

		return $query_object;
	}



	/**
	* RESOLVE_NOT_CONTAIN_SQL (-)
	* - Does Not Contain
	* Translation: "Does not contain string X anywhere."
	* Technical Logic: NOT EXISTS (string ILIKE fragment X)
	* What it returns: Records that do not have the provided string fragment in any of their entries.
	*/
	protected static function resolve_not_contain_sql(object $query_object, string $q, object $ctx) : object {
		$q_clean = trim(str_replace('-', '', $q));
		$query_object->params = ['_Q1_' => $q_clean];

		$json_path = "$.{$ctx->component_tipo}[*]";
		// lang parameterized (_Q2_) instead of inlined into the SQL string literal
		$lang_filter = '';
		if ($query_object->lang !== 'all') {
			$query_object->params['_Q2_'] = $query_object->lang;
			$lang_filter = " AND elem->>'lang' = _Q2_";
		}

		$query_object->sentence = "NOT EXISTS (" . PHP_EOL .
			"  SELECT 1" . PHP_EOL .
			"  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
			"  WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)" . $lang_filter . PHP_EOL . " )";

		return $query_object;
	}



	/**
	* RESOLVE_DUPLICATED_SQL (!!)
	* !! Duplicated
	* Translation: "Has any value shared by another record."
	* Technical Logic: EXISTS (another record with same unaccented 'value')
	* What it returns: Records containing string values found in other records of the same type.
	*/
	protected static function resolve_duplicated_sql(object $query_object, object $ctx) : object {
		$query_object->duplicated = true;
		$query_object->unaccent   = true;

		if ($query_object->lang !== 'all' && $ctx->translatable === false) {
			$query_object->lang = DEDALO_DATA_NOLAN;
		}

		$json_path = ($query_object->lang === 'all')
			? "$.{$ctx->component_tipo}[*]"
			: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

		$query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
			"  SELECT 1" . PHP_EOL .
			"  FROM {$ctx->table} AS m2," . PHP_EOL .
			"       jsonb_path_query(m2.{$ctx->column}, '{$json_path}') AS m2_elem," . PHP_EOL .
			"       jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS m1_elem" . PHP_EOL .
			"  WHERE m2.{$ctx->column} @? '{$json_path}'" . PHP_EOL .
			"    AND m2.section_id != {$ctx->table_alias}.section_id" . PHP_EOL .
			"    AND m2.section_tipo = {$ctx->table_alias}.section_tipo" . PHP_EOL .
			"    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')" . PHP_EOL . " )";

		return $query_object;
	}



	/**
	* RESOLVE_WILDCARD_LITERAL_SQL (*text, text*, 'text')
	* Wildcard / Literal Match
	* Translation: "Matches pattern X (startsWith, endsWith, or literal)."
	* Technical Logic: Postgres REGEX or exact match based on wildcard position.
	* What it returns: Records matching the specified string pattern.
	*/
	protected static function resolve_wildcard_literal_sql(object $query_object, string $q, object $ctx) : object {

		$is_literal = search::is_literal($q);
		$q_clean    = trim(str_replace(["'", '*'], '', $q));
		$query_object->params = ['_Q1_' => $q_clean];

		$json_path = ($query_object->lang === 'all')
			? "$.{$ctx->component_tipo}[*]"
			: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

		$match_logic = '';
		switch (true) {
			case $is_literal:
				$match_logic = "f_unaccent(elem->>'value') = f_unaccent(_Q1_)";
				break;
			case substr($q, 0, 1)==='*':
				$match_logic = "f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')";
				break;
			case substr($q, -1)==='*':
				$match_logic = "f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_))";
				break;
			default:
				$match_logic = "f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)";
				break;
		}

		$query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
			"  SELECT 1" . PHP_EOL .
			"  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
			"  WHERE {$match_logic}" . PHP_EOL . " )";

		return $query_object;
	}



	/**
	* RESOLVE_CONTAINS_SQL (Default)
	* Contains
	* Translation: "Contains string X."
	* Technical Logic: EXISTS (unaccented ILIKE match)
	* What it returns: Records containing the provided string fragment.
	*/
	protected static function resolve_contains_sql(object $query_object, string $q, object $ctx) : object {
		$q_clean = str_replace(['+', '*', '='], '', $q);
		$query_object->params = ['_Q1_' => $q_clean];

		$json_path = ($query_object->lang === 'all')
			? "$.{$ctx->component_tipo}[*]"
			: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

		$query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
			"  SELECT 1" . PHP_EOL .
			"  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
			"  WHERE f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)" . PHP_EOL . " )";

		return $query_object;
	}



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'!*'		=> 'empty', // null
			'*'			=> 'no_empty', // not null
			'=='		=> 'exactly',
			'='			=> 'similar_to',
			'!='		=> 'different_from',
			'-'			=> 'does_not_contain',
			'!!'		=> 'duplicated',
			'text*'		=> 'begins_with',
			'*text'		=> 'end_with',
			'\'text\''	=> 'literal'
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* BUILD_ORDER_SELECT
	* Build the SELECT column sentence used to ORDER BY a component's value.
	* It extracts the value for a specific language from the component's JSONB data.
	* @param object $options {
	* 	@var string $table_name The alias or name of the table (e.g., 'mix' or 'rs197_rs279_dd64').
	* 	@var string $column The data column name (e.g., 'string', 'text', 'section_id').
	* 	@var string $lang The language code to filter by (e.g., 'lg-spa', 'nolan').
	* 	@var string $component_tipo The ontology tipo of the component.
	* 	@var string $alias The alias for the resulting sort column.
	* }
	* @return string $select_sentence
	*/
	public static function build_order_select(object $options) : string {

		$matrix_table	= $options->matrix_table;
		$table_name		= $options->table_name;
		$column			= $options->column;
		$lang			= $options->lang;
		$component_tipo	= $options->component_tipo;
		$alias			= $options->alias;

		// Time machine special case. Direct column mapping.
		if($matrix_table==='matrix_time_machine') {
			// column resolve
			$column = match($component_tipo) {
				DEDALO_TIME_MACHINE_COLUMN_TIPO  => 'tipo',
				DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO => 'section_tipo',
				default  => $column
			};
			// Build select sentence
			$select_sentence = "{$table_name}.{$column} AS $alias";

			return $select_sentence;
		}

		/*
		* SQL Example:
		* (jsonb_path_query_first(
		* 	rs197_rs279_dd64.string->'dd62',
		* 	'$[*] ? (@.lang == "lg-spa").value',
		* 	'{}'
		* ) #>> '{}') AS dd62_order
		*
		* Note: We use jsonb_path_query_first with a filter to efficiently extract the specific language value.
		*/

		// select sentence add as order column
		$select_sentence  = "(jsonb_path_query_first(";
		$select_sentence .= "{$table_name}.{$column}->'{$component_tipo}',";
		$select_sentence .= "'$[*] ? (@.lang == \$lang).value',";
		$select_sentence .= "'{\"lang\": \"$lang\"}'";
		$select_sentence .= ") #>> '{}') AS $alias";

		return $select_sentence;
	}//end build_order_select



}//end search_component_string_common