<?php declare(strict_types=1);
/**
* TRAIT COUNT
* Provides the count() method for the search class family.
*
* This trait is one of six complementary traits that together form the search
* class (select, from, where, order, count, utils). Its sole responsibility is
* to execute a COUNT query against the matrix JSONB tables and return the total
* number of matching records without fetching the full record payloads.
*
* Two distinct execution paths are covered:
*
* 1. children_recursive path — when sqo->children_recursive is true the full
*    set of matching parent+child records is unknown until search() has run and
*    populated sqo->total via search_children_recursive(). count() delegates to
*    search() (with full_count temporarily disabled so search returns actual
*    rows, not a COUNT(*) query) and reads the total that search_children_recursive()
*    stored in sqo->total. No separate COUNT query is sent to the database.
*
* 2. Standard path — parse_sql_query() is called (which, when sqo->full_count is
*    true, branches into parse_sql_full_count() via the switch in parse_sql_query())
*    and exec_search() runs the resulting COUNT(*) SQL against PostgreSQL. The
*    result set may contain more than one row when a UNION query spans multiple
*    matrix tables; the rows are summed. If sqo->group_by is set, per-group
*    totals are collected alongside the aggregate sum.
*
* Relationships:
* - Mixed into: search (class.search.php); inherited by search_tm, search_related
* - Calls: parse_sql_query() (trait.select/from/where/order), matrix_db_manager::exec_search(),
*   search::search() (for the children_recursive path only)
* - Reads/writes: $this->sqo (Search Query Object), $this->params (prepared-statement values)
*
* @package Dédalo
* @subpackage Core
*/
trait count {



