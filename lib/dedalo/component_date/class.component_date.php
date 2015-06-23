<?php
/*
* CLASS COMPONENT DATE
 Encargado de guardar y gestionar las fechas de tipo absoluto, como por ejemplo '2012-11-07 17:33:49'
 Basado en un component_input_text, se irá sofisticando.
 Debe verificar el formato antes de guardar y a la hora de mostrarse, además de proporcionar la lógica de las búsquedas para localizar años, rangos, etc..
 Podría incorporar un calendario desplegable para seleccionar la fecha de forma normalizada..
*/


class component_date extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# American data format
	public static $ar_american	= array('lg-eng','lg-angl','lg-ango','lg-meng');


	
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);				
			}
		}
	}

	

	/**
	* SAVE OVERRIDE
	* Overwrite component_common method 
	*/
	public function Save() {
		
		# Dato
		$dato = $this->dato;
		$dato_source = $dato;

		# DELETING DATE
		if (empty($dato)) {
			# Salvamos de forma estándar un valor vacío
			return parent::Save();
		}

		# DATO FORMAT VERIFY
		if ( !is_string($dato) || empty($dato) ) {			
			if(SHOW_DEBUG) {
				#dump($dato,'$dato');
				#throw new Exception("Dato is not string!", 1);
				error_log("Bad date format:".$dato);
			}
			return false;
		}


		# CONVERT 2013-11-30 FORMAT TO TIMESTAMP => 2013-11-30 00:00:00
		try {
			$date = new DateTime($dato);
		} catch (Exception $e) {
		    if(SHOW_DEBUG) {
				error_log("Bad date format:".$dato);
			}
			return false;
		}
		
		$dato = $date->format('Y-m-d H:i:s');

		# Verify format
		$pattern = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';
		if(!preg_match_all("/$pattern/", $dato, $matches, PREG_PATTERN_ORDER)) {
			# Format error
			$msg = "Error: format date '$dato_source' is wrong. <br> Nothing is saved!";
			trigger_error($msg);
			return $msg;
		}

		# Set dato
		$this->dato = $dato;

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}


	# GET DATO : Format "1952-04-13 00:00:00"
	public function get_dato() {
		$dato = parent::get_dato();
		$dato = trim(strip_tags($dato));
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	}

	





	/**
	* GET VALOR (Ojo: Se usa para ordenar, por lo que mantiene el formato DB. Para visualizar usar 'get_valor_local()')
	* Dato formated as timestamp '2012-11-07 17:33:49'
	*/
	public function get_valor($format='Y-m-d H:i:s') {

		$dato = $this->get_dato();

		$date = new DateTime($dato);
		$valor = $date->format($format);
			#dump($valor, 'valor', array());
		
		return $valor;
	}

	/**
	* GET VALOR LOCAL 
	* Convert internal dato formated as timestamp '2012-11-07 17:33:49' to current lang data format like '07-11-2012 17:33:49'
	*/
	public function get_valor_local( $full=false ) {
		
		# Real matrix dato timestamp
		$timestamp = trim($this->get_dato());

		if (empty($timestamp) || strlen($timestamp)<=10) {
			return null;
		}

		#dump($timestamp,strlen($timestamp)." $this->tipo - $timestamp -");
		
		# Formated dato by current data lang
		$valor = component_date::timestamp_to_date($timestamp, $full);
	

		return $valor;		
	}


	

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
	}

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
	}


	/**
	* DATE_TO_TIMESTAMP
	* CONVERT 2013-11-30 FORMAT TO TIMESTAMP =>  2013-11-30 00:00:00
	*/
	public static function date_to_timestamp($dato) {

		# Verify
		if(strlen($dato)<10) {
			error_log(__METHOD__." $dato format is wrong");
			return null;
		}
		if(strlen($dato)>10) {
			$pattern = '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';
			if(preg_match_all("/$pattern/", $dato, $matches, PREG_PATTERN_ORDER)) {
				return $dato;
			}else{
				error_log(__METHOD__." $dato format is wrong");
				$msg = "Error Date format $dato is wrong. Use format as XX-XX-XXXX ";
				#throw new Exception($msg, 1);
				return $msg; 
			}						
		}

		$pattern = '([0-9][0-9])-([0-9][0-9])-([0-9][0-9][0-9][0-9])';
		if(preg_match_all("/$pattern/", $dato, $matches, PREG_PATTERN_ORDER)) {
			#dump( $matches,' $matches');

			if (in_array(DEDALO_APPLICATION_LANG, self::$ar_american)) {
				
				# American format month/day/year 'MM-DD-YYYY'				
				$mes 		= $matches[1][0];
				$dia   		= $matches[2][0];
				$ano  		= $matches[3][0];

			}else{

				# European format day.month.year 'DD-MM-YYYY'
				$dia   		= $matches[1][0];			
				$mes 		= $matches[2][0];				
				$ano  		= $matches[3][0];
			}
			
			$timestamp 	= $ano.'-'.$mes.'-'.$dia.' 00:00:00' ;

			return 	$timestamp;

		}else{
			return null;
		}		
	}



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
		$format = 'DD-MM-YYYY';
		return $format;
	}



	# GET_STATS_VALUE_RESOLVED
	public static function get_stats_value_resolved( $tipo, $current_stats_value, $stats_model ,$stats_propiedades=NULL ) {		
		
		$caller_component = get_called_class();

			#dump($stats_propiedades,'stats_propiedades '.$caller_component);

		#if($caller_component=='component_autocomplete_ts') 		
		#dump($current_stats_value ,'$current_stats_value '.$tipo ." $caller_component");

		foreach ($current_stats_value as $current_dato => $value) {

			# PROPIEDADES 'year_only' : Return only year as '1997'
			if($stats_propiedades->context_name=='year_only') {
				$current_dato = date("Y", strtotime($current_dato));
			}
			
			if( empty($current_dato) ) {

				$current_dato = 'nd';
				$ar_final[$current_dato] = $value;

			}else if($current_dato=='nd') {

				$ar_final[$current_dato] = $value;

			}else{

				$current_component = component_common::get_instance($caller_component,$tipo,NULL,'stats');
				$current_component->set_dato($current_dato);

				$valor = $current_component->get_valor();
					#dump($valor,'valor '.$caller_component. " - current_dato:$current_dato");

				$ar_final[$valor] = $value;
			}
			

		}#end foreach

		
		$label 		= RecordObj_dd::get_termino_by_tipo( $tipo ).':'.$stats_model;
		$ar_final 	= array($label => $ar_final );
			#dump($ar_final,'$ar_final '.$caller_component . " ".print_r($current_stats_value,true));
		
		return $ar_final;
	}

	/*
	* GET_METHOD
	* Return the result of the method calculation into the component 
	*/
	public function get_method( string $param ){
		switch ($param) {
			case 'Today':
				return self::get_timestamp_now_for_db();
				break;
			
			default:
				return false;
				break;
		}
	}

}
?>