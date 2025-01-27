<?php
require_once dirname(__FILE__) .'/class.v5_to_v6.php';
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
	public static function convert_table_data_activity() : bool {

		$ar_tables = [
			'matrix_activity'
		];
		$action = 'activity_v5_to_v6::convert_section_dato_to_data';

		self::convert_table_data($ar_tables, $action);

		return true;
	}//end convert_table_data_activity



	/**
	* CONVERT_SECTION_DATO_TO_DATA
	* @return object $dato
	*/
	public static function convert_section_dato_to_data( stdClass $datos_column ) : object {

		$dato = clone $datos_column;

		if (!isset($dato->components)) {
			return $dato;
		}

		$section_tipo = $dato->section_tipo;
		if($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {

			// what dd545 (changed to select)
				$dato->components->dd545 = $dato->components->dd545 ?? (object)['dato' => new StdClass()];
				$activity_what_dato = $dato->components->dd545->dato->{DEDALO_DATA_NOLAN} ?? null;
				if (!empty($activity_what_dato)) {

					if(is_array($activity_what_dato)){
						$actv_current_section_id = $activity_what_dato[0]->section_id ?? null;
						$activity_what_dato = !empty($actv_current_section_id)
							? 'dd' . $actv_current_section_id
							: 'invalid';
					}

					if (isset(self::$what_conversion_values[$activity_what_dato])) {

						$new_section_id = self::$what_conversion_values[$activity_what_dato];

						// change areas dato
						$new_what_dato = new locator();
							$new_what_dato->set_section_tipo('dd42');
							$new_what_dato->set_section_id($new_section_id);
							$new_what_dato->set_from_component_tipo('dd545');
							$new_what_dato->set_type('dd151');

						$dato_relations = $dato->relations ?? [];
						$found = array_filter($dato_relations, function($item) use($new_what_dato){
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
				$dato->components->dd546 = $dato->components->dd546 ?? (object)['dato' => new StdClass()];
				$activity_where_dato = $dato->components->dd546->dato->{DEDALO_DATA_NOLAN} ?? "";
				if (!is_array($activity_where_dato)) {
					$dato->components->dd546->dato->{DEDALO_DATA_NOLAN} = [$activity_where_dato]; // same dato but as array
				}


			// ip dd544 (data change format from string to array)
				$dato->components->dd544 = $dato->components->dd544 ?? (object)['dato' => new StdClass()];
				$activity_ip_dato = $dato->components->dd544->dato->{DEDALO_DATA_NOLAN} ?? "";
				if (!is_array($activity_ip_dato)) {
					$dato->components->dd544->dato->{DEDALO_DATA_NOLAN} = [$activity_ip_dato]; // same dato but as array
				}


			// date dd547 (converts timestamp to dd_date)
				$dato->components->dd547 = $dato->components->dd547 ?? (object)['dato' => new StdClass()];
				$date_dato = $dato->components->dd547->dato->{DEDALO_DATA_NOLAN} ?? null;
				// if (!empty($activity_what_dato) && is_string($date_dato)) {
				if ($date_dato!==null && is_string($date_dato)) {

					$new_dd_date = dd_date::get_dd_date_from_timestamp( $date_dato );

					$new_date = component_date::add_time($new_dd_date);

					$conversion = new stdClass();
						$conversion->start = $new_date;

					$new_dato = [$conversion];

					$dato->components->dd547->dato->{DEDALO_DATA_NOLAN} = $new_dato;
				}


			// json dd551
				$dato->components->dd551 = $dato->components->dd551 ?? (object)['dato' => new StdClass()];
				$activity_ip_dato = $dato->components->dd551->dato->{DEDALO_DATA_NOLAN} ?? "";
				if (!is_array($activity_ip_dato)) {
					$dato->components->dd551->dato->{DEDALO_DATA_NOLAN} = [$activity_ip_dato]; // same dato but as array
				}
				// Clean unused properties in 'Created section record' activity record (dd551)
					// changes
					// {
					//	"msg": "Created section record",
					//	"tipo": "dd1340",
					//	"table": "matrix_tools",
					//	"tm_id": "desactivo",
					//	"top_id": 2,
					//	"top_tipo": "dd1340",
					//	"is_portal": 0,
					//	"section_id": 2,
					//	"section_tipo": "dd1340"
					// }
					// to
					// {
					//	"msg": "Created section record",
					//	"section_id": 2,
					//	"section_tipo": "dd1340"
					//	"tipo": "dd1340",
					//	"table": "matrix_tools"
					// }
				if (	isset($dato->components->dd551->dato->{DEDALO_DATA_NOLAN}[0])
					&& 	isset($dato->components->dd551->dato->{DEDALO_DATA_NOLAN}[0]->msg)
					&& 	$dato->components->dd551->dato->{DEDALO_DATA_NOLAN}[0]->msg==='Created section record'
					) {

					$old_value = $dato->components->dd551->dato->{DEDALO_DATA_NOLAN}[0];
					$new_value = (object)[
						'msg'			=> $old_value->msg,
						'section_id'	=> $old_value->section_id,
						'section_tipo'	=> $old_value->section_tipo,
						'tipo'			=> $old_value->tipo,
						'table'			=> $old_value->table
					];
					// overwrite old value
					$dato->components->dd551->dato->{DEDALO_DATA_NOLAN}[0] = $new_value;
				}


			// date column


		}//end if($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO)


		return $dato;
	}//end convert_section_dato_to_data



}//end class
