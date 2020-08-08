<?php
/*
* CLASS COMPONENT_SELECT_LANG
*
*
*/
class component_select_lang extends component_relation_common {
	

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	#public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Build the componente normally
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible==='si') {
				#throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
				trigger_error("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP");
			}
		}
	}//end __construct

	

	/*
	# GET DATO : Format "lg-spa"
	public function get_dato() {
		$dato = parent::get_dato();
		#if (is_string($dato)) {
		#	$dato = (array)$dato;
		#}
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	*/



	/**
	* GET DATO DESACTIVE 24-02-2018
	* @return array $dato
	*	$dato is always an array of locators
	*/
	/*
	public function get_dato() {
		$dato = parent::get_dato();

		if (!empty($dato) && !is_array($dato)) {
			debug_log(__METHOD__." Dato type is wrong. Array expected. ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent, section_tipo:$this->section_tipo. dato will be converted to array of locator. Dato received: ".to_string($dato), logger::ERROR);
			$dato = array( locator::lang_to_locator($dato) );
		}
		if ($dato==null) {
			$dato=array();
		}

		return (array)$dato;
	}//end get_dato
	*/


	/**
	* SET_DATO DESACTIVE 24-02-2018
	* @param array|string $dato
	*	When dato is string is because is a json encoded dato
	*/
	/*
	public function set_dato($dato) {
		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if (is_object($dato)) {
			$dato = array($dato);
		}
		# Ensures is a real non-associative array (avoid json encode as object)
		$dato = is_array($dato) ? array_values($dato) : (array)$dato;

		parent::set_dato( (array)$dato );		
	}//end set_dato
	*/


	/*
	# GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	public function get_valor() {

		$dato 	 = $this->get_dato();

		#if(empty($dato)) return null;

		if (strlen($dato)>2) {
			return RecordObj_ts::get_termino_by_tipo($dato,DEDALO_APPLICATION_LANG,true);
		}
		return $dato;					
	}
	*/



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {

		if (isset($this->valor)) {
			if(SHOW_DEBUG) {
				//error_log("Catched valor !!! from ".__METHOD__);
			}
			return $this->valor;
		}

		$valor  = null;		
		$dato   = $this->get_dato();
		if (!empty($dato)) {
			
			# Test dato format (b4 changed to object)
			if(SHOW_DEBUG) {
				foreach ($dato as $key => $current_locator) {
					if (!is_object($current_locator)) {
						if(SHOW_DEBUG) {
							dump($dato," dato");
						}
						trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($current_locator) .' : '. print_r($current_locator,true) );
						return $valor;
					}
				}
			}		

			# Always run ar_all_project_select_langs
			# $ar_all_project_select_langs = $this->get_ar_all_project_select_langs( $lang );
			$ar_all_project_select_langs = common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);
			foreach ((array)$ar_all_project_select_langs as $lang_code => $lang_name ) {
				
				$locator = lang::get_lang_locator_from_code( $lang_code );
				if (locator::in_array_locator( $locator, (array)$dato, $ar_properties=array('section_id','section_tipo') )) {
					$valor = $lang_name;
					break;
				}
			}
		}//end if (!empty($dato))

		# Set component valor
		$this->valor = $valor;

		return $valor;
	}//end get_valor



	/**
	* GET_AR_ALL_PROJECT_SELECT_LANGS
	* @param string $lang
	*	default is DEDALO_APPLICATION_LANG
	* @return array $ar_projects
	*	format array( lang_locator => label )
	*//*
	public function get_ar_all_project_select_langs( $lang=DEDALO_APPLICATION_LANG ) {
		
		$section_id  			= $this->get_parent();
		$section_tipo		 	= $this->get_section_tipo();
		$section 				= section::get_instance($section_id, $section_tipo);
		$ar_all_project_langs 	= $section->get_ar_all_project_langs();
			#dump($ar_all_project_langs," ar_all_project_langs ".DEDALO_APPLICATION_LANG);

		return (array)$ar_all_project_langs;
	}//end get_ar_all_project_select_langs
	*/
	


	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}//end build_search_comparison_operators



	/**
	* GET_SEARCH_QUERY
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
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search=null, $current_lang=null, $search_value='', $comparison_operator='=') {
		$search_query='';
		if ( empty($search_value) ) {
			return $search_query;
		}
		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search
		
		switch (true) {
			case $comparison_operator=='=':
				$search_query = " $json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb ";
				break;
			case $comparison_operator=='!=':
				$search_query = " ($json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb)=FALSE ";
				break;
		}
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}
		return $search_query;
	}//end get_search_query



	/**
	* GET_RELATED_COMPONENT_TEXT_AREA
	* @return string $tipo | null
	*/
	public function get_related_component_text_area() {

		$tipo = null;
		$related_terms = common::get_ar_related_by_model('component_text_area', $this->tipo);
			#dump($related_terms, ' related_terms ++ '.to_string());

		switch (true) {
			case count($related_terms)==1 :
				$tipo = reset($related_terms);
				break;
			case count($related_terms)>1 :
				debug_log(__METHOD__." More than one related component_text_area are found. Please fix this ASAP ".to_string(), logger::ERROR);
				break;
			default:
				break;
		}

		return $tipo;		
	}//end get_related_component_text_area



	/**
	* UPDATE_DATO_VERSION
	* @param string $update_version
	* 	like '4.0.11'
	* @param string | array $dato_unchanged
	* @return object $response
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
		#dump($dato_unchanged, ' dato_unchanged ++ -- '.to_string($update_version)); #die();

		switch ($update_version) {

			case '4.0.12':
				$new_dato = $dato_unchanged;
				$data_changed=false;
				if( empty($dato_unchanged) && !is_array($dato_unchanged) ) {

					$new_dato = array();	// Empty array default
					$data_changed=true;

				}else if(!empty($dato_unchanged) && !is_array($dato_unchanged)) {

					$new_dato = array();
					$current_locator = locator::lang_to_locator($dato_unchanged);
					debug_log(__METHOD__." dato_unchanged: $dato_unchanged - current_locator: ".to_string($current_locator), logger::DEBUG);				
					if (is_object($current_locator)) {
						# add_object_to_dato is safe for duplicates and object types
						$new_dato = component_common::add_object_to_dato( $current_locator, $new_dato );
						$data_changed=true;
					}else{
						# Something is wrong
						dump($dato_unchanged, ' dato_unchanged ++ [Error en convert lang to locator] '.to_string());
						debug_log(__METHOD__." Error en convert lang to locator . lang dato_unchanged: ".to_string($dato_unchanged), logger::DEBUG);
					}					
				}
					
				# Compatibility old dedalo instalations
				if ($data_changed) {
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
				
		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
													 $parent,
													 'list',
													 DEDALO_DATA_NOLAN,
													 $section_tipo);

		
		# Use already query calculated values for speed
		#$ar_records   = (array)json_handler::decode($value);
		#$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id); // Set unic id for build search_options_session_key used in sessions
		
		return  $component->get_valor($lang);	
	}//end render_list_value



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffsuion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {
		
		$valor = $this->get_valor( $lang ); # Importante!: Pasar lang como parámetro para indicar en la resolución del get_ar_list_of_values el lenguaje deseado
		$valor = preg_replace("/<\/?mark>/", "", $valor); # Remove untranslated string tags
		$diffusion_value = $valor;


		return (string)$diffusion_value;
	}//end get_diffusion_value
	

}
?>