<?php
/*
* CLASS SEARCH
*
*
*/
class search_related extends search {



	/**
	* PARSE_SEARCH_QUERY_OBJECT NEW
	* Build full final sql query to send to DDBB
	* @param bool $full_count
	*	default false
	* @return string $sql_query
	*/
	public function parse_search_query_object( $full_count=false ) {

		$ar_tables_to_search = common::get_matrix_tables_with_relations();

		$limit 				= $this->search_query_object->limit;
		$offset 			= $this->search_query_object->offset;

		#debug_log(__METHOD__." ar_tables_to_search: ".json_encode($ar_tables_to_search), logger::DEBUG);

		// reference locator it's the locator of the source section that will be used to get the sections with call to it.
			$locator = reset($this->filter_by_locators);
			$reference_locator = json_encode($locator);


		// add filter of sections when the filter is not 'all', it's possible add specific section to get the related records only for these sections.
		// if the section has all, the filter don't add any section to the WHERE 
			$ar_section_tipo = $this->ar_section_tipo;
			$ar_section_filter = [];
			foreach ($ar_section_tipo as $section_tipo) {
				if ($section_tipo !=='all') {
					$ar_section_filter[] = 'section_tipo = \''.$section_tipo.'\'';
				}
			}
			$section_filter = !empty($ar_section_filter)
				? implode(' AND ', $ar_section_filter)
				: false;

		// each table query
			$ar_query=array();
			foreach ($ar_tables_to_search as $table) {

				$query	 = '';
				$query	.= ($full_count===true)
					? PHP_EOL . 'SELECT COUNT(*)'
					: PHP_EOL . 'SELECT section_tipo, section_id, datos';
				$query	.= PHP_EOL . 'FROM "'.$table.'"';
				$query	.= PHP_EOL . 'WHERE datos#>\'{relations}\' @> \'['.$reference_locator.']\'::jsonb';
				
				if ($section_filter!==false) {
					$query	.= PHP_EOL . ' AND (' . $section_filter .')';
				}

				$ar_query[] = $query;
			}

		// final query union with all tables
			$str_query = implode(' UNION ALL ', $ar_query);
		
		// Set order to maintain results stable
		// count and pagination optionals
			if($full_count === false){
				$str_query .= PHP_EOL . 'ORDER BY section_id ASC, section_tipo';
				if($limit !== false){
					$str_query .= PHP_EOL . 'LIMIT '.$limit;
					if($offset !== false){
						$str_query .= PHP_EOL . 'OFFSET '.$offset;
					}
				}
			}

		$str_query .= ';';

		return $str_query;
	}//end parse_search_query_object



	/**
	* CALCULATE_INVERSE_LOCATORS
	* Now inverse locators is always calculated, not stored !
	* @see section::get_inverse_locators
	* @param object $reference_locator
	*	Basic locator with section_tipo and section_id properties
	* @return array $ar_inverse_locators
	*/
	public static function calculate_inverse_locators_DES( $reference_locator, $limit=false, $offset=false, $count=false ) {
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

			$query	 = '';
			$query	.= ($count===true)
				? PHP_EOL . 'SELECT COUNT(*)'
				: PHP_EOL . 'SELECT section_tipo, section_id, datos#>\'{relations}\' AS relations';
			$query	.= PHP_EOL . 'FROM "'.$table.'"';
			$query	.= PHP_EOL . 'WHERE datos#>\'{relations}\' @> \'['.$compare.']\'::jsonb';

			$ar_query[] = $query;
		}

		$strQuery  = '';
		$strQuery .= implode(' UNION ALL ', $ar_query);
		// Set order to maintain results stable

		if($count === false){
			$strQuery .= PHP_EOL . 'ORDER BY section_id ASC, section_tipo';
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

				$current_section_id		= $rows['section_id'];
				$current_section_tipo	= $rows['section_tipo'];
				$current_relations		= (array)json_decode($rows['relations']);

				foreach ($current_relations as $current_locator) {
					if ( true===locator::compare_locators($reference_locator, $current_locator, $ar_properties) ) {
						// Add some temporal info to current locator for build component later
						$current_locator->from_section_tipo	= $current_section_tipo;
						$current_locator->from_section_id	= $current_section_id;
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



}//end search_development
