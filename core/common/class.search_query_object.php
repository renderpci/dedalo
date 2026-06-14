<?php declare(strict_types=1);
/**
* CLASS SEARCH_QUERY_OBJECT
* Data-transfer object that encodes a normalized search query (SQO) for Dédalo's search pipeline.
*
* The SQO is the abstraction layer between the client (browser UI or server code) and the
* PostgreSQL JSONB matrix tables that store all section/component data. It is inspired by the
* Mango Query language used in Apache CouchDB (https://docs.couchdb.org/en/stable/api/database/find.html).
*
* Responsibilities:
* - Carry every parameter that defines a search: section scope, filter tree, ordering,
*   pagination, aggregation, and SQL-generation hints.
* - Provide typed setter methods so that raw stdClass objects decoded from JSON can be
*   hydrated safely via __construct($data).
* - Expose sanitize_client_sqo() as a static security gate that scrubs untrusted
*   client-supplied SQOs before they enter the search pipeline.
*
* Lifecycle of an SQO:
*  1. **Un-parsed** — created by the client or a server builder with basic path definitions
*     (section_tipo, filter paths, limit/offset, etc.). $parsed is null or false.
*  2. **Parsed** — after search::parse_sqo() has delegated to each component via
*     conform_filter() / get_search_query() to resolve type-specific SQL fragments.
*     $parsed is set to true. Only a parsed SQO should be passed to parse_sql_query().
*
* Security boundary:
*  Client SQOs arriving over HTTP are sanitized by sanitize_client_sqo() at the API entry
*  point (core/api/v1/json/index.php). Server-internal builders that construct a
*  search_query_object directly and call search::search() bypass that gate and are fully
*  trusted. See also: search_query_object::sanitize_client_sqo() and docs/core/sqo.md.
*
* Extends stdClass so that any extra property injected at runtime (e.g. resolved SQL
* fragments added by component conform methods) is accessible without a property declaration.
*
* Used by: search, search_related, search_tm (core/search/).
* See: docs/core/sqo.md for the full parameter reference and security model.
*
* // FORMAT (full SQO schema — values shown are illustrative defaults or allowed options)
	id						: 'oh1'		// optional. section_tipo and other params to define the unique id
	section_tipo			: ['oh1']	// array of section_tipo for search
	mode					: ('edit' || 'list' || 'tm' || 'related') // configure the sqo for search witch different models of matrix tables into the DDBB
	filter					: {
								operator : // string ('$and' || '$or')
									[{
										q 			: '2'	// string to search
										q_opeator	: '<'	// string || null
										path		: [{	// array of components creating a sequential path
											section_tipo
											component_tipo
										}]
										format : 'direct' || 'array_elements' || 'typeof' || 'column' || 'in_column' || 'function' // string, use to change the WHERE format
										use_function : 'relations_flat_fct_st_si' // if format is function use_function define the PostgreSQL function to be used.
										q_split : true || false // bool, define if the q need to be split into multiple WHERE queries
										unaccent : true || false // bool, define if the q will us the unaccent function in WHERE
										type : 'jsonb' || 'string' // define the type of data to be searched
										lang : string || null  // defines if the search will be lang selective. If not defined lang = all langs, if defined lang = the lang sent as `lg-eng
										column: string, // mandatory a data type column name ('relation', 'string', 'date', 'number', 'iri', 'geo', 'media', 'misc', 'meta')
										tipo : string // mandatory component tipo
										data_path : array // the component path to find the data, defined by component, for string it will be 'value', for date it would be: 'start', 'end'
							  } || null
	select					: [{	// array of objects optional
								section_tipo
								component_tipo
							  }]
	limit					: 1 // int
	offset					: 2 // int
	total                   : (null || int) // by default total is null to be calculate, when int is set the sqo don't count and return his value
	full_count				: (true || false) // boolean, when is true a parallel SQL sentence will be create to count the filter result.
	group_by 				: ['section_tipo'] // array with the columns or components (used to count values)
	order					: [{
									direction 	: (ASC || DESC) // string
									path		: [{
										section_tipo
										component_tipo
									}]
							  }]
	filter_by_locators		: [{
									section_tipo
									component_tipo
							  }]
	filter_by_locators_op 	: (OR || AND)
	allow_sub_select_by_id	: (true || false)
	children_recursive 		: (true || false)
	remove_distinct			: (true || false)
	skip_projects_filter	: (true || false)
	parsed					: (true || false) // boolean, state of the sqo
	breakdown				: (true || false)
	tables					: array // Used in search mode related to limit the tables to search
*
* @package Dédalo
* @subpackage Core
*/
class search_query_object extends stdClass {



