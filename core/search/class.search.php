<?php declare(strict_types=1);
require_once 'trait.select.php';
require_once 'trait.where.php';
require_once 'trait.order.php';
require_once 'trait.count.php';
/**
* CLASS SEARCH
*
*/
class search {

	// traits. Files added to current class file to split the large code.
	use select, where, order, count;


	// Search Query Object
	private object $sqo;

	// Search Query Language Object
	private object $sqlo;

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

	/**
	* GET_INSTANCE
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

		// construct new instance
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
	* Analyze given search_query_object and fix the properties
	* @param object $search_query_object
	* @return void
	*/
	protected function set_up(object $search_query_object) : void {

		// section tipo check and fixes
		if ( !isset($search_query_object->section_tipo) || empty($search_query_object->section_tipo) ) {
			throw new Exception("Error: section_tipo is not defined!", 1);
		}

		// Instantiate the Search Query Language Object:
		$this->sqlo = new stdClass(); 
			$this->sqlo->select		= [];
			$this->sqlo->from		= [];
			$this->sqlo->main_where = [];
			$this->sqlo->where		= [];
			$this->sqlo->order		= [];
			$this->sqlo->limit		= [];
			$this->sqlo->offset		= [];

		// section_tipo is always and array
		$this->ar_section_tipo = (array)$search_query_object->section_tipo;

		// main_section_tipo is always the first section tipo
		$this->main_section_tipo = reset($this->ar_section_tipo);

		// Main section tipo alias. Sort version of main_section_tipo
		$count_ar_section_tipo = count($this->ar_section_tipo);
		$this->main_section_tipo_alias = ($count_ar_section_tipo > 1)
			? 'mix'
			: search::trim_tipo($this->main_section_tipo);

		// matrix_table (for time machine is always fixed 'matrix_time_machine', not calculated)
		if (get_class($this)==='search') {
			// get first reliable table from ar_section_tipo (skip non existing sections)
			// Note that in autocompletes, no all RQO config sections are always available
			// in current installation (for example 'dc1' in monedaiberica)
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

		// Set SQO property
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

		// Set order_columns as empty array
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
			$this->sql_query = $sql_query;
		}

		// search
		$result	= matrix_db_manager::exec_query( $sql_query );
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
			if ($this->sqo->parsed===true) {
				return;
			}

		// filter
			if (!empty($this->sqo->filter)) {

				// conform_filter. Conform recursively each filter object asking the components
				foreach ($this->sqo->filter as $op => $filter_items) {
					$new_sqo_filter = search::conform_filter($op, $filter_items);
					break; // Only expected one
				}
				// Replace filter array with components pre-parsed values
				$this->sqo->filter = $new_sqo_filter ?? null;
			}

		// select
			$new_sqo_select = [];
			foreach ($this->sqo->select as $select_object) {
				$new_sqo_select[] = search::conform_select( $select_object );
			}
			// Replace select array with components pre-parsed values
			$this->sqo->select = $new_sqo_select;

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
	public static function conform_filter(string $op, array $filter_items) : object {

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

				$nested_query_object = search::conform_filter($op2, $filter_items2);

				$nested_query_object_array = get_object_vars($nested_query_object);
				if (!empty(reset($nested_query_object_array))) {
					$new_query_object->$op[] = $nested_query_object;
				}

			}else{

				// Case object is a end search object
				if (isset($search_object->format) && $search_object->format==='column' && isset($search_object->q_parsed)) {

					$ar_query_object = [$search_object];

				}else{

					$path				= $search_object->path;
					$search_component	= end($path);
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
	* PARSE_SQL_QUERY
	* Build full final SQL query to send to DB
	* @return string $sql_query
	* 	parsed final SQL query string
	*/
	public function parse_sql_query( ) : string {

		// pre_parse_sql_query if not already parsed
		if ($this->sqo->parsed!==true) {
			// Pre-parse search_query_object with components always before begins
			$this->parse_sqo();
		}

		// Search elements. Order is important!
		$main_where_sql			= $this->build_main_where_sql();
		$sql_query_order		= $this->build_sql_query_order();	// Order before select !
		$sql_query_select		= $this->build_sql_query_select();
		$sql_filter				= $this->build_sql_filter();
		$sql_projects_filter	= $this->build_sql_projects_filter();
		$sql_joins				= $this->get_sql_joins();
		$main_from_sql			= $this->build_main_from_sql();
		$sql_offset				= $this->sqo->offset;
		$sql_limit				= $this->sqo->limit;
		if(isset($this->sqo->children_recursive) && $this->sqo->children_recursive===true) {
			$sql_limit	= 'all';
			$sql_offset	= 0;
		}
		// order default add if not exists
		if (empty($sql_query_order)) {
			$sql_query_order = $this->build_sql_query_order_default();
		}

		// force false always that exist $this->ar_sql_joins . pending solve subquery pagination issue !
			// if (!empty($sql_joins)) {
			// 	$this->allow_sub_select_by_id = false;
			// }

		// sql_query
		$sql_query = '';

		switch (true) {

		// count case (place always at first case)
			case ($this->sqo->full_count===true):
				// Only for count

				// column_id to count. default is 'section_id', but in time machine must be 'id' because 'section_id' is not unique
					// $column_id = ($this->matrix_table==='matrix_time_machine') ? 'id' : 'section_id';

				// SELECT
					$sql_query .= ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO || $this->matrix_table==='matrix_time_machine')
						? 'SELECT '.$this->main_section_tipo_alias.'.section_id'
						: 'SELECT DISTINCT '.$this->main_section_tipo_alias.'.section_id';
				// FROM
					$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;
					# join virtual tables
					$sql_query .= $sql_joins;
					# join filter projects
					if (!empty($this->filter_join)) {
					$sql_query .= PHP_EOL . $this->filter_join;
					}
				// WHERE
					$sql_query .= PHP_EOL . 'WHERE ' . $main_where_sql;
					if (!empty($sql_filter)) {
						$sql_query .= $sql_filter;
					}
					if (!empty($this->filter_by_locators)) {
						$sql_filter_by_locators = $this->build_sql_filter_by_locators();
						$sql_query .= PHP_EOL. 'AND '.$sql_filter_by_locators;
					}
					if (isset($this->filter_by_user_records)) {
						$sql_query .= $this->filter_by_user_records;
					}
					if (!empty($this->filter_join_where)) {
						$sql_query .= $this->filter_join_where;
					}
				// multi-section union case
					if (count($this->ar_section_tipo)>1) {
						$sql_query = $this->build_union_query($sql_query);
					}
					$sql_query = 'SELECT COUNT(*) as full_count FROM (' . PHP_EOL . $sql_query . PHP_EOL. ') x';

					if(SHOW_DEBUG===true) {
						$sql_query = '-- Only for count '. $this->matrix_table . PHP_EOL . $sql_query;
					}
				break;

		// sql_filter_by_locators
			case (isset($this->filter_by_locators) && !empty($this->filter_by_locators)):

				$sql_filter_by_locators			= $this->build_sql_filter_by_locators();
				$sql_filter_by_locators_order	= empty($this->sqo->order)
					? $this->build_sql_filter_by_locators_order() // only if empty order
					: 'ORDER BY ' . $this->build_sql_query_order();

				// select
					$sql_query .= 'SELECT * FROM (';
					$sql_query .= PHP_EOL . 'SELECT *';
					$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;
					$sql_query .= PHP_EOL . 'WHERE ' . $sql_filter_by_locators;
					$sql_query .= PHP_EOL . ') main_select';
				// order
					$sql_query .= PHP_EOL . $sql_filter_by_locators_order;
				// limit
					if (!empty($sql_limit)) {
						$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
					}
				// offset
					$sql_query .= !empty($this->sqo->offset)
						? ' OFFSET ' . $sql_offset
						: '';
				break;

		// without order
			case (empty($this->sqo->order) && empty($this->sqo->order_custom)):
				# Search Without order

				// allow window selector
					if($this->allow_sub_select_by_id===true) {

						// select
							$sql_query .= 'SELECT ' . $sql_query_select;
						// from
							// $sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;
							$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;
							// from where
								$sql_query .= PHP_EOL . 'WHERE ';
								$sql_query .= $this->main_section_tipo_alias.'.id in (';
								$sql_query .= PHP_EOL . 'SELECT DISTINCT ON('.$this->main_section_tipo_alias.'.section_id,'.$this->main_section_tipo_alias.'.section_tipo) '.$this->main_section_tipo_alias.'.id ';
								$sql_query .= 'FROM '.$main_from_sql;

								// join virtual tables
									$sql_query .= $sql_joins;
								// join filter projects
									if (!empty($this->filter_join)) {
									$sql_query .= PHP_EOL . $this->filter_join;
									}
						// where
							$sql_query .= PHP_EOL . 'WHERE ' . $main_where_sql;
							if (!empty($sql_filter)) {
								$sql_query .= $sql_filter;
							}elseif (!empty($sql_filter_by_locators)) {
								$sql_query .= $sql_filter_by_locators;
							}
							if (isset($this->filter_by_user_records)) {
								$sql_query .= $this->filter_by_user_records;
							}
							if (!empty($this->filter_join_where)) {
								$sql_query .= $this->filter_join_where;
							}
						// order (default for maintain result consistency)
							$order_query = '';
							if (isset($this->sql_query_order_window_subselect)) {
								$order_query .= PHP_EOL . 'ORDER BY ' . $this->sql_query_order_window_subselect;
								if(SHOW_DEBUG===true) {
									$order_query .= ' -- sql_query_order_window_subselect ';
								}
							}else{
								if($this->allow_sub_select_by_id===true) {
									$default_order = ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';
									$order_query .= PHP_EOL . 'ORDER BY ' . $this->main_section_tipo_alias . '.section_id ' . $default_order;
									if(SHOW_DEBUG===true) {
										$order_query .= ' -- allow_sub_select_by_id=true (1-a) main_section_tipo_alias: '. $this->main_section_tipo_alias;
									}
								}else{
									$order_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order;
									if(SHOW_DEBUG===true) {
										$order_query .= ' -- allow_sub_select_by_id=false (1-b)';
									}
								}
							}
							// order multi section union case
								// if (isset($this->ar_matrix_tables) && count($this->ar_matrix_tables)>1) {
								// 	$order_query = str_replace('mix.', '', $order_query);
								// }
							$sql_query .= $order_query;
						// limit
							$limit_query = '';
							if ($this->sqo->limit>0) {
								$limit_query = PHP_EOL . 'LIMIT ' . $sql_limit;
								$sql_query .= $limit_query;
							}
						// offset
							$offset_query = '';
							if ($this->sqo->offset>0) {
								$offset_query = PHP_EOL . 'OFFSET ' . $sql_offset;
								$sql_query .= $offset_query;
							}


						// sub select (window) close
							if($this->allow_sub_select_by_id===true) {
								$sql_query .= PHP_EOL . ') ';
							}

						// multi section union case
							if (count($this->ar_section_tipo)>1) {
								$sql_query = $this->build_union_query($sql_query);
							}
						// order/limit general for sub query
							$sql_query .= PHP_EOL . 'ORDER BY ' . str_replace('mix.', '', $sql_query_order);

							if ($this->sqo->limit>0) {
								$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
							}

				// disallow window selector
					}else{

						// select
							$sql_query .= 'SELECT ' . $sql_query_select;
						// from
							$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;
							// join virtual tables
							$sql_query .= $sql_joins;
							// join filter projects
							if (!empty($this->filter_join)) {
							$sql_query .= PHP_EOL . $this->filter_join;
							}
						// where
							$sql_query .= PHP_EOL . 'WHERE ' . $main_where_sql;
							if (!empty($sql_filter)) {
								$sql_query .= $sql_filter;
							}elseif (!empty($sql_filter_by_locators)) {
								$sql_query .= $sql_filter_by_locators;
							}
							if (isset($this->filter_by_user_records)) {
								$sql_query .= $this->filter_by_user_records;
							}
							if (!empty($this->filter_join_where)) {
								$sql_query .= $this->filter_join_where;
							}
						// multi section union case
							if (count($this->ar_section_tipo)>1) {
								$sql_query = $this->build_union_query($sql_query);
							}
						// order (default for maintain result consistency)
							$order_query = '';
							if (isset($this->sql_query_order_window_subselect)) {
								$order_query .= PHP_EOL . 'ORDER BY ' . $this->sql_query_order_window_subselect;
								if(SHOW_DEBUG===true) {
									$order_query .= ' -- sql_query_order_window_subselect ';
								}
							}else{
								if($this->allow_sub_select_by_id===true) {
									$default_order = ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';
									$order_query .= PHP_EOL . 'ORDER BY ' . $this->main_section_tipo_alias.'.section_id '.$default_order;
									if(SHOW_DEBUG===true) {
										$order_query .= ' -- allow_sub_select_by_id=true ';
									}
								}else{
									$order_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order;
									if(SHOW_DEBUG===true) {
										$order_query .= ' -- allow_sub_select_by_id=false ';
									}
								}
							}
							// order multi-section union case
								if (isset($this->ar_matrix_tables) && count($this->ar_matrix_tables)>1) {
									$order_query = str_replace('mix.', '', $order_query);
								}
								$sql_query .= $order_query;
						// limit
							if ($this->sqo->limit>0) {
								$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
							}
						// offset
							if ($this->sqo->offset>0) {
								$sql_query .= ' OFFSET ' . $sql_offset;
							}
							if($this->allow_sub_select_by_id===true) {
								$sql_query .= PHP_EOL . ') ';
							}
					}//end if($this->allow_sub_select_by_id===true)

				// wrap query
					#$sql_query = 'SELECT * FROM (' . PHP_EOL . $sql_query . PHP_EOL. ') x ' ; //. $order_query . $limit_query . $offset_query;

				// debug info
					if(SHOW_DEBUG===true) {
						$sql_query = '-- Search Without order - window: '. (($this->allow_sub_select_by_id) ? 'true' : 'false') . PHP_EOL . $sql_query;
					}
				break;

		// with order
			default:
				// Search With order

				// query_inside
					$query_inside = '';

					// select
						$query_inside .= 'SELECT ' . $sql_query_select;
					// $query_inside .= ', '.$this->main_section_tipo_alias.'.id'; // avoid ambiguity in pagination of equal values
					// from
						$query_inside .= PHP_EOL . 'FROM ' . $main_from_sql;

						// join virtual tables
							$query_inside .= $sql_joins;
						// join filter projects
							if (!empty($this->filter_join)) {
							$query_inside .= PHP_EOL . $this->filter_join;
							}

					// where
						$query_inside .= PHP_EOL . 'WHERE ' . $main_where_sql;
						if (!empty($sql_filter)) {
							$query_inside .= $sql_filter;
						}
						// join filter projects
						if (!empty($this->filter_join_where)) {
							$query_inside .= $this->filter_join_where;
						}
						if (isset($this->filter_by_user_records)) {
							$query_inside .= $this->filter_by_user_records;
						}
					// multi section union case
						if (count($this->ar_section_tipo)>1) {
							$query_inside = $this->build_union_query($query_inside);
						}
				// order (default for maintain result consistency)
					$order_query = PHP_EOL . 'ORDER BY ' . $this->build_sql_query_order_default();
					// order union case for various tables
						if (isset($this->ar_matrix_tables) && count($this->ar_matrix_tables)>1) {
							$order_query = str_replace('mix.', '', $order_query);
						}

				// query wrap
					$query_inside .= $order_query;

					$sql_query .= 'SELECT * FROM (';
					$sql_query .= PHP_EOL . $query_inside. PHP_EOL;
					$sql_query .= ') main_select';
					// order
						if(isset($this->sql_query_order_custom)) {
							$sql_query .= PHP_EOL . $this->sql_query_order_custom;
						}else{
							$sql_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order;
						}
					// limit
						if ($this->sqo->limit>0) {
							$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
						}
					// offset
						if ($this->sqo->offset>0) {
							$sql_query .= ' OFFSET ' . $sql_offset;
						}
					if(SHOW_DEBUG===true) {
						$sql_query = '-- Search With order' . PHP_EOL . $sql_query;
						debug_log(__METHOD__
							. " sql_query ". PHP_EOL
							. $sql_query
							, logger::DEBUG
						);
					}
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
	* BUILD_SQL_JOIN
	* Builds one table join based on requested path
	* @param array $path
	*  sample:
		[
			{
				"name": "Publication",
				"model": "component_publication",
				"section_tipo": "rsc167",
				"component_tipo": "rsc20"
			},
			{
				"name": "Value",
				"model": "component_input_text",
				"section_tipo": "dd64",
				"component_tipo": "dd62"
			}
		]
	* @return bool true
	*/
	public function build_sql_join(array $path) : bool {

		$rel_table		= self::$relations_table;
		$ar_key_join	= [];
		$base_key		= '';
		$total_paths	= count($path);

		foreach ($path as $key => $step_object) {

			if ($key===0) {
				$base_key		= $this->main_section_tipo_alias; //self::trim_tipo($step_object->section_tipo);
				$ar_key_join[]	= self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
				continue;
			}

			$current_key = ($key===1)
				? $base_key
				: implode('_', $ar_key_join);

			$ar_key_join[] = ($key === $total_paths-1)
				? self::trim_tipo($step_object->section_tipo)
				: self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);

			$matrix_table		= common::get_matrix_table_from_tipo($step_object->section_tipo);
			// Ignore invalid empty matrix tables
			if (empty($matrix_table)) {
				debug_log(__METHOD__
					. " Ignored invalid empty matrix table " . PHP_EOL
					. ' step_object->section_tipo: ' . $step_object->section_tipo
					, logger::ERROR
				);
				continue;
			}
			$last_section_tipo	= $step_object->section_tipo;
			$t_name				= implode('_', $ar_key_join);
			$t_relation			= 'r_'.$t_name ;

			if (!isset($this->ar_sql_joins[$t_name])) {

				$sql_join  = "\n";
				if(SHOW_DEBUG===true) {
					$section_name = ontology_node::get_term_by_tipo($step_object->section_tipo, null, true, false);
					$sql_join  .= "-- JOIN GROUP $matrix_table - $t_name - $section_name\n";
				}
				# Join relation table
				$sql_join .= ' LEFT JOIN ' .$rel_table. ' AS ' .$t_relation. ' ON (';
				$sql_join .= $current_key. '.section_id=' .$t_relation. '.section_id';
				$sql_join .= ' AND ' . $current_key.'.section_tipo=' . $t_relation.'.section_tipo';
				#$sql_join .= ' AND ' .$t_relation. '.target_section_tipo=\'' .$last_section_tipo. '\'';

				# join_from_component_tipo
				if (isset($path[$key-1])) {
					$from_component_tipo = $path[$key-1]->component_tipo;
					$sql_join .= ' AND ' . $t_relation .'.from_component_tipo=\'' .$from_component_tipo. '\'';
				}else{
					$sql_join .= ' AND ' .$t_relation. '.target_section_tipo=\'' .$last_section_tipo. '\'';
				}

				$sql_join .= ')'.PHP_EOL;

				# Join next table
				$sql_join .= ' LEFT JOIN '.$matrix_table.' AS '.$t_name .' ON ('. $t_relation.'.target_section_id='.$t_name.'.section_id AND '.$t_relation.'.target_section_tipo='.$t_name.'.section_tipo)';

				// Add to joins
				$this->ar_sql_joins[$t_name] = $sql_join;
			}
		}//end foreach ($path as $key => $step_object)


		return true;
	}//end build_sql_join








}//end class search