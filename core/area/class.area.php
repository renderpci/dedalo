<?php declare(strict_types=1);
/**
* CLASS AREA
* Concrete area node: the standard navigable area that appears in the main menu
* and acts as a container for sections and nested child areas.
*
* Responsibilities:
* - Compose a flat, ordered list of all top-level area tipos from the ontology
*   (area_root, area_resource, area_admin, etc.) and their descendant children,
*   filtered by the per-installation config_areas.php allow/deny lists.
* - Walk the ontology tree recursively to collect child area/section tipos while
*   excluding structural nodes that must never surface in the menu (login, tools,
*   section_list, filter).
* - Expose a per-installation access-control filter (`get_config_areas`) that maps
*   the $areas_deny and $areas_allow arrays from config/config_areas.php into a
*   plain stdClass for consumption by `get_areas` and the security layer.
*
* Extends area_common, which provides the dashboard, metrics, and JSON fallback
* behaviour. All concrete area subclasses (area_resource, area_admin,
* area_thesaurus, etc.) ultimately inherit both this class and area_common.
*
* @package Dédalo
* @subpackage Core
*/
class area extends area_common {



	/**
	* Models whose tipos are collected when recursing the ontology tree.
	* Only nodes whose model appears in this list can become children in the
	* area navigation hierarchy built by get_ar_children_areas_recursive().
	* @var array<string> $ar_children_include_model_name
	*/
	public static array $ar_children_include_model_name = ['area','section','section_tool'];

	/**
	* Models explicitly excluded from the recursive child-area walk even when
	* they would otherwise match $ar_children_include_model_name.
	* Structural nodes (login, tools, section_list, filter) must never appear as
	* navigable children in the menu.
	* Note: the property name contains a typo ('modelo' vs 'model') inherited from
	* the original codebase — not fixed here to avoid breaking callers.
	* @var array<string> $ar_children_exclude_modelo_name
	*/
	public static array $ar_children_exclude_modelo_name = ['login','tools','section_list','filter'];



	/**
	* GET_IDENTIFIER
	* Returns the flat string identifier for this area, used as a unique key for
	* naming purposes (e.g. media component name, cache keys).
	*
	* For areas, the identifier is simply the tipo (e.g. 'dd14'). The doc-block
	* example 'dd42_dd207_1' is inherited from component_common and does not apply
	* here — area identifiers are never compound.
	*
	* @return string $identifier - the area tipo, e.g. 'dd14'
	* @throws Exception when the tipo is empty (programming error / uninitialised instance)
	*/
	public function get_identifier() : string {

		if ( empty($this->get_tipo() ) ) {
			throw new Exception("Error Processing Request. empty tipo", 1);
		}

		$identifier = $this->tipo;

		return $identifier;
	}//end get_identifier



