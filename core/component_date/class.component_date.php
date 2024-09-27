<?php
declare(strict_types=1);
/**
* CLASS COMPONENT DATE
* used to manage dates, component_date use a object to represent dates, ISO dates as '2012-11-07 17:33:49' will be transform to object format as:
* {
*	"year": 2012,
*	"month": 11,
*	"day": 07,
*	"hour": 17,
*	"minute": 33,
*	"second": 49
* }
* Dates are objects enclosed with start and/or end container
* [{
*	"start" : {
*		"year": 2012,
*		"month": 11,
*		"day": 07,
*		"hour": 17,
*		"minute": 33,
*		"second": 49
* 		},
*	"end" : {
*		"year": 2012,
*		"month": 12,
*		"day": 08,
*		"hour": 22,
*		"minute": 15,
*		"second": 35
*		}
* }]
* The component has 4 different modes:
* 	date: with start date only
* 	range: with start date and end date
* 	period: with year, moth, day, hour, minute, second, millisecond
* 	time: with hour, minute, second, millisecond
*
* Export value use a
*/
class component_date extends component_common {



	// American data format
	public static $ar_american = ['lg-eng','lg-angl','lg-ango','lg-meng'];



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo=null, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// Force always DEDALO_DATA_NOLAN
		$this->lang = DEDALO_DATA_NOLAN;

