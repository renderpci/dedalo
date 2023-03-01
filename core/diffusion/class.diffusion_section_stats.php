<?php
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
	* CONSTRUCT
	*/
	function __construct( $caller_section_tipo, $date ) {

		if (empty($caller_section_tipo)) {
			#throw new Exception("Error Processing Request. Empty caller_section_tipo", 1);
		}
		$this->caller_section_tipo = $caller_section_tipo;
		$this->date = $date;


		$this->domain = 'dedalo';
	}//end __construct



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
	* @return array $totals_data
	*/
	public static function get_interval_raw_activity_data(int $user_id, string $date_in, string $date_out) : ?array {

		// tipos
			$what_tipo	= logger_backend_activity::$_COMPONENT_WHAT['tipo'];		// expected dd545
			$where_tipo	= logger_backend_activity::$_COMPONENT_WHERE['tipo'];	// expected dd546
			$when_tipo	= logger_backend_activity::$_COMPONENT_WHEN['tipo'];	// expected dd547

		// base objects
			$what_obj		= new stdClass();
			$where_obj		= new stdClass();
			$when_obj		= new stdClass();
			$publish_obj	= new stdClass();

		// matrix_activity. Get data from current user in range
			$strQuery = '
				SELECT *
				FROM "matrix_activity"
				WHERE
				"date" between \''.$date_in.'\' and \''.$date_out.'\'
				AND datos#>\'{relations}\' @> \'[{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'","from_component_tipo":"dd543"}]\'
				ORDER BY id ASC
			';
			$result = pg_query(DBi::_getConnection(), $strQuery);
			if ($result===false) {
				debug_log(__METHOD__." Error on db execution: ".pg_last_error(), logger::ERROR);
				return null;
			}
				dump($strQuery, ' strQuery ++ '.to_string());

		// iterate found records
		while ($row = pg_fetch_object($result)) {

			$section_id	= (int)$row->section_id;
			$datos		= json_decode($row->datos);

			$found_old_data = false;

			$what_key	= $datos->components->{$what_tipo}->dato->{DEDALO_DATA_NOLAN} ?? false;
			$where_key	= $datos->components->{$where_tipo}->dato->{DEDALO_DATA_NOLAN} ?? false;
			$when_key	= $datos->components->{$when_tipo}->dato->{DEDALO_DATA_NOLAN} ?? false;

			// what
				$key = $what_key;
				if ($key!==false) {

					// deal with old activity data format
					if (!is_string($key)) {
						$key = diffusion_section_stats::format_old_activity_value($key);
						if (empty($key)) {
							debug_log(__METHOD__." ERROR. IGNORED INVALID what DATA $what_tipo - $section_id - ".to_string($key), logger::ERROR);
							continue;
						}else{
							$component_dato = json_decode('{
								"dato": {
									"lg-nolan": "'.$key.'"
								}
							}');
							$datos->components->{$what_tipo} = $component_dato;
							$found_old_data = true;
						}
					}

					// take care to manage publish cases in different way
					switch (true) {
						case ($where_key==='dd1223' || $where_key==='dd271' || $where_key==='dd1224' || $where_key==='dd1225'):
							// last publish first publish, first publish user, last publish user
							// ignore it ..
							break;
						default:
							$what_obj->{$key} = isset($what_obj->{$key})
								? $what_obj->{$key} + 1
								: 1;
							break;
					}
				}

			// where
				$key = $where_key;
				if ($key!==false) {

					// deal with old activity data format
						if (!is_string($key)) {
							$key = diffusion_section_stats::format_old_activity_value($key);
							if (empty($key)) {
								debug_log(__METHOD__." ERROR. IGNORED INVALID where DATA $where_tipo - $section_id - ".to_string($key), logger::ERROR);
								continue;
							}else{
								$component_dato = json_decode('{
									"dato": {
										"lg-nolan": "'.$key.'"
									}
								}');
								$datos->components->{$where_tipo} = $component_dato;
								$found_old_data = true;
							}
						}

					// take care to manage publish cases in different way
						switch (true) {
							case ($key==='dd1223'): // last publish
								// get record msg (dd551) info to calculate published section tipo
								$msg = $datos->components->dd551->dato->{DEDALO_DATA_NOLAN} ?? false;
								if ($msg!==false) {
									$_section_tipo = $msg->top_tipo ?? $msg->section_tipo ?? false;
									if ($_section_tipo!==false) {
										$publish_obj->{$_section_tipo} = isset($publish_obj->{$_section_tipo})
											? $publish_obj->{$_section_tipo} + 1
											: 1;
									}
								}
								break;
							case ($key==='dd271' || $key==='dd1224' || $key==='dd1225'): // first publish, first publish user, last publish user
								// ignore it ..
								break;
							default:
								$where_obj->{$key} = isset($where_obj->{$key})
									? $where_obj->{$key} + 1
									: 1;
								break;
						}
				}//end if ($key!==false)

			// when
				$key = $when_key;
				if ($key!==false) {

					if (!is_string($key)) {
						debug_log(__METHOD__." ERROR. IGNORED INVALID when DATA $when_tipo - $section_id - ".to_string($key), logger::ERROR);
						continue;
					}

					$dd_date	= new dd_date();
					$date_value	= $dd_date->get_date_from_timestamp( $key );
					$hour		= $date_value->hour;

					$when_obj->{$hour} = isset($when_obj->{$hour})
						? $when_obj->{$hour} + 1
						: 1;
				}

			// update old activity data cases
				if ($found_old_data===true) {
					// note that '$datos' is already modified
					diffusion_section_stats::update_activity_data($row, $datos);
				}

		}//end while ($rows = pg_fetch_assoc($result))


		// merge and verticalize data to store it
			$totals_data = [];
			foreach ($what_obj as $key => $value) {
				$item = new stdClass();
					$item->type		= 'what';
					$item->tipo		= $key;
					$item->value	= $value;
				$totals_data[] = $item;
			}
			foreach ($where_obj as $key => $value) {
				$item = new stdClass();
					$item->type		= 'where';
					$item->tipo		= $key;
					$item->value	= $value;
				$totals_data[] = $item;
			}
			foreach ($when_obj as $key => $value) {
				$item = new stdClass();
					$item->type		= 'when';
					$item->hour		= $key;
					$item->value	= $value;
				$totals_data[] = $item;
			}
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
	* FORMAT_OLD_ACTIVITY_VALUE
	*	Old installations could have old activity value.
	*	transform it to current format
	*	expected: [
	*      {
	*        "section_id": "229",
	*        "section_tipo": "dd1"
	*      }
	*    ]
	* @return string|bool $tipo
	*/
	public static function format_old_activity_value($value) : ?string {

		dump($value, ' format_old_activity_value value +++++++++++++++++++++ '.to_string());

		if (is_array($value)) {
			$locator	= reset($value);
			$tipo		= 'dd' . $locator->section_id;
			return $tipo;
		}

		return null;
	}//end format_old_activity_value



	/**
	* UPDATE_ACTIVITY_DATA
	*
	* @param object $row
	* @param object $datos = null
	* @return bool $modified
	*/
	public static function update_activity_data(object $row, object $datos=null) : bool {

		$modified = (!empty($datos));

		$id		= (int)$row->id;
		$datos	= $datos ?? json_decode($row->datos);

		// what
			$component_tipo = logger_backend_activity::$_COMPONENT_WHAT['tipo'];
			if (isset($datos->components->{$component_tipo}->valor)) {

				$key = $datos->components->{$component_tipo}->dato->{DEDALO_DATA_NOLAN} ?? false;
				if ($key) {

					$key = !is_string($key)
						? diffusion_section_stats::format_old_activity_value($key)
						: $key;

					$component_dato = json_decode('{
						"dato": {
							"lg-nolan": '.json_encode($key).'
						}
					}');
					$datos->components->{$component_tipo} = $component_dato;

					$modified = true;
				}
			}

		// where
			$component_tipo = logger_backend_activity::$_COMPONENT_WHERE['tipo'];
			if (isset($datos->components->{$component_tipo}->valor)) {

				$key = $datos->components->{$component_tipo}->dato->{DEDALO_DATA_NOLAN} ?? false;
				if ($key) {

					$key = !is_string($key)
						? diffusion_section_stats::format_old_activity_value($key)
						: $key;

					$component_dato = json_decode('{
						"dato": {
							"lg-nolan": '.json_encode($key).'
						}
					}');
					$datos->components->{$component_tipo} = $component_dato;

					$modified = true;
				}
			}

		// ip
			$component_tipo = logger_backend_activity::$_COMPONENT_IP['tipo'];
			if (isset($datos->components->{$component_tipo}->valor)) {
				$component_dato = json_decode('{
					"dato": {
						"lg-nolan": '.json_encode($datos->components->{$component_tipo}->dato->{DEDALO_DATA_NOLAN}).'
					}
				}');
				$datos->components->{$component_tipo} = $component_dato;

				$modified = true;
			}

		// messages
			$component_tipo = logger_backend_activity::$_COMPONENT_DATOS['tipo'];
			if (isset($datos->components->{$component_tipo}->valor)) {
				$component_dato = json_decode('{
					"dato": {
						"lg-nolan": '.json_encode($datos->components->{$component_tipo}->dato->{DEDALO_DATA_NOLAN}).'
					}
				}');
				$datos->components->{$component_tipo} = $component_dato;

				$modified = true;
			}

		// save
			if ($modified===true) {

				$new_section_dato	= json_encode($datos);
				$table				= 'matrix_activity';
				$strQuery_update	= 'UPDATE "'.$table.'" SET datos = $1 WHERE id = $2';
				$result_update		= pg_query_params(DBi::_getConnection(), $strQuery_update, array( $new_section_dato, $id ));
				if ($result_update===false) {
					$msg = " Error on UPDATE db record on table $table, id: $id. ".pg_last_error();
					debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				}else{
					debug_log(__METHOD__." Update data activity record with old dato format - section_id: $new_section_dato - ".to_string(), logger::WARNING);
				}
				// pg_send_query_params(DBi::_getConnection(), $strQuery_update, array( $new_section_dato, $id ));
				// $res = pg_get_result(DBi::_getConnection());
				debug_log(__METHOD__." Sent record to update activity data found with old dato format. id: $id ".to_string(), logger::WARNING);
			}


		return $modified;
	}//end update_activity_data



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
	*
	* @return int|bool $section_id
	*	The section id created on save
	*/
	public static function save_user_activity(array $totals_data, int $user_id, string $type, int $year, ?int $month=null, ?int $day=null) : int|bool {
			dump($totals_data, ' totals_data ++ '.to_string());
			dump($user_id, ' user_id ++ '.to_string());
			dump($type, ' type ++ '.to_string());
			dump($year, ' year ++ '.to_string());


		// creates a new section
			$section_tipo	= USER_ACTIVITY_SECTION_TIPO; // 'dd1521';
			$section		= section::get_instance(null, $section_tipo, 'edit', false);
			$section_id		= $section->Save();
			if (empty($section_id)) {
				debug_log(__METHOD__." ERROR. UNABLE TO CREATE A NEW SECTION RECORD IN SECTION $section_tipo".to_string(), logger::ERROR);
				return false;
			}

		// user. Int mandatory like: 2
			(function($tipo, $value) use($section_tipo, $section_id){
				$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
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

				$data = [$locator];
				$component->set_dato($data);
				$component->Save();
			})(USER_ACTIVITY_USER_TIPO, $user_id); // dd1522

		// type. String, It can be one of these values: year, month, day
			(function($tipo, $value) use($section_tipo, $section_id){
				$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$data = [$value];
				$component->set_dato($data);
				$component->Save();
			})(USER_ACTIVITY_TYPE_TIPO, $type); // dd1531

		// date
			(function($tipo, $year, $month, $day) use($section_tipo, $section_id){
				$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
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

				$data = new stdClass();
					$data->start = $dd_date;

				$component->set_dato([$data]);
				$component->Save();
			})(USER_ACTIVITY_DATE_TIPO, $year, $month, $day); // dd1530

		// totals. Array of objects mandatory like [{"dd696": 24, "dd693": 110}]
			(function($tipo, $value) use($section_tipo, $section_id){
				$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$component	= component_common::get_instance(
					$model,
					$tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$data = $value;
				$component->set_dato($data);
				$component->Save();
			})(USER_ACTIVITY_TOTALS_TIPO, $totals_data); // dd1523


		return $section_id;
	}//end save_user_activity



	/**
	* UPDATE_USER_ACTIVITY_STATS
	* Function called on user log in / log out
	* It verifies all user activity data history
	* It could take a long time to process (!)
	* @param int $user_id
	* @return object $response
	*/
	public static function update_user_activity_stats( int $user_id ) {
		$start_time = start_time();

		debug_log(__METHOD__." Updating user activity of user: $user_id".to_string(), logger::DEBUG);

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. ';

		// time vars
			$today		= new DateTime();
			$yesterday	= new DateTime(); $yesterday->modify('-1 day'); // or $yesterday->sub(new DateInterval('P1D'));

		// get last saved user activity stats
			$sqo = json_decode('{
			  "section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
			  "limit": 1,
			  "offset": 0,
			  "select": [],
			  "filter": {
			    "$and": [
			      {
			        "q": "[{\"section_tipo\":\"'.DEDALO_SECTION_USERS_TIPO.'\",\"section_id\":\"'.$user_id.'\",\"from_component_tipo\":\"'.USER_ACTIVITY_USER_TIPO.'\"}]",
			        "q_operator": null,
			        "path": [
			          {
			            "section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
			            "component_tipo": "'.USER_ACTIVITY_USER_TIPO.'",
			            "modelo": "component_autocomplete",
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
			          "component_tipo": "'.USER_ACTIVITY_DATE_TIPO.'"
			        }
			      ]
			    }
			  ]
			}');
			// Search records
			$search = search::get_instance(
				$sqo // object sqo
			);
			$search_result	= $search->search();
			$ar_records		= $search_result->ar_records;

			$activity_filter_beginning = isset($ar_records[0])
				? (function($row){

					$section_id		= $row->section_id;
					$section_tipo	= $row->section_tipo;

					$model		= RecordObj_dd::get_modelo_name_by_tipo(USER_ACTIVITY_DATE_TIPO,true);
					$component	= component_common::get_instance(
						$model,
						USER_ACTIVITY_DATE_TIPO,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);
					$dato			= $component->get_dato();
					$current_date	= reset($dato);
					$dd_date		= new dd_date($current_date->start);
					$timestamp		= $dd_date->get_dd_timestamp("Y-m-d");

					// all records after last saved + 1 day
					$begin			= new DateTime($timestamp);
					$beginning_date	= $begin->modify('+1 day')->format("Y-m-d");

					$filter = 'AND date > \''.$beginning_date.'\'';

					return $filter;
				  })($ar_records[0])
				: '';

		// do not include today at any time because it is not complete yet
			$activity_filter_beginning .= ' AND date < \''.$today->format("Y-m-d").'\'';

		// last activity record of current user
			$strQuery = '
				SELECT *
				FROM "matrix_activity"
				WHERE
				datos#>\'{relations}\' @> \'[{"section_tipo":"'.DEDALO_SECTION_USERS_TIPO.'","section_id":"'.$user_id.'","from_component_tipo":"dd543"}]\'
				'.$activity_filter_beginning.'
				ORDER BY date ASC
				LIMIT 1
			';
			$result = pg_query(DBi::_getConnection(), $strQuery);
			if ($result===false) {
				debug_log(__METHOD__." Error on db execution: ".pg_last_error(), logger::ERROR);
				return false;
			}
			$row = pg_fetch_object($result);
			if (!$row || empty($row->date)) {
				debug_log(__METHOD__." Skip. Not calculable result found for user $user_id ".to_string(), logger::DEBUG);
				$response->msg .= 'Skip. Not calculable result found for user '.$user_id;
				return $response;
			}

			// dd date object
				$dd_date	= new dd_date();
				$date_value	= $dd_date->get_date_from_timestamp( $row->date );
				if (empty($date_value->year)) {
					debug_log(__METHOD__." Skip. Not valid date found for user $user_id ".to_string(), logger::ERROR);
					$response->msg .= 'Not valid date found for user '.$user_id;
					return $response;
				}

		// iterate from the beginning, in steps of a day
			$begin	= new DateTime($row->date);
			$end	= $today; // $yesterday; // remember not to include today because it is not finished yet

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

					$totals_data = diffusion_section_stats::get_interval_raw_activity_data(
						$user_id,
						$date_in,
						$date_out
					);

					// if not empty totals_data, add
					if (count($totals_data)>0) {

						$result = diffusion_section_stats::save_user_activity(
							$totals_data,
							$user_id,
							$type='day',
							$i->format("Y"),
							$i->format("m"),
							$i->format("d")
						);

						$updated_days[] = (object)[
							'user'	=> $user_id,
							'date'	=> $i->format("Y-m-d")
						];
					}
				}

		// debug info
			$memory		= tools::get_memory_usage();
			$total_time	= exec_time_unit($start_time,'ms').' ms';
			debug_log(__METHOD__." -> updated_days:  ".to_string($updated_days)." - memory: $memory - total_time: $total_time", logger::DEBUG);

		/// response
			$response->result	= $updated_days;
			$response->msg		= 'OK. Request done. ';


		return $response;
	}//end update_user_activity_stats



	/**
	* CROSS_USERS_RANGE_DATA
	* Used by the widget user_activity (component info in users section)
	* Calculates the whole user activity totals from precalculated data from section user activity.
	* Also it is used to export data to diffusion by the component info that host the widget
	* Date in and user_id are optionals actually
	* @param string $date_in
	*	Like 2020-12-31
	* @param string $date_out
	*	Like 2021-12-31
	* @param int $user_id [optional]
	*	Like 1 . Filter result by user if is not null. Default: null
	* @param string $lang
	*	LIke lg-eng. Used to resolve labels. Default: DEDALO_DATA_LANG
	* @return object | false
	*/
	public static function cross_users_range_data($date_in, $date_out, $user_id=null, $lang=DEDALO_DATA_LANG) {
		$start_time = start_time();

		// dates parse. from 2020-12-30 to {"year":2020,"month":6,"day":1,"time":64937808000}
			$dd_date_in = new dd_date();
			$dd_date_in->get_date_from_timestamp( $date_in );
			$time 		= dd_date::convert_date_to_seconds($dd_date_in);
			$dd_date_in->set_time($time);

			$dd_date_out = new dd_date();
			$dd_date_out->get_date_from_timestamp( $date_out );
			$time 		= dd_date::convert_date_to_seconds($dd_date_out);
			$dd_date_out->set_time($time);

		// user filter
			$user_filter = !is_null($user_id)
				? ',{
			        "q": "[{\"section_tipo\":\"'.DEDALO_SECTION_USERS_TIPO.'\",\"section_id\":\"'.$user_id.'\",\"from_component_tipo\":\"'.USER_ACTIVITY_USER_TIPO.'\"}]",
			        "q_operator": null,
			        "path": [
			          {
			            "section_tipo": "'.USER_ACTIVITY_SECTION_TIPO.'",
			            "component_tipo": "'.USER_ACTIVITY_USER_TIPO.'",
			            "model": "component_autocomplete",
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
	                "q": "{\"start\":{\"op\":null,\"day\":'.$dd_date_in->day.',\"month\":'.$dd_date_in->month.',\"year\":'.$dd_date_in->year.',\"time\":'.$dd_date_in->time.'}}",
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
	                "q": "{\"start\":{\"op\":null,\"day\":'.$dd_date_out->day.',\"month\":'.$dd_date_out->month.',\"year\":'.$dd_date_out->year.',\"time\":'.$dd_date_out->time.'}}",
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
			$search_result	= $search->search();
			$ar_records		= $search_result->ar_records;
			if (empty($ar_records)) {
				return false;
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
						'label'	=> str_pad($i, 2, '0', STR_PAD_LEFT),
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

				$datos	= json_decode($row->datos);
				$totals	= json_decode($datos->components->{USER_ACTIVITY_TOTALS_TIPO}->dato->{DEDALO_DATA_NOLAN});

				// who
				if ($add_who_data===true) {
					// user
						$user = array_find($datos->relations, function($item){
							return $item->from_component_tipo===USER_ACTIVITY_USER_TIPO && $item->section_tipo===DEDALO_SECTION_USERS_TIPO;
						});
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

							$model_name	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_USER_NAME_TIPO, true);
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
				}

				// what
				if ($add_what_data===true) {
					// what totals
						$what_totals = array_filter($totals, function($item){
							return $item->type==='what';
						});
					// add data
						foreach ($what_totals as $item) {

							$item_key = $item->tipo;
							if (isset($what_data_obj->{$item_key})) {
								$what_data_obj->{$item_key}->value += $item->value;
							}else{
								$what_data_obj->{$item_key} = new stdClass();
									$what_data_obj->{$item_key}->key	= $item->tipo;
									$what_data_obj->{$item_key}->label	= RecordObj_dd::get_termino_by_tipo($item->tipo, $lang, true, true);
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
						// dump($where_totals, ' where_totals ++ '.to_string());
					// add data
						foreach ($where_totals as $item) {

							$item_key = $item->tipo;
							if (isset($where_data_obj->{$item_key})) {
								$where_data_obj->{$item_key}->value += $item->value;
							}else{
								$where_data_obj->{$item_key} = new stdClass();
									$where_data_obj->{$item_key}->key	= $item->tipo;
									$where_data_obj->{$item_key}->label	= RecordObj_dd::get_termino_by_tipo($item->tipo, $lang, true, true);
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
									$publish_data_obj->{$item_key}->label	= RecordObj_dd::get_termino_by_tipo($item->tipo, $lang, true, true);
									$publish_data_obj->{$item_key}->value	= $item->value;
							}
						}
				}

			}//end foreach  rows

		// convert data objects to vertical array
			foreach ($who_data_obj as $key => $value) {
				$who_data[] = $value;
			}
			foreach ($what_data_obj as $key => $value) {
				$what_data[] = $value;
			}
			foreach ($where_data_obj as $key => $value) {
				$where_data[] = $value;
			}
			foreach ($when_data_obj as $key => $value) {
				$when_data[] = $value;
			}
			foreach ($publish_data_obj as $key => $value) {
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



}//end class diffusion_section_stats