<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_RELATION_CHILDREN
 * SQL search logic for component_relation_children — the inverse-parent relation component.
 *
 * Why a separate trait instead of reusing search_component_relation_common:
 * component_relation_children holds NO data of its own in the `relation` JSONB column.
 * Child records are discovered by looking at the child section's own `relation` column
 * and finding rows that carry the *parent's* section_id inside their
 * component_relation_parent locator array. All operator handlers therefore produce
 * EXISTS / NOT EXISTS correlated sub-selects against the same matrix table, rather than
 * the direct `@>` JSONB containment queries used by the common search trait.
 *
 * Storage layout (relevant columns in the matrix table):
 * - `relation`  : JSONB column keyed by component tipo, value is an array of locator
 *                 objects each containing at minimum `section_tipo` and `section_id`.
 *                 component_relation_children writes to this column in 'search' mode
 *                 only (for filter-record queries); in normal mode data is virtual.
 * - `section_id`: Primary record identifier used by the correlated sub-selects below
 *                 to connect a child row back to the parent currently being evaluated.
 *
 * Pipeline (entry point → resolve_query_object_sql):
 * 1. extract_normalized_relation_q  — strip the `id` helper property, JSON-encode
 *    non-strings, unwrap single-element arrays.
 * 2. get_relation_search_context    — extract component tipo from SQO path, resolve
 *    the target_parent_tipo (the component_relation_parent counterpart), collect
 *    table/alias references.
 * 3. dispatch_relation_operator_sql — route to the correct operator handler.
 *
 * Used by: component_relation_children (via `use search_component_relation_children`).
 * Parallel traits: search_component_relation_common (standard relation JSONB checks),
 *                  search_component_relation_index.
 *
 * @package Dédalo
 * @subpackage Core
 */
trait search_component_relation_children {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Public entry point for the children-relation SQL search pipeline.
	*
	* Transforms a raw search_query_object (SQO) produced by the search layer into a
	* fully resolved SQO that carries a `sentence` string and a `params` map, ready to
	* be interpolated by the WHERE-builder trait into a prepared statement.
	*
	* Unlike component_relation_common::resolve_query_object_sql, this implementation
	* emits correlated EXISTS / NOT EXISTS sub-selects because child membership is
	* stored in the *child's* own `relation` JSONB column under the parent component
	* tipo, not in the parent's column.
	*
	* Returns false when the SQO is structurally invalid (missing path or component tipo)
	* so the caller can skip the clause entirely.
	*
	* @param object $query_object The SQO received from the search layer. Must contain
	*   a valid `path` array and a `table_alias` / `table` for the target section.
	* @return object|false The enriched SQO with `sentence` and `params` set, or false
	*   if the SQO cannot be resolved (invalid path or missing parent tipo).
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
		// The returned $query_object carries `sentence` and `params` set by the handler.
        $query_object = self::dispatch_relation_operator_sql($query_object, $q, $ctx);