	/**
	* CLASS VARS
	*/
		/**
		* Unique identifier for this SQO instance.
		* Combines section_tipo with other parameters so callers can distinguish
		* cached or pooled SQOs. Example value: 'oh1_list'.
		* Optional — null means the query is anonymous.
		* @var string|int|null $id
		*/
		public string|int|null $id = null;

		/**
		* Section tipos that define the scope of this search.
		* Each string is a Dédalo ontology tipo (e.g. 'oh1'). The search engine
		* queries only the matrix rows whose section_tipo is in this list.
		* Mandatory for any meaningful search; null only before set_section_tipo() is called.
		* @var ?array $section_tipo
		*/
		public ?array $section_tipo = null;

		/**
		* Search mode controlling which matrix table model is targeted.
		* - 'edit'    : default edit-mode matrix (datos column)
		* - 'list'    : list-optimised view (may hit a materialized or derived table)
		* - 'tm'      : time-machine mode — queries the versioned history tables
		* - 'related' : relation matrix (used for cross-section joins)
		* Null means the search class picks its own default.
		* @var ?string $mode
		*/
		public ?string $mode = null;

		/**
		* Filter tree describing the search conditions, modelled on Mango Query.
		* Top-level key is an operator ('$and' or '$or') mapping to an array of clause
		* objects. Each clause carries: q (string to match), q_operator, path (component
		* DDO chain), format, type, lang, and other hints used by conform_filter().
		* Null means no filter is applied (all records are returned up to the limit).
		* @var ?object $filter
		*/
		public ?object $filter = null;

		/**
		* Maximum number of rows to return.
		* The string sentinel 'ALL' (or 'all') disables the LIMIT clause in SQL.
		* Client-supplied values are clamped to DEDALO_SEARCH_CLIENT_MAX_LIMIT by
		* sanitize_client_sqo(); server-internal builders may use 'ALL' freely.
		* Empty or non-positive values are coerced to 'ALL' by set_limit().
		* @var int|string|null $limit
		*/
		public int|string|null $limit = null;

		/**
		* Number of rows to skip before the first returned row.
		* Standard SQL OFFSET for pagination. Null means no offset (start from row 1).
		* @var ?int $offset
		*/
		public ?int $offset = null;

		/**
		* Pre-calculated total count of matching records.
		* When null the search engine executes a COUNT query and writes the result back here.
		* When set to an integer the count query is skipped entirely, which avoids a
		* potentially expensive second query when the total is already known (e.g. cached).
		* @var ?int $total
		*/
		public ?int $total = null;

		/**
		* Whether to run a parallel COUNT(*) query alongside the main SELECT.
		* When true, search writes the row count back into $total so the caller can
		* render pagination controls without a second round-trip.
		* (!) After the search executes, this property is overwritten with the integer
		* count — it no longer holds the original boolean.
		* @var ?bool $full_count
		*/
		public ?bool $full_count = null;

		/**
		* Columns or component tipos to group the result by.
		* Passed as SQL GROUP BY expressions, used for aggregation and value-count queries.
		* Example: ['section_tipo'] groups the count by section type.
		* @var ?array $group_by
		*/
		public ?array $group_by = null;