	/**
	* COUNT
	* Executes a COUNT query for the current Search Query Object and returns a
	* result object carrying the aggregate total (and optional per-group totals).
	*
	* The method has two entirely separate paths:
	*
	* children_recursive path (sqo->children_recursive === true):
	*   A recursive tree-walk must know the full parent+child set before it can
	*   produce a meaningful count. count() re-uses search() for this: it
	*   temporarily disables full_count so that search() fetches actual rows (not
	*   a COUNT(*) result), then reads sqo->total which search_children_recursive()
	*   populates. The result is returned immediately without any SQL COUNT query.
	*
	* Standard path:
	*   parse_sql_query() builds a SQL COUNT(*) string (it branches into
	*   parse_sql_full_count() when sqo->full_count is true) and exec_search()
	*   runs it via pg_execute with $this->params as the positional bound values.
	*   For multi-section UNION queries the result set has one row per UNION
	*   branch; all rows are summed to produce a single aggregate total.
	*   If sqo->group_by is present, each row additionally contributes a
	*   {key, value} object to the totals_group array so callers can obtain
	*   per-section-tipo (or per-column) totals in a single query.
	*
	* Side effects:
	*   - Writes $this->sqo->total with the computed total so subsequent
	*     calls to search() (for pagination) can read it without re-counting.
	*   - In SHOW_DEBUG mode: writes debug timing to $records_data->debug,
	*     appends the human-readable SQL to dd_core_api::$sql_query_search,
	*     and records metrics via metrics::add_time_ms / metrics::observe_max.
	*
	* @return object $records_data
	*   Always an stdClass; at minimum has:
	*     ->total  int  Aggregate number of matching records.
	*   Optionally:
	*     ->totals_group  array  Per-group {key: array, value: int} objects
	*                            (only present when sqo->group_by is set).
	*     ->debug  stdClass  Timing and SQL info (only present when SHOW_DEBUG).
	*/
	public function count() : object {

		// debug
			if(SHOW_DEBUG===true) {
				$start_time=start_time();
				// metrics
				metrics::inc('search_total_calls');
			}

		// RECORDS_DATA BUILD TO OUTPUT
			$records_data = new stdClass();

		// children recursive, to count the children is necessary do a search to know if the term has children
		if (isset($this->sqo->children_recursive) && $this->sqo->children_recursive===true) {
			// Save current full_count state
			$full_count_backup = $this->sqo->full_count ?? false;
			// Temporarily disable full_count to get actual parents
			// (parse_sql_query() branches into parse_sql_full_count() when full_count is true,
			// which emits a COUNT(*) query that returns no row data — we need real rows here
			// so that search_children_recursive() can collect parent section_ids and resolve
			// their descendants before writing the final total into sqo->total.)
			$this->sqo->full_count = false;

			// search as normal search to get the children_recursive sqo to be used for count.
			$this->search();

			// Restore full_count state
			$this->sqo->full_count = $full_count_backup;

			// The total is already calculated by search_children_recursive() in $this->sqo->total
			// Use it directly instead of running a new count query
			$total = $this->sqo->total ?? 0;

			// debug
			if(SHOW_DEBUG===true) {
				$exec_time = exec_time_unit($start_time, 'ms');
				$records_data->debug = $records_data->debug ?? new stdClass();
				$records_data->debug->generated_time['get_records_data'] = $exec_time;
				$records_data->debug->strQuery = 'Total from children_recursive search: ' . $total;
				$this->sqo->generated_time = $exec_time;
				metrics::add_time_ms('search_total_time', $exec_time);
				metrics::observe_max('search_max_time', $exec_time); // slowest single search

				// Add extra debug info
				$records_data->debug->children_recursive_total = $total;
			}

			// set total
			$records_data->total = $total;
			$this->sqo->total = $total;

			return $records_data;
		}

		// ONLY_COUNT
		// Exec a count query
		// Converts JSON search_query_object to SQL query string
		// (!) parse_sql_query() inspects sqo->full_count and, when true, calls
		// parse_sql_full_count() which emits SELECT count(DISTINCT …) as full_count.
		// The result set therefore has a 'full_count' column, not the regular data columns.
		// For UNION queries (multiple section tipos spanning different matrix tables),
		// build_union_query() wraps each branch as a separate UNION ALL branch so that
		// each branch returns its own 'full_count' row; we sum them below.
			$count_sql_query = $this->parse_sql_query();
			$count_result = matrix_db_manager::exec_search(
				$count_sql_query,
				$this->params, // 0-indexed sequential list of bound values ($1..$n)
			);

			if ($count_result===false) {
				return $records_data;
			}

			// Note that in some cases, such as "relationship search", more than one total is given.
			// because UNION is used for tables
			// ($count_result===false already returned above, so it is always a valid result here)
			$total = 0;
			$totals_group = [];
			while($row = pg_fetch_assoc($count_result)) {

				// get the total as the sum of all rows
				// Each UNION branch contributes one row; summing gives the cross-table aggregate.
				$full_count = $row['full_count'] ?? 0;
				$total = $total + (int)$full_count;

				// group by
				// get the specific total of the group_by concept (as section_tipo)
				// When sqo->group_by is an array of column names (e.g. ['section_tipo']),
				// the SQL groups by those columns and each row carries the column value alongside
				// its full_count. We collect {key: [...column_values], value: int} per row so
				// the caller can display per-section-tipo (or per-custom-column) breakdowns.
				if( isset($this->sqo->group_by) ){
					$current_totals_object = new stdClass();
					$ar_keys = [];
					foreach($this->sqo->group_by as $current_group){
						$ar_keys[] = $row[$current_group];
					}
					$current_totals_object->key		= $ar_keys;
					$current_totals_object->value	= (int)$full_count;

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
				$records_data->debug->strQuery 	= $count_sql_query;
				$this->sqo->generated_time		= $exec_time;

				$conn = DBi::_getConnection();
				$sql_query_debug = debug_prepared_statement($count_sql_query, $this->params, $conn);

				dd_core_api::$sql_query_search[] = '-- TIME sec: '. $exec_time . PHP_EOL . $sql_query_debug;

				// metrics
				metrics::add_time_ms('search_total_time', $exec_time);
				metrics::observe_max('search_max_time', $exec_time); // slowest single search
			}

		// Fix total value in the SQO
		// Persisting here allows callers that run a separate search() for pagination
		// to skip a second COUNT by reading sqo->total directly.
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
