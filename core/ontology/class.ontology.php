<?php declare(strict_types=1);
/**
* ONTOLOGY
* Manages the main ontology definitions of Dédalo.
*/
class ontology {



	// Table where ontology data is stored
	static $main_table					= 'matrix_ontology_main';
	static $main_section_tipo			= DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';



	/**
	* CREATE_ONTOLOGY_RECORDS
	* Iterate all given $jer_dd_rows and creates a section row for each one
	* @see transform_data::generate_all_main_ontology_sections
	* @param array $jer_dd_rows
	* @return bool
	* @test true
	*/
	public static function create_ontology_records( array $jer_dd_rows ) : bool {

		foreach ($jer_dd_rows as $jer_dd_row) {

			$id = get_section_id_from_tipo( $jer_dd_row->terminoID );
			// Skip main section of the tld.
			// main section is defined with the tld  + 0 as dd0,rsc0, etc.
			// this definition will be stored in ontology main
			// therefore, don't save it into matrix tables,
			// it will create a mistake section with section_id = 0 and section_tipo as 'dd0'
			// as well as section_tipo is fine with 'dd0' section_id can not be 0 in any case.
			if( $id==='0' ){
				continue;
			}

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
	}//end create_ontology_records



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
		$section_id = get_section_id_from_tipo( $node_tipo );

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
				$model_section_id	= get_section_id_from_tipo( $model );
				$model_tld			= get_tld_from_tipo( $model );
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

			// list thesaurus exception `dd144`
			// until 6.4 list thesaurus is an array of objects without any kind of definition
			// in 6.4 his defintion change to be a `show` object with a `ddo_map` as others
			if($model === 'dd144' && !empty($properties) && is_array($properties) ){

				// generate the new objects and assign the old properties
				$new_properties = new stdClass();
					$new_properties->show = new stdClass();
					$new_properties->show->ddo_map = $properties;

				$properties = $new_properties;

				// update jer_dd record with the new properties
				$jer_dd_row->set_properties($new_properties);
				$jer_dd_row->insert();
			}

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
					"lang": "'.DEDALO_DATA_NOLAN.'",
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
			$sqo->set_skip_projects_filter(true);

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
					"lang": "'.DEDALO_DATA_NOLAN.'",
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
			$sqo->set_skip_projects_filter(true);

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
				$related_section_id		= get_section_id_from_tipo( $related_tipo );
				$related_tld			= get_tld_from_tipo( $related_tipo );
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

				$child_section_id	= get_section_id_from_tipo( $child_tipo );
				$child_tld			= get_tld_from_tipo( $child_tipo );
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
	* @param object $file_item
	*  {
	*		"tld": "oh",
	*		"section_tipo": "oh0",
	*		"typology_id": "5",
	*		"name_data": {
	*			"lg-spa": [
	*				"oh"
	*			]
	*		}
	*	}
	* @return int|string|null $main_section_id
	* @test true
	*/
	public static function add_main_section( object $file_item ) : int|string|null {

		// file item properties
			$tld					= $file_item->tld;
			$target_section_tipo	= $file_item->section_tipo ?? ontology::map_tld_to_target_section_tipo( $tld );
			$typology_id			= $file_item->typology_id ?? null;
			$name_data				= $file_item->name_data ?? null;

		// Typology fallback
			if( empty($typology_id) ){
				$typology_locator = hierarchy::get_typology_locator_from_tld( $tld );
				if( !empty($typology_locator) ){
					$typology_id = (int)$typology_locator->section_id;
					$file_item->typology_id = $typology_id;
				}
			}

		// Name fallback
			if( empty($name_data) ){
				$name_data = (object)[
					DEDALO_STRUCTURE_LANG => [$tld]
				];
				$file_item->name_data = $name_data;
			}

		// target_section_tipo fallback
			$file_item->target_section_tipo = $target_section_tipo;

		// ontology table record template data
			$section_data_string	= file_get_contents( DEDALO_CORE_PATH.'/ontology/templates/main_section_data.json' );
			$section_data			= json_handler::decode( $section_data_string );

		// Name
			$section_data->components->hierarchy5->dato = $name_data;

		// TLD
			$section_data->components->hierarchy6->dato->{DEDALO_DATA_NOLAN} = [$tld];

		// Target section tipo
			$section_data->components->hierarchy53->dato->{DEDALO_DATA_NOLAN} = [$target_section_tipo];

		// Typology
			if( !empty($typology_id) ){
				$typology_data = new locator();
					$typology_data->set_type( 'dd151' );
					$typology_data->set_section_tipo( DEDALO_HIERARCHY_TYPES_SECTION_TIPO );
					$typology_data->set_section_id( $typology_id );
					$typology_data->set_from_component_tipo( DEDALO_HIERARCHY_TYPOLOGY_TIPO );

				$section_data->relations[]= $typology_data;
			}

		// add model root node in the dd main section only. Note that only dd has the models for the ontology.
			if($tld === 'dd'){

				// general term
				$general_term = new locator();
					$general_term->set_type('dd48');
					$general_term->set_section_tipo( $target_section_tipo );
					$general_term->set_section_id('1');
					$general_term->set_from_component_tipo('hierarchy45');

				$section_data->relations[] = $general_term;

				// model term
				$model_term = new locator();
					$model_term->set_type('dd48');
					$model_term->set_section_tipo( $target_section_tipo );
					$model_term->set_section_id('2');
					$model_term->set_from_component_tipo('hierarchy45');

				$section_data->relations[] = $model_term;

				// active in thesaurus. Set only dd as active to force to show in the thesaurus tree
				foreach($section_data->relations as $locator){
					if($locator->from_component_tipo === 'hierarchy125'){
						$locator->section_id = '1';
					}
				}
			}

		// check if the main tld already exists
			$ontology_main = self::get_ontology_main_from_tld( $tld );

		// if main section exist update it, else create new one
			$main_section_id = ( !empty($ontology_main) )
				? $ontology_main->section_id
				: null ;

		// create jer_dd node for section
			ontology::create_jer_dd_ontology_section_node( $file_item );

		// matrix section
			$main_section = section::get_instance(
				$main_section_id, // string|null section_id
				self::$main_section_tipo// string section_tipo
			);
			$main_section->set_dato( $section_data );
			$main_section_id = $main_section->Save();


		return $main_section_id;
	}//end add_main_section



	/**
	* CREATE_JER_DD_ONTOLOGY_SECTION_NODE
	* Creates new jer_dd row with ontologytype tld for the local tlds
	* Used for the creation of matrix ontology sections with local ontologies as es1, qdp1, mdcat1, etc.
	* A jer_dd row is needed to represent it.
	* Note that action 'RecordObj_dd->insert()' delete the existing record in jer_dd, and creates a new one
	* @param object $file_item
	* {
	* 	tld: string
	* 	typology_id: int
	* 	name_data: object
	* 	parent_grouper_tipo: string
	* }
	* @return string|false|null $term_id
	* @test true
	*/
	public static function create_jer_dd_ontology_section_node( object $file_item ) : string|false|null {

		// file item properties
			$tld					= $file_item->tld;
			$typology_id			= $file_item->typology_id ?? 15;
			$name_data				= $file_item->name_data ?? null;
			$parent_grouper_tipo	= $file_item->parent_grouper_tipo ?? null;

		// create the parent group node
		// if parent group is given, will use it, else create the parent_gruper to build the nodes.
			if( empty($parent_grouper_tipo) ){
				// parent group is set with his typology
				// if typology is not set it will assign to typology 15 `others`
				$parent_grouper_tipo = ontology::create_parent_grouper( 'ontology40', 'ontologytype', (int)$typology_id);
			}

		// Ontology section for the given tld
		// ontology section is the main or root node used to create the ontology nodes.
		// it is defined as tld+0, because the nodes start with 1 as dd1, rsc1, etc.
			$terminoID = $tld.'0'; // as mdcat0, mupreva0, etc.

			$RecordObj_dd = new RecordObj_dd($terminoID);
				$RecordObj_dd->set_parent($parent_grouper_tipo);
				$RecordObj_dd->set_modelo('dd6');
				$RecordObj_dd->set_model('section');
				$RecordObj_dd->set_esmodelo('no');
				$RecordObj_dd->set_esdescriptor('si');
				$RecordObj_dd->set_visible('si');
				$RecordObj_dd->set_tld($tld);
				$RecordObj_dd->set_traducible('no');
				$RecordObj_dd->set_relaciones( json_decode('[{"tipo":"ontology1"},{"tipo":"dd1201"}]') );

				// Properties, add main_tld as official tld definitions
				// and local section color
				$properties = new stdClass();
					$properties->main_tld	= $tld;
					$properties->color		= '#2d8894';
				$RecordObj_dd->set_properties($properties);

				// term
				if (!empty($name_data)) {
					$term = new stdClass();
					foreach ($name_data as $current_lang => $value) {
						$term->$current_lang = $value[0] ?? $tld;
					}
					$RecordObj_dd->set_term( $term );
				}

			$term_id = $RecordObj_dd->insert();


		return $term_id;
	}//end create_jer_dd_ontology_section_node



	/**
	* CREATE_PARENT_GROUPER
	* Creates an area node with the typology information to group the nodes.
	* Parent grouper organize the tld with clear structure in menu
	* This method can create the main group nodes if doesn't exists previously,
	* main nodes are mandatory to store the child information of the created area node:
	* `ontologytype14` (core node) is dependent of `ontology40` (instances node)
	* but when a rebuild the ontology as update process does, the child node can be processed before his parent exists.
	* In those cases, this method will create the main node (`ontology40`) in matrix to store the child locator.
	* @param string $parent_group
	* @param string $tld
	* @param int $typology_id
	* @return string $parent_grouper_tipo
	* @test true
	*/
	public static function create_parent_grouper( string $parent_group='ontology40', string $tld='ontologytype', int $typology_id=15 ) : string {

		// Ontology main section for the given tld
		// ontology section is the main or root node used to create the ontology nodes.
		// it is defined as tld+0, instead nodes that they start with 1 as dd1, rsc1, etc.
		// this node is create to manage the typology sections
			$name_data = (object)[
				'lg-spa' => ($tld==='ontologytype') ? 'Tipologías de ontología' : 'Tipologías de jerarquía',
				'lg-eng' => ($tld==='ontologytype') ? 'Ontology typologies' : 'Hierarchy typologies',
				'lg-deu' => ($tld==='ontologytype') ? 'Ontologie-Typen' : 'Typologien der Hierarchie',
				'lg-fra' => ($tld==='ontologytype') ? 'Types d\'ontologie' : 'Typologies hiérarchiques',
				'lg-ita' => ($tld==='ontologytype') ? 'Tipi di ontologia' : 'Tipologie di gerarchia',
				'lg-cat' => ($tld==='ontologytype') ? 'Tipus d\'ontologia' : 'Tipus de jerarquies',
				'lg-ell' => ($tld==='ontologytype') ? 'Τύποι οντολογίας' : 'Τυπολογίες ιεραρχίας',
			];
			foreach ($name_data as $key => $value) {
				if( $tld==='hierarchymtype' ){
					$value = $value.' [m]';
				}
				$value = $value.' | '.$tld;

				$name_data->$key = [$value];
			}

			$file_data = new stdClass();
				$file_data->tld					= $tld;
				$file_data->typology_id			= $typology_id;
				$file_data->name_data			= $name_data;
				$file_data->parent_grouper_tipo	= 'ontologytype14';// don't create parent grouper

			ontology::add_main_section( $file_data );

		// Check parent
		// parent nodes needs to exist because the node will store itself in the children component of his parent
		// the main instances of typology for ontology node is `ontology40`
		// the main instances of typology for hierarchy nodes is `hierarchy56`
		// the main instances of typology for hierarchy mocel nodes is hierarchy57`
			$parent_tld			= get_tld_from_tipo( $parent_group );
			$parent_section_id	= get_section_id_from_tipo( $parent_group );
			$parent_node_tipo	= $parent_tld.'0';

			// jer_dd. Check if the parent already exists in jer_dd
				$parent_ontology_row_data = RecordObj_dd::get_row_data( $parent_node_tipo );
				if( empty($parent_ontology_row_data) ){

					$RecordObj_dd = new RecordObj_dd($parent_node_tipo);
						$RecordObj_dd->set_parent($parent_group);
						$RecordObj_dd->set_modelo('dd6');
						$RecordObj_dd->set_model('section');
						$RecordObj_dd->set_esmodelo('no');
						$RecordObj_dd->set_esdescriptor('si');
						$RecordObj_dd->set_visible('si');
						$RecordObj_dd->set_tld($parent_tld);
						$RecordObj_dd->set_traducible('no');
						$RecordObj_dd->set_relaciones( json_decode('[{"tipo":"ontology1"},{"tipo":"dd1201"}]') );

					// Properties, add main_tld as official tld definitions
					// and local section color
						$properties = new stdClass();
							$properties->main_tld	= $parent_tld;
							$properties->color		= '#2d8894';
						$RecordObj_dd->set_properties($properties);

					// insert jer_dd record
					$RecordObj_dd->insert();
				}

			// matrix. Check if the parent already exists in matrix
				$section_record_exist = section::section_record_exists( $parent_section_id, $parent_node_tipo );
				if( $section_record_exist===false ){
					$parent_section = section::get_instance(
						$parent_section_id, // string|null section_id
						$parent_node_tipo // string section_tipo
					);

					$parent_section->forced_create_record();
				}

		// matrix section of the typology node
			$section_tipo = $tld.'0'; // it can be: ontologytype0, hierarchytype0, hierarchymtype0

			$typology_section = section::get_instance(
				$typology_id, // string|null section_id
				$section_tipo, // string section_tipo
				'list',
				false
			);

			// create the record in matrix_ontology table.
				$typology_section->forced_create_record();

			// ontology table record template data
				$area_grouper_data_string	= file_get_contents( DEDALO_CORE_PATH.'/ontology/templates/area_grouper_data.json' );
				$area_grouper_data			= json_handler::decode( $area_grouper_data_string );

			// section data
				$area_grouper_data->section_id = $typology_id;
				$area_grouper_data->section_tipo = $tld.'0';

			// tld
				$area_grouper_data->components->ontology7->dato->{DEDALO_DATA_NOLAN} = [$tld];

			// Name
				// use the typology name.
				$model			= RecordObj_dd::get_modelo_name_by_tipo( DEDALO_HIERARCHY_TYPES_NAME_TIPO, true );
				$typology_term	= component_common::get_instance(
					$model, // string model
					DEDALO_HIERARCHY_TYPES_NAME_TIPO, // string tipo
					$typology_id, // string section_id
					'list', // string mode
					DEDALO_DATA_LANG, // string lang
					DEDALO_HIERARCHY_TYPES_SECTION_TIPO // string section_tipo
				);

				$typology_term_full_data = $typology_term->get_dato_full();

				$area_grouper_data->components->ontology5->dato = $typology_term_full_data;

			// save section
				$typology_section->set_dato( $area_grouper_data );
				$typology_section->Save();

			// parent
			// save itself as child of his parent.
				$children_tipo		= 'ontology14';
				$children_model		= 'component_relation_children'; // don't use the jer_dd resolution here, it should not exists jet.
				$component_children	= component_common::get_instance(
					$children_model, // string model
					$children_tipo, // string tipo
					$parent_section_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					$parent_node_tipo, // string section_tipo
					false
				);

				$node_locator = new locator();
					$node_locator->set_type( DEDALO_RELATION_TYPE_CHILDREN_TIPO );
					$node_locator->set_section_id( $typology_id );
					$node_locator->set_section_tipo( $section_tipo );
					$node_locator->set_from_component_tipo( $children_tipo );

				$is_added = $component_children->add_child( $node_locator );
				if( $is_added === true){
					$component_children->Save();
				}

		// create the jer_dd node
			ontology::insert_jer_dd_record( $section_tipo, $typology_id );

		// return the parent grouper as `ontologytype14
			$parent_grouper_tipo = $tld.$typology_id;


		return $parent_grouper_tipo;
	}//end create_parent_grouper



	/**
	* MAP_TLD_TO_TARGET_SECTION_TIPO
	* get the target section tipo from a given tld
	* dd ---> dd0
	* @param string $tld
	* @return string $target_section_tipo
	* @test true
	*/
	public static function map_tld_to_target_section_tipo( string $tld ) : string {

		$safe_tld = safe_tld( $tld );

		if( $safe_tld === false){
			debug_log(__METHOD__
				. " Error. current tld is not valid " . PHP_EOL
				. to_string( $tld )
				, logger::ERROR
			);

			throw new Exception(" Error. current tld is not valid", 1);
		}

		$target_section_tipo = $safe_tld.'0';

		return $target_section_tipo;
	}//end map_tld_to_target_section_tipo



	/**
	* MAP_TARGET_SECTION_TIPO_TO_TLD
	* get the tld from a given target section tipo
	* dd0 --> dd
	* @param string $target_section_tipo
	* @return string|null $tld
	* @test true
	*/
	public static function map_target_section_tipo_to_tld( string $target_section_tipo ) : ?string {

		$tld = get_tld_from_tipo( $target_section_tipo );

		return $tld;
	}//end map_target_section_tipo_to_tld



	/**
	* GET_ALL_ONTOLOGY_SECTIONS
	* Calculates ontology sections (target section tipo) like dd0, ontologytype3, ...
	* Stored in matrix_ontology_main table.
	* @return array $ontology_sections
	* @test true
	*/
	public static function get_all_ontology_sections() : array {

		// cache
			static $cache_ontology_sections;
			$use_cache = true;
			if ($use_cache===true && isset($cache_ontology_sections)) {
				return $cache_ontology_sections;
			}

		// ar_records. Get all records from main ontology executing a search
			$ar_records = ontology::get_all_main_ontology_records();

		// iterate rows
			$ontology_sections = [];
			foreach ($ar_records as $row) {

				$target_section_tipo = $row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato->{DEDALO_DATA_NOLAN}[0] ?? null;

				// target section tipo check
					if (empty($target_section_tipo)) {
						debug_log(__METHOD__
							." Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id ". PHP_EOL
							.' target_dato: '. to_string($row->datos->components->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO}->dato)
							, logger::ERROR
						);
						continue;
					}

				// add section tipo
					$ontology_sections[] = $target_section_tipo;

			}//end foreach ($result->ar_records as $row)

		// cache
			if ($use_cache===true && !empty($ontology_sections)) {
				$cache_ontology_sections = $ontology_sections;
			}


		return $ontology_sections;
	}//end get_all_ontology_sections



