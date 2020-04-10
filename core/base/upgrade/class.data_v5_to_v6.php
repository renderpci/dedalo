<?php
require_once( dirname(__FILE__) .'/class.v5_to_v6.php');
/**
* CLASS data_v5_to_v6
*
*/
class data_v5_to_v6 extends v5_to_v6 {



	/**
	* CLEAN_COMPONENT_DATO
	* @return array $ar_tables
	*/
	public static function clean_component_dato() {

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
		$action = 'remove_valor'

		self::convert_table_data($ar_tables, $action);

		return $ar_tables;
	}//end clean_component_dato



	/**
	* REMOVE_VALOR
	* @return object $datos_column
	* @retur object $dato
	*/
	public static function remove_valor( stdClass $datos_column ) {

		$dato = clone $datos_column;

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


		return $dato;
	}//end remove_valor



}//end class
