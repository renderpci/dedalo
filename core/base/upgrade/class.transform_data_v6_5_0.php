<?php declare(strict_types=1);
require_once DEDALO_CORE_PATH . '/base/update/class.update.php';
/**
* CLASS TRANSFORM_DATA
* This class is used to transform existing data, e.g. to migrate
* portals with dataframe v5 to other models such as Bibliographic references
*
*/
class transform_data_v6_5_0 {


	/**
	* CHECK_ALL_ORDER_COMPONENTS_IN_ONTOLOGY
	* @return bool
	*/
	public static function check_all_order_components_in_ontology() : object {

		// response default
			$response = new stdClass();
				$response->result 	= false;
				$response->errors 	= [];
				$response->msg 		= 'Error. Request failed ['.__METHOD__.']';


		$ar_components_children_tipo = self::get_all_compnent_children();

		// To skip wrong definitions or unused.
		// Added the tipos that you don't want to be parsed
		$to_skip= ['']; //as 'mupreva2564'
		foreach ($ar_components_children_tipo as $current_tipo) {

			$ar_section = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, 'section', 'parent', true );

			foreach ($ar_section as $section) {

				if( in_array($section, $to_skip) ){
					continue;
				}

				$section_map			= section::get_section_map( $section );
				$component_order_tipo	= $section_map->thesaurus->order ?? null;

				if( empty($component_order_tipo) ){
					$msg = "Failed to locate any order component in section_map of $section | Review your ontology definition";
					debug_log(__METHOD__
						." ERROR: $msg ". PHP_EOL
						.' section_tipo: ' . $section . PHP_EOL
						, logger::ERROR
					);

					$response->errors[] = $msg;

					return $response;
				}

				$order_model = RecordObj_dd::get_modelo_name_by_tipo($component_order_tipo);

				if( $order_model !=='component_number' ){
					$msg = "Failed to set data in the order of section_map of $section,  | Review your ontology definition";
					debug_log(__METHOD__
						." ERROR: $msg ". PHP_EOL
						.' section_tipo: ' . $section . PHP_EOL
						.' order_model: ' . $order_model . PHP_EOL
						.' component_order_tipo: ' . $component_order_tipo . PHP_EOL
						, logger::ERROR
					);

					$response->errors[] = $msg;

					return $response;
				}
			}
		}

		$response->result 	= true;
		$response->msg 		= 'OK';


