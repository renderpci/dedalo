<?php declare(strict_types=1);
/**
* CLASS MENU
* Handles menu logic
*/
class menu extends common {



	/**
	* CLASS VARS
	*/
		// id
		protected $id;



	/**
	* __CONSTRUCT
	*/
	public function __construct( string $mode='edit' ) {

		$this->id			= null;
		$this->tipo			= 'dd85'; // string class menu (dd85)
		$this->lang			= DEDALO_APPLICATION_LANG;
		$this->mode			= $mode;
		$this->section_tipo	= DEDALO_ROOT_TIPO; // 'dd1';

		parent::load_structure_data();
	}//end __construct



	/**
	* GET_TREE_DATALIST
	* Get the authorized areas for current user, datalist will be used for build menu tree.
	* $data->datalist = [{ontology_items}]
	* @return array $ar_areas
	*/
	public function get_tree_datalist() : array {
		$start_time = start_time();

		$ar_areas = [];

		$user_id = logged_user_id();
		if (empty($user_id)) {
			debug_log(__METHOD__
				. " Warning. Empty user id "
				, logger::WARNING
			);
			return $ar_areas;
		}

		$is_global_admin	= security::is_global_admin($user_id);
		$is_developer		= security::is_developer($user_id);

		// get all areas of the current installation
			$ar_full_areas = area::get_areas();

		// filter areas to non global_admin
			if($is_global_admin===true && $is_developer){

				// unfiltered areas
				$ar_areas = $ar_full_areas;

			}else{

				// get authorized areas for the current user with the data of component_security_access
				$ar_permisions_areas = security::get_ar_authorized_areas_for_user();

				// filter areas excluding by permissions and special tipos
				$ar_full_areas_length = sizeof($ar_full_areas);
				for ($i=0; $i < $ar_full_areas_length ; $i++) {

					$area_item = $ar_full_areas[$i];

					// maintenance area is only accessible by root, global admin or developer,
					if ($area_item->tipo===DEDALO_AREA_MAINTENANCE_TIPO && ($is_global_admin===false && $is_developer===false)) {
						// skip menu maintenance to non maintenance user, even if they have permissions
						continue;
					}

					if ($area_item->tipo===DEDALO_AREA_DEVELOPMENT_TIPO && $is_developer===false) {
						// skip menu developer to non developers, even if they have permissions
						continue;
					}

					$found = array_find($ar_permisions_areas, function($permisions_item) use($area_item){
						return $permisions_item->tipo===$area_item->tipo;
					});
					if (!is_null($found)) {
						$ar_areas[] = $area_item;
					}
				}
			}

		// section_tool case
		// section_tool is an alias of the section that will be use to load the information to the specific tool
		// all process use the target_section_tipo, because it has the information inside the db and the instances need to be connected to these section_tipo
		// menu replace the model and the tipo with the target section, and add the config for use to change the behavior of the real section.
			$tree_datalist = [];

			// retrieve the skip parents, used to skip tipo and transfer to his parent-> grandparent etc
			$skip_parents = array_filter($ar_areas, function($item) {
				return in_array($item->tipo, DEDALO_ENTITY_MENU_SKIP_TIPOS);
			});
			// retrieve the access areas without the skip tipos
			$acces_areas = array_filter($ar_areas, function($item) {
				return !in_array($item->tipo, DEDALO_ENTITY_MENU_SKIP_TIPOS);
			});
			// rearrange the array to remunerate the arrays
			$skip_parents		= array_values($skip_parents);
			$acces_areas		= array_values($acces_areas);
			$ar_areas_length	= sizeof($acces_areas);
			for ($i=0; $i < $ar_areas_length ; $i++) {

				$current_area = $acces_areas[$i];

				// get my parent recursively
				$parent = self::get_my_parent($current_area, $skip_parents);

				// item
					$datalist_item = (object)[
						'tipo'		=> $current_area->tipo,
						'model'		=> $current_area->model,
						'parent'	=> $parent,
						'label'		=> $current_area->label
					];

				// custom config cases
					switch (true) {

						case $current_area->model==='section_tool': // section_tool case
							$properties	= $current_area->properties;

							// tool_context
							$tool_name = isset($properties->tool_config) && is_object($properties->tool_config)
								? array_key_first(get_object_vars($properties->tool_config)) // ? key($properties->tool_config) // deprecated PHP>=8.1
								: false;

							if ($tool_name!==false) {

								$user_tools = tool_common::get_user_tools( logged_user_id() );
								$tool_info = array_find($user_tools, function($el) use($tool_name) {
									return $el->name===$tool_name;
								});
								if (!is_object($tool_info)) {
									debug_log(__METHOD__
										." WARNING. Ignored area '$current_area->tipo'. No tool found for tool name '$tool_name' in current_area: ".to_string($current_area)
										, logger::WARNING
									);
									continue 2;
								}else{

									$tool_config	= $properties->tool_config->{$tool_name} ?? false;
									$tool_context	= tool_common::create_tool_simple_context($tool_info, $tool_config);

									// overwrite current_area (!)
									$datalist_item->model	= 'section';
									$datalist_item->tipo	= $properties->config->target_section_tipo ?? $current_area->tipo;
									$datalist_item->config	= $properties->config ?? new StdClass();
									$datalist_item->config->tool_context = $tool_context;
								}
							}
							break;

						case $current_area->tipo===DEDALO_THESAURUS_VIRTUALS_AREA_TIPO: // thesaurus terms case
							// overwrite properties
							$datalist_item->model = 'area_thesaurus';
							// custom config
							$datalist_item->config = (object)[
								// swap_tipo. Is used by JS menu parser to change current item tipo on the fly
								'swap_tipo' => DEDALO_THESAURUS_TIPO // dd100
							];
							break;

						case $current_area->tipo===DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO: // thesaurus models case
							// overwrite properties
							$datalist_item->model = 'area_thesaurus';
							// custom config
							$datalist_item->config = (object)[
								'thesaurus_view_mode' => 'model',
								// swap_tipo. Is used by JS menu parser to change current item tipo on the fly
								'swap_tipo' => DEDALO_THESAURUS_TIPO, // dd100
								'url_vars' => [
									'thesaurus_view_mode' => 'model'
								]
							];
							break;

						default:
							// Nothing to do
							break;
					}

				// add
					$tree_datalist[] = $datalist_item;
			}//end for ($i=0; $i < $ar_areas_length ; $i++)


		// debug
			debug_log(
				__METHOD__.' Resolved get_tree_datalist (total: '.count($tree_datalist).') in  '.exec_time_unit($start_time,'ms').' ms',
				logger::DEBUG
			);

		return $tree_datalist;
	}//end get_tree_datalist



