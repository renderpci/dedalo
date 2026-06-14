<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_SQL_BUILDER
* Shared scaffolding for the per-component search SQL builders in the string-value family.
*
* Background: the three pipeline helpers below (extract_normalized_q, split_search_terms,
* get_search_context) were originally copy-pasted verbatim across every string-family search
* trait. Centralising them here removes that duplication while leaving each component's operator
* dispatch and per-operator resolve_*_sql methods family-specific (the concrete SQL patterns
* differ between component_input_text and component_iri, for example).
*
* Current consumers:
*   - search_component_string_common  (component_input_text, component_text_area, …)
*   - search_component_iri
*
* Non-consumers (migrate independently):
*   - number / date / json / media families — each has divergent context/extract logic and
*     carries its own golden-SQL coverage; they are not expected to use this trait.
*
* Integration contract for a consuming trait:
*   1. `use search_component_sql_builder;` inside the trait body.
*   2. In resolve_query_object_sql(), call the three helpers in order:
*        $q   = self::extract_normalized_q($query_object);  // bail on empty
*        ...optional q_split fan-out via handle_query_splitting()...
*        $ctx = self::get_search_context($query_object);    // bail on bad path
*        self::dispatch_*_sql($query_object, $q, $ctx);     // family-specific
*   3. get_search_context() relies on late static binding (get_called_class()) to map
*      the concrete component class name to its JSONB data column via
*      section_record_data::get_column_name(). Each using class must therefore be registered
*      in section_record_data::$column_map.
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_sql_builder {



	/**
	* EXTRACT_NORMALIZED_Q
	* Extracts, unwraps, and normalises the raw search value from the SQO (Search Query Object).
	*
	* The SQO `q` field can arrive in two shapes from the client:
	*   - A plain scalar:  $query_object->q = "search term"
	*   - A single-element array wrapping either a scalar or a value-object:
	*       $query_object->q = ["search term"]
	*       $query_object->q = [{"value": "search term", ...}]
	* This method normalises all three forms into a single clean string.
	*
	* Early-exit logic: if both q and q_operator are absent/empty the search cannot be
	* constructed, so false is returned and the caller should short-circuit. An operator-only
	* query (e.g. `!*` / `*` sent via q_operator without a literal q value) is still valid
	* and must NOT short-circuit — hence the `empty($query_object->q_operator)` guard.
	*
	* @param object $query_object - The incoming SQO; reads ->q and ->q_operator.
	* @return string|false        - Normalised search term, or false if neither q nor
	*                               q_operator carries a usable value.
	*/
	protected static function extract_normalized_q(object $query_object) : string|false {

		// Unwrap array wrapper: the client may send q as a single-element array.
		$q_raw = isset($query_object->q) && is_array($query_object->q)
			? $query_object->q[0]
			: ($query_object->q ?? null);

		// Bail only when both q and q_operator are absent; an operator-only query is valid.
		if ((empty($q_raw) || (is_object($q_raw) && empty($q_raw->value))) && empty($query_object->q_operator)) {
			return false;
		}

		// Unwrap value-object form ({"value": "...", ...}) to a plain string.
		$q = (is_object($q_raw) ? $q_raw->value : $q_raw) ?? '';

		// Remove any escaping added by the client (e.g. magic-quote artefacts).
		return stripslashes($q);
	}//end extract_normalized_q



	/**
	* SPLIT_SEARCH_TERMS
	* Tokenises a multi-word query string into individual search terms, preserving
	* operator prefixes and trailing wildcards that are attached to their term.
	*
	* Two pre-processing steps collapse accidental whitespace that a user may have
	* typed between an operator/wildcard and its adjacent word, so that terms like
	* "!= foo" and "!=foo" produce the same token ("!=foo"):
	*
	*   Step 1 — operator-prefix compaction:
	*     Recognised prefix operators: !=  ==  !!  !*  =  -
	*     Any whitespace between the operator and the following word is removed.
	*     Example: "!= foo bar"  →  "!=foo bar"  →  ["!=foo", "bar"]
	*
	*   Step 2 — trailing-wildcard compaction:
	*     Any whitespace before a trailing '*' is removed so "foo *" stays one token.
	*     Example: "foo * bar"   →  "foo* bar"   →  ["foo*", "bar"]
	*
	* The resulting tokens are then fed individually back through resolve_query_object_sql()
	* by handle_query_splitting() (in component_common), which combines them with a boolean
	* $and / $or operator chosen by the caller.
	*
	* @param string $q  - The raw (already stripped) search string.
	* @return array     - Non-empty token list; at minimum one element.
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
	* Validates the SQO path and assembles the context object ($ctx) that every
	* operator-specific SQL builder method expects. Also writes two defaults onto
	* $query_object as a side-effect.
	*
	* The SQO path is an ordered array of path-step objects describing the join chain
	* from the root section down to the target component. The LAST element always
	* represents the leaf component being searched; its component_tipo is the JSONB
	* key used in all subsequent SQL jsonpath expressions.
	*
	* Late static binding (get_called_class()) maps the concrete component class name
	* (e.g. 'component_input_text') to its JSONB data column (e.g. 'string') via
	* section_record_data::get_column_name(). The result must be non-null; if the
	* class is not registered in $column_map the generated SQL will be broken.
	*
	* Returned $ctx shape:
	*   ->component_tipo  string   Ontology tipo of the leaf component (JSONB key)
	*   ->translatable    bool     Whether the component stores language-keyed data
	*   ->column          ?string  JSONB data column name ('string', 'text', …)
	*   ->table_alias     string   SQL alias of the matrix table for the current path
	*   ->table           string   Actual matrix table name (used for self-join in !!)
	*   ->q_operator      ?string  Operator string from the SQO, or null
	*
	* Side-effects on $query_object:
	*   ->type   set to 'string' (consumed by the outer search WHERE-clause builder)
	*   ->lang   defaulted to DEDALO_DATA_LANG if not already set by the client
	*
	* @param object $query_object - The SQO to validate and derive context from.
	* @return object|false        - Populated $ctx, or false on an invalid/missing path.
	*/
	protected static function get_search_context(object $query_object) : object|false {

		if (empty($query_object->path) || !is_array($query_object->path)) {
			debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
			return false;
		}

		// The last path step identifies the target component being searched.
		$path_end       = end($query_object->path);
		$component_tipo = $path_end->component_tipo;

		$ctx = new stdClass();
		$ctx->component_tipo = $component_tipo;
		// translatable drives whether SQL jsonpath filters by ->lang or uses all entries.
		$ctx->translatable   = ontology_node::get_translatable($component_tipo);
		// Late static binding: resolves 'component_input_text' → 'string', 'component_iri' → 'iri', etc.
		$ctx->column         = section_record_data::get_column_name(get_called_class());
		$ctx->table_alias    = $query_object->table_alias;
		$ctx->table          = $query_object->table;
		$ctx->q_operator     = $query_object->q_operator ?? null;

		// Set defaults on query_object
		// type='string' tells the outer WHERE builder which prepared-param quoting to use.
		$query_object->type = 'string';
		// Default to the system data language; the client may override with a specific lang code
		// or 'all' to search across every language entry in the JSONB column.
		$query_object->lang = $query_object->lang ?? DEDALO_DATA_LANG;

		return $ctx;
	}//end get_search_context



}//end search_component_sql_builder
