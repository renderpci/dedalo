<?php
/*
* CLASS COMPONENT_PUBLICATION
*
*
*/
class component_publication extends component_relation_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');


	/**
	* __CONSTRUCT
	*/
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);
	}//end __construct


	/*
	# GET DATO : 
	public function get_dato() {
		$dato = parent::get_dato();
		if (!empty($dato) && !is_array($dato)) {			
			debug_log(__METHOD__." Dato type is wrong. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent ".to_string(), logger::ERROR);
			$this->set_dato(array());
			$this->Save();
		}
		if ($dato===null) {
			$dato=array();
		}		
		return (array)$dato;
	}*/


	/*
	# SET_DATO
	public function set_dato($dato) {
		if (is_string($dato) && strpos($dato, '}')!==false ) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if (is_object($dato)) {
			$dato = array($dato);
		}
		parent::set_dato( (array)$dato );
	}
	*/

	
	/**
	* GET_VALOR
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG ) {
			
		$dato = $this->get_dato();

		# Test dato format (b4 changed to object)
		if(SHOW_DEBUG===true) {
			if (!empty($dato)) foreach ($dato as $key => $value) {
				if (!empty($value) && !is_object($value)) {
					if(SHOW_DEBUG===true) {
						dump($dato," +++ dato Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($value));							
					}
					debug_log(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($value) .' : '. print_r($value,true), logger::ERROR);
					return null;
				}
			}
		}

		switch ($this->modo) {

			case 'diffusion':

				$valor = 'no';
				if (!empty($dato)) {				
					
					$object_si = new stdClass();
						$object_si->section_id   = (string)NUMERICAL_MATRIX_VALUE_YES;
						$object_si->section_tipo = (string)"dd64";

					$component_locator = reset($dato);
					$compare_locators  = locator::compare_locators( $component_locator, $object_si, $ar_properties=['section_id','section_tipo']);
					
					if ($compare_locators===true) {
						$valor = 'si';
					}
				}
				break;
			
			default:

				$valor = null;
				if (!empty($dato)) {									

					# Always run list of values
					$ar_list_of_values	= $this->get_ar_list_of_values2($lang); # Importante: Buscamos el valor en el idioma actual				
					$component_locator  = reset($dato);
					foreach ($ar_list_of_values->result as $key => $item) {
						
						$locator = $item->value;
											
						if (true===locator::compare_locators( $component_locator, $locator, $ar_properties=['section_id','section_tipo'])) {						
							$valor = $item->label;
							break;
						}
					}
				}
				break;				
		}#end switch


		return $valor;
	}#end get_valor




	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang() {

		$relacionados = (array)$this->RecordObj_dd->get_relaciones();
		
		#dump($relacionados,'$relacionados');
		if(empty($relacionados)){
			return $this->lang;
		}

		$termonioID_related = array_values($relacionados[0])[0];
		$RecordObjt_dd = new RecordObj_dd($termonioID_related);

		if($RecordObjt_dd->get_traducible()==='no'){
			$lang = DEDALO_DATA_NOLAN;
		}else{
			$lang = DEDALO_DATA_LANG;
		}
		return $lang;
	}	



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
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {
		$search_query='';
		if ( empty($search_value) ) {
			return $search_query;
		}

		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search

		switch (true) {
			case $comparison_operator==='=':
				$search_query = " $json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb ";
				break;
			case $comparison_operator==='!=':
				$search_query = " ($json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb)=FALSE ";
				break;
		}
		
		if(SHOW_DEBUG===true) {
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
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {
		
		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
												 	 $parent,
												 	 $modo,
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);

		
		# Use already query calculated values for speed
		#$ar_records   = (array)json_handler::decode($value);
		#if (!empty($ar_records)) {
		#	$component->set_dato($ar_records);
		#}		
		$component->set_identificador_unico('2'.$component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions
	
		if ($modo==='list') {
			$result = $component->get_valor($lang);
		}else{
			$result = $component->get_html();
		}
		
		return  $result;		
	}#end render_list_value



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
		$result = $this->get_dato_unchanged();

		return $result;		
	}//end get_valor_list_html_to_save




}
?>