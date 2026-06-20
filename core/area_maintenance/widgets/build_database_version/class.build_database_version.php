<?php declare(strict_types=1);
/**
 * BUILD_DATABASE_VERSION
 * Area-maintenance widget that exposes the install-image build pipeline to the
 * maintenance UI and to the CLI background runner.
 *
 * Responsibilities:
 * - Provides `get_value()` (the standard widget value-refresh hook) so the
 *   maintenance panel can show the current source DB and the expected target
 *   file path before the user triggers the build.
 * - Exposes `build_install_version()` as a thin wrapper that delegates the
 *   real work to `install::build_install_version()`, which runs the full
 *   clone → clean → seed → pg_dump → .pgsql.gz pipeline (up to 10 minutes).
 *
 * Security gates:
 * - `API_ACTIONS`        — enforced by `dd_area_maintenance_api::widget_request`
 *   (SEC-044): only the listed method names may be dispatched via the HTTP API.
 * - `BACKGROUND_RUNNABLE` — enforced by `process_runner.php` (SEC-024): only
 *   the listed method names may be invoked from the background CLI runner.
 *   `get_value` is excluded because it is short-lived and executed inline by
 *   `dd_area_maintenance_api::get_widget_value`; it never reaches the CLI runner.
 *
 * Wire-up:
 * - Registered as the widget id `build_database_version` inside
 *   `area_maintenance::get_structure_context()` (category 'data').
 * - The JS client calls `widget_request` → dispatched here to
 *   `build_install_version()`.
 * - The value refresh uses the hard-coded `get_widget_value` path → calls
 *   `get_value()` here, which reads live constants and `install::$db_install_name`.
 *
 * @package Dédalo
 * @subpackage Core
 */
class build_database_version {



	/**
	 * SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	 * `get_value` is invoked through `get_widget_value` (hard-coded method) and
	 * therefore not listed here.
	 */
	public const API_ACTIONS = [
		'build_install_version',
		'build_matrix_hierarchy_main_sql'
	];

	/**
	 * SEC-024: methods callable from CLI via `process_runner.php`.
	 */
	public const BACKGROUND_RUNNABLE = [
		'build_install_version'
	];



	/**
	 * GET_VALUE
	 * Returns updated widget value
	 * It is used to update widget data dynamically
	 *
	 * Assembles a plain object that the maintenance UI renders before the user
	 * triggers the build, letting the operator confirm:
	 *  - which PostgreSQL database will be cloned (source_db = the live DB);
	 *  - what name the ephemeral install database will receive (target_db);
	 *  - where the final compressed dump will land on disk (target_file).
	 *
	 * `DEDALO_DATABASE_CONN` is the constant that holds the current production
	 * database name (set in the instance config file).
	 * `install::$db_install_name` defaults to `dedalo7_install` and mirrors
	 * `install_config_manager::$db_install_name`.
	 *
	 * @return object $response
	 *   - result object {source_db, target_db, target_file}
	 *   - msg    string
	 *   - errors array
	 */
	public static function get_value(): object {

		$result = (object) [
			'source_db' => DEDALO_DATABASE_CONN,
			'target_db' => install::$db_install_name,
			'target_file' => '/install/db/' . install::$db_install_name . '.pgsql.gz'
		];

		$response = new stdClass();
		$response->result = $result;
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end get_value



	/**
	 * BUILD_INSTALL_VERSION
	 * Alias of install::build_install_version
	 *
	 * Thin façade that forwards the call to `install::build_install_version()`,
	 * which runs the full distributable-image pipeline:
	 *  1. Clone the live PostgreSQL database into the ephemeral install database
	 *     (`install::$db_install_name`, default `dedalo7_install`).
	 *  2. Strip ontology, counters, and user/project data from the clone.
	 *  3. Seed the clone with defaults (root user, stock projects, profiles).
	 *  4. Export the seeded clone to a gzip-compressed .pgsql dump under
	 *     `/install/db/<db_install_name>.pgsql.gz`.
	 *
	 * The pipeline can take up to 10 minutes; it should always be run in the
	 * background (listed in BACKGROUND_RUNNABLE).  The JS widget passes
	 * `background_running: true` so `exec_::request_cli` spawns `process_runner.php`.
	 *
	 * Response shape mirrors `install::build_install_version()`:
	 *  - result bool   – true on full success, false on hard failure
	 *  - msg    string – summary message with source/target DB names on success
	 *  - errors array  – non-fatal per-step warnings accumulated during the run
	 *
	 * @return object $response
	 */
	public static function build_install_version(): object {

		// build
		$response = install::build_install_version();


		return $response;
	}//end build_install_version



	/**
	 * BUILD_MATRIX_HIERARCHY_MAIN_SQL
	 * Alias of install::build_matrix_hierarchy_main_sql. Regenerates the seed file
	 * 'install/import/matrix_hierarchy_main.sql' from the current database, filtered by the
	 * to_install TLD allow-list (core/install/hierarchies_to_install.json) and with every hierarchy inactive.
	 * @return object $response
	 */
	public static function build_matrix_hierarchy_main_sql(): object {

		// build
		$response = install::build_matrix_hierarchy_main_sql();


		return $response;
	}//end build_matrix_hierarchy_main_sql



}//end build_database_version
