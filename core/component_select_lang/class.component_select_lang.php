<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SELECT_LANG
*
*/
class component_select_lang extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;


	/**
	* GET_VALUE_CODE
	* Returns the value lang code like 'lg-cat'
	* Used in diffusion to get the av file lang for example
	* @return string|null $code
	*/
	public function get_value_code() : ?string {

		$data = $this->get_data();

		// empty case
		if (empty($data)) {
			return null;
		}

		// lang class manage resolution
		$locator = $data[0] ?? null;
		if (empty($locator)) {
			return null;
		}
		
		// code resolution
		$code = lang::get_code_from_locator($locator);


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
	* UPDATE_DATA_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->data_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id;


		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



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
				'model'				=> ontology_node::get_model_by_tipo($component_tipo,true),
				'name'				=> ontology_node::get_term_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			],
			// thesaurus langs (component_input_text hierarchy25, section_tipo lg-1)
			(object)[
				'component_tipo'	=> DEDALO_THESAURUS_TERM_TIPO,
				'model'				=> ontology_node::get_model_by_tipo(DEDALO_THESAURUS_TERM_TIPO,true),
				'name'				=> ontology_node::get_term_by_tipo(DEDALO_THESAURUS_TERM_TIPO),
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

		// datalist. Resolving multiple langs at once
			$langs_resolved = lang::resolve_multiple(DEDALO_PROJECTS_DEFAULT_LANGS);
			$datalist = array_map(function ($item) {				
				$locator = new locator();
				$locator->set_section_id($item->section_id);
				$locator->set_section_tipo(DEDALO_LANGS_SECTION_TIPO);	
				$item_value = new stdClass();
					$item_value->value		= $locator;
					$item_value->label		= $item->names[0] ?? $item->code;
					$item_value->section_id	= 'lg-'.$item->code;

				return $item_value;
			}, $langs_resolved);

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

		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		$list_value = [];
		$ar_list_of_values = $this->get_ar_list_of_values(DEDALO_DATA_LANG);
		foreach ($ar_list_of_values->result as $item) {

			$locator = $item->value;
			if ( true===locator::in_array_locator($locator, $data, array('section_id','section_tipo')) ) {
				$list_value[] = $item->label;
			}
		}

		// check value is contained into list of values. If not, add as missing lang
			if (!empty($data) && empty($list_value) && !empty($ar_list_of_values->result)) {

				$missing_lang = component_select_lang::get_missing_lang(
					$data[0], // object locator
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
