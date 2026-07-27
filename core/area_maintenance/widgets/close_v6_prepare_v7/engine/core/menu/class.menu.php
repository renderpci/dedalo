<?php declare(strict_types=1);
/**
* CLASS MENU
* Top-level application menu controller — resolves which areas the current
* user may access and prepares the data the JS menu renderer needs to build
* the navigation tree.
*
* Responsibilities:
* - Fetches all installation areas (area::get_areas()) and filters them
*   down to the subset the logged-in user has access to, honouring global-admin
*   and developer special roles as well as per-area security-access grants.
* - Hard-excludes the maintenance area (DEDALO_AREA_MAINTENANCE_TIPO / dd88)
*   for non-admins and the development area (DEDALO_AREA_DEVELOPMENT_TIPO / dd770)
*   for non-developers regardless of security-access grants.
* - Resolves "skip parent" grouping tipos (DEDALO_ENTITY_MENU_SKIP_TIPOS,
*   configured per installation): these tipos are invisible in the menu but
*   their children inherit the grandparent as their visible parent.
* - Applies three special-case rewrites before handing items to the client:
*     1. section_tool areas: rewritten to 'section' model with a tool_context
*        injected into config; the real section's target_section_tipo drives
*        data loading so instances stay connected to the correct DB rows.
*     2. Thesaurus terms area (DEDALO_THESAURUS_VIRTUALS_AREA_TIPO / hierarchy56):
*        rewritten to 'area_thesaurus' model with a swap_tipo pointing to
*        DEDALO_THESAURUS_TIPO (dd100) for client-side tipo substitution.
*     3. Thesaurus models area (DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO /
*        hierarchy57): same as above but with an additional thesaurus_view_mode
*        = 'model' config flag.
* - Supplies system-level diagnostic information (PHP version, PostgreSQL
*   version, memory limit, etc.) via get_info_data().
* - Overrides get_structure_context() from common to attach any tools that
*   are bound to the menu element itself (e.g. 'tool_user_admin').
*
* Extends common (abstract base for all Dédalo elements).
* Consumed by menu_json.php, which assembles the JSON API response.
* Tipo: dd85 (the ontology node that defines the menu element).
*
* @package Dédalo
* @subpackage Core
*/
class menu extends common {



	/**
	* __CONSTRUCT
	* Initialises the menu element and loads its ontology structure data.
	*
	* Sets the fixed tipo 'dd85' (the ontology node for the application menu),
	* pins the section_tipo to DEDALO_ROOT_TIPO ('dd1', the installation root),
	* and delegates to common::load_structure_data() to populate inherited
	* properties (label, ontology_node, properties, …) from the ontology.
	*
	* @param string $mode = 'edit' - Rendering mode. Only 'edit' is used in
	*   practice; the parameter exists for consistency with the common interface.
	* @return void
	*/
	public function __construct(string $mode = 'edit') {

		$this->tipo			= 'dd85'; // string class menu (dd85)
		$this->lang			= DEDALO_APPLICATION_LANG;
		$this->mode			= $mode;
		$this->section_tipo	= DEDALO_ROOT_TIPO; // 'dd1';

		parent::load_structure_data();
	}



