<?php
/*
* CLASS SECTION_PREPROCESS
*/


abstract class section_preprocess {


	/**
	* GET_MATRIX_SECTION_DATA
	* Recoge los datos originales de los componentes (matrix) 
	*/
	public static function get_matrix_section_data($section_tipo, $ar_diffusion_map, $fecha_de_los_datos) {

		if(SHOW_DEBUG) {
			$start_time = start_time();
			#ob_implicit_flush(true);
		}
		
		#dump($ar_diffusion_map ,'$ar_diffusion_map ');

		# AR_DIFFUSION_MAP :  Iterate
		foreach ($ar_diffusion_map as  $key => $current_tipo) {

				$related_component_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, $modelo_name='component_', $relation_type='termino_relacionado')[0];
					#dump($related_component_tipo,'$related_component_tipo '.$current_tipo);
				
				$RecordObj_ts = new RecordObj_ts($current_tipo);
				$propiedades  = $RecordObj_ts->get_propiedades();
				$ar_stats_map[$current_tipo] = array(
					'tipo'=>$related_component_tipo,
					'propiedades'=>$propiedades
					);						
		}		
		#dump($ar_stats_map,'$ar_stats_map');

		# TARGET_SECTION_TIPO : Real target section tipo (like dd12)
		$target_section_tipo = RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($section_tipo, $modelo_name='section', $relation_type='termino_relacionado')[0];
		

		# SECTION : DIRECT SEARCH
		$arguments=array();
		$arguments['tipo']				= $target_section_tipo;
		$arguments['parent']			= 0;
		
		# DEDALO_ACTIVITY_SECTION_TIPO : Filter only one day (prev day)
		if($target_section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
			$arguments['dato:%like%'] = $fecha_de_los_datos;
		}

		$matrix_table 					= common::get_matrix_table_from_tipo($target_section_tipo);
		$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
		$ar_records						= $RecordObj_matrix->search($arguments);
			#if(SHOW_DEBUG) dump($ar_records,"ar_records - matrix_table:$matrix_table",array('arguments'=>print_r($arguments,true), 'start_time'=>exec_time($start_time)) ); #die();

		$object  = new stdClass();
		$ar_dato = array();
		foreach ($ar_records as $current_section_id) {
			
			#$current_section = new section($current_section_id, $target_section_tipo);
				#dump($current_section,'$current_section');
			
			foreach ($ar_stats_map as $key => $ar_value) {
				
				$component_tipo 		= $ar_value['tipo'];
				$component_modelo_name 	= RecordObj_ts::get_modelo_name_by_tipo($component_tipo);
				$current_component 		= new $component_modelo_name(NULL, $component_tipo, 'stats', $current_section_id);

				#echo "current_section_id $current_section_id - component_modelo_name:$component_modelo_name ".print_r($ar_value,true). exec_time($start_time);

				# PROPIEDAES
				$propiedades = null;
				if(!empty($ar_value['propiedades'])) {
					$propiedades = json_decode($ar_value['propiedades']);
						#dump($propiedades->portal_list[0],'$propiedades');
					if( !empty($propiedades->portal_list) && !empty($propiedades->portal_list[0]) ) {
						$component_tipo = $propiedades->portal_list[0];
					}
				}
				

				# CURRENT_DATO WITH PROPIEDADES				
				$current_dato = $current_component->get_stats_obj( $propiedades );

				
				# FINAL ARRAY STORED
				$ar_dato[$current_section_id][$component_tipo] = $current_dato;

				#
				# $object dummy
				#if( $component_tipo=='dd867' ) {
				#	$component_test = new $component_modelo_name('dummy',$component_tipo);
				#	$component_test->set_dato($current_dato[0]);
				#	$valor = $component_test->get_valor();
				#		#dump($valor,'$component_test ' . $current_dato[0] . " $component_modelo_name");
				#}
				#
/**/
			}#end foreach ($ar_stats_map as $key => $ar_value)						
			

		}#end foreach ($ar_records as $current_section_id)
		
		if(SHOW_DEBUG) {
			dump($ar_dato,'$ar_dato',array('start_time'=>exec_time($start_time),'fecha_de_los_datos'=>$fecha_de_los_datos)); #die();
		}

		return $ar_dato;
	}



}#end class section_preprocess
?>