		/**
		* Ordered list of sort directives applied to the result set.
		* Each item is an object with 'direction' ('ASC'|'DESC') and 'path' (DDO chain
		* from the root section to the component whose value drives the sort).
		* Multiple items produce a multi-column ORDER BY clause.
		* @var ?array $order
		*/
		public ?array $order = null;

		/**
		* Explicit locators (section_tipo + section_id pairs) to filter results by.
		* When set, the search restricts results to rows matching these specific records,
		* complementing or replacing the filter tree. Useful for detail fetches and
		* portal-driven pre-filtered searches.
		* @var ?array $filter_by_locators
		*/
		public ?array $filter_by_locators = null;

		/**
		* Logical operator combining multiple filter_by_locators entries.
		* Accepted values: 'OR' (match any locator) or 'AND' (match all locators).
		* Only meaningful when filter_by_locators contains more than one entry.
		* @var ?string $filter_by_locators_op
		*/
		public ?string $filter_by_locators_op = null;

		/**
		* Whether to wrap the main WHERE clause in a sub-select keyed by section_id.
		* The default behaviour (true) wraps the filter in a sub-select so that the outer
		* query can apply ORDER BY / LIMIT cleanly. Set to false for autocomplete and other
		* contexts where the sub-select interferes with the query plan.
		* @var ?bool $allow_sub_select_by_id
		*/
		public ?bool $allow_sub_select_by_id = null;

		/**
		* Whether to traverse hierarchical relationships recursively to find child nodes.
		* When true the thesaurus/tree search expands matched terms to include all
		* descendant nodes. Has no effect outside hierarchical section types.
		* @var ?bool $children_recursive
		*/
		public ?bool $children_recursive = null;

		/**
		* Whether to suppress the DISTINCT clause in the generated SQL.
		* By default, DISTINCT is added to prevent duplicate section_ids when joins
		* across related tables can produce multiple rows per record. Set to true in
		* contexts such as thesaurus search where the same section_id may legitimately
		* appear more than once (one row per section_tipo variant).
		* @var ?bool $remove_distinct
		*/
		public ?bool $remove_distinct = null;

		/**
		* Whether to bypass the per-user project scope filter.
		* For non-global-admin users, the search engine always appends a WHERE clause that
		* limits results to the projects the user belongs to. Setting this to true removes
		* that restriction — required for cross-project lookups such as shared value lists.
		* (!) This flag is stripped from client-supplied SQOs by sanitize_client_sqo();
		* it can only be set by trusted server-side code.
		* @var ?bool $skip_projects_filter
		*/
		public ?bool $skip_projects_filter = null;

		/**
		* Whether this SQO has been through the parse/conform pipeline.
		* False (or null) means the SQO contains only raw client-level path definitions.
		* True means search::parse_sqo() has already delegated to each component via
		* conform_filter() / get_search_query() and the SQO is ready for SQL generation.
		* (!) Client SQOs must never arrive with parsed=true; sanitize_client_sqo() forces
		* it back to false so the conform pipeline is never skipped.
		* @var ?bool $parsed
		*/
		public ?bool $parsed = null;

		/**
		* Whether to split matching relation locators into individual result rows.
		* When false (default), each matched section record is returned as one row.
		* When true, the relations data is expanded so that each matching locator within
		* a section produces its own row — used in 'related' mode to enumerate individual
		* audiovisual indexation hits. See search_related::parse_sql_query().
		* @var ?bool $breakdown
		*/
		public ?bool $breakdown = null;

		/**
		* Explicit list of matrix tables to query in 'related' mode.
		* When set, overrides the default table list produced by
		* common::get_matrix_tables_with_relations(). Useful when callers already know
		* which relation tables are relevant and want to avoid a broader scan.
		* @var ?array $tables
		*/
		public ?array $tables = null;

		/**
		* Fields or components to include in the SELECT clause.
		* Each item is a DDO-path object that search::conform_select() resolves to the
		* appropriate JSONB column. When null, the search returns section_id, section_tipo,
		* and the full datos row.
		* @var ?array $select
		*/
		public ?array $select = null;

