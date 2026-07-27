<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_RELATION_INDEX
 * SQL search logic for component_relation_index — the inverse-relation (indexation) component.
 *
 * Why this trait exists instead of reusing search_component_relation_common:
 * component_relation_index does NOT query the local 'relation' JSONB column of the
 * section being searched. Instead, it asks: "which other sections currently hold a
 * reverse link (dd96 / DEDALO_RELATION_TYPE_INDEX_TIPO) that points back to THIS section?"
 * That list of section_id values is obtained via component_relation_index::get_references_to_section(),
 * which internally calls search_related::get_referenced_locators(). The resulting WHERE
 * clause is therefore an IN / NOT IN against the section_id column, not a JSONB containment
 * check against the relation column.
 *
 * Operator semantics (only two operators are supported):
 *   *   — not-empty (indexed): section_id IN (list of referencing section_ids)
 *         Returns records that ARE referenced by at least one other section.
 *   !*  — empty (not indexed): section_id NOT IN (list of referencing section_ids)
 *         Returns records that are NOT referenced by any other section (orphans).
 *
 * Degenerate / edge cases:
 *   When get_references_to_section() returns an empty array (no references exist at all),
 *   the operator handlers emit the deterministic literals "1=0" (*) and "1=1" (!*)
 *   respectively, which PostgreSQL optimises out without a table scan.
 *
 * Pipeline (entry point → SQL fragment):
 *   1. get_relation_index_search_context  — validate SQO path, extract section_tipo
 *      and table_alias; return a compact $ctx object.
 *   2. dispatch_relation_index_operator_sql — switch on $ctx->q_operator and call the
 *      appropriate handler, or return $query_object unchanged for unrecognised operators.
 *
 * Used by: component_relation_index (via `use search_component_relation_index`).
 * Parallel traits: search_component_relation_common (standard JSONB relation checks),
 *                  search_component_relation_children (EXISTS correlated sub-selects).
 *
 * @package Dédalo
 * @subpackage Core
 */