		// We create the component normally
		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);

		if(SHOW_DEBUG===true) {
			if ($this->RecordObj_dd->get_traducible()==='si') {
				debug_log(__METHOD__
					." Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is NOT 'traducible'. Please fix this ASAP"
					, logger::ERROR);
			}
		}
	}//end __construct



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method
	* @return int|null $section_id
	*/
	public function Save() : ?int {

		// dato
			$dato = $this->dato;

		// deleting date case
			if (empty($dato)) {
				// saving empty value
				return parent::Save();
			}

		// dato format verify
			if ( !is_array($dato) ) {
				if(SHOW_DEBUG===true) {
					dump($dato, ' component_date dato +++++++++++++++++++++++++++ '.to_string($this->tipo));
					debug_log(__METHOD__
						." Bad date format. Expected array ".gettype($dato)
						, logger::ERROR
					);
				}
				return null;
			}

		// add_time to dato (always)
			foreach ($dato as $key => $current_dato) {
				if(!empty($current_dato)){
					$this->dato[$key] = self::add_time( $current_dato );
				}
			}

		// from here, save normally
			$result = parent::Save();


		return $result;
	}//end Save



	/**
	* GET_DATO
	* @return array|null $dato
	* Dato change to object with year, month, day, hour, minute, second separated in key->value like
	* [{"start":{
	*    "year": -500000,
	*    "month": 10,
	*    "day": 3,
	*    "hour": 19,
	*    "minute": 56,
	*    "second": 43
	* }}]
	*/
	public function get_dato() {

		$dato = parent::get_dato();

		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	* @return bool
	*/
	public function set_dato($dato) : bool {

		// string case (JSON encoded value)
		if (is_string($dato)) {
			$dato = json_handler::decode($dato);
		}

		// if (is_null($dato) || empty($dato)) {
		// 	$dato = array();
		// }

		// Compatibility with version 4.0.14 to 4.7 dedalo installations
		if ( is_object($dato) && !empty(get_object_vars($dato)) ) {
			$dato = [$dato];
		}


		return parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET_DATE_MODE
	* Get date_mode from ontology definition of the component
	* @return string
	*/
	public function get_date_mode() {

		$properties	= $this->get_properties();
		$date_mode	= $properties->date_mode ?? 'date';

		return $date_mode;
	}//end get_date_mode



	/**
	* GET_DATE_NOW
	* Get current full date (with hours, minutes and seconds) as dd_date object
	* @return object dd_date
	*/
	public static function get_date_now() {

		$date = new DateTime();

		// dd_date
			$dd_date = new dd_date();
				$dd_date->set_year( 	$date->format('Y') ); // $date->format('Y-m-d H:i:s'); # Default as DB format
				$dd_date->set_month( 	$date->format('m') );
				$dd_date->set_day( 		$date->format('d') );
				$dd_date->set_hour( 	$date->format('H') );
				$dd_date->set_minute(	$date->format('i') );
				$dd_date->set_second( 	$date->format('s') );

		// add time
			$time = dd_date::convert_date_to_seconds($dd_date);
			$dd_date->set_time( $time );


		return $dd_date;
	}//end get_date_now



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// ddo. set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

		// column_obj
			$column_obj			= isset($this->column_obj)
				? $this->column_obj
				: (object)[
					'id' => $this->section_tipo.'_'.$this->tipo
				  ];

		// short vars
			$label		= $this->get_label();
			$properties	= $this->get_properties();
			$date_mode	= $this->get_date_mode();


		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// fields_separator
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ' <> ');

		// ar_values
			$ar_values	= [];
			$data		= $this->get_dato();
			if (!empty($data)) {
				foreach ($data as $key => $current_dato) {

					$ar_values[$key] = ''; // default

					if(empty($current_dato)) {
						continue;
					}

					$ar_values[$key] = self::data_item_to_value($current_dato, $date_mode);
				}//end foreach ($data as $key => $current_dato)
			}

		// flat_value (array of one value full resolved)
			$flat_value = [implode($records_separator, $ar_values)];


		// dd_grid_cell_object
			$value = new dd_grid_cell_object();
				$value->set_type('column');
				$value->set_label($label);
				$value->set_cell_type('text');
				$value->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$value->set_class_list($class_list);
				}
				$value->set_fields_separator($fields_separator);
				$value->set_records_separator($records_separator);
				$value->set_value($flat_value);


		return $value;
	}//end get_grid_value



	/**
	* DATA_ITEM_TO_VALUE
	* Converts each data item to value (one by one)
	* based on $date_mode (range,period,time,date)
	* @param object $data_item
	* data_item sample:
	* {
	*    "start": {
	*        "day": 8,
	*        "hour": 12,
	*        "time": 64638475292,
	*        "year": 2011,
	*        "month": 2,
	*        "minute": 1,
	*        "second": 32
	*    }
	* }
	* @param string $date_mode
	* 	Sample: 'range'
	* @param string $sep = '/'
	* 	Sample '/'
	* @return string $item_value
	* sample:
	* -Y/m/d<>-Y/m/d
	* -200/5/22<>15/8/1
	*/
	public static function data_item_to_value(object $data_item, string $date_mode, string $sep='/') : string {

		$item_value = '';

		switch ($date_mode) {

			case 'range':
				// start
				if(isset($data_item->start) && is_object($data_item->start)) {
					$dd_date = new dd_date($data_item->start);
					if(isset($data_item->start->day)) {
						$valor_start = $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d');
					}else{
						$valor_start = isset($data_item->start->month)
							? $dd_date->get_dd_timestamp('Y'.$sep.'m')
							: $dd_date->get_dd_timestamp('Y', $padding=false);
					}
					$item_value .= $valor_start;
				}
				// end
				if(isset($data_item->end) && is_object($data_item->end)) {
					$dd_date = new dd_date($data_item->end);
					if(isset($data_item->end->day)) {
						$valor_end = $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d');
					}else{
						$valor_end = isset($data_item->end->month)
							? $dd_date->get_dd_timestamp('Y'.$sep.'m')
							: $dd_date->get_dd_timestamp('Y', $padding=false);
					}
					$item_value .= ' <> '. $valor_end;
				}
				break;

			case 'time_range':
				// start
				if(isset($data_item->start) && is_object($data_item->start)) {
					$dd_date = new dd_date($data_item->start);
					$valor_start = $dd_date->get_dd_timestamp('H:i:s', true);
					$item_value .= $valor_start;
				}
				// end
				if(isset($data_item->end) && is_object($data_item->end)) {
					$dd_date = new dd_date($data_item->end);
					$valor_end = $dd_date->get_dd_timestamp('H:i:s', true);
					$item_value .= ' <> '. $valor_end;
				}
				break;

			case 'period':
				if(!empty($data_item->period)) {

					$ar_string_period = [];

					$dd_date = new dd_date($data_item->period);

					// year
					$ar_string_period[] = isset($dd_date->year)
						? $dd_date->year .' '. label::get_label('years')
						: '';
					// month
					$ar_string_period[] = isset($dd_date->month)
						? $dd_date->month .' '. label::get_label('months')
						: '';
					// day
					$ar_string_period[] = isset($dd_date->day)
						? $dd_date->day .' '. label::get_label('days')
						: '';

					$item_value = implode(' ', $ar_string_period);
				}
				break;

			case 'time':
				$data_item_object = isset($data_item->start)
					? $data_item->start
					: $data_item;
				if (is_object($data_item_object)) {
					$dd_date	= new dd_date($data_item_object);
					$item_value	= $dd_date->get_dd_timestamp('H:i:s', true);
				}else{
					debug_log(__METHOD__
						. " Ignored invalid date. Expected data_item_object is object " . PHP_EOL
						.' type: '. gettype($data_item_object) . PHP_EOL
						.' data_item_object: '. to_string($data_item_object) . PHP_EOL
						.' data_item: '. to_string($data_item)
						, logger::ERROR
					);
				}
				break;

			case 'datetime':
				debug_log(__METHOD__
					. " Received wrong mode 'datetime'. Fix the date mode to 'date_time' " . PHP_EOL
					. to_string( debug_backtrace()[0] )
					, logger::ERROR
				);
				// ! don't break here
			case 'date_time':
				$data_item_object = isset($data_item->start)
					? $data_item->start
					: $data_item;
				if (is_object($data_item_object)) {
					$dd_date	= new dd_date($data_item_object);
					$item_value	= $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d H:i:s', true);
				}else{
					debug_log(__METHOD__
						. " Ignored invalid date. Expected data_item_object is object " . PHP_EOL
						.' type: '. gettype($data_item_object) . PHP_EOL
						.' data_item_object: '. to_string($data_item_object) . PHP_EOL
						.' data_item: '. to_string($data_item)
						, logger::ERROR
					);
				}
				break;

			case 'date':
			default:
				$data_item_object = isset($data_item->start)
					? $data_item->start
					: $data_item;
				if (is_object($data_item_object)) {
					$dd_date = new dd_date($data_item_object);

					if(isset($data_item_object->day)) {
						$item_value = $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d');
					}else{
						$item_value = isset($data_item_object->month)
							? $dd_date->get_dd_timestamp('Y'.$sep.'m')
							: $dd_date->get_dd_timestamp('Y', $padding=false);
					}
				}else{
					debug_log(__METHOD__
						. " Ignored invalid date. Expected data_item_object is object " . PHP_EOL
						.' type: '. gettype($data_item_object) . PHP_EOL
						.' data_item_object: '. to_string($data_item_object) . PHP_EOL
						.' data_item: '. to_string($data_item)
						, logger::ERROR
					);
				}
				break;
		}//end switch ($date_mode)


		return $item_value;
	}//end data_item_to_value



	/**
	* GET VALOR (Ojo: Se usa para ordenar, por lo que mantiene el formato DB. Para visualizar usar 'get_valor_local()')
	* Dato formatted as timestamp '2012-11-07 17:33:49'
	* @return string $valor
	*/
	public function get_valor() : string {

		// short vars
			$properties	= $this->get_properties();
			$date_mode	= $this->get_date_mode();

		// ar_valor
			$ar_valor	= array();
			$ar_dato	= $this->get_dato();
			if (is_array($ar_dato)) {

				foreach ($ar_dato as $key => $current_dato) {

					$ar_valor[$key] = ''; // default

					if(empty($current_dato)) {
						continue;
					}

					$ar_valor[$key] = self::data_item_to_value($current_dato, $date_mode);
				}//end foreach ($ar_dato as $key => $current_dato)
			}

		// valor
			$fields_separator	= $properties->fields_separator ?? ' | ';
			$valor				= implode($fields_separator, $ar_valor);


		return $valor;
	}//end get_valor



	/**
	* GET VALOR LOCAL
	* Convert internal dato formated as timestamp '2012-11-07 17:33:49' to current lang data format like '07-11-2012 17:33:49'
	* @return $valor_local
	*/
	public static function get_valor_local(object $dd_date, bool $full=false) : string {

		$valor_local	= '';
		$separator		= '-'; //dd_date::$separator; timestamp use - but the dd separator is /

		switch (true) {
			case ( empty($dd_date->month) && empty($dd_date->day) ):
				$date_format = "Y";
				break;
			case ( empty($dd_date->day) && !empty($dd_date->month) ):
				$date_format = "m{$separator}Y";
				break;
			default:
				$date_format = "d{$separator}m{$separator}Y";
				break;
		}

		// dd_timestamp
			$valor_local = $dd_date->get_dd_timestamp(
				$date_format,
				false // padding
			);


		return $valor_local;
	}//end get_valor_local



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
			$valor = $this->get_valor($lang);
		}else{
			#$this->set_dato( json_decode($valor) );	// Use parsed JSON string as dato
		}


		return (string)$valor;
	}//end get_valor_export



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $request_query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		// q array safe. Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
			$query_object->q = is_array($query_object->q) ? reset($query_object->q) : $query_object->q;
			if (empty($query_object->q) && empty($query_object->q_operator)) {
				return $query_object;
			}

		// q_object
			$q_object = $query_object->q ?? null;

		// q plain text case
			if (!is_object($q_object)) {
				// Check for operators and date elements

				// Note that here the order is inverse: YY-MM-DD (in component is DD-MM-YY)
				#preg_match("/^(>=|<=|>|<)?([0-9]{1,10})(-(1[0-2]|[1-9]))?(-(3[01]|[12][0-9]|[1-9]))?$/", $query_object->q, $matches);
				preg_match("/^(\W{1,2})?([0-9]{1,10})-?([0-9]{1,2})?-?([0-9]{1,2})?$/", trim($query_object->q), $matches);
				if (isset($matches[0])) {

					$key_op		= 1;
					$key_year	= 2;
					$key_month	= 3;
					$key_day	= 4;

					$op = $matches[$key_op];

					$base_date = new stdClass();
						$base_date->year = $matches[$key_year];
						if(!empty($matches[$key_month]) && $matches[$key_month]<=12){
							$base_date->month = $matches[$key_month];
							if (!empty($matches[$key_day]) && $matches[$key_day]<=31) {
								$base_date->day = $matches[$key_day];
							}
						}

					$dd_date	= new dd_date($base_date);
					$time		= dd_date::convert_date_to_seconds($dd_date);
					$dd_date->set_time($time);
					$dd_date->set_op($op);

					// Encapsulate object in start property to follow new date format (2018-09-19)
					$date_default_obj = new stdClass();
						$date_default_obj->start = $dd_date;

					// Replace q_object
					$q_object = $date_default_obj;

				}else if (empty($query_object->q_operator)) {

					$query_object->operator = '=';
					$query_object->q_parsed	= "'INVALID VALUE!'";

					return $query_object;
				}
			}
		// short vars
			$q_operator						= isset($query_object->q_operator) ? $query_object->q_operator : null;
			$operator						= !empty($q_operator) ? trim($q_operator) : '=';
			$component_tipo					= end($query_object->path)->component_tipo;
			$RecordObj						= new RecordObj_dd($component_tipo);
			$properties						= $RecordObj->get_properties();
			$date_mode						= isset($properties->date_mode) ? $properties->date_mode : 'date';
			$query_object->component_path	= ['components',$component_tipo,'dato',DEDALO_DATA_NOLAN];
			$query_object->type				= 'jsonb';

		// shared resolution functions
			$is_empty = function(object $query_object) : object {

				$query1 = clone($query_object);
					$query1->operator	= ' ';
					$query1->q_parsed	= 'IS NULL';
					$query1->format		= 'typeof';

				$query2 = clone($query_object);
					$query2->operator	= '=';
					$query2->q_parsed	= '\'[]\'';
					$query2->type		= 'string';

				$logical_operator = '$or';

				$new_query_json = new stdClass();
					$new_query_json->$logical_operator = [$query1, $query2];

				return $new_query_json;
			};
			$is_not_empty = function(object $query_object) : object {

				$query1 = clone($query_object);
					$query1->operator	= '=';
					$query1->q_parsed	= '\'array\''; # (!) remember quotes inside
					$query1->format		= 'typeof';

				$query2 = clone($query_object);
					$query2->operator	= '!=';
					$query2->q_parsed	= '\'[]\'';
					$query2->type		= 'string';

				$logical_operator = '$and';

				$new_query_json = new stdClass();
					$new_query_json->{$logical_operator} = [$query1, $query2];

				$new_query_json->operator	= ' ';
				$new_query_json->q_parsed	= 'IS NOT NULL'; # (!) remember quotes inside
				$new_query_json->format		= 'typeof';

				return $new_query_json;
			};

		// date_mode cases
		switch ($date_mode) {

			case 'date':
			case 'range':
				// search_object 1
				// Extract directly from calculated time in JAVASCRIPT
				$dd_date	= isset($q_object->start) ? new dd_date($q_object->start) : null;
				$q_clean	= !empty($q_object->start->time)
					? $q_object->start->time
					: (isset($dd_date) ? dd_date::convert_date_to_seconds($dd_date) : 0);

				// operator conditionals
				switch ($operator) {
					case '<':
					case '>=':
						$query1 = new stdClass();
							$query1->component_path		= ['start','time'];
							$query1->operator			= $operator;
							$query1->q_parsed			= '\''.$q_clean.'\'';
							$query1->type				= 'jsonb';

						$group_op_name = '$or';
						$group_array_elements = new stdClass();
							$group_array_elements->{$group_op_name} = [$query1];

						# query_object config
						$query_object->q_info			= '';
						$query_object->q_parsed			= null;
						$query_object->format			= 'array_elements';
						$query_object->array_elements	= $group_array_elements;

						// set final_query_object
						$final_query_object = $query_object;
						break;

					case '>':
					case '<=':
						$final_range = self::get_final_search_range_seconds($dd_date);

						$query1 = new stdClass();
							$query1->component_path		= ['start','time'];
							$query1->operator			= $operator;
							$query1->q_parsed			= '\''.$final_range.'\'';
							$query1->type				= 'jsonb';

						$group_op_name = '$or';
						$group_array_elements = new stdClass();
							$group_array_elements->{$group_op_name} = [$query1];

						# query_object config
						$query_object->q_info			= '';
						$query_object->q_parsed			= null;
						$query_object->format			= 'array_elements';
						$query_object->array_elements	= $group_array_elements;

						// set final_query_object
						$final_query_object = $query_object;
						break;

					case '!*': // empty case
						// set final_query_object
						$final_query_object = $is_empty( $query_object );
						break;

					case '*':
						// set final_query_object
						$final_query_object = $is_not_empty( $query_object );
						break;

					case '=':
					default:
						$final_range = self::get_final_search_range_seconds($dd_date);
						// array elements subgroups
						// array elements sub_group1
						$query1 = new stdClass();
							$query1->component_path	= ['start','time'];
							$query1->operator		= '<=';
							$query1->q_parsed		= '\''.$q_clean.'\'';
							$query1->type			= 'jsonb';

						$query2 = new stdClass();
							$query2->component_path	= ['end','time'];
							$query2->operator		= '>=';
							$query2->q_parsed		= '\''.$q_clean.'\'';
							$query2->type			= 'jsonb';

						# Add to sub_group1
						$sub_group1 = new stdClass();
							$sub_name1 = '$and';
							$sub_group1->$sub_name1 = [$query1,$query2];

					// array elements sub_group2
						$query1 = new stdClass();
							$query1->component_path	= ['start','time'];
							$query1->operator		= '>=';
							$query1->q_parsed		= '\''.$q_clean.'\'';
							$query1->type			= 'jsonb';

						$query2 = new stdClass();
							$query2->component_path	= ['start','time'];
							$query2->operator		= '<=';
							$query2->q_parsed		= '\''.$final_range.'\'';
							$query2->type			= 'jsonb';

						// Add to sub_group2
						$sub_group2 = new stdClass();
							$sub_name2 = '$and';
							$sub_group2->$sub_name2 = [$query1,$query2];

					// Group array elements
						$group_op_name = '$or';
						$group_array_elements = new stdClass();
							$group_array_elements->{$group_op_name} = [$sub_group1,$sub_group2];

					// query_object config
						$query_object->q_parsed			= null;
						$query_object->format			= 'array_elements';
						$query_object->array_elements	= $group_array_elements;

					// set final_query_object
					$final_query_object = $query_object;
					break;
				}
				break;

			case 'period':
				/* En proceso ...
				$q_clean  = isset($q_object->time) ? $q_object->time : 0;
				$operator = isset($q_object->op) ? $q_object->op : '=';

				$query1 = new stdClass();
					$query1->component_path 	= ['period','time'];
					$query1->operator 			= $operator;
					$query1->q_parsed 					= '\''.$q_clean.'\'';
					$query1->type 				= 'jsonb';

				$group_op_name = '$or';
				$group_array_elements = new stdClass();
					$group_array_elements->{$group_op_name} = [$query1];

				# query_object config
				$query_object->q_parsed				= null;
				$query_object->format 			= 'array_elements';
				$query_object->array_elements 	= $group_array_elements;

				$final_query_object = $query_object;*/
				break;

			case 'time':
				// Extract directly from calculated time in JAVASCRIPT
				$dd_date	= isset($q_object->start) ? new dd_date($q_object->start) : null;
				$q_clean	= !empty($q_object->start->time)
					? $q_object->start->time
					: (isset($dd_date) ? dd_date::convert_date_to_seconds($dd_date) : 0);

				// operator conditionals
				switch ($operator) {
					case '=':
						$query1 = new stdClass();
							$query1->component_path	= ['start','time'];
							$query1->operator		= '>=';
							$query1->q_parsed		= '\''.$q_clean.'\'';
							$query1->type			= 'jsonb';

						// $dd_date = new dd_date($q_object->start);
						$final_range = $q_clean + self::get_final_search_range_seconds($dd_date);
						$query2 = new stdClass();
							$query2->component_path	= ['start','time'];
							$query2->operator		= '<=';
							$query2->q_parsed		= '\''.$final_range.'\'';
							$query2->type			= 'jsonb';

						$group_op_name = '$and';
						$group_array_elements = new stdClass();
							$group_array_elements->{$group_op_name} = [$query1,$query2];

						// query_object config
						$query_object->q_info			= '';
						$query_object->q_parsed			= null;
						$query_object->format			= 'array_elements';
						$query_object->array_elements	= $group_array_elements;

						// set final_query_object
						$final_query_object = $query_object;
						break;

					default:
						$query1 = new stdClass();
							$query1->component_path	= ['start','time'];
							$query1->operator		= $operator;
							$query1->q_parsed		= '\''.$q_clean.'\'';
							$query1->type			= 'jsonb';

						$group_op_name = '$or';
						$group_array_elements = new stdClass();
							$group_array_elements->{$group_op_name} = [$query1];

						// query_object config
						$query_object->q_info			= '';
						$query_object->q_parsed			= null;
						$query_object->format			= 'array_elements';
						$query_object->array_elements	= $group_array_elements;

						// set final_query_object
						$final_query_object = $query_object;
						break;
				}
				break;

			case 'datetime':
				debug_log(__METHOD__
					. " Received wrong mode 'datetime'. Fix the date mode to 'date_time' " . PHP_EOL
					. to_string( debug_backtrace()[0] )
					, logger::ERROR
				);
				// don't break here !

			case 'date_time':
				// Extract directly from calculated time in JAVASCRIPT
				$dd_date		= isset($q_object->start) ? new dd_date($q_object->start) : null;
				$final_range	= self::get_final_search_range_seconds($dd_date);
				$q_clean		= !empty($q_object->start->time)
					? $q_object->start->time
					: (isset($dd_date) ? dd_date::convert_date_to_seconds($dd_date) : 0);

				// sample 'dd547' (Activity)
				switch ($operator) {
					case '!*': // empty case
						$final_query_object = $is_empty( $query_object );
						break;

					case '*': // not empty case
						$final_query_object = $is_not_empty( $query_object );
						break;

					case '<':
					case '>=':
						// array elements sub_group2
						$query1 = new stdClass();
							$query1->component_path		= ['start','time'];
							$query1->operator			= $operator;
							$query1->q_parsed			= '\''.$q_clean.'\'';
							$query1->type				= 'jsonb';

						$group_op_name = '$or';
						$group_array_elements = new stdClass();
							$group_array_elements->{$group_op_name} = [$query1];

						// query_object config
							$query_object->q_info			= '';
							$query_object->q_parsed			= null;
							$query_object->format			= 'array_elements';
							$query_object->array_elements	= $group_array_elements;

						// set final_query_object
						$final_query_object = $query_object;
						break;

					case '>':
					case '<=':
						// array elements sub_group2
						$query1 = new stdClass();
							$query1->component_path		= ['start','time'];
							$query1->operator			= $operator;
							$query1->q_parsed			= '\''.$final_range.'\'';
							$query1->type				= 'jsonb';

						$group_op_name = '$or';
						$group_array_elements = new stdClass();
							$group_array_elements->{$group_op_name} = [$query1];

						// query_object config
							$query_object->q_info			= '';
							$query_object->q_parsed			= null;
							$query_object->format			= 'array_elements';
							$query_object->array_elements	= $group_array_elements;

						// set final_query_object
						$final_query_object = $query_object;
						break;

					case '=':
					default:
						// array elements sub_group2
						$query1 = new stdClass();
							$query1->component_path	= ['start','time'];
							$query1->operator		= '>=';
							$query1->q_parsed		= '\''.$q_clean.'\'';
							$query1->type			= 'jsonb';

						$query2 = new stdClass();
							$query2->component_path	= ['start','time'];
							$query2->operator		= '<=';
							$query2->q_parsed		= '\''.$final_range.'\'';
							$query2->type			= 'jsonb';

						// Add to sub_group2
						$sub_group2 = new stdClass();
							$sub_name2 = '$and';
							$sub_group2->$sub_name2 = [$query1,$query2];

						// query_object config
							$query_object->q_info			= '';
							$query_object->q_parsed			= null;
							$query_object->format			= 'array_elements';
							$query_object->array_elements	= $sub_group2;

						// set final_query_object
						$final_query_object = $query_object;
						break;
				}
				break;

			default:
				switch ($operator) {
					case '!*': // empty case
						$final_query_object = $is_empty( $query_object );
						break;

					case '*': // not empty case
						$final_query_object = $is_not_empty( $query_object );
						break;
				}
				break;
		}//end switch ($date_mode)


		// catch non defined $final_query_object cases
			if (!isset($final_query_object)) {
				$final_query_object = $query_object;
				debug_log(__METHOD__
					. " Unable to resolve current query_object. Using original query_object to continue " . PHP_EOL
					.' date_mode: ' . $date_mode . PHP_EOL
					.' operator: '  . $operator . PHP_EOL
					.' query_object: ' . to_string($query_object)
					, logger::ERROR
				);
			}


		return $final_query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'>=' 	=> 'greater_than_or_equal',
			'<='	=> 'less_than_or_equal',
			'>' 	=> 'greater_than',
			'<'		=> 'less_than',
			'*' 	=> 'no_empty', // not null
			'!*' 	=> 'empty', // null
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* GET_FINAL_SEARCH_RANGE_SECONDS
	* Calculate current request date + 1 day/month/year to allow
	* search for example, 1930 and find all 130 appearances (1930-01, 1930-15-10, etc..)
	* @param object|null $dd_date
	* @return int $final_range
	*/
	public static function get_final_search_range_seconds(?object $dd_date) : int {

		$final_search_range_seconds = 0;

		if (is_null($dd_date)) {
			return $final_search_range_seconds;
		}

		# Time
		if (isset($dd_date->second)) {

			$final_search_range_seconds = $dd_date->second;

		}
		elseif (isset($dd_date->minute)) {

			$dd_date_clone = clone($dd_date);
			$dd_date_clone->seconds = 59;
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone);
		}
		elseif (isset($dd_date->hour)) {

			$dd_date_clone = clone($dd_date);
			$dd_date_clone->minute = 59;
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone);
		}

		# Date
		# the calculation of the seconds for the end of the period always need to be seconds -1
		# ex: year 2000 in seconds is: start = 64281600000 end = 64313740800 -1 or 64313740799
		# because 64313740800 = 2001
		if (isset($dd_date->day)) {

			$dd_date_clone = clone($dd_date);
			$dd_date_clone->day = $dd_date_clone->day+1;
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone)-1;

		}elseif (isset($dd_date->month)) {

			$dd_date_clone = clone($dd_date);
			$dd_date_clone->month = $dd_date_clone->month+1;
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone)-1;

		}elseif (isset($dd_date->year)) {

			$dd_date_clone = clone($dd_date);
			$dd_date_clone->year = $dd_date_clone->year+1;
			$final_search_range_seconds = dd_date::convert_date_to_seconds($dd_date_clone)-1;

		}


		return $final_search_range_seconds;
	}//end get_final_search_range_seconds



	/**
	* ADD_TIME
	* Gets the current data received (of type stdClass) and uses it to create a dd_date object to which it injects
	* the calculated time (seconds).
	* Returns the created dd_date object
	* @param object $current_dato
	* 	dd_date object as
	* {
	*    "start": {
	*        "errors": null,
	*        "year": 2023,
	*        "month": 7,
	*        "day": 11
	*    }
	* }
	* @return object dd_date $current_dato
	*  Modified object with injected time in seconds
	* {
	*    "start": {
	*        "errors": null,
	*        "year": 2023,
	*        "month": 7,
	*        "day": 11,
	* 		 "time": 64638561691
	*    }
	* }
	*/
	public static function add_time( object $current_dato ) : object {

		// empty case
			if(empty($current_dato)) {
				return $current_dato;
			}

		// Period date mode
			if( isset($current_dato->period) ) {
				$dd_date = new dd_date($current_dato->period);
				$time 	 = dd_date::convert_date_to_seconds($dd_date);
				if (isset($current_dato->period->time) && $current_dato->period->time!=$time) {
					debug_log(__METHOD__
						." Unequal time seconds value: current: ".to_string($current_dato->period->time).", calculated: $time. Used calculated time. []"
						, logger::WARNING
					);
				}
				$dd_date->set_time( $time );
				$current_dato->period = $dd_date;
			}

		// Range date mode
			if( isset($current_dato->start) ) {
				$dd_date = new dd_date($current_dato->start);
				$time 	 = dd_date::convert_date_to_seconds($dd_date);
				if (isset($current_dato->start->time) && $current_dato->start->time!=$time) {
					debug_log(__METHOD__
						." Unequal time seconds value: current: ".to_string($current_dato->start->time).", calculated: $time. Used calculated time. []"
						, logger::WARNING
					);
				}
				$dd_date->set_time( $time );
				$current_dato->start = $dd_date;
			}
			if( isset($current_dato->end) ) {
				$dd_date = new dd_date($current_dato->end);
				$time 	 = dd_date::convert_date_to_seconds($dd_date);
				if (isset($current_dato->end->time) && $current_dato->end->time!=$time) {
					debug_log(__METHOD__
						." Unequal time seconds value: current: ".to_string($current_dato->end->time).", calculated: $time. Used calculated time. []"
						, logger::WARNING
					);
				}
				$dd_date->set_time( $time );
				$current_dato->end = $dd_date;
			}

		// Time date mode
			if( isset($current_dato->hour) ) {
				$dd_date = new dd_date($current_dato);
				$time 	 = dd_date::convert_date_to_seconds($dd_date);

				if (isset($current_dato->time) && $current_dato->time!=$time) {
					debug_log(__METHOD__
						." Unequal time seconds value: current: ".to_string($current_dato->time).", calculated: $time. Used calculated time. []" . PHP_EOL
						.' $current_dato->time: ' . to_string($current_dato->time) . PHP_EOL
						.' calculated: ' . $time
						, logger::WARNING
					);
				}
				$dd_date->set_time( $time );
				$current_dato = $dd_date;
			}


		return (object)$current_dato;
	}//end add_time



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;
			$section_tipo 	= $options->section_tipo ?? '';

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '6.2.2':
				$table = common::get_matrix_table_from_tipo($section_tipo);

				// skip the time_machine because the recovery data will added the time.
				if($table === 'matrix_time_machine' || $table === 'matrix_activity'){
					$response = new stdClass();
						$response->result	= 0;
						$response->msg		= "Ignored table";

					return $response;
				}
				// default response as ignore
				$response = new stdClass();
						$response->result	= 0;
						$response->msg		= "Ignored data, empty data";

				if(empty($dato_unchanged)){

					return $response;
				}
				// set a clone of the original data unchanged
				$clone_data_unchange = json_decode(json_encode( $dato_unchanged ));

				// set the time into the new_data
				$new_data = array_map(function($item) {
					return is_object($item)
						? self::add_time( $item )
						: $item;
				}, $clone_data_unchange );

				// if the new_data is not the same that $dato_unchange save it.
				// time will be added into the new_data
				if($new_data != $dato_unchanged){
					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_data;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_data).".<br />";
				}

				return $response;

				break;
			case '6.0.0':
				// break;
			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* * @see class.diffusion_mysql.php
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_value = null;

		// ar_dato
			$ar_dato = $this->get_dato();
			if(empty($ar_dato)){
				return $diffusion_value;
			}

		// date mode
			$date_mode = $this->get_date_mode();

		$ar_diffusion_values = array();
		foreach($ar_dato as $dato) {

			// $ar_diffusion_values[] = self::data_item_to_value($dato, $date_mode);

			// DES
			switch ($date_mode) {
				case 'range':
				case 'time_range':
					$ar_date=array();
					// start
					if (isset($dato->start) && isset($dato->start->year)) {
						$dd_date 		= new dd_date($dato->start);
						$timestamp 		= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
						$ar_date[] 		= $timestamp;
					}
					// end
					if (isset($dato->end) && isset($dato->end->year)) {
						$dd_date 		= new dd_date($dato->end);
						$timestamp 		= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
						$ar_date[] 		= $timestamp;
					}
					$ar_diffusion_values[] = implode(',',$ar_date);
					break;

				case 'period':
					// Compute days
					if (isset($dato->period)) {
						# $seconds = $dato->period->time;
						# $days = ceil($seconds/3600/24);
						$ar_string_period = [];
						if (isset($dato->period->year)) {
							$ar_string_period[] = $dato->period->year .' '. label::get_label('years', $lang);
						}
						if (isset($dato->period->month)) {
							$ar_string_period[] = $dato->period->month .' '. label::get_label('months', $lang);
						}
						if (isset($dato->period->day)) {
							$ar_string_period[] = $dato->period->day .' '. label::get_label('days', $lang);
						}
						$ar_diffusion_values[] = implode(' ',$ar_string_period);
					}
					break;

				case 'date':
					/*
						$dd_date 	= new dd_date($dato);
						if(isset($dato->day)) {

								$timestamp = $dd_date->get_dd_timestamp("Y-m-d");
						}else{
								$timestamp = $dd_date->get_dd_timestamp("Y-m");
							if(isset($dato->month)) {
								}else{
										$timestamp = $dd_date->get_dd_timestamp("Y");
									}
							}

						$ar_diffusion_values[] = $timestamp;
						break;*/

				default:
					$current_date = $dato;
					if (isset($current_date->start)) {
						$current_date = $current_date->start;
					}
					$dd_date 		 		= new dd_date($current_date);
					$timestamp 				= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
					$ar_diffusion_values[] 	= $timestamp;
					break;
			}
		}//end foreach($ar_dato as $dato)

		#$diffusion_value = implode('|',$ar_diffusion_values);

		# NOTA
		# Para publicación, NO está solucionado el caso en que hay más de una fecha... ejem.. VALORAR ;-)
		$diffusion_value = reset($ar_diffusion_values); // Temporal !!

		// Force null on empty value to avoid errors on MYSQL save value invalid format
		// Only valid dates or null area accepted
		if (empty($diffusion_value)) {
			$diffusion_value = null;
		}


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_CALCULATION_DATA
	*  Get the data of the component for do a calculation
	* @param object|null $options = null
	* @return mixed $data
	*/
	public function get_calculation_data( ?object $options=null ) : mixed {

		$ar_data = [];

		// options
			$select	= $options->select ?? 'start';
			$format	= $options->format ?? 'unix_timestamp';

		$dato = $this->get_dato();
		if (!empty($dato)) {
			foreach ($dato as $current_dato) {

				if (isset($current_dato->{$select})){
					$data_obj =	$current_dato->{$select};
				}else{
					return false;
				}

				if($format==='dd_date'){
					$data_obj->format = ($select==='period') ? 'period' : 'date';
					return $data_obj; // Only one expected
				}

				// value to seconds
				if (!empty($data_obj)) {
					$dd_date		= new dd_date($data_obj);
					$unix_timestamp	= $dd_date->get_unix_timestamp();

					$ar_data[] = $unix_timestamp ;
				}
			}
		}

		$data = array_sum($ar_data);


		return (int)$data;
	}//end get_calculation_data



	/**
	* GET_STATS_VALUE_WITH_VALOR_ARGUMENTS
	* @return string $label
	*/
	public static function get_stats_value_with_valor_arguments($value, $valor_arguments) {

		$value_decoded = json_decode($value);
		if (!empty($value_decoded)) {
			$date = reset($value_decoded);
			if (isset($date->start->{$valor_arguments})) {
				$label = $date->start->{$valor_arguments}; // Overwrite value
			}
		}else{
			$label = $value;
		}

		return $label;
	}//end get_stats_value_with_valor_arguments



	/**
	* DATA_TO_TEXT
	* Used to convert component dato to searchable text
	* @return string $text
	*/
	public static function data_to_text($data) : string {

		if (empty($data)) {
			$text = '';
		}else{
			$to_timestamp = function($item) {
				$dd_date = new dd_date($item);
				return $dd_date->get_dd_timestamp(
					"Y-m-d", // date_format
					true // padding
				);
			};
			$ar_text = [];
			if (isset($data->start)) {
				$ar_text[] = $to_timestamp($data->start);
			}
			if (isset($data->end)) {
				$ar_text[] = $to_timestamp($data->end);
			}
			$text = implode('/', $ar_text);
		}

		return $text;
	}//end data_to_text



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @see https://habr.com/en/company/postgrespro/blog/500440/
	* @see https://www.postgresql.org/docs/current/functions-json.html
	* @see https://www.postgresql.org/docs/current/datatype-json.html#TYPE-JSONPATH-ACCESSORS
	*
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		// column explicit definition
			// working sample 1 (using jsonb_array_elements):
				// SELECT p.id, p.section_id, p.section_tipo, a.time
				// from matrix p
				//    left join lateral (
				//       select item #> '{start,time}' as time
				//       from jsonb_array_elements(p.datos#>'{components,rsc224,dato,lg-nolan}') as x(item)
				//    ) a on true
				// order by a.time DESC nulls last;

			// working sample 2 (using jsonb_path_query):
				// SELECT rs167.id, rs167.section_id, rs167.section_tipo
				// ,jsonb_path_query(datos, 'lax $.components.rsc224.dato."lg-nolan"[0].start.time', silent => true) as time
				// FROM matrix rs167
				// WHERE rs167.section_tipo='rsc205'
				// LIMIT 10;

		// trim_section_tipo. Trim section name as search do to get safe name
			$trim_section_tipo = search::trim_tipo($section_tipo);

		// self path
			$path = [
				// self component path
				(object)[
					'component_tipo'	=> $component_tipo,
					'model'				=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
					'name'				=> RecordObj_dd::get_termino_by_tipo($component_tipo),
					'section_tipo'		=> $section_tipo,
					'column'			=> "jsonb_path_query_first({$trim_section_tipo}.datos, 'strict $.components.{$component_tipo}.dato.\"lg-nolan\"[0].start.time', silent => true)"
				]
			];

		// from_section_tipo. When is defined, this component is inside a portal and
		// we need the parent portal path too to add at beginning
			if (isset($this->from_section_tipo) && $this->from_section_tipo!==$section_tipo) {
				// recursion
				// $pre_path = $this->get_order_path($this->from_component_tipo, $this->from_section_tipo);
				// $pre_path = search::get_query_path($this->from_component_tipo, $this->from_section_tipo);
				// array_unshift($path, ...$pre_path);
				array_unshift($path, (object)[
					'component_tipo'	=> $this->from_component_tipo,
					'model'				=> RecordObj_dd::get_modelo_name_by_tipo($this->from_component_tipo,true),
					'name'				=> RecordObj_dd::get_termino_by_tipo($this->from_component_tipo),
					'section_tipo'		=> $this->from_section_tipo
				]);
			}


		return $path;
	}//end get_order_path



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to dato. Overwrite in other cases.
	* Note that empty array or string are returned as null
	* @return array|null $list_value
	*/
	public function get_list_value() : ?array {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$date_mode = $this->get_date_mode();

		$list_value = [];
		foreach ($dato as $data_item) {
			$list_value[] = !empty($data_item)
				? self::data_item_to_value($data_item, $date_mode, '/')
				: null;
		}


		return $list_value;
	}//end get_list_value



	/**
	* CONFORM_IMPORT_DATA
	* @param string $import_value
	* import data format option:
	* 1 a stringify version of date:
	* 	'"[{\\"start\\":{\\"year\\":2012,\\"month\\":11,\\"day\\":7,\\"hour\\":17,\\"minute\\":33,\\"second\\":49},\\"end\\":{\\"year\\":2012,\\"month\\":12,\\"day\\":8,\\"hour\\":22,\\"minute\\":15,\\"second\\":35}}]"'
	* 2 a string flat date:
	* 	-205/05/21
	* 3 a string flat range date with <> separator:
	* 	-205/05/21 <> 185/01/30
	* 4 a string multi value (2 values) with | separator
	* 	1852/12/22 | 1853/02/18
	* 5 a range multi value (start, end and 2 values) using <> and | separators
	* 	1852/12/22 <> 1852/12/25 | 1853/02/18
	* 	1852/12/22 | <> 1853/02/18
	* 6 string with other order as dmy (day, month, year)
	* 	22/12/2023
	* 	mdy
	* 	12/22/2023
	* 7 other separator between day month and year, supported - and .
	* 	2012-22-12
	* 	2012.22.12
	* @param string $column_name
	* ex:
	* rsc85 // only component tipo
	* rsc85_dmy // component tipo and the date format
	* @return object $response
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
		$response = new stdClass();
			$response->result	= null;
			$response->errors	= [];
			$response->msg		= 'Error. Request failed';

		// Check if is a JSON string. Is yes, decode
			if(json_handler::is_json($import_value)){
				// try to JSON decode (null on not decode)
				$dato_from_json = json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE
				$lang = $this->lang;
				$value = (is_object($dato_from_json) && property_exists($dato_from_json, $lang))
					? $dato_from_json->$lang
					: $dato_from_json;
			}else{

				// column name could be only the tipo as "rsc89" or a date order as "rsc85_dmy"
				// the component tipo are always the first tipo in the column name
				// by default the date order will be year/month/day ymd
				$ar_tipos	= explode(locator::DELIMITER, $column_name);
				$order		= $ar_tipos[1] ?? 'ymd';

				$value = [];
				// explode the possibles rows of the date
				$ar_date_rows	= explode('|', $import_value);

				foreach ($ar_date_rows as $key => $date_row) {

					$date_range	= explode('<>',$date_row);
					$date_obj = new stdClass();
					foreach ($date_range as $key => $current_date) {

						// remove empty spaces and check if the current date has information else continue to next one
						// avoid empty information
						$current_date = trim($current_date);
						if(empty($current_date)){
							continue;
						}
						// set the mode of date dependent of the length of the date 0=start / 1=end
						$mode = ($key===0) ? 'start' : 'end';

						// replace all accepted separators -. by /
						$current_date = preg_replace('/[-.]/', '/', $current_date);

						// replace the negative year situations
						// year can to be at beginning or at end of the date
						// -200-05-01 or 01-05--200
						// -200/05/01 or 01/05/-200
							// if negative year is at begin replace the / for the -
							$begins	= substr($current_date, 0, 1);
							if($begins==='/'){
								$current_date = '-'.substr($current_date, 1);
							}
							// if the negative year is the last position the previous preg_replace was changed it as //200
							// this replace will change it to /-200
							$current_date = preg_replace('/\/\//', '/-', $current_date);

						// explode the string into parts
						$ar_date_parts	= explode('/',$current_date);
						$lenght			= count($ar_date_parts);

						$dd_date = new dd_date();

						// if the length of the parts has only 1 item it will be the year
						// and end the loop
						if($lenght === 1){
							$dd_date->set_year((int)$ar_date_parts[0]);
							$date_obj->$mode = $dd_date;
							continue;
						}

						switch ($order) {
							case 'dmy':
								// month and year : 04/2022
								if($lenght === 2){
									if(isset($ar_date_parts[0])){
										$dd_date->set_month((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_year((int)$ar_date_parts[1]);
									}
								}
								// day, moth, year (other countries dates) : 25/04/2022
								elseif($lenght === 3){
									if(isset($ar_date_parts[0])) {
										$dd_date->set_day((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_month((int)$ar_date_parts[1]);
									}
									if(isset($ar_date_parts[2])){
										$dd_date->set_year((int)$ar_date_parts[2]);
									}
								}
								break;
							case 'mdy':
								// month and year (USA dates): 04/2022
								if($lenght === 2){
									// if(isset($ar_date_parts[0])){
									// 	$dd_date->set_month((int)$ar_date_parts[0]);
									// }
									// if(isset($ar_date_parts[1])){
									// 	$dd_date->set_year((int)$ar_date_parts[1]);
									// }
									// Do not resolve date in this case because day without month is not valid
									$response->errors[] = 'Invalid mdy date format for current_date: ' . to_string($current_date);
								}
								// moth, day, year (USA dates) : 04/25/2022
								elseif($lenght === 3){
									if(isset($ar_date_parts[0])) {
										$dd_date->set_month((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_day((int)$ar_date_parts[1]);
									}
									if(isset($ar_date_parts[2])){
										$dd_date->set_year((int)$ar_date_parts[2]);
									}
								}
								break;
							case 'ymd':
							default:
								// year and month  : 2022/04
								if($lenght === 2){
									if(isset($ar_date_parts[0])){
										$dd_date->set_year((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_month((int)$ar_date_parts[1]);
									}
								}
								// year, month, date (China, Korean, Japan, Iran dates) : 2022/04/25
								elseif($lenght === 3){
									if(isset($ar_date_parts[0])) {
										$dd_date->set_year((int)$ar_date_parts[0]);
									}
									if(isset($ar_date_parts[1])){
										$dd_date->set_month((int)$ar_date_parts[1]);
									}
									if(isset($ar_date_parts[2])){
										$dd_date->set_day((int)$ar_date_parts[2]);
									}
								}
								break;
						}
						$date_obj->$mode = $dd_date;
					}

					$is_empty_object = !(array)$date_obj;
					if (!$is_empty_object) {
						$value[] = $date_obj;
					}
				}
			}

		// check values (informative of errors)
			if(!empty($value)){

				foreach ($value as $current_date) {
					foreach ($current_date as $key => $current_dd_date) {

						// don't check null values
							if (!is_null($current_dd_date)) {
								continue;
							}

						// expected object only
							if (!is_object($current_dd_date)) {
								debug_log(__METHOD__
									. " Wrong var type current_dd_date" . PHP_EOL
									. ' type: ' . gettype($current_dd_date) . PHP_EOL
									. ' current_dd_date: ' . to_string($current_dd_date) . PHP_EOL
									. ' import_value: ' . to_string($import_value) . PHP_EOL
									. ' column_name: ' . to_string($column_name) . PHP_EOL
									. ' tipo: ' . $this->tipo . PHP_EOL
									. ' section_tipo: ' . $this->section_tipo . PHP_EOL
									. ' model: ' . get_class($this)
									, logger::ERROR
								);
								continue;
							}

						$dd_date = new dd_date($current_dd_date, true);

						// errors check
						if(!empty($dd_date->errors)){

							$failed = new stdClass();
								$failed->section_id		= $this->section_id;
								$failed->data			= stripslashes( $import_value );
								$failed->component_tipo	= $this->get_tipo();
								$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
								$failed->errors			= $dd_date->errors;

							$response->errors[] = $failed;
						}
					}
				}
			}//end if(!empty($value))

		// to null when is empty
			if (!is_null($value) && empty($value)) {
				$value = null;
			}

		// values are array except for null
			if (is_object($value)) {
				$value = [$value];
			}

		$response->result	= $value;
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



}//end class component_date
