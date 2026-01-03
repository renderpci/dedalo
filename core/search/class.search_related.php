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
	* PARSE_SQL_QUERY 
	* Build full final SQL query to send to DDBB
	* Please note that special indexes and functions such as 'matrix_relations_flat_st_si'
	* must exists to enable this search
	* @param bool $full_count
	*	default false
	* @return string $sql_query
	*/
	public function parse_sql_query() : string {
		$start_time=start_time();

		// tables where to search
			$ar_tables_to_search = common::get_matrix_tables_with_relations();

		// pagination
			$limit	= $this->sqo->limit ?? 10;
			$offset	= $this->sqo->offset ?? 0;

		// group_by
			$group_by = $this->sqo->group_by ?? null;

		// breakdown
			$breakdown = $this->sqo->breakdown ?? false;

		// order
			$sql_query_order = $this->build_sql_query_order();

		// reference locator is the locator of the source section that will be
		// used to obtain the sections with calls to it.
			$ar_locators = $this->sqo->filter_by_locators ?? [];

		// filter by locators operator.
			$filter_by_locators_op = $this->sqo->filter_by_locators_op ?? 'OR';

		// add filter of sections when the filter is not 'all', it's possible add specific section to get the related records only for these sections.
		// If the section has 'all', the filter don't add any section to the WHERE sentence.
			$section_filter = false;
			if (!empty($this->ar_section_tipo)) {
				$current_placeholders = [];
				foreach ($this->ar_section_tipo as $current_section_tipo) {
					if ($current_section_tipo ==='all') {
						continue;
					}

					// Gets current param key (default is 1 and increases by 1 after each use)
					$current_param_key = $this->params_counter++;
					// Replace param placeholder by current param key. E.g.: $1, $2, $3, ...
					$placeholder = '$' . $current_param_key;

					$current_placeholders[] = $placeholder;

					$this->params[] = $current_section_tipo;
				}
				if (!empty($current_placeholders)) {
					$section_filter = 'section_tipo IN(' . implode(',', $current_placeholders) .')';
				}
			}

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
				$query	.= (isset($this->sqo->full_count) && $this->sqo->full_count===true)
					? 'COUNT(*) as full_count'
					: ( $breakdown===true
						? 'section_tipo, section_id, locator_data'
						: 'section_tipo, section_id, relation');

				// columns
				if (!empty($this->order_columns)) {
					foreach ((array)$this->order_columns as $select_line) {
						// $ar_sql_select[] = $select_line;
						$query	.= PHP_EOL .','. $select_line;
					}
				}

				// FROM
				$query	.= PHP_EOL . 'FROM "'.$table.'"';

				// Breakdown
				if( $breakdown===true ){
					$query	.= PHP_EOL;
					// $query	.= 'cross join jsonb_array_elements( relation->\'relations\' ) as locator_data';
					$query	.= 'cross join jsonb_path_query(relation, \'$.*[*]\') as locator_data';
				}

				// WHERE
				$query	.= PHP_EOL . 'WHERE ';

				$locators_query = [];
				foreach ($ar_locators as $locator) {

					// Gets current param key (default is 1 and increases by 1 after each use)
					$current_param_key = $this->params_counter++;
					// Replace param placeholder by current param key. E.g.: $1, $2, $3, ...
					$placeholder = '$' . $current_param_key;					

					switch (true) {

						case !isset($locator->section_id) && isset($locator->type):
							// relation index case
							$locator_index	= $locator->type.'_'.$locator->section_tipo;
							// $sql			= PHP_EOL.'data_relations_flat_ty_st(relation) @> \'['. json_encode($locator_index) . ']\'::jsonb';
							$sql			= PHP_EOL.'data_relations_flat_ty_st(relation) @> '.$placeholder.'::jsonb';
							// Add placeholder to params array
							$this->params[] = '['. json_encode($locator_index) . ']';
							if( $breakdown===true ){
								$sql .= PHP_EOL." AND locator_data->'type' ? '$locator->type'";
								$sql .= PHP_EOL." AND locator_data->'section_tipo' ? '$locator->section_tipo'";
							}
							$locators_query[] = $sql;
							break;

						case isset($locator->from_component_tipo):
							$base_flat_locator	= locator::get_term_id_from_locator($locator);
							$locator_index		= $locator->from_component_tipo.'_'.$base_flat_locator;
							// $sql				= PHP_EOL.'data_relations_flat_fct_st_si(relation) @> \'['. json_encode($locator_index) . ']\'::jsonb';
							$sql				= PHP_EOL.'data_relations_flat_fct_st_si(relation) @> '.$placeholder.'::jsonb';
							// Add placeholder to params array
							$this->params[] = '['. json_encode($locator_index) . ']';
							if( $breakdown===true ){
								$sql .= PHP_EOL." AND locator_data->'from_component_tipo' ? '$locator->from_component_tipo'";
								$sql .= PHP_EOL." AND locator_data->'section_tipo' ? '$locator->section_tipo'";
								$sql .= PHP_EOL." AND locator_data->'section_id' ? '$locator->section_id'";
							}
							$locators_query[] = $sql;
							break;

						case isset($locator->type):
							$base_flat_locator	= locator::get_term_id_from_locator($locator);
							$locator_index		= $locator->type.'_'.$base_flat_locator;
							// $sql				= PHP_EOL.'data_relations_flat_ty_st_si(relation) @> \'['. json_encode($locator_index) . ']\'::jsonb';
							$sql				= PHP_EOL.'data_relations_flat_ty_st_si(relation) @> '.$placeholder.'::jsonb';
							// Add placeholder to params array
							$this->params[] = '['. json_encode($locator_index) . ']';
							if( $breakdown===true ){
								$sql .= PHP_EOL." AND locator_data->'type' ? '$locator->type'";
								$sql .= PHP_EOL." AND locator_data->'section_tipo' ? '$locator->section_tipo'";
								$sql .= PHP_EOL." AND locator_data->'section_id' ? '$locator->section_id'";
							}
							$locators_query[] = $sql;
							break;

						default:
							$base_flat_locator	= locator::get_term_id_from_locator($locator);
							// $sql				= PHP_EOL.'data_relations_flat_st_si(relation) @> \'['. json_encode($base_flat_locator) . ']\'::jsonb';
							$sql				= PHP_EOL.'data_relations_flat_st_si(relation) @> '.$placeholder.'::jsonb';
							// Add placeholder to params array
							$this->params[] = '['. json_encode($base_flat_locator) . ']';
							if( $breakdown===true ){
								$sql .= PHP_EOL." AND locator_data->'section_tipo' ? '$locator->section_tipo'";
								$sql .= PHP_EOL." AND locator_data->'section_id' ? '$locator->section_id'";
							}
							$locators_query[] = $sql;
							break;
					}
					// Old model, it search directly in the table with gin index of relations, but it's slow for large databases.
					// now tables has a contraction/flat of the locator to be indexed the combination of section_tipo and section_id
					// $locators_query[]	= PHP_EOL.'relation#>\'{relations}\' @> \'['. json_encode($locator) . ']\'::jsonb';
				}//end foreach ($ar_locators as $locator)
				$query .= '(' . implode(' '.$filter_by_locators_op.' ', $locators_query) . ')';

				if ($section_filter!==false) {
					$query .= PHP_EOL . 'AND (' . $section_filter . ')';
				}
				// group by
				// when is set use GROUP BY clause
				$query	.= ( isset($group_by) )
					? PHP_EOL . 'GROUP BY '.implode(', ', $group_by)
					: '';

				$ar_query[] = $query;
			}

		// final query union with all tables
			$str_query = implode(PHP_EOL .'UNION ALL ', $ar_query);

		// establish order to maintain stable results
		// count and pagination are optional
			if(isset($this->sqo->full_count) && $this->sqo->full_count===false) {

				// order
				if (!empty($sql_query_order)) {
					$str_query .= PHP_EOL . 'ORDER BY ' . $sql_query_order;
				}else{
					$str_query .= PHP_EOL . 'ORDER BY section_tipo, section_id ASC';
				}

				// limit
				if(!empty($limit)){
					$str_query .= PHP_EOL . 'LIMIT '.$limit;
				}

				// offset
				if($offset !== null){
					$str_query .= PHP_EOL . 'OFFSET '.$offset;
				}
			}

		$str_query .= ';';

		// debug
			// dump(null, 'null str_query ++ '.to_string($str_query));

		return $str_query;
	}//end parse_sql_query


	
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

		// new way done in relations field with standard sqo
			$sqo = new search_query_object();
				$sqo->set_section_tipo($target_section);
				$sqo->set_mode('related');
				$sqo->set_full_count(false);
				$sqo->set_limit($limit);
				$sqo->set_offset($offset);
				$sqo->set_filter_by_locators($filter_locators);
				$sqo->set_breakdown(true);

			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

			// Note that row relations contains all relations and not just searched, because we need
			// to filter the relationship array for each record to get only the desired matches

		// debug
			if(SHOW_DEBUG===true) {
				$total_records	= $db_result->row_count();
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

		// set the results as the inverse_locator
		foreach ($db_result as $row) {

			$current_locator = json_decode($row->locator_data);

			// Add some temporal info to current locator for build component later
			$current_locator->from_section_tipo	= $row->section_tipo;
			$current_locator->from_section_id	= $row->section_id;
			// Note that '$current_locator' contains 'from_component_tipo' property, useful for know when component is called
			$ar_inverse_locators[] = $current_locator;
		}

		// debug
			debug_log(__METHOD__
				. ' Calculated referenced_locators step 2 (total: ' .count($ar_inverse_locators). ')' . PHP_EOL
				. ' filter_locators: ' . to_string($filter_locators) . PHP_EOL
				. ' time: ' . exec_time_unit($start_time, 'ms').' ms'
				// . ' - memory: ' .dd_memory_usage()
				, logger::DEBUG
			);


		return $ar_inverse_locators;
	}//end get_referenced_locators



}//end class search_related