	/**
	* GET_TREE_DATALIST
	* Resolves the ordered list of areas the current user is authorised to see,
	* applies skip-parent grouping, and performs model rewrites for special area
	* types. The returned array is consumed by menu_json.php as the tree_datalist
	* data field the JS menu renderer iterates to build the navigation tree.
	*
	* Each returned item is a plain object with at minimum:
	*   - tipo   (string)  ontology tipo of the area
	*   - model  (string)  PHP/JS model identifier, e.g. 'section', 'area_thesaurus'
	*   - parent (string|null) visible parent tipo after skip-parent resolution
	*   - label  (string)  display name from the ontology
	*   - config (object)  optional; present only for rewritten special-case areas
	*
	* Authorization rules (applied in order):
	*   1. Global-admin AND developer: all areas pass through unfiltered.
	*   2. Otherwise: only areas found in security::get_ar_authorized_areas_for_user()
	*      are kept, subject to two hard exclusions:
	*        - DEDALO_AREA_MAINTENANCE_TIPO (dd88) is hidden from everyone who is
	*          not a global-admin or developer, even if security-access grants exist.
	*        - DEDALO_AREA_DEVELOPMENT_TIPO (dd770) is hidden from non-developers.
	*
	* Skip-parent resolution:
	*   DEDALO_ENTITY_MENU_SKIP_TIPOS (per-installation array, may be empty) lists
	*   grouping tipos that should not appear as nodes in the menu. Their children
	*   walk up the chain via get_my_parent() and adopt the closest non-skipped
	*   ancestor as their visible parent.
	*
	* Special-case rewrites (switch on model / tipo):
	*   - section_tool: see class header. If the named tool is not installed for
	*     this user the area is silently skipped (continue 2).
	*   - DEDALO_THESAURUS_VIRTUALS_AREA_TIPO: model → 'area_thesaurus' + swap_tipo.
	*   - DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO: same + thesaurus_view_mode.
	*
	* @return array - Flat array of stdClass items describing authorised menu nodes.
	*   Returns an empty array when no user is logged in.
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
				// (!) Both flags must be true: a global-admin who is not also marked
				// as developer still goes through the filtered path below so that
				// DEDALO_AREA_DEVELOPMENT_TIPO is excluded from their menu.
				$ar_areas = $ar_full_areas;

			}else{

				// get authorized areas for the current user with the data of component_security_access
				$ar_permissions_areas = security::get_ar_authorized_areas_for_user();

			// filter areas excluding by permissions and special tipos
			$ar_full_areas_length = count($ar_full_areas);
				for ($i=0; $i < $ar_full_areas_length ; $i++) {

					$area_item = $ar_full_areas[$i];

					// maintenance area is only accessible by root, global admin or developer,
					if ($area_item->tipo === DEDALO_AREA_MAINTENANCE_TIPO && !$is_global_admin && !$is_developer) {
						// skip menu maintenance to non maintenance user, even if they have permissions
						continue;
					}

					if ($area_item->tipo === DEDALO_AREA_DEVELOPMENT_TIPO && !$is_developer) {
						// skip menu developer to non developers, even if they have permissions
						continue;
					}

					$found = array_find($ar_permissions_areas, function($permissions_item) use($area_item) {
						return $permissions_item->tipo===$area_item->tipo;
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
			// These are grouping containers defined in DEDALO_ENTITY_MENU_SKIP_TIPOS. They act as
			// organisational wrappers in the ontology but must not appear as clickable menu nodes.
			// Effective list: the runtime override DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM (set from the
			// menu_skip_tipos maintenance widget → ../private/state.php) REPLACES the base when it is a
			// NON-EMPTY array, so an admin can override a base list deployed via .env. Empty or absent
			// (a list catalog key resolves to [] when unset) = use the base. ('empty = no override'
			// matches the other _CUSTOM keys; to skip nothing, clear the base in .env.)
			$skip_tipos = (defined('DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM') && !empty(DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM))
				? DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM
				: DEDALO_ENTITY_MENU_SKIP_TIPOS;
			$skip_parents = array_filter($ar_areas, function($item) use($skip_tipos) {
				return in_array($item->tipo, $skip_tipos);
			});
			// retrieve the access areas without the skip tipos
			$access_areas = array_filter($ar_areas, function($item) use($skip_tipos) {
				return !in_array($item->tipo, $skip_tipos);
			});
			// rearrange the array to remunerate the arrays
			// array_filter preserves keys; re-index so the for-loop below works correctly.
			$skip_parents		= array_values($skip_parents);
			$access_areas		= array_values($access_areas);
			$ar_areas_length	= count($access_areas);
			for ($i=0; $i < $ar_areas_length ; $i++) {

				$current_area = $access_areas[$i];

				// get my parent recursively
				// Walks up the skip-parent chain until it finds a non-skipped ancestor.
				$parent = self::get_my_parent($current_area, $skip_parents);

				// item
				// Base datalist item; may be augmented by the switch below.
					$datalist_item = (object)[
						'tipo'		=> $current_area->tipo,
						'model'		=> $current_area->model,
						'parent'	=> $parent,
						'label'		=> $current_area->label
					];

				// custom config cases
				// Each case mutates $datalist_item in place before it is added to the output.
					switch (true) {

						case $current_area->model==='section_tool': // section_tool case
							// section_tool areas are ontological aliases for a real section that is
							// loaded and rendered through a specific tool. The menu must transparently
							// rewrite the tipo and model so the client opens the real section, while
							// injecting a tool_context so the section knows which tool is active.
							$properties	= $current_area->properties;

							// tool_context
							// The tool name is the first (and only) key of the tool_config sub-object.
							$tool_name = isset($properties->tool_config) && is_object($properties->tool_config)
								? array_key_first(get_object_vars($properties->tool_config))
								: false;

							if ($tool_name!==false) {

								$user_tools = tool_common::get_user_tools( logged_user_id() );
								$tool_info = array_find($user_tools, function($el) use($tool_name) {
									return $el->name===$tool_name;
								});
								if (!is_object($tool_info)) {
									// The named tool is not registered or not available to this user.
									// Silently drop the area rather than rendering a broken menu entry.
									debug_log(__METHOD__
										." WARNING. Ignored area '$current_area->tipo'. No tool found for tool name '$tool_name' in current_area: ".to_string($current_area)
										, logger::WARNING
									);
									continue 2;
								}else{

									$tool_config	= $properties->tool_config->{$tool_name} ?? false;
									$tool_context	= tool_common::create_tool_simple_context($tool_info, $tool_config);

									// overwrite current_area (!)
									// Rewrite model to 'section' so the client loads the real section class.
									// Rewrite tipo to target_section_tipo so DB queries hit the right table.
									// Inject tool_context into config so the section activates the tool.
									$datalist_item->model	= 'section';
									$datalist_item->tipo	= $properties->config->target_section_tipo ?? $current_area->tipo;
									$datalist_item->config	= $properties->config ?? new stdClass();
									$datalist_item->config->tool_context = $tool_context;
								}
							}
							break;

						case $current_area->tipo===DEDALO_THESAURUS_VIRTUALS_AREA_TIPO: // thesaurus terms case
							// The thesaurus terms virtual area (hierarchy56) does not map to a real
							// section; the client renders it via 'area_thesaurus' which knows how to
							// open the thesaurus tree. swap_tipo tells the JS menu parser to substitute
							// the virtual tipo with DEDALO_THESAURUS_TIPO (dd100) at runtime.
							// overwrite properties
							$datalist_item->model = 'area_thesaurus';
							// custom config
							$datalist_item->config = (object)[
								// swap_tipo. Is used by JS menu parser to change current item tipo on the fly
								'swap_tipo' => DEDALO_THESAURUS_TIPO // dd100
							];
							break;

						case $current_area->tipo===DEDALO_THESAURUS_VIRTUALS_MODELS_AREA_TIPO: // thesaurus models case
							// Same as the terms case above but activates 'model' view mode so the
							// thesaurus tree is rendered in its model-browsing variant. url_vars
							// propagates the view mode into the URL for deep-linking.
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
	* Recursively resolves the visible parent tipo for a given area, skipping
	* over any grouping tipos listed in DEDALO_ENTITY_MENU_SKIP_TIPOS.
	*
	* The ontology may contain intermediate grouping containers — areas whose sole
	* purpose is to create sub-sections in a configuration UI but that must not
	* appear as nodes in the navigation menu. When such a container is the direct
	* parent of $area, this method climbs one level further up the ancestry chain
	* and checks again, recursing until it reaches an ancestor that is not in the
	* skip list. That ancestor's tipo becomes the visible parent in the menu tree.
	*
	* Example: if the ontology has A → B(skip) → C(skip) → D, calling
	*   get_my_parent(A, [B, C]) returns D's tipo, making D the visible parent of A.
	*
	* @param object $area         - The area whose visible parent is being resolved.
	*   Must have a 'parent' property (string tipo or null) and a 'tipo' property.
	* @param array  $skip_parents - Flat array of area objects to skip. Each item
	*   must have a 'tipo' and a 'parent' property.
	* @return string|null - Tipo of the nearest non-skipped ancestor, e.g. 'tch188'.
	*   Returns null when $area has no parent set.
	*/
	private static function get_my_parent( object $area, array $skip_parents ) : ?string  {

		// find if the my parent is in skip parents
		$current_parent = array_find($skip_parents, function($item) use ($area){
			return $area->parent === $item->tipo;
		});
		// if my parent is in skip recursion to search if his parent is in skip parents
		// else the parent is the current area->parent, the last parent in the chain
		if (!empty($current_parent)) {
			return self::get_my_parent($current_parent, $skip_parents);
		}

		$parent = $area->parent ?? null;

		return $parent;
	}//end get_my_parent



