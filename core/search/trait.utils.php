<?php declare(strict_types=1);
/**
* TRAIT UTILS
* Cross-cutting utility methods mixed into the search class.
*
* This trait is one of six traits that compose the search class (select, from,
* where, order, count, utils). It provides:
* - SQL-safe identifier helpers (trim_tipo, is_valid_tipo, is_valid_lang,
*   is_valid_data_column) used as security gates before verbatim SQL interpolation
*   of ontology tipos, language codes, and column names that cannot be bound
*   via prepared-statement parameters.
* - Prepared-statement parameter management (get_placeholder) that deduplicates
*   bound values with strict type comparison and emits PostgreSQL-style $N placeholders.
* - LIMIT/OFFSET SQL tail builder (build_limit_offset_sql, sanitize_sql_limit).
* - Query path resolution (get_query_path, get_table_alias_from_path) used by the
*   FROM/SELECT builders to derive JOIN aliases from multi-hop traversal paths.
* - Path-level data retrieval helpers (get_data_with_path, resolve_path_level) used
*   by the component_info widget (class state).
* - Search UI helpers (search_options_title, is_search_operator, is_literal).
* - Debug accessors (get_sql_query, get_sql_query_resolved).
*
* Relies on properties declared in search: $this->sqo, $this->params,
* $this->sql_query, $this->main_section_tipo_alias.
*
* @package Dédalo
* @subpackage Core
*/
trait utils {



    /**
	* GET_TABLE_ALIAS_FROM_PATH
	* Derives the SQL table alias for the matrix JOIN that corresponds to a
	* multi-hop traversal path produced by get_query_path().
	*
	* Each step of the path contributes a segment to the alias:
	* - Single-step path: uses the pre-computed $main_section_tipo_alias (which
	*   already encodes the section tipo with a short prefix via trim_tipo).
	* - Multi-step path: each intermediate step contributes
	*   "trim(section_tipo)_trim(component_tipo)", and the final step contributes
	*   only "trim(section_tipo)" (the component_tipo is not needed at the leaf).
	* Segments are joined with underscores.
	*
	* Example (2-step path via portal oh25 → rsc167):
	*   step 0 (not last): 'oh1_oh25'
	*   step 1 (last):     'rs167'
	*   alias:             'oh1_oh25_rs167'
	*
	* @param array $path - array of stdClass steps from get_query_path();
	*                      each step has ->section_tipo and ->component_tipo
	* @return string $table_alias - underscore-joined SQL alias string
	*/
	public function get_table_alias_from_path( array $path ) : string {

		$total	= count($path);
		$ar_key = [];
		foreach ($path as $key => $step_object) {

			if ($total===1) {

				$ar_key[] = $this->main_section_tipo_alias; // mix

			}else{

				$ar_key[] = ($key === $total-1)
					? self::trim_tipo($step_object->section_tipo) // last
					: self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
			}

		}//foreach ($path as  $step_object)

		$table_alias = implode('_', $ar_key);

		return $table_alias;
	}//end get_table_alias_from_path



    /**
	* TRIM_TIPO
	* Contracts an ontology tipo string to a short prefix suitable for SQL aliases.
	*
	* A tipo has the form <letters><digits> (e.g. 'rsc453', 'oh1'). This method
	* keeps the first $max letters and the full numeric suffix, yielding a compact
	* but still meaningful alias segment (e.g. 'rsc453' → 'rs453', 'oh1' → 'oh1').
	*
	* (!) This method MUST NOT be used as a security gate for SQL interpolation.
	* It transforms the value (truncates the prefix), so using it to validate
	* a tipo that is then used as a JSONB key would silently corrupt the key.
	* Use is_valid_tipo() for validation-only checks.
	*
	* Returns null (and logs an error) for tipos that are empty or do not match the
	* expected letter+digit pattern. The 'all' sentinel is passed through unchanged
	* (used by related search when the target section is unspecified).
	*
	* @see search_Test::test_trim_tipo
	* @param string $tipo - ontology tipo to contract (e.g. 'rsc453')
	* @param int $max = 2 - number of leading letters to keep
	* @return string|null $trimmed_tipo - e.g. 'rs453'; null on malformed input
	*/
	public static function trim_tipo( string $tipo, int $max=2 ) : ?string {

		// empty case
			if (empty($tipo)) {
				debug_log(__METHOD__
					." Error empty tipo is received " .PHP_EOL
					.' tipo: ' . to_string($tipo)
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt		= debug_backtrace();
					dump($bt, ' debug_backtrace ++ '.to_string());
				}
				return null;
			}

		// all case. Used by related search that don't know the section_tipo
			if($tipo==='all') {
				return $tipo;
			}

		// match regex
			preg_match("/^([a-z]+)([0-9]+)$/", $tipo, $matches);
			if (empty($matches) || empty($matches[1]) || (empty($matches[2]) && $matches[2]!=0) ) {
				debug_log(__METHOD__
					." Error on preg match tipo: $tipo ". PHP_EOL
					.'tipo: '.to_string($tipo)
					, logger::ERROR
				);
				return null;
			}

		$name	= $matches[1];
		$number	= $matches[2];

		$trimmed_tipo = substr($name, 0, $max) . $number;


		return $trimmed_tipo;
	}//end trim_tipo



