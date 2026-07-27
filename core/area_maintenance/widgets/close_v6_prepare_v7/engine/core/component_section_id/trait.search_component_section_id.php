<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_SECTION_ID
* SQL search-builder mixin for component_section_id (standard matrix tables).
*
* Responsibilities:
* - Implements resolve_query_object_sql(), the public entry point called by the
*   search engine for every section_id filter leaf in an SQO (Search Query Object)
*   tree. The entry point orchestrates three focused helpers:
*     1. extract_normalized_section_id_q() — extracts and normalises the raw query
*        value from $query_object, handling both scalar and locator-object inputs.
*     2. get_section_id_search_context()   — validates the component path and
*        assembles the SQL-building context object ($ctx).
*     3. dispatch_section_id_operator_sql() — routes to the correct operator handler
*        based on operator symbols found in $q or $ctx->q_operator.
* - Provides seven operator handlers covering the full set of integer comparisons:
*   between ('...'), sequence (','), != (different), >=, <=, >, and equality (default).
* - Implements build_order_select() so the ORDER BY pipeline can sort by the
*   'section_id' integer column using the same alias/column pattern as other components.
* - Exposes search_operators_info() so the UI can enumerate available operators.
*
* Key architectural difference from other search traits (e.g. search_component_number):
*   section_id is NOT a JSONB column. It is the integer primary-key column ('section_id')
*   present directly on every matrix table row. All SQL generated here casts the column
*   with ::integer and compares directly — no jsonb_array_elements(), no @? jsonpath.
*   section_record_data::$column_map maps 'component_section_id' => 'section_id',
*   confirming that 'section_id' is treated as a virtual column name, not a JSONB key.
*
* SQL safety model:
*   - Literal values from $q are stripped to digits only (preg_replace('/[^0-9]/',''))
*     before being set as named placeholder values ('_Q1_'), which the search engine
*     replaces via positional parameters before statement execution.
*   - Operator symbols in $q and $ctx->q_operator are matched against hard-coded
*     string literals in the switch; no user content is interpolated into SQL text.
*
* Relationships:
*   - Used by: component_section_id (via `use search_component_section_id`).
*   - Called from upstream: search::conform_filter()
*     → component_section_id::resolve_query_object_sql().
*   - Sibling traits: search_component_number (analogous but JSONB-based).
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_section_id {



	/**
	* BUILD_ORDER_SELECT
	* Build the SELECT column expression used by the ORDER BY pipeline for this component.
	*
	* Called statically by search::build_sql_query_order() (trait.order.php) when the
	* user requests sorting by section_id. The returned string is appended to the query's
	* SELECT clause as an alias so it can be referenced in ORDER BY.
	*
	* Because section_id is a plain integer column (not JSONB), the expression is a simple
	* qualified column reference: "<table_name>.<column> AS <alias>". No jsonb_path_query_first
	* or array traversal is needed, unlike JSONB-based components such as component_number.
	*
	* The $options object is constructed by build_sql_query_order() and always carries:
	*   ->table_name     string  SQL alias of the matrix table in the current query.
	*   ->column         string  DB column name; for component_section_id this is 'section_id'.
	*   ->alias          string  SQL alias assigned to the sort expression (e.g. 'dd62_order').
	*   ->lang           string  Active language; accepted but unused here (section_id is not
	*                            language-sensitive).
	*   ->component_tipo string  Ontology tipo; accepted but unused here.
	*   ->matrix_table   string  Physical matrix table name; accepted but unused here.
	*
	* @param object $options - Sort-expression context built by build_sql_query_order()
	* @return string         - SQL fragment of the form "<table>.<column> AS <alias>"
	*/
	public static function build_order_select(object $options) : string {

		$table_name		= $options->table_name;
		$column			= $options->column;
		$alias			= $options->alias;

		// section_id is a direct integer column, not JSONB.
		// We just return the column name with alias.
		$select_sentence = "{$table_name}.{$column} AS {$alias}";

		return $select_sentence;
	}




	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Entry point for the search engine: converts a section_id filter leaf from the SQO
	* tree into a $query_object decorated with a SQL sentence and bound params.
	*
	* Orchestration sequence:
	*   1. extract_normalized_section_id_q() — extract and normalise $q. Returns false
	*      when neither a usable value nor a q_operator is present; no WHERE clause
	*      should be emitted in that case.
	*   2. get_section_id_search_context()   — validate the SQO path and build $ctx.
	*      Returns false when $query_object->path is missing or malformed.
	*   3. dispatch_section_id_operator_sql() — inspect $q and $ctx->q_operator to
	*      pick and execute the correct operator handler.
	*
	* Contract:
	*   - Mutates and returns $query_object on success (adds ->sentence and ->params).
	*   - May return a wrapper stdClass with a '$and' key (between range produces two
	*     sub-objects joined as AND by the query assembler).
	*   - Returns false when the search should be skipped (missing value + no operator,
	*     or an invalid path).
	*   - Never throws; errors are logged via debug_log / logger::ERROR and return false.
	*
	* @param object $query_object - SQO filter leaf (q, q_operator, path, table_alias, …)
	* @return object|false        - decorated $query_object (or $and wrapper) on success,
	*                               false when no SQL should be emitted for this filter
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

		// 1. Extract and Normalize search value (q)
		$q = self::extract_normalized_section_id_q($query_object);
		if ($q === false) {
			return false;
		}

		// 2. Gather Search Context (metadata, column, table, etc.)
		$ctx = self::get_section_id_search_context($query_object);
		if (!$ctx) {
			return false;
		}

		// 3. Dispatch to Specific Operator Handler
		return self::dispatch_section_id_operator_sql($query_object, $q, $ctx);
	}



	/**
	* EXTRACT_NORMALIZED_SECTION_ID_Q
	* Extracts and normalises the search query value ($q) from the SQO filter leaf.
	*
	* Input shapes handled:
	*   - $query_object->q is an array  → take the first element (reset()).
	*   - $query_object->q is a scalar  → use as-is.
	*   - $query_object->q is an object (locator) → extract ->value if present,
	*     then fall back to ->section_id (both are common locator shapes the client
	*     may send when the user picked a record by clicking a relation component).
	*
	* Early-exit rule:
	*   Returns false when $q_raw is empty AND $query_object->q_operator is also empty,
	*   meaning there is neither a value to compare nor a standalone operator to apply.
	*   (Note: unlike search_component_number, this trait has no '!*'/'*' empty/not-empty
	*   operators, so q_operator alone currently only carries comparison prefixes.)
	*
	* After extraction, the value is cast to string unconditionally (string)$q_raw,
	* then $query_object->q_operator is prepended when present, so the dispatcher can
	* detect the operator either as a prefix in $q or via $ctx->q_operator.
	*
	* @param object $query_object - SQO filter leaf containing ->q and optionally ->q_operator
	* @return string|false        - normalised query string, or false to abort this filter
	*/
	protected static function extract_normalized_section_id_q(object $query_object) : string|false {

		$q_raw = isset($query_object->q) && is_array($query_object->q)
			? reset($query_object->q)
			: ($query_object->q ?? null);

		// if q is a locator, get the section_id as int
		if (is_object($q_raw)) {

			// if q_raw has value property, use it
			if(isset($q_raw->value)) {
				$q_raw = $q_raw->value;
			}
			// if q_raw has section_id property, use it
			else if (isset($q_raw->section_id)) {
				$q_raw = $q_raw->section_id;
			}
		}

		if (empty($q_raw) && empty($query_object->q_operator)) {
			return false;
		}

		$q = (string)$q_raw;

		// Prepend q_operator if exists
		if (isset($query_object->q_operator)) {
			$q = $query_object->q_operator . $q;
		}

		return $q;
	}



	/**
	* GET_SECTION_ID_SEARCH_CONTEXT
	* Validates the SQO path and assembles the SQL-building context object ($ctx).
	*
	* The returned $ctx stdClass carries metadata consumed by every operator handler:
	*   ->column      string  DB column name — always 'section_id' for this component,
	*                         resolved via section_record_data::get_column_name() which
	*                         consults $column_map['component_section_id'] => 'section_id'.
	*   ->table_alias string  SQL alias of the matrix table in the current query; taken
	*                         directly from $query_object->table_alias.
	*   ->q_operator  ?string operator symbol supplied by the client (e.g. '>=', '!='),
	*                         or null when no operator was specified.
	*
	* Side-effects on $query_object (consumed by search::build_sql_query_where()):
	*   ->type           = 'number'     — selects the numeric statement-builder path.
	*   ->unaccent       = false        — no accent-folding for integer values.
	*   ->format         = 'column'     — signals a direct column comparison (not JSONB).
	*   ->column_name    = 'section_id' — the literal column name for the WHERE builder.
	*   ->component_path = ['section_id'] — simplified path used by the builder.
	*
	* Returns false and logs an ERROR when $query_object->path is absent or not an array.
	*
	* @param object $query_object - SQO filter leaf; ->path must be a non-empty array
	* @return object|false        - populated $ctx, or false when ->path is missing/invalid
	*/
	protected static function get_section_id_search_context(object $query_object) : object|false {

		if (empty($query_object->path) || !is_array($query_object->path)) {
			debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
			return false;
		}

		$column = section_record_data::get_column_name(get_called_class());

		$ctx = new stdClass();
		$ctx->column         = $column;
		$ctx->table_alias    = $query_object->table_alias;
		$ctx->q_operator     = $query_object->q_operator ?? null;

		// Set fixed values on query_object
		$query_object->type           = 'number';
		$query_object->unaccent       = false;
		$query_object->format         = 'column';
		$query_object->column_name    = 'section_id';
		$query_object->component_path = ['section_id'];

		return $ctx;
	}



	/**
	* DISPATCH_SECTION_ID_OPERATOR_SQL
	* Routes the normalised query value and context to the appropriate operator handler.
	*
	* Operator detection order (first match wins via switch(true)):
	*   1. $q contains '...'           → BETWEEN range (both bounds inclusive).
	*   2. $q contains ','             → IN sequence (ANY array of integers).
	*   3. $q starts with '!=' or ctx  → NOT EQUAL (!=).
	*   4. $q starts with '>=' or ctx  → GREATER THAN OR EQUAL (>=).
	*   5. $q starts with '<=' or ctx  → LESS THAN OR EQUAL (<=).
	*   6. $q starts with '>' or ctx   → STRICT GREATER THAN (>).
	*   7. $q starts with '<' or ctx   → STRICT LESS THAN (<).
	*   8. default                      → EXACT EQUALITY (=).
	*
	* (!) The two-character operators '!=' / '>=' / '<=' MUST be tested before their
	* single-character overlapping forms ('>' before '<', etc.). The switch(true) pattern
	* ensures correct priority only when the case ordering is preserved — do not reorder.
	*
	* (!) strpos() is used (not str_starts_with()) for compatibility; strpos()===0 is
	* equivalent to str_starts_with() for ASCII strings and is safe here because $q is
	* always a cast string from scalar/integer input.
	*
	* @param object $query_object - SQO filter leaf being decorated
	* @param string $q            - normalised query string from extract_normalized_section_id_q()
	* @param object $ctx          - context from get_section_id_search_context()
	* @return object|false        - $query_object (or $and wrapper for between) with
	*                               ->sentence and ->params populated, or false on error
	*/
	protected static function dispatch_section_id_operator_sql(object $query_object, string $q, object $ctx) : object|false {

		$between_separator  = '...';
		$sequence_separator = ',';

		switch (true) {
			case (strpos($q, $between_separator)!==false):
				return self::resolve_section_id_between_sql($query_object, $q, $ctx);

			case (strpos($q, $sequence_separator)!==false):
				return self::resolve_section_id_sequence_sql($query_object, $q, $ctx);

			case (strpos($q, '!=')===0 || $ctx->q_operator==='!='):
				return self::resolve_section_id_different_sql($query_object, $q, $ctx);

			case (strpos($q, '>=')===0 || $ctx->q_operator==='>='):
				return self::resolve_section_id_bigger_or_equal_sql($query_object, $q, $ctx);

			case (strpos($q, '<=')===0 || $ctx->q_operator==='<='):
				return self::resolve_section_id_smaller_or_equal_sql($query_object, $q, $ctx);

			case (strpos($q, '>')===0 || $ctx->q_operator==='>'):
				return self::resolve_section_id_bigger_than_sql($query_object, $q, $ctx);

			case (strpos($q, '<')===0 || $ctx->q_operator==='<'):
				return self::resolve_section_id_smaller_than_sql($query_object, $q, $ctx);

			default:
				return self::resolve_section_id_equal_sql($query_object, $q, $ctx);
		}
	}



	/**
	* RESOLVE_SECTION_ID_BETWEEN_SQL (...)
	* ... Between
	* Translation: "section_id is between X and Y"
	* Technical Logic: column >= X AND column <= Y
	* What it returns: Records whose section_id falls within the specified numeric range.
	*
	* $q is split on '...' into a lower bound ($first_val) and upper bound ($second_val).
	* Both parts are cast to int; an empty lower bound is coerced to 0, an empty upper
	* bound falls back to $first_val (degenerate "X...X" range).
	*
	* The two inequality conditions are modelled as two separate query_object clones
	* combined under a '$and' wrapper object. The query assembler unrolls the '$and'
	* structure into: (<alias>.<column>::integer >= _Q1_) AND (<alias>.<column>::integer <= _Q1_).
	* Each clone carries its own ->params map so placeholder substitution is independent.
	*
	* @param object $query_object - SQO filter leaf (cloned, not mutated)
	* @param string $q            - query string in "lower...upper" form (e.g. "10...50")
	* @param object $ctx          - search context (table_alias, column)
	* @return object              - stdClass with '$and' key containing two sub-query objects
	*/
	protected static function resolve_section_id_between_sql(object $query_object, string $q, object $ctx) : object {

		$between_separator = '...';
		$ar_parts          = explode($between_separator, $q);
		$first_val         = !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
		$second_val        = !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

		$query_object_one = clone $query_object;
			$query_object_one->sentence = "{$ctx->table_alias}.{$ctx->column}::integer >= _Q1_";
			$query_object_one->params   = ['_Q1_' => $first_val];

		$query_object_two = clone $query_object;
			$query_object_two->sentence = "{$ctx->table_alias}.{$ctx->column}::integer <= _Q1_";
			$query_object_two->params   = ['_Q1_' => $second_val];

		$new_query_object = new stdClass();
		$new_query_object->{'$and'} = [$query_object_one, $query_object_two];

		return $new_query_object;
	}



	/**
	* RESOLVE_SECTION_ID_SEQUENCE_SQL (,)
	* , Sequence
	* Translation: "section_id is one of: [X, Y, Z]"
	* Technical Logic: column = ANY(array of integers)
	* What it returns: Records whose section_id matches any of the IDs provided in the comma-separated list.
	*
	* $q is split on ',' and each part is cast to int via array_map. The resulting array
	* is serialised as a PostgreSQL integer array literal ('{X,Y,Z}') and bound as _Q1_,
	* then cast ::integer[] in the generated SQL so Postgres applies the = ANY() operator
	* with full integer type safety.
	*
	* @param object $query_object - SQO filter leaf to decorate (mutated in place)
	* @param string $q            - comma-separated section_id values (e.g. "3,7,42")
	* @param object $ctx          - search context (table_alias, column)
	* @return object              - $query_object with ->sentence and ->params set
	*/
	protected static function resolve_section_id_sequence_sql(object $query_object, string $q, object $ctx) : object {

		$sequence_separator = ',';
		$ar_parts           = explode($sequence_separator, $q);
		$q_clean            = array_map(function($el){
			return (int)$el;
		}, $ar_parts);

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer = ANY(_Q1_::integer[])";
		$query_object->params   = ['_Q1_' => '{' . implode(',', $q_clean) . '}'];

		return $query_object;
	}



	/**
	* RESOLVE_SECTION_ID_DIFFERENT_SQL (!=)
	* != Different
	* Translation: "section_id is not X"
	* Technical Logic: column != X
	* What it returns: All records except the one with the specified section_id.
	*
	* The '!=' prefix and any non-digit characters are stripped by preg_replace before
	* the value is bound; if nothing remains after stripping (e.g. the client sent just
	* "!=") the method returns false so no WHERE clause is emitted.
	*
	* @param object $query_object - SQO filter leaf to decorate (mutated in place)
	* @param string $q            - query string (e.g. "!=5" or "5" with q_operator='!=')
	* @param object $ctx          - search context (table_alias, column)
	* @return object|false        - $query_object with ->sentence and ->params set, or false
	*                               when no valid integer value can be extracted from $q
	*/
	protected static function resolve_section_id_different_sql(object $query_object, string $q, object $ctx) : object|false {

		// remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		if ($q_clean === '') {
			return false;
		}

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer != _Q1_";
		$query_object->params   = ['_Q1_' => $q_clean];

		return $query_object;
	}



	/**
	* RESOLVE_SECTION_ID_BIGGER_OR_EQUAL_SQL (>=)
	* >= Greater Than or Equal
	* Translation: "section_id is greater than or equal to X"
	* Technical Logic: column >= X
	* What it returns: Records with section_id equal to or higher than X.
	*
	* Strips the '>=' prefix and all non-digit characters from $q before binding the
	* cleaned integer string as _Q1_. Returns false when nothing numeric remains.
	*
	* @param object $query_object - SQO filter leaf to decorate (mutated in place)
	* @param string $q            - query string (e.g. ">=10" or "10" with q_operator='>=')
	* @param object $ctx          - search context (table_alias, column)
	* @return object|false        - $query_object with ->sentence and ->params set, or false
	*                               when no valid integer value can be extracted from $q
	*/
	protected static function resolve_section_id_bigger_or_equal_sql(object $query_object, string $q, object $ctx) : object|false {

		// remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		if ($q_clean === '') {
			return false;
		}

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer >= _Q1_";
		$query_object->params   = ['_Q1_' => $q_clean];

		return $query_object;
	}



	/**
	* RESOLVE_SECTION_ID_SMALLER_OR_EQUAL_SQL (<=)
	* <= Less Than or Equal
	* Translation: "section_id is less than or equal to X"
	* Technical Logic: column <= X
	* What it returns: Records with section_id equal to or lower than X.
	*
	* Strips the '<=' prefix and all non-digit characters from $q before binding the
	* cleaned integer string as _Q1_. Returns false when nothing numeric remains.
	*
	* @param object $query_object - SQO filter leaf to decorate (mutated in place)
	* @param string $q            - query string (e.g. "<=100" or "100" with q_operator='<=')
	* @param object $ctx          - search context (table_alias, column)
	* @return object|false        - $query_object with ->sentence and ->params set, or false
	*                               when no valid integer value can be extracted from $q
	*/
	protected static function resolve_section_id_smaller_or_equal_sql(object $query_object, string $q, object $ctx) : object|false {

		// remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		if ($q_clean === '') {
			return false;
		}

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer <= _Q1_";
		$query_object->params   = ['_Q1_' => $q_clean];

		return $query_object;
	}



	/**
	* RESOLVE_SECTION_ID_BIGGER_THAN_SQL (>)
	* > Greater Than
	* Translation: "section_id is greater than X"
	* Technical Logic: column > X
	* What it returns: Records with section_id strictly higher than X.
	*
	* Strips the '>' prefix and all non-digit characters from $q before binding the
	* cleaned integer string as _Q1_. Returns false when nothing numeric remains.
	*
	* (!) Note that '>' is a prefix of '>=' — the dispatch in dispatch_section_id_operator_sql()
	* must test '>=' before '>' to avoid routing '>=' queries here.
	*
	* @param object $query_object - SQO filter leaf to decorate (mutated in place)
	* @param string $q            - query string (e.g. ">5" or "5" with q_operator='>')
	* @param object $ctx          - search context (table_alias, column)
	* @return object|false        - $query_object with ->sentence and ->params set, or false
	*                               when no valid integer value can be extracted from $q
	*/
	protected static function resolve_section_id_bigger_than_sql(object $query_object, string $q, object $ctx) : object|false {

		// remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		if ($q_clean === '') {
			return false;
		}

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer > _Q1_";
		$query_object->params   = ['_Q1_' => $q_clean];

		return $query_object;
	}



	/**
	* RESOLVE_SECTION_ID_SMALLER_THAN_SQL (<)
	* < Less Than
	* Translation: "section_id is less than X"
	* Technical Logic: column < X
	* What it returns: Records with section_id strictly lower than X.
	*
	* Strips the '<' prefix and all non-digit characters from $q before binding the
	* cleaned integer string as _Q1_. Returns false when nothing numeric remains.
	*
	* (!) Note that '<' is a prefix of '<=' — the dispatch in dispatch_section_id_operator_sql()
	* must test '<=' before '<' to avoid routing '<=' queries here.
	*
	* @param object $query_object - SQO filter leaf to decorate (mutated in place)
	* @param string $q            - query string (e.g. "<100" or "100" with q_operator='<')
	* @param object $ctx          - search context (table_alias, column)
	* @return object|false        - $query_object with ->sentence and ->params set, or false
	*                               when no valid integer value can be extracted from $q
	*/
	protected static function resolve_section_id_smaller_than_sql(object $query_object, string $q, object $ctx) : object|false {

		// remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		if ($q_clean === '') {
			return false;
		}

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer < _Q1_";
		$query_object->params   = ['_Q1_' => $q_clean];

		return $query_object;
	}



	/**
	* RESOLVE_SECTION_ID_EQUAL_SQL (Default)
	* = Equal
	* Translation: "section_id is X"
	* Technical Logic: column = X
	* What it returns: The specific record matching the provided section_id.
	*
	* Default catch-all operator: executed when none of the explicit operator cases in
	* dispatch_section_id_operator_sql() matched. Strips all non-digit characters from
	* $q and binds the result as _Q1_. Returns false when nothing numeric remains
	* (e.g. $q was empty or contained only operator symbols with no digits).
	*
	* @param object $query_object - SQO filter leaf to decorate (mutated in place)
	* @param string $q            - query string containing the integer section_id to match
	* @param object $ctx          - search context (table_alias, column)
	* @return object|false        - $query_object with ->sentence and ->params set, or false
	*                               when no valid integer value can be extracted from $q
	*/
	protected static function resolve_section_id_equal_sql(object $query_object, string $q, object $ctx) : object|false {

		// remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		if ($q_clean === '') {
			return false;
		}

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer = _Q1_";
		$query_object->params   = ['_Q1_' => $q_clean];

		return $query_object;
	}



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	*
	* Used by the UI layer to populate the operator selector shown alongside the search
	* input for section_id fields. Each key is the operator symbol sent in q_operator (or
	* embedded in the q string), and the value is the human-readable label key used for
	* i18n lookup on the client.
	*
	* Operator symbols and their semantics:
	*   '...' — between  : inclusive range; client sends q as "lower...upper".
	*   ','   — sequence : IN list; client sends q as comma-separated integers.
	*   '>='  — greater_than_or_equal
	*   '<='  — less_than_or_equal
	*   '>'   — greater_than
	*   '<'   — less_than
	*   (no key for equality/default '=' — absence of a recognised operator triggers it)
	*   (no '*' / '!*' empty/not-empty — section_id is always set on every row)
	*
	* @return array $ar_operators - map of operator symbol (string) => label key (string)
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
