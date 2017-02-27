<?php
/*
* CLASS COMPONENT_INFO
*
*
*/
class component_info extends component_common {
	
	

	/**
	* GET_DATO
	* @return 
	*/
	public function get_dato() {
		return null;
	}//end get_dato

	/**
	* GET_VALOR
	* @return 
	*/
	public function get_valor() {
		return null;
	}//end get_valor


	/**
	* GET_AR_TOOLS_OBJ
	*/
	public function get_ar_tools_obj() {
		
		# Remove all tools 
		#unset($this->ar_tools_name);
		$this->ar_tools_name = array();
	
		return parent::get_ar_tools_obj();
	}//end get_ar_tools_obj



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
		
		$component_info  = component_common::get_instance(__CLASS__,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);
		/* NO SPEED INCREMENT IS APPRECIATED
			foreach ($component_info->propiedades as $key => $prop_value) {
				if(isset($prop_value->data_source_list) && in_array($prop_value->data_source_list, $ar_columnas_tipo)) {
					#dump($rows[$prop_value->data_source_list], ' $ar_columnas_tipo ++ '.to_string());
					$component_info->propiedades[$key]->ar_locators = json_decode($rows[$prop_value->data_source_list]);
						#dump($component_info->propiedades[$key], '$component_info->get_propiedades()[$key] ++ '.to_string());
					break;
				}
			}
			*/
		
		return $component_info->get_html();
	}//end render_list_value



	
}//end component_info
?>