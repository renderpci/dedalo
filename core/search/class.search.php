<?php
declare(strict_types=1);
/**
* CLASS SEARCH
*
* Portal use:
* 	GROUP BY md1015.id
* 	HAVING count(*) > 1
*/
class search {



	// main vars
		// matrix table relations name
		private static $relations_table = 'relations';

		// JSON object untouched, before parse (for debug purposes)
		public $search_query_object_preparse;
		// JSON object to parse
		public $search_query_object;
		// from base, section tipo initial from
		public $main_from_sql;
		// join_group
		protected $join_group;
		// main_where_sql
		protected $main_where_sql;

		// preparsed search_query_object
		// private $preparsed_search_query_object;

		// matrix_table (fixed on get main select)
		protected $matrix_table;

		protected $order_columns;

		// ALLOW_SUB_SELECT_BY_ID. Get value from search_query_object if exists. True by default set in set_up
		// Is used by speed pagination in large tables
		protected $allow_sub_select_by_id;

		// REMOVE_DISTINCT . By default, distinct clause is set in the search query for avoid duplicates on joins
		// In some context (thesaurus search for example) we want "duplicate section_id's" because search is made against various section tipo
		protected $remove_distinct;

		// skip_projects_filter
		protected $skip_projects_filter;

		// sql_query_order_default
		protected $sql_query_order_default;

		// sql_query_order_window_subselect
		// Specific order SQL sentence for window sub-select
		protected $sql_query_order_window_subselect;

		// relations cache
		// Store already selected relation columns to avoid overload query with multiple relations components
		protected $relations_cache;

		// matrix tables
		protected $ar_matrix_tables;

		// filter_by_locators
		protected $filter_by_locators;

		// ar_direct_columns. Useful to calculate efficient order sentences
		public static $ar_direct_columns = ['section_id','section_tipo','id'];

		// include_negative
		// negative section_id used in profiles for the root user, root record could be avoid or include
		public $include_negative;

		// ar_section_tipo : array
		public $ar_section_tipo;

		// main_section_tipo : string
		public $main_section_tipo;

		// main_section_tipo_alias : string
		public $main_section_tipo_alias;

		// filter_join
		public $filter_join;
		public $filter_join_where;

		// filter_by_user_records
		public $filter_by_user_records;

		// sql_query_order_custom
		public $sql_query_order_custom;

		// ar_sql_joins
		public $ar_sql_joins;



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

		// Set and fix class property search_query_object
		$this->search_query_object = (object)$search_query_object;

		// section tipo check and fixes
		if (!isset($this->search_query_object->section_tipo)) {
			throw new Exception("Error: section_tipo is not defined!", 1);
		}

		// section_tipo is always and array
		$this->ar_section_tipo = (array)$this->search_query_object->section_tipo;

		$count_ar_section_tipo = count($this->ar_section_tipo);

		// main_section_tipo is always the first section tipo
		$this->main_section_tipo = reset($this->ar_section_tipo);

		// alias . Sort version of main_section_tipo
		$this->main_section_tipo_alias = ($count_ar_section_tipo > 1)
			? 'mix'
			: self::trim_tipo($this->main_section_tipo);

		// matrix_table (for time machine if always fixed 'matrix_time_machine', not calculated)
		if (get_class($this)!=='search_tm' && get_class($this)!=='search_related') {
			// get first reliable table from ar_section_tipo (skip non existing sections)
			foreach ($this->ar_section_tipo as $current_tipo) {
				$current_matrix_table = common::get_matrix_table_from_tipo($current_tipo);
				if (!empty($current_matrix_table)) {
					$this->matrix_table = $current_matrix_table;
					break;
				}
			}
		}

		// matrix table for related searches
		if (get_class($this)!=='search_related') {
			$this->ar_matrix_tables = common::get_matrix_tables_with_relations();
		}

		// select default
		if(!isset($this->search_query_object->select)) {
			$this->search_query_object->select = [];
		}

		// filter_by_locators
		if(isset($this->search_query_object->filter_by_locators)) {
			$this->filter_by_locators = $this->search_query_object->filter_by_locators;
		}

		// records limit default
		if(!property_exists($this->search_query_object, 'limit')
			|| $this->search_query_object->limit===null
			){
			$this->search_query_object->limit = 10;
		}

		// offset default
		if(!isset($this->search_query_object->offset)) {
			$this->search_query_object->offset = false;
		}

		// records count default
		if(!isset($this->search_query_object->full_count)) {
			$this->search_query_object->full_count = false;
		}

		// parsed default
		if (!isset($this->search_query_object->parsed)) {
			$this->search_query_object->parsed = false;
		}

		// Set order_columns as empty array
		$this->order_columns = [];

		// Set allow this->allow_sub_select_by_id for speed (disable in some context like autocomplete)
		$this->allow_sub_select_by_id = (isset($search_query_object->allow_sub_select_by_id))
			? $search_query_object->allow_sub_select_by_id
			: true; // True is default

		// Set remove_distinct (useful for thesaurus search)
		$this->remove_distinct = ($count_ar_section_tipo > 1)
			? true // Force true when more than one section is passed
			: (isset($search_query_object->remove_distinct)
				? $search_query_object->remove_distinct
				: false); // false is default

