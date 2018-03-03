<?php
/*
* CLASS SEARCH_DEVELOPMENT2
*
*
*/
class search_development2 {


	# matrix table relations name
	private static $relations_table = 'relations';

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
	# Is used by speed pagination in largue tables
	protected $allow_sub_select_by_id;

	

	/**
	* __CONSTRUCT
	*/
	public function __construct($search_query_object) {
		# Set up class minimun vars
		$this->set_up($search_query_object);
	}//end __construct



	/**
	* SET_UP
	*/
	public function set_up($search_query_object) {

		$this->search_query_object = $search_query_object ;

		if (!isset($this->search_query_object->section_tipo)) {
			throw new Exception("Error: section_tipo is not defined!", 1);
			
		}

		# Default records limit
		if(!isset($this->search_query_object->limit)) {
			$this->search_query_object->limit = 10;
		}

		# Default records limit
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
			$this->allow_sub_select_by_id = true; // True default
		}else{
			$this->allow_sub_select_by_id = $search_query_object->allow_sub_select_by_id;
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
			#dump($sql_query, ' sql_query ++ '.to_string());
			#debug_log(__METHOD__." sql_query ".to_string($sql_query), logger::DEBUG);

		$result	= JSON_RecordObj_matrix::search_free($sql_query);
		if (!is_resource($result)) {
			trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $sql_query");
			return null;
		}

		# Build a temporal table with array of records found in query
		$ar_records  = array();
		$pg_num_fields = pg_num_fields($result);
		while ($rows = pg_fetch_assoc($result)) {

			$row = new stdClass();
			
			for ($i=0; $i < $pg_num_fields; $i++) { 
				$field_name  = pg_field_name($result, $i);
				$field_value = $rows[$field_name];
				# Add property
				$row->{$field_name} = $field_value;
			}		

			$ar_records[] = $row;
		}
		#dump($ar_records, ' ar_records ++ '.to_string()); exit();
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms'.' ms', logger::DEBUG);

		if ($this->search_query_object->full_count===true) {
			# Exec a count query
			# Converts json search_query_object to sql query string
			$full_count_sql_query = $this->parse_search_query_object( $full_count=true );			
			$full_count_result	  = JSON_RecordObj_matrix::search_free($full_count_sql_query);
			$row_count 	 		  = pg_fetch_assoc($full_count_result);
			$full_count 		  = $row_count['full_count'];
			# Fix full_count value
			$this->search_query_object->full_count = $full_count;
		}

		#
		# RECORDS_DATA BUILD TO OUTPUT
		$records_data = new stdClass();
			#$records_data->search_query_object	= $this->search_query_object;
			$records_data->ar_records = $ar_records;
			if(SHOW_DEVELOPER===true) {
				# Info about required time to exec the search
				$records_data->generated_time['get_records_data'] = round(microtime(1)-$start_time,3);
				# Query to database string
				$records_data->strQuery = $sql_query;
				if (isset($full_count_sql_query)) {				
					$records_data->strQuery .= PHP_EOL . $full_count_sql_query;
				}				
				#$this->search_query_object->generated_time['get_records_data'] = round(microtime(1)-$start_time,3);
			}			
			#dump($records_data, '$records_data', array());

		return $records_data;
	}//end search



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
				$this->search_query_object->filter = $new_search_query_object_filter;
					#dump( json_encode($this->search_query_object, JSON_PRETTY_PRINT), ' json_encode(value) ++ '.to_string());
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
		if ($component_tipo==='section_id') {
			return $select_object; // No parse section_id
		}
		$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);				
		$select_object 		= $modelo_name::get_select_query2($select_object);								

		return $select_object;
	}//end component_parser_select



	/**
	* CONFORM_SEARCH_QUERY_OBJECT
	* Call to components to conform final search_query_object, adding specific component path, search opertors etc.
	* Recursive
	* @return array $new_ar_query_object
	*/
	public static function conform_search_query_object($op, $ar_value) {
		
		$new_ar_query_object = new stdClass();
			$new_ar_query_object->$op = [];
	
		foreach ($ar_value as $search_object) {
			if (!is_object($search_object)) {
				debug_log(__METHOD__." Invalid (ignored) non object search_object: ".to_string($search_object), logger::DEBUG);
				debug_log(__METHOD__." ar_value: ".json_encode($ar_value), logger::DEBUG);
				throw new Exception("Error Processing Request", 1);
				
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
	* PARSE_SEARCH_QUERY_OBJECT
	* @return 
	*/
	public function parse_search_query_object( $full_count=false ) {
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
		}
		
		# Search elements. Order is important
		$main_from_sql  	= $this->build_main_from_sql();
		$main_where_sql 	= $this->build_main_where_sql();
		$sql_query_order 	= $this->build_sql_query_order();
		$sql_query_select 	= $this->build_sql_query_select($full_count);		
		$sql_filter 		= $this->build_sql_filter();
		$sql_projects_filter= $this->build_sql_projects_filter();		
		$sql_joins 			= $this->get_sql_joins();
		$sql_limit 			= $this->search_query_object->limit;
		$sql_offset 		= $this->search_query_object->offset;

	
		# sql_query
		$sql_query  = '';

		switch (true) {

			case ($full_count===true):
				# Only for count

				# SELECT
					$sql_query .= 'SELECT '   . $sql_query_select;
				# FROM
					$sql_query .= "\nFROM "   . $main_from_sql;
					# join virtual tables
					$sql_query .= $sql_joins;
				# WHERE
					$sql_query .= "\nWHERE "  . $main_where_sql;
					if (!empty($sql_filter)) {
						$sql_query .= $sql_filter;
					}
					if (!empty($sql_projects_filter)) {
						$sql_query .= $sql_projects_filter;
					}
				break;

			case (empty($this->search_query_object->order)):
				# Search Without order

				# SELECT
					$sql_query .= 'SELECT '   . $sql_query_select;
				# FROM
					$sql_query .= "\nFROM "   . $main_from_sql;
					# ADD FOR SPEED OFFSET // WHERE nu4.section_id in (SELECT nu4.section_id FROM matrix AS nu4
					if($this->allow_sub_select_by_id!==false) $sql_query .= "\nWHERE ".$this->main_section_tipo_alias.".id in (SELECT ".$this->main_section_tipo_alias.".id FROM ".$main_from_sql; // ++
					# join virtual tables
					$sql_query .= $sql_joins;
				# WHERE
					$sql_query .= "\nWHERE "  . $main_where_sql;					
					if (!empty($sql_filter)) {
						$sql_query .= $sql_filter;
					}
					if (!empty($sql_projects_filter)) {
						$sql_query .= $sql_projects_filter;
					}
				# ORDER (default for maintain result consistency)					
					$sql_query .= "\nORDER BY " . $this->build_sql_query_order_defult();

				# LIMIT
				if ($this->search_query_object->limit>0) {
					$sql_query .= "\nLIMIT " . $sql_limit;
				}
				# OFFSET
				if ($this->search_query_object->offset>0) {
					$sql_query .= " OFFSET " . $sql_offset;
				}
				# ADD FOR SPEED OFFSET
					if($this->allow_sub_select_by_id!==false)	$sql_query .= "\n) ORDER BY " . $this->build_sql_query_order_defult(); // ++
				break;

			default:
				# Search With order
			
				$query_inside = '';
				# SELECT
					$query_inside .= 'SELECT '   . $sql_query_select;
				# FROM
					$query_inside .= "\nFROM "   . $main_from_sql;
					# ADD FOR SPEED OFFSET // WHERE nu4.section_id in (SELECT nu4.section_id FROM matrix AS nu4
					#$query_inside .= "\n WHERE ".$this->main_section_tipo_alias.".section_id in (SELECT ".$this->main_section_tipo_alias.".section_id FROM ".$main_from_sql; // ++
					# join virtual tables
					$query_inside .= $sql_joins;
				# WHERE
					$query_inside .= "\nWHERE "  . $main_where_sql;
					if (!empty($sql_filter)) {
						$query_inside .= $sql_filter;
					}
					if (!empty($sql_projects_filter)) {
						$query_inside .= $sql_projects_filter;
					}
				# ORDER (default for maintain result consistency)					
					$query_inside .= "\nORDER BY " . $this->build_sql_query_order_defult();
					# ADD FOR SPEED OFFSET
					#$query_inside .= "\n) ORDER BY " . $this->build_sql_query_order(); // ++

				# Query wrap
				$sql_query .= 'SELECT * FROM (';
				$sql_query .= PHP_EOL . $query_inside. PHP_EOL;
				$sql_query .= ') main_select';
				# ORDER					
					$sql_query .= "\nORDER BY " . $sql_query_order;
				# LIMIT
				if ($this->search_query_object->limit>0) {
					$sql_query .= "\nLIMIT " . $sql_limit;
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
		#debug_log(__METHOD__." total time ".exec_time_unit($start_time,'ms').' ms', logger::DEBUG);
		
		return $sql_query;
	}//end parse_search_query_object



	/**
	* BUILD_SQL_PROJECTS_FILTER
	* Create the sql code for filter records by user projects
	* @return string $sql_projects_filter
	*/
	public function build_sql_projects_filter() {
		
		$sql_projects_filter = '';

		$section_tipo 	 = $this->search_query_object->section_tipo;
		$section_alias 	 = $this->main_section_tipo_alias;
		$datos_container = ($this->matrix_table==='matrix_time_machine') ? 'dato' : 'datos';
	
		# Logged user id
		$user_id = (int)navigator::get_user_id();
		$is_global_admin = (bool)component_security_administrator::is_global_admin($user_id);
		if ($is_global_admin!==true) {

			$sql_filter = '';		

			switch (true) {
				##### PROFILES ########################################################
				case ($section_tipo===DEDALO_SECTION_PROFILES_TIPO) :
					if(SHOW_DEBUG===true) {
						$sql_filter .= "\n-- filter_profiles (no filter is used here) -- \n";
					}					
					break;
				##### PROJECTS ########################################################
				case ($section_tipo===DEDALO_SECTION_PROJECTS_TIPO) :
					if(SHOW_DEBUG===true) {
						$sql_filter .= "\n-- filter_user_created -- ";
					}
					$sql_filter .= PHP_EOL . 'AND (' . PHP_EOL;
					$sql_filter .= $section_alias.'.'.$datos_container.' @>\'{"created_by_userID":'.$user_id.'}\'::jsonb' .PHP_EOL;

					# Current user authorized areas
					$component_filter_master = component_common::get_instance('component_filter_master', DEDALO_FILTER_MASTER_TIPO, $user_id, 'list', DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
					$filter_master_dato 	 = (array)$component_filter_master->get_dato();

					if (!empty($filter_master_dato)) {
						$ar_values 			= array_keys($filter_master_dato);
						$ar_values_string 	= implode(',', $ar_values);
						$sql_filter .= ' OR '.$section_alias.'.section_id IN ('.$ar_values_string.')';
					}
					$sql_filter .= PHP_EOL . ')';
					break;
				##### USERS ###########################################################
				case ($section_tipo===DEDALO_SECTION_USERS_TIPO) :

					# AREAS FILTER
					if(SHOW_DEBUG===true) {
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
					$sql_filter .= PHP_EOL . 'AND '.$section_alias.'.'.$datos_container.'#>\'{components,'.DEDALO_FILTER_MASTER_TIPO.',dato,'.DEDALO_DATA_NOLAN.'}\' ?| array['.$ar_values_string.']';
					$sql_filter .= ')';					
					break;
				##### DEFAULT #########################################################
				default:
					if(SHOW_DEBUG===true) {
						$sql_filter .= "\n-- filter_by_projects --";
					}					
					$sql_filter .= PHP_EOL . 'AND ';
					# SECTION FILTER TIPO : Actual component_filter de esta sección
					// params: $section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false
					$section_real_tipo = section::get_section_real_tipo_static( $section_tipo );
					$ar_component_filter = section::get_ar_children_tipo_by_modelo_name_in_section($section_real_tipo, array('component_filter'), true, false, true, false);
					if (empty($ar_component_filter[0])) {						
						$section_name = RecordObj_dd::get_termino_by_tipo($section_real_tipo);
						throw new Exception("Error Processing Request. Filter not found is this section ($section_real_tipo) $section_name", 1);						
					}else{
						$component_filter_tipo = $ar_component_filter[0];
					}

					$projects 		= (array)filter::get_user_projects($user_id);
					$ar_id_project 	= (array)array_keys( (array)$projects );
					if (empty($ar_id_project)) {
						$sql_filter .= PHP_EOL . $section_alias.'.'.$datos_container.'#>>\'{components,'.$component_filter_tipo.',dato,'.DEDALO_DATA_NOLAN.'}\' = \'VALOR_IMPOSIBLE (User without projects)\' ';
					}else{
						$sql_filter .= '(';
						$ar_values_string='';
						$last_item = end($ar_id_project);
						foreach ($ar_id_project as $id_matrix_project){
							$ar_values_string .= "'{$id_matrix_project}'";
							if ($id_matrix_project !== $last_item) $ar_values_string .= ',';
						}
						$sql_filter .= PHP_EOL . $section_alias.'.'.$datos_container.'#>\'{components,'.$component_filter_tipo.',dato,'.DEDALO_DATA_NOLAN.'}\' ?| array['.$ar_values_string.'] OR ';
						$sql_filter .= PHP_EOL . '('.$section_alias.'.'.$datos_container.' @>\'{"created_by_userID":'.$user_id.'}\'::jsonb AND (';
						$sql_filter .= $section_alias.'.'.$datos_container.'#>\'{components,'.$component_filter_tipo.',dato,'.DEDALO_DATA_NOLAN.'}\' IS NULL OR ';
						$sql_filter .= $section_alias.'.'.$datos_container.'#>>\'{components,'.$component_filter_tipo.',dato,'.DEDALO_DATA_NOLAN.'}\'=\'{}\'))';
						$sql_filter .= PHP_EOL . ')';
					}
					break;
			}
		
			if (!empty( $sql_filter)) {
				$sql_projects_filter = $sql_filter;
			}			

		}//endif ($is_global_admin!==true) {


		return $sql_projects_filter;
	}//end build_sql_projects_filter



	/**
	* BUILD_SQL_QUERY_ORDER_DEFULT
	* @return string $sql_query_order_defult
	*/
	public function build_sql_query_order_defult() {

		$section_tipo = $this->search_query_object->section_tipo;

		$default_order = ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) ? 'DESC' : 'ASC';
		
		return $this->main_section_tipo_alias.'.section_id '.$default_order;
	}//end build_sql_query_order_defult



	/**
	* BUILD_SQL_QUERY_ORDER
	* @return string $sql_query_order
	*/
	public function build_sql_query_order() {
		
		$sql_query_order = '';
		$ar_order 		 = [];

		#$sql_query_order = 'numisdata151 ASC' ;
	
		if (!empty($this->search_query_object->order)) {

			foreach ($this->search_query_object->order as $order_obj) {
	
				$direction 		= strtoupper($order_obj->direction);
				$path 	   		= $order_obj->path;	
				$end_path  		= end($path);
				$component_tipo = $end_path->component_tipo;
				

				if ($component_tipo==='section_id') {
					# section_id column case
					$line = 'section_id ' . $direction;

				}else{

					# Add join if not exists
					$this->build_sql_join($path);					

					$table_alias= self::get_table_alias_from_path($path);
					$selector 	= implode(',', $order_obj->component_path);
					$alias 		= $component_tipo . '_order';
					$column 	= $table_alias . '.datos#>>\'{'.$selector.'}\' as '.$alias;

					# Add to global order columns (necessary for order...)
					# This array is added when query select is calculated
					$this->order_columns[] = $column;

					$line = $alias . ' ' . $direction;
					debug_log(__METHOD__." line ".to_string($line), logger::DEBUG);		
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

		$section_tipo  = $this->search_query_object->section_tipo;
		#if(!empty($this->search_query_object->forced_matrix_table)) {
		#	$matrix_table  = $this->search_query_object->forced_matrix_table; # Not calculated, like matrix_time_machine
		#}else{
			$matrix_table  = common::get_matrix_table_from_tipo($section_tipo);
		#}	
		$main_from_sql = $matrix_table .' AS '. self::trim_tipo($section_tipo);

		# Fix 
		$this->matrix_table  = $matrix_table;
		$this->main_from_sql = $main_from_sql;

		return $main_from_sql;
	}//end build_main_from_sql



	/**
	* BUILD_MAIN_WHERE_SQL
	* @return string $main_where_sql
	*/
	public function build_main_where_sql() {

		$section_tipo   		 = $this->search_query_object->section_tipo;
		$main_section_tipo_alias = self::trim_tipo($section_tipo);
		
		$main_where_sql  = '';
		$main_where_sql .= '(';
		$main_where_sql .= $main_section_tipo_alias.'.section_tipo=\''. $section_tipo.'\'';
		if ($section_tipo===DEDALO_SECTION_USERS_TIPO) {
			$main_where_sql .= ' AND '.$main_section_tipo_alias.'.section_id>0';
		}
		$main_where_sql .= ')';
		

		# Fix values
		$this->main_section_tipo_alias  = $main_section_tipo_alias;
		$this->main_where_sql 			= $main_where_sql;

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
				$filter_query .= ' AND (';
				$filter_query .= $this->filter_parser($operator, $ar_value);
				$filter_query .= ')';	
			}			
		}		

		return $filter_query;
	}//end build_sql_filter
	


	/**
	* FILTER_PARSER
	* @return 
	*/
	public function filter_parser($op, $ar_value) {

		$string_query = '';

		$total = count($ar_value);
			#dump($total, ' total 1 ++ '.to_string());
		$operator = strtoupper( substr($op, 1) );

		foreach ($ar_value as $key => $search_object) {			
			#if (self::is_search_operator($search_object)===true) {
			if (!property_exists($search_object,'path')) {
				# Case operator

				$op2 		= key($search_object);
				$ar_value2 	= $search_object->$op2;

				$operator2 = strtoupper( substr($op2, 1) );
				#if ($key > 1) {
				#	$string_query .= ' '.$operator2.'** ';
				#}
				$string_query .= ' (';
				$string_query .= $this->filter_parser($op2, $ar_value2);
				$string_query .= ' )';

				if ($key+1 < $total) {
					$string_query .= ' '.$operator.' ';
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
	* BUILD_SQL_QUERY_SELECT
	* @return string $sql_query_select
	*/
	public function build_sql_query_select($full_count=false) {

		if ($full_count===true) {
			return $this->build_full_count_sql_query_select();
		}

		$search_query_object = $this->search_query_object;

		#dump($search_query_object->select, ' search_query_object->select ++ '.to_string());
		$ar_sql_select = [];
		$ar_key_path   = [];
		
		$ar_sql_select[] = 'DISTINCT ON ('.$this->main_section_tipo_alias.'.section_id) '.$this->main_section_tipo_alias.'.section_id';

		$ar_sql_select[] = $this->main_section_tipo_alias.'.section_tipo';
		#$ar_sql_select[] = "oh1_oh24_rsc197_rsc85.datos#>>'{components,rsc85,dato}' ";
		
		foreach ($search_query_object->select as $key => $select_object) {

			$path 				 = $select_object->path;
			$table_alias 		 = self::get_table_alias_from_path($path);
			$last_item 		 	 = end($path);
			$component_tipo 	 = $last_item->component_tipo;
			$column_alias 		 = $component_tipo;
			$modelo_name 		 = $last_item->modelo;
			$select_object_type  = isset($select_object->type) ? $select_object->type : 'string';
			$component_path 	 = implode(',', $select_object->component_path);
			if ($this->search_query_object->section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
				# In activity section, data container is allways 'dato'
				$component_path  = str_replace('valor_list', 'dato', $component_path);
			}
			#>>\'{components,'.$component_tipo.',valor_list,'.$select_object->lang.'}\' as '.$column_alias;

			$sql_select 	 = '';
	
			if ($modelo_name==='component_section_id') {
				
				$sql_select .= $table_alias.'.section_id';
				$sql_select .= ' as '.$column_alias;

			}else{

				if ($component_path==='relations') {
					
					$sql_select .= '\'\'';
				
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

				$sql_select .= ' as '.$column_alias;
			}

			# Add line
			$ar_sql_select[] = $sql_select;

			#if ($n_levels>1) {
			#	$this->join_group[] = $this->build_sql_join($select_object->path);
			#}

			$this->join_group[] = $this->build_sql_join($select_object->path);
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
	public function build_sql_join($path) {

		$rel_table   		= self::$relations_table;
		$ar_key_join 		= [];
		$base_key 			= '';
		$total_paths 		= count($path);

		foreach ($path as $key => $step_object) {
			
			if ($key===0) {
				$base_key 		= self::trim_tipo($step_object->section_tipo);
				$ar_key_join[] 	= self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
				continue;
			}

			if ($key===1) {
				$current_key = $base_key;
			}else{
				$current_key = implode('_', $ar_key_join);
			}
			#dump($current_key, ' current_key ++ '.to_string($key));

			if($key === $total_paths-1) {
				$ar_key_join[] 	= self::trim_tipo($step_object->section_tipo);
			}else{
				$ar_key_join[]	= self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
			}
			
			$matrix_table		= common::get_matrix_table_from_tipo($step_object->section_tipo);
			$last_section_tipo 	= $step_object->section_tipo;
			$t_name 			= implode('_', $ar_key_join);
			$t_name2 			= self::get_table_alias_from_path($path); // Test !!
			#debug_log(__METHOD__." t_name  ".to_string($t_name), logger::DEBUG);
			#debug_log(__METHOD__." t_name2 ".to_string($t_name2), logger::DEBUG);
			$t_relation			= 'r_'.$t_name ;

			if (!isset($this->ar_sql_joins[$t_name])) {

				$sql_join  = "\n";
				if(SHOW_DEBUG===true) {
					$section_name = RecordObj_dd::get_termino_by_tipo($step_object->section_tipo, null, true, false);
					$sql_join  .= "-- JOIN GROUP $matrix_table - $t_name - $section_name\n";
				}
				$sql_join .= ' LEFT JOIN '.$rel_table.' AS '.$t_relation.' ON ('. $current_key.'.section_tipo=' . $t_relation.'.section_tipo AND '.$t_relation.'.target_section_tipo=\''.$last_section_tipo.'\' AND '. $current_key. '.section_id='. $t_relation.'.section_id) '."\n";
				$sql_join .= ' LEFT JOIN '.$matrix_table.' AS '.$t_name .' ON ('. $t_relation.'.target_section_id='.$t_name.'.section_id AND '.$t_relation.'.target_section_tipo='.$t_name.'.section_tipo)';
				
				// Add to joins
				$this->ar_sql_joins[$t_name] = $sql_join;
			}
		}
		#$key_group = implode('_', $ar_key_join);
		#dump($this->ar_sql_joins, '$this->ar_sql_joins ++ '.to_string());
		
		return true;
	}//end build_sql_join



	/**
	* TRIM_TIPO
	* @return string $trimmed_tipo
	*/
	public static function trim_tipo($tipo, $max=2) {
		
		preg_match("/^([a-z]+)([0-9]+)$/", $tipo, $matches);

		$name 	= $matches[1];
		$number = $matches[2];

		$trimmed_tipo = substr($name, 0, $max) . $number;

		return $trimmed_tipo;
	}//end trim_tipo



	/**
	* GET_SQL_WHERE
	* @return 
	*/
	public function get_sql_where($search_object) {
		#dump($search_object, ' search_object ++ '.to_string());
		//oh1_oh24_rsc197_rsc86.datos#>'{relations}' @> '[{"section_id":"2","section_tipo":"dd861","from_component_tipo":"rsc93"}]'::jsonb
		//unaccent(oh1_oh24_rsc197_rsc453.datos#>>'{components, rsc85, dato}') ~* unaccent('.*\[".*ana.*')

			/* 
			{
			  "q": "'.*\[".*ana.*'",						// the regext, text, number, etc that the component created
			  "unaccent":true,								// true or false
			  "operator":"~*",								// the operator for query
			  "type": "string",								// string or jsonb
			  "lang": "lg-nolan",							// if not defined lang = all langs, if defined lang = the lang sended
			  "path": [										// path for locate the component into the joins
			    {
			      "section_tipo": "oh1",
			      "component_tipo": "oh24"
			    },
			    {
			      "section_tipo": "rsc197",
			      "component_tipo": "rsc453"
			    }
			  ],
			  "component_path": [							// the component path to find the dato or valor...
			    "components",
			    "rsc85",
			    "dato"
			  ]
			}
          	*/
			/*
				SELECT columns_that_define_duplicates
						, count(*)
				FROM your_sql_table
				GROUP BY columns_that_define_duplicates
				HAVING count(*) > 1;
			*/
		#dump($search_object, ' search_object ++ '.to_string());
		
		$path					= $search_object->path;
		$table_alias 			= self::get_table_alias_from_path($path);
		
		if ($search_object->lang!=='all') {
			$search_object->component_path[] = $search_object->lang;
		}
		$component_path 		= implode(',', $search_object->component_path);

		# search_object_type : string, array
		$search_object_type 	= isset($search_object->type) ? $search_object->type : 'string';

		# search_object_format : direct, array, array_elements
		$search_object_format 	= isset($search_object->format) ? $search_object->format : 'direct';

		# search_object_unaccent: true, false
		$search_object_unaccent = isset($search_object->unaccent) ? $search_object->unaccent : false;


		$sql_where  = "\n";

		switch ($search_object_format) {

			case 'direct':

				if(SHOW_DEBUG===true) {
					$component_path_data 	= end($path);
					$component_tipo 		= $component_path_data->component_tipo;
					$component_name 		= $component_path_data->name;	//RecordObj_dd::get_termino_by_tipo($component_tipo, null, true, false);
					$modelo_name 			= $component_path_data->modelo; //RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$sql_where .= "-- DIRECT FORMAT $component_name - $table_alias - $component_path - ".strtoupper($modelo_name)."\n";
				}

				if($search_object_unaccent===true) {
					$sql_where .= 'unaccent(';
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
				$sql_where .= ' '.$search_object->operator.' ';

				if($search_object_unaccent===true) {
					$sql_where .= 'unaccent(';
				}

				# q
				$sql_where .= $search_object->q_parsed;
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
					#dump($search_object, ' search_object ++ '.to_string());
				if(SHOW_DEBUG===true) {
					$object_info = isset($search_object->q_info) ? $search_object->q_info : '';
					$sql_where .= "-- ARRAY ELEMENTS FORMAT $table_alias $component_tipo info:$object_info \n";
				}

				$sql_where .= $table_alias . '.id IN (SELECT '.$table_alias.'.id FROM '.PHP_EOL;
				$sql_where .= "check_array_component((jsonb_typeof($table_alias.datos#>'{components,$component_tipo,dato,lg-nolan}')='array' AND $table_alias.datos#>'{components,$component_tipo,dato,lg-nolan}'!='[]'),($table_alias.datos#>'{components,$component_tipo,dato,lg-nolan}')) ".PHP_EOL;
				$sql_where .= 'as '.$component_tipo.'_array_elements'.PHP_EOL;
				$sql_where .= 'WHERE'.PHP_EOL;
				$sql_where .= self::resolve_array_elements( $search_object->array_elements, $component_tipo );
				$sql_where .= PHP_EOL.') -- end check_array_component'.PHP_EOL;				
				break;

			case 'column':
				if(SHOW_DEBUG===true) {
					$component_path_data 	= end($path);
					$component_tipo 		= $component_path_data->component_tipo;
					$component_name 		= $component_path_data->name;	//RecordObj_dd::get_termino_by_tipo($component_tipo, null, true, false);
					$modelo_name 			= $component_path_data->modelo; //RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$sql_where .= "-- COLUMN FORMAT $component_name - $table_alias - $component_path - ".strtoupper($modelo_name)."\n";
				}				
					
				$sql_where .= $table_alias . '.'.$component_path;				

				# operator
				$sql_where .= ' '.$search_object->operator.' ';

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
		
		foreach ($array_elements as $current_operator => $group_elements) {
			#dump($group_elements, ' $group_elements ++ '.to_string($current_operator)); die();
			
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
			$sql_where .= '('. implode(' '.strtoupper(substr($current_operator, 1)).' ', $group_query) . ') ';

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
	public static function get_table_alias_from_path($path) {

		$total	= count($path);
		$ar_key = [];
		foreach ($path as $key => $step_object) {

			if ($total===1 || ($key===$total -1) ) {
				$ar_key[] = self::trim_tipo($step_object->section_tipo);
			}else{
				$ar_key[] = self::trim_tipo($step_object->section_tipo) .'_'. self::trim_tipo($step_object->component_tipo);
			}

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
	public static function get_query_path($tipo, $section_tipo, $resolve_related=true) {

		$path = [];			
		
		$term_model = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		# Add first level always
		$current_path = new stdClass();
			
			$current_path->name 	  	  = RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true, false);
			$current_path->modelo 	  	  = $term_model;			
			$current_path->section_tipo   = $section_tipo;
			$current_path->component_tipo = $tipo;			

		# Add direct level to array path
		$path[] = $current_path;

		if ($resolve_related===true) {
			$ar_related_components 	= component_common::get_ar_components_with_references();
			if(in_array($term_model, $ar_related_components)===true) {

				$ar_terminos_relacionados 	= RecordObj_dd::get_ar_terminos_relacionados($tipo,true,true);
				$ar_related_section			= common::get_ar_related_by_model('section', $tipo);
				$related_section_tipo 		= reset($ar_related_section);			

				foreach ($ar_terminos_relacionados as $key => $current_tipo) {
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
	public static function calculate_inverse_locators( $reference_locator ) {
		#debug_log(__METHOD__." locator received:  ".to_string($reference_locator), logger::DEBUG);
		$ar_tables_to_search = common::get_matrix_tables_with_relations();

		# compare
			$compare = json_encode($reference_locator);

		$ar_query=array();
		foreach ($ar_tables_to_search as $table) {

			$query   = '';
			$query  .= PHP_EOL . 'SELECT section_tipo, section_id, datos#>\'{relations}\' AS relations';
			$query  .= PHP_EOL . 'FROM "'.$table.'"';
			$query  .= PHP_EOL . 'WHERE datos#>\'{relations}\' @> \'['.$compare.']\'::jsonb';
			
			$ar_query[] = $query;
		}

		$strQuery  = '';
		$strQuery .= implode(' UNION ALL ', $ar_query);
		// Set order to maintain results stable
		$strQuery .= PHP_EOL . 'ORDER BY section_id ASC;';		

		if(SHOW_DEBUG===true) {
			#debug_log(__METHOD__." strQuery ".to_string($strQuery), logger::DEBUG);
		}		

		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		if (!is_resource($result)) {
			trigger_error("Error Processing Request : Sorry cannot execute non resource query: ".PHP_EOL."<hr> $strQuery");
			return null;
		}

		# Note that row relations contains all relations and not only searched because we need
		# filter relations array for each records to get only desired coincidences

		// Compare all properties of received locator in each relations locator
		$ar_properties = array();
		foreach ($reference_locator as $key => $value) {
			$ar_properties[] = $key;
		}

		$ar_inverse_locators = array();
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
			$sql_query .= PHP_EOL . 'WHERE "target_section_id"=' . $target_section_id .' AND "target_section_tipo"=\''. $target_section_tipo.'\'';			
			# LIMIT
			$sql_query .= PHP_EOL . 'LIMIT 1';
			# END
			$sql_query .= ';';

			debug_log(__METHOD__." sql_query ".to_string($sql_query), logger::DEBUG);

		$result		= JSON_RecordObj_matrix::search_free($sql_query);
		$num_rows 	= pg_num_rows($result);

		if ($num_rows>0) {
			$have_inverse_relations = true;
		}

		# Store for runtime cache
		$have_inverse_relations_resolved[$section_tipo.'_'.$section_id] = $have_inverse_relations;

		return (bool)$have_inverse_relations;
	}//end have_inverse_relations



	############################ SEARCH2 #################################



	/**
	* GET_COMPONENTS_FROM_SECTION
	* Used to build search presets
	* @return object $reponse
	*/
	public static function get_components_from_section($section_tipo, $path=[], $ar_tipo_exclude_elements=false) {
	
		$start_time=microtime(1);
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed';

		$ar_result = [];

		$ar_components_exclude = ['component_password','component_filter_records','component_image','component_av','component_security_administrator'];

		$section_label 	  = RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG , true, true);

		$ar_children 	  = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements);
		$ar_section_group = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['section_group','section_group_div','section_tab'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true, $ar_tipo_exclude_elements);
	
		foreach ($ar_section_group as $section_group_tipo) {

			$section_group_label 		= RecordObj_dd::get_termino_by_tipo($section_group_tipo, DEDALO_DATA_LANG , true, true);
			$ar_section_group_childrens = RecordObj_dd::get_ar_childrens($section_group_tipo, $order_by='norden');
	
			foreach ($ar_section_group_childrens as $component_tipo) {
				
				if (!in_array($component_tipo, $ar_children)) {
					continue;
				}

				$has_subquery   = false;
				$target_section = false;

				$element = new stdClass();
					$element->section_group_tipo  		= $section_group_tipo;
					$element->section_group_label  		= $section_group_label;
					$element->section_tipo  			= $section_tipo;
					$element->section_label  			= $section_label;
					$element->component_tipo  			= $component_tipo;					
					$element->component_label 			= RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG , true, true);
					$element->path  					= $path;
					$element->has_subquery  			= false; // Default (changes when component_portal/component_autocomplete)
					$element->target_section  			= false; // Default (changes when component_portal/component_autocomplete)
					$element->ar_tipo_exclude_elements 	= false; // default (changes when component_portal/component_autocomplete and ar_terminos_relacionados_to_exclude)
				
				# Check components with has_subquery
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				if(true===in_array($modelo_name, $ar_components_exclude)) continue; // Skip excluded components
				if ($modelo_name==='component_portal' || $modelo_name==='component_autocomplete') {
					
					// set has_subquery as true
					$element->has_subquery 	 = true;

					// set target_section
					$element->target_section = common::get_ar_related_by_model('section', $component_tipo);

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
			}
		}//end foreach ($ar_section_group_childrens as $component_tipo)

		
		$response->result 	= $ar_result;
		$response->msg 		= 'Ok. Request done.';
		if(SHOW_DEBUG===true) {
			$total_time = exec_time_unit($start_time,'ms');
			$response->msg .= " Total: ".count($ar_result)." in $total_time ms";			
		}


		return $response;
	}//end get_components_from_section



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
	public static function get_search_select_from_section($section_obj) {

		$select = [];
		
		// For now, we obtain target components from section layout map
		$layout_map 	= component_layout::get_layout_map_from_section( $section_obj );
		$section_tipo 	= $section_obj->get_tipo();
		$ar_values  = reset($layout_map);
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



}//end search_development