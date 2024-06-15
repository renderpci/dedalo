<?php
/*
* SEARCH QUERY OBJECT (SQO)
* Defines object with normalized properties and checks.
* SQO or Search Query Object definition is based on
* Mango Query (A MongoDB inspired query language interface for Apache CouchDB)


	// FORMAT
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
										}]
								  } || null
		select					: [{	// array of objects optional
									section_tipo
									component_tipo
								  }]
		limit					: 1 // int
		offset					: 2 // int
		total                   : (null || int ) // by default total is null to be calculate, when int is set the sqo don't count and return his value
		full_count				: (true || false || 4) // boolean or int (int disable the function for full count and get the number as total)
		group_by 				: ['section_tipo'] // array with the columns or components (used to count values)
		order					: [{
										direction 	: (ASC || DESC) // string
										path		: [{
											section_tipo
											component_tipo
										}]
								  }]
		order_custom 			: {
									column_name : [values]
								  }
		filter_by_locators		: [{
										section_tipo
										component_tipo
								  }]
		allow_sub_select_by_id	: (true || false)
		children_recursive 		: (true || false)
		remove_distinct			: (true || false)
		skip_projects_filter	: (true || false)
		parsed					: (true || false) // boolean, state of the sqo

*/
class search_query_object {



	/**
	* VARS
	*/
		public $id;
		public $section_tipo;
		public $mode;
		public $filter;
		// public $select;
		public $limit;
		public $offset;
		public $total;
		public $full_count;
		public $group_by;
		public $order;
		public $order_custom;
		public $filter_by_locators;
		public $allow_sub_select_by_id;
		public $children_recursive;
		public $remove_distinct;
		public $skip_projects_filter;
		public $parsed;
		public $select;
		// generated_time
		public $generated_time;



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
	public function set_id(string $value) {

		$this->id = $value;

		return true;
	}//end set_id



	/**
	* SET_SECTION_TIPO
	* Array of one or more values
	* @param array $value like ['oh1']
	* @return bool true
	*/
	public function set_section_tipo(array $value) {

		$this->section_tipo = $value;

		return true;
	}//end set_section_tipo



	/**
	* SET_MODE
	* Used to identify SQO search behavior to follow
	* Time machine mode ('tm') works different for some methods
	* @param string $value like 'tm'
	* @return bool true
	*/
	public function set_mode(string $value) {

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
	public function set_filter(object $value) {

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
	public function set_select(array $value) {

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
	public function set_offset(?int $value) {

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
	public function set_total(?int $value) {

		$this->total = $value;

		return true;
	}//end set_total



	/**
	* SET_FULL_COUNT
	* Note that if the request is made it using 'true' value, the sqo->full_count value
	* will be modified with the result of the records count
	* @param bool|int $value
	* @return bool
	*/
	public function set_full_count($value) {

		if (gettype($value)!=='integer' && gettype($value)!=='boolean') {
			debug_log(__METHOD__." ERROR on set_full_count. Invalid full_count type ".gettype($value).". Only integer|boolean are valid", logger::ERROR);
			return false;
		}

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
	public function set_group_by(array $value) {

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
	public function set_order(array $value) {

		$this->order = $value;

		return true;
	}//end set_order



	/**
	* SET_ORDER_CUSTOM
	* Used mainly in portals to preserve data order
	* @param array of objects like
	* [
	*    {
	*        "column_name": "section_id",
	*        "column_values": [
	*            1, 3, 84, 2
	*        ]
	*    }
	* ]
	* @return bool true
	*/
	public function set_order_custom(array $value) {

		$this->order_custom = $value;

		return true;
	}//end set_order_custom



	/**
	* SET_FILTER_BY_LOCATORS
	* Allow to search directly with one or more locator values(section_tipo, section_id, etc.)
	* @param array $value like
	* [{
	*		"section_tipo" : "rsc35"
	*		"section_id" : "4"
	*  }]
	* @return bool true
	*/
	public function set_filter_by_locators(array $value) {

		$this->filter_by_locators = $value;

		return true;
	}//end set_filter_by_locators



	/**
	* SET_ALLOW_SUB_SELECT_BY_ID
	* Allow / disallow the default sql query window created with selected ids for speed
	* Sometimes, the default behavior (true) interferes with some search calls like
	* in autocomplete cases
	* @param bool $value
	* @return bool true
	*/
	public function set_allow_sub_select_by_id(bool $value) {

		$this->allow_sub_select_by_id = $value;

		return true;
	}//end set_allow_sub_select_by_id



	/**
	* SET_CHILDREN_RECURSIVE
	* Allow / disallow the default SQL query to get children of the main search
	* @param bool $value
	* @return bool true
	*/
	public function set_children_recursive(bool $value) {

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
	public function set_remove_distinct(bool $value) {

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
	public function set_skip_projects_filter(bool $value) {

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
	* @see search.parse_search_query_object
	* @param bool $value
	* @return bool true
	*/
	public function set_parsed(bool $value) {

		$this->parsed = $value;

		return true;
	}//end set_parsed



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
	* @param string $name
	*/
	final public function __get(string $name) {

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



}//end search_query_object
