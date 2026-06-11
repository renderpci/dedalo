<?php declare(strict_types=1);
/**
* SEARCH QUERY OBJECT (SQO)
*
*	DTO that defines an search query object with normalized schema properties and validation.
*
* 	SQO or Search Query Object definition is based on
* 	Mango Query (A MongoDB inspired query language interface for Apache CouchDB)
*
*
* // FORMAT
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
*/
class search_query_object extends stdClass {



	/**
	* CLASS VARS
	*/
		/**
		 * Unique identifier for this search query object.
		 * Combines section_tipo and other params for query identification. Example: 'oh1_list'.
		 * @var string|int|null $id
		 */
		public string|int|null $id = null;

		/**
		 * Array of section tipos to search within.
		 * Defines which sections are included in the query scope. Example: ['oh1', 'oh2'].
		 * @var ?array $section_tipo
		 */
		public ?array $section_tipo = null;

		/**
		 * Search mode determining which matrix tables and models to query.
		 * Values: 'edit', 'list', 'tm' (time machine), 'related'. Affects database table selection.
		 * @var ?string $mode
		 */
		public ?string $mode = null;

		/**
		 * Filter object defining search conditions and constraints.
		 * Contains operator ($and/$or), q (search string), path (component hierarchy), and options.
		 * @var ?object $filter
		 */
		public ?object $filter = null;

		/**
		 * Maximum number of records to return in the result set.
		 * Can be an integer limit or string for special pagination modes.
		 * @var int|string|null $limit
		 */
		public int|string|null $limit = null;

		/**
		 * Number of records to skip before returning results.
		 * Used for paginated queries to navigate through large datasets.
		 * @var ?int $offset
		 */
		public ?int $offset = null;

		/**
		 * Total count of matching records (if pre-calculated).
		 * When null, the total is calculated. When set, skips count query for performance.
		 * @var ?int $total
		 */
		public ?int $total = null;

		/**
		 * Whether to execute a parallel count query for full result set size.
		 * When true, returns both results and total count for pagination.
		 * @var ?bool $full_count
		 */
		public ?bool $full_count = null;

		/**
		 * Array of columns or components to group results by.
		 * Used for aggregation queries and counting distinct values.
		 * @var ?array $group_by
		 */
		public ?array $group_by = null;

		/**
		 * Array defining result sort order with direction and component paths.
		 * Each item contains direction (ASC/DESC) and path array for nested sorting.
		 * @var ?array $order
		 */
		public ?array $order = null;

		/**
		 * Array of locators to filter results by specific related records.
		 * Limits results to records matching these section_tipo/component_tipo combinations.
		 * @var ?array $filter_by_locators
		 */
		public ?array $filter_by_locators = null;

		/**
		 * Logical operator for filter_by_locators conditions. Values: 'OR', 'AND'.
		 * Determines how multiple locator filters are combined in the WHERE clause.
		 * @var ?string $filter_by_locators_op
		 */
		public ?string $filter_by_locators_op = null;

		/**
		 * Whether to allow sub-select queries by ID for complex filtering.
		 * Enables optimized nested queries for large dataset filtering.
		 * @var ?bool $allow_sub_select_by_id
		 */
		public ?bool $allow_sub_select_by_id = null;

		/**
		 * Whether to include recursive children in the search results.
		 * When true, traverses hierarchical relationships to find nested matches.
		 * @var ?bool $children_recursive
		 */
		public ?bool $children_recursive = null;

		/**
		 * Whether to remove DISTINCT from the SQL query for performance.
		 * When true, may return duplicate records but executes faster.
		 * @var ?bool $remove_distinct
		 */
		public ?bool $remove_distinct = null;

		/**
		 * Whether to skip project-based filtering for this query.
		 * When true, bypasses project access restrictions (admin use only).
		 * @var ?bool $skip_projects_filter
		 */
		public ?bool $skip_projects_filter = null;

		/**
		 * Whether this SQO has been parsed and validated.
		 * Set to true after filter and paths are processed into SQL-ready format.
		 * @var ?bool $parsed
		 */
		public ?bool $parsed = null;

		/**
		 * Whether to include detailed breakdown data in results.
		 * When true, returns additional metadata about query composition.
		 * @var ?bool $breakdown
		 */
		public ?bool $breakdown = null;

		/**
		 * Array of database tables to search within.
		 * Used in 'related' mode to limit which tables are queried.
		 * @var ?array $tables
		 */
		public ?array $tables = null;

