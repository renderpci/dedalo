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
	public function parse_search_query_object( bool $full_count=false ) : string {

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

					$base_flat_locator = locator::get_term_id_from_locator($locator);

					switch (true) {
						case isset($locator->from_component_tipo):
							$locator_index = $locator->from_component_tipo.'_'.$base_flat_locator;
							$locators_query[] = PHP_EOL.'relations_flat_fct_st_si(datos) @> \'['. json_encode($locator_index) . ']\'::jsonb';
							break;

						case isset($locator->type):
							$locator_index = $locator->type.'_'.$base_flat_locator;
							$locators_query[] = PHP_EOL.'relations_flat_ty_st_si(datos) @> \'['. json_encode($locator_index) . ']\'::jsonb';
							break;

						default:
							$locators_query[] = PHP_EOL.'relations_flat_st_si(datos) @> \'['. json_encode($base_flat_locator) . ']\'::jsonb';
							break;
					}
					// Old model, it search directly in the table with gin index of relations, but it's slow for large databases.
					// now tables has a contraction/flat of the locator to be indexed the combination of section_tipo and section_id
					// $locators_query[]	= PHP_EOL.'datos#>\'{relations}\' @> \'['. json_encode($locator) . ']\'::jsonb';

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
			if($full_count===false) {
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
	* @see section::get_inverse_references
	*
	* @param object $reference_locator
	*	Basic locator with section_tipo and section_id properties
	* @param int|null $limit = null
	* @param int|null $offset = null
	* @param bool $count = false
	*
	* @return array $ar_inverse_locators
	*/
	public static function get_referenced_locators( object $reference_locator, ?int $limit=null, ?int $offset=null, bool $count=false ) : array {
		$start_time = start_time();

		$ar_inverse_locators = [];

		// new way done in relations field with standard sqo
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

			# Note that row relations contains all relations and not only searched because we need
			# filter relations array for each records to get only desired coincidences

		// debug
			$total_records = count($result);
			debug_log(__METHOD__
				. " Calculated referenced_locators step 1 (total: $total_records) $reference_locator->section_tipo, $reference_locator->section_id "
				. exec_time_unit($start_time).' ms'
				, logger::DEBUG
			);

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

		// debug
			debug_log(__METHOD__
				." Calculated referenced_locators step 2 $reference_locator->section_tipo, $reference_locator->section_id "
				. exec_time_unit($start_time).' ms'
				. ' - memory: ' .dd_memory_usage()
				, logger::DEBUG
			);


		return $ar_inverse_locators;
	}//end get_referenced_locators



}//end class search_related