	/**
	* GET_AREAS
	* Builds and returns the full flat list of area/section ontology nodes that are
	* visible in the main menu and used by the security-access layer.
	*
	* Walk order:
	*  1. Resolve the tipo of each known top-level area model (area_root, area_activity,
	*     area_resource, area_tool, area_thesaurus, area_graph, area_admin,
	*     area_maintenance, area_development, area_ontology) from the ontology.
	*  2. Filter out any tipo present in config_areas->areas_deny.
	*  3. For each surviving root-area tipo, emit one object and then recursively
	*     collect all child area/section tipos via get_ar_children_areas_recursive(),
	*     again filtering against areas_deny.
	*
	* Each emitted element is a plain object:
	*   { tipo, model, parent, properties, label }
	* where label is resolved for DEDALO_APPLICATION_LANG.
	*
	* area_graph and area_ontology are guarded: if the ontology has not been updated
	* to define those models a WARNING is logged but execution continues — the missing
	* area is simply omitted from the result.
	* area_maintenance has an additional hard-coded fallback to tipo 'dd88' and a
	* define() guard so older installations do not break.
	*
	* @see menu
	* @see component_security_access
	* @return array<object> $areas - flat ordered list of visible area/section nodes
	*/
	public static function get_areas() : array {

		if(SHOW_DEBUG===true) {
			$start_time = start_time();
		}

		// get the config_areas file to allow and deny some specific areas defined by installation.
			$config_areas = self::get_config_areas();

		// root_areas (shared with get_all_areas)
			$ar_root_areas = self::get_ar_root_area_tipos();

			$areas = [];
			foreach ($ar_root_areas as $area_tipo) {

				// skip the areas_deny
					if(in_array($area_tipo, $config_areas->areas_deny)) continue;

				// areas. Get the JSON format of the ontology
					$ontology_node = ontology_node::get_instance( $area_tipo );
					$areas[] = (object)[
						'tipo'			=> $ontology_node->get_tipo(),
						'model'			=> $ontology_node->get_model(),
						'parent'		=> $ontology_node->get_parent(),
						'properties'	=> $ontology_node->get_properties(),
						'label'			=> $ontology_node->get_term( DEDALO_APPLICATION_LANG )
					];

				// group_areas. get the all children areas and sections of current
					$ar_group_areas	= self::get_ar_children_areas_recursive($area_tipo);

					// get the JSON format of the ontology for all children
					foreach ($ar_group_areas as $child_area_tipo) {

						// skip the areas_deny
						if(in_array($child_area_tipo, $config_areas->areas_deny)) continue;

						$ontology_node = ontology_node::get_instance( $child_area_tipo );
						$areas[] = (object)[
							'tipo'			=> $ontology_node->get_tipo(),
							'model'			=> $ontology_node->get_model(),
							'parent'		=> $ontology_node->get_parent(),
							'properties'	=> $ontology_node->get_properties(),
							'label'			=> $ontology_node->get_term( DEDALO_APPLICATION_LANG )
						];
					}
			}//end foreach ($ar_root_areas as $area_tipo)

		// debug
			if(SHOW_DEBUG===true) {
				$total	= round( start_time() - $start_time, 3);
				$n		= count($areas);
				debug_log(__METHOD__
					." Total ($n): ".exec_time_unit($start_time,'ms')." ms - ratio(total/n): " . ($total/$n)
					, logger::DEBUG
				);
			}


		return $areas;
	}//end get_areas



	/**
	* GET_AR_CHILDREN_AREAS_RECURSIVE
	* Recursively collects all descendant area/section tipos under the given $tipo
	* by walking the ontology tree, filtering nodes against the include/exclude
	* model lists defined on this class.
	*
	* Only nodes whose model is in $ar_children_include_model_name AND NOT in
	* $ar_children_exclude_modelo_name are accepted. This double-filter ensures that
	* a model like 'section_tool' which appears in include but not exclude passes,
	* while 'filter' and 'section_list' (which are not in include) never appear.
	*
	* The result preserves depth-first, pre-order ontology ordering: the current
	* child is appended before its own descendants, matching the tree traversal
	* order expected by the menu renderer.
	*
	* Note: The for-loop form (instead of foreach) is an optimisation carried over
	* from earlier code; both are functionally equivalent here.
	*
	* @param string $tipo - ontology tipo to recurse from (e.g. 'dd14')
	* @return array<string> $ar_children_areas_recursive - flat ordered list of descendant tipos
	*/
	protected static function get_ar_children_areas_recursive( string $tipo ) : array {

		// default value
		$ar_children_areas_recursive = [];

		// short vars
		$ontology_node			= ontology_node::get_instance($tipo);
		$ar_ts_children			= $ontology_node->get_ar_children_of_this();
		$ar_ts_children_size	= sizeof($ar_ts_children);

		if ($ar_ts_children_size>0) {

			// foreach ($ar_ts_children as $children_tipo) {
			for ($i=0; $i < $ar_ts_children_size; $i++) {

				$children_tipo = $ar_ts_children[$i];

				$ontology_node	= ontology_node::get_instance($children_tipo);
				$model			= ontology_node::get_model_by_tipo($children_tipo,true);

				// Test if model is accepted or not (more restrictive)
				// Both conditions must be met: model in include list AND not in exclude list.
				if( 	in_array($model, area::$ar_children_include_model_name)
					&& !in_array($model, area::$ar_children_exclude_modelo_name)
				) {

					// add current
					$ar_children_areas_recursive[] = $children_tipo;

					// calculate recursive
					// Spread-merge is used to append the entire sub-tree at once,
					// preserving depth-first pre-order without intermediate array_merge calls.
					$ar_temp = self::get_ar_children_areas_recursive($children_tipo);
					$ar_children_areas_recursive = [...$ar_children_areas_recursive, ...$ar_temp];
				}
			}//end for ($i=0; $i < $ar_ts_children_size; $i++)
		}


		return $ar_children_areas_recursive;
	}//end get_ar_children_areas_recursive



