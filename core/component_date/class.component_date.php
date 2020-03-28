<?php
/*
* CLASS COMPONENT DATE
 Encargado de guardar y gestionar las fechas de tipo absoluto, como por ejemplo '2012-11-07 17:33:49' that have a json format:
 {
	*    "year": 2012,
	*    "month": 11,
	*    "day": 07,
	*    "hour": 17,
	*    "minute": 33,
	*    "second": 49
	 }
 Debe verificar el formato antes de guardar y a la hora de mostrarse, además de proporcionar la lógica de las búsquedas para localizar años, rangos, etc..
 Podría incorporar un calendario desplegable para seleccionar la fecha de forma normalizada..
*/
class component_date extends component_common {


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# American data format
	public static $ar_american = array('lg-eng','lg-angl','lg-ango','lg-meng');



	/**
	* __CONSTRUCT
	*/
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG===true) {
			if ($this->RecordObj_dd->get_traducible()==='si') {
				#throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
				trigger_error("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP");
			}
		}
	}//end __construct



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method
	*/
	public function Save() {

		# Dato
		$dato = $this->dato;

		//dump(!is_array($dato), ' is array ++ '.to_string());
		# DELETING DATE
		if (empty($dato)) {
			# Salvamos de forma estándar un valor vacío
			return parent::Save();
		}

		# DATO FORMAT VERIFY
		if ( !is_array($dato) ) {
			if(SHOW_DEBUG===true) {
				#dump($dato,'$dato');
				#throw new Exception("Dato is not string!", 1);
				error_log("Bad date format:".to_string($dato));
			}
			return false;
		}

		# add_time to dato always
		foreach ($dato as $key => $current_dato) {
			$this->dato[$key] = self::add_time( $current_dato );
		}


		# From here, save normally
		return parent::Save();
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

		# Compatibility with version 4.0.14 to 4.6 dedalo instalations
		if (is_object($dato) && !empty(get_object_vars($dato)) ) {
			$safe_dato=array();

			$safe_dato[] = $dato;

			$dato = $safe_dato;
			$this->set_dato($dato);
			$this->Save();
		}

		if(SHOW_DEBUG===true) {
			if ( !is_null($dato) && !is_array($dato)  ) {
				#dump( $dato, "WRONG TYPE of dato. tipo: $this->tipo - section_tipo: $this->section_tipo - section_id: $this->parent");
			}
		}

		# Compatibility old dedalo instalations before 4.014
		# if (is_string($dato)) {
		# 	$dd_date    = new dd_date();
		# 	$this->dato = (object)$dd_date->get_date_from_timestamp( $dato );
		# 	$this->Save();
		# 	$dato = parent::get_dato();
		# }
		#dump( $dato, ' dato get_dato ++ '.to_string());

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

		// # Remove empy objects
		// $clean_dato = array();
		// foreach ((array)$dato as $key => $value_obj) {
		// 	$ar_vars = [];
		// 	if (is_object($value_obj)) {
		// 		$ar_vars = (array)get_object_vars($value_obj);
		// 	}
		// 		//dump($ar_vars, ' ar_vars ++ '.to_string());
		// 	if(!empty($ar_vars)) {
		// 		$clean_dato[] = $value_obj;
		// 	}
		// }

		return parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET_DATE_MODE
	* Calculate date_mode from format of current 'dato'
	* @return string
	*/
	public function get_date_mode() {

		$propiedades = $this->get_propiedades();

		if (isset($propiedades->date_mode)) {
			$date_mode = $propiedades->date_mode; // Default from structure if is defined
		}else{
			$date_mode = 'date'; // Default
		}

		/*
		$dato 		 = $this->get_dato();
		switch (true) {
			#case isset($dato->start):
			case is_object($dato) && property_exists($dato, 'start'):
				$date_mode = 'range';
				break;
			#case isset($dato->period):
			case is_object($dato) && property_exists($dato, 'period'):
				$date_mode = 'period';
				break;
			default:
				if (isset($propiedades->date_mode)) {
					$date_mode = $propiedades->date_mode; // Default from structure if is defined
				}else{
					$date_mode = 'date'; // Default
				}
				break;
		}*/
		return $date_mode;
	}//end get_date_mode



	/**
	* GET_DATE_NOW
	* Get current full date (with hours, minutes and seconds) as dd_date object
	* @return object dd_date
	*/
	public static function get_date_now() {

		$date = new DateTime();

		$dato = new dd_date();
			$dato->set_year( 	$date->format('Y') );	// 	 $date->format('Y-m-d H:i:s'); # Default as DB format
			$dato->set_month( 	$date->format('m') );
			$dato->set_day( 	$date->format('d') );
			$dato->set_hour( 	$date->format('H') );
			$dato->set_minute( 	$date->format('i') );
			$dato->set_second( 	$date->format('s') );

		return (object)$dato;
	}//end get_date_now



	/**
	* GET VALOR (Ojo: Se usa para ordenar, por lo que mantiene el formato DB. Para visualizar usar 'get_valor_local()')
	* Dato formated as timestamp '2012-11-07 17:33:49'
	*/
	public function get_valor() {

		#$previous_modo = $this->get_modo();
		#$this->set_modo('list'); // Force list mode
		#$valor = $this->get_html();
		# Restore modo after
		#$this->set_modo($previous_modo);

		$ar_dato 		= $this->get_dato();
		$propiedades	= $this->get_propiedades();
		$ar_valor		= array();
		$valor			= '';
		$date_mode 		= $this->get_date_mode();
		foreach ($ar_dato as $key => $current_dato) {

			$ar_valor[$key] = ''; // default

			if(empty($current_dato)) {
				continue;
			}

			switch ($date_mode) {

				case 'range':
					# Start
					$valor_start = '';
					if(isset($current_dato->start)) {
						$dd_date = new dd_date($current_dato->start);
						/*
						$valor_start= isset($propiedades->method->get_valor_local)
									? component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) )
									: component_date::get_valor_local( $dd_date, false );
									*/
						if(isset($current_dato->start->day)) {
							$valor_start = $dd_date->get_dd_timestamp("Y-m-d");
						}else{
							$valor_start = $dd_date->get_dd_timestamp("Y-m");
							if(isset($current_dato->start->month)) {
							}else{
								$valor_start = $dd_date->get_dd_timestamp("Y", $padding=false);
							}
						}

						$ar_valor[$key] .= $valor_start;
					}

					# End
					$valor_end = '';
					if(isset($current_dato->end)) {
						$dd_date	= new dd_date($current_dato->end);
						/*
						$valor_end 	= isset($propiedades->method->get_valor_local)
									? component_date::get_valor_local( $dd_date, reset($propiedades->method->get_valor_local) )
									: component_date::get_valor_local( $dd_date, false );
						*/

						if(isset($current_dato->end->day)) {
								$valor_end = $dd_date->get_dd_timestamp("Y-m-d");
							}else{
								if(isset($current_dato->end->month)) {
									$valor_end = $dd_date->get_dd_timestamp("Y-m");
								}else{
									$valor_end = $dd_date->get_dd_timestamp("Y", $padding=false);
								}
							}
						$ar_valor[$key] .= ' <> '. $valor_end;
					}
					#$valor .= $valor_start .' <> '. $valor_end;
					break;

				case 'period':
					if(!empty($current_dato->period)) {

						$ar_string_period = [];

						$dd_date = new dd_date($current_dato->period);
						# Year
						$ar_string_period[] = isset($dd_date->year) ? $dd_date->year .' '. label::get_label('anyos') : '';
						# Month
						$ar_string_period[] = isset($dd_date->month) ? $dd_date->month .' '. label::get_label('meses') : '';
						# Day
						$ar_string_period[] = isset($dd_date->day) ? $dd_date->day .' '. label::get_label('dias') : '';

						$ar_valor[$key] = implode(' ', $ar_string_period);
					}
					break;

				case 'time':
					$dd_date = new dd_date($current_dato);
					// $hour  	 = isset($dd_date->hour)	? sprintf("%02d", $dd_date->hour)   : '00';
					// $minute  = isset($dd_date->minute)	? sprintf("%02d", $dd_date->minute) : '00';
					// $second  = isset($dd_date->second)	? sprintf("%02d", $dd_date->second) : '00';
					// $separator_time = ':';
					// $ar_valor[$key] = $hour . $separator_time . $minute . $separator_time . $second;
					$ar_valor[$key] = $dd_date->get_dd_timestamp('H:i:s', true);
					break;

				case 'date_time':
					if(isset($current_dato->start)) {
						$dd_date 		= new dd_date($current_dato->start);
						$ar_valor[$key] = $dd_date->get_dd_timestamp('Y-m-d H:i:s', true);
					}
					break;

				case 'date':
				default:
					# Start
					$valor_start = '';
					if(isset($current_dato->start)) {
						$dd_date = new dd_date($current_dato->start);

						if(isset($current_dato->start->day)) {
							$valor_start = $dd_date->get_dd_timestamp('Y-m-d');
						}else{
							$valor_start = $dd_date->get_dd_timestamp('Y-m');
							if(isset($current_dato->start->month)) {
							}else{
								$valor_start = $dd_date->get_dd_timestamp('Y', $padding=false);
							}
						}

						$ar_valor[$key] .= $valor_start;
					}
					/*
					* PREVIOUS TO 4.9.1
					if(!empty($current_dato)) {
						$dd_date		= new dd_date($current_dato);
						#$ar_valor[$key] = $dd_date->get_dd_timestamp("Y-m-d");

						if(isset($current_dato->day)) {
							$valor = $dd_date->get_dd_timestamp("Y-m-d");
						}else{
							$valor = $dd_date->get_dd_timestamp("Y-m");
							if(isset($current_dato->month)) {
							}else{
								$valor = $dd_date->get_dd_timestamp("Y", $padding=false);
							}
						}

						$ar_valor[$key] .= $valor;

					}*/

					break;
			}
		}

 		$valor = implode((isset($propiedades->divisor) ? $propiedades->divisor : ' | '), $ar_valor);

		return (string)$valor;
	}//end get_valor



	/**
	* GET VALOR LOCAL
	* Convert internal dato formated as timestamp '2012-11-07 17:33:49' to current lang data format like '07-11-2012 17:33:49'
	*/
	public static function get_valor_local( $dd_date, $full=false ) {
		$valor_local= '';
		$separator  = dd_date::$separator;

		switch (true) {
			case (empty($dd_date->month) && empty($dd_date->day) ):
				$date_format	= "Y";
				break;
			case ( empty($dd_date->day) && !empty($dd_date->month) ):
				$date_format	= "m{$separator}Y";
				break;
			default:
				$date_format	= "d{$separator}m{$separator}Y";
				break;
		}
		#$date_format	= "d-m-Y";	# TODO: change order when use english lang ?? ...
		$valor_local 	= $dd_date->get_dd_timestamp($date_format, $padding=false);
			#dump($valor_local, ' valor_local ++ '.to_string());
		#debug_log(__METHOD__." valor_local: $valor_local ".to_string($valor_local), logger::WARNING);


		return (string)$valor_local;
	}//end get_valor_local


	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
			$valor = $this->get_valor($lang);
		}else{
			#$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}


		#$valor = strip_tags($valor); // Removes the span tag used in list mode
		/*
		$previous_modo = $this->get_modo();
		$this->set_modo('list'); // Force list mode
		$valor = $this->get_html();
		# Restore modo after
		$this->set_modo($previous_modo);
		*/

		return (string)$valor;
	}//end get_valor_export



	/**
	* GET_DATO_AS_TIMESTAMP
	* Get current component dato and create a standar timestamp string
	* using dd_date class call
	* DEPRECATED 22-08-2017
	* @return string $timestamp
	*//*
	public function get_dato_as_timestamp_DEPRECATED() {
		$dato 	 	= $this->get_dato();
		$dd_date 	= new dd_date($dato);
		$timestamp 	= $dd_date->get_dd_timestamp(); // $date_format="Y-m-d H:i:s"

		return (string)$timestamp;
	}//end get_dato_as_timestamp
	*/



	/**
	* GET TIMESTAMP
	* @return current time formated for saved to SQL timestamp field
	*	like 2013-01-22 22:33:29 ('Y-m-d H:i:s')
	*	DateTime is avaliable for PHP >=5.3.0
	*/
	public static function get_timestamp_now_for_db( $offset=null ) {

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
	public static function timestamp_to_date($timestamp, $full=true) {

		if (empty($timestamp) || strlen($timestamp)<10) {
			return null;
		}

		$ano  	= substr($timestamp, 0, 4);
		$mes 	= substr($timestamp, 5, 2);
		$dia   	= substr($timestamp, 8, 2);
		$hora 	= substr($timestamp, 11, 2);
		$min 	= substr($timestamp, 14, 2);
		$sec 	= substr($timestamp, 17, 2);
		/*
		if (in_array(DEDALO_APPLICATION_LANG, self::$ar_american)) {
			# American format month/day/year
			$date	= $mes . '-' .$dia . '-' .$ano ;
		}else{
			# European format day.month.year
			$date	= $dia . '-' .$mes . '-' .$ano ;
		}
		*/
		$date	= $dia . '-' .$mes . '-' .$ano ;

		if($full===true) {
			$date	.= ' ' .$hora . ':' .$min . ':' .$sec ;
		}

		return $date;
	}//end timestamp_to_date



	/**
	* GET_EJEMPLO
	*/
	protected function get_ejemplo() {
		/*
		if (in_array(DEDALO_APPLICATION_LANG, self::$ar_american)) {
			# American format month/day/year
			$format = 'MM-DD-YYYY';
		}else{
			# European format day.month.year
			$format = 'DD-MM-YYYY';
		}
		*/
		$date_mode = $this->get_date_mode();
		if ($date_mode==='time') {
			$format = 'HH'.dd_date::$time_separator.'MM'.dd_date::$time_separator.'SS';
		}else{
			$format = 'DD'.dd_date::$separator.'MM'.dd_date::$separator.'YYYY';
		}

		return $format;
	}//end get_ejemplo



	/**
	* GET_STATS_VALUE_RESOLVED
	*/
	public static function get_stats_value_resolved( $tipo, $current_stats_value, $stats_model ,$stats_propiedades=NULL ) {

		$caller_component = get_called_class();

			#dump($stats_propiedades,'stats_propiedades '.$caller_component);

		#if($caller_component=='component_autocomplete_ts')
		#dump($current_stats_value ,'$current_stats_value '.$tipo ." $caller_component");

		foreach ($current_stats_value as $current_dato => $value) {

			# PROPIEDADES 'year_only' : Return only year as '1997'
			if($stats_propiedades->context_name==='year_only') {
				$current_dato = date("Y", strtotime($current_dato));
			}

			if( empty($current_dato) ) {

				$current_dato = 'nd';
				$ar_final[$current_dato] = $value;

			}else if($current_dato==='nd') {

				$ar_final[$current_dato] = $value;

			}else{

				$current_component = component_common::get_instance($caller_component,$tipo,NULL,'stats');
				$current_component->set_dato($current_dato);

				$valor = $current_component->get_valor();
					#dump($valor,'valor '.$caller_component. " - current_dato:$current_dato");

				$ar_final[$valor] = $value;
			}

		}//end foreach

		$label 		= RecordObj_dd::get_termino_by_tipo( $tipo ).':'.$stats_model;
		$ar_final 	= array($label => $ar_final );
			#dump($ar_final,'$ar_final '.$caller_component . " ".print_r($current_stats_value,true));

		return $ar_final;
	}//end get_stats_value_resolved



	/*
	* GET_METHOD
	* Return the result of the method calculation into the component
	*/
	public function get_method( $param ){
		switch ($param) {
			case 'Today':
				//return self::get_timestamp_now_for_db();
				return self::get_date_now();
				break;

			default:
				return false;
				break;
		}
	}//end get_method



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql($query_object) {

		// Check if q is an valid object
		// Note that if q is number, json_decode not will generate error here
		if (!$q_object = json_decode($query_object->q)) {
			#debug_log(__METHOD__." Error on decode query_object->q ".to_string($query_object), logger::WARNING);
		}

		if (empty($query_object->q) && empty($query_object->q_operator)) {
			return $query_object;
		}

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

		$component_tipo = end($query_object->path)->component_tipo;
        $RecordObj   	= new RecordObj_dd($component_tipo);
        $propiedades 	= json_decode($RecordObj->get_propiedades());
        $date_mode 	 	= isset($propiedades->date_mode) ? $propiedades->date_mode : 'date';
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
	public function search_operators_info() {

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
		# Overwrite defaults with 'propiedades'->SQL_comparison_operators
			if(SHOW_DEBUG===true) {
				#dump($this->propiedades, " this->propiedades ".to_string());;
			}
			if(isset($this->propiedades->SQL_comparison_operators)) {
				$comparison_operators = (array)$this->propiedades->SQL_comparison_operators;
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

		// Default date mode
		// PREVIOUS 4.9.1
		/*
		if( isset($current_dato->year) ) {

			$dd_date = new dd_date($current_dato);
			$time 	 = dd_date::convert_date_to_seconds($dd_date);
			if (isset($current_dato->time) && $current_dato->time!=$time) {
				debug_log(__METHOD__." Unequal time seconds value: current: ".to_string($current_dato->time).", calculated: $time. Used calculated time. []", logger::WARNING);
			}
			$dd_date->set_time( $time );
			$current_dato = $dd_date;
		}
		*/
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
	* @return
	*/
	public static function update_dato_version($request_options) {

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
			/* EN PROCESO
			case '4.9.2':

				# Transform old dato in activity section
				if ($options->section_tipo===DEDALO_ACTIVITY_SECTION_TIPO && !empty($dato_unchanged) && is_string($dato_unchanged)) {

					$dd_date    = new dd_date();
					$new_dato 	= (object)$dd_date->get_date_from_timestamp( $dato_unchanged );

					$response = new stdClass();
						$response->result =1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;

				}else{
					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
						return $response;
				}
				break;
				*/
			case '4.9.1':
				if (!empty($dato_unchanged)) {

					/* 	Change the dato to be compatible with the range format {"start":{...}}
					*	From:
					*	[{"time":64313740800,"year":2001}]
					*	To:
					*	[{"start":{"time":64313740800,"year":2001}}]
					*/

					if(!is_array($dato_unchanged)){
						$dato_unchanged = (array)$dato_unchanged;
					}
					//Check the date format for update only the normal date format
					switch (true) {
						case isset($dato_unchanged[0]->start):
						case isset($dato_unchanged[0]->period):
							$response = new stdClass();
							$response->result = 2;
							$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."

							break;
						default:
							$conversion = new stdClass();

							foreach ($dato_unchanged as $value) {
								$conversion->start = $value;
							}
							$new_dato = [];

							$new_dato[] = $conversion;

							$response = new stdClass();
							$response->result = 1;
							$response->new_dato = $new_dato;
							$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
							break;
					}


					return $response;

				}else{
					$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;


			case '4.8.1':
				if (!empty($dato_unchanged)) {

					$new_dato = $dato_unchanged; // Only we need re-save the dato to recalculate time in seconds

					$response = new stdClass();
					$response->result = 1;
					$response->new_dato = $new_dato;
					$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;

				}else{
					$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;

			case '4.7.0':
				if (!empty($dato_unchanged) && is_object($dato_unchanged) ) {
					#dump($dato_unchanged, ' dato_unchanged ++ '.to_string($reference_id)); #die();

					$new_dato = [];
					$new_dato = $dato_unchanged;
						#dump($new_dato, ' new_dato ++ '. $reference_id.' -> '.to_string($dato_unchanged));

					$response = new stdClass();
					$response->result = 1;
					$response->new_dato = $new_dato;
					$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;

				}else{
					$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;

			case '4.0.14':
				if (!empty($dato_unchanged) && is_object($dato_unchanged) ) {
					#dump($dato_unchanged, ' dato_unchanged ++ '.to_string($reference_id)); #die();

					$new_dato = component_date::add_time($dato_unchanged);
						#dump($new_dato, ' new_dato ++ '. $reference_id.' -> '.to_string($dato_unchanged));

					$response = new stdClass();
					$response->result = 1;
					$response->new_dato = $new_dato;
					$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;

				}else{
					$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;

			case '4.0.10':
				#$dato = $this->get_dato_unchanged();

				# Compatibility old dedalo instalations
				if (is_string($dato_unchanged) && !empty($dato_unchanged)) {
						#dump($dato, ' dato '.to_string($this->parent).' '. to_string($this->section_tipo));
					$dd_date    = new dd_date();
					$new_dato 	= (object)$dd_date->get_date_from_timestamp( $dato_unchanged );

					$response = new stdClass();
					$response->result =1;
					$response->new_dato = $new_dato;
					$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;


				}else{
					$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;
			case '4.0.10':
				$result = true;
				return $result;
				break;
			default:
				# code...
				break;
		}
	}//end update_dato_version



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		if($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			# nothing to do. Value is final value
		}else{
			$component 	= component_common::get_instance(__CLASS__,
														 $tipo,
													 	 $parent,
													 	 $modo,
														 DEDALO_DATA_NOLAN,
													 	 $section_tipo);

			# Use already query calculated values for speed
			#$dato = json_handler::decode($value);
			#$component->set_dato($dato);

			$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions

			$value = $component->get_html();
			#$value = $component->get_valor();
		}

		return $value;
	}//end render_list_value



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {

		$diffusion_value = '';
		$ar_dato 		 = $this->get_dato();

		if(empty($ar_dato)){
			return null;
		}

		$date_mode 		 = $this->get_date_mode();
		$ar_diffusion_values = array();
		foreach ($ar_dato as $dato) {
			switch ($date_mode) {
				case 'range':
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
							$ar_string_period[] = $dato->period->year .' '. label::get_label('anyos', $lang);
						}
						if (isset($dato->period->month)) {
							$ar_string_period[] = $dato->period->month .' '. label::get_label('meses', $lang);
						}
						if (isset($dato->period->day)) {
							$ar_string_period[] = $dato->period->day .' '. label::get_label('dias', $lang);
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
					$current_date = reset($dato);
					if (isset($current_date->start)) {
						$current_date = $current_date->start;
					}
					$dd_date 		 		= new dd_date($current_date);
					$timestamp 				= $dd_date->get_dd_timestamp("Y-m-d H:i:s");
					$ar_diffusion_values[] 	= $timestamp;
					break;
			}
		}

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
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* En este caso, usaremos únicamente el valor en bruto devuelto por el método 'get_dato_unchanged'
	*
	* @see class.section.php
	* @return mixed $result
	*/
	public function get_valor_list_html_to_save() {
		#$result = $this->get_dato_unchanged();
		$result = $this->get_valor();

		return $result;
	}//end get_valor_list_html_to_save



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
	public static function data_to_text($data) {

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



}
?>
