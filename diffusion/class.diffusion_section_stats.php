<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_SECTION_STATS
* Manages user activity methods
*/
// moved to dd tipos
// // tipo of daily statistics sections
// 	define('DEDALO_DAILY_STATS_SECTION_TIPO',	'dd70');

// // section user activity stat
// 	define('USER_ACTIVITY_SECTION_TIPO',		'dd1521');
// 	define('USER_ACTIVITY_USER_TIPO',			'dd1522');
// 	define('USER_ACTIVITY_TYPE_TIPO',			'dd1531');
// 	define('USER_ACTIVITY_DATE_TIPO',			'dd1530');
// 	define('USER_ACTIVITY_TOTALS_TIPO',			'dd1523');



class diffusion_section_stats extends diffusion {



	/**
	* CLASS VARS
	*/

		/**
		 * Section tipo being analysed (e.g. 'oh1', 'rsc170').
		 * @var ?string $section_tipo
		 */
		protected ?string $section_tipo = null;

		/**
		 * Section tipo of the caller/context that requested the stats.
		 * @var ?string $caller_section_tipo
		 */
		protected ?string $caller_section_tipo = null;

		/**
		 * Tipo of the statistics section that stores the generated data (e.g. 'dd70').
		 * @var ?string $section_stats_tipo
		 */
		protected ?string $section_stats_tipo = null;

		/**
		 * Array of diffusion_section objects involved in the current operation.
		 * @var array $ar_diffusion_section
		 */
		protected array $ar_diffusion_section = [];

		/**
		 * Date string (ISO 8601 or Dédalo date format) used to scope the statistics.
		 * @var ?string $date
		 */
		protected ?string $date = null;

		/**
		 * Current stored diffusion_map data object.
		 * @var ?object $diffusion_map_object
		 */
		protected ?object $diffusion_map_object = null;

		/**
		 * Final structured array sent to JavaScript diffusion_section_stats.build_charts.
		 * @var array $js_ar_obj
		 */
		protected array $js_ar_obj = [];

		/**
		 * GeoIP MaxMind reader instance for geolocation lookups.
		 * @var mixed $geoip_mm
		 */
		public static mixed $geoip_mm;