	/**
	* GET_AR_ROOT_AREA_TIPOS
	* Ordered list of the root area tipos (resolved from area models). Shared by
	* get_areas() (which then deny-filters + descends) and get_all_areas() (which
	* keeps everything). Extracted so both walk an identical root set.
	*
	* @return array<string> ordered root area tipos
	*/
	public static function get_ar_root_area_tipos() : array {

		$ar_root_areas		= [];
		$ar_root_areas[]	= ontology_utils::get_ar_tipo_by_model('area_root')[0];
		$ar_root_areas[]	= ontology_utils::get_ar_tipo_by_model('area_activity')[0];
		$ar_root_areas[]	= ontology_utils::get_ar_tipo_by_model('area_resource')[0];
		$ar_root_areas[]	= ontology_utils::get_ar_tipo_by_model('area_tool')[0];
		$ar_root_areas[]	= ontology_utils::get_ar_tipo_by_model('area_thesaurus')[0];

		// area_graph. check (if user do not have the Ontology updated)
		$area_graph = ontology_utils::get_ar_tipo_by_model('area_graph');
		if (isset($area_graph[0])) {
			$ar_root_areas[] = $area_graph[0];
		}else{
			debug_log(__METHOD__
				. " WARNING. Model 'area_graph' is not defined! Update your Ontology ASAP "
				, logger::WARNING
			);
		}
		$ar_root_areas[] = ontology_utils::get_ar_tipo_by_model('area_admin')[0];

		// area_maintenance. Temporal check (if user do not have the Ontology updated, error is given here)
		$area_maintenance = ontology_utils::get_ar_tipo_by_model('area_maintenance');
		if (isset($area_maintenance[0])) {
			$ar_root_areas[] = $area_maintenance[0]; // dd88
		}else{
			debug_log(__METHOD__
				. " WARNING. Model 'area_maintenance' is not defined! Update your Ontology ASAP " . PHP_EOL
				. ' Fixed resolution is returned to allow all works temporally'
				, logger::ERROR
			);
			if (!defined('DEDALO_AREA_MAINTENANCE_TIPO')) {
				define('DEDALO_AREA_MAINTENANCE_TIPO', 'dd88');
			}
			$ar_root_areas[] = DEDALO_AREA_MAINTENANCE_TIPO; // dd88
		}

		// area_development
		$ar_root_areas[] = ontology_utils::get_ar_tipo_by_model('area_development')[0];

		// area_ontology. check (if user do not have the Ontology updated)
		$area_ontology = ontology_utils::get_ar_tipo_by_model('area_ontology');
		if (isset($area_ontology[0])) {
			$ar_root_areas[] = $area_ontology[0];
		}else{
			debug_log(__METHOD__
				. " WARNING. Model 'area_ontology' is not defined! Update your Ontology ASAP "
				, logger::WARNING
			);
		}

		return $ar_root_areas;
	}//end get_ar_root_area_tipos