	/**
	* GET_ALL_MAIN_ONTOLOGY_RECORDS
	* Exec a search against matrix_ontology_main filtering
	* for main_section_tipo without limit and return all resulting records
	* @return array $ar_records
	* @test true
	*/
	public static function get_all_main_ontology_records() : array {

		// search_query_object
			$sqo = new search_query_object();
				$sqo->set_section_tipo( [self::$main_section_tipo] );
				$sqo->set_limit( 0 );
				$sqo->set_skip_projects_filter( true );

		// search exec
			$search	= search::get_instance($sqo);
			$result	= $search->search();

		$ar_records = $result->ar_records ?? [];

		if (empty($ar_records)) {
			debug_log(__METHOD__
				. " EMPTY AR RECORDS " . PHP_EOL
				. ' section_tipo: ' . to_string(self::$main_section_tipo) . PHP_EOL
				. ' sqo: ' . to_string($sqo) . PHP_EOL
				, logger::ERROR
			);
		}


		return $ar_records;
	}//end get_all_main_ontology_records



	/**
	* GET_ACTIVE_ELEMENTS
	* Execs a real SQL search and
	* returns an array of current active ontologies or hierarchies
	* @return array $active_hierarchies
	* @test true
	*/
	public static function get_active_elements() : array {

		// main filter
		$filter = json_decode('
			{
				"$and": [
					{
						"q": [
							{
								"section_id": "1",
								"section_tipo": "dd64",
								"from_component_tipo": "hierarchy4"
							}
						],
						"q_operator": null,
						"path": [
							{
								"name": "Active",
								"model": "component_radio_button",
								"section_tipo": "hierarchy1",
								"component_tipo": "hierarchy4"
							}
						],
						"type": "jsonb"
					}
				]
			}
		');

		// section tipo depends on the current class (hierarchy, ontology)
		$section_tipo = get_called_class()::$main_section_tipo;

		$sqo = new search_query_object();
			$sqo->set_section_tipo( [$section_tipo] );
			$sqo->set_limit( 0 );
			$sqo->set_offset( 0 );
			$sqo->set_filter( $filter );

		$search = search::get_instance(
			$sqo // object sqo
		);
		$result = $search->search();

		// active_elements
		$active_elements = array_map(
			'ontology::row_to_element',
			$result->ar_records
		);


		return $active_elements;
	}//end get_active_elements



	/**
	* ROW_TO_ELEMENT
	* Normalized conversion from matrix_ontology_main row to
	* a element object with more important properties
	* @param object $row
	* 	matrix_ontology_main database row
	* @return object $element
	* @test true
	*/
	public static function row_to_element( object $row ) : object {

		$section_id		= $row->section_id;
		$section_tipo	= $row->section_tipo;

		// name
			$tipo		= DEDALO_HIERARCHY_TERM_TIPO; // 'hierarchy5'
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_LANG, // string lang
				$section_tipo // string section_tipo
			);
			$name		= $component->get_value();
			$name_data	= $component->get_dato_full();

		// tld
			$tipo		= DEDALO_HIERARCHY_TLD2_TIPO; // 'hierarchy6'
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_LANG, // string lang
				$section_tipo // string section_tipo
			);
			$tld = $component->get_value();

