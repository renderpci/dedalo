<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PORTAL
* Manages portal components for creating relationships between sections in Dédalo.
*
* Portals enable linking records from one section to another, displaying related
* data in a list format with options to add, remove, and navigate to linked records.
* Evolved from and integrates the former component_autocomplete functionality.
*
* Key features:
* - Links records across different sections (many-to-many relationships)
* - Displays related records in a sortable list view
* - Supports autocomplete for finding and linking records
* - Configurable target sections via ontology properties
* - External mode for calculated/inverse relationships
* - Link and unlink operations with duplicate detection
*
* Data is stored as locator objects in the database, referencing target section records.
*
* Extends component_relation_common for relationship management capabilities.
*
* @package Dédalo
* @subpackage Core
*/
class component_portal extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for portal linking relationships.
		 * Inherited from DEDALO_RELATION_TYPE_LINK constant.
		 * Defines the type of relationship created when records are linked through the portal.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;

		/**
		 * Properties used to detect duplicate locators when adding new relationships.
		 * Locators with identical values for all these properties are considered duplicates.
		 * - section_tipo : Target section type identifier
		 * - section_id : Target section record ID
		 * - type : Relation type (typically link type)
		 * - from_component_tipo : Source component tipo creating the relation
		 * @var array $test_equal_properties
		 */
		public array $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

		/**
		 * Array of target section tipos for this portal.
		 * Used to determine valid sections for linking records.
		 * Populated from relation terms; supports both real and virtual sections.
		 * Empty array indicates all sections are valid targets (no restriction).
		 * @var array $ar_target_section_tipo
		 */
		protected array $ar_target_section_tipo = [];



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load data to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// External case (inverse portals with data dependency), calculate his data again.
		$properties = $this->get_properties() ?? new stdClass();
		if(isset($properties->source->mode) && $properties->source->mode==='external'){
			$options = new stdClass();
				$options->save				= true; // $mode==='edit' ? true : false;
				$options->changed			= false; // $mode==='edit' ? true : false;
				$options->current_data		= false; // $this->get_data();
				$options->references_limit	= 0; // (!) Set to zero to get all references to enable sort

			$this->set_data_external($options);	// Forces update data with calculated external data

			return true;
		}

		// Force loads data always !IMPORTANT
		$data = $this->get_data();

		debug_log(__METHOD__
			." Ignored regenerate action in this component. USE generate_relations_table_data TO REGENERATE RELATIONS ". PHP_EOL
			.' tipo: '.$this->tipo
			, logger::WARNING
		);

		if(empty($data)) {
			return true;
		}

		// Save component data
			 // $this->Save();


		return true;
	}//end regenerate_component



	/**
	* REMOVE_ELEMENT
	*
	* @param object $options
	* 	sample:
	* {
	* 	locator : object locator,
	* 	remove_mode : delete_link | delete_all
	* }
	* @return object $response
	*/
	public function remove_element( object $options ) : object {

		// options
			$locator		= $options->locator ?? null;
			$remove_mode	= $options->remove_mode ?? 'delete_link'; // delete_link | delete_all (deletes link and resource)

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// Remove locator from data
			$result = $this->remove_locator( $locator );
			if ($result!==true) {
				$response->msg .= " Error on remove locator. Skipped action ";
				return $response;
			}

		// Remove target record
			if ($remove_mode==='delete_all') {

				// REL-06: delete_all hard-deletes the TARGET section record, which is a
				// different section from the host portal. Require delete-level permission
				// on the target itself — permission on the host record is not sufficient.
				$target_perms = common::get_permissions($locator->section_tipo, $locator->section_tipo);
				if ($target_perms < 2) { // 1=read, 2=write/delete, 3=admin
					$response->msg .= " Insufficient permissions to delete target section ($locator->section_tipo)";
					return $response;
				}

				$section = section::get_instance(
					$locator->section_id, // string section_id
					$locator->section_tipo // string section_tipo
				);
				$delete  = $section->Delete(
					'delete_record' // string delete_mode
				);
				if ($delete!==true) {
					$response->msg .= " Error on remove target section ($locator->section_tipo - $locator->section_id). Skipped action ";
					return $response;
				}
			}

		// Update state
		// DELETE AND UPDATE the component state of this section and his parents
			$this->remove_state_from_locator( $locator );

		// Save current component updated data
			$this->Save();

		// response
			$response->result		= true;
			$response->remove_mode	= $remove_mode;
			$response->msg			= 'OK. Request done '.__METHOD__;


		return $response;
	}//end remove_element



	/**
	* UPDATE_DATA_VERSION
	* Is fired by area_maintenance update_data to transform
	* component data between different versions or upgrades
	* @see update::components_update
	* @param object $options
	* {
	* 	update_version: array
	* 	data_unchanged: mixed
	* 	reference_id: string|int
	* 	tipo: string
	* 	section_id: string|int
	* 	section_tipo: string
	* 	context: string (default: 'update_component_data')
	* }
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	*/
	public static function update_data_version( object $options ) : object {

		// options
			$update_version	= $options->update_version ?? null;
			$data_unchanged	= $options->data_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_data';

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_data_version



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path( string $component_tipo, string $section_tipo ) : array {

		$path = [];

		// no request_config case. @see common::get_section_elements_context
		// sometimes, request_config is not calculated for speed (context simple case)
		// in those cases, order_path is not important and could be ignored
			if (!isset($this->request_config)) {
				return $path;
			}


		// from_section_tipo. If exists and is distinct to section_tipo, build and prepend the caller item
			if (isset($this->from_section_tipo) && $this->from_section_tipo!==$section_tipo) {
				$path[] = (object)[
					'component_tipo'	=> $this->from_component_tipo,
					'model'				=> ontology_node::get_model_by_tipo($this->from_component_tipo,true),
					'name'				=> ontology_node::get_term_by_tipo($this->from_component_tipo),
					'section_tipo'		=> $this->from_section_tipo
				];
			}

		// self component path
			$path[] = (object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> ontology_node::get_model_by_tipo($component_tipo,true),
				'name'				=> ontology_node::get_term_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			];

		// time machine cases. Do not resolve ddo_map. Tipo 'dd578' is column `user_id`
			if($this->tipo===DEDALO_TIME_MACHINE_COLUMN_USER_ID) {
				// When `column` property is set, it will be used literally instead of parsing the path.
				$path[0]->column = 'user_id';
				return $path;
			}

		// ddo_map. request_config show ddo_map first item is used to sort
		// must be calculated previously by the get_structure_context method
			$request_config			= $this->request_config ?? [];
			$request_config_item	= array_find($request_config, function($el){
				return $el->api_engine==='dedalo';
			});
			// non defined case
			if (empty($request_config_item) && !empty($request_config)) {
				// select first
				$request_config_first_item = reset($request_config);
				if (isset($request_config_first_item->api_engine) && $request_config_first_item->api_engine!=='dedalo') {
					// nothing to do
				}else{
					// set first item as default if no definition exists of api_engine
					$request_config_item = $request_config_first_item;
				}
			}
			$show = $request_config_item->show ?? null;
			if (empty($show)) {

				debug_log(__METHOD__.
					" Ignored empty request_config_item->show (mode:$this->mode) [$this->section_tipo - $this->tipo - "
					. ontology_node::get_term_by_tipo($this->tipo) ."]". PHP_EOL
					. 'request_config: ' . PHP_EOL
					. json_handler::encode($request_config)
					, logger::ERROR
				);

			}else{

				$first_item	= $show->ddo_map[0] ?? null;

				if (empty($first_item)) {
					debug_log(__METHOD__.
						" Ignored show empty first_item (mode:$this->mode) [$this->section_tipo - $this->tipo - ".
						ontology_node::get_term_by_tipo($this->tipo).
						"]. It may be due to a lack of permissions.",
						logger::WARNING
					);
					// dump($show, ' show empty first_item ++++++++ '.to_string($this->tipo));
				}else{
					// target component
					$tmp_section_tipo = $first_item->section_tipo;
					$path[] = (object)[
						'component_tipo'	=> $first_item->tipo,
						'model'				=> ontology_node::get_model_by_tipo($first_item->tipo,true),
						'name'				=> ontology_node::get_term_by_tipo($first_item->tipo),
						// note that section_tipo is used only to give a name to the join item.
						// results are not really filtered by this section_tipo
						'section_tipo'		=> is_array($tmp_section_tipo)
							? reset($tmp_section_tipo)
							: $tmp_section_tipo
					];
				}
			}


		return $path;
	}//end get_order_path



}//end class component_portal