		/**
		 * Array of fields/components to return in the result set.
		 * Defines the SELECT clause columns for efficient data retrieval.
		 * @var ?array $select
		 */
		public ?array $select = null;

		/**
		 * Timestamp when this SQO was generated (microseconds).
		 * Used for performance profiling and query optimization analysis.
		 * @var ?float $generated_time
		 */
		public ?float $generated_time = null;



	/**
	* __CONSTRUCT
	* @param object|null $data = null
	*/
	public function __construct( ?object $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
			// if (!is_object($data)) {
			// 	trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			// 	return false;
			// }

		// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}
	}//end __construct



	/**
	* SET_ID
	* @param string $value like 'oh1_list'
	* @return bool true
	*/
	public function set_id(string $value) : true {

		$this->id = $value;

		return true;
	}//end set_id



	/**
	* SET_SECTION_TIPO
	* Array of one or more values
	* @param array|string $value like ['oh1'] or 'oh1'
	* @return bool true
	*/
	public function set_section_tipo(array|string $value) : true {

		$this->section_tipo = is_array($value) ? $value : [$value];

		return true;
	}//end set_section_tipo



	/**
	* SET_MODE
	* Used to identify SQO search behavior to follow
	* Time machine mode ('tm') works different for some methods
	* @param string $value like 'tm'
	* @return bool true
	*/
	public function set_mode(string $value) : true {

		$this->mode = $value;

		return true;
	}//end set_mode



	/**
	* SET_FILTER
	* Object as Mango Query
	* @param object $value like
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
	* @return bool true
	*/
	public function set_filter(object $value) : true {

		$this->filter = $value;

		return true;
	}//end set_filter



	/**
	* SET_SELECT
	* Array of objects
	* @param object $value like
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
	* @return bool true
	*/
	public function set_select(array $value) : true {

		$this->select = $value;

		return true;
	}//end set_select



	/**
	* SET_LIMIT
	* @param int|string|null $value like 10
	* @return bool true
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
	* @param int|null $value like 0
	* @return bool true
	*/
	public function set_offset(?int $value) : true {

		// if(empty($value)) return false;

		$this->offset = $value;

		return true;
	}//end set_offset



	/**
	* SET_TOTAL
	* Total records found
	* Total could be a int or null
	* @param int|null $value like 0
	* @return bool true
	*/
	public function set_total(?int $value) : true {

		$this->total = $value;

		return true;
	}//end set_total



	/**
	* SET_FULL_COUNT
	* Note that if the request is made it using 'true' value, the sqo->full_count value
	* will be modified with the result of the records count
	* @param bool $value
	* @return bool
	*/
	public function set_full_count( bool $value) : bool {

		$this->full_count = $value;

		return true;
	}//end set_full_count



	/**
	* GROUP_BY
	* Group the search by any criteria as 'section_tipo'
	* @param array $value
	* ['section_tipo']
	* @return
	*/
	public function set_group_by(array $value) : true {

		$this->group_by = $value;

		return true;
	}//end group_by



	/**
	* SET_ORDER
	* @param array of objects like
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
	* @return bool true
	*/
	public function set_order(array $value) : true {

		$this->order = $value;

		return true;
	}//end set_order


	/**
	* SET_FILTER_BY_LOCATORS
	* Allow to search directly with one or more locator values(section_tipo, section_id, etc.)
	* @param array|null $value like
	* [{
	*		"section_tipo" : "rsc35"
	*		"section_id" : "4"
	*  }]
	* @return bool true
	*/
	public function set_filter_by_locators( ?array $value ) : true {

		$this->filter_by_locators = $value;

		return true;
	}//end set_filter_by_locators



	/**
	* SET_FILTER_BY_LOCATORS_OP
	* @param string $value OR, AND
	* @return bool true
	*/
	public function set_filter_by_locators_op( string $value ) : true {

		$this->filter_by_locators_op = $value;

		return true;
	}//end set_filter_by_locators_op



	/**
	* SET_ALLOW_SUB_SELECT_BY_ID
	* Allow / disallow the default sql query window created with selected ids for speed
	* Sometimes, the default behavior (true) interferes with some search calls like
	* in autocomplete cases
	* @param bool $value
	* @return bool true
	*/
	public function set_allow_sub_select_by_id(bool $value) : true {

		$this->allow_sub_select_by_id = $value;

		return true;
	}//end set_allow_sub_select_by_id



