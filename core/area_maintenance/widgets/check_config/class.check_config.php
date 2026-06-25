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
* - Reports the presence/readability of the new private config sources
*   (../private/.env, ../private/state.php and the optional config.local.php).
* - Reports which constants declared in the shipped sample templates
*   (sample.config.php, sample.config_db.php) are not `define()`-d in the running
*   PHP process — a proxy for an incomplete or outdated configuration. The check
*   is against defined() (not a file-vs-file diff) so it is agnostic to where the
*   constant is now resolved from (.env, catalog or state.php).
* - The JS renderer (render_check_config.js) colours the widget header red when
*   the DB status is not fully OK or any sample constant is missing at runtime.
* - This class exposes no directly callable API methods (`API_ACTIONS = []`);
*   it is only invoked through `dd_area_maintenance_api::get_widget_value()`,
*   which hard-codes the call to `get_value()`.
*
* Constant discovery is delegated to `area_maintenance::get_file_constants()`,
* which reads the source text with a regex and applies SEC-069 realpath
* confinement before touching the filesystem.
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
	* `get_value` is the only public method on this class and it is invoked through
	* the separate `get_widget_value` endpoint (hard-coded method name), which does
	* not consult `API_ACTIONS`. Therefore `get_value` is intentionally absent from
	* this list.
	*
	* @var array<string>
	*/
	public const API_ACTIONS = [];



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
	*     ],
	*     constants: [             // sample constants not defined() at runtime
	*       { file_name: string, missing: string[], sample_constants_list: string[] },
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

		// 3. sample constants not defined() at runtime
		//    Only sample files that still ship are inspected (sample.config / sample.config_db);
		//    a removed sample (e.g. sample.config_core.php) is expected in v7 and skipped silently.
		//    Testing against defined() rather than a live-file diff keeps the check valid
		//    regardless of where the constant is now resolved from (.env, catalog, state.php).
		//    $ignore lists constants set elsewhere or auto-derived, to avoid false positives.
			$ignore = ['DEDALO_MAINTENANCE_MODE','DEDALO_API_URL'];
			$ar_sample_files = ['config','config_db'];
			$constants = [];
			foreach ($ar_sample_files as $file_name) {

				$sample_path = DEDALO_CONFIG_PATH . '/sample.'.$file_name.'.php';
				if (!file_exists($sample_path) || !is_readable($sample_path)) {
					continue;
				}

				$sample_constants_list = area_maintenance::get_file_constants($sample_path);

				$missing = [];
				foreach ($sample_constants_list as $const_name) {
					if (!in_array($const_name, $ignore) && !defined($const_name)) {
						$missing[] = $const_name;
					}
				}

				$item = new stdClass();
					$item->file_name				= 'sample.'.$file_name;
					$item->missing					= $missing;
					$item->sample_constants_list	= $sample_constants_list;
				$constants[] = $item;
			}
			$result->constants = $constants;


		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning. Request done with errors';


		return $response;
	}//end get_value



}//end check_config
