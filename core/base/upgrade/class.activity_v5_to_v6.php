<?php
require_once( dirname(__FILE__) .'/class.v5_to_v6.php');
/**
* CLASS activity_v5_to_v6
*
*/
class activity_v5_to_v6 extends v5_to_v6 {



	public static $what_conversion_values = [
		"dd696"		=>	1,
		"dd697"		=>	2,
		"dd695"		=>	3,
		"dd698"		=>	4,
		"dd700"		=>	5,
		"dd694"		=>	6,
		"dd693"		=>	7,
		"dd699"		=>	8,
		"dd1090"	=>	9,
		"dd1080"	=>	10,
		"dd1094"	=>	11,
		"dd1095"	=>	12,
		"dd1092"	=>	13,
		"dd1091"	=>	14,
		"dd1098"	=>	15,
		"dd1081"	=>	16
	];



	/**
	* CONVERT_TABLE_DATA_ACTIVITY
	* @return bool true
	*/
	public static function convert_table_data_activity() {

		$ar_tables = [
			'matrix_activity'
		];
		$action = 'convert_section_dato_to_data';

		self::convert_table_data($ar_tables, $action);

		return true;
	}//end convert_table_data_activity



	/**
	* CONVERT_SECTION_DATO_TO_DATA
	* @return object $dato
	*/
	public static function convert_section_dato_to_data( stdClass $datos_column ) {

		$dato = clone $datos_column;

		$section_tipo = $dato->section_tipo;
		if($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO){

			// what dd545 (changed to select)
				$activity_what_dato = $dato->components->dd545->dato->{DEDALO_DATA_NOLAN} ?? null;
				if (!empty($activity_what_dato)) {
					if (isset(self::$what_conversion_values[$activity_what_dato])) {

						$new_section_id = self::$what_conversion_values[$activity_what_dato];

						// change areas dato
						$new_what_dato = new locator();
							$new_what_dato->set_section_tipo('dd42');
							$new_what_dato->set_section_id($new_section_id);
							$new_what_dato->set_from_component_tipo('dd545');
							$new_what_dato->set_type('dd151');

						$found = array_filter($dato->relations, function($item) use($new_what_dato){
							if (true===locator::compare_locators($item, $new_what_dato)) {
								return $item;
							}
						});
						if (empty($found)) {
							$dato->relations[] = $new_what_dato;
						}else{
							debug_log(__METHOD__." 'security_admin_dato' already exists in relations. Ignored (maybe is already updated) ", logger::ERROR);
						}

						unset($dato->components->dd545);

					}else{
						dump($activity_what_dato, ' activity_what_dato ++ '.to_string());
						debug_log(__METHOD__." ERROR ON GET activity_what_dato: '$activity_what_dato' in the array 'what_conversion_values' ++++++++++++++++++++++ ".to_string(), logger::ERROR);
						// throw new Exception("Error Processing Request", 1);
					}
				}


			// where dd546 (changed to input_text) data change format from string to array
				$activity_where_dato = $dato->components->dd546->dato->{DEDALO_DATA_NOLAN} ?? "";
				if (!is_array($activity_where_dato)) {
					$dato->components->dd546->dato->{DEDALO_DATA_NOLAN} = [$activity_where_dato]; // same dato but as array
				}


			// ip dd544 (data change format from string to array)
				$activity_ip_dato = $dato->components->dd544->dato->{DEDALO_DATA_NOLAN} ?? "";
				if (!is_array($activity_ip_dato)) {
					$dato->components->dd544->dato->{DEDALO_DATA_NOLAN} = [$activity_ip_dato]; // same dato but as array
				}


			// date dd547 (converts timestamp to dd_date)
				$date_dato = $dato->components->dd547->dato->{DEDALO_DATA_NOLAN} ?? null;
				if (!empty($activity_what_dato) && is_string($date_dato)) {
					$dd_date    = new dd_date();
					$new_dd_date 	= (object)$dd_date->get_date_from_timestamp( $date_dato );

					$new_date = component_date::add_time($new_dd_date);

					$conversion = new stdClass();
						$conversion->start = $new_date;

					$new_dato = [$conversion];

					$dato->components->dd547->dato->{DEDALO_DATA_NOLAN} = $new_dato;
				}


			// json dd551
				$activity_ip_dato = $dato->components->dd551->dato->{DEDALO_DATA_NOLAN} ?? "";
				if (!is_array($activity_ip_dato)) {
					$dato->components->dd551->dato->{DEDALO_DATA_NOLAN} = [$activity_ip_dato]; // same dato but as array
				}
		}


		return $dato;
	}//end convert_section_dato_to_data



}//end class
