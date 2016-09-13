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



	/**
	* GET DATO : 
	* OLD Format: "es967"
	* NEW Format: Array(locator1,locator2,..)
	*/
	public function get_dato() {
		$dato = parent::get_dato();

		# Compatibility old dedalo instalations version < 4.31
		# dato like 'es425' is converted to standar locator and later to array
		if (is_string($dato)) {
			$value 	 = $dato;
			$locator = self::convert_dato_to_locator($value);			
			$dato 	 = array( $locator );
			$this->set_dato($dato);
			$this->Save();
			if(SHOW_DEBUG) {
				#dump($value, ' value converted to locator 1 ++ '.to_string($dato));
			}
		}else if (is_array($dato)) {
			/* temporal only
			foreach ($dato as $key => $value) {
				if (is_string($value)) {
					$locator = self::convert_dato_to_locator($value);
					$dato 	 = array( $locator );
					$this->set_dato($dato);
					$this->Save();
					if(SHOW_DEBUG) {
						dump($value, ' value converted to locator 2 ++ '.to_string($dato));
					}
					break;
				}
			}
			*/
		}
		
		return (array)$dato;

	}//end get_dato



	# SET_DATO . With regex verification
	public function set_dato($dato) {
		
		if (is_string($dato)) {
			$dato = json_decode($dato);
		}

		if (is_object($dato)) {
			$dato = array($dato); // IMPORTANT 
		}

		# Remove possible duplicates
		$dato_unique=array();
		foreach ((array)$dato as $locator) {
			if (!in_array($locator, $dato_unique)) {
				$dato_unique[] = $locator;
			}		
		}
		$dato = $dato_unique;
		
		parent::set_dato( (array)$dato );
	}



	/**
	* GET VALOR 
	* Get resolved string representation of current tesauro value
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $format='string' ) {
		
		$dato = $this->get_dato();

		if ( empty($dato) ) {
			if ($format=='array') {
				return array();
			}else{
				return '';
			}
		}

		if(!is_array($dato)) return "Sorry, type:" .gettype($dato). " not supported yet (Only array format)";

		# lang never must be DEDALO_DATA_NOLAN
		if ($lang==DEDALO_DATA_NOLAN) {
			$lang = DEDALO_DATA_LANG; // Force current lang as lang
		}

		# Propiedades
		$propiedades = $this->get_propiedades();

		$ar_valor = array();
		foreach ($dato as $key => $current_locator) {				
			
			$terminoID = self::get_terminoID_by_locator($current_locator); // nota ahora es un terminoID

			$current_valor  = '';
			$current_valor .= RecordObj_ts::get_termino_by_tipo($terminoID, $lang, true);
				#dump($current_valor, ' current_valor ++ '.to_string($lang));			


			#if (!empty($propiedades->jer_tipo) && $propiedades->jer_tipo==2) {
				# Show with childrens like "Benimamet - Valencia - Spain"
				$RecordObj_ts = new RecordObj_ts($terminoID);
				$ar_parents = $RecordObj_ts->get_ar_parents_of_this($terminoID); ksort($ar_parents);
					#dump($ar_parents,'ar_parents '.$terminoID);
					foreach ($ar_parents as $current_terminoID) {
						$current_termino = RecordObj_ts::get_termino_by_tipo($current_terminoID, $lang,true);
						$current_valor .= ", $current_termino";
					}
			#}
			#dump($current_locator, ' current_locator ++ '.to_string());

			#
			# REMOVE TAGS FROM NON TRANSLATED TERMS
			$current_valor = strip_tags($current_valor);
			
			$current_locator_string 			= json_encode($current_locator);
			$ar_valor[$current_locator_string]  = $current_valor;

		}//end foreach ($dato as $key => $current_locator) {


		if ($format=='array') {
			$valor = $ar_valor;
		}else{
			$valor = implode("<br>", $ar_valor);
		}
		#dump($valor, ' valor ++ '.to_string());		
		#$this->valor = $valor;

		return $valor;

	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if (is_null($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor_export = $this->get_valor($lang);
		$valor_export = br2nl($valor_export);

		if(SHOW_DEBUG) {
			#return "AUTOCOMPLETE_TS: ".$valor_export;
		}
		return $valor_export;

	}#end get_valor_export



	/**
	* GET_DATO_SEARCH
	* Generate an array prepared to search containing self and all parents
	* @return 
	*/
	public function get_dato_search() {

		$dato_search=array();

		$dato = $this->get_dato();
		foreach ((array)$dato as $current_locator) {
			
			# self
			$dato_search[] 	= $current_locator;

			# parents
			$terminoID 		= self::get_terminoID_by_locator($current_locator);
			$RecordObj_ts 	= new RecordObj_ts($terminoID);
			$ar_parents 	= (array)$RecordObj_ts->get_ar_parents_of_this();
			foreach ($ar_parents as $current_terminoID) {
				
				$locator = self::convert_dato_to_locator($current_terminoID);
				if (!in_array($locator, $dato_search)) {
					$dato_search[] = $locator;
				}
			}
		}
		#dump($dato_search, ' dato_search1 ++ '.to_string());		

		return $dato_search;

	}#end get_dato_search



	/**
	* CONVERT_DATO_TO_LOCATOR
	* Convert old dato like 'es352' to standar locator like {"section_id":"es352","section_tipo":"es"}
	* Warning: this is a temporal locator (22-10-2015) and will be changed in tesaurized versions
	* @return object locator
	*/
	public static function convert_dato_to_locator($old_dato) {

		if (is_object($old_dato)) {
			return $old_dato;	// unnecessary convert
		}
		if (is_array($old_dato) || !is_string($old_dato)) {			
			if(SHOW_DEBUG) {
				dump($dato, ' dato ++ '.to_string());
			}
			trigger_error("Ops.. dato is not valid for convert ");
			return $old_dato;
		}

		$prefix = RecordObj_dd::get_prefix_from_tipo($old_dato);

		$section_id 	= (string)str_replace($prefix, '', $old_dato);
		$section_tipo 	= (string)$prefix.'1';

		$locator = new locator();
			$locator->set_section_id($section_id);		
			$locator->set_section_tipo($section_tipo);
			#dump($locator, ' locator ++ '.to_string()); die();
		
		return (object)$locator;

	}#end convert_dato_to_locator



	/**
	* GET_TERMINOID_BY_LOCATOR
	* @param object $locator
	* @return string $terminoID
	*/
	public static function get_terminoID_by_locator( $locator ) {

		if(!isset($locator->section_tipo) || !isset($locator->section_id)) {
			dump($locator, ' locator ++ '.to_string());
			debug_log(__METHOD__." Error on get terminoID_by_locator from locator: ".to_string($locator), logger::DEBUG);
			return '';
		}
		$section_tipo = $locator->section_tipo;
		$section_id   = $locator->section_id;
		$terminoID 	  = substr($section_tipo,0,strlen($section_tipo)-1).$section_id;
		
		return (string)$terminoID;

	}#end get_terminoID_by_locator



	/**
	* GET_AR_REFERENCED_TIPO
	*/
	public function get_ar_referenced_tipo() {

		if(isset($this->ar_referenced_tipo)) return $this->ar_referenced_tipo;
		
		$ar_referenced_tipo = array();

		# COMPONENT PROPIEDADES VAR
		$propiedades = $this->get_propiedades();
		$source_mode = $this->get_source_mode();

		if ( isset($propiedades->jer_tipo) ) {
			
			# TEMPORAL
			$ar_tesauro_by_jer_tipo = RecordObj_jer::get_ar_tesauro_by_jer_tipo($propiedades->jer_tipo);
			foreach ($ar_tesauro_by_jer_tipo as $tld) {
				$ar_referenced_tipo[] = strtolower($tld)."1";
			}
			debug_log(__METHOD__." Deprecated source mode. Please use new format like 'propiedades->source->mode' ".to_string(), logger::ERROR);

		}else if (isset($propiedades->source->mode) && isset($propiedades->source->value)) {

			# New source format
			switch ($propiedades->source->mode) {
				case 'jer_tipo':
					$ar_tesauro_by_jer_tipo = RecordObj_jer::get_ar_tesauro_by_jer_tipo( (int)$propiedades->source->value );
					foreach ($ar_tesauro_by_jer_tipo as $tld) {
						$ar_referenced_tipo[] = strtolower($tld)."1";
					}
					break;
				case 'childrens_of':
					$ar_parents = (array)$propiedades->source->value;
					foreach ($ar_parents as $current_parent) {						
						$ar_childrens = RecordObj_ts::get_ar_childrens($current_parent, $order_by='norden');
						foreach ((array)$ar_childrens as $current_tipo) {
							$ar_referenced_tipo[] = $current_tipo;
						}
					}
					break;
				case 'tree':
					# Tipos to hide / exclude
					$ar_referenced_tipo = json_decode($propiedades->source->value);
					break;
				default:
					debug_log(__METHOD__." Invalid source->mode ".to_string($propiedades->source->mode), logger::ERROR);
			}

		}else{			
			debug_log(__METHOD__." Not defined source->mode (propiedades->source->mode)", logger::ERROR);
		}
		#dump($ar_referenced_tipo, ' ar_referenced_tipo ++ '.to_string());		
				
		return $this->ar_referenced_tipo = $ar_referenced_tipo;
	}//end get_ar_referenced_tipo



	/**
	* GET_SOURCE_MODE
	* @return string|null
	*/
	public function get_source_mode() {
		
		# COMPONENT PROPIEDADES VAR
		$propiedades = $this->get_propiedades();

		if ( isset($propiedades->jer_tipo) ) {			
			# TEMPORAL
			debug_log(__METHOD__." Deprecated source mode format. Please use new format like 'propiedades->source->mode' ".to_string(), logger::ERROR);
			return 'jer_tipo';
		}else if (isset($propiedades->source->mode)) {
			# New source format
			return $propiedades->source->mode;
		}else{
			debug_log(__METHOD__." Not defined source->mode (propiedades->source->mode)", logger::ERROR);
			return '';
		}
	}#end get_source_mode



	/**
	* GER_AR_LINK_FIELDS 
	*/
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
	}//END ger_ar_link_fields

	

	/**
	* FIRE_TREE_RESOLUTION
	*//*
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
	*/


	/*
	public static function is_root($tipo) {

		$tipo_id = intval(substr($tipo, 2));
			#dump($tipo_id);
		if($tipo_id===1) {
			return true;
		}else{
			return false;
		}	
	}
	*/

	
	/**
	* AUTOCOMPLETE_TS_SEARCH
	* Used by trigger on ajax call
	* @param array ar_referenced_tipo like ['es1','fr1'] (parent where start to search)
	* @param string_to_search
	* @return array ar_result 
	*	Array format: id_matrix=>dato_string 
	*/
	public static function autocomplete_ts_search($ar_referenced_tipo, $string_to_search, $max_results=30, $show_modelo_name=true, $source_mode) {
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

		#
		# ar_referenced_tipo iterate to generate sql
		switch ($source_mode) {
			case 'jer_tipo':
				$ar_prefijos = array();
				foreach ($ar_referenced_tipo as $current_tipo) {					
					$ar_prefijos[] = $current_tipo
					;
				}
				$arguments['parent:begins_or']	= $ar_prefijos;
				$prefix = substr( reset($ar_referenced_tipo), 0, 2 );
				break;
			case 'childrens_of':
				$ar_prefijos = array();
				foreach ($ar_referenced_tipo as $current_tipo) {
					$ar_prefijos[] = $current_tipo;
				}
				$arguments['parent:or'] = $ar_prefijos;
				$prefix = substr( reset($ar_referenced_tipo), 0, 2 );
				break;
			default:
				debug_log(__METHOD__." Invalid filter mode ".to_string($source_mode), logger::ERROR);
				break;
		}
			
		
		#$arguments['lang']				= DEDALO_DATA_LANG;
		$arguments['sql_limit']			= $max_results;
		$matrix_table					= RecordObj_descriptors::get_matrix_table_from_tipo($prefix);
		$RecordObj_descriptors			= new RecordObj_descriptors($matrix_table, NULL);
		$ar_records						= $RecordObj_descriptors->search($arguments);
			#dump($ar_records,'ar_records'." string_to_search:$string_to_search - sql_limit:$max_results - ".print_r($arguments,true) ) ;
			#dump($arguments, ' arguments ++ '.to_string());	


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


			$label = $termino;

			# Calculamos el modelo
			$modelo_name = NULL;
			if($show_modelo_name) {
				if( $modelo_name = RecordObj_ts::get_modelo_name_by_tipo($current_terminoID,true) ) {
					$label .= ' - '.$modelo_name;
				}
			}

			# Calculamos el parent
			$RecordObj_ts 	= new RecordObj_ts($current_terminoID);
			$current_parent = $RecordObj_ts->get_parent();
			if( $parent_name = RecordObj_ts::get_termino_by_tipo($current_parent) ) {
				$label .= ' ('.$parent_name.')';
			}

			$ar_result[$current_terminoID] = $label;
		}
		#dump($ar_result,'$ar_result');
	
		#if(SHOW_DEBUG) error_log( exec_time($start_time, __METHOD__, " string_to_search:$string_to_search ") );
		
		return (array)$ar_result;
	}//end autocomplete_ts_search

	

	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}#end build_search_comparison_operators



	/**
	* GET_SEARCH_QUERY (OVERWRITE COMPONENT COMMON)
	* Build search query for current component . Overwrite for different needs in other components 
	* (is static to enable direct call from section_records without construct component)
	* Params
	* @param string $json_field . JSON container column Like 'dato'
	* @param string $search_tipo . Component tipo Like 'dd421'
	* @param string $tipo_de_dato_search . Component dato container Like 'dato' or 'valor'
	* @param string $current_lang . Component dato lang container Like 'lg-spa' or 'lg-nolan'
	* @param string $search_value . Value received from search form request Like 'paco'
	* @param string $comparison_operator . SQL comparison operator Like 'ILIKE'
	*
	* @see class.section_records.php get_rows_data filter_by_search
	* @return string $search_query . POSTGRE SQL query (like 'datos#>'{components, oh21, dato, lg-nolan}' ILIKE '%paco%' )
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {		
		
		$search_value = json_decode($search_value);
			if ( !$search_value || empty($search_value) ) {
				return false;
			}

		$search_query='';
		# Fixed
		$tipo_de_dato_search='dato_search';
		switch (true) {
			case $comparison_operator=='=':
				foreach ((array)$search_value as $current_value) {
					$current_value = json_encode($current_value);
					$search_query .= " $json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$current_value]'::jsonb OR \n";
				}
				$search_query = substr($search_query, 0,-5);
				break;
			case $comparison_operator=='!=':
				foreach ((array)$search_value as $current_value) {
					$current_value = json_encode($current_value);
					$search_query = " ($json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$current_value]'::jsonb)=FALSE OR \n";
				}
				$search_query = substr($search_query, 0,-5);
				break;
		}
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}
		return $search_query;
	}//end get_search_query



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
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id) {
		
		if ($modo=='portal_list') {
			$component	= component_common::get_instance(__CLASS__,
														 $tipo,
														 $parent,
														 $modo,
														 $lang,
														 $section_tipo);
			$value 		= $component->get_html();
		}

		return $value;
	}#end render_list_value



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	* @see class.section.php
	* @return string $html
	*//*
	public function get_valor_list_html_to_save() {

		# Return direct value for store in 'valor_list'. NOT read html file list
		$html 	= $this->get_valor($lang,'string');
		
		return (string)$html;
	}//end get_valor_list_html_to_save
	*/



}
?>