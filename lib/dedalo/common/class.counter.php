<?php
require_once(DEDALO_LIB_BASE_PATH . '/common/class.Accessors.php');
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');



abstract class counter extends Accessors {


		/**
		* GET_COUNTER_VALUE 
		* COUNTER (STORED IN MATRIX_COUNTER TABLE)
		* @param string $tipo Like dd561 
		* @param string $matrix_table Like matrix_counter (default)
		* @return int $counter_number
		*/
		public static function get_counter_value($tipo, $matrix_table='matrix_counter') {

			$counter_number = 0; # Default (when no counter exists in db)

			# ACTIVITY_SECTION DON'T USE COUNTERS
			if ($tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
				return (int)0;
			}
			/*
			$arguments=array();
			$arguments['strPrimaryKeyName']	= 'dato';
			$arguments['tipo']				= $tipo;
			$RecordObj_matrix				= new RecordObj_matrix($matrix_table,NULL);
			$RecordObj_matrix->use_cache 	= false; # Important !
			$ar_records						= $RecordObj_matrix->search($arguments);
			if (empty($ar_records[0])) {
				$counter_number = intval(0);
			}else{
				$counter_number = intval($ar_records[0]);
			}
			if(SHOW_DEBUG) {
				#dump($counter_number,"get_counter_value counter_number $tipo");
			}			

			return $counter_number;
			*/

			$strQuery 		= "SELECT dato AS counter_number FROM \"$matrix_table\" WHERE tipo = $1 LIMIT 1";
			$result	  		= pg_query_params(DBi::_getConnection(), $strQuery, array($tipo));
			if (!$result) {
				throw new Exception("Error Processing Request. DB error on get counter value", 1);
			}
			$rows 			= pg_num_rows($result);
			if ($rows>0) {
				$counter_number = pg_fetch_result($result, 0, 0);
			}else{
				if(SHOW_DEBUG) {
					debug_log(__METHOD__." counter not found in db ($matrix_table). Value $counter_number is returned instead ($strQuery) ".to_string(), logger::DEBUG);
				}
			}
			
			return (int)$counter_number;
		}


