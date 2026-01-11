<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_IRI
* From class component_iri
* Search methods for IRI component
*/
trait search_component_iri {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object|false $query_object
	*	Edited/parsed version of received object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// $q
		// Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
		$q = isset($query_object->q) && is_array($query_object->q)
			? $query_object->q[0]
			: $query_object->q;

		if ( (empty($q) || empty($q->value) ) && empty($query_object->q_operator)) {
			return false;
		}

		// fallback to emprty string in case of invalid or null q
		$q = (is_object($q) ? $q->value : $q) ?? '';

		// split q case
		$q_split = $query_object->q_split ?? false;
		if ($q_split===true && !search::is_literal($q)) {

			// Join operators with next word (remove space)
			// Operators: !=, ==, =, -, !!, !*
			$q = preg_replace('/(\!=|==|!!|!*|=|-)\s+/', '$1', $q);
			// Join wildcard at the end (remove space before wildcard)
			$q = preg_replace('/\s+(\*)/', '$1', $q);

			$q_items = preg_split('/\s/', $q);
			if (count($q_items)>1) {
				return self::handle_query_splitting($query_object, $q_items, '$and');
			}
		}

		// normalize q (remove slashes if any)
		$q = stripslashes($q);

		// Validate path and calculate translatable
		if (empty($query_object->path) || !is_array($query_object->path)) {
			debug_log(__METHOD__ . " Invalid component path ", logger::ERROR);
			return false;
		}
		$path_end = end($query_object->path);
		$component_tipo = $path_end->component_tipo;
		$translatable = ontology_node::get_translatable($component_tipo);

		// column
		$column = section_record_data::get_column_name( get_called_class() );

		// table_alias
		$table_alias = $query_object->table_alias;

		// q_operator
		$q_operator = $query_object->q_operator ?? null;

		// type. Always set fixed values
		$query_object->type = 'string';

		// lang
		$query_object->lang = $query_object->lang ?? DEDALO_DATA_LANG;


		switch (true) {
			// EMPTY VALUE (!*)
			// Matches records where the IRI component has no valid URIs (empty or null).
			// Language scoping: Searches within the specified language or across all languages if lang='all'.
			// Uses JSON Path existence operator to check for non-empty, non-null IRI values.
			case ($q==='!*' || $q_operator==='!*'):
				$query_object->params = [
					'_Q1_' => $query_object->lang==='all'
						? "$.{$component_tipo}[*].iri ? (@ != \"\" && @ != null)"
						: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.iri != \"\" && @.iri != null)"
				];
				$query_object->sentence = "NOT ({$table_alias}.{$column} @? (_Q1_)::jsonpath)";
				break;

			// NOT EMPTY (*)
			// Matches records where the IRI component has at least one valid URI (non-empty and non-null).
			// Language scoping: Searches within the specified language or across all languages if lang='all'.
			// Uses JSON Path existence operator to verify the presence of valid IRI values.
			case ($q==='*' || $q_operator==='*'):
				$query_object->params = [
					'_Q1_' => $query_object->lang==='all'
						? "$.{$component_tipo}[*].iri ? (@ != \"\" && @ != null)"
						: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.iri != \"\" && @.iri != null)"
				];
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				break;

			// IS DIFFERENT (!=)
			// Matches records where NO IRI value matches the given term (case and accent insensitive).
			// Supports wildcards: *text* (contains), text* (begins with), *text (ends with).
			// Language scoping: Filters by specified language or searches all languages if lang='all'.
			// Index optimization: Uses structural pre-filter (@?) to leverage GIN indexes before EXISTS check.
			// Accent handling: Applies f_unaccent() for accent-insensitive comparison.
			case (strpos($q, '!=')===0 || $q_operator==='!='):
				$q_clean = trim(str_replace('!=', '', $q));
				$query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];

				$json_path = ($query_object->lang === 'all')
					? "$.{$component_tipo}[*]"
					: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

				$first_char = mb_substr($q_clean, 0, 1);
				$last_char  = mb_substr($q_clean, -1);

				$match_logic = '';
				switch (true) {
					case ($first_char==='*' && $last_char==='*'):
						$match_logic = 'f_unaccent(elem->>\'iri\') ~* f_unaccent(_Q1_)';
						break;
					case ($first_char==='*'):
						$match_logic = 'f_unaccent(elem->>\'iri\') ~* (f_unaccent(_Q1_) || \'$\')';
						break;
					case ($last_char==='*'):
						$match_logic = 'f_unaccent(elem->>\'iri\') ~* (\'^\' || f_unaccent(_Q1_))';
						break;
					default:
						$match_logic = 'f_unaccent(elem->>\'iri\') = f_unaccent(_Q1_)';
						break;
				}

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND NOT EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= "  WHERE {$match_logic}".PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// IS SIMILAR (=)
			// Matches records where an IRI contains the search term (case and accent insensitive).
			// Language scoping: Filters by specified language or searches all languages if lang='all'.
			// Index optimization: Structural pre-filter (@?) helps GIN index narrow results before f_unaccent.
			// Accent handling: Uses f_unaccent() for both the IRI value and search term.
			case (strpos($q, '=')===0 || $q_operator==='='):
				$q_clean = trim(str_replace('=', '', $q));
				$query_object->params = ['_Q1_' => $q_clean];

