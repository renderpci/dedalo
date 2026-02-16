<?php declare(strict_types=1);
/**
* ONTOLOGY
* Manages the main ontology definitions of Dédalo.
*/
class ontology {



	// Table where ontology data is stored
	public static $main_table			= 'matrix_ontology_main';
	public static $main_section_tipo	= DEDALO_ONTOLOGY_SECTION_TIPO; // 'ontology35';

	// children_tipo (component_relation_children)
	public static $children_tipo = 'ontology14';

	// cache
	public static $cache_ontology_sections;
	public static $active_ontology_elements_cache;


	/**
	* CREATE_ONTOLOGY_RECORDS
	* Iterate all given $dd_ontology_rows and creates a section matrix row for each one.
	* This is used to recover editable data from parsed table 'dd_ontology' former 'jer_dd'.
	* @see transform_data::generate_all_main_ontology_sections
	* @param array $dd_ontology_rows
	* @return bool
	* @test true
	*/
	public static function create_ontology_records( array $dd_ontology_rows ) : bool {

		foreach ($dd_ontology_rows as $dd_ontology_row) {

			$id = get_section_id_from_tipo( $dd_ontology_row->tipo );
			// Skip main section of the tld.
			// main section is defined with the tld  + 0 as dd0,rsc0, etc.
			// this definition will be stored in ontology main
			// therefore, don't save it into matrix tables,
			// it will create a mistake section with section_id = 0 and section_tipo as 'dd0'
			// as well as section_tipo is fine with 'dd0' section_id can not be 0 in any case.
			if( $id==='0' ){
				continue;
			}

			$result = self::add_section_record_from_dd_ontology( $dd_ontology_row );
			if (!$result) {
				debug_log(__METHOD__
					. " Error adding section " . PHP_EOL
					. ' dd_ontology_row: ' . to_string($dd_ontology_row)
					, logger::ERROR
				);
			}
		}


		return true;
	}//end create_ontology_records



