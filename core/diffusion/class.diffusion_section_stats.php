<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_SECTION_STATS
* Manages user activity methods
*/

// tipo of daily statistics sections
	define('DEDALO_DAILY_STATS_SECTION_TIPO',	'dd70');

// section user activity stat
	define('USER_ACTIVITY_SECTION_TIPO',		'dd1521');
	define('USER_ACTIVITY_USER_TIPO',			'dd1522');
	define('USER_ACTIVITY_TYPE_TIPO',			'dd1531');
	define('USER_ACTIVITY_DATE_TIPO',			'dd1530');
	define('USER_ACTIVITY_TOTALS_TIPO',			'dd1523');



class diffusion_section_stats extends diffusion {



	/**
	* class vars
	* @var
	*/
		protected $section_tipo;
		protected $caller_section_tipo;
		protected $section_stats_tipo;		// Like dd70
		protected $ar_diffusion_section;
		protected $date;
		protected $diffusion_map_object;	// Current stored diffusion_map data
		protected $js_ar_obj;	// Final object for send to JAVASCRIPT diffusion_section_stats.build_charts
		static $geoip_mm;



	/**
	* UPDATE_USER_ACTIVITY_STATS
	* Function called on user log out / Quit
	* It verifies all user activity data history
	* It could take a long time to process (!)
	* @param int $user_id
	* @return object $response
	*/
	public static function update_user_activity_stats( int $user_id ) : object {
		$start_time = start_time();

		debug_log(__METHOD__
			." Updating user activity of user: $user_id"
			, logger::WARNING
		);

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. ';
			$response->errors	= [];

		// time vars
			$today		= new DateTime();
			$yesterday	= new DateTime(); $yesterday->modify('-1 day'); // or $yesterday->sub(new DateInterval('P1D'));

		// last saved user activity stats (looks section 'dd1521' to get last record by date)
			$sqo = json_decode('{
				"section_tipo": ["'.USER_ACTIVITY_SECTION_TIPO.'"],
				"limit": 1,
				"offset": 0,
				"select": [],
				"filter": {
				"$and": [
					{
					"q": {
						"section_tipo" : "'.DEDALO_SECTION_USERS_TIPO.'",
						"section_id" : "'.$user_id.'",
						"from_component_tipo" : "'.USER_ACTIVITY_USER_TIPO.'"
					},
					"q_operator": null,
					"path": [
						{
						"section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
						"component_tipo": "'.USER_ACTIVITY_USER_TIPO.'",
						"model": "'.ontology_node::get_model_by_tipo(USER_ACTIVITY_USER_TIPO,true).'",
						"name": "User"
						}
					]
					}
				]
				},
				"order": [
				{
					"direction": "DESC",
					"path": [
					{
						"name": "Date",
						"model": "component_date",
						"section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
						"component_tipo": "'.USER_ACTIVITY_DATE_TIPO.'",
						"column": "jsonb_path_query_first('.USER_ACTIVITY_SECTION_TIPO.'.datos, \'strict $.components.'.USER_ACTIVITY_DATE_TIPO.'.dato.\"lg-nolan\"[0].start.time\', silent => true)"
					}
					]
				},
				{
					"direction": "DESC",
					"path": [
					{
						"component_tipo": "section_id",
						"model": "component_section_id",
						"name": "ID",
						"section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'"
					}
					]
				}
				]
			}');
			$search_query_object = new search_query_object($sqo);

			// Search records
			$search = search::get_instance(
				$search_query_object // object sqo
			);
			$db_result = $search->search();

			$row = $db_result->fetch_one();

			// query params
			$params = [
				'{"dd543":[{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'"}]}'
			];

			// placehoders
			$placeholders = 2; // Start with 2 because the first placeholder is the relation

			// activity_filter_beginning. Builds a SQL sentence as 'AND date > '2025-03-07''
			// for filter results in the next query against matrix_activity
			$filter_sentences = [];
			if( !empty($row) ) {
				$section_id		= $row->section_id;
				$section_tipo	= $row->section_tipo;

				$model		= ontology_node::get_model_by_tipo(USER_ACTIVITY_DATE_TIPO,true);
				$component	= component_common::get_instance(
					$model,
					USER_ACTIVITY_DATE_TIPO,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$data = $component->get_data();
				$current_date = $data[0] ?? null;
				if (empty($current_date)) {
					debug_log(__METHOD__
						. " Skip. Not valid date found for user" . PHP_EOL
						. 'current_date: '.to_string($current_date)
						, logger::ERROR
					);
				}else{
					$dd_date	= new dd_date($current_date->start);
					$timestamp	= $dd_date->get_dd_timestamp("Y-m-d");

					// all records after last saved + 1 day
					$begin			= new DateTime($timestamp);
					$beginning_date	= $begin->modify('+1 day')->format("Y-m-d");

					$filter = '"timestamp" > $' . $placeholders;
					$placeholders++;

					$filter_sentences[] = $filter;
					$params[] = $beginning_date;
				}
			}

			// do not include today in any case because it is not yet complete.
			$end_date = $today->format("Y-m-d");
			$filter_sentences[] = '"timestamp" < $'.$placeholders;
			$params[] = $end_date;
			$placeholders++;

		// search last activity record of current user
			$sql_query  = 'SELECT *' . PHP_EOL;
			$sql_query .= 'FROM "matrix_activity"' . PHP_EOL;
			$sql_query .= 'WHERE relation @> $1' . PHP_EOL;
			$sql_query .= 'AND '.implode(' AND ', $filter_sentences) . PHP_EOL;
			$sql_query .= 'ORDER BY id ASC' . PHP_EOL;
			$sql_query .= 'LIMIT 1';

			$result = matrix_db_manager::exec_search($sql_query, $params);

			if ($result===false) {
				debug_log(__METHOD__." Error on db execution: ".pg_last_error(), logger::ERROR);
				$response->errors[] = 'failed database execution';
				return $response;
			}
			// get last activity record in raw db format (not processed)
			$activity_row = pg_fetch_object($result);			
			if (!$activity_row || empty($activity_row->timestamp)) {
				debug_log(__METHOD__." Skip. Not calculable result found for user $user_id ".to_string(), logger::WARNING);
				$response->msg .= 'Skip. Not calculable result found for user '.$user_id;
				$response->errors[] = 'Skip. Not calculable result found for user '.$user_id;
				$response->result = true;
				return $response;
			}

			// dd date object from column 'timestamp' (example: '2024-12-05 09:07:33.248847')
				$date_value	= dd_date::get_dd_date_from_timestamp( $activity_row->timestamp );
				if (empty($date_value->year)) {
					debug_log(__METHOD__
						." Skip. Not valid date found for user $user_id "
						, logger::ERROR
					);
					$response->msg .= 'Not valid date found for user '.$user_id;
					$response->errors[] = 'invalid date from activity row: ' .$activity_row->section_id;
					return $response;
				}

		// iterate from the beginning, in steps of a day
			$begin	= new DateTime($activity_row->timestamp);
			$end	= $today; // remember do not include today because it is not finished yet

			// by day
			$updated_days = [];
			for($i = $begin; $i <= $end; $i->modify('+1 day')){

				// date_in
					$current_date	= $i->format("Y-m-d");
					$date_in		= $current_date;

				// date_out
					$i_clon		= clone $i;
					$i_clon->modify('+1 day');
					$date_out	= $i_clon->format("Y-m-d");

				// interval_raw_activity_data
				$totals_data = diffusion_section_stats::get_interval_raw_activity_data(
					$user_id,
					$date_in,
					$date_out
				);
			
				// if not empty totals_data, add
				if ($totals_data && count($totals_data)>0) {

					// save_user_activity
					$result = diffusion_section_stats::save_user_activity(
						$totals_data, // array totals_data
						$user_id, // int user_id
						'day', // string type
						(int)$i->format("Y"), // int year
						(int)$i->format("m"), // int month
						(int)$i->format("d") // int day
					);

					// updated_days add
					$updated_days[] = (object)[
						'user'	=> $user_id,
						'date'	=> $i->format("Y-m-d")
					];
				}
			}//end for($i = $begin; $i <= $end; $i->modify('+1 day'))

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

		// models
			$what_model	= ontology_node::get_model_by_tipo($what_tipo, true);
			$where_model = ontology_node::get_model_by_tipo($where_tipo, true);
			$when_model	= ontology_node::get_model_by_tipo($when_tipo, true);
			$data_model	= ontology_node::get_model_by_tipo($data_tipo, true);

		// base objects
			$what_obj	= new stdClass();
			$where_obj	= new stdClass();
			$when_obj	= new stdClass();
			$publish_obj= new stdClass();

		// matrix_activity. Get data from current user in range
			$sql_query  = 'SELECT section_tipo, section_id' . PHP_EOL;
			$sql_query .= 'FROM "matrix_activity"' . PHP_EOL;
			$sql_query .= 'WHERE "timestamp" between $1 and $2' . PHP_EOL;
			$sql_query .= 'AND relation @> $3' . PHP_EOL;
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

			$current_section_id	= $row->section_id;
			$current_section_tipo = $row->section_tipo;

			// what (dd545) component_autocomplete
				$component = component_common::get_instance(
					$what_model,
					$what_tipo,
					$current_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_section_tipo
				);
				$what_data = $component->get_data();
				// update $what_obj adding counters to the object (passed what_obj by reference)
				self::build_what( $what_data, $what_obj );

			// where (dd546) component_input_text
				$component = component_common::get_instance(
					$where_model,
					$where_tipo,
					$current_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_section_tipo
				);
				$where_data = $component->get_data(); // Like: [{"id":1,"lang":"lg-nolan","value":"dd1223"}]
				if (!empty($where_data)) {

					$key = $where_data[0]->value; // Like: dd1223
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
								// get record msg (dd551) info to calculate published section tipo								
								$component = component_common::get_instance(
									$data_model,
									$data_tipo,
									$current_section_id,
									'list',
									DEDALO_DATA_NOLAN,
									$current_section_tipo
								);
								$data_data = $component->get_data();
								$msg = $data_data[0]->value ?? false;
								if ($msg!==false) {
									$_section_tipo = $msg->top_tipo ?? $msg->section_tipo ?? false;
									if ($_section_tipo!==false) {
										// Optimized: use null coalescing operator
										$publish_obj->{$_section_tipo} = ($publish_obj->{$_section_tipo} ?? 0) + 1;
									}
								}
								break;
							case ($key==='dd271' || $key==='dd1224' || $key==='dd1225'): // first publish, first publish user, last publish user
								// ignore it ..
								break;
							default:
								// Optimized: use null coalescing operator
								$where_obj->{$key} = ($where_obj->{$key} ?? 0) + 1;
								break;
						}
					}
				}//end where

