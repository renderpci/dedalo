<?php declare(strict_types=1);
require_once 'trait.select.php';
require_once 'trait.from.php';
require_once 'trait.where.php';
require_once 'trait.order.php';
require_once 'trait.count.php';
/**
* CLASS SEARCH
* Manage Dédalo search queries parsing SQO to SQL
* It's divided in traits to split the large code:
* - select
* - from
* - where
* - order
* - count
*/
class search {

	// traits. Files added to current class file to split the large code.
	use select, from, where, order, count;

	// Search Query Object
	protected object $sqo;

	// Search Query Language Object
	protected object $sql_obj;

	// Set skip_projects_filter. Default is false
	private static array $ar_tables_skip_projects = [
		'matrix_list',
		'matrix_dd',
		'matrix_hierarchy',
		'matrix_hierarchy_main',
		'matrix_langs',
		'matrix_tools',
		'matrix_stats',
		'matrix_notes'
	];

	// ar_direct_columns. Useful to calculate efficient order sentences
	public static array $ar_direct_columns = ['section_id','section_tipo','id'];

	// ar_section_tipo : array
	public array $ar_section_tipo;

	// main_section_tipo : string
	public string $main_section_tipo;

	// main_section_tipo_alias : string
	public string $main_section_tipo_alias;

	// matrix_table : string
	protected string $matrix_table;

	// order_columns : array
	protected array $order_columns;

	// sql_query_order_custom
	public $sql_query_order_custom;

	// params counter for prepared statements
	protected int $params_counter = 1;

	// params array for prepared statements
	protected array $params = [];



	/**
	* GET_INSTANCE
	* Returns a new instance of the class based on the mode
	* @param object $search_query_object
	* @return class instance
	*/
	public static function get_instance(object $search_query_object) : object {

		// switch class from mode
		$mode = $search_query_object->mode ?? null;
		switch ($mode) {
			case 'tm':
				$search_class = 'search_tm';
				break;

			case 'related':
				$search_class = 'search_related';
				break;

			case 'edit':
			case 'list':
			default:
				$search_class = 'search';
				break;
		}

		// construct new instance of class (search|search_tm|search_related)
		$instance = new $search_class($search_query_object);


		return $instance;
	}//end get_instance



	/**
	* __CONSTRUCT
	* @param object $search_query_object
	*/
	private function __construct(object $search_query_object) {
		// Set up class minim vars
		$this->set_up($search_query_object);
	}//end __construct