	/**
	* GET_INFO_DATA
	* Collects diagnostic and version information about the current installation
	* and returns it as a plain object for inclusion in the menu JSON response.
	*
	* The returned object is displayed in the application's "About / Info" panel
	* and is also useful for support and debugging. All fields are strings.
	*
	* Returned object shape:
	*   - dedalo_version      (string) application version from DEDALO_VERSION
	*   - dedalo_build        (string) build tag from DEDALO_BUILD
	*   - dedalo_db_name      (string) PostgreSQL database name (DEDALO_DATABASE_CONN)
	*   - pg_version          (string) PostgreSQL server version, or 'Failed!'
	*   - php_version         (string) PHP_VERSION + ' jit: 0|1' (OPcache JIT status)
	*   - memory              (string) PHP memory_limit ini value, e.g. '256M'
	*   - php_sapi_name       (string) SAPI name, e.g. 'apache2handler', 'fpm-fcgi'
	*   - entity              (string) installation identifier (DEDALO_ENTITY)
	*   - php_user            (string) OS user running the PHP process
	*   - php_session_handler (string) session save handler, e.g. 'files', 'redis'
	*   - pg_db               (string) duplicate of pg_version (kept for API compat)
	*   - server_software     (string) $_SERVER['SERVER_SOFTWARE'] or 'unknown'
	*   - ip_server           (string) $_SERVER['SERVER_ADDR'] or 'unknown'
	*
	* @return object - stdClass with diagnostic fields as described above.
	*/
	public function get_info_data() : object {

		$info_data = new stdClass();
		// vars already included in environment
		$info_data->dedalo_version		= DEDALO_VERSION;
		$info_data->dedalo_build		= DEDALO_BUILD;
		$info_data->dedalo_db_name		= DEDALO_DATABASE_CONN;

		// Get PostgreSQL version once to avoid duplicate queries
		// DBi::_getConnection() may return null when no connection has been opened
		// yet; the try/catch guards against both null and connection failures.
		$pg_version = null;
		try {
			$conn = DBi::_getConnection() ?? false;
			if ($conn) {
				$pg_version = pg_version($conn)['server'];
			}
		} catch(Exception $e) {
			$pg_version = 'Failed with Exception! ' . $e->getMessage();
		}

		$info_data->pg_version			= $pg_version ?? 'Failed!';
		$info_data->php_version			= PHP_VERSION;
		// Append JIT status to the PHP version string: '8.3.x jit: 1' (enabled) or '8.3.x jit: 0'
		$info_data->php_version			.= ' jit: ' . (int)(opcache_get_status()['jit']['enabled'] ?? false);
		$info_data->memory				= to_string(ini_get('memory_limit'));
		$info_data->php_sapi_name		= php_sapi_name();
		// other vars
		$info_data->entity				= DEDALO_ENTITY;
		$info_data->php_user			= get_current_user();
		$info_data->php_session_handler	= ini_get('session.save_handler');
		// (!) pg_db duplicates pg_version; kept for backwards compatibility with existing client code
		$info_data->pg_db				= $pg_version ?? 'Failed!';
		$info_data->server_software		= $_SERVER['SERVER_SOFTWARE'] ?? 'unknown';
		$info_data->ip_server			= $_SERVER['SERVER_ADDR'] ?? 'unknown';


		return $info_data;
	}//end get_info_data



