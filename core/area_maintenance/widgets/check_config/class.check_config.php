<?php declare(strict_types=1);
/**
* CHECK_CONFIG
* Maintenance-area widget that audits the live installation's configuration.
*
* v7 config system note:
*   Configuration no longer lives in web-served PHP files. `config_db.php` and
*   `config_core.php` were removed; `config.php` is now a thin bootstrap shim
*   (it just requires bootstrap.php). DB credentials and secrets live in
*   ../private/.env, and machine-written runtime state lives in ../private/state.php
*   (both out of the web root). Constants are emitted at boot from those sources
*   plus the config catalog (core/base/config/catalog/).
*
* Responsibilities:
* - Reports the live database status via installer::get_db_status(): whether the
*   DEDALO_*_CONN credentials are still sample placeholders, whether a real
*   PostgreSQL connection can be opened, and whether the target DB is writable.
* - Reports the presence/readability of the private config sources that actually
*   drive a v7 install (../private/.env, ../private/state.php and the optional
*   ../private/config.local.php).
* - The JS renderer (render_check_config.js) colours the widget header red when
*   the DB status is not fully OK or a required private config source is missing.
*
* Historical note (removed in v7):
*   Earlier revisions also diffed the running process against the shipped
*   sample.config.php / sample.config_db.php templates and listed any constant
*   not `define()`-d at runtime. Those web-served config files (and their sample
*   templates) are no longer part of the configuration flow — constants are now
*   emitted from ../private/.env + ../private/state.php + the config catalog — so
*   that check produced only false positives (e.g. base-path constants that are
*   defined elsewhere) and was dropped.
*
* - Exposes three root-only mode toggles through `widget_request`
*   (set_maintenance_mode / set_recovery_mode / set_notification, see API_ACTIONS).
*   The read-only audit `get_value()` is invoked separately through
*   `dd_area_maintenance_api::get_widget_value()`, which hard-codes the call.
*
* Extends: (none — standalone widget class, not part of the class hierarchy)
* API entry point: dd_area_maintenance_api::get_widget_value()
*   (core/api/v1/common/class.dd_area_maintenance_api.php)
*
* @package Dédalo
* @subpackage Core
*/
class check_config {

	/**
	* API_ACTIONS
	* Explicit allowlist of methods callable through `dd_area_maintenance_api::widget_request`.
	*
	* This widget exposes no callable actions via `widget_request`; the empty array
	* means that every `widget_request` call targeting this widget is denied by the
	* SEC-044 gate in `dd_area_maintenance_api::widget_request()`.
	*
	* `get_value` is invoked through the separate `get_widget_value` endpoint
	* (hard-coded method name), which does not consult `API_ACTIONS`, so it is
	* intentionally absent from this list.
	*
	* The mode toggles (set_maintenance_mode / set_recovery_mode / set_notification)
	* are thin wrappers that delegate to the shared area_maintenance implementation:
	* the underlying state is global (maintenance / recovery mode is also driven by
	* dd_core_api during the recovery flow), so the logic stays on area_maintenance
	* while the widget reaches it through the canonical widget_request path.
	*
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'set_maintenance_mode',
		'set_recovery_mode',
		'set_notification'
	];



	/**
	* GET_VALUE
	* Audits the v7 configuration and returns a structured status object.
	*
	* Called by `dd_area_maintenance_api::get_widget_value()` with no arguments.
	* The method is synchronous and read-only; it never writes to disk.
	*
	* Return shape:
	* {
	*   result: {
	*     db_status: {            // from installer::get_db_status()
	*       config_db_name_check:    bool,
	*       config_user_name_check:  bool,
	*       config_pw_check:         bool,
	*       config_information_check:bool,
	*       config_info_key_check:   bool,
	*       config_check:            bool,
	*       db_connection_check:     bool,
	*       db_writable_check:       bool,
	*       global_status:           bool
	*     },
	*     config_sources: [        // presence of ../private config files
	*       { name: string, required: bool, exists: bool, readable: bool },
	*       ...
	*     ]
	*   },
	*   msg:    string,
	*   errors: string[],
	* }
	*
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// installer (delegates to installer_config_manager). include_once'd here so the
		// widget works even when invoked outside a context that already loaded it.
			require_once DEDALO_CORE_PATH . '/installer/class.installer.php';

		$result = new stdClass();

		// 1. database status (credentials + live connection + write test)
		//    installer::get_db_status() reads the .env-sourced DEDALO_*_CONN constants,
		//    rejects the sample placeholders (e.g. 'myusername', 'dedalo_mydatabase'),
		//    opens a real pg_connect, and runs a CREATE/INSERT/DROP probe.
			$result->db_status = installer::get_db_status();

		// 2. private config sources presence
		//    .env (DB + secrets) and state.php (runtime state) are mandatory once the
		//    system is configured; config.local.php is an optional hand-authored override.
			$private = dirname(DEDALO_ROOT_PATH) . '/private';
			$ar_sources = [
				(object)['name' => '.env',				'path' => $private.'/.env',				'required' => true],
				(object)['name' => 'state.php',			'path' => $private.'/state.php',		'required' => true],
				(object)['name' => 'config.local.php',	'path' => $private.'/config.local.php',	'required' => false]
			];
			$config_sources = [];
			foreach ($ar_sources as $source) {
				$item = new stdClass();
					$item->name		= $source->name;
					$item->required	= $source->required;
					$item->exists	= file_exists($source->path);
					$item->readable	= $item->exists && is_readable($source->path);
				$config_sources[] = $item;
				if ($source->required===true && $item->readable===false) {
					$response->errors[] = 'Required config source missing or unreadable: ' . $source->name;
				}
			}
			$result->config_sources = $config_sources;


		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning. Request done with errors';


		return $response;
	}//end get_value



	/**
	* SET_MAINTENANCE_MODE
	* Widget-request wrapper. Maintenance mode is global system state (also driven by
	* dd_core_api during recovery), so the implementation stays on area_maintenance;
	* this thin façade lets the check_config widget toggle it via widget_request.
	* @param object $options - { active: bool } (see area_maintenance::set_maintenance_mode)
	* @return object
	*/
	public static function set_maintenance_mode( object $options ) : object {

		return area_maintenance::set_maintenance_mode( $options );
	}//end set_maintenance_mode



	/**
	* SET_RECOVERY_MODE
	* Widget-request wrapper delegating to the global area_maintenance implementation.
	* @param object $options
	* @return object
	*/
	public static function set_recovery_mode( object $options ) : object {

		return area_maintenance::set_recovery_mode( $options );
	}//end set_recovery_mode



	/**
	* SET_NOTIFICATION
	* Widget-request wrapper delegating to the global area_maintenance implementation.
	* @param object $options
	* @return object
	*/
	public static function set_notification( object $options ) : object {

		return area_maintenance::set_notification( $options );
	}//end set_notification



}//end check_config
