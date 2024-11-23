<?php
declare(strict_types=1);
/**
* ONTOLOGY
* Manages the main ontology definitions of Dédalo
*/
class ontology {



	// Table where ontology data is stored
	static $main_table					= 'matrix_ontology_main';
	static $main_section_tipo			= 'ontology35';
	static $cache_target_section_tipo	= [
		'dd'			=> 'ontology40',
		'ontology'		=> 'ontology41',
		'localontology'	=> 'ontology42',
		'lg'			=> 'ontology43',
		'hierarchy'		=> 'ontology44',
		'rsc'			=> 'ontology45'
	];


	/**
	* CEATE_ONTOLOGY_RECORDS
	*
	* @param array $jer_dd_rows
	* @return void
	*/
	public static function ceate_ontology_records( array $jer_dd_rows ) {

		foreach ($jer_dd_rows as $jer_dd_row) {
			$setion_data = self::add_section_row_from_jer_dd( $jer_dd_row );
		}
	}//end ceate_ontology_records



	/**
	* GET_ONTOLOGY_MAIN_FrOM_TLD
	* Find the matrix record of ontology main from a given tld
	* sample: dd --> section_tipo: ontology35, section_id: 1
	* @param string $tld
	* @return object|null $row
	*/
	public static function get_ontology_main_from_tld( string $tld ) : ?object {

		$safe_tld = safe_tld( $tld );

		$filter = json_decode( '
			{
				"$and": [{
					"q_operator": "==",
					"q": "'.$safe_tld.'",
					"path": [{
						"section_tipo": "'.self::$main_section_tipo.'",
						"component_tipo": "hierarchy6"
					}]
				}]
			}
		');

		$sqo = new search_query_object();
			$sqo->set_section_tipo( [self::$main_section_tipo] );
			$sqo->set_filter( $filter );
			$sqo->set_limit( 1 );

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$response	= $search->search();
		$ar_records	= $response->ar_records;

		$row = $ar_records[0] ?? null;


		return $row;
	}//end get_ontology_main_from_tld



	/**
	* GET_ONTOLOGY_MAIN_FORM_TARGET_SECTION_TIPO
	* Find the matrix row of the ontology main from a target section tipo from ontology matrix row
	* ontology40 --> section_tipo: ontology35, section_id: 1
	* @param string $tld
	* @return object|null $row
	*/
	public static function get_ontology_main_form_target_section_tipo( string $target_section_tipo ) : ?object {

		$safe_tipo = safe_tipo( $target_section_tipo );

		$filter = json_decode( '
			{
				"$and": [{
					"q_operator": "==",
					"q": "'.$safe_tipo.'",
					"path": [{
						"section_tipo": "'.self::$main_section_tipo.'",
						"component_tipo": "hierarchy53"
					}]
				}]
			}
		');

		$sqo = new search_query_object();
			$sqo->set_section_tipo( [self::$main_section_tipo] );
			$sqo->set_filter( $filter );
			$sqo->set_limit( 1 );

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$response	= $search->search();
		$ar_records	= $response->ar_records;

		$row = $ar_records[0] ?? null;


		return $row;
	}//end get_ontology_main_form_target_section_tipo



	/**
	* ADD_SECTION_ROW_FROM_JER_DD
	* Transform jer_dd row (from DDBB) into matrix ontology row (section record).
	* @param object $jer_dd_row
	* @param string $target_section_tipo
	* @return
	*/
	public static function add_section_row_from_jer_dd( object $jer_dd_row ) {

		// vars
		$tld					= $jer_dd_row->tld;
		$target_section_tipo	= self::map_tld_to_target_section_tipo( $tld );
		$node_tipo				= $jer_dd_row->terminoID;
		$parent					= $jer_dd_row->parent;
		$model					= $jer_dd_row->modelo;
		$is_model				= $jer_dd_row->esmodelo;
		$is_descriptor			= $jer_dd_row->esdescriptor;
		$visible				= $jer_dd_row->visible;
		$translatable			= $jer_dd_row->traducible;
		$relations				= !empty ( $jer_dd_row->relaciones )
			? (json_handler::decode( $jer_dd_row->relaciones ) ?? [])
			: [];
		$properties_v5			= !empty ( $jer_dd_row->propiedades ) ? json_decode( $jer_dd_row->propiedades ) : new stdClass();
		$properties				= !empty ( $jer_dd_row->properties ) ? json_decode( $jer_dd_row->properties ) : new stdClass();
		$term					= !empty ( $jer_dd_row->term ) ? json_decode( $jer_dd_row->term ) : new stdClass();

		// get the section_id from the node_tipo: oh1 = 1, rsc197 = 197, etc
		$section_id = RecordObj_dd::get_id_from_tipo( $node_tipo );

		// Section, create new section
		$section = section::get_instance(
			$section_id,
			$target_section_tipo
		);

		$section->forced_create_record();

		// tld
			$tld_tipo		= 'ontology7';
			$tld_model		= RecordObj_dd::get_modelo_name_by_tipo( $tld_tipo  );
			$tld_component	= component_common::get_instance(
				$tld_model,
				$tld_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$tld_component->set_dato( [$tld] );
			$tld_component->Save();

		// model. Get the model tld and id
			if( !empty($model) && $model!=='null' ){
				$model_section_id	= RecordObj_dd::get_id_from_tipo( $model );
				$model_tld			= RecordObj_dd::get_prefix_from_tipo( $model );
				$model_section_tipo	= self::map_tld_to_target_section_tipo( $model_tld );

				$model_locator = new locator();
					$model_locator->set_section_tipo( $model_section_tipo );
					$model_locator->set_section_id( $model_section_id );

				$model_tipo			= 'ontology6';
				$model_model		= RecordObj_dd::get_modelo_name_by_tipo( $model_tipo );
				$model_component	= component_common::get_instance(
					$model_model,
					$model_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$target_section_tipo
				);

				$model_component->set_dato( [$model_locator] );
				$model_component->Save();
			}

		// descriptor
			$is_desctipor_tipo		= 'ontology4';
			$is_desctipor_model		= RecordObj_dd::get_modelo_name_by_tipo( $is_desctipor_tipo  );
			$is_desctipor_component	= component_common::get_instance(
				$is_desctipor_model,
				$is_desctipor_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$descriptor_locator = new locator();
				$descriptor_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$descriptor_locator->set_section_id($is_descriptor === 'si' ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$is_desctipor_component->set_dato( [$descriptor_locator] );
			$is_desctipor_component->Save();

		// is model
			$is_model_tipo		= 'ontology30';
			$is_model_model		= RecordObj_dd::get_modelo_name_by_tipo( $is_model_tipo  );
			$is_model_component	= component_common::get_instance(
				$is_model_model,
				$is_model_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$is_model_locator = new locator();
				$is_model_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$is_model_locator->set_section_id($is_model === 'si' ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$is_model_component->set_dato( [$is_model_locator] );
			$is_model_component->Save();

		// translatable
			$translatable_tipo		= 'ontology8';
			$translatable_model		= RecordObj_dd::get_modelo_name_by_tipo( $translatable_tipo  );
			$translatable_component	= component_common::get_instance(
				$translatable_model,
				$translatable_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$tanslatable_locator = new locator();
				$tanslatable_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$tanslatable_locator->set_section_id($translatable === 'si' ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$translatable_component->set_dato( [$tanslatable_locator] );
			$translatable_component->Save();

		// term
			$term_tipo		= 'ontology5';
			$term_model		= RecordObj_dd::get_modelo_name_by_tipo( $term_tipo  );

			foreach ($term as $current_lang => $term_value) {

				$term_component	= component_common::get_instance(
					$term_model,
					$term_tipo ,
					$section_id,
					'list',
					$current_lang,
					$target_section_tipo
				);

				$term_component->set_dato( [$term_value] );
				$term_component->Save();
			}

		// properties V5
			$properties_v5_tipo			= 'ontology19';
			$properties_v5_model		= RecordObj_dd::get_modelo_name_by_tipo( $properties_v5_tipo  );
			$properties_v5_component	= component_common::get_instance(
				$properties_v5_model,
				$properties_v5_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$properties_v5_component->set_dato( [$properties_v5] );
			$properties_v5_component->Save();

		// properties CSS
			$properties_css_tipo		= 'ontology16';
			$properties_css_model		= RecordObj_dd::get_modelo_name_by_tipo( $properties_css_tipo  );
			$properties_css_component	= component_common::get_instance(
				$properties_css_model,
				$properties_css_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$properties_css = $properties->css ?? null;

			$properties_css_component->set_dato( [$properties_css] );
			$properties_css_component->Save();

		// properties RQO
			$properties_rqo_tipo		= 'ontology17';
			$properties_rqo_model		= RecordObj_dd::get_modelo_name_by_tipo( $properties_rqo_tipo  );
			$properties_rqo_component	= component_common::get_instance(
				$properties_rqo_model,
				$properties_rqo_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$properties_rqo = $properties->source ?? null;

			$properties_rqo_component->set_dato( [$properties_rqo] );
			$properties_rqo_component->Save();

		// properties
			$properties_tipo		= 'ontology18';
			$properties_model		= RecordObj_dd::get_modelo_name_by_tipo( $properties_tipo  );
			$properties_component	= component_common::get_instance(
				$properties_model,
				$properties_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			if(!empty($properties)) {
				$properties_general = new stdClass();
				foreach ($properties as $pkey => $pvalue) {
					if ($pkey==='source' || $pkey==='css') {
						continue;
					}
					$properties_general->{$pkey} = $pvalue;
				}
				$properties_general_value = [$properties_general];
			}

			$properties_component->set_dato( $properties_general_value ?? null );
			$properties_component->Save();

	}//end add_section_row_from_jer_dd



	/**
	* ASSING_RELATIONS_FROM_JER_DD
	* Once the matrix records of jer_dd parse is set
	* is possible assign the relations between nodes.
	* Get the relations column in jer_dd and set it as component_portal locator pointed to other matrix ontology record.
	* @param string $tld
	* @return bool
	*/
	public static function assing_relations_from_jer_dd( string $tld) : bool {

		// vars
		$target_section_tipo = self::map_tld_to_target_section_tipo( $tld );

		// get all section
		$all_section_instances = section::get_resource_all_section_records_unfiltered( $target_section_tipo );

		while ($row = pg_fetch_assoc($all_section_instances)) {
			$section_id = $row['section_id'];

			$node_tipo = $tld.$section_id;
			$relations = RecordObj_dd::get_ar_terminos_relacionados( $node_tipo, true, true );

			// Relations
			$relations_tipo			= 'ontology10';
			$relations_model		= RecordObj_dd::get_modelo_name_by_tipo( $relations_tipo  );
			$relations_component	= component_common::get_instance(
				$relations_model,
				$relations_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$related_locators = [];
			foreach ($relations as $related_tipo) {

				// get the parent tld and id
				$related_section_id		= RecordObj_dd::get_id_from_tipo( $related_tipo );
				$related_tld			= RecordObj_dd::get_prefix_from_tipo( $related_tipo );
				$related_section_tipo	= self::map_tld_to_target_section_tipo( $related_tld );

				$related_locator = new locator();
					$related_locator->set_section_tipo( $related_section_tipo );
					$related_locator->set_section_id( $related_section_id );

				$related_locators[] = $related_locator;
			}

			$relations_component->set_dato( $related_locators );
			$relations_component->Save();
		}

		return true;
	}//end assing_relations_from_jer_dd



	/**
	* REORDER_NODES_FROM_JER_DD
	* Once the matrix records of jer_dd parse is set
	* is possible assign the order between nodes.
	* Find the ontology nodes as matrix rows and order by the jer_dd definition.
	* @param string $tld
	* @return bool
	*/
	public static function reorder_nodes_from_jer_dd( string $tld ) : bool {

		// vars
		$target_section_tipo = self::map_tld_to_target_section_tipo( $tld );

		// get all section
		$all_section_instances = section::get_resource_all_section_records_unfiltered( $target_section_tipo );

		while ($row = pg_fetch_assoc($all_section_instances)) {

			$section_id	= $row['section_id'];
			$node_tipo	= $tld.$section_id;
			$children	= RecordObj_dd::get_ar_childrens($node_tipo);

			$children_data = [];
			foreach ($children as $child_tipo) {

				$child_section_id	= RecordObj_dd::get_id_from_tipo( $child_tipo );
				$child_tld			= RecordObj_dd::get_prefix_from_tipo( $child_tipo );
				$child_section_tipo	= self::map_tld_to_target_section_tipo( $child_tld );

				$child_locator = new locator();
					$child_locator->set_section_tipo($child_section_tipo);
					$child_locator->set_section_id($child_section_id);

				$children_data[] = $child_locator;
			}

			$children_tipo		= 'ontology14';
			$children_model		= RecordObj_dd::get_modelo_name_by_tipo( $children_tipo );
			$children_component	= component_common::get_instance(
				$children_model,
				$children_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$children_component->set_dato($children_data);
			$children_component->Save();
		}


		return true;
	}//end reorder_nodes_from_jer_dd



	/**
	* ADD_MAIN_SECTION
	* Create new section in the main ontology sections.
	* The main section could be the official tlds as dd, rsc, hierarchy, etc
	* Or local ontology defined by every institution as es, qdp, mupreva, etc
	* @param string $tld
	* @return int|string|null $main_section_id
	*/
	public static function add_main_section( string $tld ) : int|string|null {

		$ontology_tipos			= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation( 'ontology38','section','children_recursive' );
		$local_ontology_tipos	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation( 'localontology1','section','children_recursive' );

		$all_tipos = array_merge($ontology_tipos, $local_ontology_tipos);
		$all_tipos = array_unique( $all_tipos );

		//sort tipos
		foreach ($all_tipos as $ontology_tipo) {

			$ontology_tld = RecordObj_dd::get_termino_by_tipo($ontology_tipo, DEDALO_STRUCTURE_LANG);

			if( $tld === $ontology_tld) {
				$target_section_tipo = $ontology_tipo;
				break;
			}
		}

		if( !isset($target_section_tipo) ){
			$target_section_tipo = ontology::create_jr_dd_local_ontology_section_node( $tld );
		}

		// check if exist the main tld
		$ontology_main = self::get_ontology_main_from_tld( $tld );
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

		// add model root node in the dd main section only, only dd has the models for the ontology.
		if($tld === 'dd'){

			// general term
			$general_term = new locator();
				$general_term->set_section_tipo($target_section_tipo);
				$general_term->set_section_id('1');
				$general_term->set_type('dd48');
				$general_term->set_from_component_tipo('hierarchy45');

			$section_data->relations[] = $general_term;


			//model term
			$model_term = new locator();
				$model_term->set_section_tipo($target_section_tipo);
				$model_term->set_section_id('2');
				$model_term->set_type('dd48');
				$model_term->set_from_component_tipo('hierarchy45');

			$section_data->relations[] = $model_term;

			//active in thesaurus, set only dd as active to show in the thesaurus tree
			foreach($section_data->relations as $locator){
				if($locator->from_component_tipo === 'hierarchy125'){
					$locator->section_id = "1";
				}
			}
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
	* CREATE_JR_DD_LOCAL_ONTOLOGY_SECTION_NODE
	* Create new jer_dd row with localontology tld for the local tlds
	* Used to creation of matrix ontology sections with local ontologies as es1, qdp1, mdcat1, etc
	* Is necessary a jer_dd row to represent it.
	* @param string $tld
	* @return string $term_id
	*/
	public static function create_jr_dd_local_ontology_section_node( string $tld ) : string {

		$term = new stdClass();
			$term->{DEDALO_STRUCTURE_LANG} = $tld;

		$RecordObj_dd = new RecordObj_dd(null, 'localontology');
			$RecordObj_dd->set_parent('localontology1');
			$RecordObj_dd->set_modelo('dd6');
			$RecordObj_dd->set_esmodelo('no');
			$RecordObj_dd->set_esdescriptor('si');
			$RecordObj_dd->set_visible('si');
			$RecordObj_dd->set_tld('localontology');
			$RecordObj_dd->set_traducible('no');
			$RecordObj_dd->set_relaciones( json_decode('[{"tipo":"ontology1"},{"tipo":"dd1201"}]') );
			$RecordObj_dd->set_term( $term );

		$term_id = $RecordObj_dd->Save();

		return $term_id;
	}//end create_jr_dd_local_ontology_section_node



	/**
	* MAP_TLD_TO_TARGET_SECTION_TIPO
	* get the target section tipo from a given tld
	* dd ---> ontology40
	* @param string $tld
	* @return string|null $target_section_tipo
	*/
	public static function map_tld_to_target_section_tipo( string $tld ) : ?string {

		if( isset($cache_target_section_tipo[$tld]) ){
			return $cache_target_section_tipo[$tld];
		}

		$ontology_main = self::get_ontology_main_from_tld( $tld );

		if( empty($ontology_main) ){
			self::add_main_section( $tld );
			$ontology_main	= self::get_ontology_main_from_tld( $tld );
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
	* get the tld from a given target section tipo
	* ontology40 --> dd
	* @param string $target_section_tipo
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
