<?php declare(strict_types=1);
/**
* CLASS SEARCH_RELATED
* Specific search related methods overwrite search methods
*
* PostgreSQL functions:
* 	relations_flat_st_si
* 	relations_flat_fct_st_si
* 	relations_flat_ty_st_si
* 	relations_flat_ty_st
* and indexes are required to work with this search
*/
class search_related extends search {



	/**
	* PARSE_SEARCH_QUERY_OBJECT NEW
	* Build full final SQL query to send to DDBB
	* Please note that special indexes and functions such as 'matrix_relations_flat_st_si'
	* must exists to enable this search
	* @param bool $full_count
	*	default false
	* @return string $sql_query
	*/
	public function parse_search_query_object( bool $full_count=false ) : string {
		$start_time=start_time();

		// tables where to search
			$ar_tables_to_search = common::get_matrix_tables_with_relations();

		// pagination
			$limit	= $this->search_query_object->limit;
			$offset	= $this->search_query_object->offset;

		// group_by
			$group_by = $this->search_query_object->group_by ?? null;

		// order
			$sql_query_order = $this->build_sql_query_order();

		// reference locator is the locator of the source section that will be
		// used to obtain the sections with calls to it.
			$ar_locators = $this->filter_by_locators;

		// filter by locators operator.
			$filter_by_locators_op = $this->filter_by_locators_op ?? 'OR';

		// add filter of sections when the filter is not 'all', it's possible add specific section to get the related records only for these sections.
		// if the section has all, the filter don't add any section to the WHERE
			$ar_section_tipo	= $this->ar_section_tipo;
			$ar_section_filter	= [];
			foreach ($ar_section_tipo as $section_tipo) {
				if ($section_tipo !=='all') {
					// $ar_section_filter[] = 'section_tipo = \''.$section_tipo.'\'';
					$ar_section_filter[] = '\''.$section_tipo.'\'';
				}
			}
			// // sample: 'section_tipo = 'tch1' OR section_tipo = 'tch100' OR section_tipo = 'tch178'
			// $section_filter = !empty($ar_section_filter)
			// 	? implode(' OR ', $ar_section_filter)
			// 	: false;
			$section_filter = !empty($ar_section_filter)
				? 'section_tipo IN(' . implode(',', $ar_section_filter) .')'
				: false;

		// each table query
			$ar_query = array();
			foreach ($ar_tables_to_search as $table) {

				$query	 = '';
				// SELECT
				$query	 = PHP_EOL . 'SELECT ';
				// add group_by
				// every concept need to be separated by commas
				$query	.= ( isset($group_by) )
					? implode(', ', $group_by).', '
					: '';
				// add full count when is set
				// else get the row
				$query	.= ($full_count===true)
					? 'COUNT(*) as full_count'
					: 'section_tipo, section_id, datos';

				// columns
				if (!empty($this->order_columns)) {
					foreach ((array)$this->order_columns as $select_line) {
						// $ar_sql_select[] = $select_line;
						$query	.= PHP_EOL .','. $select_line;
					}
				}

				// FROM
				$query	.= PHP_EOL . 'FROM "'.$table.'"';

				// WHERE
				$query	.= PHP_EOL . 'WHERE ';

				$locators_query = [];
				foreach ($ar_locators as $locator) {

					switch (true) {

						case !isset($locator->section_id) && isset($locator->type):
							// relation index case
							$locator_index		= $locator->type.'_'.$locator->section_tipo;
							$locators_query[]	= PHP_EOL.'relations_flat_ty_st(datos) @> \'['. json_encode($locator_index) . ']\'::jsonb';
							break;

						case isset($locator->from_component_tipo):
							$base_flat_locator	= locator::get_term_id_from_locator($locator);
							$locator_index		= $locator->from_component_tipo.'_'.$base_flat_locator;
							$locators_query[]	= PHP_EOL.'relations_flat_fct_st_si(datos) @> \'['. json_encode($locator_index) . ']\'::jsonb';
							break;

						case isset($locator->type):
							$base_flat_locator	= locator::get_term_id_from_locator($locator);
							$locator_index		= $locator->type.'_'.$base_flat_locator;
							$locators_query[]	= PHP_EOL.'relations_flat_ty_st_si(datos) @> \'['. json_encode($locator_index) . ']\'::jsonb';
							break;

						default:
							$base_flat_locator	= locator::get_term_id_from_locator($locator);
							$locators_query[]	= PHP_EOL.'relations_flat_st_si(datos) @> \'['. json_encode($base_flat_locator) . ']\'::jsonb';
							break;
					}
					// Old model, it search directly in the table with gin index of relations, but it's slow for large databases.
					// now tables has a contraction/flat of the locator to be indexed the combination of section_tipo and section_id
					// $locators_query[]	= PHP_EOL.'datos#>\'{relations}\' @> \'['. json_encode($locator) . ']\'::jsonb';
				}//end foreach ($ar_locators as $locator)
				$query .= '(' . implode(' '.$filter_by_locators_op.' ', $locators_query) . ')';

				if ($section_filter!==false) {
					$query .= PHP_EOL . ' AND (' . $section_filter . ')';
				}
				// group by
				// when is set use GROUP BY clause
				$query	.= ( isset($group_by) )
					? PHP_EOL . 'GROUP BY '.implode(', ', $group_by)
					: '';

				$ar_query[] = $query;
			}

		// final query union with all tables
			$str_query = implode(PHP_EOL .' UNION ALL ', $ar_query);

		// establish order to maintain stable results
		// count and pagination are optional
			if($full_count===false) {

				// order
				if (!empty($sql_query_order)) {
					$str_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order;
				}else{
					$str_query .= PHP_EOL . 'ORDER BY section_tipo, section_id ASC';
				}

				// limit
				if(!empty($limit)){
					$str_query .= PHP_EOL . 'LIMIT '.$limit;
					if($offset !== false){
						$str_query .= PHP_EOL . 'OFFSET '.$offset;
					}
				}
			}

		$str_query .= ';';

		// debug
			// dump(null, 'null str_query ++ '.to_string($str_query));

		return $str_query;
	}//end parse_search_query_object