				$json_path = ($query_object->lang === 'all')
					? "$.{$component_tipo}[*]"
					: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= '  WHERE f_unaccent(elem->>\'iri\') ~* f_unaccent(_Q1_)'.PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// NOT CONTAIN (-)
			// Matches records where NO IRI value contains the search term (negated contains).
			// Language scoping: Filters by specified language or searches all languages if lang='all'.
			// Index optimization: Structural pre-filter (@?) optimizes performance.
			// Accent handling: Uses f_unaccent() for accent-insensitive comparison.
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$q_clean = trim(str_replace('-', '', $q));
				$query_object->params = ['_Q1_' => $q_clean];

				$json_path = ($query_object->lang === 'all')
					? "$.{$component_tipo}[*]"
					: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND NOT EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= '  WHERE f_unaccent(elem->>\'iri\') ~* f_unaccent(_Q1_)'.PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// CONTAIN EXPLICIT (*text*)
			// Standard contains search explicitly requested with asterisks.
			// Language scoping: Searches within specified language or all languages if lang='all'.
			// Index optimization: Structural pre-filter (@?) for efficient querying.
			// Accent handling: f_unaccent() ensures accent-insensitive matching.
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$q_clean = trim(str_replace('*', '', $q));
				$query_object->params = ['_Q1_' => $q_clean];

				$json_path = ($query_object->lang === 'all')
					? "$.{$component_tipo}[*]"
					: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= '  WHERE f_unaccent(elem->>\'iri\') ~* f_unaccent(_Q1_)'.PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// ENDS WITH (*text)
			// Searches for IRI values ending with the search term.
			// Uses regex anchoring ($) for end-of-string matching.
			// Language scoping: Filters by language or searches all if lang='all'.
			// Index optimization: Structural pre-filter (@?) improves query performance.
			// Accent handling: f_unaccent() for accent-insensitive suffix matching.
			case (substr($q, 0, 1)==='*'):
				$q_clean = trim(str_replace('*', '', $q));
				$query_object->params = ['_Q1_' => $q_clean];

				$json_path = ($query_object->lang === 'all')
					? "$.{$component_tipo}[*]"
					: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= '  WHERE f_unaccent(elem->>\'iri\') ~* (f_unaccent(_Q1_) || \'$\')'.PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// BEGINS WITH (text*)
			// Searches for IRI values beginning with the search term.
			// Uses regex anchoring (^) for start-of-string matching.
			// Language scoping: Filters by language or searches all if lang='all'.
			// Index optimization: Structural pre-filter (@?) for efficient queries.
			// Accent handling: f_unaccent() for accent-insensitive prefix matching.
			case (substr($q, -1)==='*'):
				$q_clean = trim(str_replace('*', '', $q));
				$query_object->params = ['_Q1_' => $q_clean];

				$json_path = ($query_object->lang === 'all')
					? "$.{$component_tipo}[*]"
					: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= '  WHERE f_unaccent(elem->>\'iri\') ~* (\'^\' || f_unaccent(_Q1_))'.PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// LITERAL ('text')
			// Case-sensitive but accent-insensitive search for an exact full-string match.
			// When search term is enclosed in single quotes, performs literal exact matching.
			// Language scoping: Filters by specified language or searches all if lang='all'.
			// Index optimization: Structural pre-filter (@?) narrows candidates before comparison.
			// Accent handling: f_unaccent() removes accents while preserving case sensitivity.
			case (search::is_literal($q)===true):
				$q_clean = trim(str_replace("'", '', $q));
				$query_object->params = ['_Q1_' => $q_clean];

				$json_path = ($query_object->lang === 'all')
					? "$.{$component_tipo}[*]"
					: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= '  WHERE f_unaccent(elem->>\'iri\') = f_unaccent(_Q1_)'.PHP_EOL;
				$query_object->sentence .= ' )';
				break;

			// DEFAULT (Contains)
			// Standard fallback search: case-insensitive and accent-insensitive contains.
			// Matches any IRI value that contains the search term anywhere within it.
			// Language scoping: Filters by specified language or searches all if lang='all'.
			// Index optimization: Structural pre-filter (@?) leverages GIN indexes.
			// Accent handling: f_unaccent() ensures accent-insensitive substring matching.
			default:
				$q_clean = str_replace(['+', '*'], '', $q);
				$query_object->params = ['_Q1_' => $q_clean];

				$json_path = ($query_object->lang === 'all')
					? "$.{$component_tipo}[*]"
					: "$.{$component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

				$query_object->sentence = "({$table_alias}.{$column} @? '{$json_path}') AND EXISTS (".PHP_EOL;
				$query_object->sentence .= '  SELECT 1'.PHP_EOL;
				$query_object->sentence .= "  FROM jsonb_path_query({$table_alias}.{$column}, '{$json_path}') AS elem".PHP_EOL;
				$query_object->sentence .= '  WHERE f_unaccent(elem->>\'iri\') ~* f_unaccent(_Q1_)'.PHP_EOL;
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
			'*'			=> 'no_empty', // not null
			'!*'		=> 'empty', // null
			'='			=> 'similar_to',
			'!='		=> 'different_from',
			'-'			=> 'does_not_contain',
			'*text*'	=> 'contains',
			'text*'		=> 'begins_with',
			'*text'		=> 'end_with',
			'\'text\''	=> 'literal',
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_iri