	/**
	* UPDATE_USER_ACTIVITY_STATS
	* Recalculates daily user activity statistics from raw activity records.
	*
	* Called on user logout/quit. Iterates day-by-day from the last saved
	* stats record (or the earliest activity) up to yesterday (today is
	* excluded because it is not yet complete).
	*
	* Workflow:
	* 1. Find the last saved user-activity stats record in matrix_stats
	*    to determine the starting point.
	* 2. Find the first raw activity record for this user after that point.
	* 3. Iterate day-by-day from that record's date to yesterday,
	*    calling `get_interval_raw_activity_data()` + `save_user_activity()`
	*    for each day that has activity.
	*
	* ⚠ This method can take a long time to process for users with
	*   extensive activity history.
	*
	* @param int $user_id The user ID whose activity stats will be updated
	* @return object $response { result: array|bool, msg: string, errors: array }
	*         - result: array of updated day objects on success, false on error,
	*           true when skipped (no calculable data)
	*         - msg: human-readable status message
	*         - errors: collected error strings
	*/
	public static function update_user_activity_stats( int $user_id, int $max_days=0 ) : object {
		$start_time = start_time();

		debug_log(__METHOD__
			." Updating user activity of user: $user_id"
			, logger::WARNING
		);

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. ';
			$response->errors	= [];

		// 1 - last saved user activity stats (looks section 'dd1521' in matrix_stats).
		// We look for the most recent record to know which aggregated day was
		// the last persisted. The signal we need is the AGGREGATED DAY (stored
		// in the `date` component dd1530), NOT the `created_date` timestamp.
		// Using created_date here was a bug: it never matches `today` (today is
		// never saved), so the short-circuit never triggered and the loop kept
		// re-saving yesterday on every call → duplicate records and wasted work.
			$sql_query  = 'SELECT section_tipo, section_id, data, "date"' . PHP_EOL;
			$sql_query .= 'FROM "matrix_stats"' . PHP_EOL;
			$sql_query .= 'WHERE relation @> $1' . PHP_EOL;
			$sql_query .= 'ORDER BY id DESC' . PHP_EOL;
			$sql_query .= 'LIMIT 1';

			$matrix_stats_result = matrix_db_manager::exec_search(
				$sql_query,
				['{"'.USER_ACTIVITY_USER_TIPO.'":[{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'"}]}']
			);
			if ($matrix_stats_result===false) {
				debug_log(__METHOD__." Error on first db execution: ".pg_last_error(), logger::ERROR);
				$response->errors[] = 'failed database execution on matrix_stats lookup';
				return $response;
			}
			$row = pg_fetch_object($matrix_stats_result);
			pg_free_result($matrix_stats_result);

		// 2 - tipos for batch aggregation
			$what_tipo	= logger_backend_activity::$_COMPONENT_WHAT['tipo'];	// dd545
			$where_tipo	= logger_backend_activity::$_COMPONENT_WHERE['tipo'];	// dd546
			$when_tipo	= logger_backend_activity::$_COMPONENT_WHEN['tipo'];	// dd547
			$data_tipo	= logger_backend_activity::$_COMPONENT_DATA['tipo'];	// dd551

		// 3 - last activity record lookups
			$who_tipo = logger_backend_activity::$_COMPONENT_WHO['tipo']; // dd543
			$params = [
				'{"'.$who_tipo.'":[{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'"}]}' // $who_tipo is the who component
			];

			$placeholders = 2;
			$filter_sentences = [];

			// Extract the aggregated day from the date component (dd1530).
			// Stored shape: date column JSONB = {"dd1530":[{"id":1,"start":{"year":Y,"month":M,"day":D,...}}]}
			$last_aggregated_date = null; // DateTime (midnight) of the last saved day, or null
			if (!empty($row)) {
				$section_id		= $row->section_id;
				$section_tipo	= $row->section_tipo;

				$date_col = isset($row->date) ? json_decode($row->date) : null;
				$date_entry = $date_col->{USER_ACTIVITY_DATE_TIPO}[0] ?? null;
				$start = is_object($date_entry) ? ($date_entry->start ?? null) : null;
				if (is_object($start) && !empty($start->year) && !empty($start->month) && !empty($start->day)) {
					try {
						$last_aggregated_date = (new DateTime(sprintf(
							'%04d-%02d-%02d',
							(int)$start->year,
							(int)$start->month,
							(int)$start->day
						)))->setTime(0, 0, 0);
					} catch (\Throwable $e) {
						debug_log(__METHOD__
							." Invalid date in last matrix_stats row for user $user_id: ".$e->getMessage()
							, logger::WARNING
						);
					}
				}
			}

			// Reference dates (all at midnight for clean date-only comparisons).
			$today		= (new DateTime())->setTime(0, 0, 0);
			$yesterday	= (clone $today)->modify('-1 day');

			// Short-circuit: we already have stats through yesterday — nothing
			// to persist until tomorrow rolls around.
			if ($last_aggregated_date !== null && $last_aggregated_date >= $yesterday) {
				debug_log(__METHOD__
					.' User stats are already updated through yesterday. Ignored action.' . PHP_EOL
					.' last_aggregated_date: ' . $last_aggregated_date->format('Y-m-d') . PHP_EOL
					.' yesterday: ' . $yesterday->format('Y-m-d')
					, logger::DEBUG
				);
				$response->result	= 0;
				$response->msg		= 'Stats are already updated';
				return $response;
			}

			// Set the matrix_activity lower bound to the FIRST day that still
			// needs aggregation: last_aggregated_date + 1 day. Using `>=` with a
			// date-only cast guarantees we don't re-aggregate any persisted day
			// and don't miss any activity from the new day.
			if ($last_aggregated_date !== null) {
				$next_day_to_process = (clone $last_aggregated_date)->modify('+1 day')->format('Y-m-d');
				$params[] = $next_day_to_process;
				$filter_sentences[] = '"timestamp" >= date($'.$placeholders.')';
				$placeholders++;
			}

			// Upper bound: do not include today (the day is not yet complete).
			$end_date = $today->format('Y-m-d');
			$params[] = $end_date;
			$filter_sentences[] = '"timestamp" < date($'.$placeholders.')';
			$placeholders++;

		// 4 - batch query matrix_activity with JSONB columns (single pass)
			$sql_query  = 'SELECT section_tipo, section_id, "timestamp",' . PHP_EOL;
			$sql_query .= '"relation", "string", "date", "misc"' . PHP_EOL;
			$sql_query .= 'FROM "matrix_activity"' . PHP_EOL;
			$sql_query .= 'WHERE relation @> $1' . PHP_EOL;
			$sql_query .= 'AND '.implode(' AND ', $filter_sentences) . PHP_EOL;
			$sql_query .= 'ORDER BY id ASC';

			$result = matrix_db_manager::exec_search($sql_query, $params);
			if ($result===false) {
				debug_log(__METHOD__." Error on db execution: ".pg_last_error(), logger::ERROR);
				$response->errors[] = 'failed database execution';
				return $response;
			}

		// 5 - group by day and aggregate totals in a single pass
			// day_groups: [ 'Y-m-d' => { what_obj, where_obj, when_obj, publish_obj } ]
			$day_groups = [];
			$row_count = 0;
			while ($activity_row = pg_fetch_object($result)) {

				if (empty($activity_row->timestamp)) {
					continue;
				}

				$day = substr($activity_row->timestamp, 0, 10); // '2025-01-15'
				if (!isset($day_groups[$day])) {
					$day_groups[$day] = (object)[
						'what_obj'		=> new stdClass(),
						'where_obj'		=> new stdClass(),
						'when_obj'		=> new stdClass(),
						'publish_obj'	=> new stdClass()
					];
				}
				$group = $day_groups[$day];
				$row_count++;

				// Decode JSONB columns once per row
				$relation_col	= isset($activity_row->relation) ? json_decode($activity_row->relation) : null;
				$string_col		= isset($activity_row->string)   ? json_decode($activity_row->string)   : null;
				$date_col		= isset($activity_row->date)     ? json_decode($activity_row->date)     : null;
				$misc_col		= isset($activity_row->misc)     ? json_decode($activity_row->misc)     : null;

				// what (dd545) — component_select in relation column
				$what_data = $relation_col->{$what_tipo} ?? null;
				if (!empty($what_data)) {
					self::build_what($what_data, $group->what_obj);
				}

				// where (dd546) — component_input_text in string column
				$where_data = $string_col->{$where_tipo} ?? null;
				if (!empty($where_data)) {

					$key = $where_data[0]->value ?? null;
					if (is_array($key)) {
						$key = $key[0];
					}
					if (!empty($key) && is_string($key)) {
						switch (true) {
							case ($key==='dd1223'): // last publish
								$data_data = $misc_col->{$data_tipo} ?? null;
								$msg = $data_data[0]->value ?? false;
								if ($msg!==false) {
									$_section_tipo = $msg->top_tipo ?? $msg->section_tipo ?? false;
									if ($_section_tipo!==false) {
										$group->publish_obj->{$_section_tipo} = ($group->publish_obj->{$_section_tipo} ?? 0) + 1;
									}
								}
								break;
							case ($key==='dd271' || $key==='dd1224' || $key==='dd1225'):
								break;
							default:
								$group->where_obj->{$key} = ($group->where_obj->{$key} ?? 0) + 1;
								break;
						}
					}
				}

				// when (dd547) — component_date in date column
				$when_data = $date_col->{$when_tipo} ?? null;
				if (!empty($when_data) && isset($when_data[0]->start->hour)) {
					$hour = $when_data[0]->start->hour;
					$group->when_obj->{$hour} = ($group->when_obj->{$hour} ?? 0) + 1;
				}

			}//end while ($activity_row = pg_fetch_object($result))

			pg_free_result($result);

			// When no activity found at all in the range, exit cleanly.
			if ($row_count === 0) {
				debug_log(__METHOD__
					." No activity records found for user $user_id in the range. Skipping."
					, logger::DEBUG
				);
				$response->msg		= 'No activity records found';
				$response->result	= [];
				return $response;
			}

		// 6 - save each day's aggregated sumatory
			// Sort day keys ascending (oldest first) so last_aggregated_date
			// advances forward correctly for incremental catch-up.
			$day_keys = array_keys($day_groups);
			sort($day_keys);

			$updated_days = [];
			foreach ($day_keys as $day) {

				// max_days cap — limits saves, not loads
				if ($max_days > 0 && count($updated_days) >= $max_days) {
					debug_log(__METHOD__
						." Reached max_days limit ($max_days) for user $user_id. Stopping catch-up."
						, logger::DEBUG
					);
					break;
				}

				// Parse date parts
				list($year, $month, $day_num) = explode('-', $day);
				$year		= (int)$year;
				$month		= (int)$month;
				$day_num	= (int)$day_num;

				// Duplicate guard: indexed LIMIT 1 query (fast on large tables)
				if (self::user_activity_day_exists($user_id, $year, $month, $day_num)) {
					debug_log(__METHOD__
						." Skip duplicate save: user $user_id already has stats for $day"
						, logger::DEBUG
					);
					continue;
				}

				$group = $day_groups[$day];

				// Verticalize accumulator objects into totals_data array
				$totals_data = [];

				// what
				foreach ($group->what_obj as $key => $value) {
					$totals_data[] = (object)[
						'type'	=> 'what',
						'tipo'	=> $key,
						'value'	=> $value,
						'label'	=> ontology_node::get_term_by_tipo($key)
					];
				}
				// where
				foreach ($group->where_obj as $key => $value) {
					$totals_data[] = (object)[
						'type'	=> 'where',
						'tipo'	=> $key,
						'value'	=> $value
					];
				}
				// when
				foreach ($group->when_obj as $hour => $value) {
					$totals_data[] = (object)[
						'type'	=> 'when',
						'hour'	=> (int)$hour,
						'value'	=> $value
					];
				}
				// publish
				foreach ($group->publish_obj as $key => $value) {
					$totals_data[] = (object)[
						'type'	=> 'publish',
						'tipo'	=> $key,
						'value'	=> $value
					];
				}

				if (empty($totals_data)) {
					continue;
				}

				// save_user_activity
				$save_result = diffusion_section_stats::save_user_activity(
					$totals_data,
					$user_id,
					'day',
					$year,
					$month,
					$day_num
				);

				if ($save_result===false) {
					debug_log(__METHOD__
						." Save user activity failed for user $user_id on $day"
						, logger::ERROR
					);
					continue;
				}

				$updated_days[] = (object)[
					'user'	=> $user_id,
					'date'	=> $day
				];
			}//end foreach ($day_keys as $day)

		// debug info
			$memory		= dd_memory_usage();
			$total_time	= exec_time_unit($start_time,'ms').' ms';
			debug_log(__METHOD__.
				" -> updated_days:  ".to_string($updated_days)." - memory: $memory - total_time: $total_time",
				logger::DEBUG
			);

		/// response
			$response->result	= $updated_days;
			$response->msg		= empty($response->errors)
				? 'OK. Request done.'
				: 'Warning! Request done with errors';


		return $response;
	}//end update_user_activity_stats



	/**
	* GET_INTERVAL_RAW_ACTIVITY_DATA
	* Search records on table "matrix_activity" and creates an array of
	* objects with all user actions summarized by action type in the given date range
	* @param int $user_id
	* @param string $date_in
	*	Like 2019-12-31
	* @param string $date_out
	*	Like 2020-12-31
	*
	* @return array|null $totals_data
	*/
	public static function get_interval_raw_activity_data(int $user_id, string $date_in, string $date_out) : ?array {

		// tipos
			$what_tipo	= logger_backend_activity::$_COMPONENT_WHAT['tipo'];	// expected dd545
			$where_tipo	= logger_backend_activity::$_COMPONENT_WHERE['tipo'];	// expected dd546
			$when_tipo	= logger_backend_activity::$_COMPONENT_WHEN['tipo'];	// expected dd547
			$data_tipo	= logger_backend_activity::$_COMPONENT_DATA['tipo'];	// expected dd551

		// map model → column for JSONB reads
			$column_what	= section_record_data::get_column_name(logger_backend_activity::$_COMPONENT_WHAT['model_name']);	// relation
			$column_where	= section_record_data::get_column_name(logger_backend_activity::$_COMPONENT_WHERE['model_name']);	// string
			$column_when	= section_record_data::get_column_name(logger_backend_activity::$_COMPONENT_WHEN['model_name']);	// date
			$column_data	= section_record_data::get_column_name(logger_backend_activity::$_COMPONENT_DATA['model_name']);	// misc

		// base objects
			$what_obj	= new stdClass();
			$where_obj	= new stdClass();
			$when_obj	= new stdClass();
			$publish_obj= new stdClass();

		// matrix_activity. Get data from current user in range
		// Select JSONB columns directly to avoid N+1 component instantiation
			$sql_query  = 'SELECT section_tipo, section_id,' . PHP_EOL;
			$sql_query .= '"relation", "string", "date", "misc"' . PHP_EOL;
			$sql_query .= 'FROM "matrix_activity"' . PHP_EOL;
			$sql_query .= 'WHERE relation @> $3' . PHP_EOL;
			$sql_query .= 'AND "timestamp" >= date($1) AND "timestamp" < date($2)' . PHP_EOL;
			$sql_query .= 'ORDER BY id ASC';

			$result = matrix_db_manager::exec_search($sql_query, [
				$date_in,
				$date_out,
				'{"dd543":[{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'"}]}'
			]);

			if ($result===false) {
				debug_log(__METHOD__." Error on db execution: ".pg_last_error(), logger::ERROR);
				return null;
			}

		// iterate found records
		while ($row = pg_fetch_object($result)) {

			$current_section_id		= $row->section_id;
			$current_section_tipo	= $row->section_tipo;

			// Decode JSONB columns once per row instead of creating component instances
				$relation_col	= isset($row->relation) ? json_decode($row->relation) : null;
				$string_col		= isset($row->string)   ? json_decode($row->string)   : null;
				$date_col		= isset($row->date)     ? json_decode($row->date)     : null;
				$misc_col		= isset($row->misc)     ? json_decode($row->misc)     : null;

			// what (dd545) component_select — stored in relation column
				$what_data = $relation_col->{$what_tipo} ?? null;
				if (!empty($what_data)) {
					self::build_what( $what_data, $what_obj );
				}

			// where (dd546) component_input_text — stored in string column
				$where_data = $string_col->{$where_tipo} ?? null;
				if (!empty($where_data)) {

					$key = $where_data[0]->value ?? null; // Like: dd1223
					if(is_array($key)) {
						$key = $key[0];
						debug_log(__METHOD__
							." Old data format found. Casting from array to string" . PHP_EOL
							." key: " . json_encode($key) . PHP_EOL
							.' section_tipo: ' . $current_section_tipo . PHP_EOL
							.' section_id: ' . $current_section_id . PHP_EOL
							." where_data: " . json_encode($where_data, JSON_PRETTY_PRINT)
							, logger::WARNING
						);
					}
					if(empty($key) || !is_string($key)) {
						debug_log(__METHOD__
							." Error: invalid key. Ignored data" . PHP_EOL
							." key: " . json_encode($key) . PHP_EOL
							." where_data: " . json_encode($where_data, JSON_PRETTY_PRINT)
							, logger::ERROR
						);
					}else{
						// take care to manage publish cases in different way
						switch (true) {
							case ($key==='dd1223'): // last publish
								// read misc column directly instead of component_common
								$data_data = $misc_col->{$data_tipo} ?? null;
								$msg = $data_data[0]->value ?? false;
								if ($msg!==false) {
									$_section_tipo = $msg->top_tipo ?? $msg->section_tipo ?? false;
									if ($_section_tipo!==false) {
										$publish_obj->{$_section_tipo} = ($publish_obj->{$_section_tipo} ?? 0) + 1;
									}
								}
								break;
							case ($key==='dd271' || $key==='dd1224' || $key==='dd1225'): // first publish, first publish user, last publish user
								// ignore it ..
								break;
							default:
								$where_obj->{$key} = ($where_obj->{$key} ?? 0) + 1;
								break;
						}
					}
				}//end where

			// when (dd547) component_date — stored in date column
				$when_data = $date_col->{$when_tipo} ?? null;
				if (!empty($when_data)) {

					if (isset($when_data[0]->start) && isset($when_data[0]->start->hour)) {
						$hour = $when_data[0]->start->hour;
						$when_obj->{$hour} = ($when_obj->{$hour} ?? 0) + 1;
					}
				}//end when

		}//end while ($row = pg_fetch_object($result))

		// free result
		pg_free_result($result);

		// merge and verticalize data to store it
			$totals_data = [];
			// what
			foreach ($what_obj as $key => $value) {
				$item = new stdClass();
					$item->type		= 'what';
					$item->tipo		= $key;
					$item->value	= $value;
					$item->label	= ontology_node::get_term_by_tipo($key); // add label for easy human read
				$totals_data[] = $item;
			}
			// where
			foreach ($where_obj as $key => $value) {
				$item = new stdClass();
					$item->type		= 'where';
					$item->tipo		= $key;
					$item->value	= $value;
				$totals_data[] = $item;
			}
			// when
			foreach ($when_obj as $key => $value) {
				$item = new stdClass();
					$item->type		= 'when';
					$item->hour		= $key;
					$item->value	= $value;
				$totals_data[] = $item;
			}
			// publish
			foreach ($publish_obj as $key => $value) {
				$item = new stdClass();
					$item->type		= 'publish';
					$item->tipo		= $key;
					$item->value	= $value;
				$totals_data[] = $item;
			}


		return $totals_data;
	}//end get_interval_raw_activity_data



	/**
	* BUILD_WHAT
	* Creates the 'what' object from activity row->datos based on
	* locator from component tipo (dd545)
	* like:
	* {
	*   "type": "dd151",
	*   "section_id": "6",
	*   "section_tipo": "dd42",
	*   "from_component_tipo": "dd545"
	* }
	* @param array|null $data
	* @param object &$what_obj
	* @return object $what_obj
	*/
	public static function build_what( ?array $data, object &$what_obj ) : object {

		$what_tipo = logger_backend_activity::$_COMPONENT_WHAT['tipo'];	// expected dd545

		// mapping locator to tipo (ontology label v5 compatible)
		// @see $what map for activity in logger_backend_activity::$what
			$what_map = [
				'1'  => 'dd696', // login
				'2'  => 'dd697', // logout
				'3'  => 'dd695', // new
				'4'  => 'dd729', // delete
				'5'  => 'dd700', // save
				'6'  => 'dd694', // edit
				'7'  => 'dd693', // list
				'8'  => 'dd699', // search
				'9'  => 'dd1090', // upload
				'10' => 'dd1080', // download
				'11' => 'dd1094', // upload complete
				'12' => 'dd1095', // delete file
				'13' => 'dd1092', // recover section
				'14' => 'dd1091', // recover component
				'15' => 'dd1098', // statistics
				'16' => 'dd1081' // new file version
			];

		// what_value
			$what_value = $data[0] ?? null;
			// Returns an locator object (or null) like:
			// {"id":1,"type":"dd151","section_id":"5","section_tipo":"dd42","from_component_tipo":"dd545"}
			if ( !is_object($what_value) ) {
				// no what action was found
				debug_log(__METHOD__
					. " Error. Ignored activity record without what definition! " . PHP_EOL
					. ' what_tipo: ' . to_string($what_tipo) . PHP_EOL
					. ' data: ' . json_encode($data, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
				return $what_obj;
			}

			$section_id	= (string)$what_value->section_id;
			$tipo		= $what_map[$section_id] ?? null;
			if (empty($tipo)) {
				// no what action was found in map
				debug_log(__METHOD__
					. " Error. Ignored activity record without what correspondence! " . PHP_EOL
					. ' what_tipo: ' . to_string($what_tipo) . PHP_EOL
					. ' data: ' . json_encode($data, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
				return $what_obj;
			}

			// if is not already defined init as zero
			if (!isset($what_obj->{$tipo})) {
				$what_obj->{$tipo} = 0;
			}

			// add one
			$what_obj->{$tipo}++;


		return $what_obj;
	}//end build_what



	/**
	* USER_ACTIVITY_DAY_EXISTS
	* True when matrix_stats already contains a user_activity record for the
	* given user/year/month/day combo. Used as a duplicate guard before
	* `save_user_activity` so we never create a second record for the same day.
	*
	* @param int $user_id
	* @param int $year
	* @param int $month
	* @param int $day
	* @return bool
	*/
	public static function user_activity_day_exists(int $user_id, int $year, int $month, int $day) : bool {

		$sql_query  = 'SELECT 1' . PHP_EOL;
		$sql_query .= 'FROM "matrix_stats"' . PHP_EOL;
		$sql_query .= 'WHERE relation @> $1' . PHP_EOL;
		$sql_query .= '  AND ("date"->\''.USER_ACTIVITY_DATE_TIPO.'\'->0->\'start\'->>\'year\')::int  = $2' . PHP_EOL;
		$sql_query .= '  AND ("date"->\''.USER_ACTIVITY_DATE_TIPO.'\'->0->\'start\'->>\'month\')::int = $3' . PHP_EOL;
		$sql_query .= '  AND ("date"->\''.USER_ACTIVITY_DATE_TIPO.'\'->0->\'start\'->>\'day\')::int   = $4' . PHP_EOL;
		$sql_query .= 'LIMIT 1';

		$result = matrix_db_manager::exec_search($sql_query, [
			'{"'.USER_ACTIVITY_USER_TIPO.'":[{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'"}]}',
			(string)$year,
			(string)$month,
			(string)$day
		]);
		if ($result === false) {
			debug_log(__METHOD__
				." Lookup failed (treating as not exists): ".pg_last_error()
				, logger::ERROR
			);
			return false;
		}

		$exists = (pg_num_rows($result) > 0);
		pg_free_result($result);


		return $exists;
	}//end user_activity_day_exists



	/**
	* SAVE_USER_ACTIVITY
	* Creates a new record on user activity section and
	* store all data (user, type, date, totals)
	* in table 'matrix_stats'
	* @param array $totals_data
	*	Verticalized array of objects
	* @param int $user_id
	* @param string $type
	*	Allow values:  year, month, day. Default is day
	* @param int $year
	*	Mandatory. Ex. 2021
	* @param int|null $month = null
	*	Optional. Ex. 12
	* @param int|null $day = null
	*	Optional. Ex. 30
	* @return int|false $section_id
	*	The section id created on save
	*/
	public static function save_user_activity(array $totals_data, int $user_id, string $type, int $year, ?int $month=null, ?int $day=null) : int|false {

		// creates a new section
			$section_tipo	= USER_ACTIVITY_SECTION_TIPO; // 'dd1521' matrix_stats table;
			$section		= section::get_instance($section_tipo);

		// build direct values to insert in a single query
			// 1. user locator
			$locator = new locator();
				$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
				$locator->set_section_id($user_id);
				$locator->set_type(DEDALO_RELATION_TYPE_LINK);
				$locator->set_from_component_tipo(USER_ACTIVITY_USER_TIPO);
				$locator->set_id(1);

			// 2. type string
			$type_data = new stdClass();
				$type_data->value	= $type;
				$type_data->lang	= DEDALO_DATA_NOLAN;
				$type_data->id		= 1;

			// 3. date
			$date_val = new stdClass();
				$date_val->year		= $year;
				$date_val->month	= $month;
				$date_val->day		= $day;
			$dd_date = new dd_date($date_val);

			$date_data = new stdClass();
				$date_data->start	= $dd_date;
				$date_data->id		= 1;

			// 4. totals misc
			$totals_data_obj = new stdClass();
				$totals_data_obj->value	= $totals_data;
				$totals_data_obj->lang	= DEDALO_DATA_NOLAN;
				$totals_data_obj->id	= 1;

			// counters
			$counter_obj = new stdClass();
				$counter_obj->count = 1;

		// build values object for create_record
			$values = new stdClass();

			$values->relation = new stdClass();
				$values->relation->{USER_ACTIVITY_USER_TIPO} = [$locator];

			$values->string = new stdClass();
				$values->string->{USER_ACTIVITY_TYPE_TIPO} = [$type_data];

			$values->date = new stdClass();
				$values->date->{USER_ACTIVITY_DATE_TIPO} = [$date_data];

			$values->misc = new stdClass();
				$values->misc->{USER_ACTIVITY_TOTALS_TIPO} = [$totals_data_obj];

			$values->meta = new stdClass();
				$values->meta->{USER_ACTIVITY_USER_TIPO}	= [$counter_obj];
				$values->meta->{USER_ACTIVITY_TYPE_TIPO}	= [$counter_obj];
				$values->meta->{USER_ACTIVITY_DATE_TIPO}	= [$counter_obj];
				$values->meta->{USER_ACTIVITY_TOTALS_TIPO}	= [$counter_obj];

			// create_record
			$section_id	= $section->create_record((object)[
				'values' => $values
			]);

			if (empty($section_id)) {
				debug_log(__METHOD__
					." ERROR. Unable to create a new section record in section '$section_tipo'"
					, logger::ERROR
				);
				return false;
			}

		// debug
			debug_log(__METHOD__
				." Saved user activity. section_tipo: '$section_tipo', section_id: '$section_id'"
				//. "Totals: " . PHP_EOL . to_string($totals_data),
				,logger::WARNING
			);


		return $section_id;
	}//end save_user_activity



	/**
	* CROSS_USERS_RANGE_DATA
	* Calculates user activity totals from precalculated data stored in
	* `component_json` (`USER_ACTIVITY_TOTALS_TIPO` = dd1523) within the
	* user_activity section (dd1521), filtered by a date range and
	* optionally by user_id.
	*
	* Used by:
	* - The `user_activity` widget (component_info in users section)
	* - Diffusion export via the component_info that hosts the widget
	* - Future D3 chart rendering (bars/pies)
	*
	* The method queries all user_activity records in the given date range,
	* then performs a single-pass aggregation over each record's totals array
	* to build five dimension datasets (who/what/where/when/publish).
	*
	* Each totals item in the component_json data has the shape:
	*   { type: string, tipo?: string, hour?: int, value: int }
	* where `type` is one of: 'what', 'where', 'when', 'publish'.
	* The 'who' dimension is derived from the row's relation column plus
	* the sum of all 'where' values (action counts) for that user.
	*
	* @param string $date_in   Start date inclusive. Format: 'YYYY-MM-DD'
	*                           Example: '2020-01-01'
	* @param string $date_out  End date inclusive. Format: 'YYYY-MM-DD'
	*                           Example: '2021-12-31'
	* @param int|null $user_id Optional user filter. When provided, only
	*                           records belonging to that user are returned.
	*                           Default: null (all users)
	* @param string $lang      Language for label resolution.
	*                           Default: DEDALO_DATA_LANG
	*
	* @return object|null Aggregated totals object with five dimension arrays,
	*                     or null if no records match the filter.
	*
	* Return structure example:
	* ```json
	* {
	*   "who": [
	*     { "key": "1", "label": "Admin User", "value": 342 }
	*   ],
	*   "what": [
	*     { "key": "dd696", "label": "Indexation", "value": 120 },
	*     { "key": "dd693", "label": "Modification", "value": 222 }
	*   ],
	*   "where": [
	*     { "key": "dd696", "label": "Indexation", "value": 120 },
	*     { "key": "dd693", "label": "Modification", "value": 222 }
	*   ],
	*   "when": [
	*     { "key": 0, "label": "00", "value": 0 },
	*     { "key": 1, "label": "01", "value": 5 },
	*     ...
	*     { "key": 23, "label": "23", "value": 12 }
	*   ],
	*   "publish": [
	*     { "key": "dd271", "label": "First publication", "value": 45 }
	*   ]
	* }
	* ```
	*
	* Sample input data (component_json stored in dd1523):
	* ```json
	* [{
	*   "value": [
	*     { "type": "what",   "tipo": "dd696", "value": 24 },
	*     { "type": "what",   "tipo": "dd693", "value": 110 },
	*     { "type": "where",  "tipo": "dd696", "value": 24 },
	*     { "type": "where",  "tipo": "dd693", "value": 110 },
	*     { "type": "when",   "hour": 9,       "value": 15 },
	*     { "type": "when",   "hour": 14,      "value": 22 },
	*     { "type": "publish","tipo": "dd271",  "value": 3 }
	*   ],
	*   "lang": "lg-nolan"
	* }]
	* ```
	*/
	public static function cross_users_range_data(string $date_in, string $date_out, ?int $user_id=null, string $lang=DEDALO_DATA_LANG) : ?object {

		// dates parse. from '2020-12-30' to dd_date object {"year":2020,"month":12,"day":30,"time":...}
			$dd_date_in	= dd_date::get_dd_date_from_timestamp($date_in);
			$dd_date_in->set_time( dd_date::convert_date_to_seconds($dd_date_in) );

			$dd_date_out	= dd_date::get_dd_date_from_timestamp($date_out);
			$dd_date_out->set_time( dd_date::convert_date_to_seconds($dd_date_out) );

		// user filter
			$user_filter_data = null;
			if ($user_id !== null) {
				$user_filter_data = (object)[
					'q' => [(object)[
						'section_tipo' => DEDALO_SECTION_USERS_TIPO,
						'section_id' => to_string($user_id),
						'from_component_tipo' => USER_ACTIVITY_USER_TIPO
					]],
					'q_operator' => null,
					'path' => [
						(object)[
							'section_tipo' => USER_ACTIVITY_SECTION_TIPO,
							'component_tipo' => USER_ACTIVITY_USER_TIPO,
							'model' => ontology_node::get_model_by_tipo(USER_ACTIVITY_USER_TIPO, true),
							'name' => 'User'
						]
					]
				];
			}

		// build filter parts
			$filter_parts = [
				(object)[
					'q' => (object)['start' => (object)['op' => null, 'day' => $dd_date_in->day, 'month' => $dd_date_in->month, 'year' => $dd_date_in->year, 'time' => $dd_date_in->time]],
					'q_operator' => '>',
					'path' => [
						(object)[
							'section_tipo' => USER_ACTIVITY_SECTION_TIPO,
							'component_tipo' => USER_ACTIVITY_DATE_TIPO,
							'model' => 'component_date',
							'name' => 'Date'
						]
					]
				],
				(object)[
					'q' => (object)['start' => (object)['op' => null, 'day' => $dd_date_out->day, 'month' => $dd_date_out->month, 'year' => $dd_date_out->year, 'time' => $dd_date_out->time]],
					'q_operator' => '<=',
					'path' => [
						(object)[
							'section_tipo' => USER_ACTIVITY_SECTION_TIPO,
							'component_tipo' => USER_ACTIVITY_DATE_TIPO,
							'model' => 'component_date',
							'name' => 'Date'
						]
					]
				]
			];

			// add user filter if exists
			if ($user_filter_data !== null) {
				$filter_parts[] = $user_filter_data;
			}

		// select info
			$model = ontology_node::get_model_by_tipo(USER_ACTIVITY_TOTALS_TIPO);
			$column = section_record_data::get_column_name($model);

		// get all user activity records from user_activity_section in the range
			$sqo_data = (object)[
				'section_tipo' => [USER_ACTIVITY_SECTION_TIPO],
				'limit' => 0,
				'offset' => 0,
				'select' => [
					(object)[
						'column' => $column, // expected 'misc' for component_json
						'key' => USER_ACTIVITY_TOTALS_TIPO
					],
					(object)[
						'column' => 'relation' // needed to resolve user per row
					]
				],
				'filter' => (object)[
					'$and' => $filter_parts
				],
				'order' => [
					(object)[
						'direction' => 'ASC',
						'path' => [
							(object)[
								'name' => 'Date',
								'model' => 'component_date',
								'section_tipo' => USER_ACTIVITY_SECTION_TIPO,
								'component_tipo' => USER_ACTIVITY_DATE_TIPO
							]
						]
					]
				]
			];
			$sqo = new search_query_object($sqo_data);

			// Search records
			$search	= search::get_instance($sqo);
			$db_result	= $search->search();
			$total		= $db_result->row_count();
			if ($total===0) {
				return null;
			}

		// pre-loop caches: hoist ontology lookups outside the loop
			$user_name_model = ontology_node::get_model_by_tipo(DEDALO_USER_NAME_TIPO, true);
			$user_label_cache = [];	// [section_id => label] avoids repeated get_valor() calls
			$term_cache = [];		// [tipo => label] avoids repeated get_term_by_tipo() calls

		// aggregation accumulators (associative arrays by key)
			$who_data		= []; // [section_id => {key, label, value}]
			$what_data		= []; // [tipo => {key, label, value}]
			$where_data	= []; // [tipo => {key, label, value}]
			$when_data		= []; // [hour => {key, label, value}]
			$publish_data	= []; // [tipo => {key, label, value}]

		// pre-fill all 24 hours to preserve holes in the when dimension
			for ($i=0; $i < 24; $i++) {
				$when_data[$i] = (object)[
					'key'	=> $i,
					'label'	=> str_pad((string)$i, 2, '0', STR_PAD_LEFT),
					'value'	=> 0
				];
			}

		// single-pass aggregation over all rows
			foreach ($db_result as $row) {

				// totals data. v7 db_result auto-decodes JSON columns.
				// SQO select 'misc->dd1523 as dd1523' returns the JSONB fragment.
				// component_json stores: [{value: [...], lang: 'lg-nolan'}]
				$component_raw_data	= $row->{USER_ACTIVITY_TOTALS_TIPO} ?? null;
				if (empty($component_raw_data)) {
					continue;
				}

				// unwrap component_json data format [{value, lang}] → value array
				$totals = is_array($component_raw_data)
					? ($component_raw_data[0]->value ?? [])
					: (is_object($component_raw_data) ? ($component_raw_data->value ?? []) : []);
				if (empty($totals)) {
					continue;
				}

				// flatten nested arrays to one level
				$totals = array_flatten($totals);

				// resolve user from relation column (needed for who dimension)
				$relations	= $row->relation ?? [];
				$user		= array_find($relations, function($item){
					return isset($item->from_component_tipo) && $item->from_component_tipo===USER_ACTIVITY_USER_TIPO && $item->section_tipo===DEDALO_SECTION_USERS_TIPO;
				});
				$user_key = is_object($user) ? $user->section_id : null;

				// single-pass: iterate totals once, dispatch by type
				$where_actions_total = 0; // accumulated for who dimension

				foreach ($totals as $item) {

					$type = $item->type ?? null;

					// tipo-based dimensions (what/where/publish) share the same aggregation logic
					if ($type==='what' || $type==='where' || $type==='publish') {

						// where items also contribute to the who dimension
						if ($type==='where') {
							$where_actions_total += $item->value;
						}

						$item_key = $item->tipo;
						// select target accumulator by reference
						if ($type==='what') {
							$target = &$what_data;
						}elseif ($type==='where') {
							$target = &$where_data;
						}else{
							$target = &$publish_data;
						}
						if (isset($target[$item_key])) {
							$target[$item_key]->value += $item->value;
						}else{
							// resolve label with cache
							if (!isset($term_cache[$item_key])) {
								$term_cache[$item_key] = ontology_node::get_term_by_tipo($item_key, $lang, true, true);
							}
							$target[$item_key] = (object)[
								'key'	=> $item_key,
								'label'	=> $term_cache[$item_key],
								'value'	=> $item->value
							];
						}
						unset($target);

					}elseif ($type==='when') {

						$hour_key = $item->hour;
						if (isset($when_data[$hour_key])) {
							$when_data[$hour_key]->value += $item->value;
						}else{
							$when_data[$hour_key] = (object)[
								'key'	=> $hour_key,
								'label'	=> str_pad((string)$hour_key, 2, '0', STR_PAD_LEFT),
								'value'	=> $item->value
							];
						}
					}
				}//end foreach totals (single-pass)

				// who dimension: assign accumulated where-actions to the user
				if ($user_key !== null && $where_actions_total > 0) {
					if (isset($who_data[$user_key])) {
						$who_data[$user_key]->value += $where_actions_total;
					}else{
						// resolve user label with cache
						if (!isset($user_label_cache[$user_key])) {
							$component	= component_common::get_instance(
								$user_name_model,
								DEDALO_USER_NAME_TIPO,
								$user->section_id,
								'list',
								$lang,
								$user->section_tipo
							);
							$user_label_cache[$user_key] = $component->get_valor();
						}
						$who_data[$user_key] = (object)[
							'key'	=> $user_key,
							'label'	=> $user_label_cache[$user_key],
							'value'	=> $where_actions_total
						];
					}
				}

			}//end foreach rows

		// convert associative arrays to indexed arrays
			$who_data		= array_values($who_data);
			$what_data		= array_values($what_data);
			$where_data		= array_values($where_data);
			$when_data		= array_values($when_data);
			$publish_data	= array_values($publish_data);

		// sort when by label (hour '00'..'23')
			usort($when_data, fn($a, $b) => $a->label <=> $b->label);

		// build result
			$result = (object)[
				'who'		=> $who_data,
				'what'		=> $what_data,
				'where'		=> $where_data,
				'when'		=> $when_data,
				'publish'	=> $publish_data
			];


		return $result;
	}//end cross_users_range_data



	/**
	* MERGE_RAW_INTO_CANONICAL
	* Fold a flat array of raw activity items (the shape returned by
	* `get_interval_raw_activity_data`) into a canonical totals object
	* `{who, what, where, when, publish}` (the shape returned by
	* `cross_users_range_data`).
	*
	* Used to supplement an aggregated range with extra days that have not
	* been persisted yet (typically the running day, which is intentionally
	* never saved by `update_user_activity_stats`).
	*
	* @param object|null $canonical
	* 	Existing canonical totals to merge into. If null, a fresh object is
	* 	created with empty arrays and a 24-slot pre-filled `when` array.
	* @param array $raw_items
	* 	Flat raw items shaped like:
	* 	  - { type:'what'|'where'|'publish', tipo:string, value:int, label?:string }
	* 	  - { type:'when', hour:int, value:int }
	* @param string $lang
	* 	Language used to resolve labels for new keys. Defaults to DEDALO_DATA_LANG.
	* @return object Canonical totals object with the raw items folded in.
	*/
	public static function merge_raw_into_canonical(?object $canonical, array $raw_items, string $lang=DEDALO_DATA_LANG) : object {

		// initialize a fresh canonical structure when none is provided
		if ($canonical === null) {
			$canonical = (object)[
				'who'		=> [],
				'what'		=> [],
				'where'		=> [],
				'when'		=> [],
				'publish'	=> []
			];
		}

		// ensure every dimension exists as an array (defensive against stale shapes)
		foreach (['who','what','where','when','publish'] as $dim) {
			if (!isset($canonical->{$dim}) || !is_array($canonical->{$dim})) {
				$canonical->{$dim} = [];
			}
		}

		// ensure when is fully populated (24 entries indexed by hour) so we can
		// merge by-hour without index gymnastics
		$when_by_hour = [];
		foreach ($canonical->when as $entry) {
			if (is_object($entry) && isset($entry->key)) {
				$when_by_hour[(int)$entry->key] = $entry;
			}
		}
		for ($h = 0; $h < 24; $h++) {
			if (!isset($when_by_hour[$h])) {
				$when_by_hour[$h] = (object)[
					'key'	=> $h,
					'label'	=> str_pad((string)$h, 2, '0', STR_PAD_LEFT),
					'value'	=> 0
				];
			}
		}

		// build key→entry indexes for O(1) merge
		$index = [
			'what'		=> [],
			'where'		=> [],
			'publish'	=> []
		];
		foreach (['what','where','publish'] as $dim) {
			foreach ($canonical->{$dim} as $entry) {
				if (is_object($entry) && isset($entry->key)) {
					$index[$dim][(string)$entry->key] = $entry;
				}
			}
		}

		// label-resolution cache for new keys
		$term_cache = [];

		// fold raw items
		foreach ($raw_items as $item) {

			if (!is_object($item)) continue;
			$type	= $item->type ?? null;
			$value	= isset($item->value) ? (int)$item->value : 0;
			if ($value === 0) continue;

			if ($type === 'when') {
				$h = isset($item->hour) ? (int)$item->hour : -1;
				if ($h < 0 || $h > 23) continue;
				$when_by_hour[$h]->value += $value;
				continue;
			}

			if ($type === 'what' || $type === 'where' || $type === 'publish') {
				$key = $item->tipo ?? null;
				if (empty($key) || !is_string($key)) continue;

				if (isset($index[$type][$key])) {
					$index[$type][$key]->value += $value;
				} else {
					if (!isset($term_cache[$key])) {
						$term_cache[$key] = $item->label
							?? ontology_node::get_term_by_tipo($key, $lang, true, true);
					}
					$entry = (object)[
						'key'	=> $key,
						'label'	=> $term_cache[$key],
						'value'	=> $value
					];
					$index[$type][$key]	= $entry;
					$canonical->{$type}[]= $entry;
				}
			}
		}

		// rebuild the when array sorted by hour
		ksort($when_by_hour);
		$canonical->when = array_values($when_by_hour);


		return $canonical;
	}//end merge_raw_into_canonical



	/**
	* PARSE_TOTALS_FOR_JS
	* @param object $totals
	* @param  string $tipo = USER_ACTIVITY_SECTION_TIPO
	* @return array $ar_js_obj
	*/
	public static function parse_totals_for_js(object $totals, string $tipo=USER_ACTIVITY_SECTION_TIPO) : array {

		$ar_js_obj = [];

		// who
			$title = ontology_node::get_term_by_tipo(logger_backend_activity::$_COMPONENT_WHO['tipo'], DEDALO_DATA_LANG, true, true);
			$current_obj = new stdClass();
				$current_obj->title			= $title;
				$current_obj->tipo			= $tipo;
				$current_obj->query			= '';
				$current_obj->graph_type	= 'stats_bar';

				$item = new stdClass();
					$item->key		= $title;
					$item->values	= array_map(function($el){
						return (object)[
							'x' => $el->label,
							'y' => $el->value
						];
					}, $totals->who);

				$current_obj->data = [$item];

			$ar_js_obj[] = $current_obj;

		// what
			$title = ontology_node::get_term_by_tipo(logger_backend_activity::$_COMPONENT_WHAT['tipo'], DEDALO_DATA_LANG, true, true);
			$current_obj = new stdClass();
				$current_obj->title			= $title;
				$current_obj->tipo			= $tipo;
				$current_obj->query			= '';
				$current_obj->graph_type	= 'stats_pie';

				$item = new stdClass();
					$item->key		= $title;
					$item->values	= array_map(function($el){
						return (object)[
							'x' => $el->label,
							'y' => $el->value
						];
					}, $totals->what);

				$current_obj->data = [$item];

			$ar_js_obj[] = $current_obj;

		// where
			$title = ontology_node::get_term_by_tipo(logger_backend_activity::$_COMPONENT_WHERE['tipo'], DEDALO_DATA_LANG, true, true);
			$current_obj = new stdClass();
				$current_obj->title			= $title;
				$current_obj->tipo			= $tipo;
				$current_obj->query			= '';
				$current_obj->graph_type	= 'stats_bar_horizontal';

				$item = new stdClass();
					$item->key		= $title;
					$item->values	= array_map(function($el){

						$label = strip_tags($el->label) . ' ['.$el->key.']';

						return (object)[
							'x' => $label,
							'y' => $el->value
						];
					}, $totals->where);

				$current_obj->data = [$item];

			$ar_js_obj[] = $current_obj;

		// publish
			$title = ontology_node::get_term_by_tipo('dd222', DEDALO_DATA_LANG, true, true);
			$current_obj = new stdClass();
				$current_obj->title			= $title;
				$current_obj->tipo			= $tipo;
				$current_obj->query			= '';
				$current_obj->graph_type	= 'stats_bar';

				$item = new stdClass();
					$item->key		= $title;
					$item->values	= array_map(function($el){

						$label = strip_tags($el->label) . ' ['.$el->key.']';

						return (object)[
							'x' => $label,
							'y' => $el->value
						];
					}, $totals->publish);

				$current_obj->data = [$item];

			$ar_js_obj[] = $current_obj;

		// when
			$title = ontology_node::get_term_by_tipo(logger_backend_activity::$_COMPONENT_WHEN['tipo'], DEDALO_DATA_LANG, true, true);
			$current_obj = new stdClass();
				$current_obj->title			= $title;
				$current_obj->tipo			= $tipo;
				$current_obj->query			= '';
				$current_obj->graph_type	= 'stats_bar';

				$item = new stdClass();
					$item->key		= $title;
					$item->values	= array_map(function($el){
						return (object)[
							'x' => strip_tags($el->label),
							'y' => $el->value
						];
					}, $totals->when);

				$current_obj->data = [$item];

			$ar_js_obj[] = $current_obj;


		return $ar_js_obj;
	}//end parse_totals_for_js



	/**
	* DELETE_USER_ACTIVITY_STATS
	* Deletes the previous database records of a given user
	* in table 'matrix_stats' (section dd1521 - User activity)
	* @param int user_id
	* @return bool
	*/
	public static function delete_user_activity_stats( int $user_id ) : bool {

		$sql_query  = 'DELETE' . PHP_EOL;
		$sql_query .= 'FROM "matrix_stats"' . PHP_EOL;
		$sql_query .= 'WHERE section_tipo = $1' . PHP_EOL;
		$sql_query .= 'AND relation @> $2';

		$result	= matrix_db_manager::exec_search($sql_query, [
			'dd1521', // User activity section
			'{"dd1522":[{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'"}]}'
		]);

		if($result===false) {
			$msg = "Failed Delete user stats user_id ($user_id) from matrix_stats";
			debug_log(__METHOD__
				." ERROR: $msg "
				, logger::ERROR
			);
			return false;
		}


		return true;
	}//end delete_user_activity_stats



}//end class diffusion_section_stats