    /**
	* IS_VALID_TIPO
	* Validates that a tipo is a well-formed ontology tipo (e.g. 'oh1', 'rsc453').
	* Security gate for the few places a tipo must be interpolated verbatim into raw
	* SQL (JSONB keys, where parameterization is not possible). Unlike trim_tipo(),
	* it does NOT transform the value (which would corrupt a JSONB relation key like
	* 'rsc453' -> 'rs453'), it only validates the format.
	* @param string $tipo
	* @return bool
	*/
	public static function is_valid_tipo( string $tipo ) : bool {

		return preg_match('/^[a-z]+[0-9]+$/', $tipo) === 1;
	}//end is_valid_tipo



    /**
	* IS_VALID_LANG
	* Validates that a lang value is a well-formed Dédalo language code (e.g. 'lg-spa',
	* 'lg-nolan') or the 'all' sentinel. Security gate for the few places lang is
	* interpolated verbatim into raw SQL jsonpath/string literals (where the jsonpath
	* `vars` mechanism is not used). A lang carrying a single quote would otherwise escape
	* the surrounding SQL literal.
	* @param string $lang
	* @return bool
	*/
	public static function is_valid_lang( string $lang ) : bool {

		return preg_match('/^(lg-[a-z0-9_]+|all)$/', $lang) === 1;
	}//end is_valid_lang



    /**
	* IS_VALID_DATA_COLUMN
	* Security allowlist of real matrix column identifiers, used wherever a column name
	* from the client SQO (select/order/format) is interpolated verbatim into SQL (it
	* cannot be parameterized). Mirrors the matrix table schema (data columns +
	* structural columns + time machine columns).
	* @param string $column
	* @return bool
	*/
	public static function is_valid_data_column( string $column ) : bool {

		static $valid_columns = [
			// matrix data columns (jsonb) — see section_record_data::$columns_name
			'data','relation','string','date','iri','geo','number','media','misc','relation_search','meta',
			// structural columns
			'section_id','section_tipo',
			// time machine columns (matrix_time_machine)
			'id','tipo','lang','type'
		];

		return in_array($column, $valid_columns, true);
	}//end is_valid_data_column



    /**
	* SANITIZE_SQL_LIMIT
	* Normalizes a SQO limit value to a safe SQL fragment.
	* Incoming SQO arrives as a raw json_decode'd stdClass (the typed
	* search_query_object::set_limit() cast is never applied), so limit/offset must
	* be coerced here before concatenation into the query tail.
	* @param mixed $value
	* @return string|null
	* 	'ALL' (unlimited sentinel), a positive integer as string, or null when no LIMIT applies
	*/
	public static function sanitize_sql_limit( mixed $value ) : ?string {

		// 'all'/'ALL' sentinel means no limit (PostgreSQL 'LIMIT ALL')
		if (is_string($value) && strtolower(trim($value))==='all') {
			return 'ALL';
		}

		$int = (int)$value;

		return $int > 0 ? (string)$int : null;
	}//end sanitize_sql_limit



