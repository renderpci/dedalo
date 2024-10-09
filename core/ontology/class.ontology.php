<?php

/**
* ONTOLOGY
* Manages the main ontology definitions of Dédalo
*/
class ontology {

	// Table where ontology data is stored
	static $main_table			= 'matrix_ontology_main';
	static $main_section_tipo	= 'ontology35';



	/**
	* CEATE_ONTOLOGY_RECORDS
	* @return
	*/
	public function ceate_ontology_records( array $jer_dd_rows ) {

		foreach ($jer_dd_rows as $row) {
			$tld = $row->tld;
			$main_section_row = $this->get_ontology_main_form_tld( $tld );

			$ar_target_section_tipo = $main_section_row->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? null;

			if ( empty($ar_target_section_tipo) ) {
				debug_log(__METHOD__
					. 'Ignored tld because it does not has a target section_tipo defined in main ontology: '. $tld
					, logger::ERROR
				);
				continue;
			}

			$target_section_tipo = $ar_target_section_tipo[0];

			$setion_data = $this->buil_section_row_from_jer_dd($row, $target_section_tipo);
		}

	}//end ceate_ontology_records



	/**
	* GET_ONTOLOGY_MAIN_FORM_TLD
	* @param string $tld
	* @return
	*/
	public function get_ontology_main_form_tld( string $tld ) : ?object {

		$sql = '
			SELECT *
			FROM "'.self::$main_table.'"
			WHERE
			section_tipo = \''.self::$main_section_tipo.'\' AND
			f_unaccent(datos#>>\'{components,hierarchy6,dato}\') ~* f_unaccent(\'.*\["'.$tld.'"\].*\')
		';

		$result = pg_query(DBi::_getConnection(), $sql);
		if ($result===false) {
			$msg = " Error on db execution (get_ontology_main_form_tld): ".pg_last_error(DBi::_getConnection());
			debug_log(__METHOD__
				. $msg
				, logger::ERROR
			);

			return null; // return error here !
		}
		$rows	= pg_fetch_assoc($result);
		$row	= $rows[0] ?? null;

		return $row;
	}//end get_ontology_main_form_tld



	/**
	* BUIL_SECTION_ROW_FROM_JER_DD
	* @param object $jer_dd_row
	* @param string $target_section_tipo
	* @return
	*/
	public function buil_section_row_from_jer_dd( object $jer_dd_row, string $target_section_tipo) {


		// vars
		$tipo			= $jer_dd_row->terminoID;
		$parent_tipo	= $jer_dd_row->parent;

		$section_data = new stdClass();

		$descriptor = new locator();
			$descriptor->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
			$descriptor->set_section_id(NUMERICAL_MATRIX_VALUE_YES);


		// term
		$tld				= RecordObj_dd::get_prefix_from_tipo( $tipo );
		$section_id			= RecordObj_dd::get_id_from_tipo( $tipo );

		// parent
		$parent_tld			= RecordObj_dd::get_prefix_from_tipo( $parent_tipo );
		$parent_section_id	= RecordObj_dd::get_id_from_tipo( $parent_tipo );
		$parent_main_section_row = $this->get_ontology_main_form_tld( $parent_tld );
		$ar_target_section_tipo = $parent_main_section_row->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? null;




	}//end buil_section_row_from_jer_dd


	/**
	* CREATE_NEW_MAIN_SECTION
	* @return
	*/
	public function create_new_main_section( string $tld ) {

		// jer_dd
		// insert into the jer_dd the new main section.
		$term = new stdClass();
			$term->{DEDALO_STRUCTURE_LANG} = $tld;
		$options = new stdClass();
			$options->terminoID		= $tld.'6';
			$options->parent		= 'ontology59';
			$options->modelo		= 'dd6';
			$options->esmodelo		= 'no';
			$options->esdescriptor	= 'si';
			$options->visible		= 'si';
			$options->traducible	= 'no';
			$options->relaciones	= json_decode('[{"dd6":"ontology1"},{"dd626":"dd1201"}]');
			$options->properties	= null;
			$options->tld			= 'ontology';
			$options->term			= $term;

		// ontology table
		$section_data = json_decode( file_get_contents('main_ontology_section_data.json') );

		// Name
		$section_data->components->hierarchy5->dato->{DEDALO_STRUCTURE_LANG} = [$tld];
		// TLD
		$section_data->components->hierarchy6->dato->{DEDALO_DATA_NOLAN} = [$tld];


	}//end create_new_main_section



}//end ontology