		return $response;
	}//end check_all_order_components_in_ontology



	/**
	* UPDATE_SET_PARENT_WITH_CHILDREN
	* @return bool
	*/
	public static function update_parent_with_children_data() : bool {

		$ar_tables = [
			// 'new_matrix'
			'matrix',
			'matrix_activities',
			// 'matrix_dataframe',
			// 'matrix_activity',
			// 'matrix_dd',
			'matrix_hierarchy',
			'matrix_hierarchy_main',
			// 'matrix_indexations',
			'matrix_langs',
			// 'matrix_layout',
			// 'matrix_layout_dd',
			// 'matrix_list',
			'matrix_nexus',
			'matrix_nexus_main',
			// 'matrix_notes',
			'matrix_ontology',
			'matrix_ontology_main',
			// 'matrix_profiles',
			'matrix_projects',
			// 'matrix_stats',
			// 'matrix_structurations',
			// 'matrix_test',
			// 'matrix_tools',
			// 'matrix_users'
			];

		$action = 'transform_data_v6_5_0::set_parent_data_from_children_data';

		update::convert_table_data($ar_tables, $action);

		return true;
	}//end update_set_parent_with_children



	/**
	* SET_PARENT_DATA_FROM_CHILDREN_DATA
	* Updates dataframe matrix and time machine data
	* @param object|null $datos
	* @return object|null $datos
	*/
	public static function set_parent_data_from_children_data(?object $datos) : ?object {

		// empty relations cases
			if (empty($datos->relations)) {
				return null;
			}

		// dataframe_to_save initial is false
			$to_save = false;

		// get the tipo
			// $ar_components_parent_tipo	= self::get_all_component_parent();
			$ar_components_children_tipo	= self::get_all_compnent_children();

		// resolve the change using relations container
			$section_id		= $datos->section_id;
			$section_tipo	= $datos->section_tipo;
			$relations		= $datos->relations ?? []; 	// relations container iteration
			$order			= 0;
			foreach ($relations as $key => $locator) {
				// check if the section has any children data
				if( $locator->type===DEDALO_RELATION_TYPE_CHILDREN_TIPO
					&& in_array($locator->from_component_tipo, $ar_components_children_tipo )
				) {
					// hierarchy|ontology main section exception
					if($locator->from_component_tipo === 'hierarchy59' || $locator->from_component_tipo === 'hierarchy45'){
						$locator->type = DEDALO_RELATION_TYPE_LINK;
						$to_save = true;
						continue;
					}
					// add 1 to order.
					$order++;

					$parent_section_tipo	= $locator->section_tipo;
					$parent_section_id		= $locator->section_id;
					$ar_parent_tipo			= component_relation_children::get_ar_related_parent_tipo($locator->from_component_tipo, $section_tipo);
					$parent_tipo			= $ar_parent_tipo[0] ?? null;
					if (empty($parent_tipo)) {
						debug_log(__METHOD__
							. " Ignored empty parent tipo for locator " . PHP_EOL
							. ' locator: ' . to_string($locator)
							, logger::ERROR
						);
						continue;
					}

					$parent_locator_data = new locator();
						$parent_locator_data->set_section_tipo( $section_tipo );
						$parent_locator_data->set_section_id( $section_id );
						$parent_locator_data->set_type( DEDALO_RELATION_TYPE_PARENT_TIPO );
						$parent_locator_data->set_from_component_tipo( $parent_tipo );

					$parent_set_result = self::set_parent_data($parent_section_tipo, $parent_section_id, $parent_locator_data, $order);
					if($parent_set_result===false){
						continue;
					}

					// remove current locator
					// children locators are not used anymore
					unset($datos->relations[$key]);
					$to_save = true;
				}//end if(isset($locator->section_id_key))

			}//end foreach ($relations as $locator)
			// remove the keys ans consolidate the relations array as locators
			$datos->relations = array_values($datos->relations);

		// no changes case
			if($to_save === false){
				return null;
			}


		return $datos;
	}//end set_parent_data_from_children_data



	/**
	* GET_ALL_COMPONENT_PARENT
	* @return array $ar_components_parent_tipo
	*/
	private static function get_all_component_parent() : array {

		static $ar_components_parent_tipo;
		if(isset($ar_components_parent_tipo) ){
			return $ar_components_parent_tipo;
		}

		$ar_components_parent_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name( 'component_relation_parent' );

		return $ar_components_parent_tipo;
	}//end get_all_component_parent



	/**
	* GET_ALL_COMPNENT_CHILDREN
	* @return array $ar_components_children_tipo
	*/
	private static function get_all_compnent_children() : array {

		static $ar_components_children_tipo;
		if(isset($ar_components_children_tipo) ){
			return $ar_components_children_tipo;
		}

		$ar_components_children_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name( 'component_relation_children' );

		return $ar_components_children_tipo;
	}//end get_all_compnent_children



	/**
	* SET_PARENT_DATA
	* Update matrix_table with the new parent locator
	* @param string $parent_section_tipo
	* @param string|int $parent_section_id
	* @param locator $parent_locator_data
	* @param int $order
	* @return bool
	*/
	private static function set_parent_data( string $parent_section_tipo, string|int $parent_section_id, locator $parent_locator_data, int $order ) : bool {

		$matrix_table = section::get_matrix_table_from_tipo( $parent_section_tipo );


		if($parent_section_id==0){
			return true;
		}
		if($matrix_table===false){
			$msg = "Failed to set parent locator, impossible to determinate table ----------------------- review your database";
			debug_log(__METHOD__
				." ERROR: $msg ". PHP_EOL
				." The parent has not be assigned, but the child will be removed because is inconsistent maintain locators pointing to nowhere ". PHP_EOL
				.' section_tipo: ' . $parent_section_tipo . PHP_EOL
				.' section_id: ' . $parent_section_id . PHP_EOL
				.' parent data: ' . json_encode( $parent_locator_data ) . PHP_EOL
				.' matrix_table: ' . $matrix_table
				, logger::ERROR
			);
			return true;// the parent is not assigned, but the children locator need to be deleted.
		}
		// cast to int
		$parent_section_id = (int)$parent_section_id;

		$strQuery = "
			SELECT * FROM $matrix_table
			WHERE section_id = '$parent_section_id' AND section_tipo = '$parent_section_tipo'
		";
		$result = JSON_RecordDataBoundObject::search_free($strQuery);
		// query error case
		if($result===false){
			$msg = "Failed to set parent locator, inconsistent data ----------------------- review your database";
			debug_log(__METHOD__
				." ERROR: $msg ". PHP_EOL
				.' strQuery: ' . $strQuery . PHP_EOL
				.' section_tipo: ' . $parent_section_tipo . PHP_EOL
				.' section_id: ' . $parent_section_id . PHP_EOL
				.' parent data: ' . json_encode( $parent_locator_data )
				, logger::ERROR
			);
			return false;
		}

		// Empty records case
		// generate new section and inject the data into de component
		// it save time machine for both.
		$n_rows = pg_num_rows($result);
		if ($n_rows<1) {

			// check if the parent section_tipo exists in jer_dd
			// if not, create new hierarchy with the section_id and create the ontology and jer_dd node
			// is necessary that parent section_tipo exists in ontology to save correctly the section with children data
				$section_model = RecordObj_dd::get_modelo_name_by_tipo($parent_section_tipo);
				if( empty($section_model) ){

					$install_options = new stdClass();
						$install_options->tld					= get_tld_from_tipo( $parent_section_tipo );
						$install_options->typology				= 15;
						$install_options->label					= get_tld_from_tipo( $parent_section_tipo );
						$install_options->active_in_thesaurus	= false;

					$install_response = install::activate_hierarchy( $install_options );

					if($install_response->result === false){
						debug_log(__METHOD__
							." Impossible to generate the hierarchy for section tipo: ".to_string($parent_section_tipo)
							, logger::ERROR
						);
					}
				}

			// create new section
				$section = section::get_instance(
					$parent_section_id, // string|null section_id
					$parent_section_tipo // string section_tipo
				);
				$section->forced_create_record();

			// create new component with parent data
				$component_tipo = $parent_locator_data->from_component_tipo;
				$model = RecordObj_dd::get_modelo_name_by_tipo($component_tipo);
				$parent_component = component_common::get_instance(
					$model, // string model
					$component_tipo, // string tipo
					$parent_section_id, // string section_id
					'edit', // string mode
					DEDALO_DATA_NOLAN, // string lang
					$parent_section_tipo // string section_tipo
				);
				$parent_component->set_dato( [$parent_locator_data] );
				$parent_component->Save();

			// set order
				$section_map			= section::get_section_map( $parent_section_tipo );
				$component_order_tipo	= $section_map->thesaurus->order ?? null;

				if( empty($component_order_tipo) ){
					$msg = "Failed to locate order in section_map of $parent_section_tipo ----------------------- review your ontology definition";
					debug_log(__METHOD__
						." ERROR: $msg ". PHP_EOL
						.' section_tipo: ' . $parent_section_tipo . PHP_EOL
						, logger::ERROR
					);
					return false;
				}

				// create new component order with parent data
				$model_order = RecordObj_dd::get_modelo_name_by_tipo($component_order_tipo);
				$order_component = component_common::get_instance(
					$model_order, // string model
					$component_order_tipo, // string tipo
					$parent_section_id, // string section_id
					'edit', // string mode
					DEDALO_DATA_NOLAN, // string lang
					$parent_section_tipo // string section_tipo
				);
				$order_component->set_dato( [$order] );
				$order_component->Save();

			return true;
		}

		while($row = pg_fetch_assoc($result)) {

			$id				= $row['id'];
			$datos			= !empty($row['datos']) ? json_decode($row['datos']) : null;

			if( empty($datos) ){
				$datos = new stdClass();
			}

			if( !isset($datos->relations) ){
				$datos->relations = [];
			}

			if( !isset($datos->components) ){
				$datos->components = new stdClass();
			}

			// set order
				$section_map			= section::get_section_map( $parent_section_tipo );
				$component_order_tipo	= $section_map->thesaurus->order ?? null;

				if( empty($component_order_tipo) ){
					$msg = "Failed to locate order in section_map of $parent_section_tipo ----------------------- review your ontology definition";
					debug_log(__METHOD__
						." ERROR: $msg ". PHP_EOL
						.' section_tipo: ' . $parent_section_tipo . PHP_EOL
						, logger::ERROR
					);
				}

				//set order data
				if(!isset($datos->components->$component_order_tipo)){
					$datos->components->$component_order_tipo = new stdClass();
				}
				$datos->components->$component_order_tipo->inf = 'Order [component_number]';
				$datos->components->$component_order_tipo->dato = new stdClass();
				$lang = 'lg-nolan';
				$datos->components->$component_order_tipo->dato->$lang = [$order];

			// set parent
				$exist = locator::in_array_locator( $parent_locator_data, $datos->relations, ['section_tipo','section_id','from_component_tipo','type']);
				if($exist===true){
					continue;
				}

				$datos->relations[] = $parent_locator_data;

			// data_encoded : JSON ENCODE ALWAYS !!!
			$data_encoded = json_handler::encode($datos);
			// prevent null encoded errors
			$safe_data = str_replace(['\\u0000','\u0000'], ' ', $data_encoded);

			// set the result into time_machine record
			$strQuery2	= "UPDATE $matrix_table SET datos = $1 WHERE id = $2 ";
			$result2	= pg_query_params(DBi::_getConnection(), $strQuery2, [$safe_data, $id]);
			if($result2===false) {
				$msg = "Failed Update section_data $id";
				debug_log(__METHOD__
					." ERROR: $msg ". PHP_EOL
					.' strQuery: ' . $strQuery . PHP_EOL
					.' section_tipo: ' . $parent_section_tipo . PHP_EOL
					.' section_id: ' . $parent_section_id
					, logger::ERROR
				);
				continue;
			}
		}

		return true;
	}//end set_parent_data



	/**
	* ADD_ROOT_NODE
	* Add new node in the hierarchies that has multiple root nodes, unify the criteria of the thesaurus
	* @return bool
	*/
	public static function add_root_node() : bool {

		// unfinished !

		$main_hierarchy_records = hierarchy::get_all_main_hierarchy_records();
		foreach ($main_hierarchy_records as $row) {

			$hierarchy_section_id	= $row->section_id;
			$hierarchy_section_tipo	= $row->section_tipo;

			// component children
			$model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_CHILDREN_TIPO);
			$component_children = component_common::get_instance(
				$model, // string model
				DEDALO_HIERARCHY_CHILDREN_TIPO, // string tipo
				$hierarchy_section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$hierarchy_section_tipo // string section_tipo
			);

			$children_data = $component_children->get_dato();

			$total = count($children_data);

			if ($total < 2) {
				// It's not necessary to group nothing. Skip this row
				continue;
			}

			// create the target section component
				$model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TARGET_SECTION_TIPO);
				$destination_section_component = component_common::get_instance(
					$model, // string model
					DEDALO_HIERARCHY_TARGET_SECTION_TIPO, // string tipo
					$hierarchy_section_id, // string section_id
					'edit', // string mode
					DEDALO_DATA_NOLAN, // string lang
					$hierarchy_section_tipo // string section_tipo
				);

			// create new section as top term
				$target_section_tipo = $destination_section_component->get_value();

				if (empty($target_section_tipo)) {
					debug_log(__METHOD__
						. " Ignored invalid target_section_tipo from value of component" . PHP_EOL
						. ' component_tipo: ' . DEDALO_HIERARCHY_TARGET_SECTION_TIPO . PHP_EOL
						. ' target_section_tipo: ' . to_string($target_section_tipo)
						, logger::ERROR
					);
					continue;
				}

				// fix counter
				counter::modify_counter(
					$target_section_tipo,
					'fix'
				);
				$new_section = section::get_instance(
					null, // string|null section_id
					$target_section_tipo // string section_tipo
				);
				$new_section_id = $new_section->Save();

			// create the child nodes of every locator and inject the new data
				foreach ($children_data as $children_locator) {

					//check section of the node if not exist ignore, error in data
						$check_section = section::get_instance(
							$children_locator->section_id, // string|null section_id
							$children_locator->section_tipo // string section_tipo
						);

						$data_check = $check_section->get_dato();

						if( empty($data_check->relations) ){
							continue;
						}

					$component_parent_tipo = component_relation_parent::get_parent_tipo( $children_locator->section_tipo );
					if (empty($component_parent_tipo)) {
						debug_log(__METHOD__
							. " Ignored unresolved component parent tipo from locator " . PHP_EOL
							. ' children_locator: ' . to_string($children_locator)
							, logger::ERROR
						);
						continue;
					}

					// create new component_relation_parent and add parent data
					$model = RecordObj_dd::get_modelo_name_by_tipo( $component_parent_tipo );
					$parent_component = component_common::get_instance(
						$model, // string model
						$component_parent_tipo, // string tipo
						$children_locator->section_id, // string section_id
						'edit', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$children_locator->section_tipo // string section_tipo
					);

					$parent_locator_data = new locator();
						$parent_locator_data->set_section_tipo( $target_section_tipo );
						$parent_locator_data->set_section_id( $new_section_id );
						$parent_locator_data->set_type( DEDALO_RELATION_TYPE_PARENT_TIPO );
						$parent_locator_data->set_from_component_tipo( $component_parent_tipo );



					$parent_component->set_dato( $parent_locator_data );

					$parent_component->Save();
				}

			// assign the new term data as term component
				$locator_data = new locator();
					$locator_data->set_section_tipo( $target_section_tipo );
					$locator_data->set_section_id( $new_section_id );

				$component_children->set_dato([$locator_data]);
				$component_children->Save();

			//named the new term with the name of the hierarchy

				$section_map = section::get_section_map( $target_section_tipo );
				if (isset($section_map->thesaurus->term)) {

					// hierarchy component name
					$hierarchy_term_model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TERM_TIPO);
					$hierarchy_term = component_common::get_instance(
						$hierarchy_term_model, // string model
						DEDALO_HIERARCHY_TERM_TIPO, // string tipo
						$hierarchy_section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_LANG, // string lang
						$hierarchy_section_tipo // string section_tipo
					);

					$hierarchy_term_data = $hierarchy_term->get_dato();

					$term_tipo = is_array( $section_map->thesaurus->term )
						? $section_map->thesaurus->term[0]
						: $section_map->thesaurus->term;

					// new node component name
					$node_term_model = RecordObj_dd::get_modelo_name_by_tipo($term_tipo);
					$node_term = component_common::get_instance(
						$node_term_model, // string model
						$term_tipo, // string tipo
						$new_section_id, // string section_id
						'list', // string mode
						DEDALO_DATA_LANG, // string lang
						$target_section_tipo // string section_tipo
					);
					// set the name of the hierarchy to the new term
					$children_data = $node_term->set_dato( $hierarchy_term_data );

					//save the name of the node.
					$node_term->Save();
				}

		}//end foreach ($main_hierarchy_records as $row)


		return true;
	}//end add_root_node



}//end transform_data_v6_5_0