			// when (dd547) component_date
				$component = component_common::get_instance(
					$when_model,
					$when_tipo,
					$current_section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_section_tipo
				);
				$when_data = $component->get_data(); // Like: [{"id":1,"start":{"day":26,"hour":12,"time":65098039018,"year":2025,"month":5,"minute":36,"second":58}}]	
				if (!empty($when_data)) {

					if (isset($when_data[0]->start) && isset($when_data[0]->start->hour)) {
						$hour = $when_data[0]->start->hour;
						// Optimized: use null coalescing operator
						$when_obj->{$hour} = ($when_obj->{$hour} ?? 0) + 1;
					}
				}//end when

		}//end while ($rows = pg_fetch_assoc($result))

		// free result
		pg_free_result($result);

		// merge and verticalize data to store it
		// Optimization: batch-fetch labels for 'what' items to avoid N+1 query pattern
			$what_labels = [];
			if (!empty((array)$what_obj)) {
				$what_tipos = array_keys((array)$what_obj);
				foreach ($what_tipos as $tipo) {
					$what_labels[$tipo] = ontology_node::get_term_by_tipo($tipo);
				}
			}

		// Optimization: pre-allocate array for better memory efficiency
			$total_size = count((array)$what_obj) + count((array)$where_obj) + 
			              count((array)$when_obj) + count((array)$publish_obj);
			$totals_data = [];
			
			if ($total_size > 0) {
				$totals_data = array_fill(0, $total_size, null);
				$index = 0;

				// what
				foreach ($what_obj as $key => $value) {
					$item = new stdClass();
						$item->type		= 'what';
						$item->tipo		= $key;
						$item->value	= $value;
						$item->label	= $what_labels[$key] ?? null; // use pre-fetched label
					$totals_data[$index++] = $item;
				}
				// where
				foreach ($where_obj as $key => $value) {
					$item = new stdClass();
						$item->type		= 'where';
						$item->tipo		= $key;
						$item->value	= $value;
					$totals_data[$index++] = $item;
				}
				// when
				foreach ($when_obj as $key => $value) {
					$item = new stdClass();
						$item->type		= 'when';
						$item->hour		= $key;
						$item->value	= $value;
					$totals_data[$index++] = $item;
				}
				// publish
				foreach ($publish_obj as $key => $value) {
					$item = new stdClass();
						$item->type		= 'publish';
						$item->tipo		= $key;
						$item->value	= $value;
					$totals_data[$index++] = $item;
				}
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
	* @param array $data
	* @param object &$what_obj
	* @return object $what_obj
	*/
	public static function build_what( array $data, object &$what_obj ) : object {

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
	* SAVE_USER_ACTIVITY
	* Creates a new record on user activity section and
	* store all data (user, type, date, totals)
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
			$section_tipo	= USER_ACTIVITY_SECTION_TIPO; // 'dd1521';
			$section		= section::get_instance(
				$section_tipo
			);
			$section_id	= $section->create_record();
			if (empty($section_id)) {
				debug_log(__METHOD__
					." ERROR. Unable to create a new section record in section '$section_tipo'"
					, logger::ERROR
				);
				return false;
			}

		// user. component_portal
			(function($tipo, $value) use($section_tipo, $section_id){
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
					$locator->set_section_id($value);
					$locator->set_type(DEDALO_RELATION_TYPE_LINK);
					$locator->set_from_component_tipo($tipo);

				$component->set_data([$locator]);
				$component->save();
			})(USER_ACTIVITY_USER_TIPO, $user_id); // dd1522

		// type. component_input_text. String, It can be one of these values: year, month, day
			(function($tipo, $value) use($section_tipo, $section_id){
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$data_item = new stdClass();
					$data_item->value = $value;
					$data_item->lang = DEDALO_DATA_NOLAN;
				
				$component->set_data([$data_item]);
				$component->save();
			})(USER_ACTIVITY_TYPE_TIPO, $type); // dd1531

		// date. component_date
			(function($tipo, $year, $month, $day) use($section_tipo, $section_id){
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$date = new stdClass();
					$date->year		= $year;
					$date->month	= $month;
					$date->day		= $day;

				$dd_date = new dd_date($date);

				$data_item = new stdClass();
					$data_item->start = $dd_date;

				$component->set_data([$data_item]);
				$component->save();
			})(USER_ACTIVITY_DATE_TIPO, $year, $month, $day); // dd1530

		// totals. component_json. Array of objects mandatory like [{"dd696": 24, "dd693": 110}]
			(function($tipo, $value) use($section_tipo, $section_id){
				$model		= ontology_node::get_model_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$data_item = new stdClass();
					$data_item->value = $value;
					$data_item->lang = DEDALO_DATA_NOLAN;
				
				$component->set_data([$data_item]);
				$component->save();
			})(USER_ACTIVITY_TOTALS_TIPO, $totals_data); // dd1523

		// debug
			debug_log(__METHOD__.
				" Saved user activity. section_tipo: '$section_tipo', section_id: '$section_id', Totals: ".
				PHP_EOL. to_string($totals_data),
				logger::WARNING
			);


		return $section_id;
	}//end save_user_activity



	/**
	* CROSS_USERS_RANGE_DATA
	* Used by the widget user_activity (component info in users section)
	* Calculates the whole user activity totals from precalculated data from section user activity.
	* Also it is used to export data to diffusion by the component info that host the widget
	* Date in and user_id are optional actually
	* @param string $date_in
	*	Like '2020-12-31'
	* @param string $date_out
	*	Like '2021-12-31'
	* @param int|null $user_id = null
	*	[optional] Like 1 . Filter result by user if is not null. Default: null
	* @param string $lang = DEDALO_DATA_LAN
	*	Like 'lg-eng'. Used to resolve labels. Default: DEDALO_DATA_LANG
	* @return object|null $totals
	*/
	public static function cross_users_range_data(string $date_in, string $date_out, ?int $user_id=null, string $lang=DEDALO_DATA_LANG) : ?object {

		// dates parse. from 2020-12-30 to {"year":2020,"month":6,"day":1,"time":64937808000}
			$dd_date_in	= dd_date::get_dd_date_from_timestamp($date_in);
			$time		= dd_date::convert_date_to_seconds($dd_date_in);
			$dd_date_in->set_time($time);

			$dd_date_out	= dd_date::get_dd_date_from_timestamp($date_out);
			$time			= dd_date::convert_date_to_seconds($dd_date_out);
			$dd_date_out->set_time($time);

		// user filter
			$user_filter = !is_null($user_id)
				? ',{
			        "q": [{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'","from_component_tipo":"'.USER_ACTIVITY_USER_TIPO.'"}],
			        "q_operator": null,
			        "path": [
			          {
			            "section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
			            "component_tipo": "'.USER_ACTIVITY_USER_TIPO.'",
			            "model": "'. ontology_node::get_model_by_tipo(USER_ACTIVITY_USER_TIPO,true) .'",
			            "name": "User"
			          }
			        ]
			      }'
				: '';

		// get all user activity records from user_activity_section in the range
			$sqo = json_decode('{
			  "section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
			  "limit": 0,
			  "offset": 0,
			  "select": [],
			  "filter": {
			    "$and": [
			      {
	                "q": {"start":{"op":null,"day":'.$dd_date_in->day.',"month":'.$dd_date_in->month.',"year":'.$dd_date_in->year.',"time":'.$dd_date_in->time.'}},
	                "q_operator": ">",
	                "path": [
			          {
			            "section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
			            "component_tipo": "'.USER_ACTIVITY_DATE_TIPO.'",
			            "model": "component_date",
			            "name": "Date"
			          }
			        ]
			      },
			      {
	                "q": {"start":{"op":null,"day":'.$dd_date_out->day.',"month":'.$dd_date_out->month.',"year":'.$dd_date_out->year.',"time":'.$dd_date_out->time.'}},
	                "q_operator": "<=",
	                "path": [
			          {
			            "section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
			            "component_tipo": "'.USER_ACTIVITY_DATE_TIPO.'",
			            "model": "component_date",
			            "name": "Date"
			          }
			        ]
			      }
			      '.$user_filter.'
			    ]
			  },
			  "order": [
			    {
			      "direction": "ASC",
			      "path": [
			        {
			          "name": "Date",
			          "model": "component_date",
			          "section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
			          "component_tipo": "'.USER_ACTIVITY_DATE_TIPO.'"
			        }
			      ]
			    }
			  ]
			}');

			# Search records
			$search	= search::get_instance(
				$sqo // object sqo
			);
			$db_result	= $search->search();
			$total		= $db_result->row_count();
			if ($total===0) {
				return null;
			}

		// add selectors
			$add_who_data		= true;
			$add_what_data		= true;
			$add_where_data		= true;
			$add_when_data		= true;
			$add_publish_data	= true;

		// data
			$who_data		= [];
			$what_data		= [];
			$where_data		= [];
			$when_data		= [];
			$publish_data	= [];

		// objects
			$who_data_obj		= new stdClass();
			$what_data_obj		= new stdClass();
			$where_data_obj		= new stdClass();
			$when_data_obj		= new stdClass();
			$publish_data_obj	= new stdClass();

			// add all hours to preserve holes
				for ($i=0; $i < 24; $i++) {
					$when_data_obj->{$i} = (object)[
						'key'	=> $i,
						'label'	=> str_pad((string)$i, 2, '0', STR_PAD_LEFT),
						'value'	=> 0
					];
				}

			// who: exclude section info tipos to avoid fake totals
				// $ar_exclude_tipos = [
				// 	'dd200', // Created by user
				// 	'dd199', // Creation date
				// 	'dd197', // Modified by user
				// 	'dd201', // Modification date
				// 	'dd271', // First publication
				// 	'dd1223', // Last publication
				// 	'dd1224', // First publication user
				// 	'dd1225' //  Last publication user
				// ];

			foreach ($ar_records as $row) {

				$datos	= $row->datos;
				$totals	= $datos->components->{USER_ACTIVITY_TOTALS_TIPO}->dato->{DEDALO_DATA_NOLAN};

				// legacy values check
					if (is_array($totals) && isset($totals[0]) && is_string($totals[0])) {
						$totals[0] = json_decode($totals[0]);
					}
					if (is_string($totals)) {
						$totals = json_decode($totals);
					}

				// format legacy data to one level
				$totals	= array_flatten($totals);

				// who
				if ($add_who_data===true) {
					// user
					$user = array_find($datos->relations ?? [], function($item){
						return $item->from_component_tipo===USER_ACTIVITY_USER_TIPO && $item->section_tipo===DEDALO_SECTION_USERS_TIPO;
					});
					if (is_object($user)) {

						// actions totals (extracted from where totals)
							$actions_totals = array_reduce($totals, function($carry, $item) {
								if ($item->type==='where') {
									$carry += $item->value;
								}
								return $carry;
							}, 0);

						// add data
							$item_key = $user->section_id;
							if (isset($who_data_obj->{$item_key})) {
								$who_data_obj->{$item_key}->value += $actions_totals;
							}else{

								$model_name	= ontology_node::get_model_by_tipo(DEDALO_USER_NAME_TIPO, true);
								$component	= component_common::get_instance(
									$model_name,
									DEDALO_USER_NAME_TIPO,
									$user->section_id,
									'list',
									$lang,
									$user->section_tipo
								);
								$label = $component->get_valor();

								$who_data_obj->{$item_key} = new stdClass();
									$who_data_obj->{$item_key}->value	= $actions_totals;
									$who_data_obj->{$item_key}->label	= $label;
									$who_data_obj->{$item_key}->key		= $user->section_id;
							}
					}//end if (is_object($user))
				}

				// what
				if ($add_what_data===true) {
					// what totals
						$what_totals = array_filter($totals, function($item){
							return isset($item->type) && $item->type==='what';
						});
					// add data
						foreach ($what_totals as $item) {

							$item_key = $item->tipo;
							if (isset($what_data_obj->{$item_key})) {
								$what_data_obj->{$item_key}->value += $item->value;
							}else{
								$what_data_obj->{$item_key} = new stdClass();
									$what_data_obj->{$item_key}->key	= $item->tipo;
									$what_data_obj->{$item_key}->label	= ontology_node::get_term_by_tipo($item->tipo, $lang, true, true);
									$what_data_obj->{$item_key}->value	= $item->value;
							}
						}
				}

				// where
				if ($add_where_data===true) {
					// where totals
						$where_totals = array_filter($totals, function($item){
							return $item->type==='where';
						});
					// add data
						foreach ($where_totals as $item) {

							$item_key = $item->tipo;
							if (isset($where_data_obj->{$item_key})) {
								$where_data_obj->{$item_key}->value += $item->value;
							}else{
								$where_data_obj->{$item_key} = new stdClass();
									$where_data_obj->{$item_key}->key	= $item->tipo;
									$where_data_obj->{$item_key}->label	= ontology_node::get_term_by_tipo($item->tipo, $lang, true, true);
									$where_data_obj->{$item_key}->value	= $item->value;
							}
						}
				}

				// when
				if ($add_when_data===true) {
					// when totals
						$when_totals = array_filter($totals, function($item){
							return $item->type==='when';
						});
					// add data
						foreach ($when_totals as $item) {

							$item_key = $item->hour;
							if (isset($when_data_obj->{$item_key})) {
								$when_data_obj->{$item_key}->value += $item->value;
							}else{
								$when_data_obj->{$item_key} = new stdClass();
									$when_data_obj->{$item_key}->key	= $item->hour;
									$when_data_obj->{$item_key}->label	= str_pad($item->hour, 2, '0', STR_PAD_LEFT);
									$when_data_obj->{$item_key}->value	= $item->value;
							}
						}
				}

				// publish
				if ($add_publish_data===true) {
					// publish totals
						$publish_totals = array_filter($totals, function($item){
							return $item->type==='publish';
						});
					// add data
						foreach ($publish_totals as $item) {
							$item_key = $item->tipo;
							if (isset($publish_data_obj->{$item_key})) {
								$publish_data_obj->{$item_key}->value += $item->value;
							}else{
								$publish_data_obj->{$item_key} = new stdClass();
									$publish_data_obj->{$item_key}->key		= $item->tipo;
									$publish_data_obj->{$item_key}->label	= ontology_node::get_term_by_tipo($item->tipo, $lang, true, true);
									$publish_data_obj->{$item_key}->value	= $item->value;
							}
						}
				}

			}//end foreach  rows

		// convert data objects to vertical array
			foreach ($who_data_obj as $value) {
				$who_data[] = $value;
			}
			foreach ($what_data_obj as $value) {
				$what_data[] = $value;
			}
			foreach ($where_data_obj as $value) {
				$where_data[] = $value;
			}
			foreach ($when_data_obj as $value) {
				$when_data[] = $value;
			}
			foreach ($publish_data_obj as $value) {
				$publish_data[] = $value;
			}

		// sort
			$cmp_label = function($_a, $_b) {
				$a = $_a->label;
				$b = $_b->label;

				if ($a == $b) {
					return 0;
				}
			    return ($a < $b) ? -1 : 1;
			};
			usort($when_data, $cmp_label);

		$totals = new stdClass();
			$totals->who		= $who_data;
			$totals->what		= $what_data;
			$totals->where		= $where_data;
			$totals->when		= $when_data;
			$totals->publish	= $publish_data;


		return $totals;
	}//end cross_users_range_data



	/**
	* PARSE_TOTALS_FOR_JS
	* @param object $totals
	* @param  string $tipo = USER_ACTIVITY_SECTION_TIPO
	* @return array $ar_js_obj
	*/
	public static function parse_totals_for_js(object $totals, string $tipo=USER_ACTIVITY_SECTION_TIPO) : array {

		$ar_js_obj = [];

		// Working here !
			debug_log(__METHOD__
				. " Working here ! "
				, logger::ERROR
			);
			return [];

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
