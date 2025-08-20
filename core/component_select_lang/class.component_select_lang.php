<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SELECT_LANG
*
*/
class component_select_lang extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	// public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @param string|null $lang = DEDALO_DATA_LANG
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG) : ?string {

		$dato = $this->get_dato();

		// empty case
			if (empty($dato)) {
				return null;
			}

		// Test dato format (b4 changed to object)
			if(SHOW_DEBUG) {
				foreach ($dato as $current_locator) {
					if (!is_object($current_locator)) {
						if(SHOW_DEBUG) {
							dump($dato," dato");
						}
						trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($current_locator) .' : '. print_r($current_locator,true) );
						return to_string($current_locator);
					}
				}
			}

		// Always run ar_all_project_select_langs
		// $ar_all_project_select_langs = $this->get_ar_all_project_select_langs( $lang );
		$ar_all_project_select_langs = common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);
		foreach ((array)$ar_all_project_select_langs as $lang_code => $lang_name ) {

			$locator = lang::get_lang_locator_from_code( $lang_code );
			if (locator::in_array_locator($locator, $dato, ['section_id','section_tipo'])) {
				$valor = $lang_name;
				break;
			}
		}


		return $valor ?? null;
	}//end get_valor



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	*
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		// Important: Pass lang as parameter to indicate in the resolution
		// of the get_ar_list_of_values the desired language.
		$valor = $this->get_valor( $lang );

		$diffusion_value = !empty($valor)
			? preg_replace("/<\/?mark>/", '', $valor) # Remove untranslated string tags
			: null;

		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_VALUE_CODE
	* Returns the value lang code like 'lg-cat'
	* Used in diffusion to get the av file lang for example
	* @return string|null $code
	*/
	public function get_value_code() : ?string {

		$dato = $this->get_dato();

		// empty case
			if (empty($dato)) {
				return null;
			}

		// lang class manage resolution
			$locator	= reset($dato);
			$code		= lang::get_code_from_locator($locator);


		return $code;
	}//end get_value_code



	/**
	* GET_RELATED_COMPONENT_TEXT_AREA
	* @return string|null $tipo
	*/
	public function get_related_component_text_area() : ?string {

		$tipo = null;

		$related_terms = common::get_ar_related_by_model('component_text_area', $this->tipo);

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

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;


		$update_version = implode(".", $update_version);
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
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{
					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
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
	* GET_SORTABLE
	* @return bool
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		$path = [
			// self component path
			(object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> ontology_node::get_modelo_name_by_tipo($component_tipo,true),
				'name'				=> ontology_node::get_termino_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			],
			// thesaurus langs (component_input_text hierarchy25, section_tipo lg-1)
			(object)[
				'component_tipo'	=> DEDALO_THESAURUS_TERM_TIPO,
				'model'				=> ontology_node::get_modelo_name_by_tipo(DEDALO_THESAURUS_TERM_TIPO,true),
				'name'				=> ontology_node::get_termino_by_tipo(DEDALO_THESAURUS_TERM_TIPO),
				'section_tipo'		=> DEDALO_LANGS_SECTION_TIPO
			]
		];

		return $path;
	}//end get_order_path



	/**
	* GET_AR_LIST_OF_VALUES
	* @param string|null $lang = DEDALO_DATA_LANG
	* @param bool $include_negative = false
	* @return object $response
	*/
	public function get_ar_list_of_values(?string $lang=DEDALO_DATA_LANG, bool $include_negative=false) : object {

		// datalist
			$ar_all_project_select_langs = DEDALO_PROJECTS_DEFAULT_LANGS;
			$datalist = [];
			foreach ((array)$ar_all_project_select_langs as $item) {

				$label		= lang::get_name_from_code($item);
				$code		= $item;
				$list_value	= lang::get_lang_locator_from_code($item);

				$item_value = new stdClass();
					$item_value->value		= $list_value;
					$item_value->label		= $label;
					$item_value->section_id	= $code;

				$datalist[] = $item_value;
			}

		// sort the list for easy access
			usort($datalist, function($a, $b) {
				$a_label = isset($a) && isset($a->label)
					? $a->label
					: '';
				$b_label = isset($b) && isset($b->label)
					? $b->label
					: '';
				return strcmp($a_label, $b_label);
			});

		// response OK
			$response = new stdClass();
				$response->result	= $datalist;
				$response->msg		= 'OK';


		return $response;
	}//end get_ar_list_of_values



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to dato. Override in other cases.
	* Note that empty array or string are returned as null
	* @return array|null $list_value
	*/
	public function get_list_value() : ?array {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$list_value = [];
		$ar_list_of_values = $this->get_ar_list_of_values(DEDALO_DATA_LANG);
		foreach ($ar_list_of_values->result as $item) {

			$locator = $item->value;
			if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
				$list_value[] = $item->label;
			}
		}

		// check value is contained into list of values. If not, add as missing lang
			if (!empty($dato) && empty($list_value) && !empty($ar_list_of_values->result)) {

				$missing_lang = component_select_lang::get_missing_lang(
					$dato[0], // object locator
					$ar_list_of_values->result // array list_of_values
				);
				if (!empty($missing_lang)) {
					// resolve
					$list_value[] = $missing_lang->label;
				}
			}

		return $list_value;
	}//end get_list_value



	/**
	* GET_MISSING_LANG
	* @param object $locator
	* 	Data locator
	* @param array $list_of_values
	*  Array of values in ara_list_of_values result format
	* @return object $missing_lang
	*/
	public static function get_missing_lang(object $locator, array $list_of_values) : ?object {

		$missing_lang = null;

		// check value is contained into list of values
			$contained	= false;
			foreach ($list_of_values as $item) {
				if ($item->value->section_tipo===$locator->section_tipo &&
					$item->value->section_id==$locator->section_id) {
					$contained = true;
					break;
				}
			}
			if ($contained===false) {
				// resolve lang
				$code	= lang::get_code_from_locator($locator); // as 'lg-fra'
				$name	= lang::get_lang_name_by_locator($locator); // as 'France'

				$missing_lang = (object)[
					'value'			=> (object)[
						'section_tipo'	=> $locator->section_tipo,
						'section_id'	=> $locator->section_id
					],
					'label'			=> $name . ' *',
					'section_id'	=> $code
				];
			}

		return $missing_lang;
	}//end get_missing_lang



}//end class component_select_lang