		// target_section_tipo
			$tipo		= DEDALO_HIERARCHY_TARGET_SECTION_TIPO; // 'hierarchy53'
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_LANG, // string lang
				$section_tipo // string section_tipo
			);
			$target_section_tipo = $component->get_value();

		// target_section_model_tipo
			$tipo		= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO; // 'hierarchy58'
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_LANG, // string lang
				$section_tipo // string section_tipo
			);
			$target_section_model_tipo = $component->get_value();

		// main_lang
			$tipo		= DEDALO_HIERARCHY_LANG_TIPO; // 'hierarchy8'
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_LANG, // string lang
				$section_tipo // string section_tipo
			);
			$main_lang = $component->get_value();

		// Typology
			$model = RecordObj_dd::get_modelo_name_by_tipo( DEDALO_HIERARCHY_TYPOLOGY_TIPO );
			$typology_component = component_common::get_instance(
				$model, // string model
				DEDALO_HIERARCHY_TYPOLOGY_TIPO, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

			$typology_data	= $typology_component->get_dato();
			$typology_id	= $typology_data[0]->section_id ?? null;
			$typology_name	= $typology_component->get_value();

		// hierarchy order
			$model = RecordObj_dd::get_modelo_name_by_tipo( DEDALO_HIERARCHY_ORDER_TIPO );
			$component_order = component_common::get_instance(
				$model,
				DEDALO_HIERARCHY_ORDER_TIPO,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$order_dato		= $component_order->get_dato();
			$order_value	= $order_dato[0] ?? 0;

		// active_in_thesaurus get the status of the component active
		// it will use to discard into tree view the hierarchy in client
		// in the JSON controller will check to remove his typology if the hierarchy is not active
			$model = RecordObj_dd::get_modelo_name_by_tipo( DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO );
			$component_active_in_thesaurus = component_common::get_instance(
				$model,
				DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$active_in_thesaurus_data	= $component_active_in_thesaurus->get_dato();
			$active_in_thesaurus		= isset($active_in_thesaurus_data[0]) && (int)$active_in_thesaurus_data[0]->section_id === NUMERICAL_MATRIX_VALUE_YES
				? true
				: false;


		return (object)[
			'section_id'				=> $section_id,
			'section_tipo'				=> $section_tipo,
			'name'						=> $name,
			'name_data'					=> $name_data,
			'tld'						=> $tld,
			'target_section_tipo'		=> $target_section_tipo,
			'target_section_model_tipo'	=> $target_section_model_tipo,
			'main_lang'					=> $main_lang,
			'typology_id'				=> $typology_id,
			'typology_name'				=> $typology_name,
			'order'						=> $order_value,
			'active_in_thesaurus'		=> $active_in_thesaurus
		];
	}//end row_to_element



	/**
	* PARSE_SECTION_RECORD_TO_JER_DD_RECORD
	* Build every component in the section given ($section_tipo, $section_id).
	* Get the component_data and parse as column of jer_dd format.
	* @param string $section_tipo
	* @param string|int $section_id
	* @return object|null $jer_dd_record
	* 	returns null if section tld value is empty
	* @test true
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
			// tld is mandatory! if tld_data is empty stop the process
			if(empty($tld_data)){
				debug_log(__METHOD__
					. " Ignored record because tld value (ontology7) is empty (mandatory) " . PHP_EOL
					. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
					. ' section_id: ' . to_string($section_id)
					, logger::ERROR
				);
				return null;
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

			if( empty($parent_data) || empty($parent_data[0]) ){
				// main dd nodes exception
				if( $terminoID==='dd1' || $terminoID==='dd2' ){
					debug_log(__METHOD__
						. " Record without parent data " . PHP_EOL
						. 'section_tipo	: ' . to_string($section_tipo). PHP_EOL
						. 'section_id	: ' . to_string($section_id). PHP_EOL
						. 'parent_tipo	: ' . to_string($parent_tipo). PHP_EOL
						. 'parent_data	: ' . to_string($parent_data)
						, logger::WARNING
					);
				}else{
					debug_log(__METHOD__
						. " Record without parent data " . PHP_EOL
						. 'section_tipo	: ' . to_string($section_tipo). PHP_EOL
						. 'section_id	: ' . to_string($section_id). PHP_EOL
						. 'parent_tipo	: ' . to_string($parent_tipo). PHP_EOL
						. 'parent_data	: ' . to_string($parent_data)
						, logger::ERROR
					);
				}

			}else{

				// get the parent data
				// use the locator
				$parent_locator	= $parent_data[0];
				$parent = ( $parent_locator->section_tipo !== DEDALO_ONTOLOGY_SECTION_TIPO )
					? ontology::get_term_id_from_locator($parent_locator)
					: null; // main root nodes of the ontology dd1 and dd2
				$jer_dd_record->set_parent( $parent );
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
			$is_model = $is_model ?? 'no';

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

			if( empty($model_data) ){

				if ( $is_model === 'no' ) {
					debug_log(__METHOD__
						. " Record without model " . PHP_EOL
						. 'section_tipo	: ' . to_string($section_tipo). PHP_EOL
						. 'section_id	: ' . to_string($section_id). PHP_EOL
						. 'model_tipo	: ' . to_string($model_tipo). PHP_EOL
						. 'is_model	: ' . to_string($is_model)
						, logger::ERROR
					);
				}

			}else{

				// set the model tipo as (dd6, dd3, etd.)
				// using the locator of the component
				// model will be the term_id (section_tipo & section_id)
				$model_locator = reset($model_data);
				$model_tipo_resolution = ontology::get_term_id_from_locator($model_locator);
				$jer_dd_record->set_modelo( $model_tipo_resolution );
				// set the model resolution (section, component_input_text, etc)
				$model_resolution = RecordObj_dd::get_termino_by_tipo(
					$model_tipo_resolution,
					DEDALO_STRUCTURE_LANG,
					true,
					false
				);
				$jer_dd_record->set_model( $model_resolution );
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

		// order
			if( !empty($parent_locator) ){
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
			}

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

		// relations
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

			if( !is_empty_dato( $properties_v5_data ) ){
				$properties_v5 = json_encode( $properties_v5_data[0] );

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

			if( !empty($term_data) && !empty(get_object_vars($term_data)) ){
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
	* @return string|null $term_id
	* @test true
	*/
	public static function get_term_id_from_locator( object $locator ) : ?string {

		// get the tld from main ontology of the locator section_tipo
		$tld = ontology::map_target_section_tipo_to_tld( $locator->section_tipo );

		// check if the node exist and it get data to resolve the tld
		// if not, try to get the tld from the main ontology definition.
		if( empty($tld) ){

			debug_log(__METHOD__
				. " Empty tld from locator " . PHP_EOL
				. 'locator: ' . to_string( $locator )
				. 'The section_tipo needs to exist in the main ontology!'
				, logger::WARNING
			);

			// get the component data
			// using the locator
			$tld_tipo		= 'ontology7';
			$tld_model		= RecordObj_dd::get_modelo_name_by_tipo( $tld_tipo );
			$tld_component	= component_common::get_instance(
				$tld_model,
				$tld_tipo ,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);

			$tld = $tld_component->get_dato()[0] ?? null;

			if( empty($tld) ){

				debug_log(__METHOD__
					. " Empty tld from locator " . PHP_EOL
					. 'locator: ' . to_string($locator )
					, logger::ERROR
				);

				return null;
			}
		}

		$term_id = $tld . $locator->section_id;

		return $term_id;
	}//end get_term_id_from_locator



	/**
	* GET_ORDER_FROM_LOCATOR
	* Use the array of siblings to locate the given locator
	* order will be the position of the locator into the siblings array + 1
	* @param object $locator
	* @return int $order
	* @test true
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
	* @test true
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
	* Parses the section record and inserts it into jer_dd
	* If the target registry already exists, it is deleted and a new one is created.
	* @param string $section_tipo
	* @param string|int $section_id
	* @return string|null $term_id
	* 	returns null if section tld value is empty
	* @test true
	*/
	public static function insert_jer_dd_record( string $section_tipo, string|int $section_id ) : ?string {

		$jer_dd_record = ontology::parse_section_record_to_jer_dd_record( $section_tipo, $section_id );
		if (empty($jer_dd_record)) {
			debug_log(__METHOD__
				. " Error on get RecordObj_dd  " . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' section_id: ' . to_string($section_id) . PHP_EOL
				, logger::ERROR
			);
			return null;
		}

		$term_id = $jer_dd_record->insert();


		return $term_id;
	}//end insert_jer_dd_record



	/**
	* SET_RECORDS_IN_JER_DD
	* Insert a group of `matrix_ontology` records into `jer_dd`
	* use a SQO given to search the group and process it.
	* @param object $sqo
	* @return object $response
	* {
	* 	result : bool,
	* 	msg: string,
	* 	errors: array
	* }
	* @test true
	*/
	public static function set_records_in_jer_dd( object $sqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		$search = search::get_instance(
			$sqo, // object sqo
		);
		$search_response	= $search->search();
		$ar_records			= $search_response->ar_records;

		foreach ($ar_records as $current_record) {

			$section_tipo	= $current_record->section_tipo;
			$section_id		= $current_record->section_id;

			if ($section_tipo===self::$main_section_tipo) {
				// main_ontology records

				$tld			= ontology::get_main_tld($section_id, $section_tipo);
				$typology_id	= ontology::get_main_typology_id($tld);
				$name_data		= ontology::get_main_name_data($tld);
				$term_id		= ontology::create_jer_dd_ontology_section_node((object)[
					'tld'					=> $tld,
					'typology_id'			=> $typology_id,
					'name_data'				=> $name_data,
					'parent_grouper_tipo'	=> 'ontologytype' . $typology_id
				]);

			}else{
				// regular matrix_ontology_records
				$term_id = ontology::insert_jer_dd_record( $section_tipo, $section_id );
			}

			if( empty($term_id ) ){
				$response->errors[] = 'Failed insert into jer_dd with section_tipo: ' . $section_tipo .' section_id: '. $section_id;
			}
		}

		if( empty($response->errors) ){
			$response->result	= true;
			$response->msg		= 'OK. Request done successfully [set_records_in_jer_dd] ' .to_string($sqo->section_tipo);
			$response->total	= count($ar_records);
		}

		return $response;
	}//end set_records_in_jer_dd



	/**
	* REGENERATE_RECORDS_IN_JER_DD
	* Insert a group of `matrix_ontology` records into `jer_dd`
	* use a given SQO to search the group and process it.
	* @param array $tld
	* @return object $response
	* @test true
	*/
	public static function regenerate_records_in_jer_dd( array $tld ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// create a copy of the $tld
			$backup = RecordObj_dd::create_bk_table( $tld );

			if($backup===false){
				$response->errors[] ='Impossible to create the jer_dd backup previous to regenerate the tlds: '.to_string( $tld );
				return $response;
			}

		// get all section_tipo from tld
			$section_tipo = array_map( function($el) {
				return ontology::map_tld_to_target_section_tipo($el);
			}, $tld );

		// 1 search all nodes as matrix records
			$sqo = new search_query_object();
				$sqo->set_section_tipo( $section_tipo );
				$sqo->limit = 0;

			$search = search::get_instance(
				$sqo, // object sqo
			);
			$search_response	= $search->search();
			$ar_records			= $search_response->ar_records;

		// 2 create the jer_dd nodes of all matrix records
			$jer_dd_records = [];
			foreach ($ar_records as $current_record) {

				$current_section_tipo	= $current_record->section_tipo;
				$current_section_id		= $current_record->section_id;

				$jer_dd_record = ontology::parse_section_record_to_jer_dd_record( $current_section_tipo, $current_section_id );

				if( empty($jer_dd_record ) ){
					RecordObj_dd::delete_bk_table();
					$response->errors[] = 'Failed regenerate jer_dd with section_tipo: ' . $current_section_tipo .' section_id: '. $current_section_id;
					debug_log(__METHOD__
						. " Error generating jer_dd with section_tipo " . PHP_EOL
						. ' current_section_tipo: ' . to_string($current_section_tipo) . PHP_EOL
						. ' current_section_id: ' . to_string($current_section_id)
						, logger::ERROR
					);
					return $response;
				}

				$jer_dd_records[] = $jer_dd_record;
			}

		// 3 add new main section for every tld (regenerate the main section)
			foreach ($tld as $current_tld) {

				// get the information to create the main section
				$typology_id	= ontology::get_main_typology_id( $current_tld );
				$name_data		= ontology::get_main_name_data( $current_tld );

				$file_item = new stdClass();
					$file_item->tld			= $current_tld;
					$file_item->typology_id	= $typology_id ?? null;
					$file_item->name_data	= $name_data ?? null;

				// add main section and records
				$add_result = ontology::add_main_section( $file_item );
				if (empty($add_result)) {
					$response->errors[] = 'Failed add_main_section file_item: ' . to_string($file_item);
					debug_log(__METHOD__
						. " Error creating ontology main section " . PHP_EOL
						. ' add_result: ' . to_string($add_result) . PHP_EOL
						. ' file_item: ' . to_string($file_item)
						, logger::ERROR
					);
					return $response;
				}
			}

		// 4 delete jer_dd nodes (all tld records in jer_dd)
			foreach ($tld as $current_tld) {
				// delete all tld records
				RecordObj_dd::delete_tld_nodes( $current_tld );
			}

		// 5 insert the new nodes of the given tld
			$total_insert = 0;
			foreach ($jer_dd_records as $jer_dd_record) {

				$insert_result = $jer_dd_record->insert();

				// error inserting
				// recovery al tld from bk table.
				if( empty($insert_result) ){
					RecordObj_dd::restore_from_bk_table($tld);
					$response->errors[] = 'Failed inserting jer_dd restoring previous data in jer_dd';
					// delete bk table
					RecordObj_dd::delete_bk_table();
					return $response;
				}

				$total_insert++;
			}

		// response
			if( empty($response->errors) ){
				$response->result	= true;
				$response->msg		= 'OK. Request done successfully';
			}
			// total_insert jer_dd records
			$response->total_insert = $total_insert;


		return $response;
	}//end regenerate_records_in_jer_dd



	/**
	* DELETE_MAIN
	* Resolves ontology TLD from main record value and
	* deletes all ontology records.
	* It deletes given main section and deletes all ontology records in
	* `matrix_ontology` and `jer_dd` with the main `tld`.
	* Therefore, removes all references to the tld of the main ontology or hierarchy.
	* It is used to update the ontology.
	* @param object $options
	* Sample:
	* {
	* 	section_id : 8,
	* 	section_tipo : 'ontology35'
	* }
	* @return object $response
	* @test true
	*/
	public static function delete_main(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];

		// options
			$section_id		= $options->section_id;
			$section_tipo	= $options->section_tipo;

		// tld. Resolves tld value from ontology_main record (field 'hierarchy6')
			$tld = ontology::get_main_tld($section_id, $section_tipo);

		// check if the tld ontology is empty
			if( empty($tld) ){
				$response->msg .= "Empty tld on get_main_tld($section_id, $section_tipo)";
				$response->errors[] = 'Empty tld';
				return $response;
			}

		// delete the virtual section
			$response = ontology::delete_ontology( $tld );


		return $response;
	}//end delete_main



	/**
	* GET_MAIN_TLD
	* Get the tld, in lowercase, of the hierarchy main section (ontology35 | hierarchy1)
	* @param int|string $section_id
	* @param string $section_tipo
	* @return string $tld
	* @test true
	*/
	public static function get_main_tld(string|int $section_id, string $section_tipo) : ?string {

		// tld
			$tld_tipo	= DEDALO_HIERARCHY_TLD2_TIPO;	// 'hierarchy6';
			$model_name	= RecordObj_dd::get_modelo_name_by_tipo($tld_tipo, true);
			$component	= component_common::get_instance(
				$model_name,
				$tld_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);
			$dato		= $component->get_dato();
			$first_dato	= $dato[0] ?? null;

			// empty case
			if (empty($first_dato)) {
				return null;
			}

		// always in lowercase
			$tld = strtolower( $first_dato );


		return $tld;
	}//end get_main_tld



	/**
	* GET_MAIN_TYPOLOGY_ID
	* get the main section from the given tld
	* create the typology component and get his data
	* with his data get the `section_id` as `typology_id`
	* if typology component has not data use the 15 ( others ) as `typology_id`
	* @param string $tld
	* @return int|null $typology_id
	* @test true
	*/
	public static function get_main_typology_id( string $tld ) : ?int {

		$default_typology = 15; // others typology

		// get main record
			$main_record = ontology::get_ontology_main_from_tld( $tld );
			if (empty($main_record)) {
				debug_log(__METHOD__
					. " Empty main record for tld " . PHP_EOL
					. ' tld: ' . to_string($tld)
					, logger::ERROR
				);
				return null;
			}

		// Typology component
			$tipo		= DEDALO_HIERARCHY_TYPOLOGY_TIPO;
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$main_record->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$main_record->section_tipo
			);
			$typology_data = $component->get_dato();

		// use section_id as typology_id if empty data use 15 as default (others)
		$typology_id = isset($typology_data[0])
			? (int)$typology_data[0]->section_id
			: $default_typology;


		return $typology_id;
	}//end get_main_typology_id



	/**
	* GET_MAIN_NAME_DATA
	* Get the main section from the given tld
	* create the name component and get his full data (all languages)
	* return his full data as `name_data`
	* name_data is used to insert has name / term of other nodes that clone his values.
	* @param string $tld
	* @return object|null $name_data
	* sample:
	* {
	* 	"lg-spa": ["Test | test"],
	* 	"lg-eng": ["Test | test"]
	* }
	* @test true
	*/
	public static function get_main_name_data( string $tld ) : ?object {

		// get main record
			$main_record = ontology::get_ontology_main_from_tld( $tld );
			if (empty($main_record)) {
				debug_log(__METHOD__
					. " Empty main record for tld " . PHP_EOL
					. ' tld: ' . to_string($tld)
					, logger::ERROR
				);
				return null;
			}

		// Name component
			$tipo		= DEDALO_HIERARCHY_TERM_TIPO;
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$main_record->section_id,
				'list',
				DEDALO_DATA_LANG,
				$main_record->section_tipo
			);
			$name_data = $component->get_dato_full();


		return $name_data;
	}//end get_main_name_data



	/**
	* DELETE_ONTOLOGY
	* Delete all ontology references with `tld` given.
	* Remove the `matrix_ontology` and `jer_dd` nodes of given `tld`
	* It also delete the main ontology section.
	* @param string $tld
	* @return object $response
	* {
	* 	result: bool,
	* 	msg: string,
	* 	errors: array
	* }
	*/
	public static function delete_ontology( string $tld ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. ';
			$response->errors	= [];

		// remove any other things than tld.
			$safe_tld = safe_tld( $tld );

		// 1 Delete the jer_dd nodes
			$deleted_jer_dd = RecordObj_dd::delete_tld_nodes( $safe_tld );

			if ( $deleted_jer_dd===false ) {
				$response->errors[] = 'unable to delete tld';
				$response->msg .= 'Error deleting jer_dd [1] for the tld: '.$tld;
				return $response;
			}

		// 2 Delete main section
			// get main section for this tld
			$main_section = ontology::get_ontology_main_from_tld( $safe_tld );

			if ( empty($main_section) ) {
				$response->errors[] = 'unable to get main_section from tld';
				$response->msg .= 'Error deleting jer_dd [2] for the tld: '.$tld;
				return $response;
			}

			$main_sections = sections::get_instance( null, null );

			$options = new stdClass();
				$options->delete_mode				= 'delete_record';
				$options->section_tipo				= $main_section->section_tipo;
				$options->section_id				= $main_section->section_id;
				$options->delete_diffusion_records	= true;
				$options->delete_with_children		= true;
				$options->prevent_delete_main		= true; // prevent infinite loop
			$delete_main_response = $main_sections->delete( $options );

			if ( $delete_main_response->result===false ) {
				return $delete_main_response;
			}

		// 3 Delete all ontology nodes (records) in matrix_ontology
			$nodes_section_tipo = ontology::map_tld_to_target_section_tipo( $safe_tld );

			$nodes_sqo = new search_query_object();
				$nodes_sqo->set_section_tipo( [$nodes_section_tipo] );
				$nodes_sqo->set_limit( 0 );

			// Delete all nodes of the section
			$nodes_sections = sections::get_instance( null, null );

			$options = new stdClass();
				$options->delete_mode				= 'delete_record';
				$options->section_tipo				= $nodes_section_tipo;
				$options->sqo						= $nodes_sqo;
				$options->delete_diffusion_records	= true;
				$options->delete_with_children		= true;
				$options->prevent_delete_main		= true; // prevent infinite loop
			$delete_nodes_response = $nodes_sections->delete( $options );

			if ( $delete_nodes_response->result===false ) {
				return $delete_nodes_response;
			}

		// 4 delete counter
			counter::modify_counter(
				$safe_tld.'0',
				'reset'
			);

		// response OK
			$response->result		= true;
			$response->delete_main	= $delete_main_response;
			$response->delete_nodes	= $delete_nodes_response;
			$response->msg			= count($response->errors)===0
				? 'OK. Request done successfully'
				: 'Warning. Request done with errors';


		return $response;
	}//end delete_ontology



	/**
	* JER_DD_VERSION_IS_VALID
	* This method is a temporal check for legacy ontologies.
	* It is used by updates.php to discriminate when display
	* update Ontology warning.
	* Uses date from term info like 'Dédalo 2024-12-31T00:00:00+01:00 Benimamet'
	* @param string $min_date
	* 	sample: '2025-12-31'
	* @return bool
	*/
	public static function jer_dd_version_is_valid( string $min_date ) : bool {

		// Ontology version. Check if is valid version
		$RecordObj_dd	= new RecordObj_dd('dd1', 'dd');
		$term			= $RecordObj_dd->get_term();
		$term_value		= $term->{DEDALO_STRUCTURE_LANG} ?? null;
		if (empty($term_value)) {
			debug_log(__METHOD__
				. " Unable to get date from dd1 term (1) " . PHP_EOL
				. ' term: ' . to_string($term)
				, logger::ERROR
			);
			return false;
		}

		// Get date from term info (previous 6.4 versions)
		// sample: 'Dédalo 2024-12-31T00:00:00+01:00 Benimamet'
		preg_match('/[0-9]{4}-[0-9]{2}-[0-9]{2}/', $term_value, $output_array);

		$date = $output_array[0] ?? ''; // as 2024-11-24
		if (empty($date)) {
			debug_log(__METHOD__
				. " Unable to get date from dd1 term (2) " . PHP_EOL
				. ' term_value: ' . to_string($term_value)
				, logger::ERROR
			);
			return false;
		}

		$ontology_date	= new DateTime($date);
		$min_datetime	= new DateTime($min_date);

		if ($ontology_date < $min_datetime) {
			return false;
		}


		return true;
	}//end jer_dd_version_is_valid



}//end ontology
