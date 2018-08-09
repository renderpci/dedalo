<?php





class migrate_v40_to_v41 {
	

	/**
	* MIGRATE_TS_TABLE
	* @return 
	*/
	public function migrate_ts_table_USAR_UPDATES( $source_table, $target_table ) {

		#
		# POSTGRESQL ADD NEW TABLE (target_table)
		/*
		$reference_table = 'matrix';
		$sql = "
		DROP TABLE IF EXISTS {$target_table} ;		
		CREATE TABLE IF NOT EXISTS {$target_table} (LIKE {$reference_table} INCLUDING INDEXES INCLUDING DEFAULTS);
		DROP SEQUENCE IF EXISTS {$target_table}_id_seq ;
		CREATE SEQUENCE public.{$target_table}_id_seq;
		-- ALTER SEQUENCE public.{$target_table}_id_seq OWNER TO postgres;
		ALTER TABLE {$target_table} ALTER COLUMN id SET DEFAULT nextval('{$target_table}_id_seq'::regclass);
		-- DELETE FROM {$target_table};
   		";
   		$result = pg_query(DBi::_getConnection(), $sql);
   			//dump($resul, ' resul ++ '.to_string($sql)); //return;
		*/


		#
		# SOURCE TABLE DATA
		$strQuery = "SELECT * FROM \"$source_table\" ORDER BY id ASC";
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);

		$section_tipo = '';


		while ($rows = pg_fetch_assoc($result)) {

			# Data from v40 tables (pre-matrix)
			$terminoID 		= (string)$rows['terminoID'];
			$parent			= (string)$rows['parent'];
			$esmodelo		= (string)$rows['esmodelo'];
			$esdescriptor	= (string)$rows['esdescriptor'];
			$visible		= (string)$rows['visible'];
			$norden			= (string)$rows['norden'];
			$usableIndex	= (string)$rows['usableIndex'];
			$relaciones		= (string)$rows['relaciones'];
			$propiedades	= (string)$rows['propiedades'];

			$mainLang = Jerarquias::get_mainLang($terminoID);


			#
			# SECTION
			$section 	= section::get_instance(null, $section_tipo);
			$section_id = $section->Save();
			if ((int)$section_id<1) {
				return false;
			}

			#
			# COMPONENT_RADIO_BUTTON : ES_DESCRIPTOR
			$tipo 			= 'hierarchy23';
			$dato 			= self::si_no_to_locator( $esmodelo );
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$lang 			= $mainLang;			
			$component 		= component_common::get_instance($modelo_name,
															 $tipo,
															 $section_id,
															 'edit',
															 $lang,
															 $section_tipo);

		}//end while ($rows = pg_fetch_assoc($result)) {

		return null;
	}//end migrate_ts_table



	/**
	* SI_NO_TO_LOCATOR
	* @return 
	*/
	public static function si_no_to_locator( $value ) {
		
		$value = trim($value);
		$value = strtolower($value);

		switch ($value) {
			case 'si':
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
					$locator->set_section_id($section_id);
				break;			
			case 'no':
			default:
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
					$locator->set_section_id($section_id);
				break;
		}

		return $locator;
	}//end si_no_to_locator



}
?>