	/**
	* GET_MY_PARENT
	* Recursive find parent area function
	* @param object $area
	* @param array $skip_parents
	* @return string|null $parent
	* Sample: 'tch188'
	*/
	private static function get_my_parent( object $area, array $skip_parents ) : ?string  {

		// find if the my parent is in skip parents
		$current_parent = array_find($skip_parents, function($item) use ($area){
			return $area->parent === $item->tipo;
		});
		// if my parent is in skip recursion to search if his parent is in skip parents
		// else the parent is the current area->parent, the last parent in the chain
		if(!empty($current_parent)){
			return self::get_my_parent($current_parent, $skip_parents);
		}

		$parent = $area->parent ?? null;


		return $parent;
	}//end get_my_parent



	/**
	* GET_INFO_DATA
	* get the global information of the current installation.
	* @return object $info_data
	*/
	public function get_info_data() : object {

		$info_data = new stdClass();
			// vars already included in environment
			$info_data->dedalo_version		= DEDALO_VERSION;
			$info_data->dedalo_build		= DEDALO_BUILD;
			$info_data->dedalo_db_name		= DEDALO_DATABASE_CONN;
			$info_data->pg_version			= (function() {
				try {
					$conn = DBi::_getConnection() ?? false;
					if ($conn) {
						return pg_version(DBi::_getConnection())['server'];
					}
					return 'Failed!';
				}catch(Exception $e){
					return 'Failed with Exception! ' . $e->getMessage();
				}
			})();
			$info_data->php_version			= PHP_VERSION;
			$info_data->php_version			.= ' jit:'. (int)(opcache_get_status()['jit']['enabled'] ?? false);
			$info_data->memory				= to_string(ini_get('memory_limit'));
			$info_data->php_sapi_name		= php_sapi_name();
			// other vars
			$info_data->entity				= DEDALO_ENTITY;
			$info_data->php_user			= get_current_user();
			$info_data->php_session_handler	= ini_get('session.save_handler');
			$info_data->pg_db				= pg_version(DBi::_getConnection())['server'];
			$info_data->server_software		= $_SERVER['SERVER_SOFTWARE'] ?? 'unknown';
			$info_data->ip_server			= $_SERVER['SERVER_ADDR'] ?? 'unknown';


		return $info_data;
	}//end get_info_data



	/**
	* GET_STRUCTURE_CONTEXT
	* Resolve menu context dd_object
	* @param int $permissions = 1
	* @param bool $add_request_config = false
	* @return dd_object $dd_object
	*/
	public function get_structure_context( int $permissions=1, bool $add_request_config=false ) : dd_object {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
		}

		// short vars
			$tipo	= $this->get_tipo();
			$mode	= $this->get_mode();
			$label	= $this->get_label();
			$lang	= $this->get_lang();
			$model	= get_class($this);

		// tools (menu tools like 'tool_user_admin')
			$tools		= [];
			$tools_list	= $this->get_tools();
			foreach ($tools_list as $tool_object) {

				$properties		= $tool_object->properties;
				$tool_config	= !empty($properties) && isset($properties->tool_config->{$tool_object->name})
					? $properties->tool_config->{$tool_object->name}
					: null;

				$current_tool_section_tipo	= $this->section_tipo ?? $this->tipo;
				$tool_context				= tool_common::create_tool_simple_context(
					$tool_object,
					$tool_config,
					$this->tipo,
					$current_tool_section_tipo
				);

				// add tool
				$tools[] = $tool_context;
			}//end foreach ($tools_list as $item)

		// dd_object
			$dd_object = new dd_object((object)[
				'label'			=> $label,
				'tipo'			=> $tipo,
				'model'			=> $model,
				'lang'			=> $lang,
				'mode'			=> $mode,
				'permissions'	=> $permissions,
				'tools'			=> $tools
			]);

		// Debug
			if(SHOW_DEBUG===true) {
				$time = exec_time_unit($start_time,'ms');

				$debug = new stdClass();
					$debug->exec_time = $time.' ms';

				$dd_object->debug = $debug;
			}


		return $dd_object;
	}//end get_structure_context



}//end menu class
