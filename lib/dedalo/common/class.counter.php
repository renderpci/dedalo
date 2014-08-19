<?php
require_once(DEDALO_LIB_BASE_PATH . '/common/class.Accessors.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');



abstract class counter extends Accessors {


		# GET_COUNTER_VALUE : COUNTER (STORED IN MATRIX_COUNTER TABLE)
		public static function get_counter_value($tipo, $matrix_table='matrix_counter') {
			
			$RecordObj_matrix_counter 	= new RecordObj_matrix($matrix_table, NULL, intval(0), $tipo, DEDALO_DATA_NOLAN);	#$id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL

			# RECORDOBJ_MATRIX : IMPORTANT ! Set use cache to false
			$RecordObj_matrix_counter->use_cache = false;
			
			$counter_id 	= $RecordObj_matrix_counter->get_ID();	# force calculate id from parent-tipo-lang
			$counter_dato 	= $RecordObj_matrix_counter->get_dato();# force load data
			
			if(!empty($counter_dato)) {		
				$counter_number = intval($counter_dato);
			}else{
				$counter_number = intval(0);
			}
			#dump($RecordObj_matrix_counter,$counter_dato);
			#error_log("get_counter_value tipo:$tipo - matrix_table:$matrix_table - counter_number:$counter_number");

			return $counter_number;
		}

		# UPDATE_COUNTER
		public static function update_counter($tipo, $matrix_table='matrix_counter') {
			
			$current_value = counter::get_counter_value($tipo, $matrix_table);

			$RecordObj_matrix_counter = new RecordObj_matrix($matrix_table, NULL, intval(0), $tipo, DEDALO_DATA_NOLAN);	#($matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL)			
			$RecordObj_matrix_counter->use_cache = false;
			
			$counter_id 	= $RecordObj_matrix_counter->get_ID();  # force calculate id from parent-tipo-lang
			$counter_dato 	= $RecordObj_matrix_counter->get_dato();# force load data
				#dump($RecordObj_matrix_counter,'$RecordObj_matrix_counter BEFORE');

			# Update counter_dato
			$counter_dato_updated = intval($current_value+1);
			$RecordObj_matrix_counter->set_dato($counter_dato_updated);
			$RecordObj_matrix_counter->set_parent(intval(0));
			$RecordObj_matrix_counter->set_tipo($tipo);
			$RecordObj_matrix_counter->set_lang(DEDALO_DATA_NOLAN);

			# REF : Modificamos el objeto RecordObj_matrix/RecordDataBounceObj para añadir la variable 'ref' y salvarla, excepto para 'activity' (por velocidad)
			if($tipo!=DEDALO_ACTIVITY_SECTION_TIPO) {
				$RecordObj_matrix_counter->ref = null;
				$RecordObj_matrix_counter->arRelationMap['ref'] = 'ref';
				$RecordObj_matrix_counter->arModifiedRelations['ref'] = 1;
				$ref = RecordObj_ts::get_termino_by_tipo($tipo);			
				$RecordObj_matrix_counter->set_ref($ref);
					#dump($RecordObj_matrix_counter,'ref');
			}			
			
			$RecordObj_matrix_counter->set_save_time_machine_version(false);
			$RecordObj_matrix_counter->Save();
				#dump($RecordObj_matrix_counter,'$RecordObj_matrix_counter AFTER');

				#error_log("update_counter tipo:$tipo - matrix_table:$matrix_table - actual_counter_number:$current_value - counter_dato_updated:".$RecordObj_matrix_counter->get_dato() );

			return $counter_dato_updated;
		}	
}
?>