<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_RELATION_COMMON
* From class component_relation_common
* Common SQL search methods shared by all relation components.
*
* Responsibilities:
* - Implements resolve_query_object_sql(), the entry point that turns a
*   search_query_object (SQO) into a prepared SQL fragment suitable for
*   embedding in a WHERE clause against the PostgreSQL 'relation' JSONB column.
* - Orchestrates the four-step pipeline: normalise the query value (q),
*   collect search context (table, column, component_tipo), dispatch to the
*   operator-specific builder, and optionally extend the result to also cover
*   the 'relation_search' auxiliary column (hierarchical ancestor index).
* - Provides search_operators_info() so the client knows which operators this
*   family of components advertises.
* - Delegates time-machine-specific dispatching to
*   trait search_component_relation_common_tm via dispatch_relation_operator_sql_tm().
*
* Operator semantics (JSONB 'relation' column):
*   !*  — empty    : NOT (column ? component_tipo)
*   *   — not-empty: (column ? component_tipo)
*   !=  — different: column has the key AND does NOT contain the given locator
*   !== — strict-different: column does NOT contain the locator at all (includes empty)
*   ==  — contain  : column @> jsonb (default when no operator matches)
*
* Data shape handled:
*   The 'relation' JSONB column is a PostgreSQL JSONB object keyed by component tipo:
*     {"dd20": [locator, locator, ...], "dd35": [locator, ...]}
*   A locator is a JSON object with at minimum {section_tipo, section_id} fields.
*   The 'id' property (transient client pairing key) is stripped before SQL building
*   because it is auto-assigned and not stored persistently.
*
* Note on relation_search:
*   component_autocomplete_hi stores a denormalised ancestor index in the separate
*   'relation_search' column to allow searching across the full parent chain of a
*   hierarchical thesaurus. add_relation_search() wraps the primary clause in an
*   $or/$and group so both columns are consulted in a single SQL pass.
*
* Used by: component_relation_common (via `use search_component_relation_common`).
* The TM twin (search_component_relation_common_tm) provides variants for the
* matrix_time_machine table, which stores user_id as a scalar, not a JSONB locator array.
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_relation_common {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Entry point for SQL generation: transforms a SQO into a prepared SQL fragment
	* targeting the 'relation' JSONB column (or 'relation_search' for hierarchical lookups).
	*
	* Orchestrates four sequential phases:
	*   1. Extract and normalise the query value (q) — strip transient 'id' keys, JSON-encode
	*      non-strings, unwrap a single-item array wrapper, validate shape.
	*   2. Validate the SQO path and build the search context object ($ctx) with the target
	*      column name, table alias, component_tipo, and operator.
	*   3. Dispatch to the operator-specific SQL builder (or the TM variant for time-machine tables).
	*   4. For component_autocomplete_hi only: wrap the primary clause in an $or/$and group that
	*      also searches the 'relation_search' ancestor-index column.
	*
	* Returns false (do not add this clause to the query) when:
	*   - q is missing, invalid, or contains no '{' in a non-function format.
	*   - The SQO path is empty or the terminal path element has no component_tipo.
	*
	* (!) The returned $query_object for component_autocomplete_hi is a WRAPPER object
	* containing a compound $or/$and, not the original flat query_object. Callers must
	* handle both shapes (search::build_sql_query_where dispatches recursively).
	*
	* @param object $query_object - SQO clause: {q, q_operator?, format?, path, table, table_alias, …}
	* @return object|false $query_object - SQO with ->sentence and ->params filled, or false to skip
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Extract and Normalize search value (q)
        $q = self::extract_normalized_relation_q($query_object);
        if ($q === false) {
            return false;
        }

        // 2. Gather Search Context (metadata, column, table, etc.)
        $ctx = self::get_relation_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 3. Dispatch to Specific Operator Handler
        $query_object = self::dispatch_relation_operator_sql($query_object, $q, $ctx);

		// 4. Post-processing: relation_search (only for component_autocomplete_hi)
        $legacy_model = ontology_node::get_legacy_model_by_tipo($ctx->component_tipo);
        if ($legacy_model === 'component_autocomplete_hi') {
            $query_object = self::add_relation_search($query_object);
        }

        return $query_object;
    }



    /**
    * EXTRACT_NORMALIZED_RELATION_Q
    * Extracts and normalises the search value (q) from the SQO into a plain JSON string
    * ready for embedding in the JSONB @> containment operator.
    *
    * Normalisation steps:
    *   a) Warn when q is not an object in normal (non-function, non-only_operator) context.
    *   b) Strip the transient 'id' property from locator objects. The 'id' field is a
    *      client-assigned pairing key used by the dataframe; it is not persisted to the
    *      'relation' JSONB column and must be absent for @> containment to match correctly.
    *   c) JSON-encode non-string values so the rest of the pipeline works with a plain string.
    *   d) Unwrap a single outer array: the client may send [{"section_tipo":"es1",...}] —
    *      the brackets are stripped so $q holds the bare object string, not an array string.
    *      This is required because the SQL builders embed $q inside their own
    *      {"component_tipo":[...]} wrapper.
    *   e) Safety gate: if after unwrapping there is still no '{', the value cannot be a valid
    *      JSON object, so it is replaced with '[]' (an empty, harmless value) and an error is logged.
    *
    * The sentinel string 'only_operator' signals that a q_operator (*,!*) is self-sufficient
    * and q carries no locator payload; it bypasses the object check and safety gate.
    *
    * @param object $query_object - SQO clause with ->q and optional ->format
    * @return string $q - normalised JSON string; never returns false in current implementation
    *                     (the signature allows false for subclass overrides; the safety gate
    *                      substitutes '[]' rather than returning false when q is missing or invalid)
    */
    protected static function extract_normalized_relation_q(object $query_object) : string|false {

        $format = $query_object->format ?? null;
        $q_raw  = $query_object->q ?? null;

        if ($format !== 'function') {
            if (!is_object($q_raw) && $q_raw !== 'only_operator') {
                debug_log(__METHOD__ . " Expected q type is object. Type: " . gettype($q_raw), logger::WARNING);
            }
        }

        // remove the id property from q_raw if exists
        // The 'id' field is a transient client-side pairing key (used by dataframe display logic)
        // that is never written to the 'relation' JSONB column. Its presence would break
        // the @> containment match because the stored locators do not carry it.
        if (is_object($q_raw) && isset($q_raw->id)) {
            unset($q_raw->id);
        } elseif (is_array($q_raw)) {
            foreach ($q_raw as $item) {
                if (is_object($item) && isset($item->id)) {
                    unset($item->id);
                }
            }
        }

        // For unification, all non string are JSON encoded
        $q = is_string($q_raw) ? $q_raw : json_encode($q_raw);

        // Remove initial and final array square brackets if they exist
        // The client sends the locator wrapped in an array (e.g. [{"section_tipo":"es1",...}]).
        // The SQL builders re-wrap it themselves inside {"component_tipo":[...]}, so the outer
        // brackets must be stripped here to get the bare object string.
        if (strpos($q, '[') === 0) {
            $q = preg_replace('/^(\[)(.*)(\])$/m', '$2', $q);
        }

        // Safe q check
        // After unwrapping, a valid locator must contain at least one '{'. Anything else
        // (empty string, a bare scalar) would produce malformed JSONB and is rejected.
        if (strpos($q, '{') === false && $format !== 'function' && $q !== 'only_operator') {
            debug_log(__METHOD__ . ' Ignored invalid unsafe q: ' . to_string($q), logger::ERROR);
            $q = '[]';
        }

        return $q;
    }



    /**
    * GET_RELATION_SEARCH_CONTEXT
    * Validates the SQO path and assembles the immutable context object used by all
    * downstream operator-builder methods.
    *
    * The SQO 'path' is an ordered array of path-node objects; the terminal node
    * (last element) identifies the component being filtered via its component_tipo.
    * This tipo is the JSONB key under which locators are stored in the 'relation' column:
    *   {"dd20": [...locators...], "dd35": [...locators...]}
    *
    * Side-effect: mutates $query_object with three defaults required by the shared
    * SQL builder (trait.search_component_sql_builder):
    *   - type           = 'jsonb'       — selects the JSONB code path in the WHERE builder
    *   - unaccent       = false         — relation values are not text; no accent stripping
    *   - component_path = ['relations'] — tells the JSONB path builder to use the 'relations' key
    *     (this is later overridden to ['relation_search'] for the TM clone in add_relation_search)
    *
    * Returns false (aborting SQL generation) when the path is missing or the terminal
    * node lacks a component_tipo.
    *
    * @param object $query_object - SQO clause; ->path, ->table, ->table_alias, ->q_operator are read
    * @return object|false $ctx - context DTO, or false on validation failure
    */
    protected static function get_relation_search_context(object $query_object) : object|false {

        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
            return false;
        }

        $path_end       = end($query_object->path);
        $component_tipo = $path_end->component_tipo ?? null;

        if (empty($component_tipo)) {
            debug_log(__METHOD__ . " Invalid component tipo from path", logger::ERROR);
            return false;
        }

        $ctx = new stdClass();
        $ctx->component_tipo = $component_tipo;
        // Resolve the DB column name ('relation') for the calling component class at runtime.
        // Using get_called_class() ensures subclasses that map to a different column resolve correctly.
        $ctx->column         = section_record_data::get_column_name(get_called_class());
        $ctx->table_alias    = $query_object->table_alias;
        $ctx->table          = $query_object->table;
        $ctx->q_operator     = $query_object->q_operator ?? null;

        // Set defaults on query_object
        $query_object->type           = 'jsonb';
        $query_object->unaccent       = false;
        $query_object->component_path = ['relations'];

        return $ctx;
    }



    /**
    * DISPATCH_RELATION_OPERATOR_SQL
    * Routes the search to the correct operator-specific SQL builder based on $ctx->q_operator.
    *
    * Two dispatch paths exist:
    *   - matrix_time_machine table: delegates entirely to dispatch_relation_operator_sql_tm()
    *     (defined in trait search_component_relation_common_tm) because the time-machine table
    *     stores a scalar user_id rather than a JSONB locator array and therefore needs
    *     different SQL fragments (IS NULL, =, !=, etc.).
    *   - Standard matrix tables: selects among five operator handlers based on q_operator.
    *     When the operator is '!=' or '!==' but $q is empty or is the sentinel 'only_operator',
    *     the condition falls through to the default contain handler. This is intentional:
    *     negation without a target value is meaningless for JSONB containment.
    *
    * @param object $query_object - SQO clause being built; mutated by the selected handler
    * @param string $q            - normalised JSON string produced by extract_normalized_relation_q
    * @param object $ctx          - context DTO from get_relation_search_context
    * @return object $query_object - SQO with ->sentence and ->params set by the handler
    */
    protected static function dispatch_relation_operator_sql(object $query_object, string $q, object $ctx) : object {

        if($ctx->table === 'matrix_time_machine'){
            // Use time machine specific dispatcher from trait search_component_relation_common_tm
            return self::dispatch_relation_operator_sql_tm($query_object, $q, $ctx);
        }

        switch (true) {
            case ($ctx->q_operator === '!*'):
                return self::resolve_relation_empty_value_sql($query_object, $ctx);

            case ($ctx->q_operator === '*'):
                return self::resolve_relation_not_empty_value_sql($query_object, $ctx);

            case ($ctx->q_operator === '!=' && !empty($q) && $q !== 'only_operator'):
                return self::resolve_relation_different_sql($query_object, $q, $ctx);

            case ($ctx->q_operator === '!==' && !empty($q) && $q !== 'only_operator'):
                return self::resolve_relation_strict_different_sql($query_object, $q, $ctx);

            default:
                return self::resolve_relation_contain_sql($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_RELATION_EMPTY_VALUE_SQL (!*)
    * Builds the SQL fragment for the "is empty" operator (!*).
    *
    * Operator: !* — "Is empty" / "Does not have data"
    * SQL pattern: NOT (table_alias.column ? component_tipo)
    *
    * The PostgreSQL '?' key-exists operator tests whether the JSONB object contains
    * the given top-level key (the component_tipo). NOT (? key) returns true when the
    * key is absent, i.e. the component has no locator array at all for this tipo.
    *
    * Typical use: "Show me all Books with no Author assigned."
    *
    * Note: this does NOT distinguish between a missing key and an explicit empty
    * array []. Both cases satisfy NOT (? key) only if the array itself is absent;
    * an explicit {"dd20":[]} would NOT be matched. In practice Dédalo removes the
    * key entirely when the last locator is deleted, so this distinction is moot.
    *
    * @param object $query_object - SQO clause; ->params and ->sentence are set
    * @param object $ctx          - context DTO with component_tipo, table_alias, column
    * @return object $query_object - SQO with sentence and params filled
    */
    protected static function resolve_relation_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params   = ['_Q1_' => $ctx->component_tipo];
        $query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} ? _Q1_)";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_NOT_EMPTY_VALUE_SQL (*)
    * Builds the SQL fragment for the "not empty" operator (*).
    *
    * Operator: * — "Not empty" / "Has data"
    * SQL pattern: (table_alias.column ? component_tipo)
    *
    * The '?' key-exists operator returns true when the JSONB object has the
    * component_tipo key. This means the component has at least one locator stored,
    * without constraining which target record it points to.
    *
    * Typical use: "Show me all Books that have at least one Author assigned."
    *
    * @param object $query_object - SQO clause; ->params and ->sentence are set
    * @param object $ctx          - context DTO with component_tipo, table_alias, column
    * @return object $query_object - SQO with sentence and params filled
    */
    protected static function resolve_relation_not_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params   = ['_Q1_' => $ctx->component_tipo];
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} ? _Q1_)";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_DIFFERENT_SQL (!=)
    * Builds the SQL fragment for the "different" operator (!=).
    *
    * Operator: != — "Has the key but does not contain the specific locator"
    * SQL pattern:
    *   (table_alias.column ? component_tipo) AND NOT (table_alias.column @> _Q1_::jsonb)
    *
    * This two-part condition means: the component has at least one relation (the key exists)
    * AND none of those relations match the given locator via JSONB containment.
    *
    * Contrast with !== (strict different, see below):
    *   !=  — excludes the specific locator but REQUIRES the component to have other relations.
    *          Records with no relations at all are NOT returned.
    *   !== — excludes the specific locator regardless; records with no relations ARE included.
    *
    * The query value is embedded as: {"component_tipo": [<locator JSON>]}
    * The JSONB @> operator checks that the right-hand side is contained within the left.
    * Negating it excludes rows where the locator appears anywhere in the array.
    *
    * Typical use: "Show me all Books that have an Author, but that Author is not Author A."
    *
    * @param object $query_object - SQO clause; ->params and ->sentence are set
    * @param string $q            - normalised JSON locator string (bare object, no outer array)
    * @param object $ctx          - context DTO with component_tipo, table_alias, column
    * @return object $query_object - SQO with sentence and params filled
    */
    protected static function resolve_relation_different_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params = [
            '_Q1_' => '{"' . $ctx->component_tipo . '":[' . $q . ']}',
            '_Q2_' => $ctx->component_tipo
        ];
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} ? _Q2_) AND NOT ({$ctx->table_alias}.{$ctx->column} @> _Q1_::jsonb)";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_STRICT_DIFFERENT_SQL (!==)
    * Builds the SQL fragment for the "strict different" operator (!==).
    *
    * Operator: !== — "Does not contain the specific locator at all (absolute absence)"
    * SQL pattern: NOT (table_alias.column @> _Q1_::jsonb)
    *
    * Unlike != (different), this operator does NOT require the component_tipo key to exist.
    * Records with no relations for this component (the key is absent entirely) also satisfy
    * NOT @>, so they ARE included in the result set.
    *
    * Summary of what each operator returns:
    *   !=  — has the key AND does not match: {"Author": [...but not Author A...]}
    *   !== — does not match OR has no key at all (includes completely empty records)
    *
    * The query value is embedded as: {"component_tipo": [<locator JSON>]}
    *
    * Typical use: "Show me all Books that are absolutely not written by Author A,
    *               including Books with no Author assigned at all."
    *
    * @param object $query_object - SQO clause; ->params and ->sentence are set
    * @param string $q            - normalised JSON locator string (bare object, no outer array)
    * @param object $ctx          - context DTO with component_tipo, table_alias, column
    * @return object $query_object - SQO with sentence and params filled
    */
    protected static function resolve_relation_strict_different_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params   = ['_Q1_' => '{"' . $ctx->component_tipo . '":[' . $q . ']}'];
        $query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} @> _Q1_::jsonb)";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_CONTAIN_SQL (Default / ==)
    * Builds the SQL fragment for the default "contains" operator (== / no operator).
    *
    * Operator: == (or no operator) — "Contains the specific locator"
    * SQL pattern: table_alias.column @> _Q1_::jsonb
    *
    * The PostgreSQL @> (contains) operator tests whether the left-hand JSONB value
    * is a superset of the right-hand value. Since locators are stored as an array of
    * objects keyed by component_tipo:
    *   {"dd20": [{"section_tipo":"es1","section_id":"42",...}, ...]}
    * the right-hand value is built as:
    *   {"dd20": [{"section_tipo":"es1","section_id":"42"}]}
    * JSONB containment matches when that exact object appears anywhere in the stored array.
    *
    * (!) $q must be a bare JSON object string without wrapping square brackets.
    *     extract_normalized_relation_q() guarantees this; do not call this method directly
    *     with raw client input.
    *
    * Typical use: "Show me all Books written by Author A."
    *
    * @param object $query_object - SQO clause; ->params and ->sentence are set
    * @param string $q            - normalised JSON locator string (bare object, no outer array)
    * @param object $ctx          - context DTO with component_tipo, table_alias, column
    * @return object $query_object - SQO with sentence and params filled
    */
    protected static function resolve_relation_contain_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params   = ['_Q1_' => '{"' . $ctx->component_tipo . '":[' . $q . ']}'];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @> _Q1_::jsonb";
        return $query_object;
    }



    /**
	* SEARCH_OPERATORS_INFO
	* Returns the map of operator tokens to their UI label keys for this component family.
	*
	* This method is called by the search UI builder to populate the operator selector
	* dropdown for relation components. The keys are the wire tokens sent in the SQO
	* (q_operator), and the values are i18n keys resolved on the client.
	*
	* Relation components intentionally do NOT advertise the '==' operator because the
	* default (no operator) already implies containment; adding '==' would duplicate it.
	*
	* Operator semantics (as implemented in dispatch_relation_operator_sql):
	*   '!*'  — is empty            (no locator array for this component)
	*   '*'   — not empty           (has at least one locator)
	*   '!='  — different from      (has other locators but not the specified one)
	*   '!==' — strict different from (does not contain the specified locator, includes empty)
	*
	* @return array $ar_operators - map of operator token => i18n key
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'!*'	=> 'empty',
			'*'		=> 'no_empty', // not null
			'!='	=> 'different_from',
			'!=='	=> 'strict_different_from'
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* ADD_RELATION_SEARCH
	* Extends a primary 'relation' clause to also search the 'relation_search' ancestor-index column.
	*
	* This method is called exclusively for component_autocomplete_hi (hierarchical thesaurus).
	* Those components store a denormalised flattened ancestor list in the separate 'relation_search'
	* JSONB column so that searching "by a parent term" automatically matches all descendant records
	* without traversing the tree at query time.
	*
	* The primary SQO ($query_object) targets the 'relation' column (direct locators).
	* A clone is created to target 'relation_search' (ancestor locators). The two clauses
	* are then combined with a logical group operator that depends on the active q_operator:
	*
	*   Positive / contain / strict-different ('==', '!==', '*'):
	*     Use $or — a match in EITHER column (direct OR ancestor) satisfies the filter.
	*
	*   Negation / empty ('!=', '!*'):
	*     Use $and — the record must NOT match in BOTH columns; this prevents a record from
	*     being returned when it satisfies the negation on 'relation' but is indexed under
	*     the excluded term in 'relation_search'.
	*
	*   Clone component_path special case:
	*     For all operators EXCEPT '==', the clone's component_path is explicitly set to
	*     ['relation_search'] so the cloned clause targets the ancestor-index column.
	*     When the operator IS '==', the branch is skipped and the clone retains its inherited
	*     component_path (['relations'] from get_relation_search_context), meaning both the
	*     primary and the clone target the 'relation' column for '=='. This appears to be an
	*     oversight — the clone should probably also target 'relation_search' for '==' — but
	*     the current code leaves it unchanged for that operator.
	*
	* The returned object is a wrapper: {$or: [clause_relations, clause_relation_search]}
	* or {$and: [...]}, not the original flat SQO. search::build_sql_query_where() handles
	* these compound objects recursively.
	*
	* @param object $query_object - SQO clause already built for the 'relation' column
	* @return object $new_query_object - compound wrapper with $or/$and containing both clauses
	*/
	protected static function add_relation_search( object $query_object ) : object {

		// q_operator
		$q_operator = $query_object->q_operator ?? null;

		// Clone and modify query_object for search in relation_search too if the operator is different to ==
        $relation_search_obj = clone $query_object;
        if ($q_operator!=='==') {
            $relation_search_obj->component_path = ['relation_search'];
        }

		// Group the two query_object in a 'or' clause
		$operator = '$or';
		if ($q_operator==='!=' || $q_operator==='!*') {
			$operator = '$and';
		}
		$new_query_object = new stdClass();
			$new_query_object->{$operator} = [$query_object, $relation_search_obj];


		return $new_query_object;
	}//end add_relation_search



}//end search_component_relation_common