	/**
	* SET_UP
	* Analyze given search_query_object and fix the properties.
	* @param object $search_query_object
	* @return void
	*/
	protected function set_up(object $search_query_object) : void {

		// section tipo check and fixes
		if ( !isset($search_query_object->section_tipo) || empty($search_query_object->section_tipo) ) {
			throw new Exception("Error: section_tipo is not defined!", 1);
		}

		// Creates the Search Query Language Object:
		$this->sql_obj = new stdClass();
			$this->sql_obj->select			= [];
			$this->sql_obj->from			= [];
			$this->sql_obj->join			= [];
			$this->sql_obj->main_where		= [];
			$this->sql_obj->where			= [];
			$this->sql_obj->order			= [];
			$this->sql_obj->order_custom	= [];
			$this->sql_obj->order_default	= [];
			$this->sql_obj->limit			= [];
			$this->sql_obj->offset			= [];

		// section_tipo is always and array
		$this->ar_section_tipo = (array)$search_query_object->section_tipo;

		// main_section_tipo is always the first section tipo
		$this->main_section_tipo = reset($this->ar_section_tipo);

		// Main section tipo alias. Sort version of main_section_tipo
		$count_ar_section_tipo = count($this->ar_section_tipo);
		$this->main_section_tipo_alias = ($count_ar_section_tipo > 1)
			? 'mix'
			: search::trim_tipo($this->main_section_tipo);

		// matrix_table 
		// Note that for time machine (class 'search_tm') is always fixed as 'matrix_time_machine'
		if (get_class($this)==='search') {
			// get first reliable table from ar_section_tipo (skip non existing sections)
			// Note that in autocompletes, no all RQO config sections are always available
			// for current installation (for example 'dc1' in monedaiberica)
			$last_key = array_key_last($this->ar_section_tipo);
			foreach ($this->ar_section_tipo as $key => $current_tipo) {

				$model_name = ontology_node::get_model_by_tipo($current_tipo, true);

				// check model (some RQO config tipos could be not installed)
				if (empty($model_name)) {
					debug_log(__METHOD__
						. " Ignored section tipo without model " . PHP_EOL
						. ' current_tipo: ' . to_string($current_tipo)
						, logger::WARNING
					);
					// If the current tipo is the last tipo, we try to
					// resolve matrix table even when no model is resolved.
					// This happens in non installed Ontologies rare cases.
					if ( $key !== $last_key ) {
						continue;
					}
				}

				// matrix table
				$current_matrix_table = common::get_matrix_table_from_tipo($current_tipo);

				// Ignore invalid empty matrix tables
				if (empty($current_matrix_table)) {
					debug_log(__METHOD__
						. " Ignored section tipo without matrix table " . PHP_EOL
						. ' current_tipo: ' . to_string($current_tipo)
						, logger::WARNING
					);
					continue;
				}

				// add the first reliable table
				$this->matrix_table = $current_matrix_table;

				// only one is set here. Stop the loop
				break;
			}
		}

		// Set SQO property with cloned object
		$this->sqo = clone $search_query_object;

		// Set remove_distinct (useful for thesaurus search)
		// By default, distinct clause is set in the search query for avoid duplicates on joins
		// In some context (thesaurus search for example) we want "duplicate section_id's" because search is made against various section tipo
		$this->sqo->remove_distinct = ($count_ar_section_tipo > 1)
			? true // Force true when more than one section is passed
			: (isset($search_query_object->remove_distinct)
				? $search_query_object->remove_distinct
				: false); // false is default

		$this->sqo->skip_projects_filter = (in_array($this->matrix_table, search::$ar_tables_skip_projects, true))
			? true
			: (isset($search_query_object->skip_projects_filter)
				? $search_query_object->skip_projects_filter
				: false);

		// order_columns. Set order_columns as empty array
		$this->order_columns = [];
	}//end set_up



	/**
	* FETCH_ROW
	* Loop
	* @param \PgSql\Result|false $result
	* @return object|false
	*/
	public function fetch_row( \PgSql\Result|false $result ) : object|false {

		if (!$result) {
			$this->logError("Invalid result resource");
			return false;
		}

		return pg_fetch_object($result);
	}



	/**
	* SEARCH
	* Parses the current sqo and exec a SQL query search against the database
	* @return \PgSql\Result|false
	*/
	public function search() : \PgSql\Result|false {

		// debug
		if(SHOW_DEBUG===true) {
			$start_time=start_time();

			// metrics
			metrics::$search_total_calls++;
		}

		// parse SQO. Converts JSON search_query_object to SQL query string
		$sql_query = $this->parse_sql_query();
		if(SHOW_DEBUG===true) {
			$parsed_time = round(start_time()-$start_time,3);
		}

		// search
		$result	= matrix_db_manager::exec_search( $sql_query, $this->params );
		if ($result===false) {
			return false;
		}

		// children recursive
		if (isset($this->sqo->children_recursive) && $this->sqo->children_recursive===true) {
			// Override result adding children.
			$result	= $this->search_children_recursive( $result );
		}//end if search_query_object->children_recursive===true

		// debug
		if(SHOW_DEBUG===true) {
			$exec_time = exec_time_unit($start_time,'ms');
			if($exec_time>SLOW_QUERY_MS) {
				debug_log(__METHOD__
					. " SLOW_QUERY. LOAD_SLOW_QUERY " . PHP_EOL
					. ' exec_time: '.$exec_time .PHP_EOL
					. ' sql_query: ' .$sql_query
					, logger::WARNING
				);
			}

			$this->sqo->executed_time = $exec_time;

			// dd_core_api::$sql_query_search. Fulfill on API request
			if (!empty(dd_core_api::$rqo)) {
				dd_core_api::$sql_query_search[] = '-- TIME ms: '. $exec_time . PHP_EOL . $sql_query;
			}

			// metrics
			metrics::$search_total_time += $exec_time;
		}


		return $result;
	}//end search



