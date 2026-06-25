<?php declare(strict_types=1);
include_once DEDALO_CORE_PATH . '/base/update/class.update.php';
/**
* UPDATE_DATA_VERSION
* Area maintenance widget: data-version migration controller for the Dédalo
* maintenance dashboard.
*
* This widget is the thin HTTP-facing layer for the data migration pipeline.
* It delegates all migration logic to the `update` class
* (core/base/update/class.update.php) and acts as:
*  - A read endpoint (`get_value`) that surfaces the current installed data
*    version, the target update version, the Dédalo code version, and the
*    pending migration step descriptors so the dashboard UI can present a
*    confirmation dialog before the user commits to running migrations.
*  - A write endpoint (`update_data_version`) that enforces two hard
*    preconditions — DEDALO_SUPERUSER identity and active maintenance mode —
*    then delegates to `update::update_version($updates_checked)`.
*
* Entry point:
*   dd_area_maintenance_api::widget_request dispatches here after:
*   1. Validating the widget name against the area widget allow-list.
*   2. Enforcing the realpath-confinement check on the class file path (SEC-069).
*   3. Checking the requested method against this class's API_ACTIONS constant
*      (SEC-044).
*
* `get_value` is NOT in API_ACTIONS because it is reached through a separate
* `get_widget_value` endpoint in dd_area_maintenance_api that always calls a
* widget's `get_value()` method by name; that endpoint applies its own security
* checks before dispatch.
*
* The `update_data_version` action is listed in area_maintenance::BACKGROUND_RUNNABLE
* because the JS widget sets `background_running: true`, causing the API to spawn
* the call as a detached CLI process via exec_::request_cli / process_runner.php.
* This avoids PHP-FPM worker timeouts for multi-hour migrations on large datasets.
*
* Relationships:
*  - Uses: update (core/base/update/class.update.php) — orchestrates migration steps
*  - Dispatched by: dd_area_maintenance_api::widget_request
*  - Also: dd_area_maintenance_api::get_widget_value (for the get_value call)
*  - Background runner: area_maintenance::BACKGROUND_RUNNABLE
*
* @package Dédalo
* @subpackage Core
*/
class update_data_version {

	/**
	* SEC-044: explicit allowlist of methods callable through
	* `dd_area_maintenance_api::widget_request`.
	*
	* `get_value` is intentionally absent because it is invoked through
	* `dd_area_maintenance_api::get_widget_value` (which hard-codes the method
	* name `get_value` and applies its own access check) rather than through
	* `widget_request`. Any method not listed here is unreachable from the API
	* regardless of its PHP visibility.
	*
	* @var array<int,string>
	*/
	public const API_ACTIONS = [
		'update_data_version'
	];



