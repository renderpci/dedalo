<?php declare(strict_types=1);
/*
* CLASS COMPONENT_CHECK_BOX
*
*
*/
class component_check_box extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;


	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];



	/**
	* GET_DATALIST
	* Get datalist for check_box component.
	* Add tool name and always_active value to the datalist when tipo is 'dd1353'
	* @param ?string $lang = DEDALO_DATA_LANG
	* @return array $datalist
	* 	Array of objects
	*/
	public function get_datalist( ?string $lang=DEDALO_DATA_LANG ) : array {

		// Execute get_ar_list_of_values
		$ar_list_of_values_response = component_common::get_ar_list_of_values($lang, false);		

		// Add tool information when the component is component_security_tools (dd1353)
		// the component_security_tools is built as component_check_box and rendered as 'view_tools'
		// this information is required to get specific tool information
		if($this->tipo===DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO) {

			$component_tool_simple_object_tipo = tools_register::$simple_tool_obj_component_tipo; // 'dd1353'
			$model_name = ontology_node::get_model_by_tipo($component_tool_simple_object_tipo, true);

			$datalist = [];
			$list = $ar_list_of_values_response->result ?? [];
			foreach ($list as $key => $item) {

				// create the component of tool_simple_object_tipo and get his data				
				$component_tool_name = component_common::get_instance(
					$model_name, // string model
					$component_tool_simple_object_tipo, // string tipo
					$item->value->section_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					$item->value->section_tipo // string section_tipo
				);
				$data = $component_tool_name->get_data();

				// add to the datalist the tool name and always_active value from the tool_simple_object
				$item->tool_name		= $data[0]->value->name ?? '';
				$item->always_active	= $data[0]->value->always_active ?? false;

				$datalist[] = $item;
			}			
		
		}else{
			
			$datalist = $ar_list_of_values_response->result;
		}		


		return $datalist;
	}//end get_datalist



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG, $format='string') : string|null|array {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		// Test dato format (b4 changed to object)
			foreach ($dato as $key => $locator) {
				if (!is_object($locator)) {
					if(SHOW_DEBUG) {
						dump($dato," dato");
					}
					trigger_error(__METHOD__." Wrong dato format. OLD format dato in label:$this->label tipo:$this->tipo section_id:$this->section_id.Expected object locator, but received: ".gettype($locator) .' : '. print_r($locator,true) );
					return null;
				}
			}

		if (empty($lang)) {
			$lang = DEDALO_DATA_LANG;
		}

		$ar_list_of_values = $this->get_ar_list_of_values($lang); # Importante: Buscamos el valor en el idioma actual
		$ar_values = [];
		foreach ($ar_list_of_values->result as $key => $item) {

			$locator = $item->value;

			if ( true===locator::in_array_locator($locator, $dato, array('section_id','section_tipo')) ) {
				$ar_values[] = $item->label;
			}
		}

		# Set format
		$valor = ($format==='array')
			? $ar_values
			: implode(', ', $ar_values);


		return $valor;
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
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_value = $this->get_valor(
			$lang ?? DEDALO_DATA_LANG,
			'string'
		);
		$diffusion_value = !empty($diffusion_value)
			? strip_tags($diffusion_value)
			: ''; // do not use null here (compatibility v5 sites issues)


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



}//end class component_check_box
