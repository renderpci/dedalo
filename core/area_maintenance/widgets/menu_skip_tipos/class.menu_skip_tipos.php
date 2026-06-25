<?php declare(strict_types=1);

require_once DEDALO_CORE_PATH . '/base/config/class.config_local_writer.php';

/**
* MENU_SKIP_TIPOS
* Maintenance-area widget to manage DEDALO_ENTITY_MENU_SKIP_TIPOS: the list of ontology
* "grouping" tipos hidden from the menu while their children walk up to the grandparent
* (core/menu/class.menu.php). This is a cosmetic menu-rendering setting (children still
* appear), NOT an access/security control like areas.deny.
*
* Persistence — the _CUSTOM/STATE pattern (NOT config.local.php): the widget writes the
* runtime override DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM to ../private/state.php via
* area_maintenance::set_entity_menu_skip_tipos() → set_config_core() (root-only). menu.php
* uses the CUSTOM list when set, else the base — so this can override a base list deployed
* via .env, which config.local.php cannot. Same mechanism as DEDALO_MEDIA_ACCESS_MODE_CUSTOM.
*
* Security (SEC-044): dd_area_maintenance_api::widget_request only dispatches methods listed
* in API_ACTIONS. get_value is reached via the separate get_widget_value path. The actual
* write is additionally root-gated inside set_config_core.
*/
class menu_skip_tipos {

	/**
	* Allowlist of JS-callable methods (SEC-044 gate). get_value is intentionally absent.
	* @var array<int,string>
	*/
	public const API_ACTIONS = [
		'save_menu_skip_tipos'
	];


	/**
	* GET_VALUE
	* Initial widget state for the JS view (via dd_area_maintenance_api::get_widget_value).
	*
	* @return object {result:object|false, msg:string, errors:array}
	*   result: {
	*     areas      : array<object>  full unfiltered tree (search source: tipo/label/model)
	*     skip_tipos : array<string>  effective skip list (CUSTOM override if set, else base)
	*     writable   : bool           is ../private writable (where state.php lives; else save disabled)
	*   }
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		try {
			// effective skip list: the runtime override (state.php) when NON-EMPTY, else the base
			// (a list catalog key resolves to [] when unset, so empty = no override = use base).
			$skip = (defined('DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM') && !empty(DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM))
				? DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM
				: (defined('DEDALO_ENTITY_MENU_SKIP_TIPOS') ? (array) DEDALO_ENTITY_MENU_SKIP_TIPOS : []);

			$result = (object)[
				'areas'			=> area::get_all_areas(),
				'skip_tipos'	=> array_values($skip),
				// state.php lives in ../private, the same dir config_local_writer probes — reuse it.
				'writable'		=> config_local_writer::is_writable()
			];

			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
		} catch (\Throwable $e) {
			$response->errors[]	= $e->getMessage();
			$response->msg		= 'Error building menu_skip_tipos value: ' . $e->getMessage();
			return $response;
		}

		return $response;
	}//end get_value


	/**
	* PREPARE_LIST
	* Pure sanitiser: validates every tipo against the ontology, drops any TOP-LEVEL area,
	* and dedupes. Returns the cleaned list + diagnostics.
	*
	* The skip feature is for sub-grouping containers (e.g. "Oral History processes"): it hides
	* the node and walks its children up to the grandparent. Skipping a TOP-LEVEL area (Activities,
	* Resources, …) instead promotes ALL of that area's children into the top menu bar, which
	* deforms/overflows it (the bar then collapses to the hamburger). So the top-level area tipos
	* (area::get_ar_root_area_tipos) are rejected here. There is no access/security guard — skipping
	* is purely cosmetic (children still render), unlike areas.deny.
	*
	* @param array<string> $tipos
	* @return object { tipos:array, invalid:array, removed:array }
	*/
	public static function prepare_list(array $tipos) : object {

		$out = (object)[
			'tipos'		=> [],
			'invalid'	=> [],
			'removed'	=> []
		];

		// top-level areas (Catalogue/Activities/Resources/… + area_root) must not be skipped
		$root_tipos = area::get_ar_root_area_tipos();

		$clean = [];
		foreach (array_unique($tipos) as $tipo) {
			if (!ontology_utils::check_tipo_is_valid($tipo)) {
				$out->invalid[] = $tipo;
				continue;
			}
			if (in_array($tipo, $root_tipos, true)) {
				$out->removed[] = $tipo; // skipping a top-level area deforms the menu bar
				continue;
			}
			$clean[] = $tipo;
		}

		$out->tipos = array_values($clean);

		return $out;
	}//end prepare_list


	/**
	* SAVE_MENU_SKIP_TIPOS
	* Validates the submitted list and persists it as the runtime override
	* DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM in ../private/state.php (root-only, via
	* area_maintenance::set_entity_menu_skip_tipos → set_config_core).
	*
	* @param object $options { tipos:string[] }
	* @return object {result:object|false, msg:string, errors:array}
	*/
	public static function save_menu_skip_tipos(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		$tipos = (isset($options->tipos) && is_array($options->tipos)) ? $options->tipos : [];

		$prepared = self::prepare_list($tipos);

		$write = area_maintenance::set_entity_menu_skip_tipos((object)[
			'value' => $prepared->tipos
		]);

		if ($write->result !== true) {
			$response->errors[]	= $write->msg;
			$response->msg		= $write->msg;
			return $response;
		}

		$response->result = (object)[
			'tipos'		=> $prepared->tipos,
			'invalid'	=> $prepared->invalid,
			'removed'	=> $prepared->removed
		];
		$response->msg = 'OK. Configuration saved. Changes apply on the next request'
			. (empty($prepared->removed) ? '' : '. Top-level areas cannot be skipped and were ignored.')
			. (empty($prepared->invalid) ? '' : '. Invalid tipos were ignored.');

		return $response;
	}//end save_menu_skip_tipos


}//end menu_skip_tipos
