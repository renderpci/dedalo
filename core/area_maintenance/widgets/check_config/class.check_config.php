<?php declare(strict_types=1);
/**
* CHECK_CONFIG
* Maintenance-area widget that audits the live installation's PHP config files
* against their bundled sample counterparts.
*
* Responsibilities:
* - For each of the three config files (config, config_db, config_core) it
*   compares the set of PHP constants declared in the live file against those
*   declared in the matching sample.*.php template.
* - Reports two asymmetries:
*   config_vs_sample — constants present in the live config but absent from the
*   sample, suggesting they may be stale or mis-named.
*   sample_vs_config — constants present in the sample but not yet `define()`-d
*   in the running PHP process, signalling a missing or outdated installation.
* - The JS renderer (render_check_config.js) colours the widget header red when
*   sample_vs_config is non-empty, alerting the administrator that their
*   installation is likely misconfigured.
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
	* Compares each live config file against its sample template and returns
	* a structured diff for all three config files.
	*
	* Called by `dd_area_maintenance_api::get_widget_value()` with no arguments.
	* The method is synchronous and read-only; it never writes to disk.
	*
	* Return shape:
	* {
	*   result: [
	*     {
	*       file_name:                    string,  // "config" | "config_db" | "config_core"
	*       config_vs_sample:             string[], // constants in live file but not in sample
	*       sample_vs_config:             string[], // sample constants not defined at runtime
	*       sample_config_constants_list: string[], // full list of constants in the sample file
	*       config_constants_list:        string[], // full list of constants in the live file
	*     },
	*     ...
	*   ],
	*   msg:    string,
	*   errors: string[],
	*   sample_config_constants_list: string[]  // (!) last-iterated value; see flag below
	* }
	*
	* If a sample or live config file is missing or unreadable the iteration skips
	* that file, records an error string in $response->errors, and continues to
	* the next file.
	*
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// result
			$result = [];

		// ar_files_name iterate
			$ar_files_name = [
				'config',
				'config_db',
				'config_core'
			];
			foreach ($ar_files_name as $file_name) {

				$item = new stdClass();
					$item->file_name		= $file_name;
					$item->config_vs_sample	= [];
					$item->sample_vs_config	= [];


				// sample file
				// Guard against missing or unreadable sample templates; without a sample
				// file the diff is meaningless so the entry is skipped entirely.
					$sample_path = DEDALO_CONFIG_PATH . '/sample.'.$file_name.'.php';
					if (!file_exists($sample_path) || !is_readable($sample_path)) {
						debug_log(__METHOD__
							. " Ignored sample config comparison because the sample config file do not exists." . PHP_EOL
							. ' sample_path: ' . to_string($sample_path)
							, logger::ERROR
						);
						$response->errors[] = 'Sample config file unavailable: ' . 'sample.'.$file_name.'.php';
						continue;
					}

				// sample_config_constants_list
				// Extract every `define('CONSTANT_NAME', ...)` call from the sample file
				// using get_file_constants(), which applies SEC-069 realpath confinement.
					$sample_config_constants_list = area_maintenance::get_file_constants(
						$sample_path
					);
					$item->sample_config_constants_list	= $sample_config_constants_list;

				// config file
				// Guard against missing or unreadable live config files.
					$config_path = DEDALO_CONFIG_PATH . '/'.$file_name.'.php';
					if (!file_exists($config_path) || !is_readable($config_path)) {
						debug_log(__METHOD__
							. " Ignored config comparison because the config file do not exists." . PHP_EOL
							. ' config_path: ' . to_string($config_path)
							, logger::ERROR
						);
						$response->errors[] = 'Config file unavailable: ' . $file_name.'.php';
						continue;
					}

				// config_constants_list
				// Extract every `define(...)` from the live config file; same helper,
				// same path-confinement rules as for the sample above.
					$config_constants_list = area_maintenance::get_file_constants(
						$config_path
					);
					$item->config_constants_list = $config_constants_list;

				// config_vs_sample. Compares defined config constants vs sample config
				// Identifies constants that exist in the live file but not in the sample,
				// which may indicate site-local additions (normal) or stale/typo names
				// (the administrator should review them).
				// The $ignore list contains constants that are intentionally optional:
				//   DEDALO_MAINTENANCE_MODE_CUSTOM — written dynamically by set_maintenance_mode()
				//   DEDALO_NOTIFICATION           — written dynamically by set_notification()
				//   GEONAMES_ACCOUNT_USERNAME     — optional GeoNames integration credential
				//   EXPORT_HIERARCHY_PATH         — optional export override path
					$ignore = ['DEDALO_MAINTENANCE_MODE_CUSTOM','DEDALO_NOTIFICATION','GEONAMES_ACCOUNT_USERNAME','EXPORT_HIERARCHY_PATH'];
					foreach ($config_constants_list as $const_name) {
						if (!in_array($const_name, $sample_config_constants_list)) {
							// exceptions (ignore optional constants that could be disabled)
							if (!in_array($const_name, $ignore)) {
								$item->config_vs_sample[] = $const_name;
							}
						}
					}

				// sample_vs_config. Compares defined sample constants vs config
				// Identifies constants declared in the sample that are not yet defined in
				// the running PHP process. A non-empty list means the live config is
				// missing constants that a fresh install would have, and the JS renderer
				// will colour the widget header red (danger style).
				// The $ignore list contains constants present in sample files but excluded
				// from the "missing" check because they are set elsewhere or superseded:
				//   DEDALO_MAINTENANCE_MODE — superseded at runtime by DEDALO_MAINTENANCE_MODE_CUSTOM
				//   DEDALO_API_URL          — auto-derived from other constants in config.php
					$ignore = ['DEDALO_MAINTENANCE_MODE','DEDALO_API_URL'];
					foreach ($sample_config_constants_list as $const_name) {
						if (!in_array($const_name, $ignore) && !defined($const_name)) {
							$item->sample_vs_config[] = $const_name;
						}
					}

				// add
					$result[] = $item;
			}//end foreach


		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning. Request done with errors';
			$response->sample_config_constants_list	= $sample_config_constants_list;


		return $response;
	}//end get_value



}//end check_config
