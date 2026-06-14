<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SECURITY_ACCESS
* Manages ontology access control and permission management in Dédalo.
*
* Responsibilities:
* - Builds and caches a flat datalist that represents the full ontology tree
*   (areas → sections → components/groupers/buttons) used by the permissions UI.
* - Exposes per-element access level values (0 = none, 1 = read, 2 = edit, 3 = admin)
*   stored in the 'misc' column of the profiles matrix table.
* - Provides helpers for programmatic permission grants (e.g. when a new section is
*   created for a user via hierarchy generation).
* - Blocks diffusion and sorting, which are meaningless for a security-control component.
*
* Data shape stored in the matrix (get_data / set_data):
*   Each element of the returned array is a plain object:
*   {
*       "tipo":         "<ontology_tipo>",   // element being granted access to
*       "section_tipo": "<section_tipo>",    // owning section (same as tipo for areas)
*       "value":        0|1|2|3             // permission level
*   }
*
* Datalist shape (get_datalist / calculate_tree):
*   [
*       {
*           "tipo":         "<ontology_tipo>",
*           "section_tipo": "<section_tipo>",
*           "model":        "<model_name>",
*           "label":        "<human label for DEDALO_APPLICATION_LANG>",
*           "parent":       "<direct parent tipo>",
*           "ar_parent":    ["<ancestor_1>", "<ancestor_2>", ...]  // breadcrumb chain
*       },
*       ...
*   ]
*   The datalist contains NO permission values — it is the same tree for every profile.
*   Clients overlay the per-profile data values on top of the shared tree.
*
* Cache strategy:
*   The datalist is expensive to compute (~3–6 s on large installations).
*   calculate_tree() is invoked by the login sequence as a background CLI process
*   (calculate_tree.php) which writes the result via OpcacheObjectManager::generateCode()
*   to a file named 'cache_tree_{lang}.php' under DEDALO_CACHE_MANAGER['files_path'].
*   get_datalist() reads this file via dd_cache::cache_from_file() before falling back
*   to a live computation.
*
* Relationships:
*   - Extends component_common (standard Dédalo component lifecycle).
*   - Read by security::get_permissions_table() to build the flat lookup table
*     ["<section_tipo>_<tipo>" => <int>] used on every permission check.
*   - Retrieved via security::get_user_security_access($user_id).
*   - Complementary CLI entry point: core/component_security_access/calculate_tree.php.
*
* Permission levels:
*   - 0: No access
*   - 1: Read-only
*   - 2: Read and edit
*   - 3: Admin (full control)
*
* @package Dédalo
* @subpackage Core
*/
class component_security_access extends component_common {



	/**
	* CLASS VARS
	*/
		/**
		* Datalist containing the ontology tree hierarchy for access permissions.
		* Stores the complete security access tree with areas, sections, and components.
		* Populated lazily by get_datalist() and reused within the same request.
		* The datalist holds NO permission values — it is a shared structure-only tree.
		* @var array $datalist
		*/
		public array $datalist = [];

		/**
		* Static cache for the admin-area tipo list returned by get_ar_tipo_admin().
		* Populated on first call; null signals "not yet computed".
		* @var ?array $ar_tipo_admin_cache
		*/
		public static ?array $ar_tipo_admin_cache = null;



	/**
	* GET_CACHE_TREE_FILE_NAME
	* Generates the cache file name for storing the ontology tree datalist.
	*
	* The returned name is used as the key passed to dd_cache::cache_from_file() /
	* dd_cache::cache_to_file(). The actual on-disk path is resolved by the cache
	* manager using DEDALO_CACHE_MANAGER['files_path'].
	*
	* The file is written by the background CLI process calculate_tree.php (invoked
	* once per language during user login) using OpcacheObjectManager::generateCode().
	* Reading it back is fast because PHP's OPcache keeps the decoded array in memory.
	*
	* @param string $lang Language code (e.g. 'lg-eng', 'lg-spa').
	* @return string Cache filename, e.g. 'cache_tree_lg-eng.php'.
	*/
	public static function get_cache_tree_file_name(string $lang) : string {

		return 'cache_tree_'.$lang.'.php';
	}//end get_cache_tree_file_name



