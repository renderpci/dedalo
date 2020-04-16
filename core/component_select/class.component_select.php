<?php
/*
* CLASS COMPONENT SELECT
*
*
*/
class component_select extends component_relation_common {

	protected $relation_type = DEDALO_RELATION_TYPE_LINK;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {

		$dato = $this->get_dato();

		// case user id root
			if (isset($dato[0])
				&& $dato[0]->section_tipo===DEDALO_SECTION_USERS_TIPO
				&& $dato[0]->section_id==='-1') {
				return 'root';
			}

		# Test dato format (b4 changed to object)
		foreach ($dato as $key => $current_value) {
			if (!is_object($current_value)) {
				if(SHOW_DEBUG) {
					dump($dato," actual invalid dato: ");
				}
				trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->section_tipo - $this->tipo - $this->parent .Expected object locator, but received: ".gettype($current_value) .' : '. print_r($current_value,true) );
				return null;
			}
		}

		$ar_list_of_values = $this->get_ar_list_of_values2($lang, true); # Importante: Buscamos el valor en el idioma actual
		$ar_values = [];
		foreach ($ar_list_of_values->result as $key => $item) {

			$locator = $item->value;

			if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
				$ar_values[] = $item->label;
			}
		}

		# Set value
		$valor = implode(', ', $ar_values);

		return $valor;
	}//end get_valor



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
	*//*
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
												 	 $parent,
												 	 $modo,
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);


		# Use already query calculated values for speed
		$ar_records = is_string($value) ? (array)json_handler::decode($value) : (array)$value;
		$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions
		if($modo==='list'){
			return $component->get_valor();
		}
		return  $component->get_html();
	}#end render_list_value */



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

		$diffusion_value = $this->get_valor($lang);
		$diffusion_value = strip_tags($diffusion_value);

		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_DATO
	* @return
	*/
	public function get_diffusion_dato() {

			$dato = $this->get_dato();
			if (is_array($dato)) {
				$ar_id =array();
				foreach ($dato as $current_locator) {
					$ar_id[] = $current_locator->section_id;
				}
				$final_dato = $ar_id;
			}
			$diffusion_value = json_encode($final_dato);

		return (string)$diffusion_value;
	}//end get_diffusion_dato


	/**
	* GET_CONTROLLER_DATA
	* @return controller_data
	*/
	public function get_controller_data(){

		//check properties->js for get the controllers
		if(!isset($this->propiedades->js)){
			return null;
		}

		//check if the component has dato, if not, do nothing
		$current_dato = $this->get_dato();
		if(!isset($current_dato[0])){
			return null;
		}
		// get the section_id & section_tipo of the main controller selection of the user
		$section_id 	= $current_dato[0]->section_id;
		$section_tipo 	= $current_dato[0]->section_tipo;
		$modo 			= 'list';

		$ar_js = $this->propiedades->js;

		//build the controller_data
		$controller_data = [];
		$ar_controller_tipos = [];
		foreach ($ar_js as $trigger) {

			//get the current controller_tipo
			$controller_tipo 	= $trigger->controller;
			if (in_array($controller_tipo, $ar_controller_tipos)){
				continue;
			}
			//get the modelo_name
			$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($controller_tipo,true);
			//get the translation mode of the component
			$RecordObj_dd 		= new RecordObj_dd($controller_tipo);
			$lang 				= ($RecordObj_dd->get_traducible()!=='si') ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
			// build the component of the controller
			$component = component_common::get_instance($modelo_name,
												 $controller_tipo,
											 	 $section_id,
											 	 $modo,
												 $lang,
											 	 $section_tipo);
			//build the object that has the controler_tipo and the controller dato
			$controller_dato = new stdClass();
			$controller_dato->tipo = $controller_tipo;
			$controller_dato->dato = $component->get_dato();
			//assign the controller dato to the controller data array with all controller of the current section.
			$controller_data[] = $controller_dato;
			$ar_controller_tipos[] =$controller_tipo;
		}

		return $controller_data;
	}//end get_controller_data


}//end class
