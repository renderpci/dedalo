<?php declare(strict_types=1);
/**
* ONTOLOGY
* Manages the main ontology definitions of Dédalo.
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
	* Iterate all given $jer_dd_rows and creates a section row for each one
	* @see transform_data::generate_all_main_ontology_sections
	* @param array $jer_dd_rows
	* @return bool
	* @test true
	*/
	public static function ceate_ontology_records( array $jer_dd_rows ) : bool {

		foreach ($jer_dd_rows as $jer_dd_row) {
			$result = self::add_section_record_from_jer_dd( $jer_dd_row );
			if (!$result) {
				debug_log(__METHOD__
					. " Error adding section " . PHP_EOL
					. ' jer_dd_row: ' . to_string($jer_dd_row)
					, logger::ERROR
				);
			}
		}

		return true;
	}//end ceate_ontology_records



	/**
	* ADD_SECTION_RECORD_FROM_JER_DD
	* Transforms jer_dd row (from DDBB) into matrix ontology row (section record).
	* @param object $jer_dd_row
	* Sample:
		* {
		*	"id": "16028305",
		*	"terminoID": "test102",
		*	"parent": "test45",
		*	"modelo": "dd1747",
		*	"esmodelo": "no",
		*	"esdescriptor": "si",
		*	"visible": "si",
		*	"norden": "28",
		*	"tld": "test",
		*	"traducible": "no",
		*	"relaciones": "null",
		*	"propiedades": null,
		*	"properties": null,
		*	"term2": null,
		*	"term": "{\"lg-spa\": \"section_id\"}"
		* }
	* @param string $target_section_tipo
	* @return bool
	* @test true
	*/
	public static function add_section_record_from_jer_dd( object $jer_dd_row ) : bool {

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
			$is_descriptor_tipo			= 'ontology4';
			$is_descriptor_model		= RecordObj_dd::get_modelo_name_by_tipo( $is_descriptor_tipo  );
			$is_descriptor_component	= component_common::get_instance(
				$is_descriptor_model,
				$is_descriptor_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$descriptor_locator = new locator();
				$descriptor_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$descriptor_locator->set_section_id($is_descriptor === 'si' ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$is_descriptor_component->set_dato( [$descriptor_locator] );
			$is_descriptor_component->Save();

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

			$translatable_locator = new locator();
				$translatable_locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$translatable_locator->set_section_id($translatable === 'si' ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$translatable_component->set_dato( [$translatable_locator] );
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


		return true;
	}//end add_section_record_from_jer_dd



	/**
	* GET_ONTOLOGY_MAIN_FROM_TLD
	* Find the matrix record of ontology main from a given tld
	* sample: dd --> section_tipo: ontology35, section_id: 1
	* @param string $tld
	* @return object|null $row
	* @test true
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
	* Find the matrix row of the ontology main from a given target section tipo as ontology matrix row
	* sample: ontology45 --> section_tipo: ontology35, section_id: 4
	* @param string $target_section_tipo
	* @return object|null $row
	* @test true
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
	* ASSIGN_RELATIONS_FROM_JER_DD
	* Once the matrix records of jer_dd parse is set,
	* it is possible to assign the relations between nodes.
	* Get the relations column in jer_dd and set it as component_portal locator pointed to other matrix ontology record.
	* @param string $tld
	* @return bool
	* @test true
	*/
	public static function assign_relations_from_jer_dd( string $tld) : bool {

		// target_section_tipo
		$target_section_tipo = self::map_tld_to_target_section_tipo( $tld );

		// get all section instances rows
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
	}//end assign_relations_from_jer_dd



	/**
	* REORDER_NODES_FROM_JER_DD
	* Once the matrix records of jer_dd parse is set
	* is possible assign the order between nodes.
	* Find the ontology nodes as matrix rows and order by the jer_dd definition.
	* @param string $tld
	* @return bool
	* @test true
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
	* Creates a new section in the main ontology sections.
	* The main section could be the official tlds as dd, rsc, hierarchy, etc
	* Or local ontology defined by every institution as es, qdp, mupreva, etc
	* @param string $tld
	* @return int|string|null $main_section_id
	* @test true
	*/
	public static function add_main_section( string $tld ) : int|string|null {

		$ontology_tipos			= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation( 'ontology38','section','children_recursive' );
		$local_ontology_tipos	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation( 'localontology1','section','children_recursive' );

		$all_tipos = array_merge($ontology_tipos, $local_ontology_tipos);
		$all_tipos = array_unique( $all_tipos );

		// find target section_tipo
		foreach ($all_tipos as $ontology_tipo) {

			// get the tld inside properties of the jer_dd row of the term
			$RecordObj_dd	= new RecordObj_dd($ontology_tipo);
			$properties		= $RecordObj_dd->get_properties();
			$ontology_tld	= $properties->main_tld ?? null;

			// local cases will not have the tld inside properties
			// in those cases will use the term as tld and name
			if( !isset($ontology_tld) ){
				$ontology_tld = RecordObj_dd::get_termino_by_tipo($ontology_tipo, DEDALO_STRUCTURE_LANG, false); // important don't use cache here!
			}
			//target section_tipo will be the ontology tipo as ontology40
			if( $tld === $ontology_tld) {
				$target_section_tipo = $ontology_tipo;
				break;
			}
		}

		if( !isset($target_section_tipo) ){
			$target_section_tipo = ontology::create_jer_dd_local_ontology_section_node( $tld );
		}

		// check if the main tld already exists
		$ontology_main = self::get_ontology_main_from_tld( $tld );
		if( !empty($ontology_main) ){
			debug_log(__METHOD__
				. " Ignored to add new main ontology with this tld, the main ontology already exists ($ontology_main->section_id), don't use this function to change the main ontology section." . PHP_EOL
				. ' tld: ' . to_string( $tld )
				, logger::WARNING
			);
			return null;
		}

		// ontology table record template data
		$section_data_string	= file_get_contents( dirname(__FILE__).'/main_ontology_section_data.json' );
		$section_data			= json_handler::decode( $section_data_string );

		// Name
			$RecordObj_dd	= new RecordObj_dd($target_section_tipo);
			$term = $RecordObj_dd->get_term();
			$all_term = isset($term)
				? $term
				: (object)[
					DEDALO_STRUCTURE_LANG => $tld
				 ];

			foreach($all_term as $lang => $term){
				$section_data->components->hierarchy5->dato->{$lang} = [$term];
			}

		// TLD
			$section_data->components->hierarchy6->dato->{DEDALO_DATA_NOLAN} = [$tld];

		// Target section tipo
			$section_data->components->hierarchy53->dato->{DEDALO_DATA_NOLAN} = [$target_section_tipo];

		// add model root node in the dd main section only. Note that only dd has the models for the ontology.
		if($tld === 'dd'){

			// general term
			$general_term = new locator();
				$general_term->set_section_tipo($target_section_tipo);
				$general_term->set_section_id('1');
				$general_term->set_type('dd48');
				$general_term->set_from_component_tipo('hierarchy45');

			$section_data->relations[] = $general_term;

			// model term
			$model_term = new locator();
				$model_term->set_section_tipo($target_section_tipo);
				$model_term->set_section_id('2');
				$model_term->set_type('dd48');
				$model_term->set_from_component_tipo('hierarchy45');

			$section_data->relations[] = $model_term;

			// active in thesaurus. Set only dd as active to force to show in the thesaurus tree
			foreach($section_data->relations as $locator){
				if($locator->from_component_tipo === 'hierarchy125'){
					$locator->section_id = '1';
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
	* CREATE_JER_DD_LOCAL_ONTOLOGY_SECTION_NODE
	* Creates new jer_dd row with localontology tld for the local tlds
	* Used for the creation of matrix ontology sections with local ontologies as es1, qdp1, mdcat1, etc
	* A jer_dd row is needed to represent it.
	* @param string $tld
	* @return string $term_id
	*/
	public static function create_jer_dd_local_ontology_section_node( string $tld ) : string {

		// check local ontology node definition in jer_dd
		// localontology1 is a root node of all local tld of the entities
		// the node is not sync by master server definition and need to be created locally
		// if the node exits use it as parent node.
			$local_ontology_row_data = RecordObj_dd::get_row_data('localontology1');
			if( empty($local_ontology_row_data) ){

				$local_ontology_RecordObj_dd = new RecordObj_dd('localontology1');

				$local_ontology_RecordObj_dd->set_parent('dd5');
				$local_ontology_RecordObj_dd->set_modelo('dd4');
				$local_ontology_RecordObj_dd->set_esmodelo('no');
				$local_ontology_RecordObj_dd->set_esdescriptor('si');
				$local_ontology_RecordObj_dd->set_visible('si');
				$local_ontology_RecordObj_dd->set_tld('localontology');
				$local_ontology_RecordObj_dd->set_traducible('no');

				$local_ontology_term = json_decode('
					{
						"lg-spa": "Instancias locales",
						"lg-cat": "Instàncies locals",
						"lg-deu": "Lokale Instanzen",
						"lg-ell": "Τοπικές περιπτώσεις",
						"lg-eng": "Local instances",
						"lg-fra": "Instances locales",
						"lg-ita": "Istanze locali"
					}
				');
				$local_ontology_RecordObj_dd->set_term( $local_ontology_term );
				$local_ontology_RecordObj_dd->insert();
			}

		$tld_RecordObj_dd	= new RecordObj_dd(null, 'localontology');
		$last_id			= $tld_RecordObj_dd->get_last_section_id_from_tld();
		$terminoID			= 'localontology'.( $last_id+1 );

		$RecordObj_dd = new RecordObj_dd($terminoID);
			$RecordObj_dd->set_parent('localontology1');
			$RecordObj_dd->set_modelo('dd6');
			$RecordObj_dd->set_esmodelo('no');
			$RecordObj_dd->set_esdescriptor('si');
			$RecordObj_dd->set_visible('si');
			$RecordObj_dd->set_tld('localontology');
			$RecordObj_dd->set_traducible('no');
			$RecordObj_dd->set_relaciones( json_decode('[{"tipo":"ontology1"},{"tipo":"dd1201"}]') );

			// Properties, add main_tld as official tld definitions
			$properties = new stdClass();
				$properties->main_tld = $tld;
			$RecordObj_dd->set_properties($properties);

			$term = new stdClass();
				$term->{DEDALO_STRUCTURE_LANG} = $tld;
			$RecordObj_dd->set_term( $term );

		$term_id = $RecordObj_dd->insert();


		return $term_id;
	}//end create_jer_dd_local_ontology_section_node



	/**
	* MAP_TLD_TO_TARGET_SECTION_TIPO
	* get the target section tipo from a given tld
	* dd ---> ontology40
	* @param string $tld
	* @return string|null $target_section_tipo
	*/
	public static function map_tld_to_target_section_tipo( string $tld ) : ?string {

		// cache. Defined as general for this class
		if( isset(self::$cache_target_section_tipo[$tld]) ){
			return self::$cache_target_section_tipo[$tld];
		}

		// get_ontology_main record
		$ontology_main_row = self::get_ontology_main_from_tld( $tld );

		if( empty($ontology_main_row) ){
			// creates a new one
			self::add_main_section( $tld );
			// try again
			$ontology_main_row = self::get_ontology_main_from_tld( $tld );
		}

		// empty unrecoverable case
		if( empty($ontology_main_row) ){
			debug_log(__METHOD__
				. " Error for tld, the main ontology don't exist." . PHP_EOL
				. ' tld: ' . to_string( $tld )
				, logger::ERROR
			);
			return null;
		}

		// target_section_tipo from row data
		$ar_target_section_tipo = $ontology_main_row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? null;

		// unset or empty data case
		if( empty($ar_target_section_tipo) ){
			debug_log(__METHOD__
				. " Error for target_section_tipo, the main ontology has not defined target section_tipo" . PHP_EOL
				. 'tld: ' .to_string( $tld )
				, logger::ERROR
			);
			return null;
		}

		$target_section_tipo = $ar_target_section_tipo[0];

		// cache save
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

		// cache check
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

		if( empty($ar_tld) || empty($ar_tld[0]) ){
			debug_log(__METHOD__
				. " Error for tld, the main ontology has not defined target section_tipo" . PHP_EOL
				. 'target_section_tipo: ' .to_string( $target_section_tipo )
				, logger::ERROR
			);
			return null;
		}

		$tld = $ar_tld[0];

		// cache save
		self::$cache_target_section_tipo[$tld] = $target_section_tipo;


		return $tld;
	}//end map_target_section_tipo_to_tld



	/**
	* GET_ALL_ONTOLOGY_SECTIONS
	* Calculates ontology sections (target section tipo) like ontology40, localontology3, ...
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



	/**
	* PARSE_SECTION_RECORD_TO_JER_DD_RECORD
	* Build every component in the section given ($section_tipo, $section_id)
	* get the component_data and parse as column of jer_dd format.
	* @param string $section_tipo
	* @param string|int $section_id
	* @return object|null $jer_dd_record
	*/
	public static function parse_section_record_to_jer_dd_record( string $section_tipo, string|int $section_id ) : ?object {

		// node locator
		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);

		// tld
			// get the tld component first, is necessary to create the recordObj_dd (use term_id as tld +  section_id)
				$tld_tipo		= 'ontology7';
				$tld_model		= RecordObj_dd::get_modelo_name_by_tipo( $tld_tipo  );
				$tld_component	= component_common::get_instance(
					$tld_model,
					$tld_tipo ,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$tld_data = $tld_component->get_dato();
				// if tld_data is empty stop the process
				// tld is mandatory!
				if(empty($tld_data)){
					return false;
				}
				// create the term_id
				$tld = reset( $tld_data );
				$terminoID = $tld . $section_id;

			// create the RecordObj_dd with the term_id and set the tld
				$jer_dd_record = new RecordObj_dd( $terminoID );
				$jer_dd_record->set_tld( $tld );

		// parent
		// parent needs to know the parent tld of the locator to build the term_id
			$parent_tipo		= 'ontology15';
			$parent_model		= RecordObj_dd::get_modelo_name_by_tipo( $parent_tipo  );
			$parent_component	= component_common::get_instance(
				$parent_model,
				$parent_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$parent_data = $parent_component->get_dato();

			if(empty($parent_data)){

				debug_log(__METHOD__
					. " Record without parent " . PHP_EOL
					. 'section_tipo	: ' . to_string($section_tipo). PHP_EOL
					. 'section_id	: ' . to_string($section_id). PHP_EOL
					. 'parent_tipo	: ' . to_string($parent_tipo)
					, logger::DEBUG
				);

			}else{

				// get the parent data
				// use the locator
				$parent_locator	= reset($parent_data);
				$parent = ontology::get_term_id_from_locator($parent_locator);
				$jer_dd_record->set_parent( $parent );
			}


		// model. Get the model tld and id
			$model_tipo			= 'ontology6';
			$model_model		= RecordObj_dd::get_modelo_name_by_tipo( $model_tipo );
			$model_component	= component_common::get_instance(
				$model_model,
				$model_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$model_data = $model_component->get_dato();

			if(empty($model_data)){

				debug_log(__METHOD__
					. " Record without model " . PHP_EOL
					. 'section_tipo	: ' . to_string($section_tipo). PHP_EOL
					. 'section_id	: ' . to_string($section_id). PHP_EOL
					. 'model_tipo	: ' . to_string($model_tipo)
					, logger::DEBUG
				);

			}else{

				// get the parent data
				// use the locator
				$model_locator	= reset($model_data);
				$model = ontology::get_term_id_from_locator($model_locator);
				$jer_dd_record->set_modelo( $model );
			}

		// is model
			$is_model_tipo		= 'ontology30';
			$is_model_model		= RecordObj_dd::get_modelo_name_by_tipo( $is_model_tipo  );
			$is_model_component	= component_common::get_instance(
				$is_model_model,
				$is_model_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$is_model_data = $is_model_component->get_dato();

			if(empty($is_model_data)){

				debug_log(__METHOD__
					. " Record without is_model_data " . PHP_EOL
					. 'section_tipo		: ' . to_string($section_tipo). PHP_EOL
					. 'section_id		: ' . to_string($section_id). PHP_EOL
					. 'is_model_tipo	: ' . to_string($is_model_tipo)
					, logger::DEBUG
				);

			}else{

				$is_model_locator	= reset($is_model_data);
				$is_model = (int)$is_model_locator->section_id === NUMERICAL_MATRIX_VALUE_YES ? 'si' : 'no';
				$jer_dd_record->set_esmodelo( $is_model );
			}

		// descriptor
			$is_descriptor_tipo			= 'ontology4';
			$is_descriptor_model		= RecordObj_dd::get_modelo_name_by_tipo( $is_descriptor_tipo  );
			$is_descriptor_component	= component_common::get_instance(
				$is_descriptor_model,
				$is_descriptor_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$is_descriptor_data = $is_descriptor_component->get_dato();

			if(empty($is_descriptor_data)){

				debug_log(__METHOD__
					. " Record without is_descriptor_data " . PHP_EOL
					. 'section_tipo		: ' . to_string($section_tipo). PHP_EOL
					. 'section_id		: ' . to_string($section_id). PHP_EOL
					. 'is_descriptor_tipo	: ' . to_string($is_descriptor_tipo)
					, logger::DEBUG
				);

			}else{
				$is_descriptor_data_locator	= reset($is_descriptor_data);
				$is_descriptor = (int)$is_descriptor_data_locator->section_id === NUMERICAL_MATRIX_VALUE_YES ? 'si' : 'no';
				$jer_dd_record->set_esdescriptor( $is_descriptor );
			}

		// visibility
			$jer_dd_record->set_visible( 'si' );

		// Order
			// use the parent data to get the children data and calculate the order.
			$siblings	= ontology::get_siblings( $parent_locator );
			$order		= ontology::get_order_from_locator( $locator, $siblings );

			// as every node can change his order position related to other nodes
			// every sibling of the node need update his own order.
			// the order is save in the common parent node
			// and is the array key of the locator sibling
			foreach ($siblings as $key => $sibling_locator) {
				// don't update when the sibling is the current node
				// it will update when it will saved.
				if($sibling_locator->section_tipo === $section_tipo
					&& (int)$sibling_locator->section_id === (int)$section_id){
					continue;
				}
				// get the term_id of the sibling used to get update jer_dd row
				// and save with his position (array key +1)
				$sibling_term_id	= ontology::get_term_id_from_locator( $sibling_locator );
				$sibling_node		= new RecordObj_dd( $sibling_term_id );
				$sibling_node->set_norden( $key+1 );
				$sibling_node->Save();
			}

			$jer_dd_record->set_norden( $order );

		// translatable
			$translatable_tipo		= 'ontology8';
			$translatable_model		= RecordObj_dd::get_modelo_name_by_tipo( $translatable_tipo  );
			$translatable_component	= component_common::get_instance(
				$translatable_model,
				$translatable_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$translatable_data = $translatable_component->get_dato();

			if(empty($translatable_data)){

				debug_log(__METHOD__
					. "Record without translatable_data " . PHP_EOL
					. 'section_tipo			: ' . to_string($section_tipo). PHP_EOL
					. 'section_id			: ' . to_string($section_id). PHP_EOL
					. 'translatable_tipo	: ' . to_string($translatable_tipo)
					, logger::DEBUG
				);

			}else{
				$translatable_data_locator	= reset($translatable_data);
				$translatable = (int)$translatable_data_locator->section_id === NUMERICAL_MATRIX_VALUE_YES ? 'si' : 'no';
				$jer_dd_record->set_traducible( $translatable );
			}

		// Relations
			$relations_tipo			= 'ontology10';
			$relations_model		= RecordObj_dd::get_modelo_name_by_tipo( $relations_tipo  );
			$relations_component	= component_common::get_instance(
				$relations_model,
				$relations_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$relations_data = $relations_component->get_dato();

			if( !empty($relations_data) ){

				$relations = [];
				foreach ($relations_data as $current_relation) {
					// get the relation data
					// use the locator
					$relation_term_id = ontology::get_term_id_from_locator( $current_relation );

					$relation = new stdClass();
						$relation->tipo = $relation_term_id;
					$relations[] = $relation;

				}
			}else{

				$relations = null;
			}

			$jer_dd_record->set_relaciones( $relations );

		// properties V5
			$properties_v5_tipo			= 'ontology19';
			$properties_v5_model		= RecordObj_dd::get_modelo_name_by_tipo( $properties_v5_tipo  );
			$properties_v5_component	= component_common::get_instance(
				$properties_v5_model,
				$properties_v5_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

			$properties_v5_data = $properties_v5_component->get_dato();

			if( !empty($properties_v5_data) ){
				$properties_v5 = json_encode( $properties_v5_data );

			}else{
				$properties_v5 = null;
			}

			$jer_dd_record->set_propiedades( $properties_v5 );


		// properties
			$properties_tipo		= 'ontology18';
			$properties_model		= RecordObj_dd::get_modelo_name_by_tipo( $properties_tipo  );
			$properties_component	= component_common::get_instance(
				$properties_model,
				$properties_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$properties_data = $properties_component->get_dato();

			if( !empty($properties_data) ){
				$properties = reset($properties_data);
			}else{
				$properties = new stdClass();
			}

		// properties CSS
			$properties_css_tipo		= 'ontology16';
			$properties_css_model		= RecordObj_dd::get_modelo_name_by_tipo( $properties_css_tipo  );
			$properties_css_component	= component_common::get_instance(
				$properties_css_model,
				$properties_css_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$properties_css_data = $properties_css_component->get_dato();

			if( !empty($properties_css_data) ){
				$properties->css = reset($properties_css_data);
			}

		// properties RQO
			$properties_rqo_tipo		= 'ontology17';
			$properties_rqo_model		= RecordObj_dd::get_modelo_name_by_tipo( $properties_rqo_tipo  );
			$properties_rqo_component	= component_common::get_instance(
				$properties_rqo_model,
				$properties_rqo_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$properties_rqo_data = $properties_rqo_component->get_dato();
			if( !empty($properties_rqo_data) ){
				$properties->source = reset($properties_rqo_data);
			}

			if( empty(get_object_vars($properties)) ){
				$properties = null;
			}

			$jer_dd_record->set_properties( $properties );

		// term
			$term_tipo		= 'ontology5';
			$term_model		= RecordObj_dd::get_modelo_name_by_tipo( $term_tipo );
			$term_component	= component_common::get_instance(
				$term_model,
				$term_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);

			$term_data = $term_component->get_dato_full();

			if( !empty(get_object_vars($term_data)) ){
				$term = new stdClass();
				foreach ($term_data as $lang => $ar_term) {
					if( !empty($ar_term) ){
						$term->$lang = reset($ar_term);
					}
				}
			}else{
				$term = null;
			}

			$jer_dd_record->set_term( $term );

		return $jer_dd_record;
	}//end parse_section_record_to_jer_dd_record



	/**
	* GET_TERM_ID_FROM_LOCATOR
	* Get the component with the tld data with a given locator
	* and build the term_id as tld.section_id (dd55)
	* @param object $locator
	* @return string|null $term_id;
	*/
	public static function get_term_id_from_locator( object $locator ) : ?string {

		// get the component data
		// using the locator
		$tld_tipo		= 'ontology7';
		$tld_model		= RecordObj_dd::get_modelo_name_by_tipo( $tld_tipo  );
		$tld_component	= component_common::get_instance(
			$tld_model,
			$tld_tipo ,
			$locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$locator->section_tipo
		);

		$tld_data = $tld_component->get_dato();

		if( empty($tld_data) ){
			debug_log(__METHOD__
				. " Empty tld from locator " . PHP_EOL
				. 'locator: ' . to_string($locator )
				, logger::ERROR
			);
			return null;
		}

		$tld		= reset( $tld_data );
		$term_id	= $tld . $locator->section_id;

		return $term_id;
	}//end get_term_id_from_locator



	/**
	* GET_ORDER_FROM_LOCATOR
	* Use the array of siblings to locate the given locator
	* order will be the position of the locator into the siblings array + 1
	* @param object $locator
	* @return int $order
	*/
	public static function get_order_from_locator( object $locator, array $siblings ) : int {

		$data_len = count( $siblings );
		$order = 1;
		for ($i=0; $i < $data_len; $i++) {

			if($siblings[$i]->section_tipo === $locator->section_tipo
				&& (int)$siblings[$i]->section_id === (int)$locator->section_id){
				$order = $i+1;
				break;
			}
		}

		return $order;
	}//end get_order_from_locator



	/**
	* GET_SIBLINGS
	* Get the children data from parent node as siblings
	* @param object $parent_locator
	* @return array $children_data
	*/
	public static function get_siblings( object $parent_locator ) : array {

		// get the component data
		// using the locator
		$children_tipo		= 'ontology14';
		$children_model		= RecordObj_dd::get_modelo_name_by_tipo( $children_tipo  );
		$children_component	= component_common::get_instance(
			$children_model,
			$children_tipo ,
			$parent_locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$parent_locator->section_tipo
		);

		// siblings will be the children component data.
		$siblings_data = $children_component->get_dato() ?? [];

		return $siblings_data;
	}//end get_siblings



	/**
	* INSERT_JER_DD_RECORD
	* parse the section record and insert into jer_dd
	* @param string $section_tipo
	* @param string|int $section_id
	* @return string|null $term_id
	*/
	public static function insert_jer_dd_record( string $section_tipo, string|int $section_id ) : ?string {

		$jer_dd_record = ontology::parse_section_record_to_jer_dd_record( $section_tipo, $section_id );
		$term_id = $jer_dd_record->insert();

		return $term_id;
	}//end insert_jer_dd_record



	/**
	* SET_RECORDS_IN_JER_DD
	* @param object $sqo
	* @return object $response
	*/
	public static function set_records_in_jer_dd( object $sqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$response	= $search->search();
		$ar_records	= $response->ar_records;

		foreach ($ar_records as $current_record) {

			$section_tipo	= $current_record->section_tipo;
			$section_id		= $current_record->section_id;

			$term_id = ontology::insert_jer_dd_record( $section_tipo, $section_id );

			if( empty($term_id ) ){
				$response->errors[] = 'Failed insert into jer_dd with section_tipo: ' . $section_tipo .' section_id: '. $section_id;
			}
		}

		if( empty($response->errors) ){
			$response->result	= true;
			$response->msg		= 'OK. Request done';
		}

		return $response;
	}//end set_records_in_jer_dd



}//end ontology