    /**
	* BUILD_LIMIT_OFFSET_SQL
	* Builds the safe LIMIT/OFFSET tail for the current SQO.
	* Centralizes the int coercion so no raw client value reaches the SQL string.
	* @return string
	*/
	public function build_limit_offset_sql() : string {

		$sql = '';

		// limit
		$limit_sql = self::sanitize_sql_limit($this->sqo->limit ?? null);
		if ($limit_sql !== null) {
			$sql .= PHP_EOL . 'LIMIT ' . $limit_sql;
		}

		// offset
		$offset = (int)($this->sqo->offset ?? 0);
		if ($offset > 0) {
			$sql .= ' OFFSET ' . $offset;
		}

		return $sql;
	}//end build_limit_offset_sql



    /**
	* GET_QUERY_PATH
	* Recursive function to obtain final complete path of each element in json query object
	* Used in component common and section to build components path for select
	*
	* Builds a linear array of path steps from the given component tipo upward (or
	* downward through relations), so the FROM and SELECT builders can emit the
	* correct sequence of JOINs and alias segments.
	*
	* When $resolve_related is true and the component's model is a relation-capable
	* type, the method follows the ontology relation nodes of the tipo into the
	* related section and recurses for one level of related components. Only the
	* first related component is followed (see 'Avoid multiple components in path'
	* comment below); deeper nesting requires explicit $related_tipo.
	*
	* @param string $tipo            - ontology tipo of the component to resolve
	* @param string $section_tipo    - section that owns the component
	* @param bool $resolve_related = true  - follow relation nodes into related sections
	* @param bool|string $related_tipo = false
	*     - when a string, resolve only this specific component in the related section
	*       instead of scanning all relation nodes
	* @return array $path - sequential array of stdClass steps, each with:
	*   ->name (display label), ->model (class name), ->section_tipo, ->component_tipo
	*/
	public static function get_query_path(string $tipo, string $section_tipo, bool $resolve_related=true, bool|string $related_tipo=false) : array {

		$path = [];

		$term_model = ontology_node::get_model_by_tipo($tipo,true);

		// Add first level always
			$current_path = new stdClass();
				$current_path->name				= strip_tags(ontology_node::get_term_by_tipo($tipo, DEDALO_DATA_LANG, true, true));
				$current_path->model			= $term_model;
				$current_path->section_tipo		= $section_tipo;
				$current_path->component_tipo	= $tipo;
			$path[] = $current_path;

		if ($resolve_related===true) {
			$ar_related_components 	= component_relation_common::get_components_with_relations();
			if(in_array($term_model, $ar_related_components)===true) {

				$ar_related_terms	= ontology_node::get_relation_nodes($tipo,true,true);
				$ar_related_section	= common::get_ar_related_by_model('section', $tipo);

				if (!empty($ar_related_section)) {

					$related_section_tipo = reset($ar_related_section);

					if ($related_tipo!==false) {

						$current_tipo	= $related_tipo;
						$model_name		= ontology_node::get_model_by_tipo($current_tipo,true);
						if (strpos($model_name,'component')===0) {
							# Recursion
							$ar_path = self::get_query_path($current_tipo, $related_section_tipo);
							foreach ($ar_path as $value) {
								$path[] = $value;
							}
						}

					}else{

						foreach ($ar_related_terms as $current_tipo) {

							// Use only first related tipo
							$model_name = ontology_node::get_model_by_tipo($current_tipo,true);
							if (strpos($model_name,'component')!==0) continue;
							# Recursion
							$ar_path = self::get_query_path($current_tipo, $related_section_tipo);
							foreach ($ar_path as $value) {
								$path[] = $value;
							}
							break; // Avoid multiple components in path !
						}
					}
				}
			}
		}


		return $path;
	}//end get_query_path



	/**
	* SEARCH_OPTIONS_TITLE
	* Creates the search_operators_info of the components in search mode to draw the tool tip
	*
	* Builds an HTML string listing all available search operator options for a
	* component. The result is rendered as a tooltip in the search UI, so it must
	* not be escaped again by the caller.
	*
	* @param array $search_operators_info
	*	Array of operator => label like: ... => between
	* @return string $search_options_title - HTML snippet (safe for direct output)
	*/
	public static function search_options_title( array $search_operators_info ) : string {

		$search_options_title = '';

		if (!empty($search_operators_info)) {

			$search_options_title .= '<b>' . label::get_label('search_options') . ':</b>';
			foreach ($search_operators_info as $ikey => $ivalue) {

				$search_options_title .= '<div class="search_options_title_item">';
				$search_options_title .= '<span>' . $ikey .'</span>';
				$search_options_title .= '<span>'. label::get_label($ivalue).'</span>';
				$search_options_title .= '</div>';
			}
		}

		return $search_options_title;
	}//end search_options_title