trait search_component_relation_index {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Public entry point for the relation-index SQL search pipeline.
	*
	* Transforms a raw search_query_object (SQO) into a resolved SQO whose `sentence`
	* property holds a PostgreSQL WHERE fragment ready to be embedded by the WHERE-builder
	* trait. Unlike the standard relation common trait, the produced fragment targets the
	* `section_id` column (via IN / NOT IN) rather than the JSONB `relation` column,
	* because indexation references are discovered by querying back-pointers stored in
	* OTHER section records.
	*
	* Returns false when the SQO is structurally invalid (missing or malformed path array),
	* signalling to the caller that the clause should be skipped entirely.
	*
	* @todo This method returns false (and therefore matches nothing) when
	*   get_references_to_section() encounters an error. The operator handlers handle
	*   the empty-references case with deterministic literals (1=0 / 1=1), but a runtime
	*   failure inside get_references_to_section() is currently indistinguishable from
	*   "no references found". Consider propagating a distinct error signal.
	*
	* @param object $query_object The SQO received from the search layer. Must contain
	*   a valid `path` array with at least one element carrying `section_tipo`, and a
	*   `table_alias` string identifying the target section's SQL alias.
	* @return object|false The enriched SQO with `sentence` set, or false if the SQO
	*   cannot be resolved (invalid path).
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Gather Search Context
        $ctx = self::get_relation_index_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 2. Dispatch to Specific Operator Handler
        return self::dispatch_relation_index_operator_sql($query_object, $ctx);
    }



    /**
    * GET_RELATION_INDEX_SEARCH_CONTEXT
    * Validates the SQO path and collects the metadata needed to build the SQL fragment.
    *
    * The only fields required from the SQO for this trait are:
    *   - path[-1].section_tipo : the ontology tipo of the section whose indexation is queried.
    *   - table_alias           : the PostgreSQL alias for that section's matrix table in the
    *                             enclosing SELECT (e.g. "te3").
    *   - q_operator            : the search operator string ('*' or '!*').
    *
    * Returns false when the path is absent or not an array; the caller propagates this as
    * a false return from resolve_query_object_sql().
    *
    * @param object $query_object The SQO to inspect.
    * @return object|false A compact context object with `section_tipo`, `table_alias`, and
    *   `q_operator` properties; or false if the path is invalid.
    */
    protected static function get_relation_index_search_context(object $query_object) : object|false {

        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
            return false;
        }

        $path_end = end($query_object->path);

        $ctx = new stdClass();
        $ctx->section_tipo = $path_end->section_tipo;
        $ctx->table_alias  = $query_object->table_alias;
        $ctx->q_operator   = $query_object->q_operator ?? null;

        return $ctx;
    }



    /**
    * DISPATCH_RELATION_INDEX_OPERATOR_SQL
    * Routes the search to the correct operator handler based on $ctx->q_operator.
    *
    * Only two operators are supported by this component family:
    *   '*'  — not-empty: delegates to resolve_relation_index_not_empty_sql().
    *   '!*' — empty    : delegates to resolve_relation_index_empty_sql().
    *
    * Any other operator (or null) falls through to the default case, which returns the
    * $query_object unmodified (no sentence is set). Callers in the WHERE-builder trait
    * will therefore emit no SQL clause for unrecognised operators.
    *
    * @param object $query_object The SQO being resolved; mutated in-place by the handler.
    * @param object $ctx          Context object produced by get_relation_index_search_context().
    * @return object The resolved (or unchanged) SQO.
    */
    protected static function dispatch_relation_index_operator_sql(object $query_object, object $ctx) : object {

        switch ($ctx->q_operator) {
            case '*':
                return self::resolve_relation_index_not_empty_sql($query_object, $ctx);

            case '!*':
                return self::resolve_relation_index_empty_sql($query_object, $ctx);

            default:
                // Other operators or no operator.
                // @todo Handle specific q values if necessary
                return $query_object;
        }
    }



    /**
    * RESOLVE_RELATION_INDEX_NOT_EMPTY_SQL (*)
    * Builds the WHERE fragment for the "indexed / referenced" case (*).
    *
    * Operator semantics:
    *   Translation : "This record is pointed to by at least one other section."
    *   SQL pattern : <alias>.section_id IN (id1, id2, ...)
    *   Use case    : Find all thesaurus terms (or any section) that are actively used
    *                 as relation targets by other records in the system.
    *
    * Degenerate case — no references found:
    *   When get_references_to_section() returns an empty array, emits "1=0" which
    *   PostgreSQL treats as a constant false, matching zero rows without a scan.
    *   This is the correct semantic: if nobody references this section tipo,
    *   no record of it can be "indexed".
    *
    * The reference list is obtained via component_relation_index::get_references_to_section(),
    * which itself uses an internal cache to avoid repeated search_related lookups during
    * mass-publication runs. Each element of $references is cast to int via intval() before
    * being interpolated into the IN list, preventing SQL injection from stale cache entries.
    *
    * @param object $query_object The SQO being resolved; `sentence` is set on return.
    * @param object $ctx          Context object carrying `section_tipo` and `table_alias`.
    * @return object The SQO with `sentence` set.
    */
    protected static function resolve_relation_index_not_empty_sql(object $query_object, object $ctx) : object {

        $references = component_relation_index::get_references_to_section($ctx->section_tipo);

        if (empty($references)) {
            // No references exist, so NO record of this type is indexed.
            $query_object->sentence = "1=0";
            return $query_object;
        }

		// sentence
		$query_object->sentence = "{$ctx->table_alias}.section_id IN (" . implode(',', array_map('intval', $references)) . ")";

        return $query_object;
    }



    /**
    * RESOLVE_RELATION_INDEX_EMPTY_SQL (!*)
    * Builds the WHERE fragment for the "not indexed / orphan" case (!*).
    *
    * Operator semantics:
    *   Translation : "This record is NOT pointed to by any other section."
    *   SQL pattern : <alias>.section_id NOT IN (id1, id2, ...)
    *   Use case    : Find thesaurus terms (or any section) that are unused/orphaned —
    *                 no other record holds a reverse link of type dd96 pointing to them.
    *
    * Degenerate case — no references found:
    *   When get_references_to_section() returns an empty array, emits "1=1" which
    *   PostgreSQL treats as a constant true, matching every row without a scan.
    *   This is the correct semantic: if nobody references this section tipo at all,
    *   then every record of it is by definition "not indexed".
    *
    * See also the note in resolve_relation_index_not_empty_sql() on intval() usage
    * and the internal reference cache.
    *
    * @param object $query_object The SQO being resolved; `sentence` is set on return.
    * @param object $ctx          Context object carrying `section_tipo` and `table_alias`.
    * @return object The SQO with `sentence` set.
    */
    protected static function resolve_relation_index_empty_sql(object $query_object, object $ctx) : object {

        $references = component_relation_index::get_references_to_section($ctx->section_tipo);

        if (empty($references)) {
            // No references exist, so ALL records of this type are "empty" (not indexed).
            $query_object->sentence = "1=1";
            return $query_object;
        }

		// sentence
		$query_object->sentence = "{$ctx->table_alias}.section_id NOT IN (" . implode(',', array_map('intval', $references)) . ")";

        return $query_object;
    }



	/**
	* SEARCH_OPERATORS_INFO
	* Returns the set of operators this component advertises to the client search UI.
	*
	* component_relation_index supports only existence checks — there is no meaningful
	* "contains specific value" operator because the indexation back-pointers are
	* computed dynamically from other sections rather than stored as user-editable data.
	*
	* @return array $ar_operators Associative map of operator symbol => label string.
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'		=> 'no_empty',
			'!*'	=> 'empty'
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_relation_index