	/**
	* GET_VALUE
	* Returns the current migration status snapshot for the dashboard widget.
	*
	* Assembles a result object with four fields:
	*  - `update_version`        — the target version triple [major, medium, minor]
	*                              that corresponds to the next pending migration, or
	*                              null when the database is already at the latest
	*                              supported version (update::get_update_version()).
	*  - `current_version_in_db` — the version triple currently recorded in the
	*                              `matrix_updates` PostgreSQL table
	*                              (global get_current_data_version()).
	*  - `dedalo_version`        — the version triple derived from the DEDALO_VERSION
	*                              constant in the deployed code files
	*                              (global get_dedalo_version()).
	*  - `updates`               — the specific update descriptor object from
	*                              updates.php whose key matches `update_version_plain`
	*                              (the concatenated integer key, e.g. "700" for v7.0.0),
	*                              or null when no matching descriptor exists.
	*
	* The client JS uses this snapshot to populate the migration step checkboxes
	* before the user triggers `update_data_version`.
	*
	* No authentication guard here — the widget dispatching layer in
	* dd_area_maintenance_api enforces that only maintenance admins can reach this.
	*
	* @return object $response - {
	*   result: {
	*     update_version:        array|null,
	*     current_version_in_db: array,
	*     dedalo_version:        array,
	*     updates:               object|null
	*   },
	*   msg:    string,
	*   errors: array
	* }
	*/
	public static function get_value() : object {

		$updates				= update::get_updates();
		$update_version			= update::get_update_version();

		// Build a flat string key (e.g. [7,0,0] → "700") to look up the matching
		// descriptor in the $updates object returned by update::get_updates().
		// An empty $update_version (no pending migration) yields '' so the null
		// coalescing below safely returns null for `updates`.
		$update_version_plain	= empty($update_version)
			? ''
			: implode('', $update_version);

		$result = (object)[
			'update_version'		=> $update_version,
			'current_version_in_db'	=> get_current_data_version(),
			'dedalo_version'		=> get_dedalo_version(),
			'updates'				=> $updates->{$update_version_plain} ?? null
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



	/**
	* UPDATE_DATA_VERSION
	* Executes the pending data-version migration for the installed Dédalo instance.
	*
	* This method is the write endpoint of the widget. It applies one migration step
	* at a time (from the currently installed version to the next known version). The
	* actual migration work is performed by update::update_version(), which:
	*  - Runs DDL statements (SQL_update[])
	*  - Iterates every section to call per-component update_data_version() hooks
	*    (components_update[])
	*  - Dispatches arbitrary PHP migration callbacks (run_scripts[])
	*  - Records the new version in `matrix_updates` on success
	*
	* Only the step keys present in $options->updates_checked and mapped to `true` are
	* executed; steps mapped to `false` are skipped. This allows partial re-runs when
	* some steps have already succeeded and only remaining steps need to be applied.
	*
	* Hard preconditions enforced before delegating to update::update_version():
	*  1. The currently logged-in user must be DEDALO_SUPERUSER (user_id === -1).
	*     Ordinary admins are rejected even if they have full write access to the
	*     maintenance area.
	*  2. DEDALO_MAINTENANCE_MODE (or its runtime override
	*     DEDALO_MAINTENANCE_MODE_CUSTOM) must be `true`. This prevents applying
	*     migrations while normal users are concurrently editing data, which could
	*     corrupt the very records being transformed.
	*
	* The PHP time limit is raised to 259200 seconds (3 days) to accommodate
	* migrations that iterate millions of component rows.
	*
	* Exceptions thrown by update::update_version() are caught, logged via debug_log
	* at ERROR level, and also appended to the flat update.log file at
	* DEDALO_CONFIG_PATH/update.log for post-mortem review.
	*
	* This method is run asynchronously when the JS widget sets
	* `background_running: true` — it is spawned by exec_::request_cli and therefore
	* may outlive the originating HTTP request.
	*
	* @param object $options - {
	*   updates_checked: object — map of migration-step keys to bool.
	*     Only keys mapped to `true` are executed by update::update_version().
	*     Example: {
	*       "SQL_update_1":         true,
	*       "components_update_1":  true,
	*       "components_update_2":  true,
	*       "components_update_3":  true,
	*       "components_update_4":  true,
	*       "run_scripts_1":        true,
	*       "run_scripts_2":        true
	*     }
	* }
	* @return object $response - { result: bool, msg: string, errors: array }
	*/
	public static function update_data_version(object $options): object
	{

		// options
		$updates_checked = $options->updates_checked;

		// set time limit
		set_time_limit(259200);  // 3 days

		$response = new stdClass();
		$response->result = false;
		$response->errors = [];
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';

		// DEDALO_SUPERUSER only
		if (logged_user_id() != DEDALO_SUPERUSER) {
			$response->msg = 'Error. Only Dédalo superuser can do this action';
			return $response;
		}

		// DEDALO_MAINTENANCE_MODE
		// DEDALO_MAINTENANCE_MODE_CUSTOM is a runtime override written by
		// set_config_core() to config_core.php; it takes precedence over the
		// compiled-in DEDALO_MAINTENANCE_MODE constant so that operators can
		// toggle maintenance mode without redeploying configuration files.
		$maintenance_mode = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
			? DEDALO_MAINTENANCE_MODE_CUSTOM
			: DEDALO_MAINTENANCE_MODE;
		if ($maintenance_mode !== true) {
			$response->msg = 'Error. Update data is not allowed if Dédalo is not in maintenance_mode';
			return $response;
		}

		try {

			// exec update_data_version. return object response
			$update_data_version_response = update::update_version($updates_checked);

		} catch (Exception $e) {

			debug_log(
				__METHOD__
				. " Caught exception [update_data_version]: " . PHP_EOL
				. ' msg: ' . $e->getMessage()
				,
				logger::ERROR
			);

			$update_data_version_response = (object) [
				'result' => false,
				'msg' => 'ERROR on update_data_version .Caught exception: ' . $e->getMessage()
			];

			// log line
			// Append to the flat update.log (DEDALO_CONFIG_PATH/update.log) using
			// FILE_APPEND | LOCK_EX so that concurrent background CLI workers do not
			// interleave partial lines when writing simultaneously.
			$update_log_file = DEDALO_CONFIG_PATH . '/update.log';
			$log_line = PHP_EOL . date('c') . ' ERROR [Exception] ';
			$log_line .= PHP_EOL . 'Caught exception: ' . $e->getMessage();
			file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);
		}

		$response->result = $update_data_version_response->result ?? false;
		$response->msg = $update_data_version_response->msg ?? 'Error. Request failed [' . __FUNCTION__ . ']';
		$response->errors = array_merge($response->errors, $update_data_version_response->errors);


		return $response;
	}//end update_data_version



}//end update_data_version