	/**
	* SEARCH_CHILDREN_RECURSIVE
	* Process the result of the main search (the parents section records)
	* Obtains all recursive children with the search result
	* Creates a new SQO with all section_id of parents and children.
	* Searches the combination and updates main SQO with the new SQO (with all
	* parents and children) to be used for pagination.
	* @param \PgSql\Result $main_result
	* @return \PgSql\Result|false $result
	*/
	private function search_children_recursive( \PgSql\Result $main_result ) : \PgSql\Result|false {

		$ar_row_children = [];
		$ar_records = [];
		while ($row = $this->fetch_row($main_result)) {

			// row expected an object as {section_tipo: oh1, section_id: 2} (select previously changed on parse sqo)
			$ar_records[] = $row;

			$row_children = component_relation_children::get_children_recursive(
				$row->section_id, // string section_id
				$row->section_tipo, // string section_tipo
				null // string|null component_tipo
			);

			$ar_row_children = array_merge($ar_row_children, $row_children);
		}

		// No children found case. Return the main search result.
		if (empty($ar_row_children)) {
			return $main_result;
		}

		// Merges parent and children records
		$ar_rows_mix = array_merge($ar_row_children, $ar_records);

		// Generates the new SQO with all section_id.
		$new_sqo = $this->generate_children_recursive_search($ar_rows_mix);

		// New full search execution.
		$children_search	= search::get_instance($new_sqo);
		$result				= $children_search->search();

		// Update current SQO changing properties to allow pagination
		$this->sqo->filter				= $new_sqo->filter;
		$this->sqo->total				= count($ar_rows_mix);
		$this->sqo->children_recursive	= false;
		$this->sqo->parsed				= true;


		return $result;
	}//end search_children_recursive



	/**
	* GENERATE_CHILDREN_RECURSIVE_SEARCH
	* Create a new filter to inject in current search query object
	* @param array $ar_rows
	* @return object $new_sqo
	*/
	public function generate_children_recursive_search( array $ar_rows ) : object {

		// clone original sqo
			$new_sqo = clone $this->sqo;

		// force re - parse
			$new_sqo->parsed = false;

		// remove children_recursive to avoid infinite loop
			$new_sqo->children_recursive = false;

		// remove possible filter_by_locators (parent searched previously)
			unset($new_sqo->filter_by_locators);

		// not count
			$new_sqo->full_count = false;

		// new full filter
			$filter	= new stdClass();
			$op_or	= '$or';
			$op_and	= '$and';

		// fixed_children_filter
			if(isset($new_sqo->fixed_children_filter)){
				$filter->{$op_and}[] = $new_sqo->fixed_children_filter;
			}

		// optimized version using IN
			$ar_section_id = array_map(function($el){
				return $el->section_id;
			}, $ar_rows);
			$section_tipo = $ar_rows[0]->section_tipo ?? '';
			$item = json_decode('{
				"q": "'. implode(',', $ar_section_id) .'",
				"q_operator": null,
				"path": [
				  {
					"section_tipo": "'. $section_tipo .'",
					"component_tipo": "section_id",
					"model": "component_section_id",
					"name": "Id"
				  }
				]
			}');
			$children_filter = [$item];

		// filter
			if(isset($filter->{$op_and})){

				$add_children = new stdClass();
				$add_children->{$op_or} = $children_filter;

				$filter->{$op_and}[] = $add_children;

			}else{

				$filter->{$op_or} = $children_filter;
			}

		// replace filter in sqo
			$new_sqo->filter = $filter;


		return $new_sqo;
	}//end generate_children_recursive_search