		// Set skip_projects_filter. Default is false
		$ar_tables_skip_projects = [
			'matrix_list',
			'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_langs',
			'matrix_tools',
			'matrix_stats'
		];
		$this->skip_projects_filter = (in_array($this->matrix_table, $ar_tables_skip_projects, true))
			? true
			: (isset($this->search_query_object->skip_projects_filter)
				? $this->search_query_object->skip_projects_filter
				: false);
	}//end set_up



	/**
	* SEARCH
	* Exec a SQL query search against the database
	* @return object $response
	* {
	* 	ar_records : [], // array
	* 	debug : '' string
	* }
	*/
	public function search() : object {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();

				// metrics
				metrics::$search_total_calls++;
			}

		// parse SQO. Converts JSON search_query_object to SQL query string
			$sql_query = $this->parse_search_query_object( $full_count=false );
			if(SHOW_DEBUG===true) {
				$parsed_time = round(start_time()-$start_time,3);
			}

		// search
			$result	= JSON_RecordObj_matrix::search_free($sql_query);
			if ($result===false) {
				debug_log(__METHOD__
					. ' Error Processing Request : Sorry cannot execute search_free non resource query' . PHP_EOL
					. ' sql_query: ' . $sql_query
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt, ' bt ++ '.to_string());
				}
				// response
				$response = new stdClass();
					$response->ar_records	= [];
					$response->debug		= 'Error on exec search';

				return $response;
			}

		// ar_records. Build a temporal list with array of records found in query
			$ar_relations_cache_solved	= [];
			$ar_records					= [];
			$pg_num_fields				= pg_num_fields($result);
			while ($rows = pg_fetch_assoc($result)) {

				$row = new stdClass();

				// Result columns/fields
				for ($i=0; $i < $pg_num_fields; $i++) {

					// field name / value
					$field_name		= pg_field_name($result, $i);
					$field_value	= $rows[$field_name];

					// Skip temp relations_xxx columns and store their solved values
					if (strpos($field_name, 'relations_')===0) {
						$ar_relations_cache_solved[$field_name] = json_decode($field_value);
						continue;
					}

					// Add property
					$row->{$field_name} = ($field_name==='datos' || $field_name==='dato') && !empty($field_value)
						? json_decode($field_value)
						: $field_value;
				}

				/* (!) NOTE: THIS RESOLUTION IS ONLY VIABLE FOR THE FIRST LEVEL. */
				// Relation components. Get relations data from relations column and parse virtual columns values for each component
				if (isset($this->relations_cache)) foreach ((array)$this->relations_cache as $table_alias => $ar_component_tipo) {
					foreach ($ar_component_tipo as $component_tipo) {
						$field_name		= $component_tipo;
						$property_name	= 'relations_' . $table_alias;
						// $field_value	= $ar_relations_cache_solved[$property_name]; // Full relations data
						//if (isset($ar_relations_cache_solved[$property_name])) {
							$current_relations_cache_solved	= $ar_relations_cache_solved[$property_name];
							$field_value = array_filter((array)$current_relations_cache_solved, function($locator) use($component_tipo) {
								return (isset($locator->from_component_tipo) && $locator->from_component_tipo===$component_tipo);
							});
							$field_value = array_values($field_value);
						//}
						// Add property
						$row->{$field_name} = ($field_name==='datos' || $field_name==='dato')
							? json_encode($field_value)
							: $field_value;
					}
				}

				// add solved row
				$ar_records[] = $row;
			}//end while ($rows = pg_fetch_assoc($result))

		// children recursive
			if (isset($this->search_query_object->children_recursive) && $this->search_query_object->children_recursive===true) {

				$ar_row_children = [];
				foreach ($ar_records as $row) {
					$row_children = component_relation_children::get_children(
						$row->section_id, // string section_id
						$row->section_tipo, // string section_tipo
						null, // string|null component_tipo
						true, // bool recursive
						false // bool is_recursion
					);

					$ar_row_children = array_merge($ar_row_children, $row_children);
				}

				if (!empty($ar_row_children)) {

					$ar_rows_mix	= array_merge($ar_row_children, $ar_records);
					$new_sqo		= $this->generate_children_recursive_search($ar_rows_mix);

					// new full search
						$children_search	= search::get_instance($new_sqo);
						$response			= $children_search->search();

					// replace current sqo changed properties to allow pagination
						$this->search_query_object->filter				= $new_sqo->filter;
						$this->search_query_object->full_count			= count($ar_rows_mix);
						$this->search_query_object->children_recursive	= false;
						$this->search_query_object->parsed				= true;

					return $response;
				}
			}//end if search_query_object->children_recursive===true

		// debug
			if(SHOW_DEBUG===true) {
				$total_time_ms = exec_time_unit($start_time,'ms');
				if($total_time_ms>SLOW_QUERY_MS) {
					debug_log(__METHOD__
						. " SLOW_QUERY. LOAD_SLOW_QUERY " . PHP_EOL
						. ' total_time_ms: '.$total_time_ms .PHP_EOL
						. ' sql_query: ' .$sql_query
						, logger::WARNING
					);
				}
			}

		// full_count DEPRECATED DON'T USE IT
			if ($this->search_query_object->full_count===true) {
				debug_log(__METHOD__
					. ' Warning! You are using a deprecated way to count records !' . PHP_EOL
					, logger::ERROR
				);
				// Exec a count query
				// Converts JSON search_query_object to SQL query string
				$full_count_sql_query	= $this->parse_search_query_object( $full_count=true );
				$full_count_result		= JSON_RecordObj_matrix::search_free($full_count_sql_query);
				$row_count				= pg_fetch_assoc($full_count_result);
				$full_count				= (int)$row_count['full_count'];
				// Fix full_count value
				$this->search_query_object->full_count = $full_count;
			}

		// response build to output
			$response = new stdClass();
				$response->ar_records = $ar_records;

		// debug
			if(SHOW_DEBUG===true) {
				// error_log($sql_query);
				$exec_time = exec_time_unit($start_time, 'ms');
				$response->generated_time['parsed_time'] = $parsed_time;
				# Info about required time to exec the search
				$response->generated_time['get_records_data'] = $exec_time;
				# Query to database string
				$response->strQuery = $sql_query;
				if (isset($full_count_sql_query)) {
					$response->strQuery .= PHP_EOL . $full_count_sql_query;
				}
				$this->search_query_object->generated_time 	= $exec_time;

				$ar_sections = (array)$this->search_query_object->section_tipo;
				$ar_sections = array_map(function($section_tipo){
					return $section_tipo .' - '. RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true);
				}, $ar_sections);

				// debug_log(__METHOD__." search_query_object ".json_encode($this->search_query_object, JSON_PRETTY_PRINT), logger::DEBUG);
				// debug_log(__METHOD__." SQL QUERY EXEC TIME (".implode(',', $ar_sections)."): ".round(start_time()-$start_time,3).' '. str_repeat('-', 50) .PHP_EOL. to_string($sql_query), logger::DEBUG);

				// debug_log(__METHOD__." 2 total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);
				// debug_log(__METHOD__." sql_query: ".to_string($sql_query), logger::DEBUG);
				// error_log("sql_query: \n" . to_string($sql_query));

				// dd_core_api::$sql_query_search. Fulfill on API request
					if (!empty(dd_core_api::$rqo)) {
						dd_core_api::$sql_query_search[] = '-- TIME ms: '. $exec_time . PHP_EOL . $sql_query;
					}

				// metrics
				metrics::$search_total_time += $exec_time;

				// warning on too much relations_cache (to prevent updates/import memory issues)
					$total_relations = isset($this->relations_cache)
						? count($this->relations_cache)
						: 0;
					if ($total_relations>1000) {
						debug_log(__METHOD__
							. " Search relations_cache big total " . PHP_EOL
							. ' total_relations: ' .$total_relations
							, logger::WARNING
						);
					}
			}


		return $response;
	}//end search



	/**
	* COUNT
	* Count the rows of the sqo
	* @return object $records_data
	* like:
	* {
	* 	total : 369, integer
	* 	debug_info: ....
	* }
	*/
	public function count() : object {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();
				// metrics
				metrics::$search_total_calls++;
			}

		// RECORDS_DATA BUILD TO OUTPUT
			$records_data = new stdClass();

		// children recursive, to count the children is necessary do a search to know if the term has children
		if (isset($this->search_query_object->children_recursive) && $this->search_query_object->children_recursive===true) {
			// search as normal search to get the children_recursive sqo to be used for count.
			$this->search();
		}

		// ONLY_COUNT
		// Exec a count query
		// Converts JSON search_query_object to SQL query string
			$count_sql_query	= $this->parse_search_query_object( true );
			$count_result		= JSON_RecordObj_matrix::search_free($count_sql_query);
			// Note that in some cases, such as "relationship search", more than one total is given.
			// because UNION is used for tables
			$total = 0;
			$totals_group = [];
			while($row = pg_fetch_assoc($count_result)) {
				// get the total as the sum of all rows
				$total = $total + (int)$row['full_count'];

				// group by
				// get the specific total of the group_by concept (as section_tipo)
				if( isset($this->search_query_object->group_by) ){
					$current_totals_object = new stdClass();
					$ar_keys = [];
					foreach($this->search_query_object->group_by as $current_group){
						$ar_keys[] = $row[$current_group];
					}
					$current_totals_object->key		= $ar_keys;
					$current_totals_object->value	= (int)$row['full_count'];

					$totals_group[] = $current_totals_object;
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				$exec_time = exec_time_unit($start_time, 'ms');
				// $exec_time = round($total_time, 3);
				# Info about required time to exec the search
				$records_data->debug = $records_data->debug ?? new stdClass();
				$records_data->debug->generated_time['get_records_data'] = $exec_time;
				# Query to database string
				$records_data->debug->strQuery				= $count_sql_query;
				$this->search_query_object->generated_time	= $exec_time;

				dd_core_api::$sql_query_search[] = '-- TIME sec: '. $exec_time . PHP_EOL . $count_sql_query;

				// metrics
				metrics::$search_total_time += $exec_time;
			}

		// Fix total value in the SQO
			$this->search_query_object->total = $total;

		// set total
			$records_data->total = $total;

		// if the sqo has group_by set the result
			if( isset($this->search_query_object->group_by) ){
				$records_data->totals_group = $totals_group;
			}

		return $records_data;
	}//end count



	/**
	* GENERATE_CHILDREN_RECURSIVE_SEARCH
	* Create a new filter to inject in current search query object
	* @param array $ar_rows
	* @return object $new_sqo
	*/
	public function generate_children_recursive_search(array $ar_rows) : object {

		// clone original sqo
			$new_sqo = clone $this->search_query_object;

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

			// children filter
			$children_filter = [];
			foreach ($ar_rows as $row_value) {

				$item = json_decode('{
					"q": "'.$row_value->section_id.'",
					"q_operator": null,
					"path": [
					  {
						"section_tipo": "'.$row_value->section_tipo.'",
						"component_tipo": "section_id",
						"model": "component_section_id",
						"name": "Id"
					  }
					]
				  }');

				$children_filter[] = $item;
			}

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
	* PRE_PARSE_SEARCH_QUERY_OBJECT
	* Iterate all filter and select elements and communicate with components to rebuild the search_query_object
	* Not return anything, only modifies the class var $this->search_query_object
	* @return void
	*/
	public function pre_parse_search_query_object() : void {

		// already parsed case
			if ($this->search_query_object->parsed===true) {
				return;
			}

		// filter
			if (!empty($this->search_query_object->filter)) {

				// conform_search_query_object. Conform recursively each filter object asking the components
				foreach ($this->search_query_object->filter as $op => $ar_value) {
					$new_search_query_object_filter = self::conform_search_query_object($op, $ar_value);
					break; // Only expected one
				}
				// Replace filter array with components preparsed values
				$this->search_query_object->filter = $new_search_query_object_filter ?? null;
			}

		// select
			$new_search_query_object_select = [];
			foreach ($this->search_query_object->select as $select_object) {
				$new_search_query_object_select[] = search::component_parser_select( $select_object );
			}
			// Replace select array with components preparsed values
			$this->search_query_object->select = $new_search_query_object_select;

		// order. Note that order is parsed with same parser as 'select' (component_parser_select)
			if (!empty($this->search_query_object->order)) {
				$new_search_query_object_order = [];
				foreach ((array)$this->search_query_object->order as $select_object) {
					$new_search_query_object_order[] = search::component_parser_select( $select_object );
				}
				// Replace select array with components preparsed values
				$this->search_query_object->order = $new_search_query_object_order;
			}

		// Set object as parsed
		$this->search_query_object->parsed = true;
	}//end pre_parse_search_query_object



	/**
	* COMPONENT_PARSER_SELECT
	* Call to component to parse select query (add component path)
	* V5 inherited method, its not used in v6
	* @param object $select_objec
	* @return object $select_object
	*/
	public static function component_parser_select(object $select_object) : object {

		$path			= $select_object->path;
		$component_tipo	= end($path)->component_tipo;

		// prevent to parse direct columns (section_id, section_tipo, id)
			if (true===in_array($component_tipo, self::$ar_direct_columns)) {
				return $select_object; // No parse section_id
			}

		// call to component to resolve each select sentence (are different results depends of the component)
		$model_name		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$select_object	= $model_name::get_select_query($select_object);


		return $select_object;
	}//end component_parser_select



	/**
	* CONFORM_SEARCH_QUERY_OBJECT
	* Call to components to conform final search_query_object, adding specific component path, search operators etc.
	* Recursive
	* @param string $op
	* 	sample: '$and'
	* @param array $ar_value
	* sample:
		* [
		*    {
		*        "q": {
		*            "section_id": "1",
		*            "section_tipo": "dd64",
		*            "type": "dd151",
		*            "from_component_tipo": "dd1354"
		*        },
		*        "q_operator": null,
		*        "path": [
		*            {
		*                "section_tipo": "dd1324",
		*                "component_tipo": "dd1354",
		*                "model": "component_radio_button",
		*                "name": "Active"
		*            }
		*        ]
		*    }
		*  ]
	* @return object $new_ar_query_object
	*/
	public static function conform_search_query_object(string $op, array $ar_value) : object {

		$new_ar_query_object = new stdClass();
			$new_ar_query_object->$op = [];

		// foreach ($ar_value as $search_object) {
		$ar_value_size = sizeof($ar_value);
		for ($i=0; $i < $ar_value_size; $i++) {

			$search_object = $ar_value[$i];

			// is object check
				if (!is_object($search_object)) {
					// dump($search_object, ' Invalid received object (search_object) type: '.gettype($search_object));
					debug_log(__METHOD__
						.' Invalid (IGNORED) non object search_object: ' . PHP_EOL
						.' type: ' 			. gettype($search_object) . PHP_EOL
						.' search_object: ' . json_encode($search_object, JSON_PRETTY_PRINT) . PHP_EOL
						.' ar_value: ' 		. json_encode($ar_value, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
					// throw new Exception("Error Processing Request. search_object must be an object", 1);
					dump(debug_backtrace(), ' Error. search_object must be an object. debug_backtrace() ++ '.to_string());
					continue;
				}

			// if (self::is_search_operator($search_object)===true) {
			if (!property_exists($search_object, 'path')) {

				// Case object is a group
				// $op2		= key($search_object); // deprecated PHP>=8.1
				$op2		= array_key_first(get_object_vars($search_object));
				$ar_value2	= $search_object->$op2;

				$ar_elements = self::conform_search_query_object($op2, $ar_value2);
				// debug_log(__METHOD__." ar_elements $op - ".to_string($ar_elements), logger::DEBUG);
				// dump($ar_elements, ' ar_elements ++ '.to_string()); die();

				// if (!empty(reset($ar_elements))) {  // deprecated PHP>=8.1
				$ar_elements_array = get_object_vars($ar_elements);
				if (!empty(reset($ar_elements_array))) {
					$new_ar_query_object->$op[] = $ar_elements;
				}

			}else{

				// Case object is a end search object
				if (isset($search_object->format) && $search_object->format==='column') {

					$ar_query_object = [$search_object];

				}else{

					$path				= $search_object->path;
					$search_component	= end($path);
					// model (with fallback if not exists)
					if (!isset($search_component->model)) {
						$search_component->model = RecordObj_dd::get_modelo_name_by_tipo($search_component->component_tipo, true);
					}
					$model_name = $search_component->model;

					$ar_query_object = $model_name::get_search_query($search_object);
				}

				$new_ar_query_object->$op = array_merge($new_ar_query_object->$op, $ar_query_object);
			}
		}//end for ($i=0; $i < $ar_value_size; $i++)


		return $new_ar_query_object;
	}//end conform_search_query_object



	/**
	* PARSE_SEARCH_QUERY_OBJECT NEW
	* Build full final SQL query to send to DDBB
	* @param bool $full_count = false
	* @return string $sql_query
	* 	parsed final SQL query string
	*/
	public function parse_search_query_object( bool $full_count=false ) : string {
		// $start_time=start_time();
		// dump($this->search_query_object->filter, ' this->search_query_object->filter 1 ++ '.to_string());
		// dump( json_encode($this->search_query_object,JSON_PRETTY_PRINT  ), '$this->search_query_object->filter 2 ++ '.to_string());
		// debug_log(__METHOD__." JSONSEARCH ORIGINAL (ANTES DE PASAR POR COMPONENTES) ".json_encode($this->search_query_object->filter, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), logger::DEBUG);

		// pre_parse_search_query_object if not already parsed
			if ($this->search_query_object->parsed!==true) {
				// Pre-parse search_query_object with components always before begins
				$this->pre_parse_search_query_object();
			}

		// debug
			if(SHOW_DEBUG===true) {
				// dump( json_encode($this->search_query_object,JSON_PRETTY_PRINT  ), '$this->search_query_object->filter 2 ++ '.to_string());
				// dump( null, '$this->search_query_object->filter 2 ++ '.json_encode($this->search_query_object, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE ));  #die();
				// $debug_json_string = json_encode($this->search_query_object->filter, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
				// debug_log(__METHOD__." DEBUG_JSON_STRING \n".to_string().$debug_json_string, logger::DEBUG);
				// $this->remove_distinct=true;
			}

		// Search elements. Order is important
			$main_where_sql			= $this->build_main_where_sql();
			$sql_query_order		= $this->build_sql_query_order();	// Order before select !
			$sql_query_select		= $this->build_sql_query_select($full_count);
			$sql_filter				= $this->build_sql_filter();
			$sql_projects_filter	= $this->build_sql_projects_filter();
			$sql_joins				= $this->get_sql_joins();
			$main_from_sql			= $this->build_main_from_sql();
			$sql_offset				= $this->search_query_object->offset;
			$sql_limit				= $this->search_query_object->limit;
			if(isset($this->search_query_object->children_recursive) && $this->search_query_object->children_recursive===true) {
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
			case ($full_count===true):
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
				$sql_filter_by_locators_order	= empty($this->search_query_object->order)
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
					$sql_query .= !empty($this->search_query_object->offset)
						? ' OFFSET ' . $sql_offset
						: '';
				break;

		// without order
			case (empty($this->search_query_object->order) && empty($this->search_query_object->order_custom)):
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
							if ($this->search_query_object->limit>0) {
								$limit_query = PHP_EOL . 'LIMIT ' . $sql_limit;
								$sql_query .= $limit_query;
							}
						// offset
							$offset_query = '';
							if ($this->search_query_object->offset>0) {
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

							if ($this->search_query_object->limit>0) {
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
							if ($this->search_query_object->limit>0) {
								$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
							}
						// offset
							if ($this->search_query_object->offset>0) {
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
					// where
						$query_inside .= PHP_EOL . 'WHERE ' . $main_where_sql;
						if (!empty($sql_filter)) {
							$query_inside .= $sql_filter;
						}
						if (!empty($sql_projects_filter)) {
							$query_inside .= $sql_projects_filter;
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
						if ($this->search_query_object->limit>0) {
							$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
						}
					// offset
						if ($this->search_query_object->offset>0) {
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

		// debug
			// dump(null, ' sql_query ++ '.to_string($sql_query)); #die();
			// debug_log(__METHOD__." SQL QUERY: ".PHP_EOL.to_string($sql_query), logger::DEBUG);
			// debug_log(__METHOD__." this->search_query_object: ".to_string($this->search_query_object), logger::DEBUG);
			// debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);


		return $sql_query;
	}//end parse_search_query_object



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
	* BUILD_SQL_QUERY_SELECT
	*
	* @param bool $full_count = false
	* @return string $sql_query_select
	*/
	public function build_sql_query_select(bool $full_count=false) : string {

		if ($full_count===true) {
			return $this->build_full_count_sql_query_select();
		}

		$search_query_object = $this->search_query_object;

		$ar_sql_select	= [];
		// $ar_key_path	= [];

		$ar_sql_select[] = ($this->remove_distinct===true)
			? $this->main_section_tipo_alias.'.section_id'
			: 'DISTINCT ON ('.$this->main_section_tipo_alias.'.section_id) '.$this->main_section_tipo_alias.'.section_id';

		$ar_sql_select[] = $this->main_section_tipo_alias.'.section_tipo';

		// Select fallback to 'datos' when $search_query_object->select is empty or unset
			if (empty($search_query_object->select)) {
				#$ar_sql_select[] = 'datos';
				// $ar_sql_select[] = ($this->matrix_table==='matrix_time_machine')
				// 	? $this->main_section_tipo_alias.'.dato'
				// 	: $this->main_section_tipo_alias.'.datos';
				$ar_sql_select[] = $this->main_section_tipo_alias.'.datos';

			}else{

				foreach ($search_query_object->select as $select_object) {

					$path				= $select_object->path;
					$table_alias		= $this->get_table_alias_from_path($path);
					$last_item			= end($path);
					$component_tipo		= $last_item->component_tipo;
					$column_alias		= $component_tipo;
					$model_name			= $last_item->model;
					$select_object_type	= isset($select_object->type) ? $select_object->type : 'string';
					#$apply_distinct	= isset($last_item->distinct_values) ? $last_item->distinct_values : false; // From item path
					$apply_distinct		= (isset($search_query_object->distinct_values) && $search_query_object->distinct_values===$component_tipo) ? true : false; // From global object
					$component_path		= ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO)
						? str_replace('valor_list', 'dato', $select_object->component_path) // In activity section, data container is always 'dato'
						: implode(',', $select_object->component_path);

					$sql_select = '';

					if ($model_name==='component_section_id' || $model_name==='section_id') {

						$sql_select .= $table_alias.'.section_id';
						$sql_select .= ' as '.$column_alias;

					}else{

						if ($component_path==='relations') {

							if (!isset($this->relations_cache[$table_alias])) {

								// Add original always to conserve row property position
								$ar_sql_select[] = '\'\''.' as '.$column_alias;

								// New temporal column
								$sql_select .= $table_alias.'.datos#>\'{relations}\'';
								$column_alias = 'relations_' . $table_alias; // Override table alias for generic name

								$this->relations_cache[$table_alias][] = $component_tipo;

							}else{

								// Already exists a relations column. Skip select again
								$sql_select .= '\'\'';
							}

							// add always to iterate after
								$this->relations_cache[$table_alias][] = $component_tipo;

						}else{

							$sql_select .= $table_alias.'.datos';
							$sql_select .= ($select_object_type==='string')
								? '#>>'
								: '#>';
							$sql_select .= '\'{';
							$sql_select .= $component_path;
							$sql_select .= '}\'';
						}

						# All
						if ($apply_distinct===true) {
							# Define as default order prevent apply default behavior
							$this->sql_query_order_default = $sql_select .' ASC';
							# Define custom sql_query_order_window_subselect
								# (!) Commented 16-09-2018 because not work with distinct_values true clause
								### $this->sql_query_order_window_subselect = $this->main_section_tipo_alias.'.id, ' . $sql_select .' ASC';
							# Wrap sentence
							$sql_select = 'DISTINCT ON ('.$sql_select.') '.$sql_select;
						}
						$sql_select .= ' as '.$column_alias;
					}

					# Add line
					if ($apply_distinct===true) {
						# Force key 0 to overwrite first select line
						$ar_sql_select[0] = $sql_select;
						# Move section_id column to end of select
						$ar_sql_select[] = $this->main_section_tipo_alias.'.section_id';
					}else{
						$ar_sql_select[] = $sql_select;
					}

					#if ($n_levels>1) {
					#	$this->join_group[] = $this->build_sql_join($select_object->path);
					#}

					// $this->join_group[] = $this->build_sql_join($select_object->path);
					$this->build_sql_join($select_object->path);
				}
			}

		// Add order columns to select when need
			foreach ((array)$this->order_columns as $select_line) {
				$ar_sql_select[] = $select_line;
			}

		// Join all
			$sql_query_select = implode(','.PHP_EOL, $ar_sql_select);


		return $sql_query_select;
	}//end build_sql_query_select



	/**
	* BUILD_SQL_PROJECTS_FILTER
	* Create the SQL sentence for filter records by user projects
	* It is based on user permissions and current section_tipo
	* @param bool $force_calculate = false
	* 	Optional force param for debug purposes
	* @return string $sql_projects_filter
	*/
	public function build_sql_projects_filter( bool $force_calculate=false ) : string {

		$sql_projects_filter = '';

		// skip_projects_filter
			if ($this->skip_projects_filter===true) {
				return $sql_projects_filter;
			}

		// short vars
			$section_tipo		= $this->main_section_tipo;
			$section_alias		= $this->main_section_tipo_alias;
			$datos_container	= ($this->matrix_table==='matrix_time_machine') ? 'dato' : 'datos';
			$user_id			= logged_user_id(); // Logged user id
			if (empty($user_id)) {
				debug_log(__METHOD__
					. " Error: user id unavailable (logged_user_id) " . PHP_EOL
					. logged_user_id()
					, logger::ERROR
				);
				return $sql_projects_filter;
			}

		// cache
			static $sql_projects_filter_data;
			$uid = $section_tipo.'_'.$user_id;
			if (isset($sql_projects_filter_data[$uid])) {
				return $sql_projects_filter_data[$uid];
			}

		// only for non global admins
			$is_global_admin = (bool)security::is_global_admin($user_id);
			if ($is_global_admin!==true || $force_calculate===true) {

				$sql_filter = '';

				switch (true) {
					##### PROFILES ########################################################
					case ($section_tipo===DEDALO_SECTION_PROFILES_TIPO) :
						if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
							$sql_filter .= "\n-- filter_profiles [PROFILES SECTION] (no filter is used here) -- \n";
						}
						break;
					##### PROJECTS ########################################################
					case ($section_tipo===DEDALO_FILTER_SECTION_TIPO_DEFAULT) :
						if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
							$sql_filter .= "\n-- filter_user_created [PROJECTS SECTION] -- (no filter is used here since 31-03-2018) -- \n";
						}

						##$sql_filter .= PHP_EOL . 'OR (' ;
						##$sql_filter .= $section_alias.'.'.$datos_container.' @>\'{"created_by_userID":'.$user_id.'}\'::jsonb';
						/*
						# Current user authorized areas
						$component_filter_master = component_common::get_instance('component_filter_master', DEDALO_FILTER_MASTER_TIPO, $user_id, 'list', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
						$filter_master_dato 	 = (array)$component_filter_master->get_dato();

						if (!empty($filter_master_dato)) {
							$ar_id = [];
							foreach ($filter_master_dato as $key => $current_locator) {
								$ar_id[] = (int)$current_locator->section_id;
							}
							$ar_values_string 	= implode(',', $ar_id);
							$sql_filter .= ' OR '.$section_alias.'.section_id IN ('.$ar_values_string.')';
						}*/
						##$sql_filter .= ')';
						break;
					##### USERS ###########################################################
					case ($section_tipo===DEDALO_SECTION_USERS_TIPO) :

						# AREAS FILTER
							if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
								$sql_filter .= "\n-- filter_users_by_profile_areas -- ";
							}
							$sql_filter .= PHP_EOL .'AND '.$section_alias.'.section_id>0 AND ';
							$sql_filter .= PHP_EOL . $section_alias.'.'.$datos_container.' @>\'{"created_by_userID":'.$user_id.'}\'::jsonb OR ' .PHP_EOL;
							$sql_filter .= '((';

							// areas. Iterate and clean array of authorized areas of this user like '[dd942-admin] => 2'
								$security_areas_dato = security::get_ar_authorized_areas_for_user();
								$ar_area_tipo = [];
								foreach ($security_areas_dato as $item) {
									if($item->value===2){
										$ar_area_tipo[] = $item->tipo;
									}
								}
								// check empty ar_area_tipo case
									if (empty($ar_area_tipo)) {
										dump($security_areas_dato, ' security_areas_dato +++++++++++++++++++++++++++++++++++++++++++++++++++++++ '.to_string());
										debug_log(__METHOD__
											." ERROR STOP EXECUTION. Non global user id ($user_id) without any allowed security_areas data!! "
											, logger::ERROR
										);
										throw new Exception("Error Processing Request", 1);
									}

						# SEARCH PROFILES WITH CURRENT USER AREAS
							$ar_profile_id = filter::get_profiles_for_areas( $ar_area_tipo );
								// check empty ar_profile_id case
								if (empty($ar_profile_id)) {
									dump($ar_area_tipo, ' ar_area_tipo +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ '.to_string());
									debug_log(__METHOD__
										." ERROR STOP EXECUTION. Non global user id ($user_id) without any allowed profile data!! "
										, logger::ERROR
									);
									throw new Exception("Error Processing Request", 1);
								}
							$ar_filter_profile = [];
							foreach ($ar_profile_id as $current_profile_id) {
								$search_locator = new locator();
									$search_locator->set_section_tipo(DEDALO_SECTION_PROFILES_TIPO);
									$search_locator->set_section_id($current_profile_id);
									$search_locator->set_type(DEDALO_RELATION_TYPE_LINK);
								$ar_filter_profile[] = PHP_EOL . $section_alias.'.'.$datos_container.'#>\'{relations}\'@>\'['.json_encode($search_locator).']\'::jsonb';
							}
							$sql_filter .= implode(' OR ', $ar_filter_profile);
							$sql_filter .= ')';

						# PROJECTS FILTER
							$component_filter_master_model	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_FILTER_MASTER_TIPO,true);
							$component_filter_master		= component_common::get_instance(
								$component_filter_master_model, // 'component_filter_master',
								DEDALO_FILTER_MASTER_TIPO,
								$user_id,
								'list',
								DEDALO_DATA_NOLAN,
								DEDALO_SECTION_USERS_TIPO
							);
							$filter_master_dato = (array)$component_filter_master->get_dato();
							// check empty ar_area_tipo case
								if (empty($filter_master_dato)) {
									debug_log(__METHOD__
										." Filter master without data!! "
										, logger::ERROR
									);
									throw new Exception("Error Processing Request. Invalid filter master data", 1);
								}
							if(SHOW_DEBUG===true) {
								$sql_filter .= "\n-- filter_by_projects --";
							}
							# Filter by any of user projects
							$ar_query = [];
							foreach ((array)$filter_master_dato as $current_project_locator) {
								$search_locator = new locator();
									$search_locator->set_section_tipo($current_project_locator->section_tipo);
									$search_locator->set_section_id($current_project_locator->section_id);
									$search_locator->set_type($current_project_locator->type);

								$ar_query[] = $section_alias.'.'.$datos_container.'#>\'{relations}\'@>\'['.json_encode($search_locator).']\'::jsonb';
							}
							$sql_filter .= PHP_EOL . 'AND (' . implode(' OR ',$ar_query) . ')';

							$sql_filter .= ')';
						break;
					##### DEFAULT #########################################################
					default:
						if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
							$sql_filter .= "\n-- filter_by_projects --";
						}

						# SECTION FILTER TIPO : Actual component_filter of this section
						$ar_component_filter = section::get_ar_children_tipo_by_model_name_in_section(
							$section_tipo, // string section_tipo
							['component_filter'], // array ar_modelo_name_required
							true, // bool from_cache
							true, // bool resolve_virtual
							true, // bool recursive
							true // bool search_exact
						);
						if (!isset($ar_component_filter[0])) {
							$section_name = RecordObj_dd::get_termino_by_tipo($section_tipo);
							debug_log(__METHOD__
								." Error Processing Request. Filter not found is this section ($section_tipo) $section_name "
								, logger::ERROR
							);
						}else{
							$component_filter_tipo = $ar_component_filter[0];
						}

						$ar_projects = filter::get_user_projects($user_id); // return array of locators
						if (empty($ar_projects)) {

							// Invalid filter case
							$sql_filter .= PHP_EOL . ' AND '. $section_alias.'.'.$datos_container.'#>>\'{components}\' = \'IMPOSSIBLE VALUE (User without projects)\' ';

						}else{

							// Default case. Filter by any of user projects
							$ar_query 		= [];
							$ar_filter_join = [];
							foreach ($ar_projects as $current_project_locator) {
								$search_locator = new locator();
									$search_locator->set_section_tipo($current_project_locator->section_tipo);
									$search_locator->set_section_id($current_project_locator->section_id);
									$search_locator->set_type($current_project_locator->type);
									if (property_exists($this->search_query_object, 'id') && $this->search_query_object->id!=='thesaurus') {
									$search_locator->set_from_component_tipo($component_filter_tipo);
									}

								$ar_query[] = $section_alias.'.'.$datos_container.'#>\'{relations}\'@>\'['.json_encode($search_locator).']\'::jsonb';

								$ar_filter_join[] = 'f.target_section_id='.(int)$current_project_locator->section_id;
							}

							// SQL filter
							$sql_filter .=  PHP_EOL . 'AND (' . implode(' OR ',$ar_query) . ')';

							// Join of projects
							$filter_join  = 'LEFT JOIN relations as f ON (f.section_tipo='.$this->main_section_tipo_alias.'.section_tipo AND f.section_id='.$this->main_section_tipo_alias.'.section_id ';
							$filter_join .= 'AND f.from_component_tipo=\''.$component_filter_tipo.'\'';
							#$filter_join .= ' f.section_tipo=\''.$this->main_section_tipo.'\' AND ';
							#$filter_join .= ' AND f.target_section_tipo=\''.DEDALO_SECTION_PROJECTS_TIPO.'\' AND'.PHP_EOL.' ('. implode(' OR ',$ar_filter_join).')';
							$filter_join .= ')';
							$this->filter_join = $filter_join;
							// $this->filter_join_where = PHP_EOL .' AND ('. implode(' OR ',$ar_filter_join).')';
							$this->filter_join_where  = PHP_EOL .'AND (';
							$this->filter_join_where .= 'f.target_section_id IN ('.  implode(',', array_map(function($locator){
															return (int)$locator->section_id;
														}, $ar_projects)).')';
							// $this->filter_join_where .= ' OR ' ;
							// $this->filter_join_where .= $section_alias.'.'.$datos_container.' @>\'{"created_by_userID":'.$user_id.'}\'::jsonb';
							$this->filter_join_where .= ')';
						}
						break;
				}

				# FILTER_USER_RECORDS_BY_ID
				if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {

					$filter_user_records_by_id = filter::get_filter_user_records_by_id( $user_id );
					if ( isset($filter_user_records_by_id[$section_tipo]) ) {

						$ar_filter = array();
						foreach ((array)$filter_user_records_by_id[$section_tipo] as $current_id) {
							$ar_filter[] = $section_alias . '.section_id = ' . (int)$current_id;
						}
						if (!empty($ar_filter)) {
							$filter_by_user_records = '';
							if(SHOW_DEBUG===true || DEVELOPMENT_SERVER===true) {
							$filter_by_user_records .= "\n-- filter_user_records_by_id --";
							}
							$filter_by_user_records .= PHP_EOL . ' AND ('.implode(' OR ',$ar_filter) . ') ';

							// Fix filter_by_user_records
							$this->filter_by_user_records = $filter_by_user_records;
						}
					}
				}

				if (!empty($sql_filter)) {
					$sql_projects_filter = $sql_filter;
				}
			}//end if ($is_global_admin!==true) {

		// cache
			$sql_projects_filter_data[$uid] = $sql_projects_filter;


		return $sql_projects_filter;
	}//end build_sql_projects_filter



	/**
	* BUILD_SQL_QUERY_ORDER_DEFAULT
	* Creates the default query order for searches:
	* section_is ASC except section activity (DESC)
	* @return string $sql_query_order_default
	*/
	public function build_sql_query_order_default() : string {

		if (isset($this->sql_query_order_default)) {
			return $this->sql_query_order_default;
		}

		$section_tipo				= $this->main_section_tipo;
		$default_order				= ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';
		$sql_query_order_default	= $this->main_section_tipo_alias.'.section_id '.$default_order;


		return $sql_query_order_default;
	}//end build_sql_query_order_default



	/**
	* BUILD_SQL_QUERY_ORDER
	* Creates the SQL to order based on search_query_object order property
	* Could be 'order_custom' when is special full defined order or default 'order'
	* @return string $sql_query_order
	*/
	public function build_sql_query_order() : string {

		$sql_query_order = '';

		if (!empty($this->search_query_object->order_custom)) {

			// custom order
				$ar_custom_query		= [];
				$ar_custom_query_order	= [];
				foreach ($this->search_query_object->order_custom as $item_key => $order_item) {

					$column_section_tipo	= '\''.$order_item->section_tipo.'\''; // added 21-08-2019
					$column_name			= $order_item->column_name;
					$column_values			= $order_item->column_values;
					$table					= ($item_key>0) ? 'x'.$item_key : 'x';

					$pairs = [];
					foreach ($column_values as $key => $value) {
						$value		= is_string($value) ? "'" . $value . "'" : $value;
						$pair		= '('.$column_section_tipo.','.$value.','.($key+1).')';
						$pairs[]	= $pair;
					}
					// Join like: LEFT JOIN (VALUES (7,1),(1,2)) as x(ordering_id, ordering) ON main_select.section_id = x.ordering_id ORDER BY x.ordering ASC
					$ar_custom_query[]			= 'LEFT JOIN (VALUES '.implode(',', $pairs).') as '.$table.'(ordering_section_tipo, ordering_id, ordering) ON main_select.'.$column_name.'='.$table.'.ordering_id AND main_select.section_tipo='.$table.'.ordering_section_tipo'; // added 21-08-2019
					$ar_custom_query_order[]	= 'ORDER BY '.$table.'.ordering ASC';
				}

			// flat and set. Note that no $sql_query_order value is filled and returned
				$this->sql_query_order_custom = implode(' ', $ar_custom_query) . ' ' . implode(',', $ar_custom_query_order);

		}elseif (!empty($this->search_query_object->order)) {

			// order default
				$ar_order = [];
				foreach ($this->search_query_object->order as $order_obj) {

					$direction		= strtoupper($order_obj->direction);
					$path			= $order_obj->path;
					$end_path		= end($path);
					$component_tipo	= $end_path->component_tipo;
					$column			= $end_path->column ?? null; // special optional full definition column (e.g. component date)

					if( isset($column) ) {

						// column case. Special optional full definition column (e.g. component_date)

						$alias	= $component_tipo . '_order';
						$column	.= ' as ' . $alias; // add alias name

						// Add to global order columns (necessary for order...)
						// This array is added when query select is calculated
						$this->order_columns[] = $column;

						$line = $alias . ' ' . $direction;

					}else if (true===in_array($component_tipo, self::$ar_direct_columns)) {

						// direct column case

						$line = $component_tipo . ' ' . $direction;

					}else{

						// default case

						// Add join if not exists
							$this->build_sql_join($path);

						// add sentence to line
							$alias	= $component_tipo . '_order';
							$line	= $alias . ' ' . $direction;

						// column
							$selector		= implode(',', $order_obj->component_path);
							$table_alias	= $this->get_table_alias_from_path($path);
							$base			= $table_alias . '.datos#>>\'{'.$selector.'}\'';
							$column			= $base .' as '. $alias;
							// Add to global order columns (necessary for order...)
							// This array is added when query select is calculated
							$this->order_columns[] = $column;
					}

					// line add
					$ar_order[] = $line;
				}
				// flat SQL sentences array
				$sql_query_order = implode(',', $ar_order);
		}

		// add NULLS LAST for convenience
			if (!empty($sql_query_order)) {
				$sql_query_order .= ' NULLS LAST';
				if (strpos($sql_query_order, 'section_id')===false) {
					$sql_query_order .= ' , section_id ASC';
				}
			}
		// debug
			// if(SHOW_DEBUG===true) {
			// 	debug_log(__METHOD__." sql_query_order: ".to_string($sql_query_order), logger::DEBUG);
			// }


		return $sql_query_order;
	}//end build_sql_query_order



	/**
	* BUILD_MAIN_FROM_SQL
	* @return string $main_from_sql
	*/
	public function build_main_from_sql() : string {

		$main_from_sql = $this->matrix_table .' AS '. $this->main_section_tipo_alias;

		// Fix value
		$this->main_from_sql = $main_from_sql;

		return $main_from_sql;
	}//end build_main_from_sql



	/**
	* BUILD_MAIN_WHERE_SQL
	* @return string $main_where_sql
	*/
	public function build_main_where_sql() : string {

		# section_tipo is always and array
		$ar_section_tipo   = $this->ar_section_tipo;

		# main_section_tipo is always the first section tipo
		// $main_section_tipo = $this->main_section_tipo;

		# alias . Sort version of main_section_tipo
		$main_section_tipo_alias = $this->main_section_tipo_alias;

		$ar_sentences = array();

		// section_tipo
			foreach ($ar_section_tipo as $current_section_tipo) {
				$ar_sentences[] = $main_section_tipo_alias.'.section_tipo=\''. $current_section_tipo.'\'';
			}

		// flat query string
			$main_where_sql = '(' . implode(' OR ', $ar_sentences) . ')';

		// avoid root user is showed except for root
			if (!isset($this->include_negative) || $this->include_negative!==true) {
				$main_where_sql .= ' AND '.$main_section_tipo_alias.'.section_id>0 ';
			}

		// Fix value
			$this->main_where_sql = $main_where_sql;


		return $main_where_sql;
	}//end build_main_where_sql



	/**
	* BUILD_SQL_FILTER
	* @return string $filter_query
	*/
	public function build_sql_filter() : string {

		$filter_query = '';

		if (empty($this->search_query_object->filter)) {
			return $filter_query;
		}

		$operator	= array_key_first(get_object_vars($this->search_query_object->filter));
		$ar_value	= $this->search_query_object->filter->{$operator};
		if(!empty($ar_value)) {

			$parsed_string = $this->filter_parser($operator, $ar_value);
			if (!empty($parsed_string)) {
				$filter_query .= ' AND (' . $parsed_string . ')';
			}

			#if (isset($this->global_group_query)) {
			#	$filter_query .= "\n" . $this->global_group_query;
			#}
		}


		return $filter_query;
	}//end build_sql_filter



	/**
	* BUILD_SQL_FILTER_BY_LOCATORS
	* @return string $sql_filter
	*/
	public function build_sql_filter_by_locators() : string {

		if (empty($this->filter_by_locators)) {
			return '';
		}

		$table = $this->main_section_tipo_alias;

		$ar_parts = [];
		foreach ($this->filter_by_locators as $current_locator) {

			$ar_current = [];

			// section_id (int)
				if (property_exists($current_locator, 'section_id') && !empty($current_locator->section_id)) {
					$ar_current[] = $table.'.section_id='.$current_locator->section_id;
				}

			// section_tipo (string)
				if (property_exists($current_locator, 'section_tipo') && !empty($current_locator->section_tipo)) {
					$ar_current[] = $table.'.section_tipo=\''.$current_locator->section_tipo.'\'';
				}

			// tipo (string). time machine case (column 'tipo' exists)
				if (property_exists($current_locator, 'tipo') && !empty($current_locator->tipo)) {
					if ($this->matrix_table==='matrix_time_machine') {
						$ar_current[] = $table.'.tipo=\''.$current_locator->tipo.'\'';
					}else{
						debug_log(__METHOD__
							." Ignored property 'tipo' in locator because is only allowed in time machine table."
							, logger::WARNING
						);
					}
				}

			// type (string)
				if (property_exists($current_locator, 'type') && !empty($current_locator->type)) {
					$ar_current[] = $table.'.type='.$current_locator->type;
				}

			// lang (string). time machine case (column 'lang' exists)
				if (property_exists($current_locator, 'lang') && !empty($current_locator->lang)) {
					if ($this->matrix_table==='matrix_time_machine') {
						$ar_current[] = $table.'.lang=\''.$current_locator->lang.'\'';
					}else{
						debug_log(__METHOD__
							." Ignored property 'lang' in locator because is only allowed in time machine table."
							, logger::WARNING
						);
					}
				}

			// matrix_id (int). time machine case (column 'id' exists and is used)
				if (property_exists($current_locator, 'matrix_id') && !empty($current_locator->matrix_id)) {
					if ($this->matrix_table==='matrix_time_machine') {
						$ar_current[] = $table.'.id='.$current_locator->matrix_id;
					}else{
						debug_log(__METHOD__
							." Ignored property 'matrix_id' in locator because is only allowed in time machine table."
							, logger::WARNING
						);
					}
				}

			// section_id_key (int). time machine case (column 'matrix_id' exists and is used)
				if (property_exists($current_locator, 'section_id_key') && !empty($current_locator->section_id_key)) {
					if ($this->matrix_table==='matrix_time_machine') {
						$ar_current[] = $table.'.section_id_key='.$current_locator->section_id_key;
					}else{
						debug_log(__METHOD__
							." Ignored property 'matrix_id' in locator because is only allowed in time machine table."
							, logger::WARNING
						);
					}
				}

			$ar_parts[] = '(' . implode(' AND ', $ar_current) . ')';
		}

		// sql_filter
		$sql_filter = PHP_EOL . '-- filter_by_locators' . PHP_EOL . implode(' OR ', $ar_parts);


		return $sql_filter;
	}//end build_sql_filter_by_locators



	/**
	* BUILD_SQL_FILTER_BY_LOCATORS_ORDER
	* @return string $string_query
	*/
	public function build_sql_filter_by_locators_order() : string {

		$ar_values = [];
		foreach ($this->filter_by_locators as $key => $current_locator) {

			$value  = '(\''.$current_locator->section_tipo.'\'';
			$value .= ','.$current_locator->section_id;
			$value .= ','.($key+1).')';

			$ar_values[] = $value;
		}

		$string_query = 'LEFT JOIN (VALUES ' . implode(',', $ar_values) . ') as x(ordering_section, ordering_id, ordering) ON main_select.section_id=x.ordering_id AND main_select.section_tipo=x.ordering_section ORDER BY x.ordering ASC';


		return $string_query;
	}//end build_sql_filter_by_locators_order



	/**
	* FILTER_PARSER
	* @param string $op
	* @param array $ar_value
	* @return string $string_query
	*/
	public function filter_parser(string $op, array $ar_value) : string {

		$string_query = '';

		$total		= count($ar_value);
		$operator	= strtoupper( substr($op, 1) );

		// Portal various values case
			/*
			#debug_log(__METHOD__." ar_value ($op) ".to_string($ar_value), logger::DEBUG);
			$is_portal_linked = false;
			if ($op==='$and') {
				$n_match = 0;
				foreach ($ar_value as $key => $search_object) {
					$ar_values = !property_exists($search_object,'path') ? reset($search_object) : $search_object;
					foreach ($ar_values as $vkey => $vvalue) {
						if (!is_object($vvalue)) continue;
						if ($vvalue->path[0]->model==='component_portal') {
							$is_portal_linked = true;
						}else{
							$is_portal_linked = false;
						}
					}
					#dump($ar_values, ' ar_values ++  $key +'.to_string( $key));
					if ($is_portal_linked===true) {
						$n_match ++;
					}
				}
				if ($is_portal_linked===true) {
					// Change current operator
					$operator = 'OR';
					// Define global group code to add in sql query
					$this->global_group_query = 'GROUP BY '.$this->main_section_tipo_alias.'.id HAVING count(*) > ' . ($n_match-1);
				}
			}
			*/

		foreach ($ar_value as $key => $search_object) {

			if (!property_exists($search_object, 'path')) {

				// Case operator

				$op2 = array_key_first(get_object_vars($search_object));

				$ar_value2 	= $search_object->$op2;

				// $operator2 = strtoupper( substr($op2, 1) );
				// if ($key > 1) {
				// 	$string_query .= ' '.$operator2.'** ';
				// }

				// recursion filter_parser
				$parsed_string = $this->filter_parser($op2, $ar_value2);
				if (!empty($parsed_string)) {
					$string_query .= ' (' . $parsed_string . ' )';

					if ($key+1 < $total) {
						$string_query .= ' '.$operator.' ';
					}
				}

			}else{

				// Case elements

				#if (!empty($search_object->q)) {
					$n_levels = count($search_object->path);
					if ($n_levels>1) {
						// $this->join_group[] = $this->build_sql_join($search_object->path);
						$this->build_sql_join($search_object->path);
					}

					$string_query .= $this->get_sql_where($search_object);

					if ($key+1 !== $total) {
						#$operator = strtoupper( substr($op, 1) );
						#$string_query .= ") ".$operator." (";
						$string_query .= ' '.$operator.' ';
					}
				#}
			}
		}//end foreach ($ar_value as $key => $search_object) {


		return $string_query;
	}//end filter_parser



	/**
	* BUILD_FULL_COUNT_SQL_QUERY_SELECT
	* @return string $sql_query_select
	*/
	public function build_full_count_sql_query_select() : string {

		$sql_query_select = 'count(DISTINCT '.$this->main_section_tipo_alias.'.section_id) as full_count';

		return $sql_query_select;
	}//end build_full_count_sql_query_select



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
			$last_section_tipo	= $step_object->section_tipo;
			$t_name				= implode('_', $ar_key_join);
			$t_relation			= 'r_'.$t_name ;

			if (!isset($this->ar_sql_joins[$t_name])) {

				$sql_join  = "\n";
				if(SHOW_DEBUG===true) {
					$section_name = RecordObj_dd::get_termino_by_tipo($step_object->section_tipo, null, true, false);
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



	/**
	* TRIM_TIPO
	* Contract the tipo to prevent large names in SQL sentences
	* @see search_Test::test_trim_tipo
	* @param string $tipo
	* @param int $max = 2
	* @return string $trimmed_tipo
	*/
	public static function trim_tipo(string $tipo, int $max=2) : ?string {

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
			if (empty($matches) || empty($matches[1]) || empty($matches[2]) ) {
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
	* GET_SQL_WHERE
	* Builds a SQL query string base on given filter search object
	* @param object $search_object
	* @return string $sql_where
	*/
	public function get_sql_where(object $search_object) : string {

		// sample object
			// {
			//   "q": "'.*\[".*ana.*'",						// the regex, text, number, etc that the component created
			//   "unaccent":true,							// true or false
			//   "operator":"~*",							// the operator for query
			//   "type": "string",							// string or jsonb
			//   "lang": "lg-nolan",						// if not defined lang = all langs, if defined lang = the lang sent
			//   "path": [									// path for locate the component into the joins
			//     {
			//       "section_tipo": "oh1",
			//       "component_tipo": "oh24"
			//     },
			//     {
			//       "section_tipo": "rsc197",
			//       "component_tipo": "rsc453"
			//     }
			//   ],
			//   "component_path": [						// the component path to find the dato or valor...
			//     "components",
			//     "rsc85",
			//     "dato"
			//   ]
			// }

		// path : array
			$path = $search_object->path ?? [];
			if (!is_array($path)) {
				debug_log(__METHOD__
					. " Invalid path " . PHP_EOL
					. ' path: ' . to_string($path) . PHP_EOL
					. ' type: ' . gettype($path)
					, logger::ERROR
				);
			}

		// table_alias : string
			$table_alias = $this->get_table_alias_from_path( (array)$path );

		// lang. If isset, add to component_path
			if (isset($search_object->lang) && $search_object->lang!=='all') {
				// Search already existing lang (maybe added in previous get_sql_where of current search_object like when count) 2018-12-18
				$last_component_path = end($search_object->component_path);
				if ( substr($last_component_path, 0, 3)!=='lg-' ) {
					// Add lang to path once
					$search_object->component_path[] = $search_object->lang;
				}
			}

		// component_path: array|null
			$component_path = isset($search_object->component_path)
				? implode(',', $search_object->component_path)
				: null;

		// type. search_object_type : string (string|array)
			$search_object_type = $search_object->type ?? 'string';

		// format. search_object_format : string (direct|array|array_elements|typeof|column|in_column)
			$search_object_format = $search_object->format ?? 'direct';

		// unaccent. search_object_unaccent: bool (true|false)
			$search_object_unaccent = $search_object->unaccent ?? false;

		// search_object_duplicated: true, false
			$search_object_duplicated = $search_object->duplicated ?? false;
			if($search_object_duplicated=== true){
				$this->search_query_object->duplicated = true;
			}

		// sql string 'where'
			$sql_where  = "\n";
			switch ($search_object_format) {

				case 'direct':
					// direct case. The default search case for components

					if(SHOW_DEBUG===true) {
						$component_path_data	= end($path);
						$component_tipo			= $component_path_data->component_tipo;
						$component_name			= $component_path_data->name ?? '';	//RecordObj_dd::get_termino_by_tipo($component_tipo, null, true, false);
						$model_name				= $component_path_data->model; //RecordObj_dd::get_model_name_by_tipo($component_tipo,true);
						$sql_where .= "-- DIRECT FORMAT - table_alias:$table_alias - $component_tipo - $component_name - $component_path - ".strtoupper($model_name)."\n";
					}

					$json_sql_component_path = "";

					if($search_object_unaccent===true) {
						$json_sql_component_path .= 'f_unaccent(';
					}

					$json_sql_component_path .= $table_alias . '.datos';

					$json_sql_component_path .= ($search_object_type==='string')
						? '#>>'
						: '#>';

					# json path
					$json_sql_component_path .= '\'{' . $component_path . '}\'';

					if($search_object_unaccent===true) {
						$json_sql_component_path .= ')';
					}
					// create a search duplicated
					// create a column with all duplicated records and check if the component is inside the column
					// if the record is in the column return it.
					// the window will us the id as other where clauses.
					if($search_object_duplicated===true){
						// get the main from and main where
						$main_from_sql	= $this->build_main_from_sql();
						$main_where_sql	= $this->build_main_where_sql();

						$sql_where .= '(';
							$sql_where .= PHP_EOL . $json_sql_component_path . ' in (';
							$sql_where .= PHP_EOL . 'SELECT '.$json_sql_component_path;
							$sql_where .= PHP_EOL . 'FROM '.$main_from_sql;
							$sql_where .= PHP_EOL . 'WHERE '.$main_where_sql;
							$sql_where .= PHP_EOL . ' AND ('.$json_sql_component_path. ' IS NOT NULL)';
							$sql_where .= PHP_EOL . 'GROUP BY ' . $json_sql_component_path ;
							$sql_where .= PHP_EOL . 'HAVING count(*) > 1)';
						$sql_where .= ')';
						break;
					}

					# operator
					$json_sql_component_path .= ' '.$search_object->operator.' ';

					if($search_object_unaccent===true) {
						$json_sql_component_path .= 'f_unaccent(';
					}

					$sql_where .= $json_sql_component_path;

					// q. Escape parenthesis inside regex
					$q_parsed_clean = ($search_object_type==='string')
						? str_replace(['(',')'], ['\(','\)'], $search_object->q_parsed)
						: $search_object->q_parsed;

					$sql_where .= $q_parsed_clean;
					#$sql_where .= pg_escape_string(DBi::_getConnection(), stripslashes($search_object->q_parsed));

					if($search_object_unaccent===true) {
						$sql_where .= ')';
					}
					break;

				case 'array_elements':
					// array_elements case

					# a.id IN (SELECT a.id FROM
					#  check_array_component((jsonb_typeof(a.datos#>'{components, numisdata35, dato, lg-nolan}') = 'array' AND a.datos#>'{components, numisdata35, dato, lg-nolan}' != '[]' ),(a.datos#>'{components, numisdata35, dato, lg-nolan}'))
					#  as numisdata35_array_elements
					#  WHERE
					#  -- TIME
					#   numisdata35_array_elements#>'{time}' = '32269363200'
					#  -- RANGE
					#   OR (
					#   numisdata35_array_elements#>'{start, time}' <= '32269363200' AND
					#   numisdata35_array_elements#>'{end, time}' >= '32269363200')
					#   OR (
					#   numisdata35_array_elements#>'{start, time}' = '32269363200')
					#  -- PERIOD
					#   OR (
					#   numisdata35_array_elements#>'{period, time}' = '32269363200')
					# )

					$component_tipo = end($path)->component_tipo;
						#dump($search_object, ' search_object ++ '.to_string());
					if(SHOW_DEBUG===true) {
						$object_info = isset($search_object->q_info) ? $search_object->q_info : '';
						$sql_where .= "-- ARRAY ELEMENTS FORMAT - $component_tipo - $table_alias - info:$object_info \n";
					}

					$sql_where .= $table_alias . '.id IN (SELECT '.$table_alias.'.id FROM '.PHP_EOL;
					$sql_where .= "check_array_component((jsonb_typeof($table_alias.datos#>'{components,$component_tipo,dato,lg-nolan}')='array' AND $table_alias.datos#>'{components,$component_tipo,dato,lg-nolan}'!='[]'),($table_alias.datos#>'{components,$component_tipo,dato,lg-nolan}')) ".PHP_EOL;
					$sql_where .= 'as '.$component_tipo.'_array_elements'.PHP_EOL;
					$sql_where .= 'WHERE'.PHP_EOL;
					$sql_where .= self::resolve_array_elements( $search_object->array_elements, $component_tipo );
					$sql_where .= PHP_EOL.') -- end check_array_component'.PHP_EOL;
					break;

				case 'typeof':
					// typeof case.
					if(SHOW_DEBUG===true) {
						$component_path_data	= end($path);
						$component_tipo			= $component_path_data->component_tipo;
						$component_name			= $component_path_data->name ?? '';	//RecordObj_dd::get_termino_by_tipo($component_tipo, null, true, false);
						$model_name				= $component_path_data->model; //RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$sql_where .= "-- TYPEOF FORMAT - table_alias:$table_alias - $component_tipo - $component_name - $component_path - ".strtoupper($model_name)."\n";
					}
					$safe_operator = $search_object->operator;
					$sql_where .= 'jsonb_typeof('.$table_alias.'.datos#>\'{'.$component_path.'}\')'.$safe_operator.$search_object->q_parsed;
					break;

				case 'column':
					// column case. Used in direct column access like 'section_id', 'state' (matrix_time_machine), etc.

					// check column_name property first
						if (!isset($search_object->column_name)) {
							debug_log(__METHOD__
								. " column_name is not defined in search object " . PHP_EOL
								. ' search_object: ' . to_string($search_object)
								, logger::ERROR
							);
							if(SHOW_DEBUG===true) {
								dump(debug_backtrace(), 'debug_backtrace() ++ '.to_string());
							}
						}

					$column_name = $search_object->column_name;
					if(SHOW_DEBUG===true) {
						$sql_where .= "-- COLUMN FORMAT - format: $search_object_format - $column_name - $table_alias \n";
					}

					$sql_where .= $table_alias . '.'.$column_name;

					# operator
					$sql_where .= ' '.$search_object->operator.' ';

					# q
					$sql_where .= $search_object->q_parsed;
					break;

				case 'in_column':
					// in_column case. Used by component_section_id to search faster number sequences like '1,2,4,8,9'
					$pre = ($component_path==='section_id')
						? $table_alias .'.'.$component_path
						: $table_alias .'.datos#>>\'{' . $component_path . '}\'';
					$operator = $search_object->operator ?? 'IN'; // IN|NOT IN
					$sql_where .= $pre . ' '.$operator.'(' . $search_object->q_parsed .') ';
					break;

				case 'function':
					$use_function =  $search_object->use_function ?? null;
					if (empty($use_function)) {
						debug_log(__METHOD__
							." Empty sqo property 'use_function' ". PHP_EOL
							.' search_object: ' . json_encode($search_object, JSON_PRETTY_PRINT)
							, logger::ERROR
						);
					}else{
						$sql_where .= $use_function;
						$sql_where .= '('. $table_alias . '.datos)';
						$sql_where .= $search_object->operator. ' ' .$search_object->q_parsed;
					}
					break;

				default:
					// undefined format case
					debug_log(__METHOD__
						.' Ignored undefined search_object_format ' .PHP_EOL
						.' search_object_format: ' . json_encode($search_object_format, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
					break;
			}//end switch ($search_object->type)


		return $sql_where;
	}//end get_sql_where



	/**
	* RESOLVE_ARRAY_ELEMENTS
	* Recursive
	* @param object $array_elements {"$or":[{...}]}
	* @return string $sql_where
	*/
	public static function resolve_array_elements( object $array_elements, string $component_tipo ) : string {

		$sql_where = '';
		foreach ($array_elements as $current_operator => $group_elements) {

			$operator_sql = strtoupper(substr($current_operator, 1));

			$group_query = [];
			foreach ($group_elements as $search_unit) {

				// if (strpos(key($search_unit),'$')!==false) { // deprecated PHP>=8.1
				$current_key = array_key_first(get_object_vars($search_unit));
				if (strpos($current_key,'$')!==false) {

					// Recursion
					$sql_query = self::resolve_array_elements($search_unit, $component_tipo);

				}else{

					$sql_query  = '';
					$sql_query .= $component_tipo.'_array_elements';
					$sql_query .= ($search_unit->type==='string') ? '#>>' : '#>';
					$sql_query .= '\'{'	. implode(',',$search_unit->component_path) . '}\'';
					$sql_query .= ' '.$search_unit->operator.' ';
					$sql_query .= $search_unit->q_parsed;
				}

				// Add
				$group_query[] = $sql_query;

			}//end foreach ($second_group as $search_unit)

			# Join elements with current operator
			$sql_where .= '('. implode(' '. $operator_sql .' ', $group_query) . ') ';

		}//foreach ($array_elements as $current_operator => $group_elements)


		return $sql_where;
	}//end resolve_array_elements



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
	* GET_TABLE_ALIAS_FROM_PATH
	* @param array $path
	* @return string $table_alias
	*/
	public function get_table_alias_from_path(array $path) : string {

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


			/*
			if ($total===1 ) { // || ($key===$total -1)

				# alias . Sort version of main_section_tipo
				#if (count($this->ar_section_tipo)>1) {
					$section_tipo_alias = $this->main_section_tipo_alias; // mix
				#}else{
				#	$section_tipo_alias = self::trim_tipo($step_object->section_tipo);
				#}
				#$section_tipo_alias = 'a';
				#$ar_key[] = self::trim_tipo($step_object->section_tipo);
				$ar_key[] = $section_tipo_alias;
			}elseif($key===$total -1){
				$ar_key[] = self::trim_tipo($step_object->section_tipo);
			}else{
				$ar_key[] = self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
			}*/

		}//foreach ($path as  $step_object)

		$table_alias = implode('_', $ar_key);
		#$table_alias = $step_object->section_tipo; // Test !!

		return $table_alias;
	}//end get_table_alias_from_path



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

		$term_model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		// Add first level always
			$current_path = new stdClass();
				$current_path->name				= strip_tags(RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true, true));
				$current_path->model			= $term_model;
				$current_path->section_tipo		= $section_tipo;
				$current_path->component_tipo	= $tipo;
			$path[] = $current_path;

		if ($resolve_related===true) {
			$ar_related_components 	= component_relation_common::get_components_with_relations();
			if(in_array($term_model, $ar_related_components)===true) {

				$ar_terminos_relacionados	= RecordObj_dd::get_ar_terminos_relacionados($tipo,true,true);
				$ar_related_section			= common::get_ar_related_by_model('section', $tipo);

				if (!empty($ar_related_section)) {

					$related_section_tipo = reset($ar_related_section);

					if ($related_tipo!==false) {

						$current_tipo	= $related_tipo;
						$model_name		= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
						if (strpos($model_name,'component')===0) {
							# Recursion
							$ar_path = self::get_query_path($current_tipo, $related_section_tipo);
							foreach ($ar_path as $value) {
								$path[] = $value;
							}
						}

					}else{

						foreach ($ar_terminos_relacionados as $current_tipo) {

							// Use only first related tipo
							$model_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
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
	* GET_SQL_JOINS
	* Implode all ar_sql_joins in a string
	* @return string $sql_joins
	*/
	public function get_sql_joins() : string {

		$sql_joins = '';

		if (isset($this->ar_sql_joins)) {
			$sql_joins = implode(' ', $this->ar_sql_joins);
		}

		return $sql_joins;
	}//end get_sql_joins



	/**
	* PROPAGATE_COMPONENT_DATO_TO_RELATIONS_TABLE
	* Get complete component relation dato and generate rows into relations table for fast LEFT JOIN
	* @param object $options
	* {
	* 	section_tipo: string (mandatory)
	* 	section_id: string|int (mandatory)
	* 	from_component_tipo: string (mandatory)
	* }
	* @return object $response
	* {
	* 	result: bool,
	* 	msg: string
	* }
	*/
	public static function propagate_component_dato_to_relations_table( object $options ) : object {
		$start_time = start_time();

		// options
			$section_tipo			= $options->section_tipo ?? null;
			$section_id				= $options->section_id ?? null;
			$from_component_tipo	= $options->from_component_tipo ?? null;
			$ar_locators			= $options->ar_locators ?? [];

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__;

		// section temp case
			if (!empty($section_id) && strpos((string)$section_id, DEDALO_SECTION_ID_TEMP)!==false) {
				$response->result	= true;
				$response->msg		= 'OK. Request skipped for temp section: '.DEDALO_SECTION_ID_TEMP.' - '.__METHOD__;
				return $response;
			}

		// empty section_id case
			if (empty($section_id)) {
				$response->msg	.= " options->section_id is mandatory ! Stopped action";
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' options: ' . to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// empty section_tipo case
			if (empty($section_tipo)) {
				$response->msg .= " options->section_tipo is mandatory ! Stopped action";
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' options: ' . to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// empty from_component_tipo case
			if (empty($from_component_tipo)) {
				$response->msg .= " options->from_component_tipo is mandatory ! Stopped action";
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' options: ' . to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// short vars
			$table = 'relations';

		// DELETE . Remove all relations of current component
			$strQuery	= "DELETE FROM $table WHERE section_id = ".(int)$section_id." AND section_tipo = '$section_tipo' AND from_component_tipo = '$from_component_tipo';";
			$result		= JSON_RecordDataBoundObject::search_free($strQuery);

		// INSERT . Create all relations again (multiple)
			$ar_insert_values = [];
			foreach ($ar_locators as $locator) {

				if (empty($locator)) {
					debug_log(__METHOD__
						." Error. empty locator. Ignored relations insert empty locator."
						, logger::ERROR
					);
					continue;
				}

				if(!isset($locator->section_tipo) || !isset($locator->section_id)) {
					debug_log(__METHOD__
						." Error. empty section_tipo or section_id. Ignored relations insert locator " .PHP_EOL
						.' locator: ' . json_encode($locator, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
					continue;
				}

				// target vars
					$target_section_tipo	= $locator->section_tipo;
					$target_section_id		= $locator->section_id;

				// prevents to save yes/not section pointers (dd64 - DEDALO_SECTION_SI_NO_TIPO) - DEDALO_SECTION_USERS_TIPO ?
					// if ($target_section_tipo===DEDALO_SECTION_SI_NO_TIPO) {
					// 	continue;
					// }

				$value = "($section_id, '$section_tipo', $target_section_id, '$target_section_tipo', '$from_component_tipo')";
				if (!in_array($value, $ar_insert_values)) {
					$ar_insert_values[] = $value;
				}
			}

		// Exec query (all records at once)
			if (!empty($ar_insert_values)) {

				$strQuery	= '
					INSERT INTO '.$table.' (section_id, section_tipo, target_section_id, target_section_tipo, from_component_tipo)
					VALUES '.implode(',', $ar_insert_values).';';
				$result		= pg_query(DBi::_getConnection(), $strQuery);
				if(!$result) {
					$msg = " Failed Insert relations record ";
					debug_log(__METHOD__
						." ERROR: $msg " .PHP_EOL
						. ' strQuery: ' . $strQuery .PHP_EOL
						. ' bt: ' . to_string( debug_backtrace() )
						, logger::ERROR
					);
					$response->msg .= $msg;
				}else{
					$msg = " Created " . count($ar_insert_values) . " relations rows (section_tipo:$section_tipo,  section_id:$section_id, from_component_tipo:$from_component_tipo, target_section_tipo:$target_section_tipo)";
					if(SHOW_DEBUG===true) {
						if ($section_tipo!==DEDALO_ACTIVITY_SECTION_TIPO) {
							$msg .= ' ('.RecordObj_dd::get_termino_by_tipo($section_tipo).' - '.RecordObj_dd::get_termino_by_tipo($from_component_tipo).')';
							$msg .= ' in '. exec_time_unit($start_time).' ms';
							debug_log(__METHOD__
								." OK: ".$msg
								, logger::DEBUG
							);
						}
					}
				}

				// response
					$response->result	= true;
					$response->msg		= "OK. Relations row successfully ";
					if (isset($msg)) {
						$response->msg .= $msg;
					}
			}


		return $response;
	}//end propagate_component_dato_to_relations_table



	############################ SEARCH FILTER FUNCTIONS #################################

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



	############################ END FILTER FUNCTIONS #################################



	/**
	* SEARCH_COUNT
	* @param object $request_options
	*
	* Exec a custom count search, useful for stats
	* LIKE:
	* 	SELECT
	*	datos#>>'{components, dd544, dato, lg-nolan }' AS dd544
	*	,COUNT (datos#>>'{components, dd544, dato, lg-nolan }') AS count
	*	FROM "matrix_activity"
	*	WHERE section_tipo = 'dd542'
	*	GROUP BY dd544
	*	ORDER BY count
	* @return array $ar_result
	*/
	public static function search_count(object $options) : array {

		# (!) Hecha para usar en estadísticas actividad pero no implementada todavía ! [2018-12-14]

		// options
			$column_tipo	= $options->column_tipo ?? null; // string like dd15
			$column_path	= $options->column_path ?? null; // string like datos#>>'{components, dd544, dato, lg-nolan }'
			$section_tipo	= $options->section_tipo ?? null; // string like oh1

		$matrix_table = common::get_matrix_table_from_tipo($section_tipo);

		$strQuery = '
		SELECT
		'.$column_path.' AS '.$column_tipo.',
		COUNT ('.$column_path.') AS count
		FROM "'.$matrix_table.'"
		WHERE section_tipo = \''.$section_tipo.'\'
		GROUP BY '.$column_tipo.'
		ORDER BY count
		;';

		if(SHOW_DEBUG===true) {
			$strQuery = '-- static search_count ' . PHP_EOL . $strQuery;
		}

		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		if ($result===false) {
			trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $strQuery");
			// return null;
			return [];
		}
		$ar_result = [];
		while ($rows = pg_fetch_assoc($result)) {

			$item = new stdClass();
				$item->tipo  = $column_tipo;
				$item->count = $rows['count'];

			$ar_result[] = $item;
		}

		return $ar_result;
	}//end search_count



	/**
	* GET_DATA_WITH_PATH
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
	* @return array $data
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
	* @param object $path_item
	* @param array $ar_locator
	* @return array $result
	*/
	public static function resolve_path_level(object $path_item, array $ar_locator) : array {

		$result = [];
		foreach ($ar_locator as $locator) {

			$model_name	= RecordObj_dd::get_modelo_name_by_tipo($path_item->component_tipo,true);
			$component	= component_common::get_instance(
				$model_name,
				$path_item->component_tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);
			$component_dato = $component->get_dato_full();

			if (!empty($component_dato)) {
				$result = array_merge($result, $component_dato);
			}
		}

		return $result;
	}//end resolve_path_level



}//end class search
