<?php
require_once( dirname(__FILE__) .'/class.v5_to_v6.php');
/**
* CLASS DATA_V5_TO_V6
*
*/
class data_v5_to_v6 extends v5_to_v6 {



	/**
	* CLEAN_SECTION_AND_COMPONENT_DATO
	* Remove unused section data:
	* 	- components: valor, valor_list, empty dataframe
	* 	- section:
	* 		"section_creator_top_tipo"				: "mdcat597",
	*		"section_creator_portal_tipo"			: "",
	*		"section_creator_portal_section_tipo"	: "
	* @return array $ar_tables
	*/
	public static function clean_section_and_component_dato() {

		$ar_tables = [
			// 'new_matrix'
			'matrix',
			'matrix_activities',
			'matrix_dataframe',
			'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			'matrix_indexations',
			'matrix_langs',
			'matrix_layout',
			'matrix_layout_dd',
			'matrix_list',
			'matrix_notes',
			'matrix_profiles',
			'matrix_projects',
			'matrix_structurations',
			'matrix_tools',
			'matrix_users'
		];
		$action = 'parse_properties';

		self::convert_table_data($ar_tables, $action);

		return $ar_tables;
	}//end clean_section_and_component_dato



	/**
	* PARSE_PROPERTIES
	* Check section and component specific properties to remove/update and create a new object 'dato'
	* ready to replace the old one
	* @return object $datos_column
	* @return object $dato
	*/
	public static function parse_properties( stdClass $datos_column ) {

		$dato = clone $datos_column;

		// clean component dato
			if (!empty($dato->components)) {

				foreach ($dato->components as $tipo => $component_data) {

					$new_component_data = new stdClass();
					foreach ($component_data as $key => $value) {
						if ($key==='dato' || $key==='info' || ($key==='dataframe' && !empty($value)) ) {

							if ($key==='info') {
								// changes 'info' by 'inf' for readability
								$new_component_data->inf = $value->label . ' [' . $value->modelo .']';
							}else{
								$new_component_data->{$key} = $value;
							}
						}
					}
					$dato->components->{$tipo} = $new_component_data;
				}
			}

		// clean section dato (rebuild the section object but excluded properties)
			$to_remove_properties = [
				'section_creator_top_tipo',
				'section_creator_portal_tipo',
				'section_creator_portal_section_tipo'
			];
			$new_dato = new StdClass();
			foreach ($dato as $key => $value) {
				if (!in_array($key, $to_remove_properties)) {
					$new_dato->{$key} = $value;
				}
			}



		return $new_dato;
	}//end parse_properties



}//end class data_v5_to_v6