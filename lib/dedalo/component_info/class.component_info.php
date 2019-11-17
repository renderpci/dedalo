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
	* @return string $valor
	*/
	public function get_valor( $widget_lang=DEDALO_DATA_LANG ) {

		$this->widget_lang = $widget_lang;

		$valor = $this->get_html();
		$valor = strip_tags($valor);

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
		
		$html = $component_info->get_html();

		return $html;
	}//end render_list_value



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		#if (empty($valor)) {

			#$this->set_modo('export');			

			$this->widget_lang = $lang;
			$this->widget_mode = 'export';
			
			$valor = $this->get_html();
			#$valor = strip_tags($valor);
		#}

		return to_string($valor);
	}//end get_valor_export



	
}//end component_info
?>