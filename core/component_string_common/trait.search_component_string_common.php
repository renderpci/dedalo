<?php declare(strict_types=1);
include_once dirname(__DIR__).'/component_common/trait.search_component_sql_builder.php';
/**
* TRAIT SEARCH_COMPONENT_STRING_COMMON
* From class component_string_common
* Builds parameterised PostgreSQL WHERE clauses for full-text and pattern searches
* against the JSONB 'string' column in Dédalo matrix tables.
*
* This trait is mixed into component_string_common (and therefore into every concrete
* string component: component_input_text, component_text_area, component_email). It
* implements the component side of the SQO (Search Query Object) pipeline:
*
*   Client SQO → sanitize_client_sqo → resolve_query_object_sql (this trait)
*              → $query_object->sentence + $query_object->params
*              → outer WHERE builder (search::get_where())
*
* Data shape managed:
*   The JSONB 'string' column stores a JSON object keyed by component tipo, whose
*   value is an array of language+value objects:
*     {"dd62": [{"lang": "lg-spa", "value": "Título"}, {"lang": "lg-eng", "value": "Title"}], ...}
*   All jsonpath expressions target this shape. When lang='all', the jsonpath omits
*   the language filter; otherwise it constrains to a single @.lang entry.
*
* Operator map (also exposed via search_operators_info()):
*   !*       → IS NULL / jsonpath absence (empty)
*   *        → jsonpath existence (not empty)
*   !=       → has data AND value does NOT match pattern
*   ==       → value exactly equals (unaccented)
*   -        → value does NOT contain fragment (regex)
*   !!       → value exists in another record (duplicates)
*   *text    → ends with (regex $)
*   text*    → begins with (regex ^)
*   'text'   → literal exact match
*   (default)→ substring contains (regex ~*)
*
* Shared helpers (extract_normalized_q, split_search_terms, get_search_context) are
* supplied by the search_component_sql_builder trait (use'd below). See that trait
* for the SQO path contract and late-static-binding column resolution rules.
*
* Time Machine dispatch:
*   When the target table is 'matrix_time_machine', resolve_query_object_sql() delegates
*   to dispatch_operator_sql_tm() (provided by search_component_string_common_tm, also
*   mixed into component_string_common). The TM variants hit plain scalar columns
*   instead of JSONB, so the SQL patterns differ substantially.
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_string_common {

	// Shared search scaffolding: extract_normalized_q, split_search_terms, get_search_context
	use search_component_sql_builder;



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Entry point for the SQO → SQL pipeline for string components.
	* Called by search::get_where() after the SQO has been sanitised by
	* sanitize_client_sqo. Sets $query_object->sentence and ->params; leaves all
	* other SQO properties intact for the outer WHERE builder to consume.
	*
	* Pipeline:
	*   1. Extract and normalise the query value (bail on empty q + empty q_operator).
	*   2. If q_split is set and the query is multi-word (non-literal), fan out via
	*      handle_query_splitting(), which re-enters this method for each token and
	*      combines results with $and/$or.
	*   3. Collect table/column/tipo metadata into $ctx.
	*   4. Dispatch to the appropriate operator-specific resolve_*_sql() method.
	*
	* @param object $query_object - Incoming SQO; mutated in place with ->sentence and ->params.
	* @return object|false        - The mutated $query_object on success, or false when the SQO
	*                               carries no usable query value (empty q and empty q_operator).
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// 1. Extract and Normalize search value (q)
		$q = self::extract_normalized_q($query_object);
		if ($q === false) {
			return false;
		}

		// 2. Handle Query Splitting (if applicable)
		// q_split=true means the user typed multiple words that should each become an
		// independent filter clause. Literals (quoted strings) are never split.
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
	* Routes the search resolution to the correct operator handler based on the
	* operator prefix embedded in $q or declared via $ctx->q_operator.
	*
	* Time Machine tables bypass all JSONB operators and go to the _tm family instead,
	* because matrix_time_machine stores plain scalar columns (tipo, section_tipo, data)
	* rather than JSONB arrays of language objects.
	*
	* Operator precedence (switch uses `true` so the first matching case wins):
	*   !*   → empty
	*   *    → not-empty
	*   !=   → not-equal / different
	*   ==   → exactly equal
	*   -    → does not contain
	*   !!   → duplicated
	*   *q / q* / 'q' → wildcard or literal
	*   (default) → contains (substring regex)
	*
	* @param object $query_object - SQO to mutate.
	* @param string $q            - Normalised query string (may carry an operator prefix).
	* @param object $ctx          - Search context from get_search_context().
	* @return object              - The mutated $query_object with ->sentence and ->params set.
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
	* Builds SQL that matches records where the component has no usable value.
	*
	* "Empty" means either the JSONB column is NULL entirely, or every language entry
	* for this component tipo has a null/empty string 'value'. The jsonpath differs by
	* lang scope:
	*   lang='all'  → $.tipo[*].value ? (@ != "" && @ != null)
	*   lang='lg-*' → $.tipo[*] ? (@.lang == "lg-*" && @.value != "" && @.value != null)
	*
	* The resulting SQL is: column IS NULL OR NOT (column @? (jsonpath)::jsonpath)
	* The NOT(@?) form is what triggers the "empty" semantics in PostgreSQL.
	*
	* Sets: $query_object->params['_Q1_'], $query_object->sentence
	*
	* @param object $query_object - SQO to mutate.
	* @param object $ctx          - Search context (component_tipo, column, table_alias, lang).
	* @return object              - Mutated $query_object.
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
	* Builds SQL that matches records where the component has at least one non-empty value.
	*
	* Complementary to resolve_empty_value_sql: uses the same jsonpath to test for
	* existence (@?) rather than absence. A record matches if any JSONB entry for this
	* component tipo has a non-null, non-empty string value.
	*
	* The resulting SQL is: column @? (jsonpath)::jsonpath
	*
	* Sets: $query_object->params['_Q1_'], $query_object->sentence
	*
	* @param object $query_object - SQO to mutate.
	* @param object $ctx          - Search context (component_tipo, column, table_alias, lang).
	* @return object              - Mutated $query_object.
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
	* Builds SQL matching records that have data AND do NOT match the given pattern.
	*
	* Semantics: "the column is not empty, but none of its values match pattern X."
	* This is distinct from !* (which simply checks emptiness) because it implies the
	* field has content — just not this particular content.
	*
	* Wildcards on the cleaned value determine the match style for the NOT EXISTS check:
	*   *value*  → unaccented regex (contains)
	*   *value   → regex anchored at end ($)
	*   value*   → regex anchored at start (^)
	*   value    → unaccented exact equality
	*
	* The lang filter is embedded directly in the jsonpath string (not parameterised)
	* because PostgreSQL jsonpath does not support bind parameters for string literals
	* inside the path expression itself. This is consistent across all jsonpath methods
	* in this trait.
	*
	* Sets: $query_object->params (at minimum '_Q1_'), $query_object->sentence
	*
	* @param object $query_object - SQO to mutate.
	* @param string $q            - Raw query value including '!=' prefix; may contain wildcards.
	* @param object $ctx          - Search context.
	* @return object              - Mutated $query_object.
	*/
	protected static function resolve_different_sql(object $query_object, string $q, object $ctx) : object {
		$q_clean = trim(str_replace('!=', '', $q));
		$query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];

		$json_path = ($query_object->lang === 'all')
			? "$.{$ctx->component_tipo}[*]"
			: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

		$first_char = mb_substr($q_clean, 0, 1);
		$last_char  = mb_substr($q_clean, -1);

		// Wildcard position controls regex anchoring for the negative test
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
	* Builds SQL matching records that contain at least one value matching X exactly.
	*
	* "Exactly" means the unaccented value equals the unaccented search term — case and
	* diacritics are normalised by f_unaccent() (a PostgreSQL custom function wrapping
	* unaccent extension). No wildcards are applied; leading == is stripped from $q.
	*
	* Pattern: column has data AND EXISTS (row in jsonpath where value = X unaccented).
	*
	* Sets: $query_object->params['_Q1_'], $query_object->sentence
	*
	* @param object $query_object - SQO to mutate.
	* @param string $q            - Raw query value including '==' prefix.
	* @param object $ctx          - Search context.
	* @return object              - Mutated $query_object.
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
	* Builds SQL matching records where NO entry contains the given fragment.
	*
	* Unlike != (which requires data to be present), - matches records regardless of
	* emptiness: a NULL column also satisfies NOT EXISTS. This is the "exclude" operator
	* useful for filtering out records that mention a word anywhere.
	*
	* The lang filter is handled as a separate prepared parameter (_Q2_) rather than being
	* inlined into the jsonpath string, because this operator reads lang from the JSON
	* object's 'lang' key via elem->>'lang' rather than via a jsonpath filter. This
	* prevents SQL injection from a caller-supplied lang value.
	*
	* (!) Note: when lang='all', the jsonpath covers all entries and no _Q2_ is set.
	*           When a specific lang is provided, _Q2_ is added and the WHERE clause
	*           includes AND elem->>'lang' = _Q2_.
	*
	* Sets: $query_object->params (at minimum '_Q1_', optionally '_Q2_'), $query_object->sentence
	*
	* @param object $query_object - SQO to mutate.
	* @param string $q            - Raw query value including '-' prefix.
	* @param object $ctx          - Search context.
	* @return object              - Mutated $query_object.
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
	* Builds SQL matching records whose value appears in at least one other record of
	* the same section tipo.
	*
	* Implementation: a correlated EXISTS subquery self-joins the same matrix table (m2)
	* and compares unaccented values between the current row (m1_elem) and any other row
	* (m2_elem) with a different section_id but the same section_tipo.
	*
	* Side-effects on $query_object:
	*   ->duplicated = true  — signals to the outer search builder that deduplication
	*                          or COUNT adjustments may be needed downstream.
	*   ->unaccent   = true  — informs the outer builder that f_unaccent is in use.
	*
	* Language handling: if lang is not 'all' and the component is marked non-translatable
	* (ctx->translatable === false), the lang is coerced to DEDALO_DATA_NOLAN because
	* non-translatable components store data under the nolan key regardless of the user's
	* session language.
	*
	* (!) The self-join against the full matrix table can be expensive on large datasets.
	*     Search indexes on section_tipo + the JSONB column improve performance significantly.
	*
	* Sets: $query_object->duplicated, $query_object->unaccent, $query_object->sentence
	*
	* @param object $query_object - SQO to mutate.
	* @param object $ctx          - Search context (table, table_alias, column, component_tipo, translatable).
	* @return object              - Mutated $query_object.
	*/
	protected static function resolve_duplicated_sql(object $query_object, object $ctx) : object {
		$query_object->duplicated = true;
		$query_object->unaccent   = true;

		// Non-translatable components store under nolan regardless of requested lang
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
	* Builds SQL for anchored or exact string pattern matches.
	*
	* This handler covers three related patterns that are too specific for the general
	* "contains" default but do not use an explicit operator prefix:
	*   'text'  → literal: exact unaccented equality (single quotes stripped)
	*   *text   → ends-with: regex "value$" anchored at end
	*   text*   → begins-with: regex "^value" anchored at start
	*
	* The is_literal() check is tested first so a quoted string like '*cat*' is treated
	* as a literal match, not a wildcard, even though it contains asterisks.
	*
	* Note: the default case (both wildcards absent, not literal) applies a full regex
	* contains match — this case is not normally reachable from dispatch_operator_sql()
	* because plain "contains" queries go to resolve_contains_sql() instead. It is here
	* as a safe fallback for direct calls.
	*
	* Sets: $query_object->params['_Q1_'], $query_object->sentence
	*
	* @param object $query_object - SQO to mutate.
	* @param string $q            - Raw query value with wildcards or surrounding single quotes.
	* @param object $ctx          - Search context.
	* @return object              - Mutated $query_object.
	*/
	protected static function resolve_wildcard_literal_sql(object $query_object, string $q, object $ctx) : object {

		$is_literal = search::is_literal($q);
		$q_clean    = trim(str_replace(["'", '*'], '', $q));
		$query_object->params = ['_Q1_' => $q_clean];

		$json_path = ($query_object->lang === 'all')
			? "$.{$ctx->component_tipo}[*]"
			: "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

		// Determine the SQL comparison expression based on wildcard position or literal flag
		$match_logic = '';
		switch (true) {
			case $is_literal:
				$match_logic = "f_unaccent(elem->>'value') = f_unaccent(_Q1_)";
				break;
			case substr($q, 0, 1)==='*':
				// Leading * means "ends with": anchor regex at end of string
				$match_logic = "f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')";
				break;
			case substr($q, -1)==='*':
				// Trailing * means "begins with": anchor regex at start of string
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
	* Builds SQL for the default substring search: "field contains X anywhere."
	*
	* This is the catch-all operator when no recognised prefix or wildcard is found.
	* It strips the operator-like characters (+, *, =) that may have survived
	* normalisation before performing a case- and diacritic-insensitive regex match
	* using PostgreSQL's ~* operator via f_unaccent().
	*
	* Pattern: column has data AND EXISTS (row where value ~* fragment).
	*
	* Sets: $query_object->params['_Q1_'], $query_object->sentence
	*
	* @param object $query_object - SQO to mutate.
	* @param string $q            - Normalised query string; leading/embedded operators stripped here.
	* @param object $ctx          - Search context.
	* @return object              - Mutated $query_object.
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
	* Returns the full map of operators supported by string components, keyed by operator
	* token and valued by a human-readable label used in the search UI.
	*
	* This is the authoritative list consumed by the client to render the operator
	* dropdown. Each key here corresponds to a branch in dispatch_operator_sql().
	*
	* @return array - Operator token => UI label string map.
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
	* Generates the SELECT expression needed to sort a result set by this component's
	* string value in the given language.
	*
	* The returned fragment is injected into the outer SELECT clause (not the ORDER BY
	* clause directly); it creates an aliased column that the ORDER BY can then reference
	* by alias name.
	*
	* Standard matrix tables (non-time-machine):
	*   Uses jsonb_path_query_first with a runtime variable binding for lang to avoid
	*   SQL injection and to let the query planner see a single execution path. The
	*   #>> '{}' operator extracts the JSON text value as a plain SQL text string.
	*
	*   Example output:
	*     (jsonb_path_query_first(
	*       rs197_rs279_dd64.string->'dd62',
	*       '$[*] ? (@.lang == $lang).value',
	*       '{"lang": "lg-spa"}'
	*     ) #>> '{}') AS dd62_order
	*
	* Time Machine tables:
	*   The JSONB path lookup does not apply. Instead, the column is resolved by mapping
	*   the component tipo to the corresponding flat scalar column (tipo, section_tipo,
	*   or the default column from $options). The result is a simple "table.column AS alias".
	*
	* @param object $options - Configuration object with properties:
	*   @var string $options->matrix_table   Name of the matrix table (used to detect TM).
	*   @var string $options->table_name     SQL alias or table name for the FROM clause.
	*   @var string $options->column         JSONB data column name (e.g. 'string').
	*   @var string $options->lang           Language code to sort by (e.g. 'lg-spa').
	*   @var string $options->component_tipo Ontology tipo of the component (JSONB key).
	*   @var string $options->alias          Output alias for the ORDER column.
	* @return string - A complete SQL SELECT expression fragment (without trailing comma).
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