	/**
	* IS_SEARCH_OPERATOR
	* Checks whether a search object represents an SQO operator node rather than
	* a plain key-value filter clause.
	*
	* Operator nodes carry keys that begin with '$' (e.g. '$and', '$or', '$not').
	* This distinction is used by the WHERE builder when recursing through a filter
	* tree to decide whether to interpret a node as an operator group or a leaf
	* condition.
	*
	* @param object $search_object - a node from the SQO filter tree
	* @return bool - true if at least one key starts with '$'
	*/
	public static function is_search_operator(object $search_object) : bool {

		foreach ($search_object as $key => $value) {
			if (strpos($key, '$')!==false) {
				return true;
			}
		}

		return false;
	}//end is_search_operator



	/**
	* IS_LITERAL
	* Check if given value is literal or not
	* A literal is identified by being enclosed in single quotes.
	* Used by components to identify literals
	*
	* A literal search value is one that should be matched exactly (after stripping
	* the enclosing quotes) rather than transformed into a JSONB path query. This
	* convention allows users and callers to pass a quoted string like "'hello'" to
	* request an exact-match against the stored text.
	*
	* @param string $q The string to check.
	* @return bool True if the string is a literal, false otherwise.
	*/
	public static function is_literal(string $q) : bool {

		// Check if the string starts and ends with a single quote
    	return strlen($q) > 1 && $q[0] === "'" && $q[-1] === "'";
	}//end is_literal



	/**
	* GET_DATA_WITH_PATH
	* It is used by class state (component_info widget) to resolve path
	*
	* Iterates the path steps produced by get_query_path() and resolves the actual
	* stored component data for each step, threading the locator array forward so
	* each level filters by the records returned by the previous level. The output
	* is a sequential array of step objects, each carrying the path metadata and
	* the resolved locator/data array for that hop.
	*
	* This is the entry point; resolve_path_level() handles the per-step data fetch.
	*
	* @param array $path in this format:
	*	"path": [
	*	  {
	*		  "section_tipo": "oh1",
	*		  "component_tipo": "oh25",
	*		  "model": "component_portal",
	*		  "name": "Audiovisual"
	*	  },
	*	  {
	*		  "section_tipo": "rsc167",
	*		  "component_tipo": "rsc25",
	*		  "model": "component_select",
	*		  "name": "Collection \/ archive"
	*	  }
	*  ],
	* @param array $ar_locator - starting locator array (section_tipo + section_id pairs)
	* @return array $data - sequential array of stdClass{->path, ->value} per step
	*/
	public static function get_data_with_path(array $path, array $ar_locator) : array {

		$data = [];
		foreach ($path as $path_item) {

			// level data resolve
			$path_level_locators = search::resolve_path_level($path_item, $ar_locator);

			// object to store in this path level
			$data_item = new stdClass();
				$data_item->path	= $path_item;
				$data_item->value	= $path_level_locators;

			$data[] = $data_item;

			// overwrite var $ar_locator for the next iteration
			$ar_locator = $path_level_locators;
		}

		return $data;
	}//end get_data_with_path



	/**
	* RESOLVE_PATH_LEVEL
	* It is used by class state (component_info widget) to resolve path from search::get_data_with_path
	*
	* For each locator in $ar_locator, instantiates the component described by
	* $path_item and calls get_data() on it. The returned data items from all
	* locators are merged into a single flat array which becomes the locator input
	* for the next level. Uses 'list' mode and DEDALO_DATA_NOLAN so the data is
	* returned in its normalized (non-language-specific) form.
	*
	* @param object $path_item - one step from the path array (->component_tipo, ->section_tipo, ->model)
	* @param array $ar_locator - array of locator objects (->section_id, ->section_tipo) from the previous level
	* @return array $result - merged flat array of data items from all resolved locators
	*/
	public static function resolve_path_level(object $path_item, array $ar_locator) : array {

		$result = [];
		foreach ($ar_locator as $locator) {

			$model_name	= ontology_node::get_model_by_tipo($path_item->component_tipo, true);
			$component	= component_common::get_instance(
				$model_name,
				$path_item->component_tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);
			$component_data = $component->get_data();

			if (!empty($component_data)) {
				$result = [...$result, ...$component_data];
			}
		}

		return $result;
	}//end resolve_path_level