	/**
	* GET_REFERENCED_LOCATORS
	* Get the sections pointed by any type of locator to the caller (reference_locator)
	* @see section::get_inverse_references
	*
	* @param array $filter_locators
	*	Basic locator with section_tipo and section_id properties
	* @param int|null $limit = null
	* @param int|null $offset = null
	* @param bool $count = false
	*
	* @return array $ar_inverse_locators
	*/
	public static function get_referenced_locators( array $filter_locators, ?int $limit=null, ?int $offset=null, bool $count=false, array $target_section=['all'] ) : array {
		$start_time = start_time();

		// cache
			// static $referenced_locators_cache;
			// $cache_key = implode('_', get_object_vars($filter_locators)) .'_'. $limit .'_'. $offset .'_'. $count;
			// if (isset($referenced_locators_cache[$cache_key])) {
			// 	return $referenced_locators_cache[$cache_key];
			// }



		// new way done in relations field with standard sqo
			$sqo = new search_query_object();
				$sqo->set_section_tipo($target_section);
				$sqo->set_mode('related');
				$sqo->set_full_count(false);
				$sqo->set_limit($limit);
				$sqo->set_offset($offset);
				$sqo->set_filter_by_locators($filter_locators);

			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();
			// fix result ar_records as dato
			$result	= $rows_data->ar_records;

			// Note that row relations contains all relations and not just searched, because we need
			// to filter the relationship array for each record to get only the desired matches

		// debug
			if(SHOW_DEBUG===true) {
				$total_records	= count($result);
				$time_ms		= exec_time_unit($start_time, 'ms');
				debug_log(__METHOD__
					. " Calculated referenced_locators step 1 (total: $total_records)" . PHP_EOL
					. ' reference_locator: ' . to_string($filter_locators) . PHP_EOL
					. ' time: ' . $time_ms .' ms' . PHP_EOL
					.' backtrace_sequence: ' . to_string( array_reverse(get_backtrace_sequence()) )
					, logger::DEBUG
				);
			}

		$ar_inverse_locators = [];
		foreach($filter_locators as $current_filter_locator){

			// Compare all properties of received locator in each relations locator
			$ar_properties = [];
			foreach ($current_filter_locator as $key => $value) {
				$ar_properties[] = $key;
			}

			// filter results
			foreach ($result as $row) {

				$current_section_id		= $row->section_id;
				$current_section_tipo	= $row->section_tipo;
				$current_relations		= $row->datos->relations;

				foreach ($current_relations as $current_locator) {
					if ( true===locator::compare_locators($current_filter_locator, $current_locator, $ar_properties) ) {
						// Add some temporal info to current locator for build component later
						$current_locator->from_section_tipo	= $current_section_tipo;
						$current_locator->from_section_id	= $current_section_id;
						// Note that '$current_locator' contains 'from_component_tipo' property, useful for know when component is called
						$ar_inverse_locators[] = $current_locator;
					}
				}
			}
		}

		// debug
			debug_log(__METHOD__
				. ' Calculated referenced_locators step 2 (total: ' .count($ar_inverse_locators). ')' . PHP_EOL
				. ' filter_locators: ' . to_string($filter_locators) . PHP_EOL
				. ' time: ' . exec_time_unit($start_time, 'ms').' ms'
				// . ' - memory: ' .dd_memory_usage()
				, logger::DEBUG
			);

		// cache
			// $referenced_locators_cache[$cache_key] = $ar_inverse_locators;

		// debug
			// $bt = debug_backtrace();
			// dump($bt, ' bt ++ '.to_string());


		return $ar_inverse_locators;
	}//end get_referenced_locators



}//end class search_related