		return $query_object;
	}//end resolve_query_object_sql



	/**
    * EXTRACT_NORMALIZED_RELATION_Q
    * Extracts and normalizes the search query value (q) from the SQO into a canonical
    * JSON string safe for interpolation into prepared-statement params.
    *
    * Normalisation steps applied in order:
    * 1. Strip the `id` helper property from the locator object when present.
    *    The client UI attaches an `id` to make locators trackable in the DOM; it must
    *    not reach the SQL layer because it is not part of the stored data shape.
    * 2. JSON-encode non-string values so all further processing works on strings.
    * 3. Strip outer `[…]` brackets produced when a single-element array is encoded,
    *    leaving a bare JSON object string ready for use as `_Q2_` in the sub-selects.
    * 4. Safety gate: reject any value that is not an object literal (`{`) and is not
    *    the sentinel 'only_operator' (used by operators that need no q value).
    *    Invalid values are replaced by `[]` and logged at ERROR level.
    *
    * Note: this method has the same name as its counterpart in
    * search_component_relation_common but different logic — the format/type guard
    * found in the common trait is omitted here because children queries always
    * receive structured locator objects, never plain function strings.
    *
    * @param object $query_object The SQO with a `q` property holding a locator or
    *   locator array, or the string sentinel 'only_operator'.
    * @return string|false Normalised JSON string on success, false on fatal error.
    *   (Currently always returns a string; false reserved for future guard paths.)
    */
    protected static function extract_normalized_relation_q(object $query_object) : string|false {

        $q_raw  = $query_object->q ?? null;

		// Remove the id property from q_raw if exists
		// The `id` property is a client-side DOM handle; it must not reach the SQL layer
		// because it is absent from the stored locator shape in the `relation` column.
		if (is_object($q_raw) && isset($q_raw->id)) {
			unset($q_raw->id);
		}

        // For unification, all non string are JSON encoded
        // Locator objects and arrays become JSON strings; plain string sentinels pass through.
        $q = is_string($q_raw) ? $q_raw : json_encode($q_raw);

        // Remove initial and final array square brackets if they exist
        // A single-element locator submitted as an array becomes e.g. '[{"section_tipo":"…"}]';
        // stripping the brackets leaves the bare object string expected by the sub-select params.
        if (strpos($q, '[') === 0) {
            $q = preg_replace('/^(\[)(.*)(\])$/m', '$2', $q);
        }

        // Safe q check
        // Reject values that do not look like a JSON object literal and are not the
        // 'only_operator' sentinel used by unary operators (!*, *).
        if (strpos($q, '{') === false && $q !== 'only_operator') {
            debug_log(__METHOD__ . ' Ignored invalid unsafe q: ' . to_string($q), logger::ERROR);
            $q = '[]';
        }

        return $q;
    }


	/**
    * GET_RELATION_SEARCH_CONTEXT
    * Validates the SQO path and assembles an anonymous context object (`$ctx`) that
    * is passed unchanged to every operator handler, keeping their signatures lean.
    *
    * Properties set on the returned $ctx:
    * - component_tipo    : The ontology tipo of the component_relation_children node
    *                       being searched (last element of `path`).
    * - column            : DB column name for this component model (always 'relation'
    *                       for component_relation_children, per section_record_data::$column_map).
    * - table_alias       : Alias for the outer / primary table in the correlated query.
    * - table             : Actual table name for the sub-select FROM clause.
    * - q_operator        : Raw operator string ('!*', '*', '!=', '!==', or null for default).
    * - target_parent_tipo: The ontology tipo of the paired component_relation_parent.
    *                       Resolved via component_relation_children::get_ar_related_parent_tipo().
    *                       This is the JSONB key used as the top-level key in the child's
    *                       `relation` column, e.g. relation->>'dd47'.
    *
    * Side-effect: sets $query_object->type = 'jsonb' to signal the WHERE builder that
    * this clause operates on a JSONB column.
    *
    * (!) Known limitation — hardcoded fallback section_tipo:
    * get_ar_related_parent_tipo is called with 'hierarchy20' as $section_tipo because
    * the true section tipo of the *child* row is not available in the SQO path at this
    * point. 'hierarchy20' is the standard thesaurus section tipo so it usually resolves
    * correctly, but will produce an incorrect result for non-thesaurus hierarchies.
    * This is an acknowledged architectural limitation documented inline in the source.
    *
    * @param object $query_object The SQO; must have a non-empty `path` array with
    *   each element providing a `component_tipo` property, plus `table_alias` and
    *   `table` properties from the search builder.
    * @return object|false Context object on success; false if path is missing,
    *   component tipo is empty, or the parent tipo cannot be resolved.
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
        $ctx->column         = section_record_data::get_column_name(get_called_class());
        $ctx->table_alias    = $query_object->table_alias;
		$ctx->table          = $query_object->table;
        $ctx->q_operator     = $query_object->q_operator ?? null;

        // Set defaults on query_object
        $query_object->type = 'jsonb';

		// target_parent_tipo
		// (!) 'hierarchy20' is a known approximation: the actual child section tipo is
		// not carried by the SQO at this stage. For standard thesaurus sections this
		// resolves correctly; for other hierarchical section tipos the fallback inside
		// get_ar_related_parent_tipo (scanning the section ontology) handles it.
		$ar_target_parent_tipo	= component_relation_children::get_ar_related_parent_tipo(
			$component_tipo,
			'hierarchy20' // ITS NOT CORRECT, but is not possible know the section_tipo here
		);
		$target_parent_tipo = $ar_target_parent_tipo[0] ?? null;
		if(empty($target_parent_tipo)){
			debug_log(__METHOD__
				. " Invalid target parent tipo " . PHP_EOL
				. ' ar_target_parent_tipo: ' . to_string($ar_target_parent_tipo) . PHP_EOL
				. ' query_object: ' . to_string($query_object)
				, logger::ERROR
			);
			return false;
		}
		$ctx->target_parent_tipo = $target_parent_tipo;

        return $ctx;
    }


	/**
    * DISPATCH_RELATION_OPERATOR_SQL
    * Routes the resolved search context to the appropriate operator handler based on
    * $ctx->q_operator, then returns the enriched query_object.
    *
    * Operator semantics for children relations:
    * - '!*'  → resolve_relation_empty_value_sql    — parent has NO children at all.
    * - '*'   → resolve_relation_not_empty_value_sql — parent has at least one child.
    * - '!='  → resolve_relation_different_sql       — parent has children, but NOT
    *            the specific one identified by $q (i.e. has data, excludes X).
    * - '!==' → resolve_relation_strict_different_sql — parent does NOT reference the
    *            specific child at all, regardless of whether other children exist.
    * - default (null / '==') → resolve_relation_contain_sql — parent references the
    *            specific child identified by $q.
    *
    * The '!=' vs '!==' distinction mirrors the difference between "has other children
    * but not X" (!=) and "has absolutely no link to X" (!==, includes empty parents).
    *
    * @param object $query_object The SQO to populate with `sentence` and `params`.
    * @param string $q Normalised locator JSON string from extract_normalized_relation_q.
    * @param object $ctx Context from get_relation_search_context.
    * @return object The modified $query_object.
    */
    protected static function dispatch_relation_operator_sql(object $query_object, string $q, object $ctx) : object {

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
    * Operator '!*' — "parent has NO children at all."
    *
    * Produces a NOT EXISTS correlated sub-select that returns true when no row in the
    * child table carries the current parent's section_id inside the locator array
    * stored under the target_parent_tipo key of its `relation` JSONB column.
    *
    * SQL pattern:
    *   NOT EXISTS (
    *     SELECT 1 FROM "<table>" AS sub
    *     CROSS JOIN LATERAL jsonb_array_elements(
    *       CASE WHEN jsonb_typeof(sub.relation->_Q1_) = 'array'
    *            THEN sub.relation->_Q1_
    *            ELSE jsonb_build_array(sub.relation->_Q1_)
    *       END
    *     ) AS elem
    *     WHERE sub.relation ? _Q1_
    *       AND elem->>'section_id' = <outer>.section_id::text
    *   )
    *
    * The CASE/jsonb_build_array guard normalises both array and single-object storage
    * shapes so the lateral unnest never errors on a bare object value.
    * The ::text cast on section_id bridges integer-vs-string ambiguity in stored data.
    *
    * Params: _Q1_ = ctx->target_parent_tipo (the component_relation_parent ontology tipo).
    *
    * @param object $query_object The SQO to populate.
    * @param object $ctx Context object from get_relation_search_context.
    * @return object The modified $query_object.
    */
	protected static function resolve_relation_empty_value_sql(object $query_object, object $ctx) : object {

		$query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo
		];

		/**
		 * Use NOT EXISTS for efficiency.
		 * Use ::text comparison for section_id to ensure matching works regardless of
		 * whether the ID is stored as a string or a number in the JSONB column.
		 */
		$query_object->sentence = "NOT EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
		)";

		return $query_object;
	}



    /**
    * RESOLVE_RELATION_NOT_EMPTY_VALUE_SQL (*)
    * Operator '*' — "parent has at least one child."
    *
    * Mirror of resolve_relation_empty_value_sql: uses an EXISTS instead of NOT EXISTS.
    * Returns true for every parent section_id that appears in at least one child row's
    * `relation`->_Q1_ locator array, making it the logical complement of '!*'.
    *
    * Params: _Q1_ = ctx->target_parent_tipo.
    *
    * @param object $query_object The SQO to populate.
    * @param object $ctx Context object from get_relation_search_context.
    * @return object The modified $query_object.
    */
    protected static function resolve_relation_not_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo
		];

		$query_object->sentence = "EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
		)";

        return $query_object;
    }



	/**
    * RESOLVE_RELATION_DIFFERENT_SQL (!=)
	* Operator '!=' — "parent has children, but NOT child X."
	*
	* Translation: "Has data but does not include X."
	* Technical Logic: (EXISTS any child) AND (NOT EXISTS specific child X)
	*
	* Unlike '!==', this operator requires the parent to have at least one child relation:
	* - Records with some children, none of which is X — INCLUDED.
	* - Records with no children at all — EXCLUDED (has-data guard via first EXISTS).
	*
	* This is useful when the intent is "still related to something, just not X", e.g.
	* "Show me Books with at least one Author, but NOT Author A."
	*
	* The SQL builds two correlated sub-selects:
	* 1. EXISTS — parent has at least one child of any value.
	* 2. NOT EXISTS — parent has no child matching the specific section_id + section_tipo
	*    from $q (a JSON object string like `{"section_tipo":"…","section_id":"…"}`).
	*
	* Params:
	*   _Q1_ = ctx->target_parent_tipo (JSONB key in child's relation column).
	*   _Q2_ = normalised locator JSON string for the specific child to exclude.
	*
	* @param object $query_object The SQO to populate.
	* @param string $q Normalised locator JSON for the target child (from extract_normalized_relation_q).
	* @param object $ctx Context object from get_relation_search_context.
	* @return object The modified $query_object.
	*/
    protected static function resolve_relation_different_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo,
			'_Q2_' => $q
		];

		/**
		 * Different (!=): Record has data (children) AND the target child is not present.
		 * Logic: (EXISTS any child) AND (NOT EXISTS specific child X).
		 * The first EXISTS enforces the "has data" requirement; the NOT EXISTS
		 * filters out rows where the specific child appears.
		 */
		$query_object->sentence = "EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
		) AND NOT EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
			  AND sub.section_id::text = (_Q2_::jsonb->>'section_id')
			  AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo')
		)";

        return $query_object;
    }



	/**
    * RESOLVE_RELATION_STRICT_DIFFERENT_SQL (!==)
	* Operator '!==' — "parent does NOT reference child X at all."
	*
	* Translation: "Has absolutely no link to X, regardless of other children."
	* Technical Logic: NOT EXISTS (single specific child check).
	*
	* Unlike '!=', this operator does NOT require the parent to have any children:
	* - Records with some children, none of which is X — INCLUDED.
	* - Records with no children at all (empty) — ALSO INCLUDED.
	*
	* Use this when the intent is absolute absence: "Show me all Books that are NOT
	* linked to Author A at all" (includes books with no author assigned yet).
	*
	* The SQL uses a single NOT EXISTS that tests for section_id AND section_tipo match
	* against the specific locator from $q.
	*
	* Params:
	*   _Q1_ = ctx->target_parent_tipo.
	*   _Q2_ = normalised locator JSON string for the specific child to exclude.
	*
	* @param object $query_object The SQO to populate.
	* @param string $q Normalised locator JSON for the target child.
	* @param object $ctx Context object from get_relation_search_context.
	* @return object The modified $query_object.
	*/
    protected static function resolve_relation_strict_different_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo,
			'_Q2_' => $q
		];

		$query_object->sentence = "NOT EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
			  AND sub.section_id::text = (_Q2_::jsonb->>'section_id')
			  AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo')
		)";

        return $query_object;
    }



	/**
    * RESOLVE_RELATION_CONTAIN_SQL (Default)
    * Default operator (null / '==') — "parent references child X."
    *
    * Produces an EXISTS sub-select that returns true when the parent's section_id
    * appears in the child's locator array AND the child's section_id and section_tipo
    * match the specific locator in $q.
    *
    * This is the standard "contains" / equals check for relation children:
    * "Find all parents that have child X."
    *
    * The double match on both section_id AND section_tipo prevents false positives
    * when multiple section types share the same numeric section_id values.
    *
    * Params:
    *   _Q1_ = ctx->target_parent_tipo.
    *   _Q2_ = normalised locator JSON string for the target child to match.
    *
    * @param object $query_object The SQO to populate.
    * @param string $q Normalised locator JSON for the target child.
    * @param object $ctx Context object from get_relation_search_context.
    * @return object The modified $query_object.
    */
    protected static function resolve_relation_contain_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo,
			'_Q2_' => $q
		];

		$query_object->sentence = "EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
			  AND sub.section_id::text = (_Q2_::jsonb->>'section_id')
			  AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo')
		)";

        return $query_object;
    }



	/**
	* SEARCH_OPERATORS_INFO
	* Returns the set of filter operators supported by this component for use in the
	* search UI and SQO validation.
	*
	* Operators defined here correspond exactly to the dispatch branches in
	* dispatch_relation_operator_sql:
	* - '!*'  : empty — parent has no children.
	* - '*'   : no_empty — parent has at least one child.
	* - '!='  : different_from — parent has children but not the specified one.
	* - '!==' : strict_different_from — parent has no link to the specified child
	*           (includes parents with no children at all).
	*
	* Note: this trait's search_operators_info overrides the one in
	* search_component_relation_common which is also used by other relation types.
	* The class component_relation_children further overrides this method to return
	* an empty array, restricting operator availability in non-search contexts.
	*
	* @return array<string,string> Map of operator symbol to operator name.
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



}//end search_component_relation_children
