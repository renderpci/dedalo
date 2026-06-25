<?php declare(strict_types=1);

require_once DEDALO_CORE_PATH . '/base/config/class.config_local_writer.php';

/**
* CONFIG_AREAS
* Maintenance-area widget that exposes the install-global area allow/deny configuration
* (catalog keys areas.deny / areas.allow) to the browser UI for editing.
*
* Read path  (get_value)         : returns the full UNfiltered area tree + current lists.
* Write path (save_config_areas) : validates, anti-lockout-guards, then persists to
*                                  ../private/config.local.php via config_local_writer.
*
* Enforcement of areas.deny lives in area::get_areas(); this widget only reads/writes the
* config. areas.allow is informational-only today and is round-tripped unchanged.
*
* Security (SEC-044): dd_area_maintenance_api::widget_request only dispatches methods
* listed in API_ACTIONS. get_value is reached via the separate get_widget_value path.
*/
class config_areas {

	/**
	* Allowlist of JS-callable methods (SEC-044 gate). get_value is intentionally absent.
	* @var array<int,string>
	*/
	public const API_ACTIONS = [
		'save_config_areas'
	];


	/**
	* GET_VALUE
	* Initial widget state for the JS view (via dd_area_maintenance_api::get_widget_value).
	*
	* @return object {result:object|false, msg:string, errors:array}
	*   result: { areas:array<object>, areas_deny:array<string>, areas_allow:array<string>, writable:bool }
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		try {
			$config_areas = area::get_config_areas();

			$result = (object)[
				'areas'			=> area::get_all_areas(),
				'areas_deny'	=> $config_areas->areas_deny,
				'areas_allow'	=> $config_areas->areas_allow,
				'writable'		=> config_local_writer::is_writable()
			];

			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
		} catch (\Throwable $e) {
			$response->errors[]	= $e->getMessage();
			$response->msg		= 'Error building config_areas value: ' . $e->getMessage();
			return $response;
		}

		return $response;
	}//end get_value


	/**
	* PREPARE_LISTS
	* Pure sanitiser: validates every tipo against the ontology, strips guarded root models
	* from the deny list (anti-lockout), and dedupes. Returns cleaned lists + diagnostics.
	*
	* @param array<string> $areas_deny
	* @param array<string> $areas_allow
	* @return object { areas_deny:array, areas_allow:array, invalid:array, removed_guarded:array }
	*/
	public static function prepare_lists(array $areas_deny, array $areas_allow) : object {

		$out = (object)[
			'areas_deny'		=> [],
			'areas_allow'		=> [],
			'invalid'			=> [],
			'removed_guarded'	=> []
		];

		// guarded root models that must never be denied (anti-lockout)
		$guarded = [];
		foreach (['area_root', 'area_maintenance', 'area_admin'] as $model) {
			$t = ontology_utils::get_ar_tipo_by_model($model);
			if (isset($t[0])) {
				$guarded[] = $t[0];
			}
		}

		// sanitize deny
		$deny = [];
		foreach (array_unique($areas_deny) as $tipo) {
			if (!ontology_utils::check_tipo_is_valid($tipo)) {
				$out->invalid[] = $tipo;
				continue;
			}
			if (in_array($tipo, $guarded, true)) {
				$out->removed_guarded[] = $tipo;
				continue;
			}
			$deny[] = $tipo;
		}

		// sanitize allow (validated; no guard needed)
		$allow = [];
		foreach (array_unique($areas_allow) as $tipo) {
			if (!ontology_utils::check_tipo_is_valid($tipo)) {
				$out->invalid[] = $tipo;
				continue;
			}
			$allow[] = $tipo;
		}

		$out->areas_deny	= array_values($deny);
		$out->areas_allow	= array_values($allow);

		return $out;
	}//end prepare_lists


	/**
	* SAVE_CONFIG_AREAS
	* Validates the submitted lists and persists them to ../private/config.local.php.
	*
	* @param object $options { areas_deny:string[], areas_allow:string[] }
	* @return object {result:object|false, msg:string, errors:array}
	*/
	public static function save_config_areas(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		$areas_deny		= (isset($options->areas_deny)  && is_array($options->areas_deny))  ? $options->areas_deny  : [];
		$areas_allow	= (isset($options->areas_allow) && is_array($options->areas_allow)) ? $options->areas_allow : [];

		$prepared = self::prepare_lists($areas_deny, $areas_allow);

		$write = config_local_writer::set_values([
			'areas.deny'	=> $prepared->areas_deny,
			'areas.allow'	=> $prepared->areas_allow
		]);

		if ($write->result !== true) {
			$response->errors[]	= $write->msg;
			$response->msg		= $write->msg;
			return $response;
		}

		$response->result = (object)[
			'areas_deny'		=> $prepared->areas_deny,
			'areas_allow'		=> $prepared->areas_allow,
			'invalid'			=> $prepared->invalid,
			'removed_guarded'	=> $prepared->removed_guarded
		];
		$response->msg = 'OK. Configuration saved. Changes apply on the next request'
			. (empty($prepared->removed_guarded) ? '' : '. Protected areas cannot be denied and were kept enabled.')
			. (empty($prepared->invalid) ? '' : '. Invalid tipos were ignored.');

		return $response;
	}//end save_config_areas


}//end config_areas