	/**
	* SET_CHILDREN_RECURSIVE
	* Allow / disallow the default SQL query to get children of the main search
	* @param bool $value
	* @return bool true
	*/
	public function set_children_recursive(bool $value) : true {

		$this->children_recursive = $value;

		return true;
	}//end set_children_recursive



	/**
	* SET_REMOVE_DISTINC
	* By default, distinct clause is set in the search query to prevent duplicates on joins
	* In some context (thesaurus search for example) we want "duplicate section_id's" because
	* search is made it against various section tipo
	* @param bool $value
	* @return bool true
	*/
	public function set_remove_distinct(bool $value) : true {

		$this->remove_distinct = $value;

		return true;
	}//end set_remove_distinct



	/**
	* SET_SKIP_PROJECTS_FILTER
	* By default, for non global administrators, a fixed filter y applied to all search using
	* the user projects value. Sometimes, is required to remove this filter to allow access
	* transversal data like common value lists etc.
	* @param bool $value
	* @return bool true
	*/
	public function set_skip_projects_filter(bool $value) : true {

		$this->skip_projects_filter = $value;

		return true;
	}//end set_skip_projects_filter



	/**
	* SET_PARSED
	* Mark the object status as parsed. Note that SQO have two moments:
	* 1 - Base object with basic path definitions
	* 2 - Parsed object with resolved component paths and component specific properties
	* When SQO is passed to the search class to exec a DDBB query, the object elements are passed
	* to the respective components to parse the final usable object
	* @see search.parse_sql_query
	* @param bool $value
	* @return bool true
	*/
	public function set_parsed(bool $value) : true {

		$this->parsed = $value;

		return true;
	}//end set_parsed



	/**
	* SET_BREAKDOWN
	* Breakdowns the relations data into rows (split matching locators as rows).
	* If the property is set in true:
	* use the relations data to breakdown the data into rows with the match search.
	* If the property is set as false:
	* the result will be the section that match
	* By default is false
	* Used in search related to split the locators than match the search criteria (as indexations of audiovisual)
	* @see search_related.parse_sql_query
	* @param bool $value
	* @return bool true
	*/
	public function set_breakdown(bool $value) : true {

		$this->breakdown = $value;

		return true;
	}//end set_breakdown



	/**
	* SET_TABLES
	* List of tables to search.
	* Used in search related to limit the tables to search.
	* Overwrites the default value 'common::get_matrix_tables_with_relations()'
	* @param array $value
	* @return bool true
	*/
	public function set_tables(array $value) : true {

		$this->tables = $value;

		return true;
	}//end set_tables



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
	* @param string $name
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
	* Scrubs a client-supplied (json_decode'd) SQO before it is trusted by the search
	* pipeline. The HTTP API is the only untrusted SQO source; server-internal builders
	* construct a search_query_object and call search directly, so they bypass this gate.
	*
	* It removes server-only fields that, if supplied by a client, would reach raw SQL
	* without going through the component conform pipeline:
	*  - sentence / params : pre-built SQL fragment + bound values (always regenerated)
	*  - column_sql        : trusted server-built ORDER fragment (see trait.order.php)
	*  - table / table_alias : server-computed in conform_filter
	* It also forces parsed=false (a client must never be able to skip parse_sqo) and
	* coerces limit/offset/total to safe numeric types (preserving the 'all' limit sentinel).
	*
	* @param mixed $sqo
	* 	Raw SQO (object) or any other value (passed through untouched)
	* @return mixed
	*/
	public static function sanitize_client_sqo( mixed $sqo ) : mixed {

		// only process objects (raw json_decode'd sqo)
		if (!is_object($sqo)) {
			return $sqo;
		}

		// server-only fields that a client SQO must never carry, at any depth
		$server_only_keys = ['sentence','params','column_sql','table','table_alias'];
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
		// limit: keep the 'all'/'ALL' unlimited sentinel, otherwise force int
		if (isset($sqo->limit) && !(is_string($sqo->limit) && strtolower(trim($sqo->limit))==='all')) {
			$sqo->limit = (int)$sqo->limit;
		}

		return $sqo;
	}//end sanitize_client_sqo



	/**
	* STRIP_KEYS_RECURSIVE
	* Recursively unset the given keys from every object found in the node tree.
	* @param mixed $node
	* @param array $keys
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