		/**
		* Microsecond timestamp recording when this SQO was instantiated.
		* Populated by performance-profiling callers; null in the common case.
		* @var ?float $generated_time
		*/
		public ?float $generated_time = null;



	/**
	* __CONSTRUCT
	* Hydrates the SQO from an optional stdClass data object (e.g. from json_decode).
	*
	* When $data is provided, every property present on it is routed through the
	* corresponding set_*() method so that type coercions and any setter-level
	* validation are applied even when the source is a raw decoded object.
	* Properties with no setter (unexpected keys) will cause a fatal error via
	* the dynamic method call — callers should sanitize_client_sqo() first for
	* untrusted input.
	*
	* @param ?object $data = null - raw SQO object to hydrate from; null creates an empty SQO
	* @return void
	*/
	public function __construct( ?object $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
			// if (!is_object($data)) {
			// 	trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			// 	return false;
			// }

		// delegate each property to its typed setter
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}
	}//end __construct



	/**
	* SET_ID
	* Sets the unique identifier for this SQO.
	* The id is used by callers to distinguish cached or pooled SQOs (e.g. 'oh1_list').
	* @param string $value - identifier string, e.g. 'oh1_list'
	* @return true
	*/
	public function set_id(string $value) : true {

		$this->id = $value;

		return true;
	}//end set_id



	/**
	* SET_SECTION_TIPO
	* Sets the section scope for this search.
	* Accepts either an array of tipo strings or a single string, which is
	* automatically wrapped in an array so downstream code always sees an array.
	* @param array|string $value - one or more section tipos, e.g. ['oh1'] or 'oh1'
	* @return true
	*/
	public function set_section_tipo(array|string $value) : true {

		$this->section_tipo = is_array($value) ? $value : [$value];

		return true;
	}//end set_section_tipo



	/**
	* SET_MODE
	* Sets the search mode, which selects the matrix table model to query.
	* Accepted values: 'edit', 'list', 'tm' (time-machine), 'related'.
	* 'tm' triggers alternative behaviour in several search methods to target
	* versioned history tables instead of the live matrix.
	* @param string $value - mode identifier, e.g. 'tm'
	* @return true
	*/
	public function set_mode(string $value) : true {

		$this->mode = $value;

		return true;
	}//end set_mode



	/**
	* SET_FILTER
	* Sets the Mango-Query-style filter tree for this search.
	* The filter object's top-level key must be an operator ('$and' or '$or') whose
	* value is an array of clause objects. Each clause must supply at minimum 'q'
	* (the search string) and 'path' (the DDO chain identifying the component).
	* Additional clause properties: q_operator, format, use_function, q_split,
	* unaccent, type, lang, column, tipo, data_path.
	*
	* Example:
	* {
	*	"$and": [
	*		{
	*			"q": "1",
	*			"q_operator": null,
	*			"path": [
	*				{
	*					"section_tipo": "oh1",
	*					"component_tipo": "oh62",
	*					"model": "component_section_id",
	*					"name": "Id"
	*				}
	*			]
	* 			"q_split" : false,
	* 			"format" : "direct",
	* 			"use_function" : "relations_flat_fct_st_si"
	*		}
	*	]
	* }
	* @param object $value - Mango-style filter tree
	* @return true
	*/
	public function set_filter(object $value) : true {

		$this->filter = $value;

		return true;
	}//end set_filter



	/**
	* SET_SELECT
	* Sets the list of DDO-path objects that define the SELECT columns.
	* Each item in the array is resolved by search::conform_select() to the
	* appropriate JSONB column for the component model. When omitted, the search
	* returns section_id, section_tipo, and the full datos blob.
	*
	* Example item shape:
	* [{
	*    "path": [
	*        {
	*            "name": "Publication",
	*            "model": "component_publication",
	*            "section_tipo": "oh1",
	*            "component_tipo": "oh32"
	*        }
	*    ],
	*    "component_path": [
	*        "relations"
	*    ],
	*    "type": "jsonb"
	* }]
	* @param array $value - array of DDO path objects
	* @return true
	*/
	public function set_select(array $value) : true {

		$this->select = $value;

		return true;
	}//end set_select



	/**
	* SET_LIMIT
	* Sets the maximum number of rows to return.
	* Empty, zero, or negative values are coerced to the string 'ALL', which removes
	* the LIMIT clause from the generated SQL entirely. Positive integers are cast to int.
	* Client-supplied values are additionally clamped by sanitize_client_sqo() to
	* DEDALO_SEARCH_CLIENT_MAX_LIMIT before this setter is called.
	* @param mixed $value - row limit integer or empty value; no type hint (accepts anything)
	* @return bool
	*/
	public function set_limit($value) : bool {

		if( empty($value) ) {
			$this->limit = 'ALL';
			return true;
		}

		$this->limit = (int)$value;

		return true;
	}//end set_limit



	/**
	* SET_OFFSET
	* Sets the number of rows to skip before returning results (SQL OFFSET).
	* Null is valid and means no offset is applied.
	* @param ?int $value - row offset, e.g. 0 for the first page
	* @return true
	*/
	public function set_offset(?int $value) : true {

		// if(empty($value)) return false;

		$this->offset = $value;

		return true;
	}//end set_offset



	/**
	* SET_TOTAL
	* Sets the pre-known total count of matching records.
	* When set to an integer, the search engine skips the COUNT query and returns
	* this value directly, avoiding an extra database round-trip. Set to null to
	* request a fresh count (the default).
	* @param ?int $value - pre-calculated count, or null to trigger a live count
	* @return true
	*/
	public function set_total(?int $value) : true {

		$this->total = $value;

		return true;
	}//end set_total



	/**
	* SET_FULL_COUNT
	* Enables or disables the parallel COUNT(*) query.
	* When true, the search engine runs a secondary COUNT query alongside the main
	* SELECT and stores the result back in $total. This allows pagination UIs to
	* display the total match count without a separate API call.
	* (!) After the search executes with full_count=true, $full_count is overwritten
	* with the integer row count — it no longer holds the original boolean value.
	* @param bool $value - true to request a full count, false to skip it
	* @return bool
	*/
	public function set_full_count( bool $value) : bool {

		$this->full_count = $value;

		return true;
	}//end set_full_count



	/**
	* SET_GROUP_BY
	* Sets the GROUP BY columns for aggregation queries.
	* Each element is a column name or component tipo. The most common use is
	* ['section_tipo'] to count results broken down by section type.
	* @param array $value - list of column/component identifiers, e.g. ['section_tipo']
	* @return true
	*/
	public function set_group_by(array $value) : true {

		$this->group_by = $value;

		return true;
	}//end group_by



	/**
	* SET_ORDER
	* Sets the sort directives applied to the result set.
	* Each element is an object with:
	*   - 'direction' : 'ASC' or 'DESC'
	*   - 'path'      : DDO chain from the root section to the component to sort by
	* Multiple elements produce a multi-column ORDER BY clause; order is preserved.
	*
	* Example:
	* [
	*    {
	*        "direction": "DESC",
	*        "path": [
	*            {
	*                "name": "Code",
	*                "model": "component_input_text",
	*                "section_tipo": "oh1",
	*                "component_tipo": "oh14"
	*            }
	*        ]
	*    }
	* ]
	* @param array $value - array of sort-directive objects
	* @return true
	*/
	public function set_order(array $value) : true {

		$this->order = $value;

		return true;
	}//end set_order


	/**
	* SET_FILTER_BY_LOCATORS
	* Sets an explicit list of locators to restrict the result set.
	* Each locator object identifies a specific record via section_tipo and section_id
	* (and optionally component_tipo / component_id). The search engine generates a
	* WHERE clause that matches only these records, complementing or replacing the
	* filter tree. Useful for portals that pre-load a fixed record set.
	* @param ?array $value - array of locator objects, e.g. [{"section_tipo":"rsc35","section_id":"4"}], or null to clear
	* @return true
	*/
	public function set_filter_by_locators( ?array $value ) : true {

		$this->filter_by_locators = $value;

		return true;
	}//end set_filter_by_locators



	/**
	* SET_FILTER_BY_LOCATORS_OP
	* Sets the logical operator that combines multiple filter_by_locators entries.
	* 'OR'  — result must match at least one locator (union).
	* 'AND' — result must match all locators simultaneously (intersection).
	* @param string $value - 'OR' or 'AND'
	* @return true
	*/
	public function set_filter_by_locators_op( string $value ) : true {

		$this->filter_by_locators_op = $value;

		return true;
	}//end set_filter_by_locators_op



	/**
	* SET_ALLOW_SUB_SELECT_BY_ID
	* Controls whether the search wraps its WHERE clause in a sub-select by section_id.
	* The default (true) enables a sub-select that lets ORDER BY and LIMIT operate on
	* the full filtered ID list before the outer query fetches datos. This is the
	* correct behaviour for paginated list views.
	* Set to false for autocomplete and similar contexts where the sub-select confuses
	* the planner or conflicts with other join conditions.
	* @param bool $value - true to enable (default), false to disable
	* @return true
	*/
	public function set_allow_sub_select_by_id(bool $value) : true {

		$this->allow_sub_select_by_id = $value;

		return true;
	}//end set_allow_sub_select_by_id



	/**
	* SET_CHILDREN_RECURSIVE
	* Controls recursive descendant expansion for hierarchical searches.
	* When true, a thesaurus or tree-structured search expands each matched term to
	* include all of its child nodes (recursively). Has no effect when the target
	* section type is not hierarchical.
	* @param bool $value - true to recurse into children, false to match only the exact node
	* @return true
	*/
	public function set_children_recursive(bool $value) : true {

		$this->children_recursive = $value;

		return true;
	}//end set_children_recursive



	/**
	* SET_REMOVE_DISTINCT
	* Controls whether the DISTINCT keyword is emitted in the generated SQL.
	* By default DISTINCT is included to prevent duplicate section_ids when joins
	* across related tables produce multiple rows for the same record.
	* Set to true in contexts such as thesaurus search where the same section_id
	* may legitimately appear multiple times (once per section_tipo variant) and
	* collapsing duplicates would discard valid rows.
	* @param bool $value - true to remove DISTINCT, false to keep it (default)
	* @return true
	*/
	public function set_remove_distinct(bool $value) : true {

		$this->remove_distinct = $value;

		return true;
	}//end set_remove_distinct



	/**
	* SET_SKIP_PROJECTS_FILTER
	* Controls whether the per-user project scope filter is applied.
	* For non-global-admin users the search engine always appends a WHERE clause
	* that restricts results to the projects the user belongs to (enforced in
	* search::set_up()). Setting this to true removes that restriction, which is
	* necessary for cross-project lookups such as shared value lists and common
	* thesaurus nodes.
	* (!) This flag is stripped from untrusted client SQOs by sanitize_client_sqo()
	* and may only be set by trusted server-side code.
	* @param bool $value - true to bypass the project filter, false to enforce it (default)
	* @return true
	*/
	public function set_skip_projects_filter(bool $value) : true {

		$this->skip_projects_filter = $value;

		return true;
	}//end set_skip_projects_filter



	/**
	* SET_PARSED
	* Marks the SQO as having completed the parse/conform pipeline.
	* Two lifecycle states exist:
	*  1. Un-parsed (false/null): raw client-level path definitions only.
	*  2. Parsed (true): search::parse_sqo() has delegated to each component's
	*     conform_filter() and get_search_query() methods, which have injected
	*     type-specific SQL fragments (sentence, params, column_sql, etc.).
	*     Only a parsed SQO should be passed to search::parse_sql_query().
	* (!) Client-supplied SQOs must never arrive with parsed=true; sanitize_client_sqo()
	* forces this back to false so the conform pipeline cannot be bypassed.
	* @see search::parse_sql_query
	* @param bool $value - true once the SQO has been through parse_sqo()
	* @return true
	*/
	public function set_parsed(bool $value) : true {

		$this->parsed = $value;

		return true;
	}//end set_parsed



	/**
	* SET_BREAKDOWN
	* Controls whether matching relation locators are expanded into individual rows.
	* When false (default), each matched section record is returned as a single row.
	* When true, the relations column is exploded so that each locator within a section
	* that individually satisfies the filter produces its own result row. Used in
	* 'related' mode to enumerate individual audiovisual indexation hits (e.g. listing
	* every timecode segment that references a specific person), rather than just the
	* parent section that contains them.
	* @see search_related::parse_sql_query
	* @param bool $value - true to expand locators into rows, false for section-level results
	* @return true
	*/
	public function set_breakdown(bool $value) : true {

		$this->breakdown = $value;

		return true;
	}//end set_breakdown



	/**
	* SET_TABLES
	* Sets an explicit list of matrix tables to query in 'related' mode.
	* When provided, overrides the default table list returned by
	* common::get_matrix_tables_with_relations(). Use this when the caller already
	* knows which relation tables are relevant so the engine avoids scanning tables
	* that cannot contain matching relations.
	* @param array $value - list of fully-qualified matrix table names
	* @return true
	*/
	public function set_tables(array $value) : true {

		$this->tables = $value;

		return true;
	}//end set_tables



	/**
	* __GET
	* Magic property accessor — returns the property value when it exists, null otherwise.
	* Used because search_query_object extends stdClass and components inject ad-hoc
	* properties (e.g. 'sentence', 'params', 'column_sql') during the conform pipeline.
	* Accessing an undefined property logs a DEBUG message instead of raising a PHP warning,
	* preventing noisy output when callers probe optional SQO fields.
	* @param string $name - property name to read
	* @return mixed - property value, or null if the property is not set
	*/
	final public function __get(string $name) : mixed {

		if (isset($this->$name)) {
			return $this->$name;
		}

		$trace = debug_backtrace();
		debug_log(
			__METHOD__
			.' Undefined property via __get(): '.$name .
			' in ' . $trace[0]['file'] .
			' on line ' . $trace[0]['line'],
			logger::DEBUG);

		return null;
	}
	// final public function __set($name, $value) {
	// 	$this->$name = $value;
	// }



	/**
	* SANITIZE_CLIENT_SQO
	* Security gate that scrubs an untrusted client-supplied SQO before it enters
	* the search pipeline.
	*
	* Only client SQOs arriving over HTTP need sanitization; server-internal builders
	* that construct a search_query_object directly and call search::search() are
	* trusted and bypass this gate entirely.
	*
	* What this method strips and why:
	*  - sentence / params     : pre-built SQL fragment + bound values. These are always
	*                            regenerated server-side; a client value would reach raw
	*                            SQL without going through the component conform pipeline.
	*  - column_sql            : trusted server-built ORDER fragment (see trait.order.php);
	*                            must not be injectable by the client.
	*  - table / table_alias   : server-computed identifiers set during conform_filter();
	*                            client values would bypass that computation.
	*  - skip_projects_filter  : disables the per-user project scope WHERE filter; only
	*                            server-side code may legitimately set this.
	*  - skip_duplicated       : valid only inside the component '!!' duplicated pipeline;
	*                            a client value silently drops sibling filters.
	*  - include_negative      : currently a search instance property (not read from the SQO);
	*                            stripped defensively against future regressions.
	*
	* After stripping, the method:
	*  - Forces parsed=false so the component conform pipeline is never skipped.
	*  - Casts offset and total to safe integer types (the typed setters are not applied
	*    to a raw stdClass decoded from JSON).
	*  - Clamps limit to DEDALO_SEARCH_CLIENT_MAX_LIMIT (default 1000); the 'all'/'ALL'
	*    sentinel and out-of-range values are coerced to the ceiling so untrusted clients
	*    cannot request unbounded result sets.
	*
	* Non-object values (e.g. null, a string) are returned untouched — the caller is
	* responsible for rejecting unexpected types after the gate.
	*
	* @param mixed $sqo - raw SQO object (from json_decode) or any other value
	* @return mixed - the sanitized SQO object, or the original value unchanged if not an object
	*/
	public static function sanitize_client_sqo( mixed $sqo ) : mixed {

		// only process objects (raw json_decode'd sqo)
		if (!is_object($sqo)) {
			return $sqo;
		}

		// server-only fields that a client SQO must never carry, at any depth.
		// Two groups:
		//  - SQL/identifier fields that bypass the component conform pipeline
		//    (sentence/params/column_sql/table/table_alias)
		//  - ACL / control flags that, if client-supplied, weaken access control:
		//      skip_projects_filter : disables the per-user projects WHERE filter (set_up honors it)
		//      skip_duplicated      : only valid inside the component '!!' duplicated pipeline;
		//                             a client value silently drops sibling filters
		//      include_negative     : currently a search instance property (not read from the SQO),
		//                             stripped defensively against future regressions
		$server_only_keys = [
			'sentence','params','column_sql','table','table_alias',
			'skip_projects_filter','skip_duplicated','include_negative'
		];
		self::strip_keys_recursive($sqo, $server_only_keys);

		// never let the client mark the SQO as already parsed (would skip the component
		// conform pipeline and send the raw filter straight to SQL building)
		if (property_exists($sqo, 'parsed')) {
			$sqo->parsed = false;
		}

		// numeric coercions (the typed setters are not applied to a raw stdClass)
		if (isset($sqo->offset)) {
			$sqo->offset = (int)$sqo->offset;
		}
		if (isset($sqo->total) && $sqo->total!==null) {
			$sqo->total = (int)$sqo->total;
		}
		// limit: clamp the client-supplied limit to a safe ceiling. Untrusted clients
		// must not request unbounded result sets: the 'all'/'ALL' sentinel, non-positive
		// values and values above the ceiling are all coerced to DEDALO_SEARCH_CLIENT_MAX_LIMIT.
		// Server-internal builders construct a search_query_object directly and bypass this
		// gate, so they keep full access to 'all'.
		if (isset($sqo->limit)) {
			$max_limit	= defined('DEDALO_SEARCH_CLIENT_MAX_LIMIT') ? (int)DEDALO_SEARCH_CLIENT_MAX_LIMIT : 1000;
			$is_all		= is_string($sqo->limit) && strtolower(trim($sqo->limit))==='all';
			$int_limit	= (int)$sqo->limit;
			$sqo->limit	= ($is_all || $int_limit <= 0 || $int_limit > $max_limit)
				? $max_limit
				: $int_limit;
		}

		return $sqo;
	}//end sanitize_client_sqo



	/**
	* STRIP_KEYS_RECURSIVE
	* Recursively removes the specified property keys from every object found in
	* the node tree rooted at $node.
	* Traverses both object properties and array elements so that nested filter
	* clauses (which may carry per-clause 'table' or 'sentence' fields injected
	* by a previous server-side parse) are also cleaned.
	* @param mixed $node - root of the tree to sanitize (object, array, or scalar)
	* @param array $keys - property names to unset wherever they appear
	* @return void
	*/
	private static function strip_keys_recursive( mixed $node, array $keys ) : void {

		if (is_object($node)) {
			foreach ($keys as $k) {
				if (property_exists($node, $k)) {
					unset($node->{$k});
				}
			}
			foreach (get_object_vars($node) as $v) {
				self::strip_keys_recursive($v, $keys);
			}
		} elseif (is_array($node)) {
			foreach ($node as $v) {
				self::strip_keys_recursive($v, $keys);
			}
		}
	}//end strip_keys_recursive



}//end search_query_object