	/**
	* GET_STRUCTURE_CONTEXT
	* Builds and returns the context dd_object for the menu element. This is the
	* context half of the two-part JSON API response (context + data) defined in
	* the Dédalo context-data-layers architecture.
	*
	* Overrides common::get_structure_context() to add the $add_request_config
	* parameter signature with a default of false (menus never need request config
	* in their context), and to populate the 'tools' array with any tools that are
	* bound to this menu element in the ontology (e.g. 'tool_user_admin'). These
	* tools are rendered by the client as action buttons in the menu header bar.
	*
	* The returned dd_object carries:
	*   - tipo        own tipo ('dd85')
	*   - model       PHP class name ('menu')
	*   - label       human-readable name from the ontology
	*   - lang        active application language code (e.g. 'lg-eng')
	*   - mode        rendering mode (e.g. 'edit')
	*   - permissions integer permission level passed in by menu_json.php (2)
	*   - tools       array of dd_object tool contexts, one per ontology-bound tool
	*   - debug       (only when SHOW_DEBUG is true) exec_time in ms
	*
	* @param int  $permissions       = 1  - Permission level to embed in the context object.
	*   menu_json.php passes 2 (write access); the default of 1 is a safe fallback.
	* @param bool $add_request_config = false - Unused for menu; retained for signature
	*   compatibility with common::get_structure_context().
	* @return dd_object - Fully populated context descriptor for the menu element.
	*/
	public function get_structure_context( int $permissions=1, bool $add_request_config=false ) : dd_object {

		if (SHOW_DEBUG === true) {
			$start_time = start_time();
		}

		// short vars
			$tipo	= $this->get_tipo();
			$mode	= $this->get_mode();
			$label	= $this->get_label();
			$lang	= $this->get_lang();
			$model	= get_class($this);

		// tools (menu tools like 'tool_user_admin')
		// get_tools() returns the ontology-defined tools for this element, already
		// filtered to those the current user is allowed to see.
			$tools		= [];
			$tools_list	= $this->get_tools();
			foreach ($tools_list as $tool_object) {

				$properties		= $tool_object->properties;
				// Extract the per-tool configuration object if it exists under
				// properties->tool_config->{tool_name}; null means no extra config.
				$tool_config	= !empty($properties) && isset($properties->tool_config->{$tool_object->name})
					? $properties->tool_config->{$tool_object->name}
					: null;

				// Use section_tipo when set; fall back to this element's own tipo
				// so create_tool_simple_context always receives a valid section locator.
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
		// Construct a minimal context object; the client identifies the element
		// by tipo+model and uses permissions to control UI affordances.
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
			if (SHOW_DEBUG === true) {
				$time = exec_time_unit($start_time, 'ms');

				$debug = new stdClass();
				$debug->exec_time = $time . ' ms';

				$dd_object->debug = $debug;
			}


		return $dd_object;
	}//end get_structure_context



}//end menu class
