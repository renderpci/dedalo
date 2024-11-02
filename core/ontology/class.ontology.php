<?php
declare(strict_types=1);
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
	*
	* @param array $jer_dd_rows
	* @return void
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
	*
	* @param string $tld
	* @return object|null $row
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
	*
	* @param string $tld
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

	/**
	* ADD_MAIN_SECTION
	* Create new section in the main ontology sections.
	* The main section could be the official tlds as dd, rsc, hierarchy, etc
	* Or local ontology defined by every institution as es, qdp, mupreva, etc
	* @param string $tld
	* @return int|string|null $main_section_id
	*/
	public static function add_main_section( string $tld ) : int|string|null {

		// get all ontology terms in jer_dd
		$ontology_nodes = RecordObj_dd::get_all_tld_nodes( ['ontology','localontology'] );

		$found = false;
		foreach ($ontology_nodes as $item) {

			$string_term = $item->term;
			$term = json_decode($string_term);
			$name = $term->{DEDALO_STRUCTURE_LANG};

			if($name === $tld) {
				$found = $item;
				break;
			}
		}

		$target_section_tipo = $found === false
			? ontology::create_jr_dd_local_ontology_section_node( $tld )
			: $found->terminoID;


		// check if exist the main tld
		$ontology_main = self::get_ontology_main_form_tld( $tld );

		if( !empty($ontology_main) ){
			debug_log(__METHOD__
				. " Ignored to add new main ontology with this tld, the main ontology exists, don't use this function to change the main ontology section, tld: " . PHP_EOL
				. to_string( $tld )
				, logger::DEBUG
			);
			return null;
		}

		// ontology table
		$section_data = json_decode( file_get_contents( dirname(__FILE__).'/main_ontology_section_data.json') );

		// Name
		$section_data->components->hierarchy5->dato->{DEDALO_STRUCTURE_LANG} = [$tld];
		// TLD
		$section_data->components->hierarchy6->dato->{DEDALO_DATA_NOLAN} = [$tld];


		// Target section tipo
		$section_data->components->hierarchy53->dato->{DEDALO_DATA_NOLAN} = [$target_section_tipo];
		//general term
		$general_term = new locator();
			$general_term->set_section_tipo($tld);
			$general_term->set_section_id('1');
			$general_term->set_type('dd48');
			$general_term->set_from_component_tipo('hierarchy45');

		$section_data->relations[] = $general_term;

		// add model root node in the dd main section only, only dd has the models for the ontology.
		if($tld === 'dd'){
			//model term
			$model_term = new locator();
				$model_term->set_section_tipo($tld);
				$model_term->set_section_id('2');
				$model_term->set_type('dd48');
				$model_term->set_from_component_tipo('hierarchy45');

			$section_data->relations[] = $model_term;
		}

		$main_section = section::get_instance(
			null, // string|null section_id
			self::$main_section_tipo// string section_tipo
		);
		$main_section->set_dato( $section_data );
		$main_section_id = $main_section->Save();

		return $main_section_id;
	}//end add_main_section
	/**
	* MAP_TLD_TO_TARGET_SECTION_TIPO
	* @param string $tld
	* @return string|null $target_section_tipo
	*/
	public static function map_tld_to_target_section_tipo( string $tld ) : ?string {

		if( isset($cache_target_section_tipo[$tld]) ){
			return $cache_target_section_tipo[$tld];
		}

		$ontology_main = self::get_ontology_main_form_tld( $tld );

		if( empty($ontology_main) ){
			self::add_main_section( $tld );
			$ontology_main	= self::get_ontology_main_form_tld( $tld );
		}

		if( empty($ontology_main) ){
			debug_log(__METHOD__
				. " Error for tld, the main ontology don't exist, tld: " . PHP_EOL
				. to_string( $tld )
				, logger::ERROR
			);
			return null;
		}
		$ar_target_section_tipo = $ontology_main->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? null;

		if( empty($ar_target_section_tipo) ){
			debug_log(__METHOD__
				. " Error for target_section_tipo, the main ontology has not defined target section_tipo" . PHP_EOL
				. 'tld: ' .to_string( $tld )
				, logger::ERROR
			);
			return null;
		}
		$target_section_tipo = $ar_target_section_tipo[0];

		self::$cache_target_section_tipo[$tld] = $target_section_tipo;

		return self::$cache_target_section_tipo[$tld];
	}//end map_tld_to_target_section_tipo


	/**
	* MAP_TARGET_SECTION_TIPO_TO_TLD
	* @return string|null $tld
	*/
	public static function map_target_section_tipo_to_tld( string $target_section_tipo ) : ?string {

		foreach (self::$cache_target_section_tipo as $current_tld => $value) {
			if($value === $target_section_tipo){
				return $current_tld;
			}
		}

		$ontology_main = self::get_ontology_main_form_target_section_tipo($target_section_tipo);

		if( empty($ontology_main) ){
			debug_log(__METHOD__
				. " Error for target_section_tipo, the main ontology don't exist, target_section_tipo: " . PHP_EOL
				. to_string( $target_section_tipo )
				, logger::ERROR
			);
			return null;
		}
		$ar_tld = $ontology_main->datos->components->{DEDALO_HIERARCHY_TLD2_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? null;

		if( empty($ar_tld) ){
			debug_log(__METHOD__
				. " Error for tld, the main ontology has not defined target section_tipo" . PHP_EOL
				. 'target_section_tipo: ' .to_string( $target_section_tipo )
				, logger::ERROR
			);
			return null;
		}
		$tld = $ar_tld[0];

		self::$cache_target_section_tipo[$tld] = $target_section_tipo;

		return $tld;
	}//end map_target_section_tipo_to_tld


	/**
	* GET_ALL_ONTOLOGY_SECTIONS
	* Calculate ontology sections (target section tipo) of types requested, like ontology40,localontology3,...
	* @return array $ontology_sections
	*/
	public static function get_all_ontology_sections() : array {

		// cache
			static $cache_ontology_sections;
			$use_cache = true;
			if ($use_cache===true) {
				$cache_key = 'all_ontology_sections';
				if (isset($cache_ontology_sections[$cache_key])) {
					return $cache_ontology_sections[$cache_key];
				}
			}

		// search_query_object
			$sqo = new search_query_object();
				$sqo->set_section_tipo( [self::$main_section_tipo] );
				$sqo->set_limit( 0 );


		// search exec
			$search	= search::get_instance($sqo);
			$result	= $search->search();

		// iterate rows
			$ontology_sections = [];
			foreach ($result->ar_records as $row) {

				if (empty($row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN})) {
					debug_log(__METHOD__
						." Skipped ontology without target section tipo: $row->section_tipo, $row->section_id ".to_string()
						, logger::ERROR
					);
					continue;
				}

				$target_dato			= $row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN};
				$target_section_tipo	= $target_dato[0] ?? null;

				if (empty($target_section_tipo)) {
					debug_log(__METHOD__
						." Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id ". PHP_EOL
						.' target_dato: '. to_string($target_dato)
						, logger::ERROR
					);
					continue;
				}

				$ontology_sections[] = $target_section_tipo;
			}//end foreach ($result->ar_records as $row)

		// cache
			if ($use_cache===true) {
				$cache_ontology_sections[$cache_key] = $ontology_sections;
			}


		return $ontology_sections;
	}//end get_all_ontology_sections

}//end ontology