	/**
	* GET_ALL_AREAS
	* The UNfiltered counterpart of get_areas(): walks the same root areas + recursive
	* children but skips NOTHING, flagging each node's current denied/allowed state so a
	* UI (config_areas widget) can show and re-enable currently-denied areas/sections.
	*
	* @return array<object> each {tipo, model, parent, label, denied:bool, allowed:bool}
	*/
	public static function get_all_areas() : array {

		$config_areas	= self::get_config_areas();
		$deny			= $config_areas->areas_deny;
		$allow			= $config_areas->areas_allow;

		$ar_root_areas	= self::get_ar_root_area_tipos();

		$areas = [];
		foreach ($ar_root_areas as $area_tipo) {

			$areas[] = self::build_area_state_node($area_tipo, $deny, $allow);

			$ar_group_areas = self::get_ar_children_areas_recursive($area_tipo);
			foreach ($ar_group_areas as $child_area_tipo) {
				$areas[] = self::build_area_state_node($child_area_tipo, $deny, $allow);
			}
		}

		return $areas;
	}//end get_all_areas


	/**
	* BUILD_AREA_STATE_NODE
	* Builds one area/section descriptor with its current deny/allow flags.
	*
	* @param string $tipo
	* @param array<string> $deny
	* @param array<string> $allow
	* @return object {tipo, model, parent, label, denied, allowed}
	*/
	private static function build_area_state_node(string $tipo, array $deny, array $allow) : object {

		$ontology_node = ontology_node::get_instance($tipo);

		return (object)[
			'tipo'		=> $ontology_node->get_tipo(),
			'model'		=> $ontology_node->get_model(),
			'parent'	=> $ontology_node->get_parent(),
			'label'		=> $ontology_node->get_term( DEDALO_APPLICATION_LANG ),
			'denied'	=> in_array($tipo, $deny, true),
			'allowed'	=> in_array($tipo, $allow, true)
		];
	}//end build_area_state_node



	/**
	* GET_CONFIG_AREAS
	* Loads the per-installation area access-control configuration from
	* DEDALO_CONFIG_PATH/config_areas.php and returns it as a plain object.
	*
	* The included file is expected to define two PHP variables in its scope:
	*   $areas_deny  — array of tipos that must never appear in the menu/access check
	*   $areas_allow — array of tipos that override deny (currently informational only)
	*
	* See config/sample.config_areas.php for the canonical format:
	*   $areas_deny[]  = 'dd137'; // Private list of values
	*   $areas_allow   = [];
	*
	* Failure handling:
	*   If the file cannot be included (returns false), empty arrays are used and an
	*   ERROR is logged. In SHOW_DEBUG mode an exception is thrown immediately so
	*   misconfigured installs fail loudly during development.
	*
	* (!) The included file runs in this method's local scope, so $areas_deny and
	*   $areas_allow are populated as local variables by the include. If the file only
	*   defines them via include (config_areas.php → private/config_areas.inc) the
	*   inner include must also execute in the same scope — this works because PHP
	*   include shares the calling scope.
	*
	* @return object $config_areas - stdClass with properties:
	*   ->areas_deny  : array<string>  tipos to exclude from navigation/access
	*   ->areas_allow : array<string>  tipos that override the deny list
	*/
	public static function get_config_areas() : object {

		// config_areas object. Always well-formed (empty allow/deny) even before config
		// is booted, so callers (installer, CLI) never receive a malformed object.
			$config_areas = new stdClass();
				$config_areas->areas_deny	= [];
				$config_areas->areas_allow	= [];

		// v7: the deny/allow lists are catalog keys (areas.deny / areas.allow), read from
		// the resolved config — no longer a separate config_areas.php include. The catalog
		// ships the default deny list (dd137, rsc1, hierarchy20); override per-install via
		// ../private/config.local.php. config is booted very early (P4), so it is available
		// wherever menus/access are resolved; the guard keeps the rare pre-boot/degraded
		// context (e.g. the installer) from fataling.
			if ( class_exists('config') ) {
				try {
					$config_areas->areas_deny	= (array) config('areas.deny', []);
					$config_areas->areas_allow	= (array) config('areas.allow', []);
				} catch (\Throwable $e) {
					debug_log(__METHOD__
						." config not booted - using empty allow/deny defaults"
						, logger::WARNING
					);
				}
			}


		return $config_areas;
	}//end get_config_areas



}//end area class
