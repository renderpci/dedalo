<?php declare(strict_types=1);
/**
* CLASS SEARCH
* TRAIT count
* Count methods
*/
trait count {



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
		if (isset($this->sqo->children_recursive) && $this->sqo->children_recursive===true) {
			// search as normal search to get the children_recursive sqo to be used for count.
			$this->search();
		}

		// ONLY_COUNT
		// Exec a count query
		// Converts JSON search_query_object to SQL query string
			$count_sql_query = $this->parse_sql_query();
			$count_result = matrix_db_manager::exec_search($count_sql_query, $this->params);

			if ($count_result===false) {
				return $records_data;
			}

			// Note that in some cases, such as "relationship search", more than one total is given.
			// because UNION is used for tables
			$total = 0;
			$totals_group = [];
			if ($count_result!==false) {
				while($row = pg_fetch_assoc($count_result)) {
					// get the total as the sum of all rows
					$total = $total + (int)$row['full_count'];

					// group by
					// get the specific total of the group_by concept (as section_tipo)
					if( isset($this->sqo->group_by) ){
						$current_totals_object = new stdClass();
						$ar_keys = [];
						foreach($this->sqo->group_by as $current_group){
							$ar_keys[] = $row[$current_group];
						}
						$current_totals_object->key		= $ar_keys;
						$current_totals_object->value	= (int)$row['full_count'];

						$totals_group[] = $current_totals_object;
					}
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
				$this->sqo->generated_time	= $exec_time;

				dd_core_api::$sql_query_search[] = '-- TIME sec: '. $exec_time . PHP_EOL . $count_sql_query;

				// metrics
				metrics::$search_total_time += $exec_time;
			}

		// Fix total value in the SQO
			$this->sqo->total = $total;

		// set total
			$records_data->total = $total;

		// if the sqo has group_by set the result
			if( isset($this->sqo->group_by) ){
				$records_data->totals_group = $totals_group;
			}

		return $records_data;
	}//end count



}//end count