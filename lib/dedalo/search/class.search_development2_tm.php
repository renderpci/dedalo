<?php
/*
* CLASS SEARCH_DEVELOPMENT2
*
*
*/
class search_development2_tm extends search_development2 {


	# matrix_table (fixed on get main select)
	protected $matrix_table = 'matrix_time_machine';
	


	/**
	* BUILD_MAIN_FROM_SQL
	* @return string $main_from_sql
	*/
	public function build_main_from_sql() {
		$section_tipo  = $this->search_query_object->section_tipo;	
		
		// matrix_time_machine specific	
		$matrix_table  = $this->matrix_table;
		
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
		
		// matrix_time_machine specific
		$main_where_sql = '('.$main_section_tipo_alias.'.tipo = \''. $section_tipo.'\')';		
		

		# Fix values
		$this->main_section_tipo_alias  = $main_section_tipo_alias;
		$this->main_where_sql 			= $main_where_sql;

		return $main_where_sql;
	}//end build_main_where_sql
	


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

		// matrix_time_machine specific
		$ar_sql_select[] = $this->main_section_tipo_alias.'.section_id, id';			

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
			#>>\'{components,'.$component_tipo.',valor_list,'.$select_object->lang.'}\' as '.$column_alias;

			$sql_select 	 = '';
	
			if ($modelo_name==='component_section_id') {
				
				$sql_select .= $table_alias.'.section_id';
				$sql_select .= ' as '.$column_alias;

			}else{

				// matrix_time_machine specific
				$sql_select 	.= $table_alias.'.dato';
								

				if($select_object_type==='string') {
					$sql_select .= '#>>';
				}else{
					$sql_select .= '#>';
				}
				$sql_select .= '\'{';
					$sql_select .= $component_path;
				$sql_select .= '}\'';

				$sql_select .= ' as '.$column_alias;
			}

			# Add line
			$ar_sql_select[]= $sql_select;

			#if ($n_levels>1) {
			#	$this->join_group[] = $this->build_sql_join($select_object->path);
			#}

			$this->join_group[] = $this->build_sql_join($select_object->path);
		}
		

		$sql_query_select = implode(','.PHP_EOL, $ar_sql_select);

		return $sql_query_select;
	}//end build_sql_query_select
	


	/**
	* BUILD_full_count_SQL_QUERY_SELECT
	* @return string $sql_query_select
	*/
	public function build_full_count_sql_query_select() {

		// matrix_time_machine specific
		$sql_query_select = 'count('.$this->main_section_tipo_alias.'.section_id) as full_count';

		return $sql_query_select;
	}//end build_full_count_sql_query_select



	/**
	* GET_TIME_MACHINE_RECORDS
	* @return 
	*//*
	public function get_time_machine_records( $request_options ) {
		
		$options = new stdClass();
			$options->section_tipo  = null;
			$options->ar_section_id = [];
			$options->ar_columns 	= [];
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$ar_filter = [];
		foreach ($options->ar_section_id as $section_id) {
			$ar_filter[] = 'section_id=' . (int)$section_id;
		}

		$sql = '
		SELECT section_id, section_tipo, '.implode(',',$options->ar_columns).'
		FROM matrix_time_machine
		WHERE (section_tipo = \''.$options->section_tipo.'\') AND  ('.implode(' OR ',$ar_filter).')
		ORDER BY id DESC
		LIMIT 10; 
		';

	}//end get_time_machine_records */



}//end search_development