<?php
/*
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
*/
class component_date extends component_common {



	# American data format
	public static $ar_american = ['lg-eng','lg-angl','lg-ango','lg-meng'];



	/**
	* __CONSTRUCT
	*/
	function __construct(string $tipo=null, $parent=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, string $section_tipo=null) {

		// Force always DEDALO_DATA_NOLAN
		$lang = DEDALO_DATA_NOLAN;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $mode, $lang, $section_tipo);

		if(SHOW_DEBUG===true) {
			if ($this->RecordObj_dd->get_traducible()==='si') {
				debug_log(__METHOD__." Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is NOT 'traducible'. Please fix this ASAP ".to_string(), logger::ERROR);
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
					debug_log(__METHOD__." Bad date format. Expected array ".gettype($dato), logger::ERROR);
				}
				return null;
			}

		// add_time to dato (always)
			foreach ($dato as $key => $current_dato) {
				$this->dato[$key] = self::add_time( $current_dato );
			}

		// from here, save normally
			$result = parent::Save();


		return $result;
	}//end Save



	/**
	* GET_DATO
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

		if(SHOW_DEBUG===true) {
			if ( !is_null($dato) && !is_array($dato)  ) {
				#dump( $dato, "WRONG TYPE of dato. tipo: $this->tipo - section_tipo: $this->section_tipo - section_id: $this->parent");
			}
		}

		return (array)$dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato( $dato ) {

		if (is_string($dato)) {
			$dato = json_decode($dato);
		}
		if (is_null($dato) || empty($dato)) {
			$dato = array();
		}

		# Compatibility with version 4.0.14 to 4.7 dedalo instalations
		if (is_object($dato) && !empty(get_object_vars($dato)) ) {
			$safe_dato		= array();
			$safe_dato[] 	= $dato;
			$dato 			= $safe_dato;
		}

		return parent::set_dato( (array)$dato );
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
	* GET_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param string $lang = DEDALO_DATA_LANG
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $value
	*/
	public function get_value(string $lang=DEDALO_DATA_LANG, object $ddo=null) : dd_grid_cell_object {

		// ddo. set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator		= $ddo->records_separator ?? null;
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

		// ar_values
			$ar_values	= [];
			$data		= $this->get_dato();
			foreach ($data as $key => $current_dato) {

				$ar_values[$key] = ''; // default

				if(empty($current_dato)) {
					continue;
				}

				$ar_values[$key] = self::data_item_to_value($current_dato, $date_mode);
			}//end foreach ($data as $key => $current_dato)

		// fields_separator
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ' <> ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

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
				$value->set_value($ar_values);


		return $value;
	}//end get_value



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
	* @param string $sep = '-'
	* 	Sample '/'
	* @return string $item_value
	*/
	public static function data_item_to_value(object $data_item, string $date_mode, string $sep='-') : string {

		$item_value = '';

		switch ($date_mode) {

			case 'range':
				// start
				$valor_start = '';
				if(isset($data_item->start)) {
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
				$valor_end = '';
				if(isset($data_item->end)) {
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

			case 'period':
				if(!empty($data_item->period)) {

					$ar_string_period = [];

					$dd_date = new dd_date($data_item->period);

					// year
					$ar_string_period[] = isset($dd_date->year)
						? $dd_date->year .' '. label::get_label('anyos')
						: '';
					// month
					$ar_string_period[] = isset($dd_date->month)
						? $dd_date->month .' '. label::get_label('meses')
						: '';
					// day
					$ar_string_period[] = isset($dd_date->day)
						? $dd_date->day .' '. label::get_label('dias')
						: '';

					$item_value = implode(' ', $ar_string_period);
				}
				break;

			case 'time':
				$dd_date	= new dd_date($data_item);
				$item_value	= $dd_date->get_dd_timestamp('H:i:s', true);
				break;

			case 'date_time':
				if(isset($data_item->start)) {
					$dd_date	= new dd_date($data_item->start);
					$item_value	= $dd_date->get_dd_timestamp('Y'.$sep.'m'.$sep.'d H:i:s', true);
				}
				break;

			case 'date':
			default:
				// start
				$valor_start = '';
				if(isset($data_item->start)) {
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
				break;
		}

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
			foreach ($ar_dato as $key => $current_dato) {

				$ar_valor[$key] = ''; // default

				if(empty($current_dato)) {
					continue;
				}

				$ar_valor[$key] = self::data_item_to_value($current_dato, $date_mode);
			}//end foreach ($ar_dato as $key => $current_dato)

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
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
			$valor = $this->get_valor($lang);
		}else{
			#$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}


		return (string)$valor;
	}//end get_valor_export



	/**
	* GET TIMESTAMP
	* @param array $offset
	* @return string $timestamp
	* 	current time formated for saved to SQL timestamp field
	*	like 2013-01-22 22:33:29 ('Y-m-d H:i:s')
	*	DateTime is avaliable for PHP >=5.3.0
	*/
	public static function get_timestamp_now_for_db( $offset=null ) : string {

		$date = new DateTime();

		switch (true) {

			case !empty($offset) :

				$offset_key 	= key($offset);
				$offset_value 	= $offset[$offset_key];
				$date->$offset_key(new DateInterval($offset_value));		# Formated like: P10D (10 days)
				$timestamp = $date->format('Y-m-d H:i:s'); 	# Default as DB format
				break;

			default:
				$timestamp 	= $date->format('Y-m-d H:i:s'); # Default as DB format
				break;
		}
		#dump($timestamp,'$timestamp ');

		return $timestamp;
	}//end get_timestamp_now_for_db



	/**
	* TIMESTAMP TO EUROPEAN DATE
	* @param $timestamp
	* @param $seconds (default false)
	* Convert DB timestamp to date (American or European date) like '2013-04-23 19:47:05' to 23-04-2013 19:47:05
	*/
	public static function timestamp_to_date($timestamp, $full=true) : ?string {

		if (empty($timestamp) || strlen($timestamp)<10) {
			return null;
		}

		$year  	= substr($timestamp, 0, 4);
		$month 	= substr($timestamp, 5, 2);
		$day   	= substr($timestamp, 8, 2);
		$hour 	= substr($timestamp, 11, 2);
		$min 	= substr($timestamp, 14, 2);
		$sec 	= substr($timestamp, 17, 2);
		/*
		if (in_array(DEDALO_APPLICATION_LANG, self::$ar_american)) {
			# American format month/day/year
			$date	= $mes . '-' .$day . '-' .$year ;
		}else{
			# European format day.month.year
			$date	= $day . '-' .$mes . '-' .$year ;
		}
		*/
		$date	= $day . '-' .$month . '-' .$year ;

		if($full===true) {
			$date	.= ' ' .$hour . ':' .$min . ':' .$sec ;
		}

		return $date;
	}//end timestamp_to_date



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $request_query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql( object $request_query_object) : object {

		// query_object clone
		$query_object = clone $request_query_object;

		// Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
		$query_object->q = is_array($query_object->q) ? reset($query_object->q) : $query_object->q;

		if (empty($query_object->q) && empty($query_object->q_operator)) {
			return $query_object;
		}

		// q_object
		$q_object = $query_object->q ?? null;

		// Case search with plain text like from autocomplete
		if (!is_object($q_object)) {
			// Check for operators and date elements

			// Note that here the order is inverse: YY-MM-DD (in component is DD-MM-YY)
			#preg_match("/^(>=|<=|>|<)?([0-9]{1,10})(-(1[0-2]|[1-9]))?(-(3[01]|[12][0-9]|[1-9]))?$/", $query_object->q, $matches);
			preg_match("/^(\W{1,2})?([0-9]{1,10})-?([0-9]{1,2})?-?([0-9]{1,2})?$/", $query_object->q, $matches);
			if (isset($matches[0])) {

				$key_op 	= 1;
				$key_year 	= 2;
				$key_month 	= 3;
				$key_day 	= 4;

				$op = $matches[$key_op];

				$base_date = new stdClass();
					$base_date->year = $matches[$key_year];
					if(!empty($matches[$key_month]) && $matches[$key_month]<=12){
						$base_date->month 	= $matches[$key_month];
						if (!empty($matches[$key_day]) && $matches[$key_day]<=31) {
							$base_date->day 	= $matches[$key_day];
						}
					}

				$dd_date  	= new dd_date($base_date);
				$time 		= dd_date::convert_date_to_seconds($dd_date);
				$dd_date->set_time($time);
				$dd_date->set_op($op);

				// Encapsulate object in start property to follow new date format (2018-09-19)
				$date_default_obj = new stdClass();
					$date_default_obj->start = $dd_date;

				// Replace q_object
				$q_object 	= $date_default_obj;
				#debug_log(__METHOD__." Created new q_object from: $query_object->q  ->  ".to_string($q_object), logger::WARNING);
			}else if (empty($query_object->q_operator)) {

				$query_object->operator = '=';
				$query_object->q_parsed	= "'INVALID VALUE!'";
				return $query_object;
			}
		}

		$q_operator = isset($query_object->q_operator) ? $query_object->q_operator : null;

		$component_tipo	= end($query_object->path)->component_tipo;
		$RecordObj		= new RecordObj_dd($component_tipo);
		$properties		= $RecordObj->get_properties();
		$date_mode		= isset($properties->date_mode) ? $properties->date_mode : 'date';
			#dump($query_object, ' date_mode ++ '.to_string($date_mode));

		$query_object->component_path = ['components',$component_tipo,'dato',DEDALO_DATA_NOLAN];
		$query_object->type 		  = 'jsonb';

		switch ($date_mode) {
			case 'date':
			case 'range':

				# SEARCH_OBJECT 1
					// Extract directly from calculated time in javascript
						$q_clean  = !empty($q_object->start->time) ? $q_object->start->time : 0;
						$operator = !empty($q_operator) ? trim($q_operator) : '=';
						$dd_date  = isset($q_object->start) ? new dd_date($q_object->start) : null;

					switch ($operator) {
						case '<':
						case '>=':

							$query1 = new stdClass();
								$query1->component_path 	= ['start','time'];
								$query1->operator 			= $operator;
								$query1->q_parsed			= '\''.$q_clean.'\'';
								$query1->type 				= 'jsonb';

							$group_op_name = '$or';
							$group_array_elements = new stdClass();
								$group_array_elements->{$group_op_name} = [$query1];

							# query_object config
							$query_object->q_info 			= '';
							$query_object->q_parsed			= null;
							$query_object->format 			= 'array_elements';
							$query_object->array_elements 	= $group_array_elements;
							break;

						case '>':
						case '<=':

							$final_range = self::get_final_search_range_seconds($dd_date);

							$query1 = new stdClass();
								$query1->component_path 	= ['start','time'];
								$query1->operator 			= $operator;
								$query1->q_parsed			= '\''.$final_range.'\'';
								$query1->type 				= 'jsonb';

							$group_op_name = '$or';
							$group_array_elements = new stdClass();
								$group_array_elements->{$group_op_name} = [$query1];

							# query_object config
							$query_object->q_info 			= '';
							$query_object->q_parsed			= null;
							$query_object->format 			= 'array_elements';
							$query_object->array_elements 	= $group_array_elements;
							break;

						case '!*':

							$query1 = clone($query_object);
								$query1->operator 	= ' ';
								$query1->q_parsed 	= 'IS NULL';
								$query1->format		= 'typeof';

							$query2 = clone($query_object);
								$query2->operator 	= '=';
								$query2->q_parsed	= '\'[]\'';
								$query2->type 		= 'string';

							$logical_operator = '$or';

							$new_query_json = new stdClass();
								$new_query_json->$logical_operator = [$query1, $query2];

							$query_object = $new_query_json;
							break;

						case '*':

							$query1 = clone($query_object);
								$query1->operator 	= '=';
								$query1->q_parsed 	= '\'array\''; # (!) remember quotes inside
								$query1->format		= 'typeof';

							$query2 = clone($query_object);
								$query2->operator 	= '!=';
								$query2->q_parsed	= '\'[]\'';
								$query2->type 		= 'string';

							$logical_operator = '$and';

							$new_query_json = new stdClass();
								$new_query_json->$logical_operator = [$query1, $query2];

							$query_object = $new_query_json;


							#$query_object->operator 		= '=';
							#$query_object->q_parsed 		= '\'array\''; # (!) remember quotes inside

							$query_object->operator 		= ' ';
							$query_object->q_parsed 		= 'IS NOT NULL'; # (!) remember quotes inside
							$query_object->format			= 'typeof';
							break;

						case '=':
						default:

							$final_range = self::get_final_search_range_seconds($dd_date);

							# ARRAY ELEMENTS SUBGROUPS
							# ARRAY ELEMENTS SUB_GROUP1
								$query1 = new stdClass();
									$query1->component_path 	= ['start','time'];
									$query1->operator 			= '<=';
									$query1->q_parsed			= '\''.$q_clean.'\'';
									$query1->type 				= 'jsonb';

								$query2 = new stdClass();
									$query2->component_path 	= ['end','time'];
									$query2->operator 			= '>=';
									$query2->q_parsed			= '\''.$q_clean.'\'';
									$query2->type 				= 'jsonb';

								# Add to sub_group1
								$sub_group1 = new stdClass();
									$sub_name1 = '$and';
									$sub_group1->$sub_name1 = [$query1,$query2];
										#dump($sub_group1, ' sub_group1 ++ '.to_string());

							# ARRAY ELEMENTS SUB_GROUP2
								$query1 = new stdClass();
									$query1->component_path 	= ['start','time'];
									$query1->operator 			= '>=';
									$query1->q_parsed			= '\''.$q_clean.'\'';
									$query1->type 				= 'jsonb';

								$query2 = new stdClass();
									$query2->component_path 	= ['start','time'];
									$query2->operator 			= '<=';
									$query2->q_parsed			= '\''.$final_range.'\'';
									$query2->type 				= 'jsonb';

								# Add to sub_group2
								$sub_group2 = new stdClass();
									$sub_name2 = '$and';
									$sub_group2->$sub_name2 = [$query1,$query2];
										#dump($sub_group2, ' sub_group2 ++ '.to_string());

							# Group array elements
							$group_op_name = '$or';
							$group_array_elements = new stdClass();
								$group_array_elements->{$group_op_name} = [$sub_group1,$sub_group2];


							# query_object config
							$query_object->q_parsed			= null;
							$query_object->format 			= 'array_elements';
							$query_object->array_elements  	= $group_array_elements;
							break;
					}

				// Add query_object
				$final_query_object = $query_object;
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

				// Extract directly from calculated time in javascript
				$q_clean  = !empty($q_object->time) ? $q_object->time : 0;
				$operator = !empty($q_operator) ? trim($q_operator) : '=';

				if ($operator!=="=") {

					$query1 = new stdClass();
					$query1->component_path 	= ['start','time'];
					$query1->operator 			= $operator;
					$query1->q_parsed			= '\''.$q_clean.'\'';
					$query1->type 				= 'jsonb';

					$group_op_name = '$or';
					$group_array_elements = new stdClass();
						$group_array_elements->{$group_op_name} = [$query1];

				}else{

					$query1 = new stdClass();
						$query1->component_path 	= ['start','time'];
						$query1->operator 			= '>=';
						$query1->q_parsed 			= '\''.$q_clean.'\'';
						$query1->type 				= 'jsonb';

					$dd_date = new dd_date($q_object);
					$final_range = self::get_final_search_range_seconds($dd_date);
					$query2 = new stdClass();
						$query2->component_path 	= ['start','time'];
						$query2->operator 			= '<=';
						$query2->q_parsed			= '\''.$final_range.'\'';
						$query2->type 				= 'jsonb';

					$group_op_name = '$and';
					$group_array_elements = new stdClass();
						$group_array_elements->{$group_op_name} = [$query1,$query2];
				}

				# query_object config
				$query_object->q_info 			= '';
				$query_object->q_parsed			= null;
				$query_object->format 			= 'array_elements';
				$query_object->array_elements 	= $group_array_elements;

				$final_query_object = $query_object;
				break;

		}//end switch ($date_mode)
		#dump($final_query_object, ' final_query_object ++ '.to_string());


		return $final_query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'>=' 	=> 'mayor_o_igual_que',
			'<='	=> 'menor_o_igual_que',
			'>' 	=> 'mayor_que',
			'<'		=> 'menor_que',
			'*' 	=> 'no_vacio', // not null
			'!*' 	=> 'campo_vacio', // null
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* GET_FINAL_SEARCH_RANGE_SECONDS
	* Calculate current request date + 1 day/month/year to allow
	* search for example, 1930 and find all 130 apperances (1930-01, 1930-15-10, etc..)
	* @return int $final_range
	*/
	protected static function get_final_search_range_seconds($dd_date) {

		$final_search_range_seconds = 0;

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
	* BUILD_SEARCH_COMPARISON_OPERATORS
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=','>','<','>=','<=') ) {
		$search_comparison_operators = new stdClass();

		#
		# Overwrite defaults with 'properties'->SQL_comparison_operators
			if(SHOW_DEBUG===true) {
				#dump($this->properties, " this->properties ".to_string());;
			}
			if(isset($this->properties->SQL_comparison_operators)) {
				$comparison_operators = (array)$this->properties->SQL_comparison_operators;
			}


		foreach ($comparison_operators as $current) {
			# Get the name of the operator in current lang
			$operator = operator::get_operator($current);
			$search_comparison_operators->$current = $operator;
		}

		return (object)$search_comparison_operators;
	}//end build_search_comparison_operators



	/**
	* ADD_TIME
	* Recoge el current dato recibido (de tipo stdClass) y lo usa para crear un objeto dd_date al que inyecta
	* el time (seconds) calculado.
	* Retorna el objeto dd_date creado
	* @return object dd_date $dato
	*/
	public static function add_time( $current_dato ) {

		if(empty($current_dato)) return $current_dato;

		// Period date mode
		if( isset($current_dato->period) ) {
			$dd_date = new dd_date($current_dato->period);
			$time 	 = dd_date::convert_date_to_seconds($dd_date);
			if (isset($current_dato->period->time) && $current_dato->period->time!=$time) {
				debug_log(__METHOD__." Unequal time seconds value: current: ".to_string($current_dato->period->time).", calculated: $time. Used calculated time. []", logger::WARNING);
			}
			$dd_date->set_time( $time );
			$current_dato->period = $dd_date;
		}

		// Range date mode
		if( isset($current_dato->start) ) {
			$dd_date = new dd_date($current_dato->start);
			$time 	 = dd_date::convert_date_to_seconds($dd_date);
			if (isset($current_dato->start->time) && $current_dato->start->time!=$time) {
				debug_log(__METHOD__." Unequal time seconds value: current: ".to_string($current_dato->start->time).", calculated: $time. Used calculated time. []", logger::WARNING);
			}
			$dd_date->set_time( $time );
			$current_dato->start = $dd_date;
		}
		if( isset($current_dato->end) ) {
			$dd_date = new dd_date($current_dato->end);
			$time 	 = dd_date::convert_date_to_seconds($dd_date);
			if (isset($current_dato->end->time) && $current_dato->end->time!=$time) {
				debug_log(__METHOD__." Unequal time seconds value: current: ".to_string($current_dato->end->time).", calculated: $time. Used calculated time. []", logger::WARNING);
			}
			$dd_date->set_time( $time );
			$current_dato->end = $dd_date;
		}
		// Time date mode
		else if( isset($current_dato->hour) ) {
			$dd_date = new dd_date($current_dato);
			$time 	 = dd_date::convert_date_to_seconds($dd_date);

			if (isset($current_dato->time) && $current_dato->time!=$time) {
				debug_log(__METHOD__." Unequal time seconds value: current: ".to_string($current_dato->time).", calculated: $time. Used calculated time. []", logger::WARNING);
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

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '6.0.0':
				break;

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
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value(?string $lang=null, ?object $option_obj=null) : ?string {

		// ar_dato
			$ar_dato = $this->get_dato();
			if(empty($ar_dato)){
				return null;
			}

		$diffusion_value	= '';
		$date_mode			= $this->get_date_mode();

		$ar_diffusion_values = array();
		foreach($ar_dato as $dato) {

			$ar_diffusion_values[] = self::data_item_to_value($dato, $date_mode);

			// DES
				// switch ($date_mode) {
				// 	case 'range':
				// 		$ar_date=array();
				// 		// start
				// 		if (isset($dato->start) && isset($dato->start->year)) {
				// 			$dd_date 		= new dd_date($dato->start);
				// 			$timestamp 		= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
				// 			$ar_date[] 		= $timestamp;
				// 		}
				// 		// end
				// 		if (isset($dato->end) && isset($dato->end->year)) {
				// 			$dd_date 		= new dd_date($dato->end);
				// 			$timestamp 		= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
				// 			$ar_date[] 		= $timestamp;
				// 		}
				// 		$ar_diffusion_values[] = implode(',',$ar_date);
				// 		break;

				// 	case 'period':
				// 		// Compute days
				// 		if (isset($dato->period)) {
				// 			# $seconds = $dato->period->time;
				// 			# $days = ceil($seconds/3600/24);
				// 			$ar_string_period = [];
				// 			if (isset($dato->period->year)) {
				// 				$ar_string_period[] = $dato->period->year .' '. label::get_label('anyos', $lang);
				// 			}
				// 			if (isset($dato->period->month)) {
				// 				$ar_string_period[] = $dato->period->month .' '. label::get_label('meses', $lang);
				// 			}
				// 			if (isset($dato->period->day)) {
				// 				$ar_string_period[] = $dato->period->day .' '. label::get_label('dias', $lang);
				// 			}
				// 			$ar_diffusion_values[] = implode(' ',$ar_string_period);
				// 		}
				// 		break;

				// 	case 'date':
				// 		/*
				// 			$dd_date 	= new dd_date($dato);
				// 			if(isset($dato->day)) {

				// 					$timestamp = $dd_date->get_dd_timestamp("Y-m-d");
				// 			}else{
				// 					$timestamp = $dd_date->get_dd_timestamp("Y-m");
				// 				if(isset($dato->month)) {
				// 					}else{
				// 							$timestamp = $dd_date->get_dd_timestamp("Y");
				// 						}
				// 				}

				// 			$ar_diffusion_values[] = $timestamp;
				// 			break;*/

				// 	default:
				// 		$current_date = reset($dato);
				// 		if (isset($current_date->start)) {
				// 			$current_date = $current_date->start;
				// 		}
				// 		$dd_date 		 		= new dd_date($current_date);
				// 		$timestamp 				= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
				// 		$ar_diffusion_values[] 	= $timestamp;
				// 		break;
				// }
		}//end foreach($ar_dato as $dato)

		#$diffusion_value = implode('|',$ar_diffusion_values);

		# NOTA
		# Para publicación, NO está solucionado el caso en que hay más de una fecha... ejem.. VALORAR ;-)
		$diffusion_value = reset($ar_diffusion_values); // Temporal !!

		# Force null on empty to avoid errors on mysql save value invalid format
		# Only valid dates or null area accepted
		if (empty($diffusion_value)) {
			$diffusion_value = null;
		}

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_CALCULATION_DATA
	* @return int|object $data
	* get the data of the component for do a calculation
	*/
	public function get_calculation_data($options = null){

		$ar_data = [];

		// select
		$select 	= $options->select;
		if(isset($options->format)){
			$format = $options->format;
		}else{
			$format = 'unix_timestamp';
		}
		$dato 		= $this->get_dato();

		foreach ($dato as $current_dato) {
			if (isset($current_dato->{$select})){
				$data_obj =	$current_dato->{$select};
			}else{
				return false;
			}

			if($format==='dd_date'){
				$data_obj->format = ($select==='period') ? 'period' : 'date';
				return $data_obj; // Only one espected
			}

			// value to seconds
			if (!empty($data_obj)) {
				$dd_date 			= new dd_date($data_obj);
				$unix_timestamp 	= $dd_date->convert_date_to_unix_timestamp();
				$ar_data[] = $unix_timestamp ;
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
				return $dd_date->get_dd_timestamp($date_format="Y-m-d", $padding=true);
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

		// self path
			$path = [
				// self component path
				(object)[
					'component_tipo'	=> $component_tipo,
					'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
					'name'				=> RecordObj_dd::get_termino_by_tipo($component_tipo),
					'section_tipo'		=> $section_tipo,
					// 'column'			=> "jsonb_path_query(datos, 'strict $.components.{$component_tipo}.dato.\"lg-nolan\"[0].start.time', silent => true)"
					// 'column'			=> "jsonb_path_query(datos, '$.components.{$component_tipo}.dato.\"lg-nolan\"[0].start.time')"
					'column'			=> "jsonb_path_query_first(datos, 'strict $.components.{$component_tipo}.dato.\"lg-nolan\"[0].start.time', silent => true)"
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
					'modelo'			=> RecordObj_dd::get_modelo_name_by_tipo($this->from_component_tipo,true),
					'name'				=> RecordObj_dd::get_termino_by_tipo($this->from_component_tipo),
					'section_tipo'		=> $this->from_section_tipo
				]);
			}


		return $path;
	}//end get_order_path



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to dato. Override in other cases.
	* Note that empty array or string are returned as null
	* A param '$options' is added only to allow future granular control of the output
	* @param object $options = null
	* 	Optional way to modify result. Avoid using it if it is not essential
	* @return array|null $list_value
	*/
	public function get_list_value(object $options=null) : ?array {

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



}//end class component_date
