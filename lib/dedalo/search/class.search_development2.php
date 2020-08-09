<?php
/*
* CLASS SEARCH_DEVELOPMENT2
*

Portal use:

GROUP BY md1015.id
HAVING count(*) > 1

*
*/
class search_development2 {



	// main vars
		# matrix table relations name
		private static $relations_table = 'relations';

		# json object untouched, before parse (for debug purposes)
		public $search_query_object_preparse;
		# json object to parse
		protected $search_query_object;
		# from base, section tipo initial from
		protected $main_from_sql;
		# join_group
		protected $join_group;
		# main_where_sql
		protected $main_where_sql;

		# preparsed search_query_object
		#private $preparsed_search_query_object;

		# matrix_table (fixed on get main select)
		protected $matrix_table;

		protected $order_columns;

		# ALLOW_SUB_SELECT_BY_ID. Get value from search_query_object if exists. True by default set in set_up
		# Is used by speed pagination in large tables
		protected $allow_sub_select_by_id;

		# REMOVE_DISTINCT . By default, distinct clause is set in the search query for avoid duplicates on joins
		# In some context (thesaurus search for example) we want "duplicate section_id's" because search is made against various section tipo
		protected $remove_distinct;

		# skip_projects_filter
		protected $skip_projects_filter;

		# sql_query_order_default
		protected $sql_query_order_default;

		# sql_query_order_window_subselect
		# Specific order sql sentence for window subselect
		protected $sql_query_order_window_subselect;

		# relations cache
		# Store already selected relation columns to avoid overload query with multiple relations components
		protected $relations_cache;

		# matrix tables
		protected $ar_matrix_tables;

		# having vars
		protected $having_query_object;
		protected $having_ar_sql_joins;
		protected $having_search_objects;


	/**
	* __CONSTRUCT
	*/
	public function __construct($search_query_object) {
		# Set up class minim vars
		$this->set_up($search_query_object);
	}//end __construct



	/**
	* SET_UP
	*/
	public function set_up($search_query_object) {

		# Accepted objects json encoded too
		if (is_string($search_query_object)) {
			$search_query_object = json_decode($search_query_object);
		}

		if (SHOW_DEVELOPER===true && (!isset($this->search_query_object->parsed) || $this->search_query_object->parsed===false)) {
			# Set and fix class property search_query_object
			$this->search_query_object_preparse = json_decode(json_encode($search_query_object));
		}

		# Set and fix class property search_query_object
		$this->search_query_object = (object)$search_query_object;
		#debug_log(__METHOD__." search_query_object ".to_string($this->search_query_object), logger::DEBUG);

		# section tipo check and fixes
		if (!isset($this->search_query_object->section_tipo)) {
			throw new Exception("Error: section_tipo is not defined!", 1);
		}

		# section_tipo is always and array
		$this->ar_section_tipo = (array)$this->search_query_object->section_tipo;

		$count_ar_section_tipo = count($this->ar_section_tipo);

		# main_section_tipo is always the first section tipo
		$this->main_section_tipo = reset($this->ar_section_tipo);

		# alias . Sort version of main_section_tipo
		if ($count_ar_section_tipo > 1) {
			$this->main_section_tipo_alias = 'mix';
		}else{
			$this->main_section_tipo_alias = self::trim_tipo($this->main_section_tipo);
		}

		# matrix_table (for time machine if always fixed, not calculated)
		if (get_class($this)!=='search_development2_tm') {
			$this->matrix_table  = common::get_matrix_table_from_tipo($this->main_section_tipo);
		}

		# Default select
		if(!isset($this->search_query_object->select)) {
			$this->search_query_object->select = [];
		}

		# Default records limit
		if(!isset($this->search_query_object->limit)) {
			$this->search_query_object->limit = 10;
		}

		# Default offset
		if(!isset($this->search_query_object->offset)) {
			$this->search_query_object->offset = false;
		}

		# Default records count
		if(!isset($this->search_query_object->full_count)) {
			$this->search_query_object->full_count = false;
		}

		#$this->preparsed_search_query_object = false;
		if (!isset($this->search_query_object->parsed)) {
			$this->search_query_object->parsed = false;
		}

		# Set order_columns as empty array
		$this->order_columns = [];

		# Set allow this->allow_sub_select_by_id for speed (disable in some context like autocomplete)
		if (!isset($search_query_object->allow_sub_select_by_id)) {
			$this->allow_sub_select_by_id = true; // True is default
		}else{
			$this->allow_sub_select_by_id = $search_query_object->allow_sub_select_by_id;
		}

		# Set remove_distinct (usseful for thesaurus search)
		if ($count_ar_section_tipo > 1) {
			$this->remove_distinct = true; # Force true when more than one section is passed
		}else{
			if (!isset($search_query_object->remove_distinct)) {
				$this->remove_distinct = false; // false is default
			}else{
				$this->remove_distinct = $search_query_object->remove_distinct;
			}
		}

		# Set skip_projects_filter. Default is false
		$this->skip_projects_filter = isset($this->search_query_object->skip_projects_filter) ? $this->search_query_object->skip_projects_filter : false;
		$ar_tables_skip_prejects = [
			'matrix_list',
			'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_langs',
			'matrix_layout',
			'matrix_layout_dd'
		];
		if (in_array($this->matrix_table, $ar_tables_skip_prejects, true)) {
			$this->skip_projects_filter = true; // Skip filter
		}


		return true;
	}//end set_up



	/**
	* SEARCH
	* Exec a sql query search against the database
	* @return array $result_table
	*/
	public function search() {

		$start_time=microtime(1);

		# Converts json search_query_object to sql query string
		$sql_query = $this->parse_search_query_object( $full_count=false );
			#debug_log(__METHOD__." sql_query ".to_string($sql_query), logger::DEBUG);

		$parsed_time = round(microtime(1)-$start_time,3);

		$result	= JSON_RecordObj_matrix::search_free($sql_query);
		if (!is_resource($result)) {
			trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $sql_query");
			return null;
		}

		$ar_relations_cache_solved = [];

		# Build a temporal table with array of records found in query
		$ar_records  	= [];
		$pg_num_fields 	= pg_num_fields($result);
		while ($rows = pg_fetch_assoc($result)) {

			$row = new stdClass();

			# Result columns
			for ($i=0; $i < $pg_num_fields; $i++) {

				$field_name  = pg_field_name($result, $i);
				$field_value = $rows[$field_name];

				# Skip temp relations_xxx columns and store their solved values
				if (strpos($field_name, 'relations_')===0) {
					$ar_relations_cache_solved[$field_name] = $field_value;
					continue;
				}

				# Add property
				$row->{$field_name} = $field_value;
			}

			#dump($this->relations_cache, ' $this->relations_cache ++ '.to_string());
			#dump($ar_relations_cache_solved, ' ar_relations_cache_solved ++ '.to_string());
			/* (!) NOTA: ESTA RESOLUCIÓN SÓLO ES VIABLE PARA EL PRIMER NIVEL. */
			# Relation components. Get relations data from relations column and parse virtual columns values for each component
			if (isset($this->relations_cache)) foreach ((array)$this->relations_cache as $table_alias => $ar_component_tipo) {
				foreach ($ar_component_tipo as $component_tipo) {
					$field_name  	= $component_tipo;
					$property_name 	= 'relations_' . $table_alias;
					#$field_value 	= $ar_relations_cache_solved[$property_name]; // Full relations data
					//if (isset($ar_relations_cache_solved[$property_name])) {
						$current_relations_cache_solved = $ar_relations_cache_solved[$property_name];
						$field_value = self::get_filtered_relations($current_relations_cache_solved, $component_tipo); // Filtered by from_component_tipo
					//}
					# Add property
					$row->{$field_name} = $field_value;
				}
			}
			#debug_log(__METHOD__." row ".to_string($row), logger::DEBUG);

			$ar_records[] = $row;
		}
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms'.' ms', logger::DEBUG);
			// dump($ar_records, ' ar_records ++ '.to_string());

		// childrens recursive
			if (isset($this->search_query_object->children_recursive) && $this->search_query_object->children_recursive===true) {
				$ar_row_children = [];
				foreach ($ar_records as $row) {
					$row_children 	 = component_relation_children::get_childrens($row->section_id, $row->section_tipo, $component_tipo=null, $recursive=true, $is_recursion=false);
					$ar_row_children = array_merge($ar_row_children, $row_children);
				}
				// dump($ar_row_children, ' ar_row_children ++ '.to_string());
				// dump($this->search_query_object, ' search_query_object ++ '.to_string());

				if (!empty($ar_row_children)) {
									
					$ar_rows_mix = array_merge($ar_row_children, $ar_records);
					$new_sqo 	 = $this->generate_children_recursive_search($ar_rows_mix);
					
					// new full search
						$new_search_development2 = new search_development2($new_sqo);
						$result = $new_search_development2->search();

					// replace current sqo changed properties to allow pagination
						$this->search_query_object->filter = $new_sqo->filter;
						$this->search_query_object->full_count = count($ar_rows_mix);
						$this->search_query_object->children_recursive = false;
						$this->search_query_object->parsed = true;

					return $result;
				}
			}


		#
		# FULL_COUNT
			if ($this->search_query_object->full_count===true) {
				# Exec a count query
				# Converts json search_query_object to sql query string
				$full_count_sql_query = $this->parse_search_query_object( $full_count=true );
				$full_count_result	  = JSON_RecordObj_matrix::search_free($full_count_sql_query);
				$row_count 	 		  = pg_fetch_assoc($full_count_result);
				$full_count 		  = (int)$row_count['full_count'];
				# Fix full_count value
				$this->search_query_object->full_count = $full_count;
			}

		#
		# RECORDS_DATA BUILD TO OUTPUT
			$records_data = new stdClass();

			// ar_records
				$records_data->ar_records = $ar_records;
			
			// debug info
				if(SHOW_DEVELOPER===true) {
					$records_data->generated_time['parsed_time'] 	 = $parsed_time;
					# Info about required time to exec the search
					$records_data->generated_time['get_records_data'] = round(microtime(1)-$start_time,3);
					# Query to database string
					$records_data->strQuery = $sql_query;
					if (isset($full_count_sql_query)) {
						$records_data->strQuery .= PHP_EOL . $full_count_sql_query;
					}
					#$this->search_query_object->generated_time['get_records_data'] = round(microtime(1)-$start_time,3);
					#dump($records_data, '$records_data', array());
					$this->search_query_object->generated_time 	= $records_data->generated_time['get_records_data'];
				}
				#debug_log(__METHOD__." search_query_object ".json_encode($this->search_query_object, JSON_PRETTY_PRINT), logger::DEBUG);

		#debug_log(__METHOD__." 2 total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);
		// debug_log(__METHOD__." sql_query: ".to_string($sql_query), logger::DEBUG);


		return $records_data;
	}//end search



	/**
	* GENERATE_CHILDREN_RECURSIVE_SEARCH
	* Create a new filter to inject in current search query object
	* 
	* @return object $new_sqo
	*/
	public function generate_children_recursive_search($ar_rows) {

		// clone original sqo
			$new_sqo = clone $this->search_query_object;

		// force re - parse
			$new_sqo->parsed = false;

		// remove children_recursive to avoid infinite loop
			$new_sqo->children_recursive = false;

		// not count
			$new_sqo->full_count = false;
		
		// new full filter
			$filter = new stdClass();
			$op = '$or';
			$filter->{$op} = [];

			foreach ($ar_rows as $row_value) {
				
				$item = json_decode('{
			        "q": "'.$row_value->section_id.'",
			        "q_operator": null,
			        "path": [
			          {
			            "section_tipo": "'.$row_value->section_tipo.'",
			            "component_tipo": "section_id",
			            "modelo": "component_section_id",
			            "name": "Id"
			          }
			        ]
			      }');

				$filter->{$op}[] = $item;
			}

		// replace filter in sqo
			$new_sqo->filter = $filter;


		return $new_sqo;
	}//end generate_children_recursive_search



	/**
	* GET_FILTERED_RELATIONS
	* @return string $filtered_relations
	* json encoded array
	*/
	public static function get_filtered_relations($relations_data_string, $component_tipo) {

		$filtered_relations = [];

		if($relations_data = json_decode($relations_data_string)) {

			$filtered_relations = array_filter($relations_data, function($locator) use($component_tipo) {
				return (isset($locator->from_component_tipo) && $locator->from_component_tipo===$component_tipo);
			});

			$filtered_relations = array_values($filtered_relations); // Avoid json encoding objects
		}

		return json_encode($filtered_relations);
	}//end get_filtered_relations



	/**
	* PRE_PARSE_SEARCH_QUERY_OBJECT
	* Iterate all filter and select elements and comunicate with components to rebuild the search_query_object
	* Not return anything, only modifies the class var $this->search_query_object
	*/
	public function pre_parse_search_query_object() {

		#$start_time=microtime(1);
		#dump($this->search_query_object, 'preparsed $this->search_query_object 1 ++ '.to_string());

		# FILTER
			if (!empty($this->search_query_object->filter)) {

				# conform_search_query_object. Conform recursively each filter object asking the components
				foreach ($this->search_query_object->filter as $op => $ar_value) {
					$new_search_query_object_filter = self::conform_search_query_object($op, $ar_value);
					break; // Only expected one
				}

				# Replace filter array with components preparsed values
				if (isset($new_search_query_object_filter)) {
					$this->search_query_object->filter = $new_search_query_object_filter;
						#dump( json_encode($this->search_query_object, JSON_PRETTY_PRINT), ' json_encode(value) ++ '.to_string());
				}else{
					$this->search_query_object->filter = null;
				}
			}

		# SELECT
			$new_search_query_object_select = [];
			foreach ($this->search_query_object->select as $key => $select_object) {
				$new_search_query_object_select[] = search_development2::component_parser_select( $select_object );
			}
			# Replace select array with components preparsed values
			$this->search_query_object->select = $new_search_query_object_select;

		# ORDER
			if (!empty($this->search_query_object->order)) {
				$new_search_query_object_order = [];
				foreach ((array)$this->search_query_object->order as $key => $select_object) {
					$new_search_query_object_order[] = search_development2::component_parser_select( $select_object );
				}
				#debug_log(__METHOD__." new_search_query_object_order ".to_string($new_search_query_object_order), logger::DEBUG); #die();
				# Replace select array with components preparsed values
				$this->search_query_object->order = $new_search_query_object_order;
			}

		#dump($this->search_query_object, 'preparsed $this->search_query_object 2 ++ '.to_string()); die();
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);

