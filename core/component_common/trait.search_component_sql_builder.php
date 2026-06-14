<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_SQL_BUILDER
* Shared scaffolding for the per-component search SQL builders. These helpers were copy-pasted
* (byte-identical, only renamed) across the string-family search traits; centralising them here
* removes that duplication while leaving each component's operator dispatch and per-operator
* resolve_*_sql methods family-specific.
*
* Used by: search_component_string_common, search_component_iri.
* (Other families - number/date/json/media - have divergent context/extract logic and migrate
* incrementally with their own golden-SQL coverage.)
*
* Contract: a using trait/class calls self::extract_normalized_q(), self::split_search_terms()
* and self::get_search_context() from its resolve_query_object_sql() pipeline. get_search_context()
* uses late static binding (get_called_class()) to resolve the component's data column.
*/
trait search_component_sql_builder {



	/**
	* EXTRACT_NORMALIZED_Q
	* Extracts and normalizes the search value from the query object.
	* @param object $query_object
	* @return string|false
	*/
	protected static function extract_normalized_q(object $query_object) : string|false {

		$q_raw = isset($query_object->q) && is_array($query_object->q)
			? $query_object->q[0]
			: ($query_object->q ?? null);

		if ((empty($q_raw) || (is_object($q_raw) && empty($q_raw->value))) && empty($query_object->q_operator)) {
			return false;
		}

		$q = (is_object($q_raw) ? $q_raw->value : $q_raw) ?? '';

		return stripslashes($q);
	}//end extract_normalized_q



	/**
	* SPLIT_SEARCH_TERMS
	* Process operators and wildcards before splitting the query string.
	* @param string $q
	* @return array
	*/
	protected static function split_search_terms(string $q) : array {

		// Join operators with next word (remove space)
		// Operators: !=, ==, !!, !*, =, -
		$q = preg_replace('/(\!=|==|!!|!*|=|-)\s+/', '$1', $q);

		// Join wildcard at the end (remove space before wildcard)
		$q = preg_replace('/\s+(\*)/', '$1', $q);

		return preg_split('/\s/', $q, -1, PREG_SPLIT_NO_EMPTY);
	}//end split_search_terms



	/**
	* GET_SEARCH_CONTEXT
	* Validates the path and collects the metadata needed for SQL generation (component tipo,
	* translatable flag, data column, table alias/name and q_operator). Also sets the default
	* type ('string') and lang on the query_object.
	* @param object $query_object
	* @return object|false
	*/
	protected static function get_search_context(object $query_object) : object|false {

		if (empty($query_object->path) || !is_array($query_object->path)) {
			debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
			return false;
		}

		$path_end       = end($query_object->path);
		$component_tipo = $path_end->component_tipo;

		$ctx = new stdClass();
		$ctx->component_tipo = $component_tipo;
		$ctx->translatable   = ontology_node::get_translatable($component_tipo);
		$ctx->column         = section_record_data::get_column_name(get_called_class());
		$ctx->table_alias    = $query_object->table_alias;
		$ctx->table          = $query_object->table;
		$ctx->q_operator     = $query_object->q_operator ?? null;

		// Set defaults on query_object
		$query_object->type = 'string';
		$query_object->lang = $query_object->lang ?? DEDALO_DATA_LANG;

		return $ctx;
	}//end get_search_context



}//end search_component_sql_builder
