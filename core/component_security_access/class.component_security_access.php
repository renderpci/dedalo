<?php declare(strict_types=1);
/**
* CLASS COMPONENT SECURITY ACCESS
* Manages ontology elements access and permissions
*/
class component_security_access extends component_common {



	/**
	* @var
	*/
	// datalist array
	public $datalist;
	// data_column. DB column where to get the data.
	protected $data_column = 'misc';



	/**
	* GET_CACHE_TREE_FILE_NAME
	* @param string $lang
	* @return string
	*/
	public static function get_cache_tree_file_name(string $lang) : string {

		return 'cache_tree_'.$lang.'.json';
	}//end get_cache_tree_file_name



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component_common method
	* @see class.diffusion_mysql.php
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		return 'There is no diffusion value for this component';
	}//end get_diffusion_value



	/**
	* GET_DATALIST
	* Generates the whole component datalist (ontology tree) to set access permissions by admins
	* The datalist will use to represent the tree hierarchy,
	* The datalist has not the permissions because it is a common tree for all profiles, and permissions are different for every profile.
	* As only section children nodes has permissions data (0,1,2)
	* Areas and Sections render and propagate permissions to its children making a calculation of the real data (provided by its own children).
	* Datalist includes all parents chain to locate easily all children of one node or get all parents of one node.
	* Note that login sequence launch a background process to calculate this datalist because
	* the resolution is considerably expensive (about 3 to 6 secs)
	* @param int $user_id
	* @return array $datalist
	*/
	public function get_datalist(int $user_id) : array {
		$start_time = start_time();

		// already resolved in current instance
			if (isset($this->datalist)) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						.' Return already set datalist. count: '.count($this->datalist)
						, logger::DEBUG
					);
				}
				return $this->datalist;
			}

		// cache
			$use_cache = defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path']);
			if ($use_cache===true) {

				// cache_file_name. Like 'cache_tree_'.DEDALO_APPLICATION_LANG.'.json'
					$cache_file_name = component_security_access::get_cache_tree_file_name(DEDALO_APPLICATION_LANG);

				// cache from file. (!) This file is generated in background on every user login as 'entity_userID_cache_tree_lg-eng.json'
					$contents = dd_cache::cache_from_file((object)[
						'file_name' => $cache_file_name
					]);
					$datalist = (!empty($contents))
						? json_decode($contents)
						: null;
					if (!empty($datalist)) {
						$this->datalist = $datalist;
						debug_log(__METHOD__
							. ' Return already calculated and cached in file datalist. Time: ' . exec_time_unit($start_time,'ms').' ms' .PHP_EOL
							. ' datalist total items: ' . (!empty($datalist) ? count($datalist) : 0) . PHP_EOL
							. ' contents strlen: ' . strlen($contents)
							, logger::DEBUG
						);
						return $datalist;
					}else{
						if (!empty($contents)) {
							debug_log(__METHOD__
								. " Error decoding file contents from cache file" . PHP_EOL
								. ' cache_file_name: ' . to_string($cache_file_name) . PHP_EOL
								. ' contents: ' . $contents
								, logger::ERROR
							);
						}
					}
			}

		// short vars
			$is_global_admin = security::is_global_admin($user_id);

		// full areas and sections list
			$ar_areas = area::get_areas();

		// areas (including sections)
			if($is_global_admin===true){

				// unfiltered case

			}else{

				// filtered by user data case

				$user_component_security_access	= security::get_user_security_access($user_id);
				$user_dato						= $user_component_security_access->get_dato() ?? [];

				$ar_auth_areas = [];
				foreach ($ar_areas as $current_area) {

					$found = array_find($user_dato, function($el) use($current_area){
						return $el->tipo===$current_area->tipo;
					});
					if ($found!==null) {
						$ar_auth_areas[] = $current_area;
					}
				}

				// replace whole list by user authorized areas
				$ar_areas = $ar_auth_areas;
			}

		// datalist. resolve section (real and virtual) components
			$ar_check	= [];
			$datalist	= [];
			$ar_parent	= [];
			$ar_areas_length = sizeof($ar_areas);
			for ($i=0; $i < $ar_areas_length ; $i++) {

				$current_area = $ar_areas[$i];
				$section_tipo = $current_area->tipo; // same as tipo

				// check for duplicates
				$duplicate_key = $section_tipo .'_'. $current_area->parent;
				if (isset($ar_check[$duplicate_key])) {
					debug_log(__METHOD__
						.' Ignored duplicated area item ' . PHP_EOL
						.' current_area: ' . to_string($current_area)
						, logger::ERROR
					);
					continue;
				}else{
					$ar_check[$duplicate_key] = true;
				}

				// Set all parents chain
				// store the all parents to be used in client filters to speed up its resolution to represent the tree
				// and the calculated permissions hierarchy of areas and sections (inheritance from the combination of components permissions)
				// if the parent doesn't exists in the parent chain add it
				// if the parent is set previously remove all the parents from the current parent position
				$parent_key = $current_area->parent;
				$position = array_search($parent_key, $ar_parent);
				if( $position===false ){
					$ar_parent[] = $parent_key;
				}else{
					// the splice must contain the current parent, therefore the position is +1 to include it.
					array_splice($ar_parent, $position+1);
				}

				// area could be area, area_thesaurus, section, ...
				$datalist_item = (object)[
					'tipo'			=> $current_area->tipo,
					'section_tipo'	=> $section_tipo,
					'model'			=> $current_area->model,
					'label'			=> $current_area->label,
					'parent'		=> $current_area->parent,
					'ar_parent'		=> $ar_parent
				];

				$datalist[] = $datalist_item;

				// section case. Add components, groupers, buttons, etc.
				if ($current_area->model==='section') {

					// recursive calculated children area added too
					$children = self::get_element_datalist($current_area->tipo);
					// add already calculated section parents to the chain
					foreach ($children as $child) {
						$section_parents = array_merge( $ar_parent, $child->ar_parent);
						$child->ar_parent = $section_parents;
					}

					$datalist = array_merge(
						$datalist,
						$children
					);
				}
			}//end for ($i=0; $i < $ar_areas_length ; $i++)

		// fix value
			$this->datalist = $datalist;

		// cache session. Store in session for speed
			if ($use_cache===true) {
				// cache to file.
				// (!) This file is already generated on user login, launching the process in background
			}

		// debug
			debug_log(__METHOD__
				.' Calculated datalist (total: '.count($datalist).') in  '
				. exec_time_unit($start_time,'ms').' ms'
				, logger::DEBUG
			);


		return $datalist;
	}//end get_datalist



	/**
	* GET_ELEMENT_DATALIST
	* Create the datalist items inside sections.
	* @param string $section_tipo
	* @return array $datalist
	*/
	public static function get_element_datalist(string $section_tipo) : array {

		$datalist = [];

		// get the exclude elements defined into ontology to be remove of the datalist
		$ar_tipo_to_be_exclude	= null;
		$ar_exclude_elements	= ontology_node::get_ar_tipo_by_model_name_and_relation(
			$section_tipo,
			'exclude_elements',
			'children',
			true
		);
		if (isset($ar_exclude_elements[0])) {
			$exclude_elements_tipo = $ar_exclude_elements[0];
			$ar_tipo_to_be_exclude = ontology_node::get_ar_terminos_relacionados(
				$exclude_elements_tipo,
				false,
				true
			);
		}

		// get all ontology nodes inside the main section (section_groups, components, tabs, sections, etc.)
		$children_recursive = self::get_children_recursive_security_acces($section_tipo, $ar_tipo_to_be_exclude);

		// v6
		// see if the section has a ddo_map defined
			$ontology_node		= new ontology_node($section_tipo);
			$section_properties	= $ontology_node->get_properties();
			// check section properties request_config
			if(isset($section_properties->source) && isset($section_properties->source->request_config)){
				// v6 children
				$v6_children = [];
				foreach ($section_properties->source->request_config as $item_request_config) {
					$ddo_map = $item_request_config->show->ddo_map;
					if(isset($ddo_map)){
						$v6_children = array_filter($ddo_map, function($el) use ($section_tipo){
							return ($el->parent === 'self' || $el->parent === $section_tipo);
						});
					}
				}

				// with request_config case list
				$children_list = [];

				// create the children list of the v6 components
				foreach ($v6_children as $ddo) {
					$item = (object)[
						'tipo'			=> $ddo->tipo,
						'section_tipo'	=> $section_tipo,
						'model'			=> ontology_node::get_modelo_name_by_tipo($ddo->tipo, true),
						'label'			=> ontology_node::get_termino_by_tipo($ddo->tipo, DEDALO_APPLICATION_LANG, true, true),
						'parent'		=> $ddo->parent_grouper ?? $section_tipo
					];
					$children_list[] = $item;
				}

				// add 'default' calculated items excluding components and section_groups
				foreach ($children_recursive as $current_item) {
					if (strpos($current_item->model, 'component_')===0 || $current_item->model==='section_group'){
						continue;
					}
					$children_list[] = $current_item;
				}

			}else{

				// default case list
				$children_list = $children_recursive;
			}


		$ar_parent = [];

		foreach ($children_list as $current_child) {

			$parent_key = $current_child->parent;
			$position = array_search($parent_key, $ar_parent);
			if( $position===false ){
				$ar_parent[] = $parent_key;
			}else{
				array_splice($ar_parent, $position+1);
			}

			// add
			$item = (object)[
				'tipo'			=> $current_child->tipo,
				'section_tipo'	=> $section_tipo, // force current section_tipo
				'model'			=> $current_child->model,
				'label'			=> $current_child->label,
				'parent'		=> $current_child->parent,
				'ar_parent'		=> $ar_parent
			];
			$datalist[] = $item;
		}


		return $datalist;
	}//end get_element_datalist



	/**
	* GET_CHILDREN_RECURSIVE_SECURITY_ACCES
	* Custom recursive children resolve
	* @param string $tipo
	* @param array|null $ar_tipo_to_be_exclude
	* @return array $element_datalist
	*/
	private static function get_children_recursive_security_acces( string $tipo, ?array $ar_tipo_to_be_exclude=null ) : array {

		// static cache
			// static $children_recursive_security_access_data;
			// if(isset($children_recursive_security_access_data[$tipo])) {
			// 	return $children_recursive_security_access_data[$tipo];
			// }

		$ar_elements = [];

		$source_model = ontology_node::get_modelo_name_by_tipo($tipo,true);
		switch ($source_model) {

			case 'section':
				$section_tipo				= $tipo;
				$ar_modelo_name_required	= ['section_group','section_tab','tab','button_','relation_list','time_machine_list','component_'];
				// real section
					$ar_ts_children = section::get_ar_children_tipo_by_model_name_in_section(
						$section_tipo, // string section_tipo
						$ar_modelo_name_required, // array ar_modelo_name_required
						true, // bool from_cache
						true, // bool resolve_virtual
						false, // bool recursive
						false // bool search_exact
					);

				// virtual case add too
					$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
					if ($section_tipo!==$section_real_tipo) {
						// Virtual section too is necessary (buttons specifics)
						$ar_ts_children_v = section::get_ar_children_tipo_by_model_name_in_section(
							$section_tipo, // string section_tipo
							$ar_modelo_name_required, // array ar_modelo_name_required
							true, // bool from_cache
							false, // bool resolve_virtual
							false, // bool recursive
							false// bool search_exact
						);
						$ar_ts_children	= array_merge($ar_ts_children, $ar_ts_children_v);
					}
				break;

			default:
				# Areas or section groups ...
				$ontology_node	= new ontology_node($tipo);
				$ar_ts_children	= $ontology_node->get_ar_children_of_this();
				break;
		}

		// ar_exclude_model
			$ar_exclude_model = array(
				'component_security_administrator',
				'section_list',
				'search_list',
				'component_semantic_node',
				'box_elements',
				'exclude_elements',
				'edit_view'
			);

		// ar_exclude_components
			$ar_exclude_components = defined('DEDALO_AR_EXCLUDE_COMPONENTS')
				? DEDALO_AR_EXCLUDE_COMPONENTS
				: [];

		// $ar_children = array_unique($ar_ts_children);
		$ar_children = $ar_ts_children;
		foreach($ar_children as $element_tipo) {

			// remove exclude components and elements defined in ontology
				if(isset($ar_tipo_to_be_exclude) && in_array($element_tipo, $ar_tipo_to_be_exclude)){
					continue;
				}

			// remove_exclude_models
				$component_model = ontology_node::get_modelo_name_by_tipo($element_tipo, true);
				if( in_array($component_model, $ar_exclude_model)) {
					continue ;
				}

			// remove_exclude_terms : config excludes. If installation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove from ar_temp
				if (in_array($element_tipo, $ar_exclude_components)) {
					continue;
				}

			// get the ontology JSON format
				$item = (object)[
					'tipo'			=> $element_tipo,
					'section_tipo'	=> $tipo,
					'model'			=> ontology_node::get_modelo_name_by_tipo($element_tipo, true),
					'label'			=> ontology_node::get_termino_by_tipo($element_tipo, DEDALO_APPLICATION_LANG, true, true),
					'parent'		=> $tipo
				];
				$ar_elements[] = $item;

			$ar_elements = array_merge( $ar_elements, self::get_children_recursive_security_acces($element_tipo, $ar_tipo_to_be_exclude) );
		}

		// STORE CACHE DATA
		// $children_recursive_security_access_data[$tipo] = $ar_elements;


		return $ar_elements;
	}//end get_children_recursive_security_acces



	/**
	* GET ARRAY TIPO ADMIN
	* Returns the 'Admin' area as well as its children (used to exclude the admin options in the tree)
	* @return array $ar_tipo_admin
	*/
	public static function get_ar_tipo_admin() : array {

		// static cache
			static $ar_tipo_admin;
			if(isset($ar_tipo_admin)) {
				return $ar_tipo_admin;
			}

		$ar_result 	= ontology_node::get_ar_tipo_by_model_name($modelo_name='area_admin', $prefijo='dd');
		$ar_tesauro = array();

		if(!empty($ar_result[0])) {
			$tipo					= $ar_result[0];
			$obj					= new ontology_node($tipo);
			$ar_children_of_this	= $obj->get_ar_children_of_this();
			$ar_tesauro				= $ar_children_of_this;
		}
		// We add the term itself as the father of the tree
		// array_push($ar_tesauro, $tipo);
		array_unshift($ar_tesauro, $tipo);

		// store cache data
			$ar_tipo_admin = $ar_tesauro ;


		return $ar_tesauro ;
	}//end get_ar_tipo_admin



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '6.0.0':
				// old dato: {"oh1":{"oh2":2}}
				// new dato :[{"tipo":"oh2","section_tipo":"oh1","value":2}]
				if(!empty($dato_unchanged) && is_object($dato_unchanged)) {

					$new_dato = [];
					foreach ($dato_unchanged as $current_parent => $current_ar_tipo) {
						foreach ($current_ar_tipo as $current_tipo => $value) {
							$current_dato = new stdClass();
								$current_dato->tipo			= $current_tipo;
								$current_dato->section_tipo	= $current_parent;
								$current_dato->value		= intval($value);
							// add
							$new_dato[] = $current_dato;
						}
					}

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{
					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* CALCULATE_TREE
	* @param int $user_id
	* @param string $lang
	* @return array $datalist
	*/
	public static function calculate_tree(int $user_id, string $lang) : array {
		$start_time = start_time();

		// profile_section_id
			if(security::is_global_admin($user_id)===true){

				$section_id = null;

			}else{

				$user_profile_locator = security::get_user_profile( $user_id );
				if (!empty($user_profile_locator)) {
					$section_id = (int)$user_profile_locator->section_id;
				}else{
					debug_log(__METHOD__.
						" ERROR on get user_profile_locator: user_id: ".to_string($user_id),
						logger::ERROR
					);
				}
			}

		// $fiber = new Fiber(function() use($section_id, $user_id, $start_time) : array {

			debug_log(__METHOD__
				. " (1 start) user_id: " .$user_id. ' ('.$lang.')'
				. ' ))) launching datalist ///////////////////////////////////////////////////// '
				, logger::WARNING
			);

			$section_tipo				= DEDALO_SECTION_PROFILES_TIPO;
			$tipo						= DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO;
			$model						= ontology_node::get_modelo_name_by_tipo($tipo,true);
			$component_security_access	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string|null section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo, // string section_tipo
				false
			);
			$datalist = $component_security_access->get_datalist( $user_id );

			// Fiber::suspend();
			debug_log(__METHOD__
				. " (2 end) lang: $lang, count: " . count($datalist) .' '. exec_time_unit($start_time).' ms'
				. ' ))) finished calculation datalist ////////////////////////// '
				, logger::WARNING
			);

			// return $datalist;
		// });
		// $fiber->start(); // running a Fiber
		// return $fiber->getReturn();

		return $datalist;
	}//end calculate_tree



	/**
	* SET_SECTION_PERMISSIONS (USED BY GENERATE HIERARCHY BY USERS)
	* Allow current user access to created default sections
	* @param object $options
	* @return bool
	*/
	public static function set_section_permissions(object $options) : bool {

		// options
			$ar_section_tipo	= $options->ar_section_tipo ?? null;
			$permissions		= $options->permissions ?? 2; // (zero is accepted)
			$user_id			= $options->user_id;

		// user_id
			if (empty($user_id)) {
				debug_log(__METHOD__.
					" Error: User id in mandatory. Unable to set permissions for ".to_string($ar_section_tipo),
					logger::ERROR
				);
				return false;
			}

		// component_security_access
			$component_security_access = security::get_user_security_access($user_id);
			if (empty($component_security_access)) {
				debug_log(__METHOD__.
					" Error: Unable to get component_security_access for user id ".to_string($user_id),
					logger::ERROR
				);
				return false;
			}
			// current DDBB dato
			$component_security_access_dato	= $component_security_access->get_dato() ?? [];

		// Iterate sections (normally like ts1,ts2) Generator version
			$values_list_generator = function() use($ar_section_tipo, $permissions) {

				$ar_section_tipo_length = sizeof($ar_section_tipo);
				for ($i=0; $i < $ar_section_tipo_length; $i++) {

					$current_section_tipo = $ar_section_tipo[$i];

					// current section
						// sample data:
							// {
							//     "tipo": "test28",
							//     "value": 1,
							//     "section_tipo": "test3"
							// }
						yield (object)[
							'tipo'			=> $current_section_tipo,
							'section_tipo'	=> $current_section_tipo,
							'value'			=> (int)$permissions
						];

					// Components inside section
						$real_section	= section::get_section_real_tipo_static( $current_section_tipo );
						$ar_children	= section::get_ar_children_tipo_by_model_name_in_section(
							$real_section, // section_tipo
							['component','button','section_group','relation_list','time_machine_list'], // ar_model_name_required
							true, // from_cache
							false, // resolve_virtual
							true, // recursive
							false // search_exact
						);
						foreach ($ar_children as $children_tipo) {

							// new element case
							yield (object)[
								'tipo'			=> $children_tipo,
								'section_tipo'	=> $current_section_tipo,
								'value'			=> (int)$permissions
							];
							debug_log(__METHOD__
								. " Added item $children_tipo to section $current_section_tipo"
								, logger::DEBUG
							);
						}
				}//end foreach ($ar_section_tipo as $current_section_tipo)
			};

		// add values
			$unique_values = [];
			foreach ($values_list_generator() as $value) {
				// check if already exists
				$found = array_find($component_security_access_dato, function($el) use($value) {
					return ($el->tipo===$value->tipo && $el->section_tipo===$value->section_tipo);
				});
				if (is_object($found)) {
					$found->permissions = $permissions;
					debug_log(__METHOD__." Updated already existing value ".to_string($found), logger::WARNING);
				}else{
					$unique_values[] = $value;
				}
			}
			$new_dato = array_merge($component_security_access_dato, $unique_values);

		// Save calculated data
			$component_security_access->set_dato($new_dato);
			$component_security_access->Save();

		// debug
			if(SHOW_DEBUG===true) {
				$added = array_filter($new_dato, function($el) use($ar_section_tipo) {
					return in_array($el->section_tipo, $ar_section_tipo);
				});
				dump($added, ' added ++ '.to_string($ar_section_tipo));
			}

		// Regenerate permissions table
			security::reset_permissions_table();


		return true;
	}//end set_section_permissions



}//end class component_security_access