	/**
	* ADD_SECTION_RECORD_FROM_DD_ONTOLOGY
	* Transforms dd_ontology row (former 'jer_dd') from DDBB into matrix ontology row (section record).
	* @param object $dd_ontology_row
	* Sample:
		* {
		*	"id": "16028305",
		*	"tipo": "test102",
		*	"parent": "test45",
		* 	"term": "{\"lg-spa\": \"section_id\"}"
		*	"model_tipo": "dd1747",
		*	"is_model": false,
		*	"order_number": "28",
		*	"tld": "test",
		*	"is_translatable": false,
		*	"relations": "null",
		*	"propiedades": null,
		*	"properties": null,
		*
		* }
	* @param string $target_section_tipo
	* @return bool
	* @test true
	*/
	public static function add_section_record_from_dd_ontology( object $dd_ontology_row ) : bool {

		// vars
		$tld					= $dd_ontology_row->tld;
		$target_section_tipo	= self::map_tld_to_target_section_tipo( $tld );
		$node_tipo				= $dd_ontology_row->tipo;
		$parent					= $dd_ontology_row->parent;
		$model					= $dd_ontology_row->model_tipo;
		$is_model				= $dd_ontology_row->is_model;
		$translatable			= $dd_ontology_row->is_translatable;
		$relations				= !empty ( $dd_ontology_row->relations )
			? (json_handler::decode( $dd_ontology_row->relations ) ?? [])
			: [];
		$properties_v5			= !empty ( $dd_ontology_row->propiedades ) ? json_decode( $dd_ontology_row->propiedades ) : null;
		$properties				= !empty ( $dd_ontology_row->properties ) ? json_decode( $dd_ontology_row->properties ) : new stdClass();
		$term					= !empty ( $dd_ontology_row->term ) ? json_decode( $dd_ontology_row->term ) : new stdClass();


		// get the section_id from the node_tipo: oh1 = 1, rsc197 = 197, etc.
		$section_id = (int)get_section_id_from_tipo( $node_tipo );

		// Section, create new section
		$section = section::get_instance($target_section_tipo);
		$section->create_record((object)[
			'section_id' => $section_id // force creation with specific section_id
		]);

		// tld
			$tld_tipo		= 'ontology7';
			$tld_model		= ontology_node::get_model_by_tipo( $tld_tipo  );
			$tld_component	= component_common::get_instance(
				$tld_model,
				$tld_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);
			// @working here !
			$data = null;
			if(!empty($tld)){
				$value = new stdClass();
					$value->value = $tld;
				$data = [$value];
			}
			$tld_component->set_data( $data );
			$tld_component->save();

		// model. Get the model tld and id
			if( !empty($model) && $model!=='null' ){
				$model_section_id	= get_section_id_from_tipo( $model );
				$model_tld			= get_tld_from_tipo( $model );
				$model_section_tipo	= self::map_tld_to_target_section_tipo( $model_tld );

				$model_locator = new locator();
					$model_locator->set_section_tipo( $model_section_tipo );
					$model_locator->set_section_id( $model_section_id );

				$model_tipo			= 'ontology6';
				$model_model		= ontology_node::get_model_by_tipo( $model_tipo );
				$model_component	= component_common::get_instance(
					$model_model,
					$model_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$target_section_tipo
				);

				$data = empty($model_locator) ? null : [$model_locator];
				$model_component->set_data( $data );
				$model_component->save();
			}

		// descriptor
			//always with fixed data as yes, all ontology nodes are descriptors.
			$is_descriptor_tipo			= 'ontology4';
			$is_descriptor_model		= ontology_node::get_model_by_tipo( $is_descriptor_tipo  );
			$is_descriptor_component	= component_common::get_instance(
				$is_descriptor_model,
				$is_descriptor_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$descriptor_locator = new locator();
				$descriptor_locator->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO );
				$descriptor_locator->set_section_id( NUMERICAL_MATRIX_VALUE_YES );

			$data = [$descriptor_locator];
			$is_descriptor_component->set_data( $data );
			$is_descriptor_component->save();

		// is model
			$is_model_tipo		= 'ontology30';
			$is_model_model		= ontology_node::get_model_by_tipo( $is_model_tipo  );
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
				$is_model_locator->set_section_id($is_model ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$data = [$is_model_locator];
			$is_model_component->set_data( $data );
			$is_model_component->save();

		// translatable
			$translatable_tipo		= 'ontology8';
			$translatable_model		= ontology_node::get_model_by_tipo( $translatable_tipo  );
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
				$translatable_locator->set_section_id($translatable ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO);

			$data = [$translatable_locator];
			$translatable_component->set_data( $data );
			$translatable_component->save();

		// term
			$term_tipo		= 'ontology5';
			$term_model		= ontology_node::get_model_by_tipo( $term_tipo  );
			//build the term data
			$term_data = [];
			foreach ($term as $current_lang => $term_value) {
				$current_term_value = new stdClass();
					$current_term_value->lang 	= $current_lang;
					$current_term_value->value	= $term_value;

				$term_data[] = $current_term_value;
			}
			// create the component
			$term_component	= component_common::get_instance(
				$term_model,
				$term_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$target_section_tipo
			);
			// set its data and save
			$term_component->set_data( $term_data );
			$term_component->save();


		// properties V5
			$properties_v5_tipo			= 'ontology19';
			$properties_v5_model		= ontology_node::get_model_by_tipo( $properties_v5_tipo  );
			$properties_v5_component	= component_common::get_instance(
				$properties_v5_model,
				$properties_v5_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$dato = empty($properties_v5) ? null : [$properties_v5];
			$properties_v5_component->set_dato( $dato );
			$properties_v5_component->Save();

		// properties CSS
			$properties_css_tipo		= 'ontology16';
			$properties_css_model		= ontology_node::get_model_by_tipo( $properties_css_tipo  );
			$properties_css_component	= component_common::get_instance(
				$properties_css_model,
				$properties_css_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$properties_css = $properties->css ?? null;

			$data = [$properties_css];
			$properties_css_component->set_data( $data );
			$properties_css_component->save();

		// properties RQO
			$properties_rqo_tipo		= 'ontology17';
			$properties_rqo_model		= ontology_node::get_model_by_tipo( $properties_rqo_tipo  );
			$properties_rqo_component	= component_common::get_instance(
				$properties_rqo_model,
				$properties_rqo_tipo ,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$properties_rqo = $properties->source ?? null;

			$data = [$properties_rqo];
			$properties_rqo_component->set_data( $data );
			$properties_rqo_component->save();

		// properties
			$properties_tipo		= 'ontology18';
			$properties_model		= ontology_node::get_model_by_tipo( $properties_tipo  );
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
			// in 6.4 his definition change to be a `show` object with a `ddo_map` as others
			// if($model === 'dd144' && !empty($properties) && is_array($properties) ){

			// 	// generate the new objects and assign the old properties
			// 	$new_properties = new stdClass();
			// 		$new_properties->show = new stdClass();
			// 		$new_properties->show->ddo_map = $properties;

			// 	$properties = $new_properties;

			// 	// update dd_ontology record with the new properties
			// 	$ontology_node = ontology_node::get_instance($dd_ontology_row->tipo);
			// 	$ontology_node->get_properties(); // force load data
			// 	$ontology_node->set_properties($new_properties);
			// 	$ontology_node->update();
			// }

			if(!empty($properties)) {
				$properties_general = new stdClass();
				foreach ($properties as $pkey => $pvalue) {
					if ($pkey==='source' || $pkey==='css') {
						continue;
					}
					$properties_general->{$pkey} = $pvalue->value ?? null;
				}
				$properties_general_value = [$properties_general];
			}

			$properties_component->set_data( $properties_general_value ?? null );
			$properties_component->save();


		return true;
	}//end add_section_record_from_dd_ontology



	/**
	* GET_ONTOLOGY_MAIN_FROM_TLD
	* Find the matrix record ('matrix_ontology_main' table) of ontology main from a given tld
	* sample: dd --> section_tipo: ontology35, section_id: 1
	* @param string $tld
	* @return object|null $row
	* @test true
	*/
	public static function get_ontology_main_from_tld( string $tld ) : ?object {

		// set a safe tld to avoid SQL injection attacks (only alphanumeric and hyphen)
		$tld 		= trim(strtolower($tld));
		$safe_tld 	= safe_tld( $tld );

		if(empty($safe_tld)) {
			debug_log(__METHOD__
			   .' Ignored invalid tld' . PHP_EOL
			   .' tld: ' . to_string($tld)
			   , logger::ERROR
			);
			return null;
		}

		// params
		$params = [
			self::$main_section_tipo,
			'{"'.DEDALO_HIERARCHY_TLD2_TIPO.'": [{"value": "'.$safe_tld.'"}]}'
		];

		// SQL query
		$sql  = 'SELECT section_id, section_tipo ' . PHP_EOL;
		$sql .= 'FROM '. self::$main_table . PHP_EOL;
		$sql .= 'WHERE section_tipo = $1 AND' . PHP_EOL;
		$sql .= 'string @> $2' . PHP_EOL;
		$sql .= 'LIMIT 1;';

		// search
		$result = matrix_db_manager::exec_search($sql, $params);
		if ($result === false) {
			return null;
		}
		$row = pg_fetch_object($result);


		return $row !== false ? $row : null;
	}//end get_ontology_main_from_tld



	/**
	* GET_ONTOLOGY_MAIN_FORM_TARGET_SECTION_TIPO
	* Find the matrix row of the ontology main ('matrix_ontology_main' table) from a given target section tipo as ontology matrix row
	* sample: ontology45 --> section_tipo: ontology35, section_id: 4
	* @param string $target_section_tipo
	* @return object|null $row
	* @test true
	*/
	public static function get_ontology_main_form_target_section_tipo( string $target_section_tipo ) : ?object {

		// set a safe tipo to avoid SQL injection attacks (only alphanumeric and hyphen)
		$target_section_tipo = trim(strtolower($target_section_tipo));
		$safe_tipo = safe_tipo( $target_section_tipo );

		if(empty($safe_tipo)) {
			debug_log(__METHOD__
			   .' Ignored invalid target section tipo' . PHP_EOL
			   .' target_section_tipo: ' . to_string($target_section_tipo)
			   , logger::ERROR
			);
			return null;
		}

		// params
		$params = [
			self::$main_section_tipo,
			'{"'.DEDALO_HIERARCHY_TARGET_SECTION_TIPO.'": [{"value": "'.$safe_tipo.'"}]}'
		];

		// SQL query
		$sql  = 'SELECT section_id, section_tipo ' . PHP_EOL;
		$sql .= 'FROM '. self::$main_table . PHP_EOL;
		$sql .= 'WHERE section_tipo = $1 AND' . PHP_EOL;
		$sql .= 'string @> $2' . PHP_EOL;
		$sql .= 'LIMIT 1;';

		// search
		$result = matrix_db_manager::exec_search($sql, $params);
		if ($result === false) {
			return null;
		}
		$row = pg_fetch_object($result);


		return $row !== false ? $row : null;
	}//end get_ontology_main_form_target_section_tipo



	/**
	* ASSIGN_RELATIONS_FROM_DD_ONTOLOGY
	* Once the matrix records of dd_ontology parse is set,
	* it is possible to assign the relations between nodes.
	* Get the relations column in dd_ontology and set it as component_portal locator pointed to other matrix ontology record.
	* @param string $tld
	* @return bool
	* @test true
	*/
	public static function assign_relations_from_dd_ontology( string $tld ) : bool {

		// set a safe tld to avoid SQL injection attacks (only alphanumeric and hyphen)
		$tld 		= trim(strtolower($tld));
		$safe_tld 	= safe_tld( $tld );

		if(empty($safe_tld)) {
			debug_log(__METHOD__
			   .' Ignored invalid tld' . PHP_EOL
			   .' tld: ' . to_string($tld)
			   , logger::ERROR
			);
			return false;
		}

		// target_section_tipo
		$target_section_tipo = self::map_tld_to_target_section_tipo( $safe_tld );

		// get all section instances rows
		$all_section_instances = section::get_resource_all_section_records_unfiltered( $target_section_tipo );
		if (!$all_section_instances) {
			debug_log(__METHOD__
			   .' Error on get resource_all_section_records' . PHP_EOL
			   .' target_section_tipo: ' . to_string($target_section_tipo)
			   , logger::ERROR
			);
			return false;
		}

		while ($row = pg_fetch_assoc($all_section_instances)) {

			$section_id = $row['section_id'];

			$node_tipo = $tld.$section_id;
			$relations = ontology_node::get_relation_nodes( $node_tipo, true, true );

			// Relations
			$relations_tipo			= DEDALO_ONTOLOGY_CONNECTED_TO_TIPO; // 'ontology10' component_autocomplete_hi;
			$relations_model		= ontology_node::get_model_by_tipo( $relations_tipo  );
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

			$relations_component->set_data( $related_locators );
			$relations_component->save();
		}


		return true;
	}//end assign_relations_from_dd_ontology



	/**
	* REORDER_NODES_FROM_DD_ONTOLOGY
	* Once the matrix records of dd_ontology parse is set
	* is possible assign the order between nodes.
	* Find the ontology nodes as matrix rows and order by the dd_ontology definition.
	* @param string $tld
	* @return bool
	* @test true
	*/
	public static function reorder_nodes_from_dd_ontology( string $tld ) : bool {

		// set a safe tld to avoid SQL injection attacks (only alphanumeric and hyphen)
		$tld 		= trim(strtolower($tld));
		$safe_tld 	= safe_tld( $tld );

		if(empty($safe_tld)) {
			debug_log(__METHOD__
			   .' Ignored invalid tld' . PHP_EOL
			   .' tld: ' . to_string($tld)
			   , logger::ERROR
			);
			return false;
		}

		// vars
		$target_section_tipo = self::map_tld_to_target_section_tipo( $safe_tld );

		// get all section
		$all_section_instances = section::get_resource_all_section_records_unfiltered( $target_section_tipo );
		if (!$all_section_instances) {
			debug_log(__METHOD__
			   .' Error on get resource_all_section_records' . PHP_EOL
			   .' tld: ' . to_string($tld) . PHP_EOL
			   .' target_section_tipo: ' . to_string($target_section_tipo)
			   , logger::ERROR
			);
			return false;
		}

		while ($row = pg_fetch_assoc($all_section_instances)) {

			$section_id	= $row['section_id'];
			$node_tipo	= $tld.$section_id;
			$children	= ontology_node::get_ar_children($node_tipo);

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

			$children_tipo		= ontology::$children_tipo; // 'ontology14' component_relation_children;
			$children_model		= ontology_node::get_model_by_tipo( $children_tipo );
			$children_component	= component_common::get_instance(
				$children_model,
				$children_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$target_section_tipo
			);

			$children_component->set_data($children_data);
			$children_component->save();
		}


		return true;
	}//end reorder_nodes_from_dd_ontology



	/**
	* ADD_MAIN_SECTION
	* Creates a new section in the main ontology sections (table 'matrix_ontology_main') if not already exists.
	* The main section could be the official tlds as dd, rsc, hierarchy, etc.
	* or local ontology defined by every institution as es, qdp, mupreva, etc
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
				}
			}

		// Name fallback
			if( empty($name_data) ){
				$name_data = [(object)[
					"id"	=> 1,
					"lang" 	=> DEDALO_STRUCTURE_LANG,
					"value" => $tld
				]];
			}

		// check if the main tld already exists
			$row_ontology_main = self::get_ontology_main_from_tld( $tld );

		// if main section exist update it, else create new one
			$main_section_id = ( !empty($row_ontology_main) )
				? $row_ontology_main->section_id
				: null ;

		// If the main section doesn't exists create new record using section
			if($main_section_id===null){
				$main_section = section::get_instance(
					self::$main_section_tipo // string section_tipo
				);
				$main_section_id = $main_section->create_record();
			}
		// create the main section_record
			$section_record = section_record::get_instance(self::$main_section_tipo, (int)$main_section_id);

		// Project
			$tipo 	= DEDALO_HIERARCHY_FILTER_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_FILTER ); // dd675
				$component_data->set_section_tipo( DEDALO_SECTION_PROJECTS_TIPO ); // dd153
				$component_data->set_section_id( '1' );
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Thesaurus active
			$tipo 	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$ts_active_data = new locator();
				$ts_active_data->set_id( 1 );
				$ts_active_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$ts_active_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				// active in thesaurus. Set only dd as active to force to show in the thesaurus tree
				$ts_is_active = ($tld === 'dd') ? NUMERICAL_MATRIX_VALUE_YES : NUMERICAL_MATRIX_VALUE_NO; // only dd terms will be active by default, any other tld wil be no active, user can change it manually.
				$ts_active_data->set_section_id( $ts_is_active );
				$ts_active_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$ts_active_data]);

		// Language
			$tipo 	= DEDALO_HIERARCHY_LANG_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( 'lg1' );
				$component_data->set_section_id( '17344' ); // lg-spa, Spanish!
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Active
			$tipo 	= DEDALO_HIERARCHY_ACTIVE_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES ); // 1
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Name
			$tipo 	= DEDALO_HIERARCHY_TERM_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );

			if (!empty($name_data)) {
				if( is_object($name_data) ) {
					// v6 compatibility
					$fixed_value = [];
					foreach($name_data as $lang => $value) {
						$fixed_value[] = (object)[
							'id'    => 1,
							'lang'  => $lang,
							'value' => to_string($value)
						];
					}
					$name_data = $fixed_value;
				}

				$section_record->set_component_data($tipo, $column, $name_data);
			}

		// TLD
			$tipo 	= DEDALO_HIERARCHY_TLD2_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$tld_data = [(object)[
				'id'	=> 1,
				'lang' 	=> DEDALO_DATA_NOLAN,
				'value' => $tld
			]];

			$section_record->set_component_data($tipo, $column, $tld_data);

		// Target section tipo
			$tipo 	= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );

			$target_section_tipo_data = [(object)[
				'id'	=> 1,
				'lang' 	=> DEDALO_DATA_NOLAN,
				'value' => $target_section_tipo
			]];

			$section_record->set_component_data($tipo, $column, $target_section_tipo_data);

		// Typology
			if( !empty($typology_id) ){
				$tipo 	= DEDALO_HIERARCHY_TYPOLOGY_TIPO;
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );

				$typology_data = new locator();
					$typology_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
					$typology_data->set_section_tipo( DEDALO_HIERARCHY_TYPES_SECTION_TIPO );
					$typology_data->set_section_id( $typology_id );
					$typology_data->set_from_component_tipo( DEDALO_HIERARCHY_TYPOLOGY_TIPO );

				$section_record->set_component_data($tipo, $column, [$typology_data]);
			}

		// add model root node in the dd main section only. Note that only dd has the models for the ontology.
			if($tld === 'dd'){

				$tipo 	= DEDALO_HIERARCHY_CHILDREN_TIPO; // hierarchy45
				$model 	= ontology_node::get_model_by_tipo( $tipo );
				$column = section_record_data::get_column_name( $model );

				// general term
				$general_term = new locator();
					$general_term->set_type( DEDALO_RELATION_TYPE_CHILDREN_TIPO ); // dd48
					$general_term->set_section_tipo( $target_section_tipo );
					$general_term->set_section_id( '1' );
					$general_term->set_from_component_tipo( $tipo );

				// model term
				$model_term = new locator();
					$model_term->set_type( DEDALO_RELATION_TYPE_CHILDREN_TIPO ); // dd48
					$model_term->set_section_tipo( $target_section_tipo );
					$model_term->set_section_id( '2' );
					$model_term->set_from_component_tipo( $tipo );

				$section_record->set_component_data($tipo, $column, [$general_term, $model_term]);
			}

		// Save the section record
			if( !$section_record->save() ) {
				debug_log(__METHOD__
					. " Error saving section record " . PHP_EOL
					. ' main_section_id: ' . to_string($main_section_id)
					, logger::ERROR
				);
			}


		return $main_section_id;
	}//end add_main_section



	/**
	* CREATE_DD_ONTOLOGY_ONTOLOGY_SECTION_NODE
	* Creates/Updates a dd_ontology row with ontologytype tld for the local tlds
	* Used for the creation of matrix ontology sections with local ontologies as es1, qdp1, mdcat1, etc.
	* A dd_ontology row is needed to represent it.
	* Note that action 'ontology_node->insert()' UPSERT the existing record in dd_ontology.
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
	public static function create_dd_ontology_ontology_section_node( object $file_item ) : string|false|null {

		// file item properties
			$tld					= $file_item->tld;
			$typology_id			= $file_item->typology_id ?? null;
			$name_data				= $file_item->name_data ?? null;
			$parent_grouper_tipo	= $file_item->parent_grouper_tipo ?? null;

		// Typology fallback
			if( empty($typology_id) ){
				$typology_locator = hierarchy::get_typology_locator_from_tld( $tld );
				$typology_id = !empty($typology_locator) ? (int)$typology_locator->section_id : 15;
			} else {
				$typology_id = (int)$typology_id;
			}

		// Name fallback
			if( empty($name_data) ){
				$name_data = [(object)[
					"lang" 	=> DEDALO_STRUCTURE_LANG,
					"value" => $tld
				]];
			}

		// create the parent group node
		// if parent group is given, will use it, else create the parent_gruper to build the nodes.
			if( empty($parent_grouper_tipo) ){
				// parent group is set with his typology
				// if typology is not set it will assign to typology 15 `others`
				$parent_grouper_tipo = ontology::create_parent_grouper( 'ontology40', 'ontologytype', $typology_id );
			}

		// Ontology section for the given tld
		// ontology section is the main or root node used to create the ontology nodes.
		// it is defined as tld+0, because the nodes start with 1 as dd1, rsc1, etc.
			$tipo = $tld.'0'; // as mdcat0, mupreva0, etc.

			$ontology_node = ontology_node::get_instance($tipo);
				$ontology_node->set_parent($parent_grouper_tipo);
				$ontology_node->set_model_tipo(SECTION_MODEL); // Use constant 'dd6'
				$ontology_node->set_model('section');
				$ontology_node->set_is_model(false);
				$ontology_node->set_tld($tld);
				$ontology_node->set_is_translatable(false);
				$ontology_node->set_relations([
					(object)['tipo' => 'ontology1'],
					(object)['tipo' => 'dd1201']
				]);

				// Properties, add main_tld as official tld definitions
				// and local section color
				$properties = new stdClass();
					$properties->main_tld	= $tld;
					$properties->color		= '#2d8894';
				$ontology_node->set_properties($properties);

				// term
				if (!empty($name_data)) {
					if( is_object($name_data) ) {
						// v6 compatibility
						$term = $name_data;
						// safe string conversion (v6 conversion issues)
						foreach($term as $lang => $value) {
							$term->{$lang} = to_string($value);
						}
					} else {
						$term = new stdClass();
						foreach ($name_data as $data_element) {
							$term->{$data_element->lang} = to_string($data_element->value);
						}
					}
					$ontology_node->set_term_data( $term );
				}

			// Insert into DDBB
			if (!$ontology_node->insert()) {
				debug_log(__METHOD__ . " Error inserting ontology node: $tipo", logger::ERROR);
				return false;
			}


		return $tipo;
	}//end create_dd_ontology_ontology_section_node



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
	* @return string|false $parent_grouper_tipo
	* @test true
	*/
	public static function create_parent_grouper( string $parent_group='ontology40', string $tld='ontologytype', int $typology_id=15 ) : string|false {

		// Ontology main section for the given tld
		// ontology section is the main or root node used to create the ontology nodes.
		// it is defined as tld+0, instead nodes that they start with 1 as dd1, rsc1, etc.
		// this node is create to manage the typology sections
			$suffix = ( $tld==='hierarchymtype' )
				? ' [m]'.' | '.$tld
				: ''.' | '.$tld;

			$name_data =[
				(object)[
					'lang' => 'lg-spa',
					'value' => ($tld==='ontologytype')
						? 'Tipologías de ontología'.$suffix
						: 'Tipologías de jerarquía'.$suffix
				],
				(object)[
					'lang' => 'lg-eng',
					'value' => ($tld==='ontologytype')
						? 'Ontology typologies'.$suffix
						: 'Hierarchy typologies'.$suffix
				],
				(object)[
					'lang' => 'lg-deu',
					'value' => ($tld==='ontologytype')
						? 'Ontologie-Typen'.$suffix
						: 'Typologien der Hierarchie'.$suffix
				],
				(object)[
					'lang' => 'lg-fra',
					'value' => ($tld==='ontologytype')
						? 'Types d\'ontologie'.$suffix
						: 'Typologies hiérarchiques'.$suffix
				],
				(object)[
					'lang' => 'lg-ita',
					'value' => ($tld==='ontologytype')
						? 'Tipi di ontologia'.$suffix
						: 'Tipologie di gerarchia'.$suffix
				],
				(object)[
					'lang' => 'lg-cat',
					'value' => ($tld==='ontologytype')
						? 'Tipus d\'ontologia'.$suffix
						: 'Tipus de jerarquies'.$suffix
				],
				(object)[
					'lang' => 'lg-ell',
					'value' => ($tld==='ontologytype')
						? 'Τύποι οντολογίας'.$suffix
						: 'Τυπολογίες ιεραρχίας'.$suffix
				]
			];

			$file_data = new stdClass();
				$file_data->tld					= $tld;
				$file_data->typology_id			= $typology_id;
				$file_data->name_data			= $name_data;
				$file_data->parent_grouper_tipo	= 'ontologytype14';// don't create parent grouper

			// create the main section (table 'matrix_ontology_main') - equivalent to hierarchy main section
			ontology::add_main_section( $file_data );

			// create dd_ontology node for the main section (table 'dd_ontology')
			ontology::create_dd_ontology_ontology_section_node( $file_data );

		// Check parent
		// parent nodes needs to exist because the node will store itself in the children component of his parent
		// the main instances of typology for ontology node is `ontology40`
		// the main instances of typology for hierarchy nodes is `hierarchy56`
		// the main instances of typology for hierarchy mocel nodes is hierarchy57`
			$parent_tld			= get_tld_from_tipo( $parent_group );
			$parent_section_id	= get_section_id_from_tipo( $parent_group );
			$parent_node_tipo	= $parent_tld.'0';

			// dd_ontology. Check if the parent already exists in 'dd_ontology' table
				$parent_node = ontology_node::get_instance( $parent_node_tipo );
				$parent_ontology_row_data = $parent_node->get_data();
				if( empty($parent_ontology_row_data) ){

					// set parent nodes
					// $ontology_node = ontology_node::get_instance($parent_node_tipo);
					$parent_node->set_parent($parent_group);
					$parent_node->set_model_tipo(SECTION_MODEL); // dd6
					$parent_node->set_model('section');
					$parent_node->set_is_model(false);
					$parent_node->set_tld($parent_tld);
					$parent_node->set_is_translatable(false);
					$parent_node->set_relations([
						(object)['tipo' => 'ontology1'],
						(object)['tipo' => 'dd1201']
					]);

					// Properties, add main_tld as official tld definitions
					// and local section color
						$properties = new stdClass();
							$properties->main_tld	= $parent_tld;
							$properties->color		= '#276f67';
						$parent_node->set_properties($properties);

					// insert dd_ontology record
					if (!$parent_node->insert()) {
						debug_log(__METHOD__ . " Error inserting parent group node in dd_ontology: $parent_node_tipo", logger::ERROR);
						return false;
					}
				}

			// matrix. Check if the parent already exists in matrix
			$found = false;
			// if parent_section_id is not null, check if the parent exists in matrix
			if($parent_section_id !== null){
				$section_record = section_record::get_instance( $parent_node_tipo, (int)$parent_section_id );
				$found = $section_record->exists_in_the_database();
			}
			// if parent_section does not exist in matrix, create it
			if( $found===false ){
				// create a section record in matrix
				$section = section::get_instance( $parent_node_tipo );
				$parent_section_id_created = $section->create_record( (object)[
					'section_id' => $parent_section_id ? (int)$parent_section_id : null
				]);
				if (!$parent_section_id_created) {
					debug_log(__METHOD__ . " Error creating parent group section record in matrix: $parent_node_tipo", logger::ERROR);
					return false;
				}
			}

		// matrix section of the typology node
			$section_tipo = $tld.'0'; // it can be: ontologytype0, hierarchytype0, hierarchymtype0

			if($typology_id === null){
				$typology_section = section::get_instance( $section_tipo );
				// create the record in matrix_ontology table.
				$typology_id = $typology_section->create_record();
				if (!$typology_id) {
					debug_log(__METHOD__ . " Error creating typology section record in matrix: $section_tipo", logger::ERROR);
					return false;
				}
			}

			$section_record = section_record::get_instance( $section_tipo, (int)$typology_id);

		// Publication (= Yes, by default)
			$tipo 	= DEDALO_ONTOLOGY_PUBLICATION_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES ); // 1
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Is descriptor (= Yes, by default)
			$tipo 	= DEDALO_ONTOLOGY_IS_DESCRIPTOR_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_YES ); // 1
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Model (= area, by default)
			$tipo 	= DEDALO_ONTOLOGY_MODEL_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( 'dd0' ); // DEDALO_ROOT_TIPO equivalent for section
				$component_data->set_section_id( '4' ); // area model root
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Translatable (= No, by default)
			$tipo 	= DEDALO_ONTOLOGY_TRANSLATABLE_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_NO ); // 2
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// Is model (= No, by default)
			$tipo 	= DEDALO_ONTOLOGY_IS_MODEL_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$component_data = new locator();
				$component_data->set_id( 1 );
				$component_data->set_type( DEDALO_RELATION_TYPE_LINK ); // dd151
				$component_data->set_section_tipo( DEDALO_SECTION_SI_NO_TIPO ); // dd64
				$component_data->set_section_id( NUMERICAL_MATRIX_VALUE_NO ); // 2
				$component_data->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$component_data]);

