<?php declare(strict_types=1);
/**
* MOVE_TO_TABLE
* Maintenance widget that physically migrates section records from one PostgreSQL
* matrix table to another using declarative JSON definition files.
*
* This widget surfaces in the Maintenance area dashboard and is dispatched by
* `dd_area_maintenance_api::widget_request()`. It is stateless (no instantiation)
* and exposes exactly two entry points:
*
* - `get_value()` — called via `dd_area_maintenance_api::get_widget_value()` to
*   populate the dashboard panel with a description and a list of available
*   definition files for the operator to choose from.
* - `move_to_table()` — the migration action invoked via `widget_request()`.
*   Accepts the operator's file selection and delegates to
*   `transform_data::move_data_between_matrix_tables()`, which runs one PostgreSQL
*   transaction per section_tipo, executing an INSERT…SELECT followed by a DELETE
*   so the rows are atomically moved without duplication.
*
* Definition files live under:
*   core/base/transform_definition_files/move_to_table/*.json
*
* Each JSON file is an array of transfer descriptors:
*   [
*     {
*       "section_tipo": "utoponymy1",
*       "source_table": "matrix_list",
*       "target_table": "matrix_hierarchy"
*     },
*     …
*   ]
*
* A typical use-case is migrating section data that was originally stored in a
* flat list table (e.g. `matrix_list`) to a hierarchical table (e.g.
* `matrix_hierarchy`) after an ontology redesign.
*
* Security:
* - `API_ACTIONS` (SEC-044) restricts which methods `widget_request` may invoke.
* - `get_value` is excluded from `API_ACTIONS` because it is dispatched through
*   the separate `get_widget_value` hard-coded path, not `widget_request`.
* - File enumeration and path confinement are handled by
*   `area_maintenance::get_definitions_files()` (SEC-069), which allows only the
*   five known transform subdirectories and rejects path-traversal attempts.
*
* Related classes:
* - `area_maintenance`                 — owns `get_definitions_files()` and the
*                                        widget catalogue; see API_ACTIONS there.
* - `dd_area_maintenance_api`          — routes widget_request / get_widget_value.
* - `transform_data`                   — contains the low-level PostgreSQL migration
*                                        logic (`move_data_between_matrix_tables()`).
*
* @package Dédalo
* @subpackage Core
*/
class move_to_table {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'move_to_table'
	];



	/**
	* GET_VALUE
	* Returns the initial widget data used to populate the dashboard panel.
	*
	* Called by `dd_area_maintenance_api::get_widget_value()` (the hard-coded
	* widget bootstrap path, distinct from `widget_request`). The response carries:
	*
	* - `body`  — an HTML description of what this widget does, shown in the panel.
	* - `files` — list of available JSON definition file objects as returned by
	*             `area_maintenance::get_definitions_files('move_to_table')`, each
	*             shaped as `{file_name: string, content: object|null}`.
	*
	* The operator selects one or more files from this list before triggering the
	* actual migration via `move_to_table()`.
	*
	* @return object $response - stdClass with:
	*   - result (object): {body: string, files: array<object>}
	*   - msg    (string): human-readable status text
	*   - errors (array):  empty on success
	*/
	public static function get_value() : object {

		$response = new stdClass();
		$response->result = (object)[
			'body' => 'Move data from a table to another (e.g. move utoponymy1 to matrix_hierarchy).<br>
					   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_table.<br>',
			'files' => area_maintenance::get_definitions_files('move_to_table')
		];
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end get_value



	/**
	* MOVE_TO_TABLE
	* Migrates section records from one PostgreSQL matrix table to another using
	* the selected JSON definition files.
	*
	* The method validates the operator's file selection against the full list
	* returned by `area_maintenance::get_definitions_files()` (allowlist + realpath
	* confinement), extracts the matching file names, and delegates to
	* `transform_data::move_data_between_matrix_tables()`.
	*
	* That delegate executes one atomic PostgreSQL transaction per section_tipo
	* entry found in the definition files:
	*   1. INSERT … SELECT the rows from source_table into target_table.
	*   2. DELETE the originals from source_table.
	*   3. COMMIT (or ROLLBACK on any error, returning false immediately).
	*
	* This is a destructive, one-way operation — no Time Machine entries are
	* written for the moved rows. Run against a backup or in a test environment
	* first.
	*
	* @param object $options - Widget request options with:
	*   - files_selected (array<string>): file names chosen by the operator,
	*     e.g. ['utoponymy1_to_matrix_hierachy.json']. Must be non-empty.
	* @return object $response - stdClass with:
	*   - result (bool):   true on success, false on any PostgreSQL error
	*   - msg    (string): human-readable status
	*   - errors (array):  validation error strings accumulated before dispatch
	*/
	public static function move_to_table(object $options): object
	{

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		// Bail early if the operator sent no file selection — nothing to migrate.
		$files_selected = $options->files_selected;
		if (empty($files_selected)) {
			$response->errors[] = 'empty files_selected';
			return $response;
		}

		// files
		// Retrieve the full authoritative list from the filesystem (path-confined
		// by area_maintenance::get_definitions_files) and filter it to the subset
		// the operator actually selected. This cross-reference ensures that only
		// real, approved definition files reach the SQL layer.
		$definitions_files = area_maintenance::get_definitions_files('move_to_table');

		$json_files = array_filter($definitions_files, function ($el) use ($files_selected) {
			return in_array($el->file_name, $files_selected);
		});
		if (empty($json_files)) {
			$response->errors[] = 'json_files not found';
			return $response;
		}

		// ar_file_name
		// array_values re-indexes after the filter so the downstream iterator
		// gets a clean 0-based array of bare file names (no path prefix).
		$ar_file_name = array_values(
			array_map(function ($el) {
				return $el->file_name;
			}, $json_files)
		);


		// Load transform_data on demand — it is a heavy migration class not
		// needed during normal request handling, so it is not autoloaded.
		require_once DEDALO_CORE_PATH . '/base/upgrade/class.transform_data.php';
		$result = transform_data::move_data_between_matrix_tables(
			$ar_file_name
		);

		$response->result = $result;
		// (!) The error message text mentions 'changes_in_locators' — this is
		// a copy-paste artefact from a sibling widget and does not accurately
		// describe this operation; it should read 'move_data_between_matrix_tables'.
		$response->msg = ($result === false)
			? 'Error. changes_in_locators failed'
			: 'OK. request done successfully';


		return $response;
	}//end move_to_table



}//end move_to_table
