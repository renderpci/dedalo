<?php declare(strict_types=1);
/**
 * BUILD_DATABASE_VERSION
 * Widget to manage Dédalo database tasks
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
	 * @return object $response
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