		/**
		* UPDATE_COUNTER
		* @param string $tipo Like dd561
		* @param string $matrix_table Like matrix_counter (default)
		* @param int $current_value (default false)
		* @return int $counter_dato_updated
		* NOTA : HACERLO DIRECTO SQL, PASANDO DE LOS COMPONENTES Y DEMÁS ZARANDAJAS !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		*/
		public static function update_counter($tipo, $matrix_table='matrix_counter', $current_value=false) {

			# ACTIVITY_SECTION DON'T USE COUNTERS
			if ($tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
				return (int)0;
			}
			
			/*
			if ($current_value===false) {
				$current_value = (int)counter::get_counter_value($tipo, $matrix_table);
			}
	
			$RecordObj_matrix_counter = new RecordObj_matrix($matrix_table, NULL, '0', $tipo, DEDALO_DATA_NOLAN);	#($matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL)			
			$RecordObj_matrix_counter->use_cache = false; # Important !
			
			$counter_id 	= $RecordObj_matrix_counter->get_ID();  # force calculate id from parent-tipo-lang
			$counter_dato 	= $RecordObj_matrix_counter->get_dato();# force load data
				#dump($RecordObj_matrix_counter,'$RecordObj_matrix_counter BEFORE');

			# Update counter_dato
			$counter_dato_updated = intval($current_value)+1;
			$RecordObj_matrix_counter->set_dato($counter_dato_updated);


			# Only fist time ** SE EJECUTARÁ SIEMPRE PORQUE EN IMPORTACIONES NO ES POSIBLE HACERLO ASÍ (el contador puede consolidarse en un valor mayor de 1 al crear el contador)
			#if ($counter_dato_updated<=1) {
				
				$RecordObj_matrix_counter->set_tipo($tipo);
				$RecordObj_matrix_counter->set_lang(DEDALO_DATA_NOLAN);
				$RecordObj_matrix_counter->set_parent(intval(0)); // Important not null constrain()
				# REF : Modificamos el objeto RecordObj_matrix/RecordDataBounceObj para añadir la variable 'ref' y salvarla, excepto para 'activity' (por velocidad)				
				$RecordObj_matrix_counter->ref = null;
				$RecordObj_matrix_counter->arRelationMap['ref'] 	  = 'ref';
				$RecordObj_matrix_counter->arModifiedRelations['ref'] = 1;
				$ref = RecordObj_dd::get_termino_by_tipo($tipo);
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
				$ref .= " [$modelo_name]";
				$RecordObj_matrix_counter->set_ref($ref);
					#dump($RecordObj_matrix_counter,'ref');
				if(SHOW_DEBUG) {
					error_log(__METHOD__." Creating new counter: $ref ($counter_dato_updated) [$tipo - $matrix_table]");
				}								
			#}//end if ($counter_dato_updated<=1)						
			
			# Save dato
			$RecordObj_matrix_counter->set_save_time_machine_version(false);
			$id_matrix = $RecordObj_matrix_counter->Save();
			
			if(SHOW_DEBUG) {
				#dump($RecordObj_matrix_counter,'$RecordObj_matrix_counter AFTER');
				#error_log("update_counter tipo:$tipo - matrix_table:$matrix_table - actual_counter_number:$current_value - counter_dato_updated:".$RecordObj_matrix_counter->get_dato() );
				#dump($counter_dato_updated, "counter_dato_updated - current_value:$current_value - idmatrix:$id_matrix");
			}				

			return (int)$counter_dato_updated;
			*/

			if ($current_value===false) {
				$current_value = (int)counter::get_counter_value($tipo, $matrix_table);
			}
			$counter_dato_updated = intval($current_value)+1;

			$parent = 0;
			$dato 	= (int)$counter_dato_updated;
			$tipo 	= (string)$tipo;
			$lang 	= DEDALO_DATA_NOLAN;

			if( intval($current_value)==0 ) {
				$ref 	  = RecordObj_dd::get_termino_by_tipo($tipo)." [".RecordObj_dd::get_modelo_name_by_tipo($tipo,true)."]";
				$strQuery = "INSERT INTO \"$matrix_table\" (parent, dato, tipo, lang, ref) VALUES ($1, $2, $3, $4, $5)";
				$result   = pg_query_params(DBi::_getConnection(), $strQuery, array($parent, $dato, $tipo, $lang, $ref));
				if(SHOW_DEBUG) {
					debug_log(__METHOD__." CREATED NEW COUNTER with value: counter_number:$dato ($strQuery) ".to_string(), logger::DEBUG);
					if (!$result) {
						trigger_error("VARS: parent:$parent, dato:$dato, tipo:$tipo, lang:$lang, ref:$ref");
					}
				}
			}else{
				$strQuery = "UPDATE \"$matrix_table\" SET dato = $1 WHERE tipo = $2";
				$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $dato, $tipo ));
				if(SHOW_DEBUG) {
					debug_log(__METHOD__." Updated counter with value: dato:$dato, tipo:$tipo ($strQuery) ".to_string(), logger::DEBUG);
					if (!$result) {
						trigger_error("VARS: dato:$dato, tipo:$tipo");
					}
				}
			}			
			if (!$result) {
				throw new Exception("Error Processing Request. DB error on update counter", 1);
			}			

			return (int)$counter_dato_updated;
			
		}#end update_counter



		/**
		* CONSOLIDATE_COUNTER
		* Get de bigger section_id of current section_tipo and set the counter with this value (useful for import records not sequentially)
		* If counter not exists, a new counter is created
		* @param string $section_tipo
		* @param string $matrix_table
		* @param string $counter_matrix_table default matrix_counter
		* @return bool true if update/create counter, false if not
		*/
		public static function consolidate_counter( $section_tipo, $matrix_table, $counter_matrix_table='matrix_counter' ) {
			
			# Search bigger section_tipo existent
			$strQuery = "SELECT section_id FROM \"$matrix_table\" WHERE section_tipo = $1 ORDER BY section_id DESC LIMIT 1";
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_tipo ));
			$rows 	  = (array)pg_fetch_assoc($result);

			$bigger_section_id = reset($rows);
				#dump($bigger_section_id, 'consolidate_counter strQuery:'.$strQuery);
			
			if (empty($bigger_section_id)) {
				return false;
			}

			#
			# UPDATE COUNTER WITH BIGGEST VALUE
			$current_value = intval( (int)$bigger_section_id -1 ); # update_counter set current value + 1. For this we pass current -1 to consolidate counter	
			if ($current_value<0) {
				$current_value=0;
			}
			
			#
			# TEST IF COUNTER EXISTS BEFORE SET	
			$counter_created = false;			
			# When current_value is bigger than zero, test is counter exits. If not, create calling counter with zero value				
			$strQuery 	= "SELECT dato AS counter_number FROM \"$counter_matrix_table\" WHERE tipo = $1 LIMIT 1";
			$result	  	= pg_query_params(DBi::_getConnection(), $strQuery, array($section_tipo));
			if(!$result)throw new Exception("Error Processing Request. DB error on get counter value", 1);			
			$rows 		= pg_num_rows($result);
			if ($rows<1) {
				# COUNTER NOT EXITS. CALL UPDATE COUNTER WITH VALUE ZERO TO FORCE CREATE NEW
				counter::update_counter($section_tipo, $counter_matrix_table, 0);
				$counter_created = true;
			}
			
			
			# Update counter always
			if ($counter_created==true && $current_value==0) {
				# Nothing to do (counter is created and updated)
			}else{
				# Counter exitst (verified) and update value with new value > 0
				counter::update_counter($section_tipo, $counter_matrix_table, $current_value);
			}			
			
			debug_log(__METHOD__." Triggered consolidate_counter and update_counter with value: $current_value [$section_tipo - $matrix_table] ".to_string(), logger::DEBUG);
						
			
			return true;

		}#end consolidate_counter


}
?>