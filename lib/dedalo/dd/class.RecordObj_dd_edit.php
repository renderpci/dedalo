<?php
require_once(DEDALO_LIB_BASE_PATH . '/dd/class.dd.php');




class RecordObj_dd_edit extends RecordObj_dd {



	/**
	* SAVE
	* PASADA A RecordObj_dd (Pública. Esta carpeta es privada de momento 28-08-2016)
	*/
	public function Save( $descriptor_dato_unused=null ) {

		if(!verify_dedalo_prefix_tipos($this->prefijo)) {
			if(SHOW_DEBUG===true) {
				trigger_error("Error on save 'RecordObj_dd_edit'. Prefijo is empty or wrong. Nothing is saved!");
			}
			return false;
		}

		if (empty($this->parent)) {
			if(SHOW_DEBUG===true) {
				trigger_error("Error on save 'RecordObj_dd_edit'. Parent is empty. Nothing is saved!");
			}
			return false;
		}else{
			if(!verify_dedalo_prefix_tipos($this->parent)) {
				if(SHOW_DEBUG===true) {
					trigger_error("Error on save 'RecordObj_dd_edit'. Parent Prefijo is empty or wrong. Nothing is saved!");
				}
				return false;
			}
		}

		#
		# EDIT
		# TERMINO ID EXISTS : UPDATE RECORD
		if (!empty($this->terminoID) && verify_dedalo_prefix_tipos($this->prefijo)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Saving with parent save ".to_string(), logger::DEBUG);
			}
			return parent::Save();
		}

		#
		# INSERT
		# TERMINO ID NOT CREATED : BUILD NEW AND INSERT
		# Creamos el terminoID a partir del prefijo y el contador contador para el prefijo actual
		$counter_dato   = self::get_counter_value($this->prefijo);
		$terminoID		= (string)$this->prefijo . (int)($counter_dato+1);
			#dump($terminoID," terminoID - prefijo:$this->prefijo");die();

		# Fix terminoID : Important!
		$this->set_terminoID($terminoID);

		# Set defaults
		$this->set_tld( (string)$this->prefijo );
		if(empty($this->norden)) $this->set_norden( (int)1 );


		if (!empty($this->terminoID)) {

			$result = parent::Save();

			if ($result) {

				$counter_dato_updated  = self::update_counter($this->prefijo, $counter_dato);
					#dump($counter_dato_updated," counter_dato_updated $this->prefijo");

				$prefix_parent 		= self::get_prefix_from_tipo($this->parent);
				$prefix_terminoID 	= self::get_prefix_from_tipo($this->terminoID);

				$value_parent 		= (int)substr($this->parent,  strlen($prefix_parent));
				$value_terminoID 	= (int)substr($this->terminoID, strlen($prefix_terminoID));

				//if ($value_terminoID<=$value_parent ) {
				//	dump($value_parent, 	' value_parent for '.$this->parent);
				//	dump($value_terminoID,  ' value_parent for '.$this->terminoID);
				//	throw new Exception("Error Processing Request. Inconsistency detected. parent:$this->parent , terminoID:$this->terminoID", 1);
				//}

				#
				# DESCRIPTORS : finally we create one record in descriptors with this main info
				$RecordObj_descriptors_dd = new RecordObj_descriptors_dd(RecordObj_descriptors_dd::$descriptors_matrix_table, NULL, $terminoID, 'lg-spa');
				$RecordObj_descriptors_dd->set_tipo('termino');
				$RecordObj_descriptors_dd->set_parent($terminoID);
				$RecordObj_descriptors_dd->set_lang('lg-spa');
				$created_id_descriptors	= $RecordObj_descriptors_dd->Save();
			}
		}

		return (string)$terminoID;
	}//end Save



	/**
	* UPDATE_COUNTER
	* @param (string)$tld, (int)$current_value=false
	* @return int
	* Actualiza el contador para el tld dado (ej. 'dd').
	* El 'current_value' es opcional. Si no se recibe se calcula
	*/
	public static function update_counter($tld, $current_value=false) {

		#if (!$current_value) {
		#	$current_value = self::get_counter_value($tld);
		#}

		$db_value = self::get_counter_value($tld);
		if ($current_value<$db_value) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Ignored invalid counter value: $current_value . DB value is $db_value ".to_string(), logger::ERROR);
			}
			return false;
		}

		$counter_dato_updated = intval($current_value+1) ;

		$strQuery 	= "UPDATE \"main_dd\" SET counter = $1 WHERE tld = $2";
		$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $counter_dato_updated, $tld));
		if (!$result) {
			if(SHOW_DEBUG===true) {
				trigger_error("Error on update_counter 'RecordObj_dd_edit'. Nothing is saved! : $strQuery");
			}
			return false;
		}

		return (int)$counter_dato_updated;
	}



	/**
	* GET_COUNTER_VALUE
	*/
	public static function get_counter_value($tld) {

		$strQuery 		= "SELECT counter FROM \"main_dd\" WHERE tld = '$tld' LIMIT 1";
		$search			= JSON_RecordDataBoundObject::search_free($strQuery);
		$result 		= pg_fetch_assoc($search);
		$counter_value 	= $result['counter'] ?? null;

		if (!$counter_value || is_null($counter_value)) {

			$insert_counter = 'INSERT INTO "main_dd" ("tld", "counter") VALUES (\''.$tld.'\', 0);';
			pg_query(DBi::_getConnection(), $insert_counter);

			return 0;
		}

		return (int)$counter_value;
	}//end get_counter_value



}
?>