		// tld
			$tipo 	= DEDALO_ONTOLOGY_TLD_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );
			$tld_data = [(object)[
				'id'	=> 1,
				'lang' 	=> DEDALO_DATA_NOLAN,
				'value' => $tld
			]];

			$section_record->set_component_data($tipo, $column, $tld_data);

		// Name
			// use the typology name. (component_input_text)
			$model			= 'component_input_text'; // ontology_node::get_model_by_tipo( DEDALO_HIERARCHY_TYPES_NAME_TIPO, true );
			$typology_term	= component_common::get_instance(
				$model, // string model
				DEDALO_HIERARCHY_TYPES_NAME_TIPO, // string tipo
				$typology_id, // string section_id
				'list', // string mode
				DEDALO_DATA_LANG, // string lang
				DEDALO_HIERARCHY_TYPES_SECTION_TIPO // string section_tipo
			);

			$typology_term_full_data = $typology_term->get_data();
			$tipo 	= DEDALO_ONTOLOGY_TERM_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo );
			$column = section_record_data::get_column_name( $model );

			$section_record->set_component_data($tipo, $column, $typology_term_full_data);

		// parent
			$tipo 	= DEDALO_ONTOLOGY_PARENT_TIPO;
			$model 	= ontology_node::get_model_by_tipo( $tipo ) ?? 'component_relation_parent';
			$column = section_record_data::get_column_name( $model );
			$node_locator = new locator();
				$node_locator->set_type( DEDALO_RELATION_TYPE_PARENT_TIPO );
				$node_locator->set_section_id( $parent_section_id );
				$node_locator->set_section_tipo( $parent_node_tipo );
				$node_locator->set_from_component_tipo( $tipo );

			$section_record->set_component_data($tipo, $column, [$node_locator]);

		// save section record
			if (!$section_record->save()) {
				debug_log(__METHOD__ . " Error saving section record for parent grouper: $section_tipo id: $typology_id", logger::ERROR);
				return false;
			}

		// create the dd_ontology node
			if (!ontology::insert_dd_ontology_record( $section_tipo, $typology_id )) {
				debug_log(__METHOD__ . " Error inserting parent group node in dd_ontology: $parent_node_tipo", logger::ERROR);
				return false;
			}

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
				. ' tld: ' . to_string( $tld )
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
	* @return string|false $tld
	* @test true
	*/
	public static function map_target_section_tipo_to_tld( string $target_section_tipo ) : string|false {

		$tld = get_tld_from_tipo( $target_section_tipo );


		return $tld;
	}//end map_target_section_tipo_to_tld



	/**
	* GET_ALL_ONTOLOGY_SECTIONS
	* Calculates ontology sections (target section tipo) like dd0, ontologytype3, ...
	* stored in 'matrix_ontology_main' table.
	* @return array $ontology_sections Array of ontology sections tipo
	* @test true
	*/
	public static function get_all_ontology_sections() : array {

		// cache
		if ( isset(self::$cache_ontology_sections) ) {
			return self::$cache_ontology_sections;
		}

		// records. Get all records from main ontology executing a search
		$db_result = self::get_all_main_ontology_records();
		if ( !$db_result ) {
			return [];
		}

		// iterate rows
		$ontology_sections = [];
		foreach ($db_result as $row) {

			$hierarchy_target_section_data = $row->string->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO} ?? [];
			$target_section_tipo = $hierarchy_target_section_data[0]->value ?? null;

			// target section tipo check
			if ( empty($target_section_tipo) ) {
				debug_log(__METHOD__
					. " Skipped hierarchy without target section tipo: $row->section_tipo, $row->section_id " . PHP_EOL
					. ' hierarchy_target_section_data: ' . to_string($hierarchy_target_section_data)
					, logger::ERROR
				);
				continue;
			}

			// add section tipo
			$ontology_sections[] = $target_section_tipo;
		}

		// cache
		if ( !empty($ontology_sections) ) {
			self::$cache_ontology_sections = $ontology_sections;
		}

		return $ontology_sections;
	}//end get_all_ontology_sections



	/**
	* GET_ALL_MAIN_ONTOLOGY_RECORDS
	* Exec a search against matrix_ontology_main filtering
	* for main_section_tipo without limit and return all resulting records
	* @return db_result|false $db_result
	* @test true
	*/
	public static function get_all_main_ontology_records() : db_result|false {

		$main_section_tipo = self::$main_section_tipo;

		// search_query_object
			$sqo = new search_query_object();
				$sqo->set_section_tipo( [$main_section_tipo] );
				$sqo->set_limit( 0 );
				$sqo->set_skip_projects_filter( true );

		// search exec
			$search	= search::get_instance($sqo);
			$db_result	= $search->search();

		if (empty($db_result)) {
			debug_log(__METHOD__
				. " EMPTY AR RECORDS " . PHP_EOL
				. ' section_tipo: ' . to_string($main_section_tipo) . PHP_EOL
				. ' sqo: ' . to_string($sqo) . PHP_EOL
				, logger::ERROR
			);
		}


		return $db_result;
	}//end get_all_main_ontology_records



	/**
	* GET_ACTIVE_ELEMENTS
	* Performs a search and returns an array of current active ontologies or hierarchies.
	* @return array $active_elements
	* @test true
	*/
	public static function get_active_elements() : array {

		// cache
		if ( isset(self::$active_ontology_elements_cache) ) {
			return self::$active_ontology_elements_cache;
		}

		// main filter: only 'Active' records (hierarchy4 = 1)
		$filter = (object)[
			'$and' => [
				(object)[
					'q' => (object)[
						'section_id'			=> (string)NUMERICAL_MATRIX_VALUE_YES, // '1'
						'section_tipo'			=> 'dd64', // component_radio_button model
						'from_component_tipo'	=> DEDALO_HIERARCHY_ACTIVE_TIPO // 'hierarchy4'
					],
					'q_operator' => null,
					'path' => [
						(object)[
							'name'				=> 'Active',
							'model'				=> 'component_radio_button',
							'section_tipo'		=> self::$main_section_tipo,
							'component_tipo'	=> DEDALO_HIERARCHY_ACTIVE_TIPO
						]
					],
					'type' => 'jsonb'
				]
			]
		];

		// section tipo depends on the current class (hierarchy, ontology)
		$section_tipo = self::$main_section_tipo;

		$sqo = new search_query_object();
			$sqo->set_select([
				(object)['column' => 'section_tipo'],
				(object)['column' => 'section_id']
			]);
			$sqo->set_section_tipo( [$section_tipo] );
			$sqo->set_limit( 0 );
			$sqo->set_offset( 0 );
			$sqo->set_filter( $filter );

		$search = search::get_instance( $sqo );
		$db_result = $search->search();

		// active_elements
		$active_elements = [];
		if ( $db_result ) {
			foreach ($db_result as $row) {
				$active_elements[] = self::row_to_element($row);
			}
		}

		// cache
		self::$active_ontology_elements_cache = $active_elements;

		return $active_elements;
	}//end get_active_elements



	/**
	* ROW_TO_ELEMENT
	* Converts a raw database row from 'matrix_ontology_main' into a normalized element object
	* containing core ontology section properties (name, tld, target_section, typology, etc.).
	*
	* @param object $row raw database row object from 'matrix_ontology_main' (must contain section_id and section_tipo)
	* @return object $element {
	*	"section_id": int|string,
	*	"section_tipo": string,
	*	"name": string,
	*	"name_data": array|null,
	*	"tld": string|null,
	*	"target_section_tipo": string|null,
	*	"target_section_model_tipo": string|null,
	*	"main_lang": string|null (e.g., 'lg-spa'),
	*	"typology_id": int|null,
	*	"typology_name": string|null,
	*	"order": int,
	*	"active_in_thesaurus": bool
	* }
	* @test true
	*/
	public static function row_to_element( object $row ) : object {

		$section_id		= $row->section_id;
		$section_tipo	= $row->section_tipo;

		/**
		 * Local helper to get component instances concisely
		 */
		$get_component = function( string $tipo, string $lang=DEDALO_DATA_LANG ) use ($section_id, $section_tipo) {
			$model = ontology_node::get_model_by_tipo( $tipo, true );
			return component_common::get_instance( $model, $tipo, $section_id, 'list', $lang, $section_tipo );
		};

		// name
			$name_comp	= $get_component( DEDALO_HIERARCHY_TERM_TIPO );
			$name		= $name_comp ? $name_comp->get_value() : null;
			$name_data	= $name_comp ? $name_comp->get_data() : null;

		// tld
			$tld_comp	= $get_component( DEDALO_HIERARCHY_TLD2_TIPO );
			$tld		= $tld_comp ? $tld_comp->get_value() : null;

		// target_section_tipo
			$target_section_tipo_comp	= $get_component( DEDALO_HIERARCHY_TARGET_SECTION_TIPO );
			$target_section_tipo		= $target_section_tipo_comp ? $target_section_tipo_comp->get_value() : null;

		// target_section_model_tipo
			$target_section_model_tipo_comp	= $get_component( DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO );
			$target_section_model_tipo		= $target_section_model_tipo_comp ? $target_section_model_tipo_comp->get_value() : null;

		// main_lang
			$lang_comp	= $get_component( DEDALO_HIERARCHY_LANG_TIPO );
			$main_lang	= $lang_comp ? $lang_comp->get_value_code() : null;

		// Typology (typology_id | typology_name)
			$typology_comp	= $get_component( DEDALO_HIERARCHY_TYPOLOGY_TIPO, DEDALO_DATA_NOLAN );
			$typology_data	= $typology_comp ? $typology_comp->get_data() : null;
			$typology_id	= $typology_data[0]->section_id ?? null;
			$typology_name	= $typology_comp ? $typology_comp->get_value() : null;

		// hierarchy order
			$component_order	= $get_component( DEDALO_HIERARCHY_ORDER_TIPO, DEDALO_DATA_NOLAN );
			$order_data			= $component_order ? $component_order->get_data() : null;
			$order_value		= $order_data[0]->value ?? 0;

		// active_in_thesaurus status
		// it will use to discard into tree view the hierarchy in client
		// in the JSON controller will check to remove his typology if the hierarchy is not active
			$component_active_in_thesaurus	= $get_component( DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO, DEDALO_DATA_NOLAN );
			$active_in_thesaurus_data		= $component_active_in_thesaurus ? $component_active_in_thesaurus->get_data() : null;
			$active_section_id				= $active_in_thesaurus_data[0]->section_id ?? null;
			$active_in_thesaurus			= (int)$active_section_id === NUMERICAL_MATRIX_VALUE_YES;

		// Build element
		$element = (object)[
			"section_id"				=> $section_id,
			"section_tipo"				=> $section_tipo,
			"name"						=> $name,
			"name_data"					=> $name_data,
			"tld"						=> $tld,
			"target_section_tipo"		=> $target_section_tipo,
			"target_section_model_tipo"	=> $target_section_model_tipo,
			"main_lang"					=> $main_lang,
			"typology_id"				=> $typology_id,
			"typology_name"				=> $typology_name,
			"order"						=> $order_value,
			"active_in_thesaurus"		=> $active_in_thesaurus
		];


		return $element;
	}//end row_to_element



	/**
	* PARSE_SECTION_RECORD_TO_ontology_node
	* Build every component in the section given ($section_tipo, $section_id).
	* Get the component_data and parse as column of dd_ontology format.
	* @param string $section_tipo
	* @param string|int $section_id
	* @return ontology_node|null $ontology_node
	* 	returns null if section tld value is empty
	* @test true
	*/
	public static function parse_section_record_to_ontology_node( string $section_tipo, string|int $section_id ) : ?ontology_node {
		$start_time = start_time();

		// Definitions
			$tld_tipo			= DEDALO_ONTOLOGY_TLD_TIPO; // ontology7
			$parent_tipo		= DEDALO_ONTOLOGY_PARENT_TIPO; // ontology15
			$is_model_tipo		= DEDALO_ONTOLOGY_IS_MODEL_TIPO; // ontology30
			$model_tipo_comp	= DEDALO_ONTOLOGY_MODEL_TIPO; // ontology6
			$order_tipo			= DEDALO_ONTOLOGY_ORDER_TIPO; // ontology41
			$translatable_tipo	= DEDALO_ONTOLOGY_TRANSLATABLE_TIPO; // ontology8
			$relations_tipo		= DEDALO_ONTOLOGY_CONNECTED_TO_TIPO; // ontology10
			$term_tipo			= DEDALO_ONTOLOGY_TERM_TIPO; // ontology5
			$properties_tipo	= 'ontology18';
			$properties_css_tipo = 'ontology16';
			$properties_rqo_tipo = 'ontology17';
			$properties_v5_tipo	= 'ontology19';

		// Overwrite locator check
		// Local ontology nodes can overwrite the main definitions with specific properties, names, etc.
		// $overwrite_locator points to the local definition and is used to create the dd_ontology node with the overwrite data.
		// If the main node has not any overwrite node, the $overwrite_locator is null and the main node is used (default behavior)
			$overwrite_locator = self::get_overwrite( $section_tipo, $section_id );

		// node locator (main node)
			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);

		/**
		 * Local helper to resolve data favoring overwrite locator if present
		 */
		$get_resolved_data = function(string $tipo) use ($locator, $overwrite_locator) {
			$data = null;
			if ($overwrite_locator) {
				$data = self::get_node_component_data($overwrite_locator, $tipo);
			}
			return $data ?? self::get_node_component_data($locator, $tipo);
		};

		// TLD (Mandatory)
			$tld_data = $get_resolved_data($tld_tipo);
			if (empty($tld_data)) {
				debug_log(__METHOD__ . " Ignored record because tld value ([$tld_tipo]) is empty. TLD is mandatory. section_tipo: $section_tipo section_id: $section_id", logger::ERROR);
				return null;
			}
			$tld	= $tld_data[0]->value;
			$tipo	= $tld . $section_id;

		// Ontology Node instantiation
			$ontology_node = ontology_node::get_instance( $tipo );
			$ontology_node->set_tld($tld);

		// Parent
			$parent_data = $get_resolved_data($parent_tipo);
			if (empty($parent_data) || empty($parent_data[0])) {
				// main dd nodes exception
				$log_level = ($tipo === 'dd1' || $tipo === 'dd2' || get_section_id_from_tipo($section_tipo) === '0') ? logger::WARNING : logger::ERROR;
				debug_log(__METHOD__ . " Record without parent data. tipo: $tipo section_tipo: $section_tipo id: $section_id", $log_level);
			} else {
				$parent_locator	= $parent_data[0];
				$parent = ($parent_locator->section_tipo !== DEDALO_ONTOLOGY_SECTION_TIPO)
					? self::get_term_id_from_locator($parent_locator)
					: null; // main root nodes of the ontology dd1 and dd2
				$ontology_node->set_parent( $parent );
			}

		// Is Model
			// IMPORTANT: NOT overwrite it!, needs to be coherent with the main definition.
			$is_model_data = self::get_node_component_data($locator, $is_model_tipo);
			$is_model = !empty($is_model_data) && (int)$is_model_data[0]->section_id === NUMERICAL_MATRIX_VALUE_YES;
			$ontology_node->set_is_model($is_model);

		// Model
			$model_data = $get_resolved_data($model_tipo_comp);
			$model_tipo_res = null;
			$model_res		= null;

			if (empty($model_data)) {
				if ($is_model === false) {
					debug_log(__METHOD__ . " Record without model. tipo: $tipo section_tipo: $section_tipo id: $section_id", logger::ERROR);
				}
			} else {
				$model_locator	= $model_data[0];
				$model_tipo_res = self::get_term_id_from_locator($model_locator);
				$model_res		= ontology_node::get_term_by_tipo($model_tipo_res, DEDALO_STRUCTURE_LANG, true, false);
			}
			$ontology_node->set_model_tipo($model_tipo_res);
			$ontology_node->set_model($model_res);

		// Order
			$order_model = ontology_node::get_model_by_tipo($order_tipo);
			if (empty($order_model)) {
				debug_log(__METHOD__ . " Section without order component ([$order_tipo]). section_tipo: $section_tipo id: $section_id", logger::DEBUG);
			} else {
				$order_component = component_common::get_instance($order_model, $order_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_tipo);
				$order_data = $order_component->get_data();
				if (!empty($order_data)) {
					$ontology_node->set_order_number((int)$order_data[0]->value);
				}
			}

		// Translatable
			$translatable = $overwrite_locator ? self::resolve_translatable($overwrite_locator) : null;
			$translatable = $translatable ?? self::resolve_translatable($locator);
			$ontology_node->set_is_translatable($translatable);

		// Relations
			$relations = $overwrite_locator ? self::resolve_relations($overwrite_locator) : null;
			$relations = $relations ?? self::resolve_relations($locator);
			$ontology_node->set_relations($relations);

		// Properties V5
			$prop_v5_data = $get_resolved_data($properties_v5_tipo);
			$properties_v5 = !is_empty($prop_v5_data) && !empty($prop_v5_data[0]->value) ? json_encode($prop_v5_data[0]->value, JSON_PRETTY_PRINT) : null;
			$ontology_node->set_propiedades($properties_v5);

		// Properties
			$prop_data = $get_resolved_data($properties_tipo);
			$properties = !empty($prop_data) ? ($prop_data[0]->value ?? new stdClass()) : new stdClass();

			if (!is_object($properties)) {
				debug_log(__METHOD__
					. " Invalid properties value. Expected object. review  " . PHP_EOL
					. ' $properties type: ' . gettype($properties) . PHP_EOL
					. ' $properties: ' . to_string($properties) . PHP_EOL
					. ' locator: ' . to_string($locator) . PHP_EOL
					, logger::ERROR
				);
				// force object to allow continue
				$properties = new stdClass();
			}

			// Properties CSS
			$prop_css_data = $get_resolved_data($properties_css_tipo);
			if (!empty($prop_css_data)) {
				$properties->css = $prop_css_data[0]->value;
			}

			// Properties RQO
			$prop_rqo_data = $get_resolved_data($properties_rqo_tipo);
			if (!empty($prop_rqo_data)) {
				$properties->source = $prop_rqo_data[0]->value;
			}

		// Properties mix
			// Reset the properties if they are empty.
			if (empty(get_object_vars($properties))) {
				$properties = null;
			}

			// set the term into jet_dd_record
			$ontology_node->set_properties( $properties );

		// Term
			$term = $overwrite_locator ? self::resolve_term($overwrite_locator) : null;
			$term = $term ?? self::resolve_term($locator);
			$ontology_node->set_term_data($term);

		// debug
			if(SHOW_DEBUG===true) {
				$total =  exec_time_unit($start_time).' ms';
				debug_log(__METHOD__
					.' dd_ontology_record exec_time_unit: ' . $total . " [$section_tipo-$section_id]" . PHP_EOL
					.' overwrite_locator: ' . json_encode($overwrite_locator)
					, logger::DEBUG
				);
			}

		return $ontology_node;
	}//end parse_section_record_to_ontology_node



	/**
	* GET_NODE_COMPONENT_DATA
	* Get the data of the component from given tipo.
	* @param locator $locator
	* @param string $tipo
	* @return array|null $data
	*/
	private static function get_node_component_data( locator $locator, string $tipo ) : ?array {

		$properties_model	= ontology_node::get_model_by_tipo( $tipo  );
		$component			= component_common::get_instance(
			$properties_model,
			$tipo ,
			$locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$locator->section_tipo
		);
		$data = $component->get_data();

		if (empty($data)) {
			return null;
		}

		return $data;
	}//end get_node_component_data



	/**
	* RESOLVE_TRANSLATABLE
	* Get the translatable value of the node.
	* The translatable value is defined as true or false based on the section_id of the locator:
	* section_id = 1 -> true (NUMERICAL_MATRIX_VALUE_YES)
	* section_id = 2 -> false (NUMERICAL_MATRIX_VALUE_NO)
	* @param locator $locator
	* @return bool $translatable
	*/
	private static function resolve_translatable( locator $locator ) : bool {

		$translatable_tipo = DEDALO_ONTOLOGY_TRANSLATABLE_TIPO; // 'ontology8' component_radio_button

		// get the translatable data of the node.
		$translatable_data = self::get_node_component_data( $locator, $translatable_tipo );

		if ( empty($translatable_data) || !isset($translatable_data[0]) ) {

			debug_log(__METHOD__
				. " Record without translatable_data (using default true) " . PHP_EOL
				. ' section_tipo      : ' . to_string($locator->section_tipo) . PHP_EOL
				. ' section_id        : ' . to_string($locator->section_id) . PHP_EOL
				. ' translatable_tipo : ' . to_string($translatable_tipo)
				, logger::DEBUG
			);
			return true; // default value
		}

		$translatable_data_locator = $translatable_data[0];
		$translatable = (int)$translatable_data_locator->section_id === NUMERICAL_MATRIX_VALUE_YES;

		return $translatable;
	}//end resolve_translatable



	/**
	* RESOLVE_RELATIONS
	* Get the relations data of the node.
	* The relations data is composed of locators pointing to other nodes.
	* @param locator $locator
	* @return array|null $relations
	*/
	private static function resolve_relations( locator $locator ) : ?array {

		$relations_tipo = DEDALO_ONTOLOGY_CONNECTED_TO_TIPO; // ontology10 component_autocomplete_hi

		// get the relations data of the node.
		$relations_data = self::get_node_component_data( $locator, $relations_tipo );

		if ( empty($relations_data) ) {
			return null;
		}

		$relations = [];
		foreach ($relations_data as $current_relation) {

			// get the relation data as term_id (e.g. 'dd55')
			$relation_term_id = self::get_term_id_from_locator( $current_relation );

			if ( empty($relation_term_id) ) {
				continue;
			}

			$relations[] = (object)[
				'tipo' => $relation_term_id
			];
		}

		return !empty($relations) ? $relations : null;
	}//end resolve_relations



	/**
	* RESOLVE_TERM
	* Get the term / label data of the node.
	* The term includes all languages translations.
	* @param locator $locator
	* @return object|null $term
	* Sample: {"lg-eng": "Denmark", "lg-spa": "Dinamarca"}
	*/
	private static function resolve_term( locator $locator ) : ?object {

		$term_tipo  = DEDALO_ONTOLOGY_TERM_TIPO; // ontology5
		$term_model = ontology_node::get_model_by_tipo( $term_tipo );

		if ( empty($term_model) ) {
			return null;
		}

		$term_component = component_common::get_instance(
			$term_model,
			$term_tipo,
			$locator->section_id,
			'list',
			DEDALO_DATA_LANG,
			$locator->section_tipo
		);

		if ( !$term_component ) {
			return null;
		}

		$term_data = $term_component->get_data();

		if ( is_empty($term_data) ) {
			return null;
		}

		$term = new stdClass();
		foreach ($term_data as $item) {
			$lang = $item->lang;
			$term->$lang = $item->value;
		}

		return $term;
	}//end resolve_term



	/**
	* GET_TERM_ID_FROM_LOCATOR
	* Build the term_id as tld.section_id (e.g. 'dd55') from a given locator.
	* It first attempts to map the section_tipo to a TLD via the main ontology.
	* If not found, it tries to retrieve the TLD from the node record itself.
	* @param object $locator Must contain section_tipo and section_id
	* @return string|null $term_id
	* @test true
	*/
	public static function get_term_id_from_locator( object $locator ) : ?string {

		// get the tld from main ontology mapping of the locator section_tipo
		$tld = self::map_target_section_tipo_to_tld( (string)$locator->section_tipo );

		// check if the node exist and it get data to resolve the tld
		// if not, try to get the tld from the main ontology definition.
		if ( empty($tld) ) {

			debug_log(__METHOD__
				. " TLD mapping not found for section_tipo. (Fallback to record resolution) " . PHP_EOL
				. ' locator: ' . to_string( $locator )
				, logger::WARNING
			);

			// get the component data using the locator
			$tld_tipo  = DEDALO_ONTOLOGY_TLD_TIPO; // ontology7 component_input_text
			$tld_model = ontology_node::get_model_by_tipo( $tld_tipo );

			if ( empty($tld_model) ) {
				return null;
			}

			$tld_component = component_common::get_instance(
				$tld_model,
				$tld_tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);

			if ( !$tld_component ) {
				return null;
			}

			$tld_data = $tld_component->get_data();
			$tld = $tld_data[0]->value ?? null;

			if ( empty($tld) ) {
				debug_log(__METHOD__ . " Unable to resolve TLD from record data for: " . to_string($locator), logger::ERROR);
				return null;
			}
		}

		$term_id = $tld . $locator->section_id;

		return $term_id;
	}//end get_term_id_from_locator



	/**
	* GET_ORDER_FROM_LOCATOR
	* Use the array of siblings to locate the given locator.
	* Order will be the position of the locator in the siblings array + 1.
	* @param object $locator
	* @param array $siblings Array of locator-like objects
	* @return int $order
	* @test true
	*/
	public static function get_order_from_locator( object $locator, array $siblings ) : int {

		// Ensure the array is a pure array
		$siblings = array_values($siblings);
		foreach ($siblings as $index => $sibling) {

			if ( $sibling->section_tipo === $locator->section_tipo &&
				 (int)$sibling->section_id === (int)$locator->section_id
			) {
				return $index + 1;
			}
		}

		// Default to 1 if not found in the array (fallback)
		return 1;
	}//end get_order_from_locator



	/**
	* GET_SIBLINGS
	* Get the children data from parent node as siblings
	* @param object $parent_locator
	* @return array $children_data
	* @test true
	*/
	public static function get_siblings( object $parent_locator ) : array {

		// get the component data using the locator
		$children_tipo  = self::$children_tipo; // 'ontology14'
		$children_model = ontology_node::get_model_by_tipo( $children_tipo );

		if ( empty($children_model) ) {
			return [];
		}

		$children_component = component_common::get_instance(
			$children_model,
			$children_tipo,
			$parent_locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$parent_locator->section_tipo
		);

		if ( !$children_component ) {
			return [];
		}

		// siblings will be the children component data.
		return $children_component->get_data() ?? [];
	}//end get_siblings



	/**
	* INSERT_DD_ONTOLOGY_RECORD
	* Parses the section record and inserts it into dd_ontology
	* If the target registry already exists, it is deleted and a new one is created.
	* @param string $section_tipo
	* @param string|int $section_id
	* @return string|null $term_id
	* 	returns null if section tld value is empty
	* @test true
	*/
	public static function insert_dd_ontology_record( string $section_tipo, string|int $section_id ) : ?string {
		$start_time = start_time();

		$ontology_node = self::parse_section_record_to_ontology_node( $section_tipo, $section_id );
		if ( empty($ontology_node) ) {
			debug_log(__METHOD__
				. " Error: Unable to parse section record to ontology node " . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' section_id: ' . to_string($section_id)
				, logger::ERROR
			);
			return null;
		}

		if ( !$ontology_node->insert() ) {
			debug_log(__METHOD__
				. " Error inserting ontology node into database " . PHP_EOL
				. ' section_tipo: ' . to_string($section_tipo) . PHP_EOL
				. ' section_id: ' . to_string($section_id)
				, logger::ERROR
			);
			return null;
		}

		if ( SHOW_DEBUG === true ) {
			debug_log(__METHOD__
				. " Total time insert_dd_ontology_record: " . exec_time_unit($start_time, 'ms') . ' ms'
				, logger::DEBUG
			);
		}


		return $ontology_node->get_tipo();
	}//end insert_dd_ontology_record



	/**
	* SET_RECORDS_IN_DD_ONTOLOGY
	* Insert a group of `matrix_ontology` records into `dd_ontology`
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
	public static function set_records_in_dd_ontology( object $sqo ) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];
			$response->total	= 0;

		// Validate input
		if ( !isset($sqo->section_tipo) ) {
			$response->errors[] = 'Missing section_tipo in sqo';
			return $response;
		}

		$search = search::get_instance( $sqo );
		$db_result	= $search->search();
		$total		= $db_result ? $db_result->row_count() : 0;

		// Check if we have records to process
		if ( $total === 0 ) {
			$response->result	= true;
			$response->msg		= "OK. No records found to process for " . to_string($sqo->section_tipo);
			$response->msg	   .= ' | ' . exec_time_unit($start_time, 'ms') . ' ms';
			return $response;
		}

		// active_elements: current active main sections
		$active_tld = array_map( function($el) {
			return $el->tld;
		}, self::get_active_elements() );

		$processed_count = 0;
		foreach ($db_result as $current_record) {

			$section_tipo	= $current_record->section_tipo;
			$section_id		= $current_record->section_id;
			$term_id		= null;

			if ( $section_tipo === self::$main_section_tipo ) {

				// main_ontology records (ontology35)
				$tld = self::get_main_tld($section_id, $section_tipo);

				// if current ontology is not active (is not in the active tld list)
				// all tld records must be deleted from 'dd_ontology' table
				if ( !in_array($tld, $active_tld) ) {

					// remove any other things than tld.
						$safe_tld = safe_tld( (string)$tld );

						if ( $safe_tld === false ) {
							$response->errors[] = "Invalid TLD for deletion: " . to_string($tld);
							continue;
						}

					// Delete the dd_ontology nodes
					// Inactive main ontology TLD nodes must be deleted to prevent inconsistent resolutions
						$deleted_dd_ontology_nodes = ontology_utils::delete_tld_nodes( $safe_tld );

						if ( $deleted_dd_ontology_nodes === false ) {
							$response->errors[] = "Unable to delete TLD nodes for: $tld";
							continue;
						}

					$term_id = $safe_tld . '0';

				} else {

					// add / update
					$typology_id	= self::get_main_typology_id($tld);
					$name_data		= self::get_main_name_data($tld);
					$term_id		= self::create_dd_ontology_ontology_section_node((object)[
						'tld'					=> $tld,
						'typology_id'			=> $typology_id,
						'name_data'				=> $name_data,
						'parent_grouper_tipo'	=> 'ontologytype' . $typology_id
					]);
				}

			} else {

				// regular matrix_ontology_records
				$term_id = self::insert_dd_ontology_record( $section_tipo, $section_id );
			}

			if ( empty($term_id) ) {
				$response->errors[] = "Failed to process dd_ontology record for section_tipo: $section_tipo, section_id: $section_id";
			} else {
				$processed_count++;
			}
		}

		// Final response construction
		if ( empty($response->errors) ) {
			$response->result			= true;
			$response->msg				= "OK. Request completed successfully for " . to_string($sqo->section_tipo);
			$response->msg			   .= ' | ' . exec_time_unit($start_time, 'ms') . ' ms';
			$response->total			= $total;
			$response->processed_count	= $processed_count;
		} else {
			// Partial success or failure
			$response->processed_count	= $processed_count;
			$response->total			= $total;

			if ( $processed_count > 0 ) {
				$response->result	= true; // Consider partial success as success
				$response->msg		= "Partial success. Some records processed for " . to_string($sqo->section_tipo);
			} else {
				$response->msg		= "Request failed for " . to_string($sqo->section_tipo);
			}
			$response->msg .= ' | ' . exec_time_unit($start_time, 'ms') . ' ms';
		}


		return $response;
	}//end set_records_in_dd_ontology



	/**
	* REGENERATE_RECORDS_IN_DD_ONTOLOGY
	* Insert a group of `matrix_ontology` records into `dd_ontology`
	* use a given SQO to search the group and process it.
	* @param array $tld
	* @return object $response
	* @test true
	*/
	public static function regenerate_records_in_dd_ontology( array $tld ) : object {

		$response = new stdClass();
			$response->result		= false;
			$response->msg			= 'Error. Request failed';
			$response->errors		= [];
			$response->total_insert = 0;

		// create a copy of the $tld
			$backup = ontology_utils::create_bk_table( $tld );

			if ( $backup === false ) {
				$response->errors[] = "Impossible to create the dd_ontology backup previous to regenerate the TLDs: " . to_string($tld);
				return $response;
			}

		// get all section_tipo from tld
			$section_tipo = array_map( function($el) {
				return self::map_tld_to_target_section_tipo($el);
			}, $tld );

		// 1 search all nodes as matrix records
			$sqo = new search_query_object();
				$sqo->set_section_tipo( $section_tipo );
				$sqo->limit = 0;

			$search = search::get_instance( $sqo );
			$db_result	= $search->search();
			$total		= $db_result ? $db_result->row_count() : 0;

		// 2 create the dd_ontology nodes of all matrix records
			$ontology_nodes = [];
			if ( $total > 0 ) {
				foreach ($db_result as $current_record) {

					$current_section_tipo	= $current_record->section_tipo;
					$current_section_id		= $current_record->section_id;

					// ontology_node item
					$ontology_node = self::parse_section_record_to_ontology_node( $current_section_tipo, $current_section_id );

					if ( empty($ontology_node) ) {
						ontology_utils::delete_bk_table();
						$response->errors[] = "Failed regenerate dd_ontology node for section_tipo: $current_section_tipo, section_id: $current_section_id";
						debug_log(__METHOD__ . " Error generating dd_ontology for $current_section_tipo-$current_section_id", logger::ERROR);
						return $response;
					}

					$ontology_nodes[] = $ontology_node;
				}
			}

		// 3 delete all tld records
			foreach ($tld as $current_tld) {
				ontology_utils::delete_tld_nodes( $current_tld );
			}

		// 4 insert the new nodes of the given tld
			$total_insert = 0;
			foreach ($ontology_nodes as $ontology_node) {

				$insert_result = $ontology_node->insert();

				// error inserting
				// recovery al tld from bk table.
				if ( empty($insert_result) ) {
					// restore the backup table
					ontology_utils::restore_from_bk_table($tld);
					// delete bk table
					ontology_utils::delete_bk_table();
					$response->errors[] = "Failed inserting dd_ontology. Restored previous data from backup.";
					return $response;
				}

				$total_insert++;
			}

		// 5 add_main_section (overwrite existing record like 'dd0')
			foreach ($tld as $current_tld) {

				// get the information to create the main section
				$typology_id	= self::get_main_typology_id( $current_tld );
				$name_data		= self::get_main_name_data( $current_tld );

				$file_item = new stdClass();
					$file_item->tld			= $current_tld;
					$file_item->typology_id	= $typology_id ?? null;
					$file_item->name_data	= $name_data ?? null;

				// add main section and records
				$add_result = self::add_main_section( $file_item );
				if ( empty($add_result) ) {
					// restore the backup table
					ontology_utils::restore_from_bk_table($tld);
					// delete bk table
					ontology_utils::delete_bk_table();
					$response->errors[] = 'Failed add_main_section file_item: ' . to_string($file_item);
					debug_log(__METHOD__
						. " Error creating ontology main section " . PHP_EOL
						. ' add_result: ' . to_string($add_result) . PHP_EOL
						. ' file_item: ' . to_string($file_item)
						, logger::ERROR
					);
					return $response;
				}

				// create dd_ontology node for the main section
				self::create_dd_ontology_ontology_section_node( $file_item );
			}

		// response
			if ( empty($response->errors) ) {
				$response->result	= true;
				$response->msg		= 'OK. The regenerate records request has been completed successfully.';
			}
			// total_insert dd_ontology records
			$response->total_insert = $total_insert;


		return $response;
	}//end regenerate_records_in_dd_ontology



	/**
	* DELETE_MAIN
	* Resolves ontology TLD from main record value and
	* deletes all ontology records.
	* It deletes given main section and deletes all ontology records in
	* `matrix_ontology` and `dd_ontology` with the main `tld`.
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
	* Get the TLD, in lowercase, of the main ontology/hierarchy section (ontology35 | hierarchy1).
	* @param string|int $section_id
	* @param string $section_tipo
	* @return string|null $tld
	* @test true
	*/
	public static function get_main_tld( string|int $section_id, string $section_tipo ) : ?string {

		$tld_tipo	= DEDALO_HIERARCHY_TLD2_TIPO; // hierarchy6
		$model_name	= ontology_node::get_model_by_tipo( $tld_tipo, true );

		$component = component_common::get_instance(
			$model_name,
			$tld_tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		if ( !$component ) {
			return null;
		}

		$data = $component->get_data();
		$tld  = $data[0]->value ?? null;

		return $tld ? strtolower((string)$tld) : null;
	}//end get_main_tld



	/**
	* GET_MAIN_TYPOLOGY_ID
	* Retrieves the typology ID for a given TLD from its main section record.
	* Defaults to 15 (others) if no specific typology is defined.
	* If typology component has not data, use 15 (others) as `typology_id`
	* @param string $tld
	* @return int|null $typology_id
	* @test true
	*/
	public static function get_main_typology_id( string $tld ) : ?int {

		$default_typology = 15; // others typology

		// get main record
		$main_record = self::get_ontology_main_from_tld( $tld );
		if ( empty($main_record) ) {
			debug_log(__METHOD__ . " Empty main record for tld: $tld", logger::ERROR);
			return null;
		}

		// Typology component
		$tipo  = DEDALO_HIERARCHY_TYPOLOGY_TIPO;
		$model = ontology_node::get_model_by_tipo( $tipo, true );

		$component = component_common::get_instance(
			$model,
			$tipo,
			$main_record->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$main_record->section_tipo
		);

		if ( !$component ) {
			return $default_typology;
		}

		$typology_data = $component->get_data();

		// Use section_id as typology_id. If empty data, use 15 as default (others)
		return isset($typology_data[0]->section_id)
			? (int)$typology_data[0]->section_id
			: $default_typology;
	}//end get_main_typology_id



	/**
	* GET_MAIN_NAME_DATA
	* Retrieves the full name/term data (translations) for a given TLD's main section.
	* @param string $tld
	* @return array|null $name_data Sample: [{"lang": "lg-spa", "value": "Prueba"}, ...]
	* @test true
	*/
	public static function get_main_name_data( string $tld ) : ?array {

		// get main record
		$main_record = self::get_ontology_main_from_tld( $tld );
		if ( empty($main_record) ) {
			debug_log(__METHOD__ . " Empty main record for tld: $tld", logger::ERROR);
			return null;
		}

		// Name component
		$tipo  = DEDALO_HIERARCHY_TERM_TIPO;
		$model = ontology_node::get_model_by_tipo( $tipo, true );

		$component = component_common::get_instance(
			$model,
			$tipo,
			$main_record->section_id,
			'list',
			DEDALO_DATA_LANG,
			$main_record->section_tipo
		);

		return $component ? $component->get_data() : null;
	}//end get_main_name_data



	/**
	* DELETE_ONTOLOGY
	* Delete all ontology references with `tld` given.
	* Remove the `matrix_ontology` and `dd_ontology` nodes of given `tld`.
	* It also deletes the main ontology section definition.
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
			$response->msg		= 'Error. Request failed ' . __METHOD__;
			$response->errors	= [];

		// remove any other things than tld.
			$safe_tld = safe_tld( $tld );

			if ( $safe_tld === false ) {
				$response->errors[] = "Invalid TLD provided for deletion: " . to_string($tld);
				return $response;
			}

		// 1 Delete the dd_ontology nodes
			$deleted_dd_ontology = ontology_utils::delete_tld_nodes( $safe_tld );

			if ( $deleted_dd_ontology === false ) {
				$response->errors[] = 'Unable to delete dd_ontology records for TLD: ' . $safe_tld;
				$response->msg .= 'Error deleting dd_ontology [1] for the TLD: ' . $safe_tld;
				return $response;
			}

		// 2 Delete main section
			// get main section for this tld
			$main_section = self::get_ontology_main_from_tld( $safe_tld );

			if ( empty($main_section) ) {
				$response->errors[] = 'Unable to find main_section for TLD: ' . $safe_tld;
				$response->msg .= 'Error deleting dd_ontology [2] for the TLD: ' . $safe_tld;
				return $response;
			}

			$main_sections_instance = sections::get_instance( null, null );

			$options = new stdClass();
				$options->delete_mode				= 'delete_record';
				$options->section_tipo				= $main_section->section_tipo;
				$options->section_id				= $main_section->section_id;
				$options->delete_diffusion_records	= true;
				$options->delete_with_children		= true;
				$options->prevent_delete_main		= true; // prevent infinite loop
			$delete_main_response = $main_sections_instance->delete( $options );

			if ( $delete_main_response->result === false ) {
				return $delete_main_response;
			}

		// 3 Delete all ontology nodes (records) in matrix_ontology
			$nodes_section_tipo = self::map_tld_to_target_section_tipo( $safe_tld );

			$nodes_sqo = new search_query_object();
				$nodes_sqo->set_section_tipo( [$nodes_section_tipo] );
				$nodes_sqo->set_limit( 0 );

			// Delete all nodes of the section
			$nodes_sections_instance = sections::get_instance( null, null );

			$options_nodes = new stdClass();
				$options_nodes->delete_mode				= 'delete_record';
				$options_nodes->section_tipo			= $nodes_section_tipo;
				$options_nodes->sqo						= $nodes_sqo;
				$options_nodes->delete_diffusion_records= true;
				$options_nodes->delete_with_children	= true;
				$options_nodes->prevent_delete_main		= true; // prevents infinite loop
			$delete_nodes_response = $nodes_sections_instance->delete( $options_nodes );

			if ( $delete_nodes_response->result === false ) {
				return $delete_nodes_response;
			}

		// 4 delete counter
			counter::modify_counter(
				$safe_tld . '0',
				'reset'
			);

		// response OK
			$response->result		= true;
			$response->delete_main	= $delete_main_response;
			$response->delete_nodes	= $delete_nodes_response;
			$response->msg			= empty($response->errors)
				? 'OK. Request completed successfully'
				: 'Warning. Request completed with errors';


		return $response;
	}//end delete_ontology



	/**
	* DD_ONTOLOGY_VERSION_IS_VALID
	* Temporal check for legacy ontologies to determine if an update is required.
	* Disciminates if the 'dd1' (root) node meets the minimum required date.
	* @param string $min_date Sample: '2025-12-31'
	* @return bool
	*/
	public static function dd_ontology_version_is_valid( string $min_date ) : bool {

		$ontology_node = ontology_node::get_instance('dd1');
		if (!$ontology_node) {
			return false;
		}

		$date = null;

		// 1. Check properties (Dédalo >= 6.4 way)
		$properties = $ontology_node->get_properties();
		if ( isset($properties->date) && !empty($properties->date) ) {
			$date = (string)$properties->date;
		} else {
			// 2. Fallback: Get date from term info (Legacy versions)
			// Sample: 'Dédalo 2024-12-31T00:00:00+01:00'
			$term       = $ontology_node->get_term_data();
			$term_value = $term->{DEDALO_STRUCTURE_LANG} ?? null;

			if ( !empty($term_value) ) {
				if ( preg_match('/[0-9]{4}-[0-9]{2}-[0-9]{2}/', (string)$term_value, $matches) ) {
					$date = $matches[0];
				}
			}
		}

		if ( empty($date) ) {
			debug_log(__METHOD__ . " Unable to resolve version date from dd1 node (properties or term)", logger::ERROR);
			return false;
		}

		try {
			$ontology_datetime = new DateTime($date);
			$min_datetime      = new DateTime($min_date);

			return $ontology_datetime >= $min_datetime;

		} catch (Exception $e) {
			debug_log(__METHOD__ . " Date parsing error: " . $e->getMessage() . " | date: $date | min_date: $min_date", logger::ERROR);
			return false;
		}
	}//end dd_ontology_version_is_valid



	/**
	* GET_ROOT_TERMS
	* Get initial term to start the thesaurus tree view
	* @param string $section_tipo
	* @param string|int $section_id
	* @param ?bool $is_model=false
	* @return array $root_terms
	*/
	public static function get_root_terms( string $section_tipo, string|int $section_id, ?bool $is_model=false ) : array {

		// source tipo
		$tipo = $is_model===true
			? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO // 'hierarchy59'
			: DEDALO_HIERARCHY_CHILDREN_TIPO; // 'hierarchy45'

		$model		= ontology_node::get_model_by_tipo($tipo,true);
		$componnent	= component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		$root_terms = $componnent->get_data() ?? [];

		return $root_terms;
	}//end get_root_terms



	/**
	* GET_MAIN_ORDER
	* Retrieves the display order for a given TLD's main section.
	* This order is used to organize root nodes in tree views.
	* @param string $tld
	* @return int|null $order
	* @test true
	*/
	public static function get_main_order( string $tld ) : ?int {

		// get main record
		$main_record = self::get_ontology_main_from_tld( $tld );
		if ( empty($main_record) ) {
			debug_log(__METHOD__ . " Empty main record for tld: $tld", logger::ERROR);
			return null;
		}

		// Order component
		$tipo  = DEDALO_HIERARCHY_ORDER_TIPO; // hierarchy48 component_number
		$model = ontology_node::get_model_by_tipo( $tipo, true );

		$component = component_common::get_instance(
			$model,
			$tipo,
			$main_record->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$main_record->section_tipo
		);

		if ( !$component ) {
			return 0; // Default order
		}

		$order_data = $component->get_data();

		// Access the 'value' property of the first data record
		return isset($order_data[0]->value)
			? (int)$order_data[0]->value
			: 0;
	}//end get_main_order



	/**
	* GET_OVERWRITE
	* Checks if a specified ontology node has a corresponding local override definition.
	* This is used to resolve project-specific customizations (localontology) of
	* common ontology elements.
	* @param string $section_tipo The TIPO of the section to check.
	* @param string|int $section_id The ID of the section to check.
	* @return locator|null Returns a locator to the overwrite node if found, otherwise null.
	* @test true
	*/
	public static function get_overwrite( string $section_tipo, string|int $section_id ) : ?locator {

		// search if the node has a overwrite node in local ontology
			$local_section_tipo = 'localontology0';

		// If the current section is already a local ontology, skip overwrite search
			if ( $section_tipo === $local_section_tipo ) {
				return null;
			}

		// node locator
			$locator = new locator();
				$locator->set_section_tipo( $section_tipo );
				$locator->set_section_id( $section_id );

		// create a sqo to find references in local ontology
			$sqo = new search_query_object();
				$sqo->set_select([]); // Prevents to load all columns
				$sqo->set_section_tipo( [$local_section_tipo] );
				$sqo->set_mode('related');
				$sqo->set_filter_by_locators([$locator]);
				$sqo->set_limit( 1 );
				$sqo->set_full_count(false);
				$sqo->set_tables([
					'matrix_ontology_main',
					'matrix_ontology'
				]);

		// search the overwrite section
			$search = search::get_instance( $sqo );
			$db_result = $search->search();

			if ( !$db_result || $db_result->row_count() === 0 ) {
				return null;
			}

		// set the overwrite node locator with the row
			$overwrite_row = $db_result->fetch_one();
			if ( empty($overwrite_row) ) {
				return null;
			}

			$overwrite_locator = new locator();
				$overwrite_locator->set_section_tipo( $overwrite_row->section_tipo );
				$overwrite_locator->set_section_id( $overwrite_row->section_id );

		return $overwrite_locator;
	}//end get_overwrite



	/**
	 * Experimental
	 * Do no use in production.
	 * Get and save all Ontology records into 'cache_ontology.php' file
	 * to use as Opcode cache vars.
	 */
	public static function build_cache_file() : void {

		$conn = DBi::_getConnection();

		$data = [];

		// search for dd_ontology nodes
		$sql = 'SELECT * FROM "dd_ontology" ORDER BY tipo ASC, id ASC';
		$result = pg_query($conn, $sql);
		while( $row = pg_fetch_assoc($result) ){

			$tipo = $row['tipo'];

			// ! Do not parse values here becuse is more expensive than parse in cache recovering.

			$data[$tipo] = $row;
		}

		dd_cache::cache_to_file((object)[
			'data' => $data,
			'file_name' => 'cache_ontology.php',
			'prefix' => '' // Set empty string as prefix to avoid prefixing the file name
		]);

	}//end build_cache_file



}//end ontology
