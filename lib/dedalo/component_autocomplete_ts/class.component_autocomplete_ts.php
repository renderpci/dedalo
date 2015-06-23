<?php
/*
* CLASS COMPONENT REF
 La idea es que sea un puntero hacia otros componentes. Que guarde el id_matrix y el tipo y se resuelva al mostrarse.
 Ejemplo: guardamos el id_matrix del usuario actual desde activity y al mostrar el componente en los listado de actividad, mostramos su resolución
 en lugar de su dato (Admin por )... por acabar..
*/


class component_autocomplete_ts extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	# Array of related terms in structure (one or more)
	protected $ar_terminos_relacionados;

	# referenced component tipo
	public $ar_referenced_tipo;

	

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

	# GET DATO : Format "es967"
	public function get_dato() {
		$dato = parent::get_dato();
		return (string)$dato;
	}

	# SET_DATO . With regex verification
	public function set_dato($dato) {
		# Si el dato está vacío, es que queremos eliminar el contenido. No comprobar ese caso.
		if (!empty($dato)) {
			# code...		
			preg_match('/^[a-z]{2}\d+$/', $dato, $output_array);
			if( empty($output_array) ) {
				throw new Exception("Error Processing Request. Invalid dato: '$dato' for component $this->tipo", 1);			
			}
		}
		parent::set_dato( (string)$dato );
	}


	


	# GET_REFERENCED_TIPO
	public function get_ar_referenced_tipo() {
		
		$ar_referenced_tipo = array();

		# COMPONENT PROPIEDADES VAR
		#dump($this->RecordObj_dd,'$this->RecordObj_dd');
		$tipo 			= $this->get_tipo();
		$RecordObj_dd 	= new RecordObj_dd($tipo);
		$ts_propiedades = $RecordObj_dd->get_propiedades();
			#dump($ts_propiedades,'$ts_propiedades');

		if (!empty($ts_propiedades)) {
			# PROPIEDADES VARS to JSON . Ojo: vars devuelto por 'json_decode' es un objeto (al contrario que 'json_handler::decode' que devuelve un array)
			$vars = json_decode($ts_propiedades);
				#dump($vars->jer_tipo,'$vars');

			# JER_TIPO 
			if ( !empty($vars->jer_tipo) ) {
				$ar_tesauro_by_jer_tipo = RecordObj_jer::get_ar_tesauro_by_jer_tipo($vars->jer_tipo);
					#dump($ar_tesauro_by_jer_tipo,'ar_tesauro_by_jer_tipo');

				foreach ($ar_tesauro_by_jer_tipo as $tld) {
					$ar_referenced_tipo[] = strtolower($tld)."1";
				}
			}
			#dump($ar_referenced_tipo,'$ar_referenced_tipo');

			return $ar_referenced_tipo;
		}


		/*
		$relaciones = $this->RecordObj_dd->get_relaciones();
		if (!empty($relaciones) && is_array($relaciones)) foreach($relaciones as $ar_relaciones) {

			foreach($ar_relaciones as $tipo_modelo => $current_referenced_tipo) {
				#dump($ar_referenced_tipo,'$ar_referenced_tipo');
				$ar_referenced_tipo[] = $current_referenced_tipo;
			}			
		}
		#dump($ar_referenced_tipo,'$ar_referenced_tipo');

		return $ar_referenced_tipo;*/
	}

	public function ger_ar_link_fields(){
		$ar_link_fields = array();

		$tipo 			= $this->get_tipo();
		$RecordObj_dd 	= new RecordObj_dd($tipo);
		$relaciones 	= $RecordObj_dd->get_relaciones();

		if (!empty($relaciones) && is_array($relaciones)) foreach($relaciones as $ar_relaciones) {

			foreach($ar_relaciones as $tipo_modelo => $current_link_fields) {
				#dump($ar_referenced_tipo,'$ar_referenced_tipo');
				$modelo_name = RecordObj_dd::get_termino_by_tipo($tipo_modelo,null,true);

				$ar_link_fields[$modelo_name] = $current_link_fields;
			}			
		}
		//dump($ar_link_fields,'$ar_link_fields');

		return $ar_link_fields;

	}
	

	/**
	* GET VALOR 
	* Get resolved string representation of current tesauro value
	*/
	public function get_valor() {

		#$dato = $this->dato;
		$dato = $this->get_dato();
			#dump($dato,'dato '.gettype($dato) );

		if ( empty($dato) || strlen($dato)<3 || $dato=='null' ) return NULL;

		if(!is_string($dato)) return "Sorry, type:" .gettype($dato). " not supported yet";		

		$valor = RecordObj_ts::get_termino_by_tipo($dato, DEDALO_DATA_LANG);

		# Propiedades
		$propiedades = $this->get_propiedades();
			#dump($propiedades,'$propiedades');
		if (!empty($propiedades->jer_tipo) && $propiedades->jer_tipo==2) {
			# Show with childrens like "Benimamet - Valencia - Spain"
			$RecordObj_ts = new RecordObj_ts($dato);
			$ar_parents = $RecordObj_ts->get_ar_parents_of_this($dato); ksort($ar_parents);
				#dump($ar_parents,'ar_parents '.$dato);
				foreach ($ar_parents as $current_terminoID) {
					$current_termino = RecordObj_ts::get_termino_by_tipo($current_terminoID, DEDALO_DATA_LANG,true);
					$valor .= ", $current_termino";
				}
		}

		return $valor;
	}


	/**
	* FIRE_TREE_RESOLUTION
	*/
	public static function get_tree_resolution($tipo) {

		$is_root = component_autocomplete_ts::is_root($tipo);
			#dump($is_root,'is_root for '.$tipo);

		# No calculate tree for root tipo
		if($is_root==true) return null;

		#unset($_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo]);		
		
		if(isset($_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo])) {

			$ar_recursive_childrens = $_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo];
				#dump("returned values from session",'returned values from session');
		}else{

			# Buscamos TODOS los hijos recursivamente
			$RecordObj_ts 			= new RecordObj_ts($tipo);
			$ar_recursive_childrens = $RecordObj_ts->get_ar_recursive_childrens_of_this($tipo);
			# Store in php session for speed
			$_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo] = $ar_recursive_childrens;
		}
		
		#dump($_SESSION['dedalo4']['config']['ar_recursive_childrens'][$tipo]);
		return $ar_recursive_childrens ;
	}

	public static function is_root($tipo) {

		$tipo_id = intval(substr($tipo, 2));
			#dump($tipo_id);
		if($tipo_id===1) {
			return true;
		}else{
			return false;
		}	
	}

	
	/**
	* AUTOCOMPLETE_TS_SEARCH
	* Used by trigger on ajax call
	* @param array ar_referenced_tipo like ['es1','fr1'] (parent where start to search)
	* @param string_to_search
	* @return ar_result 
	*	Array format: id_matrix=>dato_string 
	*/
	public static function autocomplete_ts_search($ar_referenced_tipo, $string_to_search, $max_results=30, $show_modelo_name=true) {
		#dump($ar_referenced_tipo, 'ar_referenced_tipo', array());
		#if(SHOW_DEBUG) $start_time = start_time();

		if(!is_array($ar_referenced_tipo)) $ar_referenced_tipo = array($ar_referenced_tipo);		
			#dump($ar_referenced_tipo,'$ar_referenced_tipo');
		
		if (!isset($ar_referenced_tipo[0])) {
			throw new Exception("Error Processing Request. ar_referenced_tipo received is empty", 1);			
		}

		
		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'parent';
		

		#$arguments['dato:begins']		= $string_to_search;
		$arguments['dato:begins_or']	= array($string_to_search, ucfirst($string_to_search) );
		# INDEX
		# CREATE INDEX dato_index ON matrix_descriptors USING gin(to_tsvector('english', dato));
		# SEARCH EXAMPLE
		/*
		SELECT *
		FROM "matrix_descriptors"
		WHERE to_tsvector('english',dato) @@ to_tsquery('english','valenc') AND "tipo" = 'termino' AND (parent ILIKE 'dz%' OR parent ILIKE 'ad%' OR parent ILIKE 'cu%' OR parent ILIKE 'fr%' OR parent ILIKE 'ma%' OR parent ILIKE 'pt%' OR parent ILIKE 'es%')
		LIMIT 100;
		*/
		#$arguments['sql_code']			= "to_tsvector('english',dato) @@ to_tsquery('english','{$string_to_search}')";

		
		$arguments['tipo']				= 'termino';

		# ar_referenced_tipo iterate to generate sql
		$ar_prefijos = array();
		foreach ($ar_referenced_tipo as $current_tipo) {
			$prefijo 		= substr($current_tipo, 0,2);
			$ar_prefijos[] 	= $prefijo;
		}
		$arguments['parent:begins_or']	= $ar_prefijos;	
		
		#$arguments['lang']				= DEDALO_DATA_LANG;
		$arguments['sql_limit']			= $max_results;
		$matrix_table					= RecordObj_descriptors::get_matrix_table_from_tipo($prefijo);
		$RecordObj_descriptors			= new RecordObj_descriptors($matrix_table, NULL);
		$ar_records						= $RecordObj_descriptors->search($arguments);
			#dump($ar_records,'ar_records'." string_to_search:$string_to_search - sql_limit:$max_results - ".print_r($arguments,true) ) ;	


		# ESDESCRIPTOR : Removome non descriptors
		foreach ($ar_records as $key => $terminoID) {
			# code...
			$RecordObj_ts	= new RecordObj_ts($terminoID);
			$esmodelo		= $RecordObj_ts->get_esmodelo();
			
			if($esmodelo=='si') {
				unset($ar_records[$key]);
				//error_log('removed '.$terminoID);
			}
			
		}
		#dump($ar_records,'$ar_records	');

		
		/*
		# AUTORITHED CHILDRENS
		$ar_recursive_childrens = array();
		foreach ($ar_referenced_tipo as $current_tipo) {

			$is_root = component_autocomplete_ts::is_root($current_tipo);
				#dump($is_root,'is_root');
			
			# Buscamos TODOS los hijos recursivamente cuando no se nos pasa un root tipo 'ts1'
			if(!$is_root) {
				$current_ar_recursive_childrens = component_autocomplete_ts::get_tree_resolution($current_tipo);
				$ar_recursive_childrens 		= $ar_recursive_childrens + $current_ar_recursive_childrens;
			}
		}
		#dump($ar_recursive_childrens, 'ar_recursive_childrens');
		*/


		# RESULT DATA
		$ar_result = array();
		$matrix_table = 'matrix_descriptors';	#RecordObj_descriptors::get_matrix_table_from_tipo($current_terminoID);
		foreach ($ar_records as $current_terminoID) {

			# Children filter only for non root tipo
			#if(!$is_root) {
				# Si alguno de los resultados no está en el array de hijos, lo eliminamos del resultado (es más rápido que filtrarlo en la consulta a mysql)
				#if (!in_array($current_terminoID, $ar_recursive_childrens)) {
				#	continue;
				#}
			#}
			
			# Dato
			$arguments=array();
			$arguments['strPrimaryKeyName']	= 'dato';
			$arguments['parent']			= $current_terminoID;	
			$arguments['tipo']				= 'termino';
			#$arguments['lang']				= DEDALO_DATA_LANG;			
			$RecordObj_descriptors			= new RecordObj_descriptors($matrix_table, NULL);
			$ar_records_dato				= $RecordObj_descriptors->search($arguments);
			$termino 						= $ar_records_dato[0];

			# Calculamos el modelo
			$modelo_name = NULL;
			if($show_modelo_name)
				$modelo_name = ' - '.RecordObj_ts::get_modelo_name_by_tipo($current_terminoID,true);

			$ar_result[$current_terminoID] 	= $termino .' '. $modelo_name;
		}
		#dump($ar_result,'$ar_result');

		#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, "ar_recursive_childrens: ".count($ar_recursive_childrens) );		
		#if(SHOW_DEBUG) error_log( exec_time($start_time, __METHOD__, " string_to_search:$string_to_search ") );
		
		return $ar_result;		
	}

	/**
	* AUTOCOMPLETE_TS_SEARCH
	* Used by trigger on ajax call
	* @param tipo
	* @param string_to_search
	* @return ar_result 
	*	Array format: id_matrix=>dato_string 
	*/
	/*
	public static function autocomplete_ts_search_old($tipo, $string_to_search, $max_results=30) {		

		if(SHOW_DEBUG) $start_time = start_time();

		static $ar_records ;
		
		if(!isset($ar_records)) {

			# Buscamos TODOS los hijos recursivamente
			$RecordObj_dd 			= new RecordObj_dd($tipo);
			$ar_recursive_childrens = $RecordObj_dd->get_ar_recursive_childrens_of_this($tipo);
				#dump($ar_recursive_childrens,'ar_recursive_childrens');

			# Resolvemos el nombre para cada uno y lo almacenamos en un array
			foreach ($ar_recursive_childrens as $terminoID) {

				$ar_records[$terminoID] = RecordObj_dd::get_termino_by_tipo($terminoID, DEDALO_DATA_LANG);
			}
			#dump(count($ar_recursive_childrens),"fired ar_records ".count($ar_recursive_childrens));		
		}	
		if(SHOW_DEBUG) error_log( exec_time($start_time, __METHOD__) );

		# Recorremos el array de terminoID=>nombre filtrando por 'string_to_search'
		$ar_result = array();
		foreach ($ar_records as $terminoID => $termino) {

			$pos = strpos( strtolower($termino), strtolower($string_to_search));

			if ($pos===0) {
				$ar_result[$terminoID] = $termino ;
			}
		}

		#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, __METHOD__, "ar_recursive_childrens: ".count($ar_recursive_childrens) );
		

		return $ar_result;		
	}
	*/

	

	

}
?>