	/**
	* PARSE_Sqo
	* Iterate all filter and select elements and communicate with components to rebuild the search_query_object
	* Not return anything, only modifies the class var $this->sqo
	* @return void
	*/
	public function parse_sqo() : void {

		// already parsed case
			$parsed = $this->sqo->parsed ?? false;
			if ($parsed===true) {

				return;
			}

		// filter
			if (!empty($this->sqo->filter)) {

				// conform_filter. Conform recursively each filter object asking the components
				foreach ($this->sqo->filter as $op => $filter_items) {
					$new_sqo_filter = $this->conform_filter($op, $filter_items);
					break; // Only expected one
				}
				// Replace filter array with components pre-parsed values
				$this->sqo->filter = $new_sqo_filter ?? null;
			}

		// select
			if (!empty($this->sqo->select)) {
				$new_sqo_select = [];
				foreach ($this->sqo->select as $select_object) {
					$new_sqo_select[] = search::conform_select( $select_object );
				}
				// Replace select array with components pre-parsed values
				$this->sqo->select = $new_sqo_select;
			}

		// order. Note that order is parsed with same parser as 'select' (conform_select)
			if (!empty($this->sqo->order)) {
				$new_sqo_order = [];
				foreach ((array)$this->sqo->order as $select_object) {
					$new_sqo_order[] = search::conform_select( $select_object );
				}
				// Replace select array with components pre-parsed values
				$this->sqo->order = $new_sqo_order;
			}

		// Set object as parsed
		$this->sqo->parsed = true;
	}//end parse_sqo



