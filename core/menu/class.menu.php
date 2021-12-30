<?php
/*
* CLASS MENU
*
*
*/
class menu extends common {



	protected $tipo = 'dd85';
	protected $RecordObj_dd;



	/**
	* __CONSTRUCT
	*/
	public function __construct($modo='edit') {

		$id					= null;
		$tipo				= $this->tipo;
		$this->id			= $id;
		$this->tipo			= $tipo;
		$this->lang			= DEDALO_DATA_LANG;
		$this->modo			= $modo;
		$this->section_tipo	= 'dd1';

		parent::load_structure_data();


		return true;
	}//end __construct



	/**
	* GET_TREE_DATALIST
	* Get the authorized areas for current user, datalist will be used for build menu tree.
	* $data->datalist = [{ontology_items}]
	* @return array $ar_areas
	*/
	public function get_tree_datalist() {

		$ar_areas = [];

		$user_id			= navigator::get_user_id();
		$is_global_admin	= security::is_global_admin($user_id);

		if($user_id===DEDALO_SUPERUSER || $is_global_admin===true){
			// get all areas of the current installation
			$ar_areas = area::get_areas();

		}else{
			// get authorized areas for the current user with the data of component_security_access
			$ar_permisions_areas = security::get_ar_authorized_areas_for_user();

			// foreach ($ar_permisions_areas as $item) {
			$ar_permisions_areas_length = sizeof($ar_permisions_areas);
			for ($i=0; $i < $ar_permisions_areas_length ; $i++) {
				$item		= $ar_permisions_areas[$i];
				$ar_areas[]	= ontology::tipo_to_json_item($item->tipo);
			}
		}

		// section_tool case
		// section_tool is a alias of the section that will be use to load the information to the specific tool
		// all process use the target_section_tipo, because it has the information inside the db and the instances need to be connected to these section_tipo
		// menu replace the model and the tipo with the target section, and add the config for use to change the behavior of the real section.
			$ar_areas_length = sizeof($ar_areas);
			for ($i=0; $i < $ar_areas_length ; $i++) {

				$current_area = $ar_areas[$i];

				if($current_area->model==='section_tool'){

					$section_tool_tipo = $current_area->tipo;

					$RecordObj_dd	= new RecordObj_dd($section_tool_tipo);
					$properties		= $RecordObj_dd->get_properties();

					// overwrite current_area (!)
						$current_area->model	= 'section';
						$current_area->tipo		= $properties->config->target_section_tipo ?? $current_area->tipo;
						$current_area->config	= $properties->config ?? null;

					$RecordObj_dd	= new RecordObj_dd($section_tool_tipo);
					$properties		= $RecordObj_dd->get_properties();

					// overwrite current_area (!)
						$current_area->model	= 'section';
						$current_area->tipo		= $properties->config->target_section_tipo ?? $current_area->tipo;
						$current_area->config	= $properties->config ?? null;

					// tool_context
						$tool_name = isset($properties->tool_config) && is_object($properties->tool_config)
							// ? key($properties->tool_config) // deprecated PHP>=8.1
							? array_key_first(get_object_vars($properties->tool_config))
							: false;
								dump($tool_name, ' tool_name +--------------------------------------+ '.to_string());
						if ($tool_name) {
							$ar_tool_object	= tool_common::get_client_registered_tools([$tool_name]);
							if (empty($ar_tool_object)) {
								debug_log(__METHOD__." ERROR. No tool found for tool '$tool_name' in current_area ".to_string($current_area), logger::ERROR);
							}else{
								$tool_config	= $properties->tool_config->{$tool_name} ?? false;
								$tool_context	= tool_common::create_tool_simple_context($ar_tool_object[0], $tool_config);
								$current_area->config->tool_context = $tool_context;
								// dump($current_area->config, ' ++++++++++++++++++++++++++++++++++++++ current_area->config ++ '.to_string($section_tool_tipo));
							}
						}
				}
			}//end for ($i=0; $i < $ar_areas_length ; $i++)

		$tree_datalist = $ar_areas;


		return $tree_datalist;
	}//end get_tree_datalist



	/**
	* GET_INFO_DATA
	* get the global information of the current intalation.
	* @return object $info_data
	*/
	public function get_info_data() {

		$jit_enabled = opcache_get_status()['jit']['enabled'] ?? false;

		$info_data = new stdClass();
			$info_data->entity				= DEDALO_ENTITY;
			$info_data->php_user			= get_current_user();
			$info_data->php_version			= phpversion() .'-'. json_encode($jit_enabled);
			$info_data->php_session_handler	= ini_get('session.save_handler');
			$info_data->pg_db				= pg_version(DBi::_getConnection())['server'];
			$info_data->pg_db_name			= DEDALO_DATABASE_CONN;
			$info_data->server_software		= $_SERVER['SERVER_SOFTWARE'];
			$info_data->dedalo_version		= DEDALO_VERSION;
			$info_data->dedalo_build		= DEDALO_BUILD;
			$info_data->php_sapi_name		= php_sapi_name();

		return $info_data;
	}//end get_info_data



	/**
	* GET_STRUCTURE_CONTEXT
	* @return object $dd_object
	*/
	public function get_structure_context($permissions=1, $add_rqo=false) {

		// short vars
			$tipo	= $this->get_tipo();
			$mode	= $this->get_modo();
			$label	= $this->get_label();
			$lang	= $this->get_lang();
			$model	= get_class($this);

		// dd_object
			$dd_object = new dd_object((object)[
				'label'			=> $label,
				'tipo'			=> $tipo,
				'model'			=> $model,
				'lang'			=> $lang,
				'mode'			=> $mode,
				'permissions'	=> $permissions
			]);
		
		return $dd_object;
	}//end get_structure_context




}//end menu class