	/**
	* GET_PLACEHOLDER
	* Gets the placeholder for a given value.
	* If it exists, returns it, otherwise returns the next available placeholder.
	*
	* Manages $this->params, the 0-indexed array of bound values that is passed
	* directly to pg_execute(). The returned placeholder string ('$1', '$2', …)
	* maps to $this->params[N-1].
	*
	* Deduplication uses strict comparison (===) so that distinct typed values
	* (e.g. integer 1 vs. string '1' vs. boolean true vs. null) never collapse
	* onto the same placeholder. This prevents the PHP array-key coercion pitfall
	* of the previous implementation (which keyed $this->params by the value itself,
	* silently corrupting non-string params: 1.5 → 1, true → 1, null → '').
	*
	* (!) SEARCH-03 — known O(n²) characteristic: array_search() is a linear scan,
	* so assembling N params costs O(n²) total. Real-world filters are small and this
	* is not currently on the hot path. If profiling ever identifies this as a
	* bottleneck, add a side-index keyed by a type-tagged string
	* (e.g. gettype($value)."\0".serialize($value)) → placeholder index for O(1)
	* lookup while preserving strict-type semantics. Left as-is to avoid touching the
	* prepared-params model for a non-demonstrated cost.
	*
	* @param mixed $value Like 'oh1' (string|int|float|bool|null)
	* @return string $placeholder Like $1, $2, $3, ...
	*/
	public function get_placeholder(mixed $value) : string {

		// Params are stored as a 0-indexed sequential list of values (the order pg_execute
		// expects). Dedup uses a STRICT comparison so distinct typed values never collapse
		// onto the same placeholder. The previous implementation keyed $this->params by the
		// value itself, which silently corrupted non-string params via PHP array-key coercion
		// (1.5 -> 1, true -> 1, null -> '').
		// SEARCH-03 (known characteristic, not currently a bottleneck): this array_search
		// is a linear scan, so assembling N params is O(n^2). It is invoked once per
		// filter item / IN-member, and real filters are small. If a pathological filter
		// ever puts this on the hot path, add a side-index keyed by a type-tagged string
		// (e.g. gettype(value)."\0".serialized-key) -> placeholder index for O(1) lookup,
		// preserving the strict type-distinct semantics above. Left as-is to avoid
		// touching the prepared-params model for a non-demonstrated cost.
		$idx = array_search($value, $this->params, true);
		if ($idx === false) {
			$this->params[] = $value;
			$idx = array_key_last($this->params);
		}

		return '$' . ($idx + 1);
	}//end get_placeholder



	/**
	* GET_SQL_QUERY
	* Returns the final sql query stored in the search object.
	* The value is set by the method 'get_sql_queryparse_sql_query'
	* @see search->get_sql_queryparse_sql_query()
	* @return string $sql_query
	*/
	public function get_sql_query() : string {

		return $this->sql_query;
	}//end get_sql_query



	/**
	* GET_SQL_QUERY_RESOLVED
	* Resolves the prepared SQL query by replacing placeholders with actual values.
	* Uses `debug_prepared_statement()` to substitute `$1`, `$2`, etc. placeholders
	* in `$this->sql_query` with the corresponding parameter values from `$this->params`,
	* properly escaping string values via `pg_escape_literal()` using the DB connection.
	* Intended for debugging and logging purposes only.
	*
	* @return string $sql_query_debug The resolved SQL query with interpolated values
	*/
	public function get_sql_query_resolved() : string {

		$conn = DBi::_getConnection();
		$sql_query_debug = debug_prepared_statement(
			$this->sql_query,
			$this->params,
			$conn
		);

		return $sql_query_debug;
	}//end get_sql_query_resolved



}//end utils
