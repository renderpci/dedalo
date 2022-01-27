<?php
/*
* CLASS SEARCH_RELATED
* Specific search related methods overwrite search methods
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

		$limit	= $this->search_query_object->limit;
		$offset	= $this->search_query_object->offset;

		#debug_log(__METHOD__." ar_tables_to_search: ".json_encode($ar_tables_to_search), logger::DEBUG);

		// reference locator it's the locator of the source section that will be used to get the sections with call to it.
			$ar_locators = $this->filter_by_locators;


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
					? PHP_EOL . 'SELECT COUNT(*) as full_count'
					: PHP_EOL . 'SELECT section_tipo, section_id, datos';
				$query	.= PHP_EOL . 'FROM "'.$table.'"';
				$query	.= PHP_EOL . 'WHERE ';

				$locators_query = [];
				foreach ($ar_locators as $locator) {
					$locators_query[]	= PHP_EOL.'datos#>\'{relations}\' @> \'['. json_encode($locator) . ']\'::jsonb';
				}
				$query	.= '(' . implode(' OR ', $locators_query) . ')';

				if ($section_filter!==false) {
					$query	.= PHP_EOL . ' AND (' . $section_filter .')';
				}

				$ar_query[] = $query;
			}

		// final query union with all tables
			$str_query = implode(PHP_EOL .' UNION ALL ', $ar_query);

		// Set order to maintain results stable
		// count and pagination optional
			if($full_count === false){
				$str_query .= PHP_EOL . 'ORDER BY section_tipo, section_id ASC';
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
	* GET_REFERENCED_LOCATORS
	* Get the sections that is pointed by any kind of locator to the caller (reference_locator)
	* @see section::get_inverse_locators
	* @param object $reference_locator
	*	Basic locator with section_tipo and section_id properties
	* @return array $ar_inverse_locators
	*/
	public static function get_referenced_locators( $reference_locator, $limit=false, $offset=false, $count=false ) {

		//new way done in relations field with standard sqo
			$sqo = new search_query_object();
				$sqo->set_section_tipo(['all']);
				$sqo->set_mode('related');
				$sqo->set_full_count(false);
				$sqo->set_limit($limit);
				$sqo->set_offset($offset);
				$sqo->set_filter_by_locators([$reference_locator]);

			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();
			// fix result ar_records as dato
			$result	= $rows_data->ar_records;

			$ar_inverse_locators = array();

			# Note that row relations contains all relations and not only searched because we need
			# filter relations array for each records to get only desired coincidences

			// Compare all properties of received locator in each relations locator
			$ar_properties = array();
			foreach ($reference_locator as $key => $value) {
				$ar_properties[] = $key;
			}

			foreach ($result as $row) {

				$current_section_id		= $row->section_id;
				$current_section_tipo	= $row->section_tipo;
				$current_relations		= $row->datos->relations;

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


		return (array)$ar_inverse_locators;
	}//end get_referenced_locators



}//end search_development