	/**
	* GET_DIFFUSION_VALUE
	* Overrides component_common::get_diffusion_value() to block diffusion for this component.
	*
	* Security-access data is internal permission metadata and must never be exported
	* to any diffusion target (SQL/RDF/XML). The method always returns a sentinel
	* string so that callers in the diffusion pipeline receive a non-null, non-empty
	* value that is clearly not real data, rather than silently emitting nothing.
	*
	* @see class.diffusion_mysql.php for how the return value is consumed.
	* @param string|null $lang = null  Unused; present to match the parent signature.
	* @param object|null $option_obj = null  Unused; present to match the parent signature.
	* @return string|null Always returns a fixed sentinel string.
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		return 'There is no diffusion value for this component';
	}//end get_diffusion_value



	/**
	* GET_DATALIST
	* Builds the complete ontology-tree datalist used for the permissions management UI.
	*
	* The datalist is a flat array of items representing every area, section, and
	* element (component/grouper/button/tab/relation_list…) reachable from the
	* installed ontology. Each item carries a full ancestor chain ('ar_parent') so
	* that the client can reconstruct the tree and propagate inherited permissions
	* without additional server round-trips.
	*
	* The datalist itself contains NO permission values — it is the same structural
	* tree for all profiles. Per-profile permission integers are stored separately in
	* the component's data (get_data()) and are overlaid client-side.
	*
	* Resolution order (fast-path first):
	*   1. Instance cache ($this->datalist) — set on first call, reused within request.
	*   2. File cache (dd_cache::cache_from_file) — pre-built by background calculate_tree.php.
	*   3. Live computation — walks area::get_areas(), resolves children recursively.
	*
	* Access filtering:
	*   Global admins receive the full unfiltered tree.
	*   Non-admins receive only the areas present in their own security_access data,
	*   preventing exposure of areas they have no entry for at all.
	*
	* Performance note:
	*   Live computation can take 3–6 s on large ontologies. The login sequence
	*   pre-warms the file cache in background so normal UI requests hit path 1 or 2.
	*
	* @param int $user_id  ID of the currently logged-in user; used to determine
	*                       global-admin status and to filter visible areas.
	* @return array  Flat datalist array; each element has keys:
	*                tipo, section_tipo, model, label, parent, ar_parent.
	*/
	public function get_datalist(int $user_id) : array {
		$start_time = start_time();

		// already resolved in current instance
			if (!empty($this->datalist)) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						.' Return already set datalist. count: '.count($this->datalist)
						, logger::DEBUG
					);
				}
				return $this->datalist;
			}

		// cache from file
			$use_cache = defined('DEDALO_CACHE_MANAGER') && isset(DEDALO_CACHE_MANAGER['files_path']);
			if ($use_cache===true) {

				// cache_file_name. Like 'cache_tree_'.DEDALO_APPLICATION_LANG.'.php'
				$cache_file_name = component_security_access::get_cache_tree_file_name(DEDALO_APPLICATION_LANG);

				// cache from file. (!) This file is generated in background on every user login as 'entity_userID_cache_tree_lg-eng.php'
				$datalist = dd_cache::cache_from_file((object)[
					'file_name' => $cache_file_name
				]);
				if (!empty($datalist) && is_array($datalist)) {

					// set instance datalist
					$this->datalist = $datalist;

					debug_log(__METHOD__
						. ' Return already calculated and cached in file datalist. Time: ' . exec_time_unit($start_time,'ms').' ms' .PHP_EOL
						. ' datalist total items: ' . (!empty($datalist) ? count($datalist) : 0) . PHP_EOL
						// . ' contents strlen: ' . strlen($contents)
						, logger::DEBUG
					);
					return $this->datalist;
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
				// Non-admins only see areas that already appear in their own security-access data.
				// This prevents leaking ontology structure for areas outside the user's scope.

				$user_component_security_access	= security::get_user_security_access($user_id);
				$user_data						= !empty($user_component_security_access) ? ($user_component_security_access->get_data() ?? []) : [];

				$ar_auth_areas = [];
				foreach ($ar_areas as $current_area) {

					$found = array_find($user_data, function($el) use($current_area){
						return $el->tipo===$current_area->tipo;
					});
					if (!empty($found)) {
						$ar_auth_areas[] = $current_area;
					}
				}

				// replace whole list by user authorized areas
				$ar_areas = $ar_auth_areas;
			}

		// datalist. resolve section (real and virtual) components
			$datalist	= [];
			$ar_check	= [];
			// ar_parent tracks the rolling ancestor chain as we traverse the ordered area list.
			// Each area's position in the list implicitly encodes depth via the parent pointer.
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
				$datalist_item = [
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
					foreach ($children as &$child) {
						// Prepend the section-level ancestor chain so each child's ar_parent
						// is complete from the top-level root down to its own direct parent.
						$section_parents = [...$ar_parent, ...$child['ar_parent']];
						$child['ar_parent'] = $section_parents;
					}
					unset($child); // break reference

					$datalist = [...$datalist, ...$children];
				}
			}//end for ($i=0; $i < $ar_areas_length ; $i++)

		// set instance datalist
			$this->datalist = $datalist;

		// cache file write
			if ($use_cache===true) {
				// cache to file.
				// (!) This file is already generated on user login, launching the process in background
				// Do no write here again.
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
	* Builds the flat datalist of all child elements inside a given section.
	*
	* Two resolution strategies are used depending on whether the section defines
	* a v6-style 'source.request_config.ddo_map' in its ontology properties:
	*
	*   Default path (no ddo_map):
	*     Uses get_children_recursive_security_access() to walk the ontology tree
	*     and collect all component/grouper/tab/button children.
	*
	*   v6 compatibility path (ddo_map present):
	*     Reads the explicit DDO map from the section's request_config and generates
	*     datalist items from it. Non-component, non-section_group items from the
	*     recursive walk are appended afterward (tabs, buttons, etc. that are not
	*     listed in ddo_map but still need to appear in the tree).
	*
	* The method also applies ontology-level exclusions: if the section defines an
	* 'exclude_elements' relation node, those tipos are removed from the output.
	*
	* Returns items WITHOUT an 'ar_parent' key; the caller (get_datalist) appends
	* that field once the area-level ancestor chain is known.
	*
	* @param string $section_tipo  Tipo of the section whose children are enumerated.
	* @return array  Array of items with keys: tipo, section_tipo, model, label, parent.
	*/
	public static function get_element_datalist(string $section_tipo) : array {

		$datalist = [];

		// get the exclude elements defined into ontology to be remove of the datalist
		$ar_tipo_to_be_exclude	= null;
		$ar_exclude_elements	= ontology_node::get_ar_tipo_by_model_and_relation(
			$section_tipo,
			'exclude_elements',
			'children',
			true
		);
		if (isset($ar_exclude_elements[0])) {
			$exclude_elements_tipo = $ar_exclude_elements[0];
			$ar_tipo_to_be_exclude = ontology_node::get_relation_nodes(
				$exclude_elements_tipo,
				false,
				true
			);
		}

		// get all ontology nodes inside the main section (section_groups, components, tabs, sections, etc.)
		$children_recursive = self::get_children_recursive_security_access($section_tipo, $ar_tipo_to_be_exclude);

		// v6
		// see if the section has a ddo_map defined
			$ontology_node		= ontology_node::get_instance($section_tipo);
			$section_properties	= $ontology_node->get_properties();
			// check section properties request_config
			if(isset($section_properties->source) && isset($section_properties->source->request_config)){
				// v6 children
				$v6_children = [];
				foreach ($section_properties->source->request_config as $item_request_config) {
					if(isset($item_request_config->show->ddo_map)){
						$ddo_map = $item_request_config->show->ddo_map;
						// Only include DDOs whose parent is 'self' or the section itself;
						// DDOs belonging to sub-sections inside this section are excluded here.
						$filtered = array_filter($ddo_map, function($el) use ($section_tipo){
							return ($el->parent === 'self' || $el->parent === $section_tipo);
						});
						$v6_children = [...$v6_children, ...$filtered];
					}
				}

				// with request_config case list
				$children_list = [];

				// create the children list of the v6 components
				foreach ($v6_children as $ddo) {
					if (!is_object($ddo) || !isset($ddo->tipo)) {
						continue;
					}
					$item = [
						'tipo'			=> $ddo->tipo,
						'section_tipo'	=> $section_tipo,
						'model'			=> ontology_node::get_model_by_tipo($ddo->tipo, true),
						'label'			=> ontology_node::get_term_by_tipo($ddo->tipo, DEDALO_APPLICATION_LANG, true, true),
						'parent'		=> $ddo->parent_grouper ?? $section_tipo
					];
					$children_list[] = $item;
				}

				// add 'default' calculated items excluding components and section_groups
				// (tabs, buttons, relation_list nodes etc. that are not in the v6 ddo_map
				//  but still exist in the ontology and need to appear in the permission tree)
				foreach ($children_recursive as $current_item) {
					if (strpos($current_item['model'], 'component_')===0 || $current_item['model']==='section_group'){
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

			// Maintain the rolling ancestor chain exactly as get_datalist() does
			// at the area level: push a new parent or splice back to a known position.
			$parent_key = $current_child['parent'];
			$position = array_search($parent_key, $ar_parent);
			if( $position===false ){
				$ar_parent[] = $parent_key;
			}else{
				array_splice($ar_parent, $position+1);
			}

			// add
			$item = [
				'tipo'			=> $current_child['tipo'],
				'section_tipo'	=> $section_tipo, // force current section_tipo
				'model'			=> $current_child['model'],
				'label'			=> $current_child['label'],
				'parent'		=> $current_child['parent'],
				'ar_parent'		=> $ar_parent
			];
			$datalist[] = $item;
		}


		return $datalist;
	}//end get_element_datalist



	/**
	* GET_CHILDREN_RECURSIVE_SECURITY_ACCESS
	* Recursively walks the ontology tree under a given tipo and returns a flat list
	* of all descendant nodes eligible for inclusion in the security-access datalist.
	*
	* Traversal strategy differs by model:
	*   - 'section': fetches children via section::get_ar_children_tipo_by_model_name_in_section()
	*     with resolve_virtual=true, then re-fetches without virtual resolution for virtual
	*     sections (to capture virtual-specific buttons that only appear on the virtual node).
	*   - Everything else (area, section_group, …): uses ontology_node::get_ar_children_of_this().
	*
	* Exclusion filters applied before recursing into each child:
	*   1. $ar_tipo_to_be_exclude — tipos listed in the section's 'exclude_elements'
	*      ontology relation (ontology-level opt-out).
	*   2. $ar_exclude_model — hard-coded model names that are never relevant to
	*      permission management (component_security_administrator, search_list, etc.).
	*   3. DEDALO_AR_EXCLUDE_COMPONENTS — installation-level config constant that
	*      lists tipos to hide across all contexts.
	*
	* Each included node is appended to the result with its direct parent set to $tipo
	* (not the child's own ontology parent), which may differ for virtual sections.
	*
	* @param string $tipo  Tipo of the node to walk.
	* @param array|null $ar_tipo_to_be_exclude  Tipos to skip, or null for none.
	* @return array  Flat list of items with keys: tipo, section_tipo, model, label, parent.
	*                Does NOT include an 'ar_parent' key (added by the caller).
	*/
	private static function get_children_recursive_security_access(string $tipo, ?array $ar_tipo_to_be_exclude = null): array {

		$ar_elements = [];

		$source_model = ontology_node::get_model_by_tipo($tipo, true);
		switch ($source_model) {

			case 'section':
				$section_tipo				= $tipo;
				$ar_modelo_name_required	= ['section_group', 'section_tab', 'tab', 'button_', 'relation_list', 'time_machine_list', 'component_'];
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
				if ($section_tipo !== $section_real_tipo) {
					// Virtual section too is necessary (buttons specifics)
					$ar_ts_children_v = section::get_ar_children_tipo_by_model_name_in_section(
						$section_tipo, // string section_tipo
						$ar_modelo_name_required, // array ar_modelo_name_required
						true, // bool from_cache
						false, // bool resolve_virtual
						false, // bool recursive
						false // bool search_exact
					);
					$ar_ts_children	= [...$ar_ts_children, ...$ar_ts_children_v];
				}
				break;

			default:
				# Areas or section groups ...
				$ontology_node	= ontology_node::get_instance($tipo);
				$ar_ts_children	= $ontology_node->get_ar_children_of_this();
				break;
		}

		// ar_exclude_model
		// Hard-coded list of model names that are structural/administrative ontology nodes
		// and are never user-facing permission targets. These are stripped before the
		// permission tree is displayed or written to the user profile.
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
		// Installation-level opt-out: DEDALO_AR_EXCLUDE_COMPONENTS is defined in
		// the site config and lists tipos that should be hidden from all contexts.
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
				$component_model = ontology_node::get_model_by_tipo($element_tipo, true);
				if( in_array($component_model, $ar_exclude_model)) {
					continue ;
				}

			// remove_exclude_terms : config excludes. If installation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, remove from ar_temp
				if (in_array($element_tipo, $ar_exclude_components)) {
					continue;
				}

			// get the ontology JSON format
				$item = [
					'tipo'			=> $element_tipo,
					'section_tipo'	=> $tipo,
					'model'			=> ontology_node::get_model_by_tipo($element_tipo, true),
					'label'			=> ontology_node::get_term_by_tipo($element_tipo, DEDALO_APPLICATION_LANG, true, true),
					'parent'		=> $tipo
				];
				$ar_elements[] = $item;

			// Recurse into this child; the returned items are merged in order so
			// the flat array preserves depth-first tree order.
			$ar_elements = [
				...$ar_elements,
				...self::get_children_recursive_security_access($element_tipo, $ar_tipo_to_be_exclude)
			];
		}


		return $ar_elements;
	}//end get_children_recursive_security_access



	/**
	* GET_AR_TIPO_ADMIN
	* Returns the admin-area tipo and all its direct ontology children.
	*
	* Used to identify the Admin area subtree so it can be excluded from the
	* permission tree presented to non-global-admin users, preventing ordinary
	* users from seeing or granting access to admin-only sections.
	*
	* The result is memoised in $ar_tipo_admin_cache for the lifetime of the
	* PHP process. The first element of the returned array is the admin-area
	* tipo itself (the root); subsequent elements are its direct children.
	*
	* Returns an empty array if no 'area_admin' model is found in the ontology.
	*
	* @return array  Array of tipos: [admin_area_tipo, child_tipo_1, child_tipo_2, …].
	*/
	public static function get_ar_tipo_admin() : array {

		// static cache
		if(self::$ar_tipo_admin_cache !== null) {
			return self::$ar_tipo_admin_cache;
		}

		$ar_result 	= ontology_utils::get_ar_tipo_by_model('area_admin');
		$ar_admin_tipos = [];

		if(!empty($ar_result[0])) {
			$tipo			= $ar_result[0];
			$obj			= ontology_node::get_instance($tipo);
			$ar_admin_tipos	= $obj->get_ar_children_of_this();

			// We add the term itself as the father of the tree
			array_unshift($ar_admin_tipos, $tipo);
		}

		// store cache data
		self::$ar_tipo_admin_cache = $ar_admin_tipos;


		return $ar_admin_tipos;
	}//end get_ar_tipo_admin



	/**
	* UPDATE_DATA_VERSION
	* Handles schema-migration requests for stored component data.
	*
	* component_security_access does not define any data-version migrations.
	* All version strings fall through to the default case, which returns
	* result=0 (no migration defined for this component).
	*
	* The $options object is read using a whitelist pattern: only keys that exist
	* on the local $options stdClass are copied, preventing injection of unexpected
	* properties from the caller.
	*
	* Return semantics (inherited from component_common contract):
	*   result = 0 — no migration defined for the requested version (this component).
	*   result = 1 — migration performed successfully.
	*   result = 2 — migration attempted but data was already up-to-date.
	*
	* @param object $request_options  Migration request object; expected properties:
	*   - array       $update_version   Version number parts (joined with '.').
	*   - mixed|null  $data_unchanged   Caller-supplied unchanged-data flag.
	*   - mixed|null  $reference_id     Record reference for targeted migration.
	*   - string|null $tipo             Component tipo being migrated.
	*   - int|null    $section_id       Section record ID.
	*   - string|null $section_tipo     Section tipo.
	* @return object  Response with at least ->result (int) and ->msg (string).
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->data_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* GET_SORTABLE
	* Reports whether records of this component can be manually sorted.
	*
	* Security-access data is a keyed permission map; ordering of entries has no
	* meaning, so this method always returns false, overriding the component_common
	* default of true.
	*
	* @return bool  Always false.
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* CALCULATE_TREE
	* Instantiates the component for the given user's profile and computes the full
	* datalist in a way that can be called from the background CLI process.
	*
	* This is the main entry point used by calculate_tree.php (the background CLI
	* script that pre-warms the datalist file cache on every user login). It can
	* also be called inline when no cached file is available.
	*
	* Sequence:
	*   1. Resolve the profile section_id for non-global-admin users.
	*      Global admins use section_id=null (no profile record required).
	*   2. Get a component_security_access instance for the resolved profile section.
	*   3. Delegate to get_datalist($user_id) which applies the same caching and
	*      access-filtering logic described there.
	*
	* The caller (calculate_tree.php) writes the returned array to the file cache
	* using OpcacheObjectManager::generateCode() so that subsequent web requests
	* can retrieve it in O(1) via dd_cache::cache_from_file().
	*
	* @param int    $user_id  ID of the user for whom to calculate the tree.
	* @param string $lang     Language code for label resolution; defaults to DEDALO_DATA_LANG.
	* @return array  Full datalist array (same shape as get_datalist()).
	*/
	public static function calculate_tree(int $user_id, string $lang=DEDALO_DATA_LANG) : array {
		$start_time = start_time();

		// profile_section_id
		if(security::is_global_admin($user_id)===true){

			$section_id = null;

		}else{

			$user_profile_locator = security::get_user_profile( $user_id );
			if (!empty($user_profile_locator)) {
				$section_id = (int)$user_profile_locator->section_id;
			}else{
				$section_id = null;
				debug_log(__METHOD__.
					" ERROR on get user_profile_locator: user_id: ".to_string($user_id),
					logger::ERROR
				);
			}
		}

		debug_log(__METHOD__
			. " (1 start) user_id: " .$user_id. ' ('.$lang.')'
			. ' ))) launching datalist ///////////////////////////////////////////////////// '
			, logger::WARNING
		);

		$section_tipo				= DEDALO_SECTION_PROFILES_TIPO;
		$tipo						= DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO;
		$model						= ontology_node::get_model_by_tipo($tipo,true);
		$component_security_access	= component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id, // int|null section_id
			'list', // string mode
			$lang, // string lang
			$section_tipo, // string section_tipo
			false
		);
		$datalist = $component_security_access->get_datalist( $user_id );

		debug_log(__METHOD__
			. " (2 end) lang: $lang, count: " . count($datalist) .' '. exec_time_unit($start_time).' ms'
			. ' ))) finished calculation datalist ////////////////////////// '
			, logger::WARNING
		);


		return $datalist;
	}//end calculate_tree



	/**
	* SET_SECTION_PERMISSIONS
	* Grants a uniform permission level to one or more sections and all their
	* child elements for a specific user, then persists the result.
	*
	* Intended for programmatic use by the hierarchy-generation workflow (e.g. when
	* a new user-specific section tree is created and must immediately be accessible
	* to that user). It is not normally called from the UI.
	*
	* Algorithm:
	*   1. Load the user's current component_security_access data via
	*      security::get_user_security_access().
	*   2. For each section tipo in $options->ar_section_tipo, yield:
	*      a. A permission record for the section itself.
	*      b. Permission records for every component/button/section_group/relation_list
	*         child of the section's real tipo (non-virtual, recursive).
	*   3. Merge with existing data: update value on existing records, append new ones.
	*   4. Persist via set_data() + save().
	*   5. Invalidate the in-memory permissions table via security::reset_permissions_table()
	*      so the change takes effect immediately without a page reload.
	*
	* The inner $values_list_generator is a PHP generator (closure using yield) so
	* that large section trees do not need to be fully materialised before merging.
	*
	* @param object $options  Configuration object:
	*   - array    $ar_section_tipo   One or more section tipos to grant access to.
	*   - int      $permissions       Permission level to assign (default 2 = edit).
	*                                  Zero (no access) is a valid value.
	*   - int|null $user_id           Target user ID; required — returns false if empty.
	* @return bool  True on success, false if $user_id is missing or the component
	*               cannot be loaded.
	*/
	public static function set_section_permissions(object $options) : bool {

		// options
			$ar_section_tipo	= $options->ar_section_tipo ?? [];
			$permissions		= $options->permissions ?? 2; // (zero is accepted)
			$user_id			= $options->user_id ?? null;

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
			// current DDBB data
			$component_security_access_data	= $component_security_access->get_data() ?? [];

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
					// Resolve to the real (non-virtual) section tipo before fetching
					// children so that virtual aliases do not duplicate the child list.
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
				// If the record already exists, update its value in-place (mutate $found via reference).
				// If not, collect it as a new entry to be appended after the loop.
				$found = array_find($component_security_access_data, function($el) use($value) {
					return ($el->tipo===$value->tipo && $el->section_tipo===$value->section_tipo);
				});
				if (is_object($found)) {
					$found->value = (int)$permissions;
					debug_log(__METHOD__." Updated already existing value ".to_string($found), logger::WARNING);
				}else{
					$unique_values[] = $value;
				}
			}
			$new_data = [...$component_security_access_data, ...$unique_values];

		// Save calculated data
			$component_security_access->set_data($new_data);
			$component_security_access->save();

		// debug
			if(SHOW_DEBUG===true) {
				$added = array_filter($new_data, function($el) use($ar_section_tipo) {
					return in_array($el->section_tipo, $ar_section_tipo);
				});
				dump($added, ' added ++ '.to_string($ar_section_tipo));
			}

		// Regenerate permissions table
		// (!) Invalidates the in-memory permissions cache immediately so the newly
		// granted access is enforced on the very next permission check in this request.
			security::reset_permissions_table();


		return true;
	}//end set_section_permissions



}//end class component_security_access