		# Set as parsed already
		#$this->preparsed_search_query_object = true;

		# Set object as parsed
		$this->search_query_object->parsed = true;

		return true;
	}//end pre_parse_search_query_object



	/**
	* COMPONENT_PARSER_SELECT
	* Call to component to parse select query (add component path)
	* @return object $select_object
	*/
	public static function component_parser_select( $select_object ) {

		$path				= $select_object->path;
		$component_tipo 	= end($path)->component_tipo;
		if ($component_tipo==='section_id' || $component_tipo==='section_tipo') {
			return $select_object; // No parse section_id
		}
		$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$select_object 		= $modelo_name::get_select_query2($select_object);

		return $select_object;
	}//end component_parser_select



	/**
	* CONFORM_SEARCH_QUERY_OBJECT
	* Call to components to conform final search_query_object, adding specific component path, search operators etc.
	* Recursive
	* @return array $new_ar_query_object
	*/
	public static function conform_search_query_object($op, $ar_value) {

		$new_ar_query_object = new stdClass();
			$new_ar_query_object->$op = [];

		foreach ($ar_value as $search_object) {
			if (!is_object($search_object)) {
				dump($search_object, ' receibed object (search_object) : '.to_string());
				debug_log(__METHOD__." Invalid (ignored) non object search_object: ".to_string($search_object), logger::DEBUG);
				debug_log(__METHOD__." ar_value: ".json_encode($ar_value), logger::DEBUG);
				throw new Exception("Error Processing Request. search_object must be an object", 1);
				continue;
			}

			#if (self::is_search_operator($search_object)===true) {
			if (!property_exists($search_object, 'path')) {

				// Case object is a group
				$op2 		= key($search_object);
				$ar_value2 	= $search_object->$op2;

				$ar_elements = self::conform_search_query_object($op2, $ar_value2);
				#debug_log(__METHOD__." ar_elements $op - ".to_string($ar_elements), logger::DEBUG);
				if (!empty(reset($ar_elements))) {
					$new_ar_query_object->$op[] = $ar_elements;
				}

			}else{

				// Case object is a end search object
				$path				= $search_object->path;
				$search_component 	= end($path);
				#$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($search_component->component_tipo,true);
				$modelo_name 		= $search_component->modelo;
				$ar_query_object 	= $modelo_name::get_search_query2($search_object);
				#debug_log(__METHOD__." ar_query_object $op - ".to_string($ar_query_object), logger::DEBUG);
				#if (empty(reset($ar_query_object))) {
				#	continue;
				#}
				$new_ar_query_object->$op = array_merge($new_ar_query_object->$op, $ar_query_object);
			}
		}

		return $new_ar_query_object;
	}//end conform_search_query_object



	/**
	* PARSE_SEARCH_QUERY_OBJECT__OLD
	* Build full final sql query to send to DDBB
	* @param bool $full_count
	*	default false
	* @return string $sql_query
	*//*
	public function parse_search_query_object__OLD( $full_count=false ) {
		#dump($this->search_query_object->filter, ' this->search_query_object->filter 1 ++ '.to_string());
		#$start_time=microtime(1);
		#dump( json_encode($this->search_query_object,JSON_PRETTY_PRINT  ), '$this->search_query_object->filter 2 ++ '.to_string());
		#debug_log(__METHOD__." JSONSEARCH ORIGINAL (ANTES DE PASAR POR COMPONENTES) ".json_encode($this->search_query_object->filter, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), logger::DEBUG);

		#if ($this->preparsed_search_query_object === false) {
		if ($this->search_query_object->parsed!==true) {
			# Preparse search_query_object with components always before begins
			$this->pre_parse_search_query_object();
		}

		if(SHOW_DEBUG===true) {
			#dump( json_encode($this->search_query_object,JSON_PRETTY_PRINT  ), '$this->search_query_object->filter 2 ++ '.to_string());
			#dump( null, '$this->search_query_object->filter 2 ++ '.json_encode($this->search_query_object, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE ));  #die();
			#$debug_json_string = json_encode($this->search_query_object->filter, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
			#debug_log(__METHOD__." DEBUG_JSON_STRING \n".to_string().$debug_json_string, logger::DEBUG);
			#$this->remove_distinct=true;
		}


		# Search elements. Order is important
		$main_where_sql 	= $this->build_main_where_sql();
		$sql_query_order 	= $this->build_sql_query_order();	// Order before select !
		$sql_query_select 	= $this->build_sql_query_select($full_count);
		$sql_filter 		= $this->build_sql_filter();
		$sql_projects_filter= $this->build_sql_projects_filter();
		$sql_joins 			= $this->get_sql_joins();
		$main_from_sql  	= $this->build_main_from_sql();
		$sql_limit 			= $this->search_query_object->limit;
		$sql_offset 		= $this->search_query_object->offset;

		if (empty($sql_query_order)) {
			$sql_query_order = $this->build_sql_query_order_default();
		}

		# FORCE FALSE ALWAYS THAT EXIST $this->ar_sql_joins . Pending solve subquery pagination issue !
		#if (!empty($sql_joins)) {
		#	$this->allow_sub_select_by_id = false;
		#}
		#debug_log(__METHOD__." search_query_object ".json_encode($this->search_query_object, JSON_PRETTY_PRINT), logger::DEBUG);


		# sql_query
		$sql_query  = '';

		switch (true) {

			case ($full_count===true):
				# Only for count

				# SELECT
					if(SHOW_DEBUG===true) {
						$sql_query .= '-- Only for count' . PHP_EOL;
					}
					$sql_query .= 'SELECT ' . $sql_query_select;
				# FROM
					$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;
					# join virtual tables
					$sql_query .= $sql_joins;
					# join filter projects
					if (!empty($this->filter_join)) {
					$sql_query .= PHP_EOL . $this->filter_join;
					}
				# WHERE
					$sql_query .= PHP_EOL . 'WHERE ' . $main_where_sql;
					if (!empty($sql_filter)) {
						$sql_query .= $sql_filter;
					}
					#if (!empty($sql_projects_filter)) {
					#	$sql_query .= $sql_projects_filter;
					#}
					if (isset($this->filter_by_user_records)) {
						$sql_query .= $this->filter_by_user_records;
					}
					if (!empty($this->filter_join_where)) {
						$sql_query .= $this->filter_join_where;
					}
				break;

			case (empty($this->search_query_object->order) && empty($this->search_query_object->order_custom)):
				# Search Without order

				# SELECT
					if(SHOW_DEBUG===true) {
						$sql_query .= '-- Search Without order' . PHP_EOL;
					}
					$sql_query .= 'SELECT ' . $sql_query_select;
				# FROM
					$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;

					# ADD FOR SPEED SUBQUERY // WHERE nu4.section_id in (SELECT nu4.section_id FROM matrix AS nu4
					if($this->allow_sub_select_by_id===true) {
						# desactivo $sql_query .= PHP_EOL 'WHERE '.$this->main_section_tipo_alias.".id in (SELECT ".$this->main_section_tipo_alias.".id FROM ".$main_from_sql;
						//$sql_query .= PHP_EOL . 'WHERE '.$this->main_section_tipo_alias.'.section_id in (';
						//$sql_query .= PHP_EOL . 'SELECT DISTINCT ON('.$this->main_section_tipo_alias.'.section_id) '.$this->main_section_tipo_alias.'.section_id FROM '.$main_from_sql;
						$sql_query .= PHP_EOL . 'WHERE '.$this->main_section_tipo_alias.'.id in (';
						#$sql_query .= PHP_EOL . 'SELECT DISTINCT ON('.$this->main_section_tipo_alias.'.section_id) '.$this->main_section_tipo_alias.'.id FROM '.$main_from_sql; # Removed 03-10-2018
						$sql_query .= PHP_EOL . 'SELECT DISTINCT ON('.$this->main_section_tipo_alias.'.section_id,'.$this->main_section_tipo_alias.'.section_tipo) '.$this->main_section_tipo_alias.'.id FROM '.$main_from_sql;
					}
					# join virtual tables
					$sql_query .= $sql_joins;
					# join filter projects
					if (!empty($this->filter_join)) {
					$sql_query .= PHP_EOL . $this->filter_join;
					}
				# WHERE
					$sql_query .= PHP_EOL . 'WHERE ' . $main_where_sql;
					if (!empty($sql_filter)) {
						$sql_query .= $sql_filter;
					}
					#if (!empty($sql_projects_filter)) {
					#	$sql_query .= $sql_projects_filter;
					#}
					if (isset($this->filter_by_user_records)) {
						$sql_query .= $this->filter_by_user_records;
					}
					if (!empty($this->filter_join_where)) {
						$sql_query .= $this->filter_join_where;
					}
				# ORDER (default for maintain result consistency)
					#if($this->allow_sub_select_by_id===true) {
					#	$sql_query .= PHP_EOL . 'ORDER BY '.$this->main_section_tipo_alias.'.id ASC';// . $this->build_sql_query_order_default();
					#}else{
					#	$sql_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order; //$this->build_sql_query_order_default();
					#}
					if (isset($this->sql_query_order_window_subselect)) {
						$sql_query .= PHP_EOL . 'ORDER BY ' . $this->sql_query_order_window_subselect;
						if(SHOW_DEBUG===true) {
							$sql_query .= ' --sql_query_order_window_subselect ';
						}
					}else{
						#$sql_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order; //$this->build_sql_query_order_default();
						#$sql_query .= PHP_EOL . 'ORDER BY ' . $this->main_section_tipo_alias.'.id';
						if($this->allow_sub_select_by_id===true) {
							$default_order = ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';
							$sql_query .= PHP_EOL . 'ORDER BY ' . $this->main_section_tipo_alias.'.section_id '.$default_order;
							if(SHOW_DEBUG===true) {
								$sql_query .= ' --allow_sub_select_by_id=true ';
							}
						}else{
							$sql_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order;
							if(SHOW_DEBUG===true) {
								$sql_query .= ' -- allow_sub_select_by_id=false ';
							}
						}
					}
				# LIMIT
					if ($this->search_query_object->limit>0) {
						$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
					}
				# OFFSET
					if ($this->search_query_object->offset>0) {
						$sql_query .= ' OFFSET ' . $sql_offset;
					}
				# ADD FOR SPEED SUBQUERY
					if($this->allow_sub_select_by_id===true) {
						// $sql_query .= PHP_EOL .') AND '.$main_where_sql; //$this->main_section_tipo_alias.'.section_tipo=\''.$this->main_section_tipo.'\'';
						$sql_query .= PHP_EOL . ') ';
						$sql_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order; //$this->build_sql_query_order_default();
						if ($this->search_query_object->limit>0) {
						$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
						}
					}
				break;

			default:
				# Search With order

				# DISABLED
					#
					#	# SELECT mu1.section_id,
					#	# mu1.section_tipo,
					#	# mu1.datos#>'{relations}' as relations_mu1,
					#	# mu1.datos#>>'{components,mupreva776,valor_list,lg-vlca}' as mupreva776,
					#	# mu1.datos#>>'{components,mupreva15,valor_list,lg-vlca}' as mupreva15,
					#	# mu1.datos#>>'{components,mupreva776,valor_list,lg-vlca}' as mupreva776_order
					#	# FROM matrix AS mu1
					#	# WHERE mu1.section_id in (SELECT  mu1.section_id FROM matrix AS mu1
					#	# INNER JOIN relations as f ON (f.section_tipo=mu1.section_tipo AND f.section_id=mu1.section_id AND f.from_component_tipo='mupreva16' AND f.target_section_tipo='dd153' AND
					#	#  (f.target_section_id=1))
					#	# WHERE (mu1.section_tipo='mupreva1')
					#	#  ORDER BY mu1.datos#>>'{components,mupreva776,valor_list,lg-vlca}' ASC
					#	# LIMIT 10
					#	# ) AND (mu1.section_tipo='mupreva1')
					#	#  ORDER BY mupreva776_order ASC

					#	# SELECT
					#		$sql_query .= '-- +++++++++ ' .PHP_EOL;
					#		$sql_query .= 'SELECT ' . $sql_query_select;
					#	# FROM
					#		$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;

					#		# ADD FOR SPEED SUBQUERY // WHERE nu4.section_id in (SELECT nu4.section_id FROM matrix AS nu4
					#		if($this->allow_sub_select_by_id===true) {
					#			# desactivo $sql_query .= PHP_EOL 'WHERE '.$this->main_section_tipo_alias.".id in (SELECT ".$this->main_section_tipo_alias.".id FROM ".$main_from_sql;
					#			$sql_query .= PHP_EOL . 'WHERE '.$this->main_section_tipo_alias.'.section_id in ';
					#			$sql_query .= '(SELECT '.$this->main_section_tipo_alias.'.section_id FROM '.$main_from_sql;
					#		}
					#		# join virtual tables
					#		$sql_query .= $sql_joins;
					#		# join filter projects
					#		if (!empty($this->filter_join)) {
					#		$sql_query .= PHP_EOL . $this->filter_join;
					#		}
					#	# WHERE
					#		$sql_query .= PHP_EOL . 'WHERE ' . $main_where_sql;
					#		if (!empty($sql_filter)) {
					#			$sql_query .= $sql_filter;
					#		}
					#		if (!empty($sql_projects_filter)) {
					#			$sql_query .= $sql_projects_filter;
					#		}
					#	# ORDER (default for maintain result consistency)
					#		#if($this->allow_sub_select_by_id===true) {
					#		#	$sql_query .= PHP_EOL . 'ORDER BY '.$this->main_section_tipo_alias.'.id ASC';// . $this->build_sql_query_order_default();
					#		#}else{
					#			$sql_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order; //$this->build_sql_query_order_default();
					#		#}
					#	# LIMIT
					#		if ($this->search_query_object->limit>0) {
					#			$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
					#		}
					#	# OFFSET
					#		if ($this->search_query_object->offset>0) {
					#			$sql_query .= ' OFFSET ' . $sql_offset;
					#		}
					#	# ADD FOR SPEED SUBQUERY
					#		if($this->allow_sub_select_by_id===true) {
					#			$sql_query .= PHP_EOL .') AND '.$main_where_sql; //$this->main_section_tipo_alias.'.section_tipo=\''.$this->main_section_tipo.'\'';
					#			$sql_query .= PHP_EOL . ' ORDER BY ' . $sql_query_order; //$this->build_sql_query_order_default();
					#			if ($this->search_query_object->limit>0) {
					#			$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
					#			}
					#		}
					#	break;

				$query_inside = '';
				# SELECT
					if(SHOW_DEBUG===true) {
						$sql_query .= '-- Search With order' . PHP_EOL;
					}
					$query_inside .= 'SELECT ' . $sql_query_select;
				# FROM
					$query_inside .= PHP_EOL . 'FROM ' . $main_from_sql;
					# ADD FOR SPEED OFFSET // WHERE nu4.section_id in (SELECT nu4.section_id FROM matrix AS nu4
					#$query_inside .= "\n WHERE ".$this->main_section_tipo_alias.".section_id in (SELECT ".$this->main_section_tipo_alias.".section_id FROM ".$main_from_sql; // ++
					# join virtual tables
					$query_inside .= $sql_joins;
					# join filter projects
					#if (!empty($this->filter_join)) {
					#$query_inside .= PHP_EOL . $this->filter_join;
					#}
				# WHERE
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
				# ORDER (default for maintain result consistency)
					$query_inside .= PHP_EOL . 'ORDER BY ' . $this->build_sql_query_order_default();
					# ADD FOR SPEED OFFSET
					#$query_inside .= "\n) ORDER BY " . $this->build_sql_query_order(); // ++

				# QUERY WRAP
					$sql_query .= 'SELECT * FROM (';
					$sql_query .= PHP_EOL . $query_inside. PHP_EOL;
					$sql_query .= ') main_select';
					# ORDER
						if(isset($this->sql_query_order_custom)) {
							$sql_query .= PHP_EOL . $this->sql_query_order_custom;
						}else{
							$sql_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order;
						}
					# LIMIT
						if ($this->search_query_object->limit>0) {
							$sql_query .= PHP_EOL . 'LIMIT ' . $sql_limit;
						}
					# OFFSET
						if ($this->search_query_object->offset>0) {
							$sql_query .= ' OFFSET ' . $sql_offset;
						}
				break;
		}

		$sql_query .= ';' . PHP_EOL;

		#dump(null, ' sql_query ++ '.to_string($sql_query)); die();
		#debug_log(__METHOD__." SQL QUERY: ".to_string($sql_query), logger::DEBUG);
		#debug_log(__METHOD__." this->search_query_object: ".to_string($this->search_query_object), logger::DEBUG);
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);

		return $sql_query;
	}//end parse_search_query_object__OLD
	*/



	/**
	* PARSE_SEARCH_QUERY_OBJECT NEW
	* Build full final sql query to send to DDBB
	* @param bool $full_count
	*	default false
	* @return string $sql_query
	*/
	public function parse_search_query_object( $full_count=false ) {
		#$start_time=microtime(1);
		#dump($this->search_query_object->filter, ' this->search_query_object->filter 1 ++ '.to_string());
		#dump( json_encode($this->search_query_object,JSON_PRETTY_PRINT  ), '$this->search_query_object->filter 2 ++ '.to_string());
		#debug_log(__METHOD__." JSONSEARCH ORIGINAL (ANTES DE PASAR POR COMPONENTES) ".json_encode($this->search_query_object->filter, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), logger::DEBUG);

		#if ($this->preparsed_search_query_object === false) {
		if ($this->search_query_object->parsed!==true) {
			# Preparse search_query_object with components always before begins
			$this->pre_parse_search_query_object();
		}

		if(SHOW_DEBUG===true) {
			#dump( json_encode($this->search_query_object,JSON_PRETTY_PRINT  ), '$this->search_query_object->filter 2 ++ '.to_string());
			#dump( null, '$this->search_query_object->filter 2 ++ '.json_encode($this->search_query_object, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE ));  #die();
			#$debug_json_string = json_encode($this->search_query_object->filter, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
			#debug_log(__METHOD__." DEBUG_JSON_STRING \n".to_string().$debug_json_string, logger::DEBUG);
			#$this->remove_distinct=true;
		}

		// having reset and build
			$this->having_search_objects = [];

		# Search elements. Order is important
			$main_where_sql 	= $this->build_main_where_sql();
			$sql_query_order 	= $this->build_sql_query_order();	// Order before select !
			$sql_query_select 	= $this->build_sql_query_select($full_count);
			$sql_filter 		= $this->build_sql_filter();
			$sql_projects_filter= $this->build_sql_projects_filter();

			// having. (!) order is important. before get_sql_joins
			$sql_filter_having = $this->build_sql_filter_having();

			$sql_joins 			= $this->get_sql_joins();
			$main_from_sql  	= $this->build_main_from_sql();
			$sql_limit 			= $this->search_query_object->limit;
			$sql_offset 		= $this->search_query_object->offset;

			if(isset($this->search_query_object->children_recursive) && $this->search_query_object->children_recursive===true) {
				$sql_limit = 0;
				$sql_offset= 0;
			}

			if (empty($sql_query_order)) {
				$sql_query_order = $this->build_sql_query_order_default();
			}


		# FORCE FALSE ALWAYS THAT EXIST $this->ar_sql_joins . Pending solve subquery pagination issue !
			#if (!empty($sql_joins)) {
			#	$this->allow_sub_select_by_id = false;
			#}
			#debug_log(__METHOD__." search_query_object ".json_encode($this->search_query_object, JSON_PRETTY_PRINT), logger::DEBUG);

		# sql_query
		$sql_query  = '';

		switch (true) {

		// count case
			case ($full_count===true):
				# Only for count

				# SELECT
					#$sql_query .= 'SELECT ' . $sql_query_select;
					if ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
						$sql_query .= 'SELECT '.$this->main_section_tipo_alias.'.section_id';
					}else{
						$sql_query .= 'SELECT DISTINCT '.$this->main_section_tipo_alias.'.section_id';
					}
				# FROM
					$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;
					# join virtual tables
					$sql_query .= $sql_joins;
					# join filter projects
					if (!empty($this->filter_join)) {
					$sql_query .= PHP_EOL . $this->filter_join;
					}
				# WHERE
					$sql_query .= PHP_EOL . 'WHERE ' . $main_where_sql;
					if (!empty($sql_filter)) {
						$sql_query .= $sql_filter;
					}
					#if (!empty($sql_projects_filter)) {
					#	$sql_query .= $sql_projects_filter;
					#}
					if (isset($this->filter_by_user_records)) {
						$sql_query .= $this->filter_by_user_records;
					}
					if (!empty($this->filter_join_where)) {
						$sql_query .= $this->filter_join_where;
					}
				// having
					if (!empty($sql_filter_having)) {
						#$sql_query .= PHP_EOL . $sql_filter_having .') ';
						$sql_query .= $sql_filter_having;
					}
				// multisection union case
					if (count($this->ar_section_tipo)>1) {
						$sql_query = $this->build_union_query($sql_query);
					}
				// $sql_query = 'SELECT COUNT(section_id) as full_count FROM (' . PHP_EOL . $sql_query . PHP_EOL. ') x';
					$sql_query = 'SELECT COUNT(*) as full_count FROM (' . PHP_EOL . $sql_query . PHP_EOL. ') x';
				if(SHOW_DEBUG===true) {
					$sql_query = '-- Only for count' . PHP_EOL . $sql_query;
				}
				break;

		// without order
			case (empty($this->search_query_object->order) && empty($this->search_query_object->order_custom)):
				# Search Without order

				// allow window selector
					if($this->allow_sub_select_by_id===true) {

						// select
							$sql_query .= 'SELECT ' . $sql_query_select;
						// from
							$sql_query .= PHP_EOL . 'FROM ' . $main_from_sql;
							// from where
								$sql_query .= PHP_EOL . 'WHERE '.$this->main_section_tipo_alias.'.id in (';
								$sql_query .= PHP_EOL . 'SELECT DISTINCT ON('.$this->main_section_tipo_alias.'.section_id,'.$this->main_section_tipo_alias.'.section_tipo) '.$this->main_section_tipo_alias.'.id FROM '.$main_from_sql;
								# join virtual tables
									$sql_query .= $sql_joins;
								# join filter projects
									if (!empty($this->filter_join)) {
									$sql_query .= PHP_EOL . $this->filter_join;
									}
						// where
							$sql_query .= PHP_EOL . 'WHERE ' . $main_where_sql;
							if (!empty($sql_filter)) {
								$sql_query .= $sql_filter;
							}
							if (isset($this->filter_by_user_records)) {
								$sql_query .= $this->filter_by_user_records;
							}
							if (!empty($this->filter_join_where)) {
								$sql_query .= $this->filter_join_where;
							}
							// having
							if (!empty($sql_filter_having)) {
								$sql_query .= $sql_filter_having;
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
							// order multi section union case
								if (isset($this->ar_matrix_tables) && count($this->ar_matrix_tables)>1) {
									$order_query = str_replace('mix.', '', $order_query);
								}
								$sql_query .= $order_query;
						// limit
							$limit_query = '';
							if ($sql_limit>0 && empty($sql_filter_having)) {
								$limit_query = PHP_EOL . 'LIMIT ' . $sql_limit;
								$sql_query .= $limit_query;
							}
						// offset
							$offset_query = '';
							if ($sql_offset>0) {
								$offset_query = PHP_EOL . 'OFFSET ' . $sql_offset;
								$sql_query .= $offset_query;
							}
						// having . Not add limit here (!)
							// if (!empty($sql_filter_having)) {
							// 	// $sql_query .= PHP_EOL . ') ' . $sql_filter_having . PHP_EOL . $order_query . PHP_EOL . $offset_query;
							// }
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
							if ($sql_limit>0) {
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
							}
							if (isset($this->filter_by_user_records)) {
								$sql_query .= $this->filter_by_user_records;
							}
							if (!empty($this->filter_join_where)) {
								$sql_query .= $this->filter_join_where;
							}
							// having
							if (!empty($sql_filter_having)) {
								$sql_query .= $sql_filter_having;
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
							// order multisection union case
								if (isset($this->ar_matrix_tables) && count($this->ar_matrix_tables)>1) {
									$order_query = str_replace('mix.', '', $order_query);
								}
								$sql_query .= $order_query;
						// limit
							if ($sql_limit>0) {
								$limit_query = PHP_EOL . 'LIMIT ' . $sql_limit;
								$sql_query  .= $limit_query;
							}
						// offset
							if ($sql_offset>0) {
								$offset_query = ' OFFSET ' . $sql_offset;
								$sql_query 	 .= $offset_query;
							}
							if($this->allow_sub_select_by_id===true) {
								$sql_query .= PHP_EOL . ') ';
							}
						// having
							#if (!empty($sql_filter_having)) {
							#	$sql_query .= PHP_EOL . ') ' . $sql_filter_having . PHP_EOL . $order_query . PHP_EOL . $offset_query ;
							#}
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
				# Search With order

				// query_inside
					$query_inside = '';
					// select
						$query_inside .= 'SELECT ' . $sql_query_select;
					// from
						$query_inside .= PHP_EOL . 'FROM ' . $main_from_sql;
						# join virtual tables
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
						// having
							if (!empty($sql_filter_having)) {
								$query_inside .= $sql_filter_having;
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
						$query_inside .= $order_query;
				// query wrap
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
						if ($sql_limit>0) {
							$limit_query = PHP_EOL . 'LIMIT ' . $sql_limit;
							$sql_query .= $limit_query;
						}
					// offset
						if ($sql_offset>0) {
							$sql_query .= ' OFFSET ' . $sql_offset;
						}
					if(SHOW_DEBUG===true) {
						$sql_query = '-- Search With order' . PHP_EOL . $sql_query;
						#debug_log(__METHOD__." sql_query ".to_string($sql_query), logger::DEBUG);
					}
				break;
		}

		$sql_query .= ';' . PHP_EOL;

		#dump(null, ' sql_query ++ '.to_string($sql_query)); die();
		#debug_log(__METHOD__." SQL QUERY: ".to_string($sql_query), logger::DEBUG);
		#debug_log(__METHOD__." this->search_query_object: ".to_string($this->search_query_object), logger::DEBUG);
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);

		return $sql_query;
	}//end parse_search_query_object



	/**
	* build_union_query
	* Rewrite query string building sql union for each different matrix table
	* @param string $sql_query
	* @return string $sql_query
	*/
	public function build_union_query($sql_query) {

		// calculate tables
			$this->ar_matrix_tables = [];
			foreach ($this->ar_section_tipo as $key => $current_section_tipo) {
				$current_matrix_table = common::get_matrix_table_from_tipo($current_section_tipo);
				if (!in_array($current_matrix_table, $this->ar_matrix_tables)) {
					$this->ar_matrix_tables[] = $current_matrix_table;
				}
			}
			if (count($this->ar_matrix_tables)>1) {
				$tables_query = [];
				// Add current query
					$tables_query[] = $sql_query;
				foreach ($this->ar_matrix_tables as $key => $current_matrix_table) {
					# ignore first table
					if ($key===0) continue;
					// copy source and replace table and alias names
						$current_query = $sql_query;
						$current_query = preg_replace('/(FROM [a-zA-z]+ AS [a-zA-z]+)/i', 'FROM '.$current_matrix_table.' AS mix_'.$current_matrix_table, $current_query);
						$current_query = str_replace('mix.', 'mix_'.$current_matrix_table.'.', $current_query);
					$tables_query[] = $current_query;
				}
				// replace original
					$sql_query = implode(PHP_EOL.'UNION ALL'.PHP_EOL, $tables_query);
			}

		return $sql_query;
	}//end build_union_query



	/**
	* BUILD_SQL_QUERY_SELECT
	* @return string $sql_query_select
	*/
	public function build_sql_query_select($full_count=false) {

		if ($full_count===true) {
			return $this->build_full_count_sql_query_select();
		}

		$search_query_object = $this->search_query_object;

		$ar_sql_select = [];
		$ar_key_path   = [];

		if ($this->remove_distinct===true) {
			$ar_sql_select[] = $this->main_section_tipo_alias.'.section_id';
		}else{
			$ar_sql_select[] = 'DISTINCT ON ('.$this->main_section_tipo_alias.'.section_id) '.$this->main_section_tipo_alias.'.section_id';
		}

		$ar_sql_select[] = $this->main_section_tipo_alias.'.section_tipo';

		// Select fallback to 'datos' when $search_query_object->select is empty or unset
			if (empty($search_query_object->select)) {
				#$ar_sql_select[] = 'datos';
				$ar_sql_select[] = $this->main_section_tipo_alias.'.datos';
			}else{
				foreach ($search_query_object->select as $key => $select_object) {

					$path 				 = $select_object->path;
					$table_alias 		 = $this->get_table_alias_from_path($path);
					$last_item 		 	 = end($path);
					$component_tipo 	 = $last_item->component_tipo;
					$column_alias 		 = $component_tipo;
					$modelo_name 		 = $last_item->modelo;
					$select_object_type  = isset($select_object->type) ? $select_object->type : 'string';
					#$aply_distinct 	 = isset($last_item->distinct_values) ? $last_item->distinct_values : false; // From item path
					$aply_distinct 		 = (isset($search_query_object->distinct_values) && $search_query_object->distinct_values===$component_tipo) ? true : false; // From global object
					$component_path 	 = implode(',', $select_object->component_path);
					if ($this->main_section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
						# In activity section, data container is allways 'dato'
						$component_path  = str_replace('valor_list', 'dato', $component_path);
					}

					$sql_select = '';

					if ($modelo_name==='component_section_id') {

						$sql_select .= $table_alias.'.section_id';
						$sql_select .= ' as '.$column_alias;

					}else{

						if ($component_path==='relations') {

							if (!isset($this->relations_cache[$table_alias])) {

								# Add original always to conserve row property position
								$ar_sql_select[] = '\'\''.' as '.$column_alias;

								# New temporal column
								$sql_select .= $table_alias.'.datos#>\'{relations}\'';
								$column_alias = 'relations_' . $table_alias; // Override table alias for generic name

							}else{
								# Already exists a relations column. Skip select again
								$sql_select .= '\'\'';
							}

							// add always to iterate after
								$this->relations_cache[$table_alias][] = $component_tipo;

						}else{

							$sql_select .= $table_alias.'.datos';
							if($select_object_type==='string') {
								$sql_select .= '#>>';
							}else{
								$sql_select .= '#>';
							}
							$sql_select .= '\'{';
							$sql_select .= $component_path;
							$sql_select .= '}\'';
						}

						// All
							if ($aply_distinct===true) {
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

					// Add line
						if ($aply_distinct===true) {
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

					$this->join_group[] = $this->build_sql_join($select_object->path);
				}
			}

		# Add order columns to select when need
			foreach ((array)$this->order_columns as $select_line) {
				$ar_sql_select[] = $select_line;
			}

		# Join all
			$sql_query_select = implode(','.PHP_EOL, $ar_sql_select);


		return $sql_query_select;
	}//end build_sql_query_select



	/**
	* BUILD_SQL_PROJECTS_FILTER
	* Create the sql code for filter records by user projects
	* @return string $sql_projects_filter
	*/
	public function build_sql_projects_filter() {

		$sql_projects_filter = '';

		if ($this->skip_projects_filter===true) {
			return $sql_projects_filter;
		}

		$section_tipo 	 = $this->main_section_tipo;
		$section_alias 	 = $this->main_section_tipo_alias;
		$datos_container = ($this->matrix_table==='matrix_time_machine') ? 'dato' : 'datos';

		# Logged user id
		$user_id = (int)navigator::get_user_id();

		static $sql_projects_filter_data;
		$uid = $section_tipo.'_'.$user_id;
		if (isset($sql_projects_filter_data[$uid])) {
			#debug_log(__METHOD__." Cached filter sql code returned for section $section_tipo".to_string(), logger::DEBUG);
			return $sql_projects_filter_data[$uid];
		}

		$is_global_admin = (bool)component_security_administrator::is_global_admin($user_id);
		if ($is_global_admin!==true) {

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
						$sql_filter .= "\n-- filter_user_created [PROJECTS SECTION] -- (no filter is used here from 31-03-2018) -- \n";
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

					# USER PROFILE
					# Calculate current user profile id
					$profile_id = component_profile::get_profile_from_user_id( $user_id );


					# Current user profile authorized areas
					$component_security_areas = component_common::get_instance('component_security_areas',
																				DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO,
																				$profile_id,
																				'edit',
																				DEDALO_DATA_NOLAN,
																				DEDALO_SECTION_PROFILES_TIPO);
					$security_areas_dato 	  = (object)$component_security_areas->get_dato();

					# Iterate and clean array of authorized areas of this user like '[dd942-admin] => 2'
					$ar_area_tipo = [];
					foreach ($security_areas_dato as $area_tipo => $value) {
						if ( (int)$value===3 ) {
							$ar_area_tipo[] = $area_tipo;
						}
					}
					if (empty($ar_area_tipo)) {
						debug_log(__METHOD__." Profile ($profile_id) without data!! ".to_string(), logger::ERROR);
						$url =  DEDALO_ROOT_WEB ."/main/";
						header("Location: $url");
						exit();
					}

					# SEARCH PROFILES WITH CURRENT USER AREAS
					$ar_profile_id = filter::get_profiles_for_areas( $ar_area_tipo );
					$ar_filter_profile = [];
					foreach ($ar_profile_id as $current_profile_id) {
						$ar_filter_profile[] = PHP_EOL . $section_alias.'.'.$datos_container.'#>\'{components,'.DEDALO_USER_PROFILE_TIPO.',dato,'.DEDALO_DATA_NOLAN.'}\' = \''.$current_profile_id.'\' ';
					}
					$sql_filter .= implode(' OR ', $ar_filter_profile);
					$sql_filter .= ')';

					# PROJECTS FILTER
					$component_filter_master = component_common::get_instance('component_filter_master',
																			   DEDALO_FILTER_MASTER_TIPO,
																			   navigator::get_user_id(),
																			   'list',
																			   DEDALO_DATA_NOLAN,
																			   DEDALO_SECTION_USERS_TIPO);
					$filter_master_dato 	 = (array)$component_filter_master->get_dato();
					if (empty($filter_master_dato)) {
						$url =  DEDALO_ROOT_WEB ."/main/";
						header("Location: $url");
						exit();
					}
					$ar_values_string = '';
					foreach ($filter_master_dato as $project_section_id => $state) {
						$ar_values_string .= "'{$project_section_id}'";
						$ar_values_string .= ',';
					}
					$ar_values_string = substr($ar_values_string,0,-1);
					if(SHOW_DEBUG===true) {
						$sql_filter .= "\n-- filter_by_projects --";
					}
					#$sql_filter .= PHP_EOL . 'AND '.$section_alias.'.'.$datos_container.'#>\'{components,'.DEDALO_FILTER_MASTER_TIPO.',dato,'.DEDALO_DATA_NOLAN.'}\' ?| array['.$ar_values_string.']';
					# Filter by any of user projects
					$ar_query = [];
					foreach ((array)$filter_master_dato as $key => $current_project_locator) {
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
					$sql_filter .= PHP_EOL . ' AND ';

					# SECTION FILTER TIPO : Actual component_filter de esta sección
					# params: $section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false
					$ar_component_filter = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component_filter'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
					if (!isset($ar_component_filter[0])) {
						$section_name = RecordObj_dd::get_termino_by_tipo($section_tipo);
						throw new Exception("Error Processing Request. Filter not found is this section ($section_tipo) $section_name", 1);
					}else{
						$component_filter_tipo = $ar_component_filter[0];
					}

					$ar_projects = (array)filter::get_user_projects($user_id);
					if (empty($ar_projects)) {
						$sql_filter .= PHP_EOL . $section_alias.'.'.$datos_container.'#>>\'{components}\' = \'VALOR_IMPOSIBLE (User without projects)\' ';
					}else{
						#$sql_filter .= '(';

						# Filter by any of user projects
						$ar_query 		= [];
						$ar_filter_join = [];
						foreach ($ar_projects as $key => $current_project_locator) {
							$search_locator = new locator();
								$search_locator->set_section_tipo($current_project_locator->section_tipo);
								$search_locator->set_section_id($current_project_locator->section_id);
								$search_locator->set_type($current_project_locator->type);
								if (!isset($this->search_query_object->id) || (isset($this->search_query_object->id) && $this->search_query_object->id!=='thesaurus')) {
								$search_locator->set_from_component_tipo($component_filter_tipo);
								}

							$ar_query[] = $section_alias.'.'.$datos_container.'#>\'{relations}\'@>\'['.json_encode($search_locator).']\'::jsonb';
							#$ar_query[] = $section_alias.'.'.$datos_container.'@>\'{"relations":['.json_encode($search_locator).']}\'::jsonb';

							$ar_filter_join[] = 'f.target_section_id='.(int)$current_project_locator->section_id;
						}
						$sql_filter .=  '(' . implode(' OR ',$ar_query) . ')';

						# Join of projects
						#$filter_join  = 'INNER JOIN relations as f ON (f.section_tipo='.$this->main_section_tipo_alias.'.section_tipo AND f.section_id='.$this->main_section_tipo_alias.'.section_id ';
						$filter_join  = 'LEFT JOIN relations as f ON (f.section_tipo='.$this->main_section_tipo_alias.'.section_tipo AND f.section_id='.$this->main_section_tipo_alias.'.section_id ';
						$filter_join .= 'AND f.from_component_tipo=\''.$component_filter_tipo.'\'';
						#$filter_join .= ' f.section_tipo=\''.$this->main_section_tipo.'\' AND ';
						#$filter_join .= ' AND f.target_section_tipo=\''.DEDALO_SECTION_PROJECTS_TIPO.'\' AND'.PHP_EOL.' ('. implode(' OR ',$ar_filter_join).')';
						$filter_join .= ')';
						$this->filter_join = $filter_join;
						$this->filter_join_where = PHP_EOL .' AND ('. implode(' OR ',$ar_filter_join).')';

						#if(SHOW_DEBUG!==true) {
							# Delete old filter except for reference to debuger
							#$sql_filter = '';
						#}
					}
					break;
			}

			# FILTER_USER_RECORDS_BY_ID
			if (defined('DEDALO_FILTER_USER_RECORDS_BY_ID') && DEDALO_FILTER_USER_RECORDS_BY_ID===true) {

				$filter_user_records_by_id = filter::get_filter_user_records_by_id( navigator::get_user_id() );
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

			if (!empty( $sql_filter)) {
				$sql_projects_filter = $sql_filter;
			}

		}//endif ($is_global_admin!==true) {
		#dump($sql_projects_filter, ' sql_projects_filter ++ '.to_string());

		# Cache
		$sql_projects_filter_data[$uid] = $sql_projects_filter;


		return $sql_projects_filter;
	}//end build_sql_projects_filter



	/**
	* BUILD_SQL_QUERY_ORDER_DEFaULT
	* @return string $sql_query_order_default
	*/
	public function build_sql_query_order_default() {

		if (isset($this->sql_query_order_default)) {
			return $this->sql_query_order_default;
		}

		$section_tipo  = $this->main_section_tipo;

		$default_order = ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';

		$sql_query_order_default = $this->main_section_tipo_alias.'.section_id '.$default_order;


		return $sql_query_order_default;
	}//end build_sql_query_order_default



	/**
	* BUILD_SQL_QUERY_ORDER
	* @return string $sql_query_order
	*/
	public function build_sql_query_order() {

		$sql_query_order = '';
		$ar_order 		 = [];

		if (!empty($this->search_query_object->order_custom)) {

			// custom order
				$ar_custom_query 	  = [];
				$ar_custom_queryorder = [];
				foreach ($this->search_query_object->order_custom as $item_key => $order_item) {

					$column_name   	= $order_item->column_name;
					$column_values 	= $order_item->column_values;
					$table 			= ($item_key>0) ? 'x'.$item_key : 'x';

					$pairs = [];
					foreach ($column_values as $key => $value) {
						$value 	 = is_string($value) ? "'" . $value . "'" : $value;
						$pair 	 = '('.$value.','.($key+1).')';
						$pairs[] = $pair;
					}
					// Join like: LEFT JOIN (VALUES (7,1),(1,2)) as x(ordering_id, ordering) ON main_select.section_id = x.ordering_id ORDER BY x.ordering ASC
					$ar_custom_query[] 		= 'LEFT JOIN (VALUES '.implode(',', $pairs).') as '.$table.'(ordering_id, ordering) ON main_select.'.$column_name.'='.$table.'.ordering_id';
					$ar_custom_queryorder[] = 'ORDER BY '.$table.'.ordering ASC';
				}
				$this->sql_query_order_custom = implode(' ', $ar_custom_query) . ' ' . implode(',', $ar_custom_queryorder);


		}elseif (!empty($this->search_query_object->order)) {

			// order
				foreach ($this->search_query_object->order as $order_obj) {

					$direction 		= strtoupper($order_obj->direction);
					$path 	   		= $order_obj->path;
					$end_path  		= end($path);
					$component_tipo = $end_path->component_tipo;
					$type 			= $order_obj->type ?? 'string';

					if ($component_tipo==='section_id') {
						# section_id column case
						$line = 'section_id ' . $direction;

					}else{

						# Add join if not exists
						$this->build_sql_join($path);

						$table_alias= $this->get_table_alias_from_path($path);
						$selector 	= implode(',', $order_obj->component_path);
						$alias 		= $component_tipo . '_order';
						if ($type==='integer') {
							$base 	= $table_alias . '.datos#>\'{'.$selector.'}\'';
						}else{
							$base 	= $table_alias . '.datos#>>\'{'.$selector.'}\'';
						}
						$column 	= $base .' as '.$alias;

						# Add to global order columns (necessary for order...)
						# This array is added when query select is calculated
						$this->order_columns[] = $column;

						$line = $alias . ' ' . $direction;
						#$line = $base . ' ' . $direction;
						#debug_log(__METHOD__." line ".to_string($line), logger::DEBUG);
					}

					$ar_order[] = $line;
				}

				$sql_query_order = implode(',', $ar_order);
		}

		if(SHOW_DEBUG===true) {
			#debug_log(__METHOD__." sql_query_order: ".to_string($sql_query_order), logger::DEBUG);
		}


		return $sql_query_order;
	}//end build_sql_query_order



	/**
	* BUILD_MAIN_FROM_SQL
	* @return string $main_from_sql
	*/
	public function build_main_from_sql() {

		$main_from_sql = $this->matrix_table .' AS '. $this->main_section_tipo_alias;

		# Fix
		$this->main_from_sql = $main_from_sql;

		return $main_from_sql;
	}//end build_main_from_sql



	/**
	* BUILD_MAIN_WHERE_SQL
	* @return string $main_where_sql
	*/
	public function build_main_where_sql() {

		# section_tipo is always and array
		$ar_section_tipo   = $this->ar_section_tipo;

		# main_section_tipo is always the first section tipo
		$main_section_tipo = $this->main_section_tipo;

		# alias . Sort version of main_section_tipo
		$main_section_tipo_alias = $this->main_section_tipo_alias;

		$ar_sentences = array();
		foreach ($ar_section_tipo as $current_section_tipo) {
			$ar_sentences[] = $main_section_tipo_alias.'.section_tipo=\''. $current_section_tipo.'\'';
		}
		$main_where_sql = '(' . implode(' OR ', $ar_sentences) . ')';

		# Avoid root user is showed except for root
		if ($main_section_tipo===DEDALO_SECTION_USERS_TIPO) {
			#if(SHOW_DEBUG!==true) {
				$main_where_sql .= ' AND '.$main_section_tipo_alias.'.section_id>0 ';
			#}
		}

		# Fix values
		$this->main_where_sql = $main_where_sql;

		return $main_where_sql;
	}//end build_main_where_sql



	/**
	* BUILD_SQL_FILTER
	* @return string $filter_query
	*/
	public function build_sql_filter() {

		$filter_query  = '';

		if (!empty($this->search_query_object->filter)) {

			$operator = key($this->search_query_object->filter);
			$ar_value = $this->search_query_object->filter->{$operator};
			if(!empty($ar_value)) {

				$query = $this->filter_parser($operator, $ar_value);
				if(!empty($query)) {
					$filter_query .= ' AND ('.$query.')';
				}

				#if (isset($this->global_group_query)) {
				#	$filter_query .= "\n" . $this->global_group_query;
				#}
			}
		}

		return $filter_query;
	}//end build_sql_filter



	/**
	* FILTER_PARSER
	* @param string $op
	* @param array $ar_value
	* @return string $string_query
	*/
	public function filter_parser($op, $ar_value) {

		if ($op==='$or_link') {

			$obj = new stdClass();
				$obj->{$op} = $ar_value;

 			// store search_object
			$this->having_query_object = $obj;

			// override
			$op = '$or';
		}

		$string_query = '';

		$total = count($ar_value);

		// sql operator like 'OR'
		$sql_operator = strtoupper( substr($op, 1) );

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
						if ($vvalue->path[0]->modelo==='component_portal') {
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
					$sql_operator = 'OR';
					// Define global group code to add in sql query
					$this->global_group_query = 'GROUP BY '.$this->main_section_tipo_alias.'.id HAVING count(*) > ' . ($n_match-1);
				}
			}
			*/

		foreach ($ar_value as $key => $search_object) {

			// operator ? check
			$op2 = key($search_object);

			if ($op2==='$or_link') {

				// store search_object
				if (!isset($this->having_query_object)) {
					$this->having_query_object = $search_object;
				}

				// override
				$op2 = '$or';
			}

			#if (!property_exists($search_object,'path')) {
			if ($op2==='$or' || $op2==='$and') {
				# Case operator
				$real_op 	= key($search_object);
				$ar_value2 	= $search_object->{$real_op};

				$sql_operator2 = strtoupper( substr($op2, 1) );
				#if ($key > 1) {
				#	$string_query .= ' '.$sql_operator2.'** ';
				#}
				$string_query .= ' (';
				$string_query .= $this->filter_parser($op2, $ar_value2);
				$string_query .= ' )';

				if ($key+1 < $total) {
					$string_query .= ' '.$sql_operator.' ';
				}

			}else{
				# Case elements
				#if (!empty($search_object->q)) {
					$n_levels = count($search_object->path);
					if ($n_levels>1) {
						$this->join_group[] = $this->build_sql_join($search_object->path);
					}

					$string_query .= $this->get_sql_where($search_object);

					if ($key+1 !== $total){
						#$sql_operator = strtoupper( substr($op, 1) );
						#$string_query .= ") ".$sql_operator." (";
						$string_query .= ' '.$sql_operator.' ';
					}
				#}
			}
		}//end foreach ($ar_value as $key => $search_object) {


		return $string_query;
	}//end filter_parser



	/**
	* BUILD_SQL_FILTER_HAVING
	* @return string $filter_query
	*/
	protected function build_sql_filter_having($ar_options=[]) {

		$filter_query  = '';

		if (!empty($this->having_query_object)) {

			$operator 	= key($this->having_query_object);
			$ar_value 	= $this->having_query_object->{$operator};
			// exec to add all search_objects to '$this->having_search_objects' and count later
			$this->filter_parser_having($operator, $ar_value);

			$q_unique = [];
			foreach ((array)$this->having_search_objects as $current) {
				if (!in_array($current->q, $q_unique)) $q_unique[] = $current->q;
			}

			if (isset($this->having_path)) {
				$filter_query .= PHP_EOL.PHP_EOL . "  GROUP BY {$this->main_section_tipo_alias}.id";
				$filter_query .= " HAVING COUNT(DISTINCT {$this->having_path}) >= " .count($q_unique) .PHP_EOL;
			}
		}

		return $filter_query;
	}//end build_sql_filter_having



	/**
	* FILTER_PARSER_having
	* @param string $op
	*	like '$or_link'
	* @param array $ar_value
	* @return bool true
	*/
	public function filter_parser_having($op, $ar_value) {

		foreach ($ar_value as $key => $search_object) {

			// operator ? check
			$op2 = key($search_object);

			if ($op2==='$or_link') {

				// recursion
				$this->filter_parser_having($op2, $search_object->$op2);

			}else if ($op2==='$or' || $op2==='$and') {

				$this->filter_parser_having($op2, $search_object->$op2);

			}else{

				// store all iterated search objects to count later
					$this->having_search_objects[] = $search_object;

				// force calculate deep joins
					$current_path 	= $search_object->path;
					$path 			= $this->get_deep_path($current_path);
					$this->build_sql_join($path, true);
			}
		}//end foreach ($ar_value as $key => $search_object) {


		return true;
	}//end filter_parser_having



	/**
	* BUILD_full_count_SQL_QUERY_SELECT
	* @return string $sql_query_select
	*/
	public function build_full_count_sql_query_select() {

		$sql_query_select = 'count(DISTINCT '.$this->main_section_tipo_alias.'.section_id) as full_count';

		return $sql_query_select;
	}//end build_full_count_sql_query_select



	/**
	* BUILD_SQL_JOIN
	* @return bool true
	* Builds one table join based on requested path
	*/
	public function build_sql_join($original_path) {

		$path 			= $original_path;
		$total_paths	= count($original_path);

		$rel_table   	= self::$relations_table;
		$ar_key_join 	= [];
		$base_key 		= '';


		$ar_current_sql_join = [];

		foreach ($path as $key => $step_object) {

			// skip first level always
			if ($key===0) {
				$base_key 		= $this->main_section_tipo_alias; //self::trim_tipo($step_object->section_tipo);
				$ar_key_join[] 	= self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
				continue;
			}

			if ($key===1) {
				$current_key = $base_key;
			}else{
				$current_key = implode('_', $ar_key_join);
			}
			#dump($current_key, ' current_key ++ '.to_string($key));

			#if($key === $total_paths-1) {
			#	// last item
			#	$ar_key_join[] 	= self::trim_tipo($step_object->section_tipo);
			#}else{
				// in the middle item
				$ar_key_join[]	= self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
			#}

			$matrix_table		= common::get_matrix_table_from_tipo($step_object->section_tipo);
			$last_section_tipo 	= $step_object->section_tipo;
			$t_name 			= implode('_', $ar_key_join);
			$t_relation			= 'r_'.$t_name ;

			// t_name_key
			$t_name_key = $t_name;

			if (!isset($this->ar_sql_joins[$t_name_key])) {

				$sql_join  = "\n";
				if(SHOW_DEBUG===true) {
					$section_name = RecordObj_dd::get_termino_by_tipo($step_object->section_tipo, null, true, false);
					$sql_join  .= "-- JOIN GROUP $matrix_table - $t_name - $section_name";
					if (isset($path[$key-1])) {
						$from_component_tipo_model = RecordObj_dd::get_modelo_name_by_tipo($path[$key-1]->component_tipo,true);
						$sql_join .= ' - from_component_tipo: '.$path[$key-1]->component_tipo .' ['.$from_component_tipo_model.']';
					}
					$sql_join  .= PHP_EOL;
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

				// store having_path (overwrite until last)
				$this->having_path = $t_name . '.section_id';

				// Add to joins
				$this->ar_sql_joins[$t_name_key] = $sql_join;

			}else{

				# Join from cache
				$sql_join = $this->ar_sql_joins[$t_name_key];
			}

			$ar_current_sql_join[$t_name_key] = $sql_join;

		}//end foreach ($path as $key => $step_object)
		#$key_group = implode('_', $ar_key_join);
		#dump($this->ar_sql_joins, '$this->ar_sql_joins ++ '.to_string());

		return $ar_current_sql_join;
	}//end build_sql_join



	/**
	* GET_DEEP_PATH
	* @return array $path
	*/
	public function get_deep_path($path) {

		$end_path 	= end($path);
		$end_model 	= RecordObj_dd::get_modelo_name_by_tipo($end_path->component_tipo,true);

		if (!in_array($end_model, component_relation_common::get_components_with_relations())) {
			// already resolved final path
			return $path;
		}


		switch (true) {
			case ($end_model==='component_autocomplete_hi'):
				# add to path to force deep join
				$post_end_path = self::get_query_path(DEDALO_THESAURUS_TERM_TIPO, DEDALO_THESAURUS_SECTION_TIPO); // $resolve_related=true, $related_tipo=false
				#dump($post_end_path, ' post_end_path ++ '.to_string());
				break;

			case ($end_model==='component_autocomplete'):

				#$component = component_common::get_instance($end_model,
				#											$end_path->component_tipo,
				#											null,
				#											'list',
				#											DEDALO_DATA_NOLAN,
				#											$end_path->section_tipo);
				#
				#$ar_target_section_tipo = $component->get_ar_target_section_tipo();
					#dump($ar_target_section_tipo, ' ar_target_section_tipo ++ '.to_string());
				# add to path to force deep join
				$post_end_path = self::get_query_path($end_path->component_tipo, $end_path->section_tipo); // $resolve_related=true, $related_tipo=false
					#dump($post_end_path2, ' post_end_path2 ++ '.to_string());
				break;

			default:
				$post_end_path = self::get_query_path($end_path->component_tipo, $end_path->section_tipo); // $resolve_related=true, $related_tipo=false
				break;
		}


		// recursion
		if (isset($post_end_path)) {
			$path = array_merge($path, $this->get_deep_path($post_end_path));
		}

		// remove duplicates
		$clean_path = [];
		foreach ($path as $value) {
			$key = $value->component_tipo . $value->section_tipo;
			$clean_path[$key] = $value;
		}
		$path = array_values($clean_path);


		return $path;
	}//end get_deep_path



	/**
	* TRIM_TIPO
	* @return string $trimmed_tipo
	*/
	public static function trim_tipo($tipo, $max=2) {

		if ($tipo==='section_id') {
			return $tipo;
		}

		preg_match("/^([a-z]+)([0-9]+)$/", $tipo, $matches);

		if (empty($matches)) {
			debug_log(__METHOD__." Error on preg match tipo: $tipo ".to_string(), logger::ERROR);
		}

		$name 	= $matches[1];
		$number = $matches[2];

		$trimmed_tipo = substr($name, 0, $max) . $number;

		return $trimmed_tipo;
	}//end trim_tipo



	/**
	* GET_SQL_WHERE
	* @return string $sql_where
	*/
	public function get_sql_where($search_object) {
		#dump($search_object, ' search_object ++ '.to_string());
		//oh1_oh24_rsc197_rsc86.datos#>'{relations}' @> '[{"section_id":"2","section_tipo":"dd861","from_component_tipo":"rsc93"}]'::jsonb
		//unaccent(oh1_oh24_rsc197_rsc453.datos#>>'{components, rsc85, dato}') ~* unaccent('.*\[".*ana.*')

		# {
		#   "q": "'.*\[".*ana.*'",						// the regext, text, number, etc that the component created
		#   "unaccent":true,								// true or false
		#   "operator":"~*",								// the operator for query
		#   "type": "string",								// string or jsonb
		#   "lang": "lg-nolan",							// if not defined lang = all langs, if defined lang = the lang sended
		#   "path": [										// path for locate the component into the joins
		#     {
		#       "section_tipo": "oh1",
		#       "component_tipo": "oh24"
		#     },
		#     {
		#       "section_tipo": "rsc197",
		#       "component_tipo": "rsc453"
		#     }
		#   ],
		#   "component_path": [							// the component path to find the dato or valor...
		#     "components",
		#     "rsc85",
		#     "dato"
		#   ]
		# }

		#dump($search_object, ' search_object ++ '.to_string());

		$path					= $search_object->path;
		$table_alias 			= $this->get_table_alias_from_path($path);

		if ($search_object->lang!=='all') {

			// Search already existing lang (maybe added in previous get_sql_where of current search_object like when count) 2018-12-18
			$last_component_path = end($search_object->component_path);
			if ( substr($last_component_path, 0, 3)!=='lg-' ) {
				// Add lang to path once
				$search_object->component_path[] = $search_object->lang;
			}
		}
		$component_path 		= implode(',', $search_object->component_path);

		# search_object_type : string, array
		$search_object_type 	= isset($search_object->type) ? $search_object->type : 'string';

		# search_object_format : direct, array, array_elements
		$search_object_format 	= isset($search_object->format) ? $search_object->format : 'direct';

		# search_object_unaccent: true, false
		$search_object_unaccent = isset($search_object->unaccent) ? $search_object->unaccent : false;

		# search operator
		if (!isset($search_object->operator)) {
			$search_object->operator = 'OR';
		}

		# safe operator
		$safe_operator = $search_object->operator==='OR_LINK' ? 'OR' : $search_object->operator;


		$sql_where  = "\n";

		switch ($search_object_format) {

			case 'direct':

				if(SHOW_DEBUG===true) {
					$component_path_data 	= end($path);
					$component_tipo 		= $component_path_data->component_tipo;
					$component_name 		= $component_path_data->name ?? '';	//RecordObj_dd::get_termino_by_tipo($component_tipo, null, true, false);
					$modelo_name 			= $component_path_data->modelo; //RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$sql_where .= "-- DIRECT FORMAT - table_alias:$table_alias - $component_tipo - $component_name - $component_path - ".strtoupper($modelo_name)."\n";
				}

				if($search_object_unaccent===true) {
					$sql_where .= 'f_unaccent(';
				}

				$sql_where .= $table_alias . '.datos';

				if($search_object_type==='string') {
					$sql_where .= '#>>';
				}else{
					$sql_where .= '#>';
				}

				# json path
				$sql_where .= '\'{' . $component_path . '}\'';

				if($search_object_unaccent===true) {
					$sql_where .= ')';
				}

				# operator
				$sql_where .= ' '.$safe_operator.' ';

				if($search_object_unaccent===true) {
					$sql_where .= 'f_unaccent(';
				}

				# q
				// Escape parenthesis inside regex
				$q_parsed_clean = str_replace(['(',')'], ['\(','\)'], $search_object->q_parsed);
				$sql_where .= $q_parsed_clean;
				#$sql_where .= pg_escape_string(stripslashes($search_object->q_parsed));

				if($search_object_unaccent===true) {
					$sql_where .= ')';
				}
				break;

			case 'array_elements':

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

				if(SHOW_DEBUG===true) {
					$component_path_data 	= end($path);
					$component_tipo 		= $component_path_data->component_tipo;
					$component_name 		= $component_path_data->name ?? '';	//RecordObj_dd::get_termino_by_tipo($component_tipo, null, true, false);
					$modelo_name 			= $component_path_data->modelo; //RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$sql_where .= "-- TYPEOF FORMAT - table_alias:$table_alias - $component_tipo - $component_name - $component_path - ".strtoupper($modelo_name)."\n";
				}

				$sql_where .= 'jsonb_typeof('.$table_alias.'.datos#>\'{'.$component_path.'}\')'.$safe_operator.$search_object->q_parsed;
				break;

			case 'column':
				if(SHOW_DEBUG===true) {
					$component_path_data 	= end($path);
					$component_tipo 		= $component_path_data->component_tipo;
					$component_name 		= $component_path_data->name ?? '';	//RecordObj_dd::get_termino_by_tipo($component_tipo, null, true, false);
					$modelo_name 			= $component_path_data->modelo; //RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$sql_where .= "-- COLUMN FORMAT - $component_tipo - $component_name - $table_alias - $component_path - ".strtoupper($modelo_name)."\n";
				}

				$sql_where .= $table_alias . '.'.$component_path;

				# operator
				$sql_where .= ' '.$safe_operator.' ';

				# q
				$sql_where .= $search_object->q_parsed;
				break;

		}//end switch ($search_object->type)


		return $sql_where;
	}//end get_sql_where



	/**
	* RESOLVE_ARRAY_elements
	* Recursive
	* @return string $sql_where
	*/
	public static function resolve_array_elements( $array_elements, $component_tipo ) {

		$sql_where = '';
		#debug_log(__METHOD__." ****** array_elements ".to_string($array_elements), logger::DEBUG);

		foreach ($array_elements as $current_operator => $group_elements) {
			#dump($group_elements, ' $group_elements ++ '.to_string($current_operator)); die();

			$operator_sql = strtoupper(substr($current_operator, 1));

			$group_query = [];
			foreach ($group_elements as $search_unit) {

				if (strpos(key($search_unit),'$')!==false) {

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
	* @return bool
	*/
	public static function is_search_operator($search_object) {

		foreach ($search_object as $key => $value) {
			if (strpos($key, '$')!==false) {
				return true;
			}
		}

		return false;
	}//end is_search_operator



	/**
	* GET_TABLE_ALIAS_FROM_PATH
	* @return
	*/
	public function get_table_alias_from_path($path) {

		$total	= count($path);
		$ar_key = [];
		foreach ($path as $key => $step_object) {

			if ($total===1) {

				$ar_key[] = $this->main_section_tipo_alias; // mix

			}else{

				#if ($key===$total -1) { // last
				#	$ar_key[] = self::trim_tipo($step_object->section_tipo);
				#}else{
					$ar_key[] = self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
				#}
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
	* @return array $path
	*/
	public static function get_query_path($tipo, $section_tipo, $resolve_related=true, $related_tipo=false) {

		$path = [];

		$term_model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		# Add first level always
		$current_path = new stdClass();

			$current_path->name 	  	  = strip_tags(RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true, true));
			$current_path->modelo 	  	  = $term_model;
			$current_path->section_tipo   = $section_tipo;
			$current_path->component_tipo = $tipo;

		# Add direct level to array path
		$path[] = $current_path;

		if ($resolve_related===true) {
			$ar_related_components 	= component_relation_common::get_components_with_relations();
			if(in_array($term_model, $ar_related_components)===true) {

				$ar_terminos_relacionados 	= RecordObj_dd::get_ar_terminos_relacionados($tipo,true,true);
				$ar_related_section			= common::get_ar_related_by_model('section', $tipo);

				if (!empty($ar_related_section)) {

					$related_section_tipo = reset($ar_related_section);

					if ($related_tipo!==false) {

						$current_tipo = $related_tipo;
						$modelo_name  = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
						if (strpos($modelo_name,'component')===0) {
							# Recursion
							$ar_path = self::get_query_path($current_tipo, $related_section_tipo);
							foreach ($ar_path as $key => $value) {
								$path[] = $value;
							}
						}

					}else{

						foreach ($ar_terminos_relacionados as $key => $current_tipo) {

							// Use only first related tipo
							$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
							if (strpos($modelo_name,'component')!==0) continue;
							# Recursion
							$ar_path = self::get_query_path($current_tipo, $related_section_tipo);
							foreach ($ar_path as $key => $value) {
								$path[] = $value;
							}
							break; // Avoid multiple components in path !
						}
					}
				}
			}
		}


		return (array)$path;
	}//end get_query_path



	/**
	* BUILD_SEARCH_QUERY_OBJECT
	* @return object $query_object
	*//*
	public static function build_search_query_object( $request_options=array() ) {

		$options = new stdClass();
			$options->q 	 			= null;
			$options->limit  			= 10;
			$options->offset 			= 0;
			$options->lang 				= DEDALO_DATA_LANG;
			$options->id 				= 'temp';
			$options->section_tipo		= null;
			$options->select_fields		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		# SELECT
			$select_group 		= [];
			$layout_map 		= component_layout::get_layout_map_from_section( $this );
			$ar_component_tipo 	= reset($layout_map);
			foreach ($ar_component_tipo as $component_tipo) {

				$select_element = new stdClass();
					$select_element->path = search_development2::get_query_path($component_tipo, $this->tipo);

				$select_group[] = $select_element;
			}

		# FILTER
			$filter_group = null;


		# QUERY OBJECT
		$query_object = new stdClass();
			$query_object->id  	   		= $options->id;
			$query_object->section_tipo = $options->section_tipo;
			$query_object->filter  		= $filter_group;
			$query_object->select  		= $select_group;
			$query_object->limit   		= $options->limit;
			$query_object->offset  		= $options->offset;

		#dump( json_encode($query_object, JSON_PRETTY_PRINT), ' query_object ++ '.to_string());
		#debug_log(__METHOD__." query_object ".json_encode($query_object, JSON_PRETTY_PRINT), logger::DEBUG);totaol
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);


		return (object)$query_object;
	}//end build_search_query_object */



	/**
	* GET_SQL_JOINS
	* Implode all ar_sql_joins in a string
	* @return string $sql_joins
	*/
	public function get_sql_joins() {

		$sql_joins = '';

		if (isset($this->ar_sql_joins)) {
			$sql_joins = implode(' ', $this->ar_sql_joins);
		}

		return $sql_joins;
	}//end get_sql_joins



	/**
	* CALCULATE_INVERSE_LOCATORS
	* Now inverse locators is always calculated, not stored !
	* @see section::get_inverse_locators
	* @param object $reference_locator
	*	Basic locator with section_tipo and section_id properties
	* @return array $ar_inverse_locators
	*/
	public static function calculate_inverse_locators( $reference_locator, $limit=false, $offset=false, $count=false ) {
		#debug_log(__METHOD__." locator received:  ".to_string($reference_locator), logger::DEBUG);

		# compare
		$compare = json_encode($reference_locator);

		# Cache
		#static $ar_inverse_locators_data;
		#$uid = md5($compare) . '_' . (int)$limit . '_' . (int)$offset . '_' . (int)$count;
		#if (isset($ar_inverse_locators_data[$uid])) {
		#	debug_log(__METHOD__." Returning cached result !! ".to_string($uid), logger::DEBUG);
		#	return $ar_inverse_locators_data[$uid];
		#}

		$ar_tables_to_search = common::get_matrix_tables_with_relations();
		#debug_log(__METHOD__." ar_tables_to_search: ".json_encode($ar_tables_to_search), logger::DEBUG);

		$ar_query=array();
		foreach ($ar_tables_to_search as $table) {

			$query   = '';
			if($count === true){
				$query  .= PHP_EOL . 'SELECT COUNT(*)';
			}else{
				$query  .= PHP_EOL . 'SELECT section_tipo, section_id, datos#>\'{relations}\' AS relations';
			}
			$query  .= PHP_EOL . 'FROM "'.$table.'"';
			$query  .= PHP_EOL . 'WHERE datos#>\'{relations}\' @> \'['.$compare.']\'::jsonb';
			#$query  .= PHP_EOL . 'WHERE datos @> \'{"relations":['.$compare.']}\'::jsonb';

			$ar_query[] = $query;
		}

		$strQuery  = '';
		$strQuery .= implode(' UNION ALL ', $ar_query);
		// Set order to maintain results stable

		if($count === false){
			$strQuery .= PHP_EOL . 'ORDER BY section_id ASC';
			if($limit !== false){
				$strQuery .= PHP_EOL . 'LIMIT '.$limit;
				if($offset !== false){
					$strQuery .= PHP_EOL . 'OFFSET '.$offset;
				}
			}
		}

		$strQuery .= ';';

		if(SHOW_DEBUG===true) {
			//debug_log(__METHOD__." strQuery ".to_string($strQuery), logger::DEBUG);
		}

		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		if (!is_resource($result)) {
			trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $strQuery");
			return null;
		}
		$ar_inverse_locators = array();
		if($count === false){
			# Note that row relations contains all relations and not only searched because we need
			# filter relations array for each records to get only desired coincidences

			// Compare all properties of received locator in each relations locator
			$ar_properties = array();
			foreach ($reference_locator as $key => $value) {
				$ar_properties[] = $key;
			}

			while ($rows = pg_fetch_assoc($result)) {

				$current_section_id   	= $rows['section_id'];
				$current_section_tipo 	= $rows['section_tipo'];
				$current_relations 		= (array)json_decode($rows['relations']);

				foreach ($current_relations as $current_locator) {
					if ( true===locator::compare_locators($reference_locator, $current_locator, $ar_properties) ) {
						// Add some temporal info to current locator for build component later
						$current_locator->from_section_tipo = $current_section_tipo;
						$current_locator->from_section_id 	= $current_section_id;
						// Note that '$current_locator' contains 'from_component_tipo' property, useful for know when component is called
						$ar_inverse_locators[] = $current_locator;
					}
				}
			}
			#debug_log(__METHOD__." ar_inverse_locators ".to_string($ar_inverse_locators), logger::DEBUG);

		}else{
			while ($rows = pg_fetch_assoc($result)) {
				$ar_inverse_locators[] = $rows;
			}
		}

		# Cache
		#$ar_inverse_locators_data[$uid] = $ar_inverse_locators;


		return (array)$ar_inverse_locators;
	}//end calculate_inverse_locators



	/**
	* GET_INVERSE_RELATIONS_FROM_RELATIONS_TABLE
	* Return an array of locators composed from table 'relations'
	* @param string $section_tipo
	*	Like 'oh1'
	* @param int $section_id
	*	Like 1
	* @return array $result_table
	*/
	public static function get_inverse_relations_from_relations_table__UNUSED($section_tipo, $section_id) {

		$target_section_tipo = (string)$section_tipo;
		$target_section_id 	 = (int)$section_id;

		# sql_query
			$sql_query  = '';
			# SELECT
			#$sql_query .= PHP_EOL . 'SELECT DISTINCT ON (section_id,section_tipo) section_id, section_tipo, from_component_tipo';
			$sql_query .= PHP_EOL . 'SELECT section_id, section_tipo, from_component_tipo';
			# FROM
			$sql_query .= PHP_EOL . 'FROM "'.self::$relations_table.'"';
			# WHERE
			$sql_query .= PHP_EOL . 'WHERE "target_section_id"=' . (int)$target_section_id .' AND "target_section_tipo"=\''. $target_section_tipo.'\'';
			# END
			$sql_query .= ';' . PHP_EOL;

			if(SHOW_DEBUG===true) {
				#debug_log(__METHOD__." sql_query ".to_string($sql_query), logger::DEBUG);
			}

		$result	= JSON_RecordObj_matrix::search_free($sql_query);
		if (!is_resource($result)) {
			trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $sql_query");
			return null;
		}

		# 1 Build a temporal table with array of records found in query
		$result_table=array();
		while ($rows = pg_fetch_assoc($result)) {

			$locator = new locator();
				$locator->set_section_tipo($rows['section_tipo']);
				$locator->set_section_id($rows['section_id']);
				$locator->set_from_component_tipo($rows['from_component_tipo']);

			$result_table[] = $locator;
		}


		return $result_table;
	}//end get_inverse_relations_from_relations_table



	/**
	* HAVE_INVERSE_RELATIONS
	* Fast version of get_inverse_relations for bool response
	* Return bool. True when have, false when not
	* @param string $section_tipo
	*	Like 'oh1'
	* @param int $section_id
	*	Like 1
	* @return bool
	*/
	public static function have_inverse_relations($section_tipo, $section_id) {

		static $have_inverse_relations_resolved = array();
		if (isset($have_inverse_relations_resolved[$section_tipo.'_'.$section_id])) {
			return $have_inverse_relations_resolved[$section_tipo.'_'.$section_id];
		}

		$have_inverse_relations = false;

		$target_section_tipo = (string)$section_tipo;
		$target_section_id 	 = (int)$section_id;

		# sql_query
			$sql_query  = '';
			# SELECT
			#$sql_query .= PHP_EOL . 'SELECT DISTINCT ON (section_id,section_tipo) section_id, section_tipo, from_component_tipo';
			$sql_query .= PHP_EOL . 'SELECT section_id';
			# FROM
			$sql_query .= PHP_EOL . 'FROM "'.self::$relations_table.'"';
			# WHERE
			$sql_query .= PHP_EOL . 'WHERE target_section_id=' . $target_section_id .' AND target_section_tipo=\''. $target_section_tipo.'\'';
			# LIMIT
			$sql_query .= PHP_EOL . 'LIMIT 1';
			# END
			$sql_query .= ';';

		$result		= JSON_RecordObj_matrix::search_free($sql_query);
		$num_rows	= pg_num_rows($result);

		if ($num_rows>0) {
			$have_inverse_relations = true;
		}

		# Store for runtime cache
		$have_inverse_relations_resolved[$section_tipo.'_'.$section_id] = $have_inverse_relations;

		return (bool)$have_inverse_relations;
	}//end have_inverse_relations



	/**
	* PROPAGATE_COMPONENT_DATO_TO_RELATIONS_TABLE
	* Get complete component relation dato and generate rows into relations table for fast LEFT JOIN
	* @return object $response
	*/
	public static function propagate_component_dato_to_relations_table( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= array('Error. Request failed '.__METHOD__);

		// options
			$options = new stdClass();
				$options->ar_locators 		  = null;
				$options->section_tipo 		  = null;
				$options->section_id 		  = null;
				$options->from_component_tipo = null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			if (strpos($options->section_id, DEDALO_SECTION_ID_TEMP)!==false) {
				$response->result 	= true;
				$response->msg 		= 'Ok. Request skipped for temp section: '.DEDALO_SECTION_ID_TEMP.' - '.__METHOD__;
				return $response;
			}

			if (empty($options->from_component_tipo)) {
				$response->msg[] = " options->from_component_tipo is mandatory ! Stopped action";
				$response->msg   = implode(', ', $response->msg);
				debug_log(__METHOD__." $response->msg ".to_string(), logger::ERROR);
				return $response;
			}

		// sort vars
			$table 				 = 'relations';
			$section_id 		 = $options->section_id;
			$section_tipo 		 = $options->section_tipo;
			$from_component_tipo = $options->from_component_tipo;

		// DELETE . Remove all relations of current component
			$strQuery 	= "DELETE FROM $table WHERE section_id = $section_id AND section_tipo = '$section_tipo' AND from_component_tipo = '$from_component_tipo' ";
			$result 	= JSON_RecordDataBoundObject::search_free($strQuery);

		// INSERT . Create all relations again (multiple)
			/* Old way, one insert by record
				foreach ((array)$options->ar_locators as $key => $locator) {

					if(!isset($locator->section_tipo)) {
						debug_log(__METHOD__." Error. empty section_tipo. Ignored insert locator: ".to_string($locator), logger::ERROR);
						continue;
					}

					$target_section_tipo = $locator->section_tipo;
					$target_section_id 	 = $locator->section_id;
					#$from_component_tipo = $locator->from_component_tipo; // Already defined before

					# INSERT . Create new
					$strQuery = "INSERT INTO $table (section_id, section_tipo, target_section_id, target_section_tipo, from_component_tipo) VALUES ($1, $2, $3, $4, $5) RETURNING id";
					# Exec query
					$result = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_id, $section_tipo, $target_section_id, $target_section_tipo, $from_component_tipo ));
					if(!$result) {
						$msg = " Failed Insert relations record - $strQuery";
						debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
						$response->msg[] = $msg;
					}else{
						$msg = " Created relations row ({$section_tipo}-{$section_id}) target_section_id:$target_section_id, target_section_tipo:$target_section_tipo, from_component_tipo:$from_component_tipo";
						$response->msg[] = $msg;
						if(SHOW_DEBUG===true) {
							if ($section_tipo!==DEDALO_ACTIVITY_SECTION_TIPO) {
								$msg .= ' ('.RecordObj_dd::get_termino_by_tipo($section_tipo).' - '.RecordObj_dd::get_termino_by_tipo($from_component_tipo).')';
								debug_log(__METHOD__." OK: ".$msg, logger::DEBUG);
							}
						}
					}
				}
				*/
			$ar_insert_values = [];
			foreach ((array)$options->ar_locators as $key => $locator) {

				if (empty($locator)) {
					debug_log(__METHOD__." Error. empty locator. Ignored relations insert empty locator.", logger::ERROR);
					continue;
				}

				if(!isset($locator->section_tipo) || !isset($locator->section_id)) {
					debug_log(__METHOD__." Error. empty section_tipo or section_id. Ignored relations insert locator: ".to_string($locator), logger::ERROR);
					continue;
				}
				$target_section_tipo  = $locator->section_tipo;
				$target_section_id 	  = $locator->section_id;

				// avoid save yes/not section pointers (dd64 - DEDALO_SECTION_SI_NO_TIPO)
				if ($target_section_tipo===DEDALO_SECTION_SI_NO_TIPO || $target_section_tipo===DEDALO_SECTION_USERS_TIPO) {
					continue;
				}

				$ar_insert_values[]   = "($section_id, '$section_tipo', $target_section_id, '$target_section_tipo', '$from_component_tipo')";
			}
			# Exec query (all records at once)
				if (!empty($ar_insert_values)) {

					$strQuery = 'INSERT INTO '.$table.' (section_id, section_tipo, target_section_id, target_section_tipo, from_component_tipo) VALUES '.implode(',', $ar_insert_values).';';
					$result = pg_query(DBi::_getConnection(), $strQuery);
					if(!$result) {
						$msg = " Failed Insert relations record - $strQuery";
						debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
						$response->msg[] = $msg;
					}else{
						$msg = ' Created ' . count($ar_insert_values) . " relations rows (section_tipo:$section_tipo, section_id:$section_id, from_component_tipo:$from_component_tipo, target_section_tipo:$target_section_tipo)";
						$response->msg[] = $msg;
						if(SHOW_DEBUG===true) {
							if ($section_tipo!==DEDALO_ACTIVITY_SECTION_TIPO) {
								$msg .= ' ('.RecordObj_dd::get_termino_by_tipo($section_tipo).' - '.RecordObj_dd::get_termino_by_tipo($from_component_tipo).')';
								debug_log(__METHOD__." OK: ".$msg, logger::DEBUG);
							}
						}
					}

					// response
						$response->result = true;
						$response->msg[0] = "Ok. Relations row successfully"; // Override first message
						$response->msg    = "<br>".implode('<br>', $response->msg);
				}


		return $response;
	}//end propagate_component_dato_to_relations_table



	############################ SEARCH2 #################################



	/**
	* GET_COMPONENTS_FROM_SECTION
	* Used to build search presets
	* @return object $response
	*/
	public static function get_components_from_section($ar_section_tipo, $path=[], $ar_tipo_exclude_elements=false) {
		#dump($section_tipo, ' section_tipo ++ '.to_string());
		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		$ar_result = [];

		$ar_components_exclude = [	'component_password',
									'component_filter_records',
									'component_image',
									'component_av',
									'component_pdf',
									'component_security_administrator',
									//'component_relation_children',
									//'component_relation_related',
									//'component_relation_model',
									//'component_relation_parent',
									//'component_relation_index',
									//'component_relation_struct',
									'component_geolocation',
									'component_info',
									'component_state',
									'section_tab',
									'component_autocomplete_ts'
								];

		# Manage multiple sections
		# section_tipo can be an array of section_tipo. For avoid duplications, check and group similar sections (like es1, co1, ..)
		#$ar_section_tipo = (array)$section_tipo;

		$user_id_logged		 = navigator::get_user_id();
		$ar_authorized_areas = component_security_areas::get_ar_authorized_areas_for_user($user_id_logged, 'full');
		#dump($ar_authorized_areas, ' ar_authorized_areas ++ '.to_string());

		foreach ((array)$ar_section_tipo as $section_tipo) {

			if ( $section_tipo!==DEDALO_THESAURUS_SECTION_TIPO
				&& $user_id_logged!=DEDALO_SUPERUSER
				&& (!isset($ar_authorized_areas->$section_tipo) || (int)$ar_authorized_areas->$section_tipo<1)) {
				// user don't have access to current section. skip section
				continue;
			}

			# section label
			$section_label 	  = RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG , true, true);

			$ar_children 	  = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements);
			$ar_section_group = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['section_group','section_group_div','section_tab'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true, $ar_tipo_exclude_elements);

			// Add section common info
			$ar_section_group[] = DEDALO_SECTION_INFO_SECTION_GROUP;

			$ar_section_group_parsed = [];
			foreach ($ar_section_group as $section_group_tipo) {

				$current_section_group_modelo = RecordObj_dd::get_modelo_name_by_tipo($section_group_tipo,true);
				switch ($current_section_group_modelo) {
					case 'section_tab':
						# Section tab case need resolve children tabs
						$ar_tabs = RecordObj_dd::get_ar_childrens($section_group_tipo, $order_by='norden');
						foreach ($ar_tabs as $tab_tipo) {
							$ar_section_group_parsed[] = $tab_tipo;
						}
						break;
					case 'section_group':
						// dump($current_section_group_modelo, ' current_section_group_modelo ++ '.to_string($section_group_tipo));
						$ar_section_group_parsed[] = $section_group_tipo;
						break;
					default:
						# Add regular section group
						$ar_section_group_parsed[] = $section_group_tipo;
						break;
				}
			}//end foreach ($ar_section_group as $section_group_tipo)

			// debug
				if(SHOW_DEBUG===true) {
					// $a = array_map(function($tipo){
					// 	return (object)[
					// 		'tipo'		=> $tipo,
					// 		'model'		=> RecordObj_dd::get_modelo_name_by_tipo($tipo,true),
					// 		'label'		=> RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG , true, true),
					// 		'children'	=> RecordObj_dd::get_ar_childrens($tipo, $order_by='norden')
					// 	];
					// }, $ar_section_group);
					// dump($a, ' a ++ '.to_string());
					// dump($ar_children, ' ar_children ++ '.to_string());
				}			

			$ar_added_components = [];
			foreach ($ar_section_group_parsed as $section_group_tipo) {

				// section_group label / model
					$section_group_label	= RecordObj_dd::get_termino_by_tipo($section_group_tipo, DEDALO_DATA_LANG , true, true);
					$section_group_model	= RecordObj_dd::get_modelo_name_by_tipo($section_group_tipo,true);
				
				// section group childrens (components)
					// $ar_section_group_childrens = RecordObj_dd::get_ar_childrens($section_group_tipo, $order_by='norden');				
					$ar_section_group_childrens = RecordObj_dd::get_ar_recursive_childrens($section_group_tipo, $is_recursion=false, $ar_exclude_models=false, $order_by='norden');
								
				
				// iterate childrens (components)
					foreach ($ar_section_group_childrens as $component_tipo) {

						if ($section_group_tipo!==DEDALO_SECTION_INFO_SECTION_GROUP && !in_array($component_tipo, $ar_children)) {
							continue;
						}

						// avoid duplicates on deep resolve recursion childrens
							if (in_array($component_tipo, $ar_added_components)) {
								continue;
							}

						// Exclude some non searchable components
							$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
							if(true===in_array($modelo_name, $ar_components_exclude)) continue; // Skip excluded components

						// element object base
							$element = new stdClass();
								$element->section_group_tipo		= $section_group_tipo;
								$element->section_group_model		= $section_group_model;
								$element->section_group_label		= $section_group_label;
								$element->section_tipo				= $section_tipo;
								$element->section_label				= $section_label;
								$element->component_tipo			= $component_tipo;
								$element->component_label			= RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG , true, true);
								$element->path						= $path;
								$element->has_subquery				= false; // Default (changes when component_portal/component_autocomplete)
								$element->target_section			= false; // Default (changes when component_portal/component_autocomplete)
								$element->ar_tipo_exclude_elements	= false; // default (changes when component_portal/component_autocomplete and ar_terminos_relacionados_to_exclude)

						// // Exclude components
						// 	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						// 	if(true===in_array($modelo_name, $ar_components_exclude)) continue; // Skip excluded components

						// Check components with has_subquery
							if ($modelo_name==='component_portal' || $modelo_name==='component_autocomplete') {

								// set has_subquery as true
								$element->has_subquery 	 = true;

								// set target_section
								$element->target_section = common::get_ar_related_by_model('section', $component_tipo);

								$current_target_section  = reset($element->target_section);

								if ($user_id_logged!=DEDALO_SUPERUSER &&
									(!isset($ar_authorized_areas->$current_target_section) || (int)$ar_authorized_areas->$current_target_section<1)) {
									// user don't have access to current section. skip section
									continue;
								}

								// set exclude_elements
								$ar_exclude_elements_tipo = common::get_ar_related_by_model('exclude_elements', $component_tipo);
								if (isset($ar_exclude_elements_tipo[0])) {

									$tipo_exclude_elements = $ar_exclude_elements_tipo[0];

									$ar_terminos_relacionados_to_exclude = RecordObj_dd::get_ar_terminos_relacionados($tipo_exclude_elements, $cache=false, $simple=true);

									foreach ($ar_terminos_relacionados_to_exclude as $key => $exclude_component_tipo) {

										$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($exclude_component_tipo, true);
										if ($modelo_name==='section_group' || $modelo_name==='section_group_div' || $modelo_name==='section_tab') {
											$ar_recursive_childrens = (array)section::get_ar_recursive_childrens($exclude_component_tipo);
											//dump($ar_recursive_childrens,'ar_recursive_childrens');
											$ar_terminos_relacionados_to_exclude = array_merge($ar_terminos_relacionados_to_exclude,$ar_recursive_childrens);
										}
									}//end foreach ($ar_terminos_relacionados_to_exclude as $key => $exclude_component_tipo) {

									// set ar_tipo_exclude_elements
									$element->ar_tipo_exclude_elements = $ar_terminos_relacionados_to_exclude;
								}
							}//end if ($modelo_name==='component_portal' || $modelo_name==='component_autocomplete')

						// Add modelo_name
						$element->modelo_name = $modelo_name;

						// Add element
						$ar_result[] = $element;

						// store as added to avoid duplicates
						$ar_added_components[] = $component_tipo;
					}
			}//end foreach ($ar_section_group_childrens as $component_tipo)

		}
		// dump($ar_result, ' ar_result ++ '.to_string());

		$response->result 	= $ar_result;
		$response->msg 		= 'Ok. Request done.';
		if(SHOW_DEBUG===true) {
			$total_time = exec_time_unit($start_time,'ms');
			$response->msg .= " Total: ".count($ar_result)." in $total_time ms";
		}


		return $response;
	}//end get_components_from_section



	/**
	* REDUCE_AR_SECTION_TIPO
	* @return
	*//*
	public static function reduce_ar_section_tipo( $ar_section_tipo ) {

		$groupped_ar_section_tipo = [];


		foreach ($ar_section_tipo as $key => $current_section_tipo) {



		}


		return $groupped_ar_section_tipo
	}//end reduce_ar_section_tipo */



	/**
	* GET_COMPONENT_PRESETS
	* @return array $component_presets
	*/
	public static function get_component_presets($user_id=null, $target_section_tipo=null, $section_tipo='dd623') {

		#$section_tipo 		 			= 'dd623'; // Presets list dd623 or dd655 (temp)
		$name_component_tipo 			= 'dd624'; // Name field
		$save_arguments_component_tipo 	= 'dd648'; // Save arguments field
		$json_component_tipo 			= 'dd625'; // json data field
		$matrix_table 		 			= 'matrix_list'; //common::get_matrix_table_from_tipo($section_tipo);

		$public_component_tipo 			= 'dd640';
		$default_component_tipo 		= 'dd641';
		$target_section_component_tipo 	= 'dd642';

		$locator_public_true = new locator();
			$locator_public_true->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			$locator_public_true->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			$locator_public_true->set_from_component_tipo($public_component_tipo);

		#$name_component_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($name_component_tipo,true);
		#$json_component_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($json_component_tipo,true);

		$filter = '';
		if (!empty($target_section_tipo) ) {
			$filter .= "AND datos#>'{components,{$target_section_component_tipo},dato,lg-nolan}' @> '[\"".$target_section_tipo."\"]' ";
		}

		if (empty($user_id)) {
			$user_id = navigator::get_user_id();
		}

		# is_global_admin filter
		$is_global_admin = component_security_administrator::is_global_admin( $user_id );
		$is_global_admin = false;
		if ($is_global_admin!==true) {
			$ar_filter   = [];
			# Created by user
			$ar_filter[] = "datos#>'{created_by_userID}' = '". (int)$user_id ."'";
			# Public
			$ar_filter[] = "datos#>'{relations}' @> '[". json_encode($locator_public_true) ."]'" ;

			$filter .= 'AND (' . implode(' OR ',$ar_filter) . ')';
		}

		$select   = 'section_id';
		$select  .= ",datos#>>'{components,{$name_component_tipo},valor_list,lg-nolan}' as name";
		$select  .= ",datos#>>'{components,{$json_component_tipo},dato,lg-nolan}' as json_preset";
		$select  .= ",datos#>>'{relations}' as relations";

		$strQuery 	= "-- ".__METHOD__." \nSELECT $select FROM \"$matrix_table\" WHERE (section_tipo='$section_tipo') $filter ORDER BY section_id ASC ";
		$result		= JSON_RecordObj_matrix::search_free($strQuery);

		$component_presets=array();
		while ($rows = pg_fetch_assoc($result)) {

			$element = new stdClass();
				#$element->section_tipo 	= $target_section_tipo;
				$element->section_id 	= $rows['section_id'];
				$element->name 		 	= $rows['name'];
				$element->json_preset 	= $rows['json_preset'];

				$public  		= false;
				$default 		= false;
				$save_arguments = false;

				$relations 	= json_decode($rows['relations']);

				if (!empty($relations)) {
					# Public to bool
					if (true===locator::in_array_locator($locator_public_true, $relations, ['section_id','section_tipo','from_component_tipo'])) {
						$public = true;
					}
					# Default to bool
					$locator_default_true = clone($locator_public_true);
						$locator_default_true->set_from_component_tipo($default_component_tipo); // Override from_component_tipo
					if (true===locator::in_array_locator($locator_default_true, $relations, ['section_id','section_tipo','from_component_tipo'])) {
						$default = true;
					}
					# Save arguments to bool
					$locator_save_arguments_true = clone($locator_public_true);
						$locator_save_arguments_true->set_from_component_tipo($save_arguments_component_tipo); // Override from_component_tipo
					if (true===locator::in_array_locator($locator_save_arguments_true, $relations, ['section_id','section_tipo','from_component_tipo'])) {
						$save_arguments = true;
					}
				}

				$element->public  		 = $public;
				$element->default 		 = $default;
				$element->save_arguments = $save_arguments;

			# Add element
			$component_presets[] = $element;
		}
		#dump($component_presets, ' component_presets ++ '.to_string($strQuery));


		return (array)$component_presets;
	}//end get_component_presets



	/**
	* GET_PRESET
	* Find requested preset section_id (in presets list or temp presets)
	* @return object | null
	*/
	public static function get_preset($section_tipo, $user_id, $target_section_tipo) {

		$preset_obj = null;

		$matrix_table = 'matrix_list';

		$user_locator = new locator();
			$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
			$user_locator->set_section_id($user_id);
			$user_locator->set_from_component_tipo('dd654');
			$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
		$filter_user = 'datos#>\'{relations}\' @> \'['.json_encode($user_locator).']\'';

		$filter_target_section = 'datos#>\'{components,dd642,dato,lg-nolan}\' = \'["'.$target_section_tipo.'"]\'';

		// Find existing preset
		$strQuery = 'SELECT section_id, datos#>\'{components,dd625,dato,lg-nolan}\' as json_filter FROM '.$matrix_table.' WHERE (section_tipo = \''.$section_tipo.'\') '.PHP_EOL.'AND '.$filter_user.' '.PHP_EOL.'AND '.$filter_target_section.' '.PHP_EOL.'LIMIT 1;';
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		if (!is_resource($result)) {
			trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $strQuery");
			return null;
		}
		while ($rows = pg_fetch_assoc($result)) {
			$section_id  = $rows['section_id'];
			$json_filter = $rows['json_filter'];

			$preset_obj = new stdClass();
				$preset_obj->section_id  = (int)$section_id;
				$preset_obj->json_filter = (string)json_decode($json_filter); // Note that real dato is a STRING json_encoded. Because this, first json_decode returns a STRING instead direct object
			break; // Only one expected
		}
		#debug_log(__METHOD__." preset_id: $preset_id ".PHP_EOL.to_string($strQuery), logger::DEBUG);

		return $preset_obj;
	}//end get_preset



	/**
	* SAVE_TEMP_PRESET
	* Saves current search panel configuration for persistence
	* Saves filter in section list (dd655) a private list for temporal data
	* @return bool
	*/
	public static function save_temp_preset($user_id, $target_section_tipo, $filter_object) {

		$section_tipo 	= DEDALO_TEMP_PRESET_SECTION_TIPO; // 'dd655'; // presets temp
		$matrix_table 	= 'matrix_list';

		// Find existing preset (returns section_id if exists or null if not)
		$preset_obj = search_development2::get_preset($section_tipo, $user_id, $target_section_tipo);
		if (empty($preset_obj)) {
			# Create new section if not exists
			$section 	= section::get_instance(null, $section_tipo);
			$preset_id 	= $section->Save();
		}else{
			#$section 	= section::get_instance($preset_id, $section_tipo);
			$preset_id 	= $preset_obj->section_id;
		}

		$result = [];

		#
		# FILTER. COMPONENT_JSON
			$tipo 			= 'dd625'; // component_json
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $preset_id,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$component->set_dato($filter_object);
			#$component->save_to_database = false;
			$result[] = $component->Save();

		#
		# SECTION_TIPO
			$tipo 			= 'dd642'; // component_input_text
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $preset_id,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$component->set_dato( array($target_section_tipo) );
			#$component->save_to_database = false;
			$result[] = $component->Save();

		#
		# USER
			$tipo 			= 'dd654'; // component_select
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $preset_id,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $section_tipo);
			$user_locator = new locator();
				$user_locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
				$user_locator->set_section_id($user_id);
				$user_locator->set_from_component_tipo($tipo);
				$user_locator->set_type(DEDALO_RELATION_TYPE_LINK);
			$component->set_dato( array($user_locator) );
			#$component->save_to_database = false;
			$result[] = $component->Save();


		# Real save
		#$section->Save();

		return $result;
	}//end save_temp_preset



	/**
	* GET_SEARCH_SELECT_FROM_SECTION
	* Temporal method to obtain search select paths to build a search_json_object
	* @return array $path
	*/
	public static function get_search_select_from_section($section_obj, $layout_map=false) {

		$select = [];

		$section_tipo 	= $section_obj->get_tipo();

		// ar_components_tipo
			if (empty($layout_map)) {
				// we obtain target components from section layout map
					$layout_map 	= component_layout::get_layout_map_from_section( $section_obj );
			}

		$ar_values = reset($layout_map);
		foreach ($ar_values as $current_tipo) {

			$path = new stdClass();
				$path->section_tipo   = $section_tipo;
				$path->component_tipo = $current_tipo;
				$path->modelo 	  	  = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$path->name 	  	  = RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG , true, true);

			$current_element = new stdClass();
				$current_element->path[] = $path;

			$select[] = $current_element;
		}

		return $select;
	}//end get_search_select_from_section



	/**
	* SEARCH_OPTIONS_TITLE
	* @param array $search_operators_info
	*	Array of operator => label like: ... => between
	* @return string $search_options_title
	*/
	public static function search_options_title( array $search_operators_info ) {

		$search_options_title = '';

		if (!empty($search_operators_info)) {
			$search_options_title .= '<b>'.label::get_label('opciones_de_busqueda') . ':</b>';
			foreach ($search_operators_info as $ikey => $ivalue) {
				$search_options_title .= '<div class="search_options_title_item"><span>' . $ikey .'</span><span>'. label::get_label($ivalue).'</span></div>';
			}

			$search_options_title = htmlspecialchars($search_options_title);
		}


		return $search_options_title;
	}//end search_options_title



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
	public static function search_count($request_options) {

		# (!) Hecha para usar en estadísticas actividad pero no implementada todavía ! [2018-12-14]

		$options = new stdClass();
			$options->column_tipo  = null; // string like dd15
			$options->column_path  = null; // string like datos#>>'{components, dd544, dato, lg-nolan }'
			$options->section_tipo = null; // string like oh1

			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$matrix_table = common::get_matrix_table_from_tipo($options->section_tipo);

		$strQuery = '
		SELECT
		'.$options->column_path.' AS '.$options->column_tipo.',
		COUNT ('.$options->column_path.') AS count
		FROM "'.$matrix_table.'"
		WHERE section_tipo = \''.$options->section_tipo.'\'
		GROUP BY '.$options->column_tipo.'
		ORDER BY count
		';

		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		if (!is_resource($result)) {
			trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $strQuery");
			return null;
		}
		$ar_result = [];
		while ($rows = pg_fetch_assoc($result)) {

			$item = new stdClass();
				$item->tipo  = $options->column_tipo;
				$item->count = $rows['count'];

			$ar_result[] = $item;
		}

		return $ar_result;
	}//end search_count




}//end search_development