	/**
	* IS_SEARCH_OPERATOR
	* @param object $search_object
	* @return bool
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
	* CONFORM_FILTER
	* Call to components to conform final search_query_object, adding specific component path, search operators etc.
	* Recursive
	* @param string $op
	* 	sample: '$and'
	* @param array $filter_items
	* sample:
	*	[
	*		{
	*			"q": {
	*				 "section_id": "1",
	*				 "section_tipo": "dd64",
	*				 "type": "dd151",
	*				 "from_component_tipo": "dd1354"
	*			},
	*			"q_operator": null,
	*			"path": [
	*				 {
	*					"section_tipo": "dd1324",
	*					"component_tipo": "dd1354",
	*					"model": "component_radio_button",
	*					"name": "Active"
	*				 }
	*			]
	*		}
	*	]
	* @return object $new_query_object
	*/
	public function conform_filter(string $op, array $filter_items) : object {

		$new_query_object = new stdClass();
			$new_query_object->$op = [];

		// foreach ($filter_items as $search_object) {
		$filter_items_size = sizeof($filter_items);
		for ($i=0; $i < $filter_items_size; $i++) {

			$search_object = $filter_items[$i];

			// is object check
				if (!is_object($search_object)) {

					debug_log(__METHOD__
						.' Invalid (IGNORED) non object search_object: ' . PHP_EOL
						.' type: ' 			. gettype($search_object) . PHP_EOL
						.' search_object: ' . json_encode($search_object, JSON_PRETTY_PRINT) . PHP_EOL
						.' filter_items: ' 		. json_encode($filter_items, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
					continue;
				}

			// Check if the filter is a logical or query.
			// logical: group of queries with the logical operator ($or/$and)
			// query: filter definition item with value in q and its path to find the value
			if ( !property_exists($search_object, 'path') ) {

				// Case object is a group of filter items with a operator as key ($or/$and).
				// in those cases, go deep into the filter and conform with the deeper filter item recursively
				$op2			= array_key_first(get_object_vars($search_object));
				$filter_items2	= $search_object->$op2;

				$nested_query_object = $this->conform_filter($op2, $filter_items2);

				$nested_query_object_array = get_object_vars($nested_query_object);
				if (!empty(reset($nested_query_object_array))) {
					$new_query_object->$op[] = $nested_query_object;
				}

			}else{

				// Case object is a end search object
				if (isset($search_object->format) && $search_object->format==='column' && isset($search_object->q_parsed)) {

					$ar_query_object = [$search_object];

				}else{

					$path						= $search_object->path;
					$search_object->table_alias	= $this->get_table_alias_from_path( $path );
					$search_component			= end($path);
					// model (with fallback if do not exists)
					if (!isset($search_component->model)) {
						$search_component->model = ontology_node::get_model_by_tipo($search_component->component_tipo, true);
					}
					// check for empty models like elements that this installation don't have (e.g. 'numisdata303' from request config fixed filter in Objects -tch1-)
					if (empty($search_component->model)) {
						debug_log(__METHOD__
							. " Error resolving component model. Ignored search element " . PHP_EOL
							. ' tipo: ' . to_string($search_component->component_tipo)
							, logger::ERROR
						);
						continue;
					}
					$model_name = $search_component->model;

					$ar_query_object = $model_name::get_search_query($search_object);
				}

				$new_query_object->$op = array_merge($new_query_object->$op, $ar_query_object);
			}
		}//end for ($i=0; $i < $filter_items_size; $i++)


		return $new_query_object;
	}//end conform_filter



	/**
	* CONFORM_SELECT
	* Resolve the column name using the key ( with the model of the ontology tipo ) when the column is not defined
	* {
	* 	"column"		: "relation" string column name
	* 	"key"			: "oh25" string|null component tipo
	* }
	* @param object $select_object
	* @return object $select_object
	*/
	public static function conform_select( object $select_object ) : object {

		// key is not defined or has empty value
		if( empty($select_object->key) ){
			return $select_object; // No check the component column
		}

		// column is defined and has a value
		if( !empty($select_object->column) ){
			return $select_object;
		}

		// Resolve each column name
		$model_name				= ontology_node::get_model_by_tipo($select_object->key,true);
		$select_object->column	= section_record_data::get_column_name( $model_name );

		return $select_object;
	}//end conform_select



	/**
	* TRIM_TIPO
	* Contract the tipo to prevent large names in SQL sentences
	* @see search_Test::test_trim_tipo
	* @param string $tipo
	* @param int $max = 2
	* @return string|null $trimmed_tipo
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
	* GET_TABLE_ALIAS_FROM_PATH
	* @param array $path
	* @return string $table_alias
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
	* BUILD_UNION_QUERY
	* Rewrite query string building SQL union for each different matrix table
	* based on every section tipo table resolution
	* @param string $sql_query
	*  The original SQL query to be modified.
	* @return string $sql_query
	*  The modified SQL query with UNION clauses for each matrix table.
	*/
	public function build_union_query(string $sql_query) : string {

		// Calculate matrix tables based on section tipos
		$this->ar_matrix_tables = [];
		foreach ($this->ar_section_tipo as $key => $current_section_tipo) {

			$model_name = ontology_node::get_model_by_tipo($current_section_tipo, true);

			// check model (some RQO config tipos could be not installed)
			if (empty($model_name)) {
				debug_log(__METHOD__
					. " Ignored section tipo without model " . PHP_EOL
					. ' current_section_tipo: ' . to_string($current_section_tipo)
					, logger::WARNING
				);
				continue;
			}

			$current_matrix_table = common::get_matrix_table_from_tipo($current_section_tipo);

			// Ignore invalid empty matrix tables
			if (empty($current_matrix_table)) {
				debug_log(__METHOD__
					. " Ignored invalid empty matrix table " . PHP_EOL
					. ' section_tipo: ' . $current_section_tipo
					, logger::ERROR
				);
				continue;
			}

			// Add unique matrix tables to the list
			if (!in_array($current_matrix_table, $this->ar_matrix_tables)) {
				$this->ar_matrix_tables[] = $current_matrix_table;
			}
		}

		// If there are multiple matrix tables, build UNION query
		if (count($this->ar_matrix_tables)>1) {
			$tables_query = [];

			// Add current query
			$tables_query[] = $sql_query;

			foreach ($this->ar_matrix_tables as $key => $current_matrix_table) {

				// Ignore the first table
				if ($key===0) {
					continue;
				}

				// copy source and replace table and alias names
				$current_query	= $sql_query;
				$current_query	= preg_replace('/(FROM [a-zA-z]+ AS [a-zA-z]+)/i', 'FROM '.$current_matrix_table.' AS mix_'.$current_matrix_table, $current_query);
				$current_query	= str_replace('mix.', 'mix_'.$current_matrix_table.'.', $current_query);

				// Add the modified query to the list
				$tables_query[] = $current_query;
			}

			// Replace the original query with UNION ALL clauses
			$sql_query = implode(PHP_EOL . 'UNION ALL' . PHP_EOL, $tables_query);
		}


		return $sql_query;
	}//end build_union_query



	/**
	* PARSE_SQL_QUERY
	* Build full final SQL query to send to DB
	* @return string $sql_query
	* 	parsed final SQL query string
	*/
	public function parse_sql_query( ) : string {

		// pre_parse_sql_query if not already parsed
		$parsed = $this->sqo->parsed ?? false;
		if ($parsed!==true) {

			// Pre-parse search_query_object with components always before begins
			$this->parse_sqo();
		}

		// Search elements. Order is important!
		// $main_where_sql			= $this->build_main_where();
		// $sql_query_order		= $this->build_sql_query_order();	// Order before select !
		// $sql_query_select		= $this->build_sql_query_select();
		// $sql_filter				= $this->build_sql_filter();
		// $sql_projects_filter	= $this->build_sql_projects_filter();
		// $sql_joins				= $this->get_sql_joins();
		// $main_from_sql			= $this->build_main_from_sql();
		// $sql_offset				= $this->sqo->offset;
		// $sql_limit				= $this->sqo->limit;
		if(isset($this->sqo->children_recursive) && $this->sqo->children_recursive===true) {
			$this->sqo->limit	= 'all';
			$this->sqo->offset	= 0;
		}


		switch (true) {

		// count case (place always at first case)
			case ($this->sqo->full_count===true):
				$sql_query = $this->parse_sql_full_count();
				break;

		// sql_filter_by_locators
			case (isset($this->sqo->filter_by_locators) && !empty($this->sqo->filter_by_locators)):

				$sql_query = $this->parse_sql_filter_by_locators();

				break;

		// without order
			case (empty($this->sqo->order) && empty($this->sqo->order_custom)):
			default:
				$sql_query = $this->parse_sql_default();

				break;
		}

		$sql_query .= ';' . PHP_EOL;


		// check valid matrix table
			if (get_called_class()==='search' && empty($this->matrix_table) && !in_array('all', $this->ar_section_tipo)) {
				debug_log(__METHOD__
					. ' Error: Matrix table is mandatory. Check your ar_section_tipo to safe tipos with resolvable model.' . PHP_EOL
					. ' $this->ar_section_tipo: ' . to_string($this->ar_section_tipo) . PHP_EOL
					. ' sql_query: ' . $sql_query. PHP_EOL
					. ' class: ' . get_called_class() . PHP_EOL
					. ' this: ' . to_string($this)
					, logger::ERROR
				);
			}


		return $sql_query;
	}//end parse_sql_query


	/**
	* PARSE_SQL_FULL_COUNT
	* Build full final SQL query to send to DB
	* @return string $sql_query string
	* 	parsed final SQL query string
	*/
	public function parse_sql_full_count() : string {

		// sql_query
			$sql_query = '';


	/**
	* PARSE_SQL_FULL_COUNT
	* Build full final SQL query to send to DB
	* @return string $sql_query string
	* 	parsed final SQL query string
	*/
	public function parse_sql_full_count() : string {

		// from
		$this->build_main_from_sql();
		// where sentences
		// The filters are built into the sql_obj->where array
		// The building should to be done in restrictive order.
		$this->build_main_where();
		$this->build_sql_filter();
		$this->build_sql_filter_by_locators();
		$this->build_filter_by_user_records();

		// column_id to count. default is 'section_id', but in time machine must be 'id' because 'section_id' is not unique
			// $column_id = ($this->matrix_table==='matrix_time_machine') ? 'id' : 'section_id';

		// sql_query
		$sql_query = '';

		// select
		$sql_query .= ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO || $this->matrix_table==='matrix_time_machine')
			? 'SELECT '.$this->main_section_tipo_alias.'.section_id'
			: 'SELECT DISTINCT '.$this->main_section_tipo_alias.'.section_id';
		
		// from
		$sql_query .= PHP_EOL . 'FROM ' . implode(PHP_EOL, $this->sql_obj->from);
		
		// join virtual tables/filter projects
		$join = implode( PHP_EOL, $this->sql_obj->join);
		if (!empty($join)) {
			$sql_query .= PHP_EOL . $join;
		}
		
		// where
		// merge main_where and where and remove empty sentences	
		$all_where_sentences = array_filter(array_merge($this->sql_obj->main_where, $this->sql_obj->where));
		$sql_query .= PHP_EOL . 'WHERE ' . implode(PHP_EOL.' AND ', $all_where_sentences);

		// multi-section union case
		if (count($this->ar_section_tipo)>1) {
			$sql_query = $this->build_union_query($sql_query);
		}

		// final
		$sql_query = 'SELECT COUNT(*) as full_count FROM (' . PHP_EOL . $sql_query . PHP_EOL. ') x';


		return $sql_query;
	}//end parse_sql_full_count



	/**
	* PARSE_SQL_FILTER_BY_LOCATORS
	* Build full final SQL query to send to DB
	* @return string $sql_query string
	* 	parsed final SQL query string
	*/
	public function parse_sql_filter_by_locators() : string {

		$this->build_main_from_sql();
		$sql_offset = $this->sqo->offset;

		$this->build_sql_filter_by_locators();
		if ( empty($this->sqo->order) ) {
			// $this->build_sql_filter_by_locators_order(); // only if empty order
		} else {
			$this->build_sql_query_order();
		}

		$sql_query = '';

		// select
		$sql_query .= 'SELECT * FROM (';
		$sql_query .= PHP_EOL . 'SELECT *';
		$sql_query .= PHP_EOL . 'FROM ' . implode(PHP_EOL, $this->sql_obj->from);
		if (!empty($this->sql_obj->join) ){
			$sql_query .= PHP_EOL . implode(PHP_EOL, $this->sql_obj->join);
		}
		$sql_query .= PHP_EOL . 'WHERE ' . implode(PHP_EOL, $this->sql_obj->where);
		$sql_query .= PHP_EOL . ') main_select';
	
		// order
		if( !empty($this->sqo->order) ){
			$sql_query .= PHP_EOL . 'ORDER BY ' . implode( PHP_EOL, $this->sql_obj->order );
		}
	
		// limit
		if (!empty($sql_limit)) {
			$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
		}
	
		// offset
		$sql_query .= !empty($this->sqo->offset)
			? ' OFFSET ' . $sql_offset
			: '';


		return $sql_query;
	}//end parse_sql_filter_by_locators



	/**
	* TRIM_TIPO
	* Contract the tipo to prevent large names in SQL sentences
	* @see search_Test::test_trim_tipo
	* @param string $tipo
	* @param int $max = 2
	* @return string|null $trimmed_tipo
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
	* GET_QUERY_PATH
	* Recursive function to obtain final complete path of each element in json query object
	* Used in component common and section to build components path for select
	* @param string $tipo
	* @param string $section_tipo
	* @param bool $resolve_related = true
	* @param bool|string $related_tipo = false
	* @return array $path
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
	* @param array $search_operators_info
	*	Array of operator => label like: ... => between
	* @return string $search_options_title
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
	* @param object $search_object
	* @return bool
	*/
	public static function is_search_operator(object $search_object) : bool {

		foreach ($search_object as $key => $value) {
			if (strpos($key, '$')!==false) {
				return true;
			}
		}

		return false;
	}//end is_search_operator




}